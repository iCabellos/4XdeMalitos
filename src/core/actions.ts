/**
 * The command surface of a match. Both the human UI and the bot controller go
 * through these functions and nothing else, which is what will later allow a
 * real player to be dropped in wherever a bot sits today, and an authoritative
 * server to validate the exact same calls.
 */
import { hexDistanceId, type HexId } from '../map/hex';
import { mapBuildingDef, type MapBuildingId } from '../data/buildings.map';
import { troopDef } from '../data/troops';
import { BALANCE } from '../data/balance';
import { logEvent } from './events';
import { resolveCombat } from './combat';
import { build, canBuild, captureBuilding, canUpgradeBuilding, upgradeBuilding } from './construction';
import { canTrain, gatherWithArmy, train } from './economy';
import {
  armyDomains,
  armySize,
  canEnterTile,
  computeMaxMovementPoints,
  findPath,
  isArmyEmpty,
  reachableAlongPath,
  reachableHexes,
} from './movement';
import { research } from './technology';
import { updateFogForPlayer } from '../map/fogOfWar';
import { updateTerritory } from './territory';
import { createArmy, countArmies, playerById } from './gameState';
import { grantMany } from './resources';
import type { Army, MatchState, PlayerId } from './types';

export interface ActionResult {
  ok: boolean;
  reason?: string;
  /** Free-form payload for the UI (e.g. how far an army actually moved). */
  detail?: Record<string, unknown>;
}

const ok = (detail?: Record<string, unknown>): ActionResult => ({ ok: true, detail });
const fail = (reason: string): ActionResult => ({ ok: false, reason });

function armyOf(state: MatchState, armyId: string): Army | null {
  return state.armies[armyId] ?? null;
}

export function enemyArmiesAt(state: MatchState, hex: HexId, playerId: PlayerId): Army[] {
  return Object.values(state.armies).filter((a) => a.hex === hex && a.owner !== playerId && !isArmyEmpty(a));
}

export function friendlyArmiesAt(state: MatchState, hex: HexId, playerId: PlayerId): Army[] {
  return Object.values(state.armies).filter((a) => a.hex === hex && a.owner === playerId);
}

/**
 * Moves an army along the cheapest path, stopping when movement points run out
 * or an enemy blocks the way. Movement never auto-attacks: taking ground is an
 * explicit decision so the player is never surprised into a battle.
 */
export function moveArmy(state: MatchState, armyId: string, target: HexId): ActionResult {
  const army = armyOf(state, armyId);
  if (!army) return fail('Ejercito inexistente');
  if (isArmyEmpty(army)) return fail('El ejercito no tiene tropas');
  if (army.hex === target) return fail('Ya estas en ese hexagono');
  if (army.movementPoints <= 0) return fail('Sin puntos de movimiento');
  if (armyDomains(army).length === 0) {
    return fail('Composicion incompatible: separa las unidades terrestres de las navales');
  }

  const destination = state.tiles[target];
  if (!destination) return fail('Hexagono fuera del mapa');
  if (!canEnterTile(state, army, destination)) {
    const region = state.regions.find((r) => r.id === destination.regionId);
    if (region && region.lock.type !== 'none') return fail(`Region bloqueada: ${region.name}`);
    return fail('Terreno intransitable para esta composicion');
  }

  const path = findPath(state, army, target);
  if (!path.reachable) return fail('Sin ruta disponible');

  const limit = reachableAlongPath(path, army.movementPoints);
  if (limit < 0) return fail('Demasiado lejos para este dia');

  // Stop one hex short of any enemy standing on the route.
  let finalIndex = limit;
  for (let i = 0; i <= limit; i++) {
    if (enemyArmiesAt(state, path.path[i], army.owner).length > 0) {
      finalIndex = i - 1;
      break;
    }
  }
  if (finalIndex < 0) return fail('Enemigo bloqueando la ruta: ataca en lugar de moverte');

  const destinationHex = path.path[finalIndex];
  const spent = path.costs[finalIndex];
  army.hex = destinationHex;
  army.movementPoints = Math.max(0, Math.round((army.movementPoints - spent) * 10) / 10);
  army.lastOrder = { type: 'move', target };

  const player = playerById(state, army.owner);
  collectCache(state, army);
  updateFogForPlayer(state, player);
  updateTerritory(state);

  const arrived = destinationHex === target;
  return ok({ arrived, hex: destinationHex, remaining: army.movementPoints, spent });
}

/**
 * Moves towards a hex that may be out of reach this day, or unreachable
 * outright. Falls back to the legal step that closes the most distance, so a
 * long march makes progress every day instead of stalling on an illegal order.
 */
export function moveTowards(state: MatchState, armyId: string, target: HexId): ActionResult {
  const direct = moveArmy(state, armyId, target);
  if (direct.ok) return direct;

  const army = armyOf(state, armyId);
  if (!army || army.movementPoints <= 0) return direct;

  const currentDistance = hexDistanceId(army.hex, target);
  const reachable = reachableHexes(state, army);
  let bestHex: HexId | null = null;
  let bestKey = Infinity;
  for (const [hex, cost] of Object.entries(reachable)) {
    if (enemyArmiesAt(state, hex, army.owner).length > 0) continue;
    const distance = hexDistanceId(hex, target);
    if (distance >= currentDistance) continue;
    // Closer is what matters; cost only breaks ties between equal approaches.
    const key = distance * 100 + cost;
    if (key < bestKey) {
      bestKey = key;
      bestHex = hex;
    }
  }
  if (!bestHex) return direct;
  return moveArmy(state, armyId, bestHex);
}

/** Abandoned-base loot, picked up the moment an army sets foot on the hex. */
function collectCache(state: MatchState, army: Army): void {
  const tile = state.tiles[army.hex];
  const cache = tile?.feature.cache;
  if (!cache || cache.taken) return;
  cache.taken = true;
  const player = playerById(state, army.owner);
  grantMany(player, cache.loot as Record<string, number>);
  const summary = Object.entries(cache.loot)
    .map(([k, v]) => `${v} ${k}`)
    .join(', ');
  logEvent(state, 'cache', `${player.name} saquea una base abandonada (${summary}).`, {
    playerId: player.id,
    hex: army.hex,
  });
}

/**
 * Attacks an enemy army. Ranged formations may strike from distance without
 * moving; melee-range formations must be adjacent and advance if they win.
 */
export function attack(state: MatchState, armyId: string, target: HexId): ActionResult {
  const army = armyOf(state, armyId);
  if (!army) return fail('Ejercito inexistente');
  if (isArmyEmpty(army)) return fail('El ejercito no tiene tropas');
  if (army.actedThisDay) return fail('Este ejercito ya ha combatido hoy');

  const defenders = enemyArmiesAt(state, target, army.owner);
  const tile = state.tiles[target];
  if (!tile) return fail('Hexagono fuera del mapa');

  const distance = hexDistanceId(army.hex, target);
  const maxRange = Math.max(
    1,
    ...Object.entries(army.composition)
      .filter(([, count]) => count > 0)
      .map(([troopId]) => troopDef(troopId).range),
  );
  if (distance > maxRange) return fail(`Fuera de alcance (${distance} > ${maxRange})`);

  const player = playerById(state, army.owner);

  // Undefended ground: this is a capture, not a battle.
  if (defenders.length === 0) {
    if (distance > 1) return fail('Nada que atacar a esa distancia');
    return captureHex(state, armyId, target);
  }

  const defender = defenders.reduce((a, b) => (armySize(a) >= armySize(b) ? a : b));
  const defenderPlayer = playerById(state, defender.owner);
  if (player.nonAggression.includes(defender.owner)) {
    // Breaking a pact is allowed, but it is recorded and the pact ends.
    player.nonAggression = player.nonAggression.filter((id) => id !== defender.owner);
    defenderPlayer.nonAggression = defenderPlayer.nonAggression.filter((id) => id !== player.id);
    logEvent(state, 'pactBroken', `${player.name} rompe el pacto con ${defenderPlayer.name}.`, {
      playerId: player.id,
    });
  }

  const outcome = resolveCombat(state, army, defender, tile);
  state.combatLog.push(outcome.report);
  army.actedThisDay = true;
  army.lastOrder = { type: 'attack', target };

  const winnerName = playerById(state, outcome.report.winner).name;
  logEvent(
    state,
    'combat',
    `${player.name} ataca a ${defenderPlayer.name} en ${target}: vence ${winnerName} (${outcome.report.attackerPower} vs ${outcome.report.defenderPower}).`,
    { playerId: player.id, hex: target },
  );

  // Clean up wiped formations.
  if (outcome.defenderDestroyed) delete state.armies[defender.id];
  if (outcome.attackerDestroyed) delete state.armies[army.id];

  // Award commander experience for the destroyed force.
  if (outcome.report.winner === player.id && army.commanderId) {
    army.lastOrder = { type: 'attack', target };
  }

  if (outcome.report.winner === player.id && outcome.defenderDestroyed && distance === 1) {
    const remainingDefenders = enemyArmiesAt(state, target, army.owner);
    if (remainingDefenders.length === 0 && !outcome.attackerDestroyed) {
      const cost = 1;
      if (army.movementPoints >= cost) {
        army.movementPoints -= cost;
        army.hex = target;
        collectCache(state, army);
      }
      takeHexOwnership(state, target, player.id);
    }
  }

  updateFogForPlayer(state, player);
  updateFogForPlayer(state, defenderPlayer);
  updateTerritory(state);
  return ok({ report: outcome.report });
}

/** Takes an undefended hex, including any building standing on it. */
export function captureHex(state: MatchState, armyId: string, target: HexId): ActionResult {
  const army = armyOf(state, armyId);
  if (!army) return fail('Ejercito inexistente');
  const tile = state.tiles[target];
  if (!tile) return fail('Hexagono fuera del mapa');
  if (hexDistanceId(army.hex, target) > 1) return fail('Debes estar adyacente');
  if (enemyArmiesAt(state, target, army.owner).length > 0) return fail('Defendido: usa ATACAR');
  if (!canEnterTile(state, army, tile)) return fail('No puedes entrar en ese hexagono');
  if (army.movementPoints < 1) return fail('Sin puntos de movimiento');

  army.movementPoints -= 1;
  army.hex = target;
  collectCache(state, army);
  takeHexOwnership(state, target, army.owner);
  army.lastOrder = { type: 'capture', target };

  const player = playerById(state, army.owner);
  updateFogForPlayer(state, player);
  updateTerritory(state);
  return ok({ hex: target });
}

function takeHexOwnership(state: MatchState, hex: HexId, playerId: PlayerId): void {
  const tile = state.tiles[hex];
  if (!tile) return;
  if (tile.buildingId) {
    const building = state.buildings[tile.buildingId];
    if (building && building.owner !== playerId) captureBuilding(state, building.id, playerId);
  }
  tile.controlledBy = playerId;
}

/**
 * Takes a gate, which unlocks the region it guards for the capturing player.
 * This is the primary way into the locked core.
 */
export function captureGate(state: MatchState, armyId: string): ActionResult {
  const army = armyOf(state, armyId);
  if (!army) return fail('Ejercito inexistente');
  const tile = state.tiles[army.hex];
  const gate = tile?.feature.gate;
  if (!gate) return fail('No hay ninguna puerta en este hexagono');
  const player = playerById(state, army.owner);
  if (gate.controlledBy === player.id && player.unlockedRegions.includes(gate.regionId)) {
    return fail('Ya controlas esta puerta');
  }
  gate.controlledBy = player.id;
  if (!player.unlockedRegions.includes(gate.regionId)) {
    player.unlockedRegions.push(gate.regionId);
  }
  const region = state.regions.find((r) => r.id === gate.regionId);
  logEvent(state, 'gate', `${player.name} toma una puerta y abre ${region?.name ?? 'una region'}.`, {
    playerId: player.id,
    hex: army.hex,
  });
  army.lastOrder = { type: 'capture', target: army.hex };
  updateTerritory(state);
  return ok({ regionId: gate.regionId });
}

/** Activates a strategic facility. Costs energy and needs an army on the hex. */
export function activateFacility(state: MatchState, armyId: string): ActionResult {
  const army = armyOf(state, armyId);
  if (!army) return fail('Ejercito inexistente');
  const tile = state.tiles[army.hex];
  const facility = tile?.feature.facility;
  if (!facility) return fail('No hay instalacion en este hexagono');
  if (facility.state === 'active' && facility.owner === army.owner) {
    return fail('Ya esta activa bajo tu control');
  }
  const player = playerById(state, army.owner);
  const energyCost = 20;
  if (player.stock.energy < energyCost) return fail(`Requiere ${energyCost} de energia`);
  player.stock.energy -= energyCost;
  facility.state = 'active';
  facility.owner = player.id;
  takeHexOwnership(state, army.hex, player.id);
  logEvent(state, 'facility', `${player.name} activa ${facility.name}.`, {
    playerId: player.id,
    hex: army.hex,
  });
  updateTerritory(state);
  return ok({ facility: facility.id });
}

/** Hand-gathering from the hex an army occupies. */
export function gather(state: MatchState, armyId: string): ActionResult {
  const army = armyOf(state, armyId);
  if (!army) return fail('Ejercito inexistente');
  const player = playerById(state, army.owner);
  const gained = gatherWithArmy(state, player, army);
  if (Object.keys(gained).length === 0) {
    return fail('Nada que recolectar aqui (o ya hay una estructura explotandolo)');
  }
  army.lastOrder = { type: 'gather', target: army.hex };
  return ok({ gained });
}

export function buildAt(
  state: MatchState,
  playerId: PlayerId,
  hex: HexId,
  buildingId: MapBuildingId,
): ActionResult {
  const player = playerById(state, playerId);
  const tile = state.tiles[hex];
  if (!tile) return fail('Hexagono fuera del mapa');
  const check = canBuild(state, player, tile, buildingId);
  if (!check.ok) return fail(check.reason ?? 'No se puede construir');
  const id = build(state, player, tile, buildingId);
  if (!id) return fail('Construccion fallida');
  const def = mapBuildingDef(buildingId);
  logEvent(state, 'build', `${player.name} inicia ${def.name} en ${hex}.`, { playerId, hex });

  // A region locked behind a building opens as soon as one stands adjacent.
  openBuildingLockedRegions(state, playerId);
  updateTerritory(state);
  return ok({ buildingInstanceId: id, days: def.buildDays });
}

export function upgradeMapBuilding(
  state: MatchState,
  playerId: PlayerId,
  buildingInstanceId: string,
): ActionResult {
  const player = playerById(state, playerId);
  const check = canUpgradeBuilding(state, player, buildingInstanceId);
  if (!check.ok) return fail(check.reason ?? 'No se puede mejorar');
  if (!upgradeBuilding(state, player, buildingInstanceId)) return fail('Mejora fallida');
  const instance = state.buildings[buildingInstanceId];
  logEvent(
    state,
    'upgrade',
    `${player.name} mejora ${mapBuildingDef(instance.buildingId).name} a nivel ${instance.level}.`,
    { playerId, hex: instance.hex },
  );
  return ok({ level: instance.level });
}

/** Regions gated by a building open once the player has one adjacent to them. */
export function openBuildingLockedRegions(state: MatchState, playerId: PlayerId): void {
  const player = playerById(state, playerId);
  for (const region of state.regions) {
    if (region.lock.type !== 'building') continue;
    if (player.unlockedRegions.includes(region.id)) continue;
    const required = region.lock.buildingId;
    const hasAdjacent = Object.values(state.buildings).some((b) => {
      if (b.owner !== playerId || b.buildingId !== required || b.daysRemaining > 0) return false;
      return region.hexes.some((hex) => hexDistanceId(hex, b.hex) <= 1);
    });
    if (hasAdjacent) {
      player.unlockedRegions.push(region.id);
      logEvent(state, 'region', `${player.name} abre ${region.name} con un puesto avanzado.`, {
        playerId,
      });
    }
  }
}

export function researchTechnology(
  state: MatchState,
  playerId: PlayerId,
  techId: string,
): ActionResult {
  const player = playerById(state, playerId);
  if (!research(state, player, techId)) return fail('No se puede investigar ahora');
  logEvent(state, 'research', `${player.name} completa la investigacion ${techId}.`, { playerId });
  return ok({ techId });
}

export function trainTroops(
  state: MatchState,
  playerId: PlayerId,
  armyId: string,
  troopId: string,
  count: number,
): ActionResult {
  const player = playerById(state, playerId);
  const army = armyOf(state, armyId);
  if (!army) return fail('Ejercito inexistente');
  const check = canTrain(state, player, army, troopId, count);
  if (!check.ok) return fail(check.reason ?? 'No se puede reclutar');
  if (!train(state, player, army, troopId, count)) return fail('Reclutamiento fallido');
  army.maxMovementPoints = computeMaxMovementPoints(state, army);
  logEvent(state, 'train', `${player.name} recluta ${count} x ${troopDef(troopId).name}.`, {
    playerId,
    hex: army.hex,
  });
  return ok({ troopId, count });
}

/** Splits troops into a brand new army, bounded by the player's army slots. */
export function splitArmy(
  state: MatchState,
  playerId: PlayerId,
  sourceArmyId: string,
  composition: Record<string, number>,
): ActionResult {
  const player = playerById(state, playerId);
  const source = armyOf(state, sourceArmyId);
  if (!source || source.owner !== playerId) return fail('Ejercito invalido');
  if (countArmies(state, playerId) >= effectiveArmySlots(state, playerId)) {
    return fail('Sin plazas de ejercito disponibles');
  }
  let moved = 0;
  for (const [troopId, count] of Object.entries(composition)) {
    if (count <= 0) continue;
    if ((source.composition[troopId] ?? 0) < count) return fail(`Tropas insuficientes: ${troopId}`);
    moved += count;
  }
  if (moved <= 0) return fail('Selecciona al menos una unidad');

  const army = createArmy(state, player, source.hex);
  for (const [troopId, count] of Object.entries(composition)) {
    if (count <= 0) continue;
    source.composition[troopId] -= count;
    army.composition[troopId] = (army.composition[troopId] ?? 0) + count;
  }
  army.maxMovementPoints = computeMaxMovementPoints(state, army);
  army.movementPoints = army.maxMovementPoints;
  source.maxMovementPoints = computeMaxMovementPoints(state, source);
  if (isArmyEmpty(source)) delete state.armies[source.id];
  logEvent(state, 'army', `${player.name} forma ${army.name}.`, { playerId, hex: army.hex });
  return ok({ armyId: army.id });
}

/** Merges one army into another standing on the same hex. */
export function mergeArmies(state: MatchState, sourceId: string, targetId: string): ActionResult {
  const source = armyOf(state, sourceId);
  const target = armyOf(state, targetId);
  if (!source || !target) return fail('Ejercito inexistente');
  if (source.owner !== target.owner) return fail('Ejercitos de distinto bando');
  if (source.hex !== target.hex) return fail('Deben estar en el mismo hexagono');
  for (const [troopId, count] of Object.entries(source.composition)) {
    if (count <= 0) continue;
    target.composition[troopId] = (target.composition[troopId] ?? 0) + count;
  }
  target.movementPoints = Math.min(target.movementPoints, source.movementPoints);
  delete state.armies[sourceId];
  target.maxMovementPoints = computeMaxMovementPoints(state, target);
  return ok({ armyId: targetId });
}

export function assignCommander(
  state: MatchState,
  playerId: PlayerId,
  armyId: string,
  commanderId: string | null,
): ActionResult {
  const player = playerById(state, playerId);
  const army = armyOf(state, armyId);
  if (!army || army.owner !== playerId) return fail('Ejercito invalido');
  if (commanderId) {
    if (!player.commanders.includes(commanderId)) return fail('Comandante no disponible');
    // A commander leads exactly one army at a time.
    for (const other of Object.values(state.armies)) {
      if (other.owner === playerId && other.commanderId === commanderId && other.id !== armyId) {
        other.commanderId = null;
      }
    }
  }
  army.commanderId = commanderId;
  army.maxMovementPoints = computeMaxMovementPoints(state, army);
  return ok({ commanderId });
}

/** Army slots granted by the city plus every finished military base. */
export function effectiveArmySlots(state: MatchState, playerId: PlayerId): number {
  const player = playerById(state, playerId);
  let slots = player.armySlots;
  for (const building of Object.values(state.buildings)) {
    if (building.owner === playerId && building.buildingId === 'military_base' && building.daysRemaining === 0) {
      slots++;
    }
  }
  return slots;
}

/** Offers a non-aggression understanding, weighted by diplomatic pressure. */
export function proposeNonAggression(
  state: MatchState,
  fromId: PlayerId,
  toId: PlayerId,
  accepted: boolean,
): ActionResult {
  const from = playerById(state, fromId);
  const to = playerById(state, toId);
  if (!accepted) return fail(`${to.name} rechaza el acuerdo`);
  if (!from.nonAggression.includes(toId)) from.nonAggression.push(toId);
  if (!to.nonAggression.includes(fromId)) to.nonAggression.push(fromId);
  logEvent(state, 'diplomacy', `${from.name} y ${to.name} firman un pacto de no agresion.`, {
    playerId: fromId,
  });
  return ok();
}

export const ACTION_LABELS = {
  move: 'MOVER',
  attack: 'ATACAR',
  gather: 'RECOLECTAR',
  build: 'CONSTRUIR',
  scout: 'EXPLORAR',
  capture: 'CAPTURAR',
} as const;

export { BALANCE };
