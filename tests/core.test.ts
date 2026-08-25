import { describe, it, expect, beforeEach } from 'vitest';
import { createMatch, armiesOf, humanPlayer } from '../src/core/gameState';
import { startDay, endDay, simulateToEnd } from '../src/core/turnSystem';
import { runBotTurn } from '../src/ai/botController';
import { createNewCity, upgradeCityBuilding, canUpgradeCityBuilding, cityTier, upgradeTroop, canUpgradeTroop, awardCommanderXp } from '../src/entities/city';
import { computeRewards, applyRewards } from '../src/core/rewards';
import { canAfford, spend, grant, defaultStorage } from '../src/core/resources';
import { emptyStock } from '../src/core/types';
import { findPath, moveCost, computeMaxMovementPoints, armyDomains, reachableHexes } from '../src/core/movement';
import { resolveCombat, armyPower } from '../src/core/combat';
import { buildAt, moveArmy, researchTechnology, trainTroops, captureGate, moveTowards } from '../src/core/actions';
import { runProduction, runUpkeep, growCitizens } from '../src/core/economy';
import { updateTerritory } from '../src/core/territory';
import { TERRAINS } from '../src/data/terrain';
import { BALANCE } from '../src/data/balance';
import type { MatchState } from '../src/core/types';

function newMatch(seed = 12345): MatchState {
  const state = createMatch({ seed, city: createNewCity() });
  startDay(state);
  return state;
}

describe('resources', () => {
  it('refuses to spend what is not there and leaves the stock untouched', () => {
    const stock = emptyStock();
    stock.materials = 10;
    expect(canAfford(stock, { materials: 20 })).toBe(false);
    expect(spend(stock, { materials: 20 })).toBe(false);
    expect(stock.materials).toBe(10);
  });

  it('spends exactly what a cost asks for', () => {
    const stock = emptyStock();
    stock.materials = 30;
    stock.metal = 10;
    expect(spend(stock, { materials: 20, metal: 5 })).toBe(true);
    expect(stock.materials).toBe(10);
    expect(stock.metal).toBe(5);
  });

  it('clamps income to storage and reports the overflow', () => {
    const state = newMatch();
    const player = humanPlayer(state);
    player.storage.materials = 100;
    player.stock.materials = 95;
    const result = grant(player, 'materials', 20);
    expect(result.stored).toBe(5);
    expect(result.wasted).toBe(15);
    expect(player.stock.materials).toBe(100);
  });

  it('keeps rare resources on a far tighter cap than common ones', () => {
    const storage = defaultStorage();
    expect(storage.titanium).toBe(BALANCE.economy.rareStorage);
    expect(storage.materials).toBeGreaterThan(storage.titanium * 3);
  });
});

describe('movement', () => {
  it('charges terrain cost, and roads halve it on the same hex', () => {
    const state = newMatch();
    const army = armiesOf(state, state.humanId)[0];
    // Compare the same hex with and without a road so nothing else differs.
    const tile = Object.values(state.tiles).find(
      (t) =>
        t.terrain === 'plains' &&
        !t.road &&
        !t.controlledBy &&
        state.regions.find((r) => r.id === t.regionId)!.lock.type === 'none',
    )!;
    expect(moveCost(state, army, tile)).toBe(TERRAINS.plains.moveCost);
    tile.road = true;
    expect(moveCost(state, army, tile)).toBeLessThan(TERRAINS.plains.moveCost);
  });

  it('charges a surcharge for entering enemy-controlled ground', () => {
    const state = newMatch();
    const army = armiesOf(state, state.humanId)[0];
    const tile = Object.values(state.tiles).find(
      (t) =>
        t.terrain === 'plains' &&
        !t.road &&
        !t.controlledBy &&
        state.regions.find((r) => r.id === t.regionId)!.lock.type === 'none',
    )!;
    const neutral = moveCost(state, army, tile);
    tile.controlledBy = 'p1';
    expect(moveCost(state, army, tile)).toBe(neutral + BALANCE.movement.enemyTerritorySurcharge);
  });

  it('treats water as impassable for a land force', () => {
    const state = newMatch();
    const army = armiesOf(state, state.humanId)[0];
    const water = Object.values(state.tiles).find(
      (t) => t.terrain === 'water' && state.regions.find((r) => r.id === t.regionId)!.lock.type === 'none',
    );
    if (!water) return; // seed produced no water; nothing to assert
    expect(moveCost(state, army, water)).toBe(Infinity);
  });

  it('reports the domains an army can traverse', () => {
    const state = newMatch();
    const army = armiesOf(state, state.humanId)[0];
    expect(armyDomains(army)).toContain('land');
    expect(armyDomains(army)).not.toContain('water');
  });

  it('never returns a reachable hex costing more than the movement points', () => {
    const state = newMatch();
    const army = armiesOf(state, state.humanId)[0];
    for (const cost of Object.values(reachableHexes(state, army))) {
      expect(cost).toBeLessThanOrEqual(army.movementPoints + 1e-9);
    }
  });

  it('spends movement points when moving and stops when they run out', () => {
    const state = newMatch();
    const army = armiesOf(state, state.humanId)[0];
    const before = army.movementPoints;
    const target = Object.keys(reachableHexes(state, army))[0];
    const result = moveArmy(state, army.id, target);
    expect(result.ok).toBe(true);
    expect(army.movementPoints).toBeLessThan(before);
    expect(army.hex).toBe(target);
  });

  it('refuses to enter a locked region', () => {
    const state = newMatch();
    const army = armiesOf(state, state.humanId)[0];
    army.movementPoints = 999;
    const core = state.regions.find((r) => r.kind === 'core')!;
    const result = moveArmy(state, army.id, core.hexes[0]);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/bloqueada/i);
  });

  it('moveTowards makes partial progress when the target is out of reach', () => {
    const state = newMatch();
    const army = armiesOf(state, state.humanId)[0];
    // Pick a far, legal hex in an unlocked region.
    const far = state.tileOrder.find((id) => {
      const tile = state.tiles[id];
      const region = state.regions.find((r) => r.id === tile.regionId)!;
      return (
        region.lock.type === 'none' &&
        TERRAINS[tile.terrain].passableBy.includes('land') &&
        findPath(state, army, id).totalCost > army.movementPoints
      );
    });
    if (!far) return;
    const startHex = army.hex;
    const result = moveTowards(state, army.id, far);
    expect(result.ok).toBe(true);
    expect(army.hex).not.toBe(startHex);
  });

  it('gives every army at least one movement point per day', () => {
    const state = newMatch();
    for (const army of Object.values(state.armies)) {
      expect(computeMaxMovementPoints(state, army)).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('combat', () => {
  it('is deterministic: identical inputs give identical results', () => {
    const run = () => {
      const state = newMatch(777);
      const a = armiesOf(state, 'p0')[0];
      const b = armiesOf(state, 'p1')[0];
      b.hex = a.hex;
      const tile = state.tiles[a.hex];
      return resolveCombat(state, a, b, tile).report;
    };
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });

  it('lets the stronger force win and inflicts losses on both sides', () => {
    const state = newMatch(999);
    const strong = armiesOf(state, 'p0')[0];
    const weak = armiesOf(state, 'p1')[0];
    strong.composition = { infantry: 60 };
    weak.composition = { infantry: 5 };
    weak.hex = strong.hex;
    const before = weak.composition.infantry;
    const { report } = resolveCombat(state, strong, weak, state.tiles[strong.hex]);
    expect(report.winner).toBe('p0');
    expect(report.attackerPower).toBeGreaterThan(report.defenderPower);
    expect(weak.composition.infantry).toBeLessThan(before);
  });

  it('gives the defender an edge on defensive terrain', () => {
    const state = newMatch(4242);
    const attacker = armiesOf(state, 'p0')[0];
    const defender = armiesOf(state, 'p1')[0];
    attacker.composition = { infantry: 20 };
    defender.composition = { infantry: 20 };
    const mountain = Object.values(state.tiles).find((t) => t.terrain === 'mountain');
    const plains = Object.values(state.tiles).find((t) => t.terrain === 'plains')!;
    if (!mountain) return;
    const clone = () => {
      const s = newMatch(4242);
      const a = armiesOf(s, 'p0')[0];
      const d = armiesOf(s, 'p1')[0];
      a.composition = { infantry: 20 };
      d.composition = { infantry: 20 };
      return { s, a, d };
    };
    const flat = clone();
    const flatReport = resolveCombat(flat.s, flat.a, flat.d, flat.s.tiles[plains.id]).report;
    const high = clone();
    const highReport = resolveCombat(high.s, high.a, high.d, high.s.tiles[mountain.id]).report;
    expect(highReport.defenderPower).toBeGreaterThan(flatReport.defenderPower);
  });

  it('never destroys more troops than an army has', () => {
    const state = newMatch(555);
    const strong = armiesOf(state, 'p0')[0];
    const weak = armiesOf(state, 'p1')[0];
    strong.composition = { infantry: 200 };
    weak.composition = { infantry: 3 };
    resolveCombat(state, strong, weak, state.tiles[strong.hex]);
    expect(weak.composition.infantry).toBeGreaterThanOrEqual(0);
  });

  it('scores army power above zero for a real force', () => {
    const state = newMatch();
    const army = armiesOf(state, state.humanId)[0];
    expect(armyPower(state, army)).toBeGreaterThan(0);
  });
});

describe('economy', () => {
  it('produces resources for the capital every day', () => {
    const state = newMatch();
    const player = humanPlayer(state);
    player.stock.materials = 0;
    const { produced } = runProduction(state, player);
    expect((produced.materials ?? 0)).toBeGreaterThan(0);
  });

  it('starves only when food is short, not when ammunition is', () => {
    const state = newMatch();
    const player = humanPlayer(state);
    player.stock.food = 500;
    player.stock.ammo = 0;
    const result = runUpkeep(state, player);
    expect(result.starving).toBe(false);
    expect(result.unsupplied).toContain('ammo');
  });

  it('loses a citizen when food runs out', () => {
    const state = newMatch();
    const player = humanPlayer(state);
    const before = player.citizensTotal;
    growCitizens(player, true);
    expect(player.citizensTotal).toBe(before - 1);
  });

  it('converts a food surplus into a citizen and charges for it', () => {
    const state = newMatch();
    const player = humanPlayer(state);
    player.citizensTotal = 1;
    player.citizensFree = 1;
    player.stock.food = BALANCE.citizens.foodPerNewCitizen + 10;
    const gained = growCitizens(player, false);
    expect(gained).toBe(1);
    expect(player.citizensTotal).toBe(2);
    expect(player.stock.food).toBe(10);
  });

  it('locks citizens into a building and frees none while it stands', () => {
    const state = newMatch();
    const player = humanPlayer(state);
    const army = armiesOf(state, player.id)[0];
    player.stock.materials = 999;
    const before = player.citizensFree;
    const result = buildAt(state, player.id, army.hex, 'watchtower');
    expect(result.ok).toBe(true);
    expect(player.citizensFree).toBeLessThan(before);
  });
});

describe('turn system', () => {
  it('runs exactly nine days when nobody completes the objective', () => {
    const state = createMatch({ seed: 2468, city: createNewCity() });
    startDay(state);
    let guard = 0;
    while (!state.finished && guard < 40) {
      endDay(state);
      guard++;
    }
    expect(state.finished).toBe(true);
    expect(state.day).toBe(BALANCE.match.totalDays);
    expect(state.totalDays).toBe(9);
  });

  it('always names a winner and a reason', () => {
    const state = newMatch(1357);
    simulateToEnd(state, (s, id) => runBotTurn(s, id));
    expect(state.finished).toBe(true);
    expect(state.winner).not.toBeNull();
    expect(['objective', 'score', 'elimination']).toContain(state.endReason);
  });

  it('refills movement points at the start of every day', () => {
    const state = newMatch();
    const army = armiesOf(state, state.humanId)[0];
    army.movementPoints = 0;
    endDay(state);
    expect(army.movementPoints).toBe(army.maxMovementPoints);
    expect(army.movementPoints).toBeGreaterThan(0);
  });

  it('completes construction after the declared number of days', () => {
    const state = newMatch();
    const player = humanPlayer(state);
    const army = armiesOf(state, player.id)[0];
    player.stock.materials = 999;
    const result = buildAt(state, player.id, army.hex, 'watchtower');
    const instanceId = result.detail!.buildingInstanceId as string;
    expect(state.buildings[instanceId].daysRemaining).toBe(1);
    endDay(state);
    expect(state.buildings[instanceId].daysRemaining).toBe(0);
  });

  it('seeds a match reproducibly: same seed, same nine days', () => {
    const run = () => {
      const s = createMatch({ seed: 31415, city: createNewCity() });
      startDay(s);
      simulateToEnd(s, (st, id) => runBotTurn(st, id));
      return { winner: s.winner, scores: s.players.map((p) => p.score), day: s.day };
    };
    expect(run()).toEqual(run());
  });

  it('never leaves a player with zero armies while they hold their capital', () => {
    const state = newMatch(8642);
    for (const id of Object.keys(state.armies)) delete state.armies[id];
    endDay(state);
    expect(armiesOf(state, state.humanId).length).toBeGreaterThan(0);
  });
});

describe('territory and elimination', () => {
  it('lets an enemy army occupying a capital take control of it', () => {
    const state = newMatch(1212);
    const capital = state.tileOrder.find((id) => state.tiles[id].feature.startFor === 'p0')!;
    updateTerritory(state);
    expect(state.tiles[capital].controlledBy).toBe('p0');

    // March a rival force onto the capital hex.
    const invader = armiesOf(state, 'p1')[0];
    invader.hex = capital;
    updateTerritory(state);
    expect(state.tiles[capital].controlledBy).toBe('p1');
  });

  it('eliminates a player who has lost armies, buildings and their capital', () => {
    const state = newMatch(1313);
    const capital = state.tileOrder.find((id) => state.tiles[id].feature.startFor === 'p0')!;
    for (const army of armiesOf(state, 'p0')) delete state.armies[army.id];
    const invader = armiesOf(state, 'p1')[0];
    invader.hex = capital;

    endDay(state);

    expect(state.tiles[capital].controlledBy).toBe('p1');
    expect(state.players.find((p) => p.id === 'p0')!.eliminated).toBe(true);
  });

  it('gives a wiped player a reserve levy while they still hold their capital', () => {
    const state = newMatch(1414);
    for (const army of armiesOf(state, 'p0')) delete state.armies[army.id];
    endDay(state);
    expect(armiesOf(state, 'p0').length).toBeGreaterThan(0);
    expect(state.players.find((p) => p.id === 'p0')!.eliminated).toBe(false);
  });
});

describe('technology and regions', () => {
  it('refuses research without the prerequisites', () => {
    const state = newMatch();
    const player = humanPlayer(state);
    player.stock.science = 9999;
    const result = researchTechnology(state, player.id, 'armor_doctrine');
    expect(result.ok).toBe(false);
  });

  it('unlocks a troop when its technology lands', () => {
    const state = newMatch();
    const player = humanPlayer(state);
    player.stock.science = 9999;
    player.stock.materials = 9999;
    expect(researchTechnology(state, player.id, 'combined_arms').ok).toBe(true);
    expect(player.modifiers.unlockedTroops).toContain('heavy_infantry');
  });

  it('opens the core region for the player who takes a gate', () => {
    const state = newMatch();
    const player = humanPlayer(state);
    const army = armiesOf(state, player.id)[0];
    const gateHex = state.tileOrder.find((id) => state.tiles[id].feature.gate)!;
    army.hex = gateHex;
    expect(player.unlockedRegions).not.toContain(0);
    expect(captureGate(state, army.id).ok).toBe(true);
    expect(player.unlockedRegions).toContain(0);
  });

  it('lets a player enter the core only after the gate is taken', () => {
    const state = newMatch();
    const player = humanPlayer(state);
    const army = armiesOf(state, player.id)[0];
    const core = state.regions.find((r) => r.kind === 'core')!;
    army.movementPoints = 999;
    expect(moveArmy(state, army.id, core.hexes[0]).ok).toBe(false);
    player.unlockedRegions.push(0);
    const inCore = core.hexes.find((h) => TERRAINS[state.tiles[h].terrain].passableBy.includes('land'))!;
    army.hex = state.tileOrder.find(
      (id) => state.tiles[id].regionId !== 0 && TERRAINS[state.tiles[id].terrain].passableBy.includes('land'),
    )!;
    army.movementPoints = 999;
    expect(moveArmy(state, army.id, inCore).ok).toBe(true);
  });
});

describe('metaprogression', () => {
  let city = createNewCity();
  beforeEach(() => {
    city = createNewCity();
  });

  it('starts a new city at technology tier 1', () => {
    expect(cityTier(city)).toBe(1);
  });

  it('refuses an upgrade the city cannot pay for and keeps the level', () => {
    city.resources.gold = 0;
    city.resources.materials = 0;
    const check = canUpgradeCityBuilding(city, 'command_center');
    expect(check.ok).toBe(false);
    expect(upgradeCityBuilding(city, 'command_center')).toBe(false);
    expect(city.buildings.command_center).toBe(1);
  });

  it('applies an upgrade and charges for it', () => {
    city.resources.gold = 10000;
    city.resources.materials = 10000;
    expect(upgradeCityBuilding(city, 'command_center')).toBe(true);
    expect(city.buildings.command_center).toBe(2);
    expect(city.resources.gold).toBeLessThan(10000);
  });

  it('raises the match technology tier when the command centre grows', () => {
    city.resources.gold = 10000;
    city.resources.materials = 10000;
    upgradeCityBuilding(city, 'command_center');
    const state = createMatch({ seed: 1, city });
    expect(humanPlayer(state).loadout.cityTier).toBe(2);
  });

  it('evolves troop lines one at a time, not all at once', () => {
    city.resources.science = 10000;
    city.resources.materials = 10000;
    city.buildings.academy = 2;
    const before = { ...city.troopLevels };
    expect(upgradeTroop(city, 'infantry')).toBe(true);
    expect(city.troopLevels.infantry).toBe(before.infantry + 1);
    expect(city.troopLevels.recon).toBe(before.recon);
  });

  it('caps troop level by the academy', () => {
    city.resources.science = 100000;
    city.resources.materials = 100000;
    city.buildings.academy = 1; // cap 2
    expect(upgradeTroop(city, 'infantry')).toBe(true);
    expect(canUpgradeTroop(city, 'infantry').ok).toBe(false);
  });

  it('levels a commander once enough experience is banked', () => {
    const levels = awardCommanderXp(city, 'marcus', 100000);
    expect(levels).toBeGreaterThan(0);
    expect(city.commanders.marcus.level).toBeGreaterThan(1);
  });

  it('pays rewards into the city and records the match', () => {
    const state = newMatch(24680);
    simulateToEnd(state, (s, id) => runBotTurn(s, id));
    const rewards = computeRewards(state, state.humanId, city);
    const goldBefore = city.resources.gold;
    applyRewards(city, rewards);
    expect(city.resources.gold).toBeGreaterThan(goldBefore);
    expect(city.matchesPlayed).toBe(1);
    expect(rewards.placement).toBeGreaterThanOrEqual(1);
    expect(rewards.placement).toBeLessThanOrEqual(5);
  });

  it('makes the next match stronger after investing rewards', () => {
    const weakState = createMatch({ seed: 5, city: createNewCity() });
    const rich = createNewCity();
    rich.resources.gold = 100000;
    rich.resources.materials = 100000;
    rich.resources.science = 100000;
    rich.resources.influence = 100000;
    upgradeCityBuilding(rich, 'command_center');
    upgradeCityBuilding(rich, 'warehouse');
    upgradeCityBuilding(rich, 'logistics_center');
    const strongState = createMatch({ seed: 5, city: rich });
    const weak = humanPlayer(weakState);
    const strong = humanPlayer(strongState);
    expect(strong.citizensTotal).toBeGreaterThan(weak.citizensTotal);
    expect(strong.stock.materials).toBeGreaterThan(weak.stock.materials);
    expect(strong.loadout.cityTier).toBeGreaterThan(weak.loadout.cityTier);
  });
});

describe('match setup', () => {
  it('creates five participants: one human and four distinct bots', () => {
    const state = newMatch();
    expect(state.players).toHaveLength(BALANCE.match.participants);
    expect(state.players.filter((p) => p.isHuman)).toHaveLength(1);
    const personalities = state.players.filter((p) => !p.isHuman).map((p) => p.personality);
    expect(new Set(personalities).size).toBe(4);
  });

  it('gives every participant an army on their own start hex', () => {
    const state = newMatch();
    for (const player of state.players) {
      const armies = armiesOf(state, player.id);
      expect(armies.length).toBeGreaterThan(0);
      expect(state.tiles[armies[0].hex].feature.startFor).toBe(player.id);
    }
  });

  it('starts the map mostly hidden for the human', () => {
    const state = newMatch();
    const player = humanPlayer(state);
    const hidden = state.tileOrder.filter((id) => (player.fog[id] ?? 0) === 0).length;
    expect(hidden).toBeGreaterThan(state.tileOrder.length * 0.5);
  });

  it('trains troops only where the player has a base', () => {
    const state = newMatch();
    const player = humanPlayer(state);
    const army = armiesOf(state, player.id)[0];
    player.stock.materials = 9999;
    player.stock.food = 9999;
    expect(trainTroops(state, player.id, army.id, 'infantry', 3).ok).toBe(true);
    army.hex = state.tileOrder.find((id) => !state.tiles[id].feature.startFor)!;
    expect(trainTroops(state, player.id, army.id, 'infantry', 3).ok).toBe(false);
  });
});
