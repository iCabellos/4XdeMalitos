import { Rng } from '../core/rng';
import {
  hexDistance,
  hexId,
  hexMapShape,
  hexToWorld,
  neighborIds,
  axialOf,
  type Axial,
  type HexId,
} from './hex';
import { BALANCE } from '../data/balance';
import { ZONES, zoneForRing, type ZoneId } from '../data/zones';
import { SECONDARY_OBJECTIVE_ITEMS, BONUS_ITEM_POOL } from '../data/items';
import type { GateFeature, PlayerId, Region, Tile } from '../core/types';
import type { TerrainId } from '../data/terrain';
import { TERRAINS } from '../data/terrain';

export interface GeneratedMap {
  tiles: Record<HexId, Tile>;
  tileOrder: HexId[];
  regions: Region[];
  startPositions: Record<PlayerId, HexId>;
  mainObjectiveHex: HexId;
  facilityHexes: HexId[];
  gateHexes: HexId[];
}

const CENTER: Axial = { q: 0, r: 0 };
const TWO_PI = Math.PI * 2;

/** Random field smoothed over neighbours: cheap, deterministic, organic enough. */
function smoothField(order: HexId[], rng: Rng, passes: number): Record<HexId, number> {
  const field: Record<HexId, number> = {};
  for (const id of order) field[id] = rng.next();
  for (let p = 0; p < passes; p++) {
    const next: Record<HexId, number> = {};
    for (const id of order) {
      const { q, r } = axialOf(id);
      let sum = field[id];
      let count = 1;
      for (const nId of neighborIds(q, r)) {
        if (field[nId] !== undefined) {
          sum += field[nId];
          count++;
        }
      }
      next[id] = sum / count;
    }
    for (const id of order) field[id] = next[id];
  }
  let min = Infinity;
  let max = -Infinity;
  for (const id of order) {
    if (field[id] < min) min = field[id];
    if (field[id] > max) max = field[id];
  }
  const span = max - min || 1;
  for (const id of order) field[id] = (field[id] - min) / span;
  return field;
}

function pickTerrain(elevation: number, moisture: number, zone: ZoneId): TerrainId {
  if (elevation > 0.86) return 'mountain';
  if (elevation > 0.7) return 'hills';
  if (elevation < 0.2 && moisture > 0.62) return 'water';
  if (moisture > 0.7) return 'forest';
  // The core reads as a built-up installation rather than open country.
  if (zone === 3) return moisture < 0.4 ? 'urban' : 'ruins';
  if (moisture < 0.24) return 'wasteland';
  if (elevation > 0.58 && moisture < 0.42) return 'ruins';
  return 'plains';
}

/** Angle of a hex around the map centre, normalised to [0, 2pi). */
function angleOf(q: number, r: number): number {
  const { x, z } = hexToWorld(q, r);
  const angle = Math.atan2(z, x);
  return angle < 0 ? angle + TWO_PI : angle;
}

/**
 * Sector index for a hex, given how many sectors its zone is divided into.
 * `offset` rotates the whole division so maps do not all share the same seams.
 */
function sectorOf(angle: number, sectors: number, offset: number): number {
  if (sectors <= 1) return 0;
  const shifted = (angle - offset + TWO_PI * 2) % TWO_PI;
  return Math.floor((shifted / TWO_PI) * sectors) % sectors;
}

export function generateMap(seed: number, playerIds: PlayerId[]): GeneratedMap {
  const rng = new Rng(seed);
  const radius = BALANCE.match.mapRadius;
  const shape = hexMapShape(radius);
  const tileOrder = shape.map((a) => hexId(a.q, a.r));

  const elevation = smoothField(tileOrder, rng, 3);
  const moisture = smoothField(tileOrder, rng, 3);

  // One rotation per zone so the seams of the three rings do not line up.
  const sectorOffsets: Record<ZoneId, number> = {
    1: rng.float(0, TWO_PI),
    2: rng.float(0, TWO_PI),
    3: 0,
  };

  const tiles: Record<HexId, Tile> = {};
  for (const axial of shape) {
    const id = hexId(axial.q, axial.r);
    const ring = hexDistance(axial, CENTER);
    const zone = zoneForRing(ring);
    tiles[id] = {
      id,
      q: axial.q,
      r: axial.r,
      terrain: pickTerrain(elevation[id], moisture[id], zone),
      regionId: -1,
      zone,
      ring,
      road: false,
      node: null,
      feature: {},
      controlledBy: null,
      buildingId: null,
    };
  }

  const regions = buildRegions(tiles, tileOrder, sectorOffsets);
  const startPositions = placeSpawns(tiles, tileOrder, regions, playerIds, rng);
  const mainObjectiveHex = prepareCore(tiles);
  const gateHexes = placeGates(tiles, tileOrder, regions, rng);
  const facilityHexes = placeFacilities(tiles, regions, rng);
  placeSecondaryObjectives(tiles, regions, rng);
  placeResourceNodes(tiles, regions, startPositions, rng);
  placeCaches(tiles, tileOrder, rng);
  buildRoads(tiles, regions, startPositions, gateHexes);

  return { tiles, tileOrder, regions, startPositions, mainObjectiveHex, facilityHexes, gateHexes };
}

/** Divides each zone ring into its walled sectors and records the regions. */
function buildRegions(
  tiles: Record<HexId, Tile>,
  tileOrder: HexId[],
  sectorOffsets: Record<ZoneId, number>,
): Region[] {
  const regions: Region[] = [];
  const byKey = new Map<string, Region>();
  let nextId = 0;

  const zone1Names = ['Sector Norte', 'Sector Este', 'Sector Sureste', 'Sector Suroeste', 'Sector Oeste'];
  const zone2Names = ['Cinturon Alfa', 'Cinturon Bravo', 'Cinturon Charlie'];

  for (const id of tileOrder) {
    const tile = tiles[id];
    const zoneDef = ZONES[tile.zone];
    const sector = sectorOf(angleOf(tile.q, tile.r), zoneDef.sectors, sectorOffsets[tile.zone]);
    const key = `${tile.zone}:${sector}`;
    let region = byKey.get(key);
    if (!region) {
      const name =
        tile.zone === 3
          ? 'Nucleo Central'
          : tile.zone === 2
            ? zone2Names[sector % zone2Names.length]
            : zone1Names[sector % zone1Names.length];
      region = {
        id: nextId++,
        name,
        zone: tile.zone,
        sector,
        hexes: [],
        connections: [],
        blurb: zoneDef.blurb,
      };
      byKey.set(key, region);
      regions.push(region);
    }
    tile.regionId = region.id;
    region.hexes.push(id);
  }

  return regions;
}

/** One spawn per zone-1 sector, on the spawn ring, on land. */
function placeSpawns(
  tiles: Record<HexId, Tile>,
  tileOrder: HexId[],
  regions: Region[],
  playerIds: PlayerId[],
  rng: Rng,
): Record<PlayerId, HexId> {
  const out: Record<PlayerId, HexId> = {};
  const zone1 = regions.filter((r) => r.zone === 1).sort((a, b) => a.sector - b.sector);

  playerIds.forEach((pid, index) => {
    const region = zone1[index % zone1.length];
    // Prefer the spawn ring, and the hex furthest from the sector's seams so a
    // player never starts wedged against a wall.
    const candidates = region.hexes
      .filter((id) => tiles[id].ring === BALANCE.match.spawnRing)
      .sort((a, b) => interiorScore(tiles, region, b) - interiorScore(tiles, region, a));
    const chosen = candidates[0] ?? rng.pick(region.hexes);

    const tile = tiles[chosen];
    tile.terrain = 'plains';
    tile.feature.startFor = pid;
    // Keep the immediate surroundings workable.
    for (const nId of neighborIds(tile.q, tile.r)) {
      const n = tiles[nId];
      if (!n || n.regionId !== region.id) continue;
      if (n.terrain === 'water') n.terrain = 'plains';
      if (n.terrain === 'mountain') n.terrain = 'hills';
    }
    out[pid] = chosen;
  });

  void tileOrder;
  return out;
}

/** How surrounded by its own region a hex is: 6 means fully interior. */
function interiorScore(tiles: Record<HexId, Tile>, region: Region, id: HexId): number {
  const tile = tiles[id];
  let same = 0;
  for (const nId of neighborIds(tile.q, tile.r)) {
    if (tiles[nId]?.regionId === region.id) same++;
  }
  return same;
}

function prepareCore(tiles: Record<HexId, Tile>): HexId {
  const mainObjectiveHex = hexId(0, 0);
  const tile = tiles[mainObjectiveHex];
  tile.terrain = 'urban';
  tile.feature.mainObjective = true;
  tile.feature.facility = {
    id: 'central_command',
    name: 'Mando Central',
    state: 'inactive',
    owner: null,
  };
  return mainObjectiveHex;
}

/**
 * Gates are cut into the wall between a zone-1 sector and the zone-2 sector it
 * touches, and between each zone-2 sector and the core. Every zone-1 sector
 * gets at least one way out, and the core gets one entrance per zone-2 sector.
 */
function placeGates(
  tiles: Record<HexId, Tile>,
  tileOrder: HexId[],
  regions: Region[],
  rng: Rng,
): HexId[] {
  const byId = new Map(regions.map((r) => [r.id, r]));
  const gateHexes: HexId[] = [];
  let gateCounter = 0;

  /** Adjacent tile pairs that straddle the boundary between two given regions. */
  const boundaryPairs = (regionA: number, regionB: number): { outer: HexId; inner: HexId }[] => {
    const pairs: { outer: HexId; inner: HexId }[] = [];
    for (const id of tileOrder) {
      const tile = tiles[id];
      if (tile.regionId !== regionA) continue;
      for (const nId of neighborIds(tile.q, tile.r)) {
        const n = tiles[nId];
        if (n && n.regionId === regionB) pairs.push({ outer: id, inner: nId });
      }
    }
    return pairs;
  };

  const cutGate = (regionA: number, regionB: number, count: number) => {
    const a = byId.get(regionA);
    const b = byId.get(regionB);
    if (!a || !b) return;
    const pairs = boundaryPairs(regionA, regionB);
    if (pairs.length === 0) return;

    // Spread the openings along the boundary instead of clustering them.
    const spread = rng.shuffle(pairs);
    const chosen: { outer: HexId; inner: HexId }[] = [];
    for (const pair of spread) {
      if (chosen.length >= count) break;
      const tooClose = chosen.some(
        (c) => hexDistance(tiles[c.outer], tiles[pair.outer]) < 3,
      );
      if (tooClose) continue;
      chosen.push(pair);
    }
    if (chosen.length === 0) chosen.push(spread[0]);

    const opensOnDay = ZONES[Math.max(a.zone, b.zone) === 3 ? 3 : 2].gatesOpenOnDay;

    for (const pair of chosen) {
      const gate: GateFeature = {
        id: `gate${gateCounter++}`,
        regionA,
        regionB,
        zoneA: a.zone,
        zoneB: b.zone,
        opensOnDay,
        open: opensOnDay <= 0,
        controlledBy: null,
      };
      // The doorway sits on the outer tile; both sides must be walkable.
      for (const hex of [pair.outer, pair.inner]) {
        const tile = tiles[hex];
        if (!TERRAINS[tile.terrain].passableBy.includes('land')) tile.terrain = 'plains';
        if (tile.terrain === 'mountain') tile.terrain = 'hills';
      }
      tiles[pair.outer].feature.gate = gate;
      gateHexes.push(pair.outer);
      if (!a.connections.includes(regionB)) a.connections.push(regionB);
      if (!b.connections.includes(regionA)) b.connections.push(regionA);
    }
  };

  const zone1 = regions.filter((r) => r.zone === 1);
  const zone2 = regions.filter((r) => r.zone === 2);
  const core = regions.find((r) => r.zone === 3);

  // One way out per zone-1 sector, cut into the belt sector it shares the most
  // border with. More openings than that and the walls stop mattering.
  for (const outer of zone1) {
    const touching = zone2
      .map((inner) => ({ inner, shared: boundaryPairs(outer.id, inner.id).length }))
      .filter((entry) => entry.shared > 0)
      .sort((a, b) => b.shared - a.shared);
    if (touching.length > 0) cutGate(outer.id, touching[0].inner.id, 1);
    else if (zone2.length > 0) cutGate(outer.id, zone2[0].id, 1);
  }

  // Each zone-2 sector opens into the core.
  if (core) {
    for (const inner of zone2) cutGate(inner.id, core.id, 1);
  }

  return gateHexes;
}

/** Three strategic facilities, one per zone-2 sector. */
function placeFacilities(tiles: Record<HexId, Tile>, regions: Region[], rng: Rng): HexId[] {
  const out: HexId[] = [];
  const names = ['Estacion Relay', 'Complejo Hidrico', 'Radar Profundo'];
  const zone2 = regions.filter((r) => r.zone === 2);

  zone2.forEach((region, index) => {
    const candidates = region.hexes.filter((id) => {
      const t = tiles[id];
      return (
        !t.feature.gate &&
        !t.feature.facility &&
        !t.feature.secondaryObjective &&
        TERRAINS[t.terrain].passableBy.includes('land')
      );
    });
    if (candidates.length === 0) return;
    const hex = rng.pick(candidates);
    tiles[hex].feature.facility = {
      id: `facility_${index}`,
      name: names[index % names.length],
      state: 'inactive',
      owner: null,
    };
    out.push(hex);
  });

  return out;
}

/**
 * Purple encounters: one garrisoned objective per zone-2 sector, each holding a
 * different item. Beating one is a real fight, not a capture.
 */
function placeSecondaryObjectives(
  tiles: Record<HexId, Tile>,
  regions: Region[],
  rng: Rng,
): void {
  const zone2 = regions.filter((r) => r.zone === 2);
  const pool = [...SECONDARY_OBJECTIVE_ITEMS, ...rng.shuffle(BONUS_ITEM_POOL)];
  const names = ['Deposito Fortificado', 'Puesto Renegado', 'Bunker Abandonado'];

  zone2.forEach((region, index) => {
    const candidates = region.hexes.filter((id) => {
      const t = tiles[id];
      return (
        !t.feature.gate &&
        !t.feature.facility &&
        !t.feature.secondaryObjective &&
        TERRAINS[t.terrain].passableBy.includes('land')
      );
    });
    if (candidates.length === 0) return;
    const hex = rng.pick(candidates);
    // A garrison strong enough to demand a real army, not a scout.
    tiles[hex].feature.secondaryObjective = {
      id: `secondary_${index}`,
      name: names[index % names.length],
      itemId: pool[index % pool.length],
      garrison: {
        heavy_infantry: rng.int(8, 12),
        infantry: rng.int(14, 20),
        artillery: rng.int(3, 6),
      },
      defeatedBy: null,
    };
  });
}

interface NodePlan {
  nodeId: string;
  richness: number;
  terrains: TerrainId[];
  deposit: number;
}

const COMMON_NODES: NodePlan[] = [
  { nodeId: 'farmland', richness: 1, terrains: ['plains'], deposit: 999 },
  { nodeId: 'timber', richness: 1, terrains: ['forest'], deposit: 999 },
  { nodeId: 'ironVein', richness: 1, terrains: ['hills', 'mountain'], deposit: 120 },
  { nodeId: 'oilField', richness: 1, terrains: ['wasteland', 'plains'], deposit: 90 },
  { nodeId: 'geothermal', richness: 1, terrains: ['hills', 'mountain', 'wasteland'], deposit: 999 },
  { nodeId: 'researchSite', richness: 1, terrains: ['ruins', 'urban'], deposit: 60 },
];

const RARE_NODES = ['titaniumDeposit', 'uraniumDeposit', 'crystalDeposit'];

/**
 * Resource placement follows the zone contract exactly:
 *   zone 1  common, abundant
 *   zone 2  common very abundant + thin rare seams
 *   zone 3  rich rare veins, and the only place they are worth mining at scale
 */
function placeResourceNodes(
  tiles: Record<HexId, Tile>,
  regions: Region[],
  startPositions: Record<PlayerId, HexId>,
  rng: Rng,
): void {
  const content = BALANCE.zoneContent;

  const isFree = (id: HexId) => {
    const t = tiles[id];
    return (
      !!t &&
      t.node === null &&
      !t.feature.gate &&
      !t.feature.mainObjective &&
      !t.feature.startFor &&
      !t.feature.facility &&
      !t.feature.secondaryObjective
    );
  };

  const place = (hex: HexId, plan: NodePlan, richness: number) => {
    const tile = tiles[hex];
    // Nudge terrain so the node reads correctly on the map.
    if (plan.terrains.length > 0 && !plan.terrains.includes(tile.terrain)) {
      tile.terrain = plan.terrains[0];
    }
    tile.node = { nodeId: plan.nodeId, remaining: plan.deposit, richness };
  };

  const pickHexes = (region: Region, count: number, near?: HexId): HexId[] => {
    let candidates = region.hexes.filter(isFree);
    if (near) {
      const origin = axialOf(near);
      candidates = candidates.sort(
        (a, b) => hexDistance(tiles[a], origin) - hexDistance(tiles[b], origin),
      );
      return candidates.slice(0, count);
    }
    return rng.shuffle(candidates).slice(0, count);
  };

  // -- Zone 1: every spawn gets food, timber and metal within easy reach ------
  for (const region of regions.filter((r) => r.zone === 1)) {
    const spawn = Object.values(startPositions).find((hex) => tiles[hex].regionId === region.id);
    const guaranteed = [COMMON_NODES[0], COMMON_NODES[1], COMMON_NODES[2]];
    const nearby = pickHexes(region, guaranteed.length, spawn);
    guaranteed.forEach((plan, i) => {
      if (nearby[i]) place(nearby[i], plan, content.zone1Richness);
    });
    // Plus a spread of other common nodes across the sector.
    const extra = pickHexes(region, content.zone1CommonPerSector);
    extra.forEach((hex, i) => {
      place(hex, COMMON_NODES[(i + 3) % COMMON_NODES.length], content.zone1Richness);
    });
  }

  // -- Zone 2: very abundant common, plus thin rare seams --------------------
  for (const region of regions.filter((r) => r.zone === 2)) {
    const commons = pickHexes(region, content.zone2CommonPerSector);
    commons.forEach((hex, i) => {
      place(hex, COMMON_NODES[i % COMMON_NODES.length], content.zone2Richness);
    });
    const rares = pickHexes(region, content.zone2RarePerSector);
    rares.forEach((hex, i) => {
      const nodeId = RARE_NODES[(region.sector + i) % RARE_NODES.length];
      place(hex, { nodeId, richness: 1, terrains: [], deposit: 22 }, content.zone2RareRichness);
    });
  }

  // -- Zone 3: the richest rare veins on the map -----------------------------
  const core = regions.find((r) => r.zone === 3);
  if (core) {
    const abundant = pickHexes(core, content.zone3RareAbundant);
    abundant.forEach((hex, i) => {
      const nodeId = i === 0 ? 'crystalDeposit' : 'titaniumDeposit';
      place(hex, { nodeId, richness: 1, terrains: [], deposit: 46 }, content.zone3RareRichness);
    });
    const thin = pickHexes(core, content.zone3RareThin);
    thin.forEach((hex) => {
      place(hex, { nodeId: 'uraniumDeposit', richness: 1, terrains: [], deposit: 24 }, content.zone3ThinRichness);
    });
  }
}

/** Abandoned bases: one-shot caches that reward pushing into a new sector. */
function placeCaches(tiles: Record<HexId, Tile>, tileOrder: HexId[], rng: Rng): void {
  const candidates = rng.shuffle(
    tileOrder.filter((id) => {
      const t = tiles[id];
      return (
        t.node === null &&
        !t.feature.gate &&
        !t.feature.startFor &&
        !t.feature.mainObjective &&
        !t.feature.facility &&
        !t.feature.secondaryObjective &&
        (t.terrain === 'ruins' || t.terrain === 'urban' || t.terrain === 'wasteland')
      );
    }),
  );
  const count = Math.min(9, candidates.length);
  for (let i = 0; i < count; i++) {
    const zone = tiles[candidates[i]].zone;
    tiles[candidates[i]].feature.cache = {
      taken: false,
      loot:
        zone === 1
          ? { materials: rng.int(25, 45), food: rng.int(20, 35) }
          : zone === 2
            ? { materials: rng.int(45, 75), metal: rng.int(25, 45), science: rng.int(15, 30) }
            : { titanium: rng.int(3, 6), uranium: rng.int(2, 4), science: rng.int(30, 50) },
    };
  }
}

/**
 * Roads run from each spawn to its sector's gates, and from the core outwards,
 * so the fast lanes lead exactly where the pressure is.
 */
function buildRoads(
  tiles: Record<HexId, Tile>,
  regions: Region[],
  startPositions: Record<PlayerId, HexId>,
  gateHexes: HexId[],
): void {
  const pave = (from: HexId, to: HexId, regionId: number) => {
    // Walk greedily towards the target, staying inside the region: a road may
    // not tunnel through a wall.
    let current = from;
    for (let step = 0; step < 40 && current !== to; step++) {
      tiles[current].road = true;
      const target = axialOf(to);
      let best: HexId | null = null;
      let bestDist = hexDistance(tiles[current], target);
      for (const nId of neighborIds(tiles[current].q, tiles[current].r)) {
        const n = tiles[nId];
        if (!n) continue;
        if (n.regionId !== regionId && nId !== to) continue;
        if (n.terrain === 'water') continue;
        const d = hexDistance(n, target);
        if (d < bestDist) {
          bestDist = d;
          best = nId;
        }
      }
      if (!best) break;
      current = best;
    }
    tiles[to].road = true;
  };

  for (const [, spawn] of Object.entries(startPositions)) {
    const regionId = tiles[spawn].regionId;
    const sectorGates = gateHexes.filter((g) => tiles[g].regionId === regionId);
    for (const gate of sectorGates) pave(spawn, gate, regionId);
  }

  // Inside each zone-2 sector, link its gates to each other through the sector.
  for (const region of regions.filter((r) => r.zone === 2)) {
    const inner = gateHexes.filter((g) => tiles[g].regionId === region.id);
    for (let i = 1; i < inner.length; i++) pave(inner[i - 1], inner[i], region.id);
  }
}
