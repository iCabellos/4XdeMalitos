import { axialOf, hexDistanceId, neighborIds, type HexId } from '../map/hex';
import { ROAD_MOVE_COST, TERRAINS, type Domain } from '../data/terrain';
import { troopDef } from '../data/troops';
import { commanderDef } from '../data/commanders';
import { mapBuildingDef } from '../data/buildings.map';
import { BALANCE } from '../data/balance';
import type { Army, GateFeature, MatchState, Tile } from './types';

/**
 * The domains an army can traverse: the intersection of its troops' domains.
 * Air units traverse everything, so a pure air army ignores terrain barriers,
 * while mixing land and naval troops makes an army unable to move at all.
 */
export function armyDomains(army: Army): Domain[] {
  const present = new Set<Domain>();
  for (const [troopId, count] of Object.entries(army.composition)) {
    if (count <= 0) continue;
    present.add(troopDef(troopId).domain);
  }
  if (present.size === 0) return [];

  // Air units impose no terrain restriction on the formation, but they only
  // grant flight when the whole force flies.
  const ground = [...present].filter((d) => d !== 'air');
  if (ground.length === 0) return ['air'];
  // Land and naval troops in one formation cannot share a route at all.
  if (ground.length > 1) return [];
  return [ground[0]];
}

export function armySize(army: Army): number {
  return Object.values(army.composition).reduce((a, b) => a + b, 0);
}

export function isArmyEmpty(army: Army): boolean {
  return armySize(army) <= 0;
}

/**
 * Walls sit on every boundary between two regions and stop everything - ground,
 * naval and air alike. The only opening is a gate hex joining those two
 * regions, and only once its day has come.
 */
export function canCrossBetween(from: Tile, to: Tile): boolean {
  if (from.regionId === to.regionId) return true;
  return findOpenGate(from, to) !== null;
}

/** The open gate joining these two adjacent tiles, if there is one. */
export function findOpenGate(from: Tile, to: Tile): GateFeature | null {
  for (const tile of [from, to]) {
    const gate = tile.feature.gate;
    if (!gate || !gate.open) continue;
    const joins =
      (gate.regionA === from.regionId && gate.regionB === to.regionId) ||
      (gate.regionB === from.regionId && gate.regionA === to.regionId);
    if (joins) return gate;
  }
  return null;
}

/** The gate joining two adjacent tiles whether or not it has opened yet. */
export function findGate(from: Tile, to: Tile): GateFeature | null {
  for (const tile of [from, to]) {
    const gate = tile.feature.gate;
    if (!gate) continue;
    const joins =
      (gate.regionA === from.regionId && gate.regionB === to.regionId) ||
      (gate.regionB === from.regionId && gate.regionA === to.regionId);
    if (joins) return gate;
  }
  return null;
}

/** Terrain and domain check for the destination alone, ignoring walls. */
export function canOccupyTile(army: Army, tile: Tile): boolean {
  const domains = armyDomains(army);
  if (domains.length === 0) return false;
  const terrain = TERRAINS[tile.terrain];
  return domains.some((d) => terrain.passableBy.includes(d));
}

export function canEnterTile(army: Army, from: Tile, to: Tile): boolean {
  if (!canOccupyTile(army, to)) return false;
  return canCrossBetween(from, to);
}

/**
 * Movement point cost of stepping from `from` into `to`. Infinity means the
 * step is impossible, whether because of terrain, domain or a wall.
 */
export function moveCost(army: Army, from: Tile, to: Tile): number {
  if (!canEnterTile(army, from, to)) return Infinity;
  const domains = armyDomains(army);
  // Pure air formations ignore ground movement costs, but not walls.
  if (domains.includes('air') && domains.length === 1) return 1;
  const terrain = TERRAINS[to.terrain];
  let cost = to.road ? Math.max(ROAD_MOVE_COST, terrain.moveCost * ROAD_MOVE_COST) : terrain.moveCost;
  if (to.controlledBy && to.controlledBy !== army.owner) {
    cost += BALANCE.movement.enemyTerritorySurcharge;
  }
  return cost;
}

export interface PathResult {
  /** Hexes from origin (exclusive) to destination (inclusive). */
  path: HexId[];
  /** Cumulative movement cost of each step, aligned with `path`. */
  costs: number[];
  totalCost: number;
  reachable: boolean;
}

/**
 * Dijkstra over the hex grid. Returns the full path even when it exceeds the
 * army's current movement points, so multi-day marches can be planned and the
 * UI can show how far this day's move actually gets.
 */
export function findPath(state: MatchState, army: Army, to: HexId): PathResult {
  const from = army.hex;
  if (from === to) return { path: [], costs: [], totalCost: 0, reachable: true };
  if (!state.tiles[to]) return { path: [], costs: [], totalCost: Infinity, reachable: false };

  const dist: Record<HexId, number> = { [from]: 0 };
  const prev: Record<HexId, HexId> = {};
  const visited = new Set<HexId>();
  // Small maps (169 tiles) make a linear-scan frontier cheaper than a heap.
  const frontier = new Set<HexId>([from]);

  while (frontier.size > 0) {
    let current: HexId | null = null;
    let best = Infinity;
    for (const id of frontier) {
      const d = dist[id];
      if (d < best) {
        best = d;
        current = id;
      }
    }
    if (current === null) break;
    frontier.delete(current);
    visited.add(current);
    if (current === to) break;

    const { q, r } = axialOf(current);
    for (const nId of neighborIds(q, r)) {
      const tile = state.tiles[nId];
      if (!tile || visited.has(nId)) continue;
      const step = moveCost(army, state.tiles[current], tile);
      if (!Number.isFinite(step)) continue;
      const nd = best + step;
      if (nd < (dist[nId] ?? Infinity)) {
        dist[nId] = nd;
        prev[nId] = current;
        frontier.add(nId);
      }
    }
  }

  if (dist[to] === undefined) return { path: [], costs: [], totalCost: Infinity, reachable: false };

  const path: HexId[] = [];
  let cursor: HexId = to;
  while (cursor !== from) {
    path.unshift(cursor);
    cursor = prev[cursor];
  }
  const costs = path.map((id) => dist[id]);
  return { path, costs, totalCost: dist[to], reachable: true };
}

/** How far along a path the army can actually travel with its current points. */
export function reachableAlongPath(result: PathResult, movementPoints: number): number {
  let index = -1;
  for (let i = 0; i < result.costs.length; i++) {
    if (result.costs[i] <= movementPoints + 1e-9) index = i;
    else break;
  }
  return index;
}

/** All hexes an army can reach this day, keyed by remaining cost. */
export function reachableHexes(state: MatchState, army: Army): Record<HexId, number> {
  const out: Record<HexId, number> = {};
  const dist: Record<HexId, number> = { [army.hex]: 0 };
  const frontier = new Set<HexId>([army.hex]);
  const visited = new Set<HexId>();

  while (frontier.size > 0) {
    let current: HexId | null = null;
    let best = Infinity;
    for (const id of frontier) {
      if (dist[id] < best) {
        best = dist[id];
        current = id;
      }
    }
    if (current === null) break;
    frontier.delete(current);
    visited.add(current);
    if (current !== army.hex) out[current] = best;

    const { q, r } = axialOf(current);
    for (const nId of neighborIds(q, r)) {
      const tile = state.tiles[nId];
      if (!tile || visited.has(nId)) continue;
      const step = moveCost(army, state.tiles[current], tile);
      if (!Number.isFinite(step)) continue;
      const nd = best + step;
      if (nd <= army.movementPoints + 1e-9 && nd < (dist[nId] ?? Infinity)) {
        dist[nId] = nd;
        frontier.add(nId);
      }
    }
  }
  return out;
}

/** Movement points an army starts the day with, including every bonus. */
export function computeMaxMovementPoints(state: MatchState, army: Army): number {
  const player = state.players.find((p) => p.id === army.owner);
  let base = BALANCE.movement.basePoints;

  // The slowest troop in the formation sets the pace.
  let slowest = Infinity;
  for (const [troopId, count] of Object.entries(army.composition)) {
    if (count <= 0) continue;
    slowest = Math.min(slowest, troopDef(troopId).movement);
  }
  if (Number.isFinite(slowest)) base = (base + slowest) / 2;

  if (player) base += player.modifiers.movementBonus;
  if (army.commanderId) base += commanderDef(army.commanderId).ability.movementBonus ?? 0;

  // A friendly logistics hub nearby pushes supplies forward.
  for (const building of Object.values(state.buildings)) {
    if (building.owner !== army.owner || building.daysRemaining > 0 || !building.online) continue;
    if (mapBuildingDef(building.buildingId).id !== 'logistics_hub') continue;
    if (hexDistanceId(building.hex, army.hex) <= BALANCE.movement.logisticsRadius) {
      base += BALANCE.movement.logisticsBonus;
      break;
    }
  }

  return Math.max(1, Math.round(base * 10) / 10);
}
