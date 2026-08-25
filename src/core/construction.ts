import { MAP_BUILDINGS, mapBuildingDef, mapBuildingUpgradeCost, MAP_BUILDING_LEVEL_MULTIPLIER, type MapBuildingId } from '../data/buildings.map';
import { TERRAINS } from '../data/terrain';
import { canAfford, missingResources, spend } from './resources';
import type { MatchPlayer, MatchState, Tile } from './types';
import type { ResourceCost } from '../data/troops';
import { availableMapBuildings } from './technology';

export interface BuildCheck {
  ok: boolean;
  reason: string | null;
  cost: ResourceCost;
  citizens: number;
  missing: ResourceCost;
}

/** Every rule that can stop a build, evaluated in the order a player would ask. */
export function canBuild(
  state: MatchState,
  player: MatchPlayer,
  tile: Tile,
  buildingId: MapBuildingId,
): BuildCheck {
  const def = MAP_BUILDINGS[buildingId];
  const empty: BuildCheck = { ok: false, reason: null, cost: {}, citizens: 0, missing: {} };
  if (!def) return { ...empty, reason: 'Edificio desconocido' };

  const cost = def.cost;
  const base = { ...empty, cost, citizens: def.citizens };

  if (!availableMapBuildings(player).includes(buildingId)) {
    const techName = def.unlockTechnology ? `Requiere ${def.unlockTechnology}` : 'Requiere nivel de ciudad superior';
    return { ...base, reason: techName };
  }
  if (tile.buildingId) return { ...base, reason: 'El hexagono ya tiene una estructura' };
  if (!player.unlockedRegions.includes(tile.regionId)) {
    const region = state.regions.find((r) => r.id === tile.regionId);
    if (region && region.lock.type !== 'none') {
      return { ...base, reason: `Region bloqueada: ${region.name}` };
    }
  }
  if (!TERRAINS[tile.terrain].passableBy.includes('land')) {
    return { ...base, reason: 'Terreno no edificable' };
  }
  if (def.allowedTerrain && !def.allowedTerrain.includes(tile.terrain)) {
    return { ...base, reason: `Solo en: ${def.allowedTerrain.join(', ')}` };
  }
  if (def.requiresNode) {
    if (!tile.node || !def.requiresNode.includes(tile.node.nodeId)) {
      return { ...base, reason: 'Requiere un nodo de recurso compatible' };
    }
    if (tile.node.remaining <= 0) return { ...base, reason: 'Nodo agotado' };
  }
  if (player.citizensFree < def.citizens) {
    return { ...base, reason: `Necesita ${def.citizens} ciudadanos libres` };
  }
  if (!canAfford(player.stock, cost)) {
    return { ...base, reason: 'Recursos insuficientes', missing: missingResources(player.stock, cost) };
  }
  // A hex must be reachable: either already controlled, or adjacent to something owned.
  if (!hasPresence(state, player, tile)) {
    return { ...base, reason: 'Sin presencia: acerca un ejercito o expande el territorio' };
  }
  return { ok: true, reason: null, cost, citizens: def.citizens, missing: {} };
}

/** A player may only build where they have an army or already hold ground. */
export function hasPresence(state: MatchState, player: MatchPlayer, tile: Tile): boolean {
  if (tile.controlledBy === player.id) return true;
  for (const army of Object.values(state.armies)) {
    if (army.owner === player.id && army.hex === tile.id) return true;
  }
  return false;
}

export function build(
  state: MatchState,
  player: MatchPlayer,
  tile: Tile,
  buildingId: MapBuildingId,
): string | null {
  const check = canBuild(state, player, tile, buildingId);
  if (!check.ok) return null;
  const def = mapBuildingDef(buildingId);
  if (!spend(player.stock, check.cost)) return null;

  player.citizensFree -= def.citizens;
  const id = `b${state.nextEntityId++}`;
  state.buildings[id] = {
    id,
    buildingId,
    owner: player.id,
    hex: tile.id,
    level: 1,
    daysRemaining: def.buildDays,
    citizens: def.citizens,
    online: true,
  };
  tile.buildingId = id;
  if (buildingId === 'road') tile.road = true;
  player.stats.buildingsBuilt++;
  return id;
}

export function canUpgradeBuilding(
  state: MatchState,
  player: MatchPlayer,
  buildingInstanceId: string,
): BuildCheck {
  const instance = state.buildings[buildingInstanceId];
  const empty: BuildCheck = { ok: false, reason: null, cost: {}, citizens: 0, missing: {} };
  if (!instance) return { ...empty, reason: 'Estructura inexistente' };
  if (instance.owner !== player.id) return { ...empty, reason: 'No es tuya' };
  if (instance.daysRemaining > 0) return { ...empty, reason: 'Aun en construccion' };
  const def = mapBuildingDef(instance.buildingId);
  if (instance.level >= def.maxLevel) return { ...empty, reason: 'Nivel maximo' };
  const cost = mapBuildingUpgradeCost(def, instance.level);
  const extraCitizens = Math.ceil(def.citizens * 0.5);
  if (player.citizensFree < extraCitizens) {
    return { ...empty, cost, citizens: extraCitizens, reason: `Necesita ${extraCitizens} ciudadanos libres` };
  }
  if (!canAfford(player.stock, cost)) {
    return {
      ...empty,
      cost,
      citizens: extraCitizens,
      reason: 'Recursos insuficientes',
      missing: missingResources(player.stock, cost),
    };
  }
  return { ok: true, reason: null, cost, citizens: extraCitizens, missing: {} };
}

export function upgradeBuilding(
  state: MatchState,
  player: MatchPlayer,
  buildingInstanceId: string,
): boolean {
  const check = canUpgradeBuilding(state, player, buildingInstanceId);
  if (!check.ok) return false;
  const instance = state.buildings[buildingInstanceId];
  if (!spend(player.stock, check.cost)) return false;
  player.citizensFree -= check.citizens;
  instance.citizens += check.citizens;
  instance.level++;
  // Upgrades take a day, like the original build, so they cost tempo.
  instance.daysRemaining = 1;
  return true;
}

/** Frees citizens and clears the tile. Used by combat capture and debug tools. */
export function demolish(state: MatchState, buildingInstanceId: string): void {
  const instance = state.buildings[buildingInstanceId];
  if (!instance) return;
  const player = state.players.find((p) => p.id === instance.owner);
  if (player) {
    player.citizensFree = Math.min(player.citizensTotal, player.citizensFree + instance.citizens);
  }
  const tile = state.tiles[instance.hex];
  if (tile && tile.buildingId === buildingInstanceId) tile.buildingId = null;
  delete state.buildings[buildingInstanceId];
}

/** Transfers a finished building to a new owner, moving its citizen cost too. */
export function captureBuilding(state: MatchState, buildingInstanceId: string, newOwner: string): void {
  const instance = state.buildings[buildingInstanceId];
  if (!instance || instance.owner === newOwner) return;
  const oldPlayer = state.players.find((p) => p.id === instance.owner);
  const newPlayer = state.players.find((p) => p.id === newOwner);
  if (oldPlayer) {
    oldPlayer.citizensFree = Math.min(oldPlayer.citizensTotal, oldPlayer.citizensFree + instance.citizens);
    oldPlayer.citizensTotal = Math.max(0, oldPlayer.citizensTotal);
  }
  if (!newPlayer || newPlayer.citizensFree < instance.citizens) {
    // The new owner cannot man it: the structure is wrecked instead.
    demolish(state, buildingInstanceId);
    return;
  }
  newPlayer.citizensFree -= instance.citizens;
  instance.owner = newOwner;
}

/** Output multiplier from the building's own level. */
export function buildingLevelMultiplier(level: number): number {
  return 1 + (level - 1) * MAP_BUILDING_LEVEL_MULTIPLIER;
}
