import { describe, it, expect } from 'vitest';
import { generateMap } from '../src/map/mapGeneration';
import {
  hexDistance,
  hexId,
  axialOf,
  hexMapShape,
  worldToHex,
  hexToWorld,
  neighborIds,
} from '../src/map/hex';
import { BALANCE } from '../src/data/balance';
import { TERRAINS } from '../src/data/terrain';
import { ZONES, zoneForRing } from '../src/data/zones';

const PLAYERS = ['p0', 'p1', 'p2', 'p3', 'p4'];
const CENTER = { q: 0, r: 0 };

describe('hex math', () => {
  it('round-trips world <-> hex for every tile on the map', () => {
    for (const a of hexMapShape(BALANCE.match.mapRadius)) {
      const w = hexToWorld(a.q, a.r);
      expect(worldToHex(w.x, w.z)).toEqual(a);
    }
  });

  it('reports distance 1 for all six neighbours', () => {
    for (const id of neighborIds(3, -2)) {
      expect(hexDistance(axialOf(id), { q: 3, r: -2 })).toBe(1);
    }
  });
});

describe('zone layout', () => {
  it('assigns every ring to exactly one zone, covering the whole radius', () => {
    for (let ring = 0; ring <= BALANCE.match.mapRadius; ring++) {
      const zone = zoneForRing(ring);
      expect([1, 2, 3]).toContain(zone);
      expect(ring).toBeGreaterThanOrEqual(ZONES[zone].innerRing);
      expect(ring).toBeLessThanOrEqual(ZONES[zone].outerRing);
    }
  });

  it('places every tile in the zone its ring belongs to', () => {
    const map = generateMap(847392, PLAYERS);
    for (const id of map.tileOrder) {
      const tile = map.tiles[id];
      expect(tile.zone).toBe(zoneForRing(tile.ring));
      expect(tile.ring).toBe(hexDistance(tile, CENTER));
    }
  });

  it('divides each zone into the declared number of sectors', () => {
    const map = generateMap(2024, PLAYERS);
    for (const zone of [1, 2, 3] as const) {
      const sectors = new Set(
        map.regions.filter((r) => r.zone === zone).map((r) => r.sector),
      );
      expect(sectors.size).toBe(ZONES[zone].sectors);
    }
  });

  it('gives every region at least one hex', () => {
    const map = generateMap(555, PLAYERS);
    for (const region of map.regions) {
      expect(region.hexes.length).toBeGreaterThan(0);
    }
  });
});

describe('map generation', () => {
  it('is deterministic for a given seed', () => {
    const a = generateMap(847392, PLAYERS);
    const b = generateMap(847392, PLAYERS);
    expect(JSON.stringify(a.tiles)).toBe(JSON.stringify(b.tiles));
    expect(a.startPositions).toEqual(b.startPositions);
  });

  it('produces different maps for different seeds', () => {
    expect(JSON.stringify(generateMap(1, PLAYERS).tiles)).not.toBe(
      JSON.stringify(generateMap(2, PLAYERS).tiles),
    );
  });

  it('gives each of the five players their own zone-1 sector', () => {
    const map = generateMap(4242, PLAYERS);
    const starts = Object.values(map.startPositions);
    expect(new Set(starts).size).toBe(5);
    const regions = starts.map((s) => map.tiles[s].regionId);
    expect(new Set(regions).size).toBe(5);
    for (const s of starts) {
      const tile = map.tiles[s];
      expect(tile.zone).toBe(1);
      expect(TERRAINS[tile.terrain].passableBy).toContain('land');
    }
  });

  it('places the core objective at the centre of zone 3', () => {
    const map = generateMap(31337, PLAYERS);
    expect(map.mainObjectiveHex).toBe(hexId(0, 0));
    expect(map.tiles[map.mainObjectiveHex].zone).toBe(3);
  });
});

describe('walls and gates', () => {
  it('cuts gates only between different regions, and makes both sides walkable', () => {
    const map = generateMap(8080, PLAYERS);
    expect(map.gateHexes.length).toBeGreaterThan(0);
    for (const g of map.gateHexes) {
      const tile = map.tiles[g];
      const gate = tile.feature.gate!;
      expect(gate).toBeDefined();
      expect(gate.regionA).not.toBe(gate.regionB);
      expect(TERRAINS[tile.terrain].passableBy).toContain('land');
      // The gate hex belongs to one of the two regions it joins.
      expect([gate.regionA, gate.regionB]).toContain(tile.regionId);
    }
  });

  it('gives every zone-1 sector at least one way out', () => {
    for (const seed of [1, 77, 909, 31337]) {
      const map = generateMap(seed, PLAYERS);
      for (const region of map.regions.filter((r) => r.zone === 1)) {
        expect(region.connections.length).toBeGreaterThan(0);
      }
    }
  });

  it('connects every zone-2 sector to the core', () => {
    for (const seed of [5, 500, 5000]) {
      const map = generateMap(seed, PLAYERS);
      const core = map.regions.find((r) => r.zone === 3)!;
      for (const region of map.regions.filter((r) => r.zone === 2)) {
        expect(region.connections).toContain(core.id);
      }
    }
  });

  it('seals every gate until its scheduled day', () => {
    const map = generateMap(606, PLAYERS);
    for (const g of map.gateHexes) {
      const gate = map.tiles[g].feature.gate!;
      const zone = Math.max(gate.zoneA, gate.zoneB) as 2 | 3;
      expect(gate.opensOnDay).toBe(ZONES[zone].gatesOpenOnDay);
      expect(gate.open).toBe(false);
    }
  });

  it('opens zone 2 before zone 3', () => {
    expect(ZONES[2].gatesOpenOnDay).toBeLessThan(ZONES[3].gatesOpenOnDay);
    expect(ZONES[2].gatesOpenOnDay).toBeGreaterThan(0);
  });
});

describe('zone contents', () => {
  it('keeps rare resources out of zone 1 entirely', () => {
    for (const seed of [11, 222, 3333]) {
      const map = generateMap(seed, PLAYERS);
      const rareInZone1 = map.tileOrder.filter((id) => {
        const tile = map.tiles[id];
        const node = tile.node?.nodeId ?? '';
        return tile.zone === 1 && node.endsWith('Deposit');
      });
      expect(rareInZone1).toHaveLength(0);
    }
  });

  it('makes core rare deposits richer than the zone-2 seams', () => {
    const map = generateMap(4242, PLAYERS);
    const richness = (zone: number) =>
      map.tileOrder
        .filter((id) => map.tiles[id].zone === zone && map.tiles[id].node?.nodeId.endsWith('Deposit'))
        .map((id) => map.tiles[id].node!.richness);
    const core = richness(3);
    const belt = richness(2);
    expect(core.length).toBeGreaterThan(0);
    expect(belt.length).toBeGreaterThan(0);
    expect(Math.max(...core)).toBeGreaterThan(Math.max(...belt));
  });

  it('makes zone-2 common nodes richer than zone-1 ones', () => {
    const map = generateMap(707, PLAYERS);
    const common = (zone: number) =>
      map.tileOrder
        .filter((id) => map.tiles[id].zone === zone && map.tiles[id].node && !map.tiles[id].node!.nodeId.endsWith('Deposit'))
        .map((id) => map.tiles[id].node!.richness);
    expect(Math.max(...common(2))).toBeGreaterThan(Math.max(...common(1)));
  });

  it('puts one garrisoned objective in every zone-2 sector', () => {
    const map = generateMap(1234, PLAYERS);
    const zone2 = map.regions.filter((r) => r.zone === 2);
    for (const region of zone2) {
      const found = region.hexes.filter((id) => map.tiles[id].feature.secondaryObjective);
      expect(found).toHaveLength(1);
      const objective = map.tiles[found[0]].feature.secondaryObjective!;
      expect(Object.values(objective.garrison).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
      expect(objective.defeatedBy).toBeNull();
    }
  });

  it('gives every spawn food, timber and metal inside its own sector', () => {
    const map = generateMap(70707, PLAYERS);
    for (const start of Object.values(map.startPositions)) {
      const regionId = map.tiles[start].regionId;
      const nodes = new Set(
        map.regions
          .find((r) => r.id === regionId)!
          .hexes.filter((id) => map.tiles[id].node)
          .map((id) => map.tiles[id].node!.nodeId),
      );
      expect(nodes.has('farmland')).toBe(true);
      expect(nodes.has('timber')).toBe(true);
      expect(nodes.has('ironVein')).toBe(true);
    }
  });

  it('never lays a road across a wall', () => {
    const map = generateMap(9090, PLAYERS);
    for (const id of map.tileOrder) {
      if (!map.tiles[id].road) continue;
      const tile = map.tiles[id];
      // A road tile must connect to another road tile in its own region, or be
      // a gate: roads are lanes inside a sector, never tunnels through walls.
      const sameRegionRoad = neighborIds(tile.q, tile.r).some(
        (nId) => map.tiles[nId]?.road && map.tiles[nId].regionId === tile.regionId,
      );
      expect(sameRegionRoad || !!tile.feature.gate).toBe(true);
    }
  });
});
