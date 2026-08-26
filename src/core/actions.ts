/**
 * The command surface of a match. Both the human UI and the bot controller go
 * through these functions and nothing else, which is what will later allow a
 * real player to be dropped in wherever a bot sits today, and an authoritative
 * server to validate the exact same calls.
 */
import { hexDistanceId, type HexId } from '../map/hex';
import { mapBuildingDef, type MapBuildingId } from '../data/buildings.map';
import { troopDef } from '../data/troops';
import { logEvent } from './events';
import { resolveCombat } from './combat';
import { build, canBuild, captureBuilding, canUpgradeBuilding, upgradeBuilding } from './construction';
import { canTrain, gatherWithArmy, train } from './economy';
import {
  armyDomains,
  armySize,
  canEnterTile,
  canOccupyTile,
  computeMaxMovementPoints,
  findPath,
  isArmyEmpty,
  reachableAlongPath,
  reachableHexes,
} from './movement';
import { recomputeModifiers, research } from './technology';
import { itemDef, CORE_ITEM, type ItemDefinition } from '../data/items';
import { updateFogForPlayer } from '../map/fogOfWar';
import { updateTerritory } from './territory';
import { createArmy, countArmies, playerById } from './gameState';
import { grantMany } from './resources';
import { proposeTreaty, sendTribute, declareWar, registerAggression } from './diplomacy';
import type { TreatyKind } from '../data/diplomacy';
import type { ResourceCost } from '../data/troops';
import type { Army, MatchState, PlayerId, Tile } from './types';

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
  if (!canOccupyTile(army, destination)) {
    return fail('Terreno intransitable para esta composicion');
  }

  const path = findPath(state, army, target);
  if (!path.reachable) return fail(wallReason(state, army, destination));

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
  // Attacking is always allowed, including through a signed pact - but it is
  // recorded, it ends the pact, and everyone watching thinks less of you.
  registerAggression(state, player.id, defender.owner);

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
  if (!canEnterTile(army, state.tiles[army.hex], tile)) {
    return fail(wallReason(state, army, tile));
  }
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
 * Explains why there is no route, which on this map is almost always a wall.
 * A player who cannot see the reason reads it as a bug.
 */
function wallReason(state: MatchState, army: Army, destination: Tile): string {
  const origin = state.tiles[army.hex];
  if (origin.regionId === destination.regionId) return 'Sin ruta disponible';
  const region = state.regions.find((r) => r.id === destination.regionId);
  const sealed = state.tileOrder.some((id) => {
    const gate = state.tiles[id].feature.gate;
    if (!gate || gate.open) return false;
    return (
      (gate.regionA === destination.regionId || gate.regionB === destination.regionId) &&
      (gate.regionA === origin.regionId || gate.regionB === origin.regionId)
    );
  });
  if (sealed) {
    const day = nextGateDay(state, origin.regionId, destination.regionId);
    return day
      ? `Muro sellado: la puerta hacia ${region?.name ?? 'esa region'} abre el dia ${day}`
      : `Muro sellado hacia ${region?.name ?? 'esa region'}`;
  }
  return `No hay puerta desde aqui hacia ${region?.name ?? 'esa region'}`;
}

/** Day the first gate between two regions opens, if one exists. */
export function nextGateDay(state: MatchState, regionA: number, regionB: number): number | null {
  let soonest: number | null = null;
  for (const id of state.tileOrder) {
    const gate = state.tiles[id].feature.gate;
    if (!gate) continue;
    const joins =
      (gate.regionA === regionA && gate.regionB === regionB) ||
      (gate.regionB === regionA && gate.regionA === regionB);
    if (!joins) continue;
    if (soonest === null || gate.opensOnDay < soonest) soonest = gate.opensOnDay;
  }
  return soonest;
}

/**
 * Holding a gate does not open it - gates run on a clock every player shares -
 * but it marks the doorway as yours, which is worth score and denies the enemy
 * a clean crossing.
 */
export function holdGate(state: MatchState, armyId: string): ActionResult {
  const army = armyOf(state, armyId);
  if (!army) return fail('Ejercito inexistente');
  const tile = state.tiles[army.hex];
  const gate = tile?.feature.gate;
  if (!gate) return fail('No hay ninguna puerta en este hexagono');
  const player = playerById(state, army.owner);
  if (gate.controlledBy === player.id) return fail('Ya controlas esta puerta');
  gate.controlledBy = player.id;
  takeHexOwnership(state, army.hex, player.id);
  logEvent(
    state,
    'gate',
    gate.open
      ? `${player.name} toma el control de una puerta abierta.`
      : `${player.name} se posiciona en una puerta: abre el dia ${gate.opensOnDay}.`,
    { playerId: player.id, hex: army.hex },
  );
  army.lastOrder = { type: 'capture', target: army.hex };
  updateTerritory(state);
  return ok({ gateId: gate.id, opensOnDay: gate.opensOnDay });
}

/**
 * Assaults a garrisoned zone-2 objective. This is a real battle against a
 * defending force, not a capture: win it and the item and its match-long buff
 * are yours.
 */
export function assaultObjective(state: MatchState, armyId: string): ActionResult {
  const army = armyOf(state, armyId);
  if (!army) return fail('Ejercito inexistente');
  if (army.actedThisDay) return fail('Este ejercito ya ha combatido hoy');
  const tile = state.tiles[army.hex];
  const objective = tile?.feature.secondaryObjective;
  if (!objective) return fail('No hay objetivo secundario en este hexagono');
  if (objective.defeatedBy) return fail('Ya ha sido derrotado');

  const player = playerById(state, army.owner);

  // The garrison fights as a real army so terrain, commander and composition
  // all matter exactly as they would against a player.
  const garrison: Army = {
    id: `garrison_${objective.id}`,
    name: objective.name,
    owner: '__garrison__',
    hex: army.hex,
    commanderId: null,
    composition: { ...objective.garrison },
    movementPoints: 0,
    maxMovementPoints: 0,
    actedThisDay: true,
    lastOrder: null,
  };

  const outcome = resolveCombat(state, army, garrison, tile);
  army.actedThisDay = true;
  state.combatLog.push(outcome.report);

  // Whatever survived a failed assault stays as the garrison, so a beaten
  // attacker still softens the position for whoever comes next.
  objective.garrison = { ...garrison.composition };

  // Winning the battle takes the position. Requiring the garrison to be wiped
  // to the last man would make these objectives unclaimable, because combat
  // caps casualties at 90% per battle by design.
  if (outcome.report.winner !== player.id) {
    logEvent(state, 'combat', `${player.name} fracasa al asaltar ${objective.name}.`, {
      playerId: player.id,
      hex: army.hex,
    });
    if (outcome.attackerDestroyed) delete state.armies[army.id];
    return ok({ cleared: false, report: outcome.report });
  }

  objective.defeatedBy = player.id;
  player.stats.objectivesCleared++;
  const item = claimItem(state, player.id, objective.itemId);
  takeHexOwnership(state, army.hex, player.id);
  logEvent(
    state,
    'objective',
    `${player.name} arrasa ${objective.name} y se lleva ${item?.name ?? 'un item'}.`,
    { playerId: player.id, hex: army.hex },
  );
  updateTerritory(state);
  return ok({ cleared: true, itemId: objective.itemId, report: outcome.report });
}

/**
 * Grants an item and its buff. Modifiers are recomputed rather than nudged, so
 * claiming the same item twice can never stack.
 */
export function claimItem(state: MatchState, playerId: PlayerId, itemId: string): ItemDefinition | null {
  const player = playerById(state, playerId);
  if (player.items.includes(itemId)) return null;
  const def = itemDef(itemId);
  player.items.push(itemId);
  recomputeModifiers(player);
  if (def.effects.grant) grantMany(player, def.effects.grant as Record<string, number>);
  return def;
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

  // Taking the core is the single biggest prize on the map.
  let claimed: ItemDefinition | null = null;
  if (tile.feature.mainObjective) {
    claimed = claimItem(state, player.id, CORE_ITEM);
    if (claimed) {
      logEvent(state, 'objective', `${player.name} conquista el Nucleo y obtiene ${claimed.name}.`, {
        playerId: player.id,
        hex: army.hex,
      });
    }
  }

  updateTerritory(state);
  return ok({ facility: facility.id, itemId: claimed?.id });
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

export function researchTechnology(
  state: MatchState,
  playerId: PlayerId,
  techId: string,
): ActionResult {
  const player = playerById(state, playerId);
  if (!research(player, techId)) return fail('No se puede investigar ahora');
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

/**
 * Moves only the units the player picked.
 *
 * Sending the whole army is the common case, so a full selection moves the
 * army itself and keeps its identity and commander. A partial selection peels
 * off a detachment first, which is what makes "move these three scouts" a real
 * order rather than a UI illusion.
 */
export function moveUnits(
  state: MatchState,
  playerId: PlayerId,
  armyId: string,
  composition: Record<string, number>,
  target: HexId,
): ActionResult {
  const source = armyOf(state, armyId);
  if (!source || source.owner !== playerId) return fail('Ejercito invalido');

  const selected = Object.entries(composition).filter(([, count]) => count > 0);
  if (selected.length === 0) return fail('Selecciona al menos una unidad');

  let movesEverything = true;
  for (const [troopId, count] of selected) {
    const available = source.composition[troopId] ?? 0;
    if (count > available) return fail(`No tienes ${count} de ${troopDef(troopId).name}`);
  }
  for (const [troopId, available] of Object.entries(source.composition)) {
    if (available <= 0) continue;
    if ((composition[troopId] ?? 0) < available) {
      movesEverything = false;
      break;
    }
  }

  if (movesEverything) return moveArmy(state, armyId, target);

  if (countArmies(state, playerId) >= effectiveArmySlots(state, playerId)) {
    return fail('Sin plazas de ejercito para formar un destacamento');
  }
  const split = splitArmy(state, playerId, armyId, composition);
  if (!split.ok) return split;
  const detachmentId = split.detail?.armyId as string;
  const result = moveArmy(state, detachmentId, target);
  return result.ok ? ok({ ...result.detail, armyId: detachmentId, detached: true }) : result;
}

/**
 * Attacks with a named commander. If they are leading another formation they
 * are reassigned first, so "attack with Koval" always means what it says.
 */
export function attackWithCommander(
  state: MatchState,
  playerId: PlayerId,
  armyId: string,
  target: HexId,
  commanderId: string | null,
): ActionResult {
  const army = armyOf(state, armyId);
  if (!army || army.owner !== playerId) return fail('Ejercito invalido');
  if (commanderId && army.commanderId !== commanderId) {
    const assigned = assignCommander(state, playerId, armyId, commanderId);
    if (!assigned.ok) return assigned;
  }
  return attack(state, armyId, target);
}

/** Puts a treaty to another participant; they weigh it and answer. */
export function offerTreaty(
  state: MatchState,
  fromId: PlayerId,
  toId: PlayerId,
  kind: TreatyKind,
): ActionResult {
  const result = proposeTreaty(state, fromId, toId, kind);
  return result.ok ? ok({ kind }) : fail(result.reason);
}

/** Hands resources over to buy goodwill. */
export function offerTribute(
  state: MatchState,
  fromId: PlayerId,
  toId: PlayerId,
  resources: ResourceCost,
): ActionResult {
  const result = sendTribute(state, fromId, toId, resources);
  return result.ok ? ok({ resources }) : fail(result.reason);
}

/** Formally goes to war, freeing you to attack without breaking an oath. */
export function breakRelations(state: MatchState, fromId: PlayerId, toId: PlayerId): ActionResult {
  const result = declareWar(state, fromId, toId);
  return result.ok ? ok() : fail(result.reason);
}

