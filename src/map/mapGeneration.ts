import { Rng } from '../core/rng';
import {
  hexDistance,
  hexId,
  hexMapShape,
  hexOnRing,
  hexLine,
  neighborIds,
  axialOf,
  type Axial,
  type HexId,
} from './hex';
import { BALANCE } from '../data/balance';
import type { Region, RegionLock, Tile, PlayerId } from '../core/types';
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
  // Renormalise to 0..1 so thresholds stay meaningful after smoothing.
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

function pickTerrain(elevation: number, moisture: number, distanceFromCenter: number): TerrainId {
  if (elevation > 0.82) return 'mountain';
  if (elevation > 0.66) return 'hills';
  if (elevation < 0.24 && moisture > 0.58) return 'water';
  if (moisture > 0.68) return 'forest';
  // Urban and ruin clusters sit in the mid-band, more likely nearer the centre.
  if (moisture < 0.3 && elevation > 0.45 && distanceFromCenter <= 4) return 'urban';
  if (moisture < 0.22) return 'wasteland';
  if (elevation > 0.55 && moisture < 0.42) return 'ruins';
  return 'plains';
}

/** Five evenly spaced spawn hexes on the spawn ring, rotated by the seed. */
function computeStartPositions(rng: Rng, playerIds: PlayerId[]): Record<PlayerId, HexId> {
  const out: Record<PlayerId, HexId> = {};
  const baseAngle = rng.float(0, Math.PI * 2);
  const ring = BALANCE.match.spawnRing;
  const used = new Set<HexId>();
  playerIds.forEach((pid, index) => {
    const angle = baseAngle + (index / playerIds.length) * Math.PI * 2;
    let axial = hexOnRing(angle, ring);
    let id = hexId(axial.q, axial.r);
    // Nudge outward if two spawns collapse onto the same hex after rounding.
    let attempts = 0;
    while ((used.has(id) || hexDistance(axial, CENTER) > BALANCE.match.mapRadius - 1) && attempts < 12) {
      const jitter = angle + (attempts % 2 === 0 ? 1 : -1) * 0.12 * Math.ceil(attempts / 2);
      axial = hexOnRing(jitter, ring);
      id = hexId(axial.q, axial.r);
      attempts++;
    }
    used.add(id);
    out[pid] = id;
  });
  return out;
}

export function generateMap(seed: number, playerIds: PlayerId[]): GeneratedMap {
  const rng = new Rng(seed);
  const radius = BALANCE.match.mapRadius;
  const shape = hexMapShape(radius);
  const tileOrder = shape.map((a) => hexId(a.q, a.r));

  const elevation = smoothField(tileOrder, rng, 3);
  const moisture = smoothField(tileOrder, rng, 3);

  const tiles: Record<HexId, Tile> = {};
  for (const axial of shape) {
    const id = hexId(axial.q, axial.r);
    const dist = hexDistance(axial, CENTER);
    tiles[id] = {
      id,
      q: axial.q,
      r: axial.r,
      terrain: pickTerrain(elevation[id], moisture[id], dist),
      regionId: -1,
      road: false,
      node: null,
      feature: {},
      controlledBy: null,
      buildingId: null,
    };
  }

  const startPositions = computeStartPositions(rng, playerIds);

  // Spawns and their immediate ring must be land so nobody starts landlocked.
  for (const [pid, startHex] of Object.entries(startPositions)) {
    const start = axialOf(startHex);
    tiles[startHex].terrain = 'plains';
    tiles[startHex].feature.startFor = pid;
    for (const nId of neighborIds(start.q, start.r)) {
      const t = tiles[nId];
      if (t && t.terrain === 'water') t.terrain = 'plains';
      if (t && t.terrain === 'mountain') t.terrain = 'hills';
    }
  }

  // The main objective sits dead centre and is always urban, always reachable.
  const mainObjectiveHex = hexId(0, 0);
  tiles[mainObjectiveHex].terrain = 'urban';
  tiles[mainObjectiveHex].feature.mainObjective = true;
  tiles[mainObjectiveHex].feature.facility = {
    id: 'central_command',
    name: 'Mando Central',
    state: 'inactive',
    owner: null,
  };

  const { regions, gateHexes } = buildRegions(tiles, tileOrder, startPositions, rng);
  const facilityHexes = placeFacilities(tiles, tileOrder, rng);
  placeResourceNodes(tiles, tileOrder, regions, startPositions, rng);
  placeCaches(tiles, tileOrder, rng);
  buildRoads(tiles, startPositions);

  return { tiles, tileOrder, regions, startPositions, mainObjectiveHex, facilityHexes, gateHexes };
}

function buildRegions(
  tiles: Record<HexId, Tile>,
  tileOrder: HexId[],
  startPositions: Record<PlayerId, HexId>,
  rng: Rng,
): { regions: Region[]; gateHexes: HexId[] } {
  const regions: Region[] = [];
  const coreRadius = BALANCE.match.coreRadius;

  // Region 0: the locked core. Everything inside is worth fighting for.
  const core: Region = {
    id: 0,
    name: 'Nucleo Central',
    kind: 'core',
    lock: { type: 'gate', gateHexes: [] },
    hexes: [],
    blurb: 'Region cerrada. Solo se entra tomando una de sus puertas.',
  };
  regions.push(core);

  for (const id of tileOrder) {
    const t = tiles[id];
    if (hexDistance(t, CENTER) <= coreRadius) {
      t.regionId = 0;
      core.hexes.push(id);
    }
  }

  // Regions 1..N: one home region per participant.
  const startIds = Object.entries(startPositions);
  startIds.forEach(([pid, startHex], index) => {
    const region: Region = {
      id: index + 1,
      name: `Sector Base ${index + 1}`,
      kind: 'start',
      lock: { type: 'none' },
      hexes: [],
      blurb: `Zona de despliegue inicial de ${pid}.`,
    };
    const start = axialOf(startHex);
    for (const id of tileOrder) {
      const t = tiles[id];
      if (t.regionId === -1 && hexDistance(t, start) <= 2) {
        t.regionId = region.id;
        region.hexes.push(id);
      }
    }
    regions.push(region);
  });

  // Remaining hexes: Voronoi partition around six seeds on the middle ring.
  const fieldSeedCount = 6;
  const seedAngleOffset = rng.float(0, Math.PI * 2);
  const seeds: Axial[] = [];
  for (let i = 0; i < fieldSeedCount; i++) {
    const angle = seedAngleOffset + (i / fieldSeedCount) * Math.PI * 2;
    seeds.push(hexOnRing(angle, BALANCE.match.mapRadius - 3));
  }

  const fieldNames = [
    'Cuenca Norte',
    'Corredor Este',
    'Marismas del Sur',
    'Altiplano Oeste',
    'Distrito Industrial',
    'Franja Gris',
  ];

  const fieldRegions: Region[] = seeds.map((_, i) => ({
    id: regions.length + i,
    name: fieldNames[i % fieldNames.length],
    kind: 'field' as const,
    lock: { type: 'none' } as RegionLock,
    hexes: [],
    blurb: 'Territorio abierto y disputado.',
  }));

  for (const id of tileOrder) {
    const t = tiles[id];
    if (t.regionId !== -1) continue;
    let best = 0;
    let bestDist = Infinity;
    seeds.forEach((seed, i) => {
      const d = hexDistance(t, seed);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    t.regionId = fieldRegions[best].id;
    fieldRegions[best].hexes.push(id);
  }

  // Two field regions become restricted: they hold the richest ground.
  const shuffledFields = rng.shuffle(fieldRegions.filter((r) => r.hexes.length >= 8));
  const restrictedA = shuffledFields[0];
  const restrictedB = shuffledFields[1];
  if (restrictedA) {
    restrictedA.kind = 'restricted';
    restrictedA.lock = { type: 'tech', techId: 'breaching_protocols' };
    restrictedA.name = 'Zona Restringida Alfa';
    restrictedA.blurb = 'Sellada. Requiere Protocolos de apertura para entrar.';
  }
  if (restrictedB) {
    restrictedB.kind = 'restricted';
    restrictedB.lock = { type: 'building', buildingId: 'outpost' };
    restrictedB.name = 'Zona Restringida Beta';
    restrictedB.blurb = 'Cerrada. Necesita un puesto avanzado adyacente para abrirse.';
  }

  regions.push(...fieldRegions);

  // Gates: hexes on the ring just outside the core, evenly spread.
  const gateHexes: HexId[] = [];
  const gateCount = BALANCE.match.coreGates;
  const gateAngleOffset = rng.float(0, Math.PI * 2);
  const usedGates = new Set<HexId>();
  for (let i = 0; i < gateCount; i++) {
    const angle = gateAngleOffset + (i / gateCount) * Math.PI * 2;
    let axial = hexOnRing(angle, coreRadius + 1);
    let id = hexId(axial.q, axial.r);
    let attempts = 0;
    while ((!tiles[id] || usedGates.has(id) || hexDistance(axial, CENTER) !== coreRadius + 1) && attempts < 16) {
      axial = hexOnRing(angle + 0.15 * (attempts + 1), coreRadius + 1);
      id = hexId(axial.q, axial.r);
      attempts++;
    }
    if (!tiles[id] || usedGates.has(id)) continue;
    usedGates.add(id);
    const tile = tiles[id];
    // A gate must be enterable: never leave one under water or a mountain.
    if (!TERRAINS[tile.terrain].passableBy.includes('land')) tile.terrain = 'plains';
    if (tile.terrain === 'mountain') tile.terrain = 'hills';
    tile.feature.gate = { regionId: 0, controlledBy: null };
    gateHexes.push(id);
  }
  core.lock = { type: 'gate', gateHexes };

  return { regions, gateHexes };
}

/** Three strategic facilities, spread out, used by the grid-activation objective. */
function placeFacilities(tiles: Record<HexId, Tile>, tileOrder: HexId[], rng: Rng): HexId[] {
  const out: HexId[] = [];
  const names = ['Estacion Relay', 'Complejo Hidrico', 'Radar Profundo'];
  const angleOffset = rng.float(0, Math.PI * 2);
  const used = new Set<HexId>();
  for (let i = 0; i < 3; i++) {
    const angle = angleOffset + (i / 3) * Math.PI * 2;
    let best: HexId | null = null;
    let bestScore = Infinity;
    const target = hexOnRing(angle, 4);
    for (const id of tileOrder) {
      const t = tiles[id];
      if (used.has(id) || t.feature.gate || t.feature.mainObjective || t.feature.startFor) continue;
      if (!TERRAINS[t.terrain].passableBy.includes('land')) continue;
      const d = hexDistance(t, target);
      if (d < bestScore) {
        bestScore = d;
        best = id;
      }
    }
    if (!best) continue;
    used.add(best);
    tiles[best].feature.facility = {
      id: `facility_${i}`,
      name: names[i],
      state: 'inactive',
      owner: null,
    };
    if (tiles[best].terrain === 'water') tiles[best].terrain = 'plains';
    out.push(best);
  }
  return out;
}

interface NodePlacement {
  nodeId: string;
  count: number;
  /** Terrains the node prefers; empty means any land terrain. */
  terrains: TerrainId[];
  deposit: number;
}

function placeResourceNodes(
  tiles: Record<HexId, Tile>,
  tileOrder: HexId[],
  regions: Region[],
  startPositions: Record<PlayerId, HexId>,
  rng: Rng,
): void {
  const setNode = (id: HexId, nodeId: string, deposit: number) => {
    tiles[id].node = { nodeId, remaining: deposit };
  };

  const isFree = (id: HexId) => {
    const t = tiles[id];
    return (
      !!t && t.node === null && !t.feature.gate && !t.feature.mainObjective && !t.feature.startFor
    );
  };

  // Guaranteed fair start: every player gets food, wood and metal within reach.
  for (const startHex of Object.values(startPositions)) {
    const start = axialOf(startHex);
    const nearby = tileOrder.filter((id) => {
      const t = tiles[id];
      return isFree(id) && hexDistance(t, start) >= 1 && hexDistance(t, start) <= 2;
    });
    const shuffled = rng.shuffle(nearby);
    const guaranteed: [string, number][] = [
      ['farmland', 999],
      ['timber', 999],
      ['ironVein', 120],
    ];
    guaranteed.forEach(([nodeId, deposit], i) => {
      const hex = shuffled[i];
      if (!hex) return;
      const tile = tiles[hex];
      if (!TERRAINS[tile.terrain].passableBy.includes('land')) tile.terrain = 'plains';
      if (nodeId === 'timber') tile.terrain = 'forest';
      if (nodeId === 'ironVein' && tile.terrain !== 'mountain') tile.terrain = 'hills';
      if (nodeId === 'farmland') tile.terrain = 'plains';
      setNode(hex, nodeId, deposit);
    });
  }

  // Common nodes scattered across the whole map.
  const commonPlacements: NodePlacement[] = [
    { nodeId: 'farmland', count: 10, terrains: ['plains'], deposit: 999 },
    { nodeId: 'timber', count: 9, terrains: ['forest'], deposit: 999 },
    { nodeId: 'ironVein', count: 9, terrains: ['hills', 'mountain'], deposit: 120 },
    { nodeId: 'oilField', count: 6, terrains: ['wasteland', 'plains'], deposit: 90 },
    { nodeId: 'geothermal', count: 5, terrains: ['hills', 'mountain', 'wasteland'], deposit: 999 },
    { nodeId: 'researchSite', count: 5, terrains: ['ruins', 'urban'], deposit: 60 },
  ];

  for (const placement of commonPlacements) {
    const candidates = rng.shuffle(
      tileOrder.filter(
        (id) =>
          isFree(id) &&
          (placement.terrains.length === 0 || placement.terrains.includes(tiles[id].terrain)),
      ),
    );
    for (let i = 0; i < placement.count && i < candidates.length; i++) {
      setNode(candidates[i], placement.nodeId, placement.deposit);
    }
  }

  // Rare deposits: deliberately few, and concentrated where access is contested.
  const coreHexes = regions[0].hexes.filter((id) => isFree(id));
  const restricted = regions.filter((r) => r.kind === 'restricted');
  const restrictedHexes = restricted.flatMap((r) => r.hexes).filter((id) => isFree(id));
  const openHexes = tileOrder.filter(
    (id) => isFree(id) && tiles[id].regionId !== 0 && hexDistance(tiles[id], CENTER) >= 3,
  );

  const placeRare = (nodeId: string, deposit: number, pool: HexId[]): boolean => {
    const candidates = pool.filter(isFree);
    if (candidates.length === 0) return false;
    const hex = rng.pick(candidates);
    const tile = tiles[hex];
    if (!TERRAINS[tile.terrain].passableBy.includes('land')) tile.terrain = 'hills';
    setNode(hex, nodeId, deposit);
    return true;
  };

  // Core: the single most valuable ground on the map.
  placeRare('crystalDeposit', 18, coreHexes);
  placeRare('titaniumDeposit', 30, coreHexes);
  // Restricted regions: high value behind a lock.
  placeRare('titaniumDeposit', 30, restrictedHexes.length ? restrictedHexes : openHexes);
  placeRare('uraniumDeposit', 20, restrictedHexes.length ? restrictedHexes : openHexes);
  placeRare('crystalDeposit', 18, restrictedHexes.length ? restrictedHexes : openHexes);
  // Open map: enough to start a war over, never enough to satisfy five players.
  placeRare('titaniumDeposit', 30, openHexes);
  placeRare('titaniumDeposit', 30, openHexes);
  placeRare('uraniumDeposit', 20, openHexes);
  placeRare('uraniumDeposit', 20, openHexes);
}

/** Abandoned bases: one-shot caches that reward early scouting. */
function placeCaches(tiles: Record<HexId, Tile>, tileOrder: HexId[], rng: Rng): void {
  const candidates = rng.shuffle(
    tileOrder.filter((id) => {
      const t = tiles[id];
      return (
        !t.feature.gate &&
        !t.feature.startFor &&
        !t.feature.mainObjective &&
        !t.feature.facility &&
        (t.terrain === 'ruins' || t.terrain === 'urban' || t.terrain === 'wasteland')
      );
    }),
  );
  const count = Math.min(7, candidates.length);
  for (let i = 0; i < count; i++) {
    const rich = i < 2;
    tiles[candidates[i]].feature.cache = {
      taken: false,
      loot: rich
        ? { materials: rng.int(40, 70), metal: rng.int(20, 40), titanium: rng.int(2, 4) }
        : { materials: rng.int(20, 45), food: rng.int(15, 35), science: rng.int(10, 25) },
    };
  }
}

/** Roads radiate from every spawn towards the centre, forming contested lanes. */
function buildRoads(tiles: Record<HexId, Tile>, startPositions: Record<PlayerId, HexId>): void {
  for (const startHex of Object.values(startPositions)) {
    const line = hexLine(axialOf(startHex), CENTER);
    for (const step of line) {
      const id = hexId(step.q, step.r);
      const tile = tiles[id];
      if (!tile) continue;
      if (tile.terrain === 'water') continue;
      tile.road = true;
    }
  }
}
