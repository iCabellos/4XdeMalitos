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

const PLAYERS = ['p0', 'p1', 'p2', 'p3', 'p4'];

describe('hex math', () => {
  it('round-trips world <-> hex for every tile on the map', () => {
    for (const a of hexMapShape(7)) {
      const w = hexToWorld(a.q, a.r);
      const back = worldToHex(w.x, w.z);
      expect(back).toEqual(a);
    }
  });

  it('reports distance 1 for all six neighbours', () => {
    for (const id of neighborIds(3, -2)) {
      expect(hexDistance(axialOf(id), { q: 3, r: -2 })).toBe(1);
    }
  });

  it('produces the expected tile count for a hexagonal map', () => {
    // 1 + 3*R*(R+1)
    expect(hexMapShape(7).length).toBe(1 + 3 * 7 * 8);
  });
});

describe('map generation', () => {
  it('is deterministic for a given seed', () => {
    const a = generateMap(847392, PLAYERS);
    const b = generateMap(847392, PLAYERS);
    expect(JSON.stringify(a.tiles)).toBe(JSON.stringify(b.tiles));
    expect(a.startPositions).toEqual(b.startPositions);
    expect(a.gateHexes).toEqual(b.gateHexes);
  });

  it('produces different maps for different seeds', () => {
    const a = generateMap(1, PLAYERS);
    const b = generateMap(2, PLAYERS);
    expect(JSON.stringify(a.tiles)).not.toBe(JSON.stringify(b.tiles));
  });

  it('assigns every tile to a region', () => {
    const map = generateMap(999, PLAYERS);
    for (const id of map.tileOrder) {
      expect(map.tiles[id].regionId).toBeGreaterThanOrEqual(0);
    }
  });

  it('gives each of the five players a distinct, land, reachable start', () => {
    const map = generateMap(4242, PLAYERS);
    const starts = Object.values(map.startPositions);
    expect(new Set(starts).size).toBe(5);
    for (const s of starts) {
      const tile = map.tiles[s];
      expect(tile).toBeDefined();
      expect(TERRAINS[tile.terrain].passableBy).toContain('land');
      expect(hexDistance(tile, { q: 0, r: 0 })).toBeLessThanOrEqual(BALANCE.match.mapRadius);
    }
  });

  it('places the main objective at the centre inside the locked core', () => {
    const map = generateMap(31337, PLAYERS);
    expect(map.mainObjectiveHex).toBe(hexId(0, 0));
    expect(map.tiles[map.mainObjectiveHex].regionId).toBe(0);
    expect(map.regions[0].kind).toBe('core');
  });

  it('guards the core with gates that sit just outside it and are land-passable', () => {
    const map = generateMap(555, PLAYERS);
    expect(map.gateHexes.length).toBeGreaterThan(0);
    for (const g of map.gateHexes) {
      const tile = map.tiles[g];
      expect(hexDistance(tile, { q: 0, r: 0 })).toBe(BALANCE.match.coreRadius + 1);
      expect(tile.feature.gate?.regionId).toBe(0);
      expect(TERRAINS[tile.terrain].passableBy).toContain('land');
    }
  });

  it('keeps rare resources scarce', () => {
    const map = generateMap(2024, PLAYERS);
    const rares = map.tileOrder.filter((id) => {
      const n = map.tiles[id].node?.nodeId;
      return n === 'titaniumDeposit' || n === 'uraniumDeposit' || n === 'crystalDeposit';
    });
    // Few enough that five players cannot all be satisfied.
    expect(rares.length).toBeGreaterThanOrEqual(6);
    expect(rares.length).toBeLessThanOrEqual(12);
  });

  it('guarantees each player food, wood and metal within two hexes of spawn', () => {
    const map = generateMap(70707, PLAYERS);
    for (const start of Object.values(map.startPositions)) {
      const origin = axialOf(start);
      const near = map.tileOrder.filter(
        (id) => hexDistance(map.tiles[id], origin) <= 2 && map.tiles[id].node,
      );
      const nodeIds = new Set(near.map((id) => map.tiles[id].node!.nodeId));
      expect(nodeIds.has('farmland')).toBe(true);
      expect(nodeIds.has('timber')).toBe(true);
      expect(nodeIds.has('ironVein')).toBe(true);
    }
  });

  it('builds roads linking every spawn towards the centre', () => {
    const map = generateMap(8080, PLAYERS);
    const roads = map.tileOrder.filter((id) => map.tiles[id].road);
    expect(roads.length).toBeGreaterThan(10);
  });
});
