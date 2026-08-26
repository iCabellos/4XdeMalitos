import { describe, it, expect, beforeEach } from 'vitest';
import { createMatch, armiesOf, humanPlayer, createArmy } from '../src/core/gameState';
import { startDay, endDay, simulateToEnd } from '../src/core/turnSystem';
import { runBotTurn } from '../src/ai/botController';
import { createNewCity, upgradeCityBuilding, canUpgradeCityBuilding, cityTier, upgradeTroop, canUpgradeTroop, awardCommanderXp } from '../src/entities/city';
import { computeRewards, applyRewards } from '../src/core/rewards';
import { canAfford, spend, grant, defaultStorage } from '../src/core/resources';
import { emptyStock } from '../src/core/types';
import { neighborIds } from '../src/map/hex';
import {
  findPath,
  moveCost,
  computeMaxMovementPoints,
  armyDomains,
  reachableHexes,
  canCrossBetween,
} from '../src/core/movement';
import { resolveCombat, armyPower } from '../src/core/combat';
import {
  buildAt,
  moveArmy,
  moveUnits,
  moveTowards,
  researchTechnology,
  trainTroops,
  holdGate,
  activateFacility,
  assaultObjective,
  attackWithCommander,
  claimItem,
  offerTreaty,
  offerTribute,
  breakRelations,
} from '../src/core/actions';
import { runProduction, runUpkeep, growCitizens } from '../src/core/economy';
import { updateTerritory } from '../src/core/territory';
import { TERRAINS } from '../src/data/terrain';
import { BALANCE } from '../src/data/balance';
import { ZONES } from '../src/data/zones';
import { ITEMS } from '../src/data/items';
import { TECHNOLOGY_IDS } from '../src/data/technologies';
import { relationOf, adjustOpinion } from '../src/core/diplomacy';
import { availableTroops, troopLockReason } from '../src/core/technology';
import { trainingCapacity, canTrain } from '../src/core/economy';
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
    const home = state.tiles[army.hex];
    // Same region on both sides, so no wall is involved in the comparison.
    const tile = Object.values(state.tiles).find(
      (t) => t.regionId === home.regionId && t.terrain === 'plains' && !t.road && !t.controlledBy,
    )!;
    expect(moveCost(army, tile, tile)).toBe(TERRAINS.plains.moveCost);
    tile.road = true;
    expect(moveCost(army, tile, tile)).toBeLessThan(TERRAINS.plains.moveCost);
  });

  it('charges a surcharge for entering enemy-controlled ground', () => {
    const state = newMatch();
    const army = armiesOf(state, state.humanId)[0];
    const home = state.tiles[army.hex];
    const tile = Object.values(state.tiles).find(
      (t) => t.regionId === home.regionId && t.terrain === 'plains' && !t.road && !t.controlledBy,
    )!;
    const neutral = moveCost(army, tile, tile);
    tile.controlledBy = 'p1';
    expect(moveCost(army, tile, tile)).toBe(neutral + BALANCE.movement.enemyTerritorySurcharge);
  });

  it('treats water as impassable for a land force', () => {
    const state = newMatch();
    const army = armiesOf(state, state.humanId)[0];
    const home = state.tiles[army.hex];
    const water = Object.values(state.tiles).find(
      (t) => t.terrain === 'water' && t.regionId === home.regionId,
    );
    if (!water) return; // this seed produced no water in the home sector
    expect(moveCost(army, home, water)).toBe(Infinity);
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

  it('refuses to cross a wall into another sector while its gate is sealed', () => {
    const state = newMatch();
    const army = armiesOf(state, state.humanId)[0];
    army.movementPoints = 999;
    const home = state.tiles[army.hex];
    const elsewhere = state.tileOrder.find((id) => state.tiles[id].regionId !== home.regionId)!;
    const result = moveArmy(state, army.id, elsewhere);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/muro|puerta/i);
  });

  it('blocks a wall crossing even for a pure air formation', () => {
    const state = newMatch();
    const army = armiesOf(state, state.humanId)[0];
    // An all-air army ignores terrain, but not walls.
    army.composition = { drone: 10 };
    army.movementPoints = 999;
    const home = state.tiles[army.hex];
    const other = Object.values(state.tiles).find((t) => t.regionId !== home.regionId)!;
    expect(canCrossBetween(home, other)).toBe(false);
    expect(moveCost(army, home, other)).toBe(Infinity);
  });

  it('allows the crossing once the gate on that boundary has opened', () => {
    const state = newMatch();
    const army = armiesOf(state, state.humanId)[0];
    const home = state.tiles[army.hex];
    // Find a real gate leading out of the home sector.
    const gateHex = state.tileOrder.find((id) => {
      const gate = state.tiles[id].feature.gate;
      return !!gate && (gate.regionA === home.regionId || gate.regionB === home.regionId);
    })!;
    const gate = state.tiles[gateHex].feature.gate!;
    const otherRegion = gate.regionA === home.regionId ? gate.regionB : gate.regionA;
    const neighbourAcross = state.tileOrder.find((id) => {
      const t = state.tiles[id];
      if (t.regionId !== otherRegion) return false;
      return neighborIds(t.q, t.r).includes(gateHex);
    })!;

    expect(canCrossBetween(state.tiles[gateHex], state.tiles[neighbourAcross])).toBe(false);
    gate.open = true;
    expect(canCrossBetween(state.tiles[gateHex], state.tiles[neighbourAcross])).toBe(true);
  });

  it('moveTowards makes partial progress when the target is out of reach', () => {
    const state = newMatch();
    const army = armiesOf(state, state.humanId)[0];
    // Pick a far but legal hex inside our own sector.
    const home = state.tiles[army.hex];
    const far = state.tileOrder.find((id) => {
      const tile = state.tiles[id];
      return (
        tile.regionId === home.regionId &&
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

describe('technology', () => {
  it('refuses research without the prerequisites', () => {
    const state = newMatch();
    const player = humanPlayer(state);
    player.stock.science = 9999;
    expect(researchTechnology(state, player.id, 'armor_doctrine').ok).toBe(false);
  });

  it('unlocks a troop when its technology lands', () => {
    const state = newMatch();
    const player = humanPlayer(state);
    player.stock.science = 9999;
    player.stock.materials = 9999;
    expect(researchTechnology(state, player.id, 'combined_arms').ok).toBe(true);
    expect(player.modifiers.unlockedTroops).toContain('heavy_infantry');
  });
});

describe('gates on a clock', () => {
  it('opens zone-2 gates on their scheduled day, for everyone at once', () => {
    const state = newMatch(2468);
    const zone2Gates = () =>
      state.tileOrder
        .map((id) => state.tiles[id].feature.gate)
        .filter((g) => g && Math.max(g.zoneA, g.zoneB) === 2);

    expect(zone2Gates().every((g) => g!.open)).toBe(false);
    while (state.day < ZONES[2].gatesOpenOnDay && !state.finished) endDay(state);
    expect(state.day).toBe(ZONES[2].gatesOpenOnDay);
    expect(zone2Gates().every((g) => g!.open)).toBe(true);
  });

  it('keeps the core sealed until its own later day', () => {
    const state = newMatch(1357);
    while (state.day < ZONES[2].gatesOpenOnDay && !state.finished) endDay(state);
    const coreGates = state.tileOrder
      .map((id) => state.tiles[id].feature.gate)
      .filter((g) => g && Math.max(g.zoneA, g.zoneB) === 3);
    expect(coreGates.length).toBeGreaterThan(0);
    expect(coreGates.every((g) => g!.open)).toBe(false);
  });

  it('lets an army hold a gate without that opening it', () => {
    const state = newMatch();
    const player = humanPlayer(state);
    const army = armiesOf(state, player.id)[0];
    const gateHex = state.tileOrder.find((id) => state.tiles[id].feature.gate)!;
    army.hex = gateHex;
    const gate = state.tiles[gateHex].feature.gate!;
    expect(holdGate(state, army.id).ok).toBe(true);
    expect(gate.controlledBy).toBe(player.id);
    expect(gate.open).toBe(false);
  });
});

describe('objectives and items', () => {
  it('needs a real army to clear a garrison, and pays an item when it does', () => {
    const state = newMatch(4242);
    const player = humanPlayer(state);
    const army = armiesOf(state, player.id)[0];
    const hex = state.tileOrder.find((id) => state.tiles[id].feature.secondaryObjective)!;
    const objective = state.tiles[hex].feature.secondaryObjective!;
    army.hex = hex;

    // A token force loses and claims nothing.
    army.composition = { infantry: 2 };
    army.actedThisDay = false;
    assaultObjective(state, army.id);
    expect(objective.defeatedBy).toBeNull();
    expect(player.items).toHaveLength(0);

    // A real army clears it and takes the item.
    const winner = createArmy(state, player, hex, 'Fuerza de asalto');
    winner.composition = { tank: 80, heavy_infantry: 60, artillery: 40 };
    winner.actedThisDay = false;
    player.stock.ammo = 999;
    const result = assaultObjective(state, winner.id);
    expect(result.ok).toBe(true);
    expect(objective.defeatedBy).toBe(player.id);
    expect(player.items).toContain(objective.itemId);
  });

  it('applies an item buff to the player modifiers, and never stacks it twice', () => {
    const state = newMatch();
    const player = humanPlayer(state);
    const before = player.modifiers.attackMultiplier;
    claimItem(state, player.id, 'targeting_suite');
    const after = player.modifiers.attackMultiplier;
    expect(after).toBeGreaterThan(before);
    claimItem(state, player.id, 'targeting_suite');
    expect(player.modifiers.attackMultiplier).toBe(after);
    expect(player.items.filter((i) => i === 'targeting_suite')).toHaveLength(1);
  });

  it('awards the legendary core item for conquering the centre', () => {
    const state = newMatch();
    const player = humanPlayer(state);
    const army = armiesOf(state, player.id)[0];
    const core = state.tileOrder.find((id) => state.tiles[id].feature.mainObjective)!;
    army.hex = core;
    player.stock.energy = 500;
    // activateFacility on the core hex is the conquest.
    expect(activateFacility(state, army.id).ok).toBe(true);
    expect(player.items).toContain('core_of_x');
    expect(ITEMS.core_of_x.rarity).toBe('legendario');
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

describe('orders', () => {
  it('moves the whole army when every unit is selected, keeping its identity', () => {
    const state = newMatch();
    const player = humanPlayer(state);
    const army = armiesOf(state, player.id)[0];
    const before = Object.keys(state.armies).length;
    const target = Object.keys(reachableHexes(state, army))[0];
    const result = moveUnits(state, player.id, army.id, { ...army.composition }, target);
    expect(result.ok).toBe(true);
    expect(Object.keys(state.armies)).toHaveLength(before);
    expect(state.armies[army.id].hex).toBe(target);
  });

  it('splits a detachment when only some units are selected', () => {
    const state = newMatch();
    const player = humanPlayer(state);
    const army = armiesOf(state, player.id)[0];
    army.composition = { infantry: 10, recon: 4 };
    const before = Object.keys(state.armies).length;
    const target = Object.keys(reachableHexes(state, army))[0];
    const result = moveUnits(state, player.id, army.id, { recon: 2 }, target);
    expect(result.ok).toBe(true);
    expect(result.detail?.detached).toBe(true);
    expect(Object.keys(state.armies)).toHaveLength(before + 1);
    // The parent keeps the rest.
    expect(state.armies[army.id].composition.recon).toBe(2);
    expect(state.armies[army.id].composition.infantry).toBe(10);
  });

  it('refuses to move units the army does not have', () => {
    const state = newMatch();
    const player = humanPlayer(state);
    const army = armiesOf(state, player.id)[0];
    const target = Object.keys(reachableHexes(state, army))[0];
    expect(moveUnits(state, player.id, army.id, { tank: 99 }, target).ok).toBe(false);
  });

  it('puts the named commander in charge before attacking with them', () => {
    const state = newMatch(999);
    const player = humanPlayer(state);
    player.commanders = ['marcus', 'koval'];
    const army = armiesOf(state, player.id)[0];
    army.commanderId = 'marcus';
    army.composition = { infantry: 40 };

    const enemy = armiesOf(state, 'p1')[0];
    // Melee range is one hex, so the target has to be a neighbour.
    const home = state.tiles[army.hex];
    const target = neighborIds(home.q, home.r).find((id) => state.tiles[id])!;
    enemy.hex = target;
    enemy.composition = { infantry: 5 };

    const result = attackWithCommander(state, player.id, army.id, target, 'koval');
    expect(result.ok).toBe(true);
    expect(state.armies[army.id]?.commanderId).toBe('koval');
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

  it('starts each player sealed inside their own sector', () => {
    const state = newMatch();
    const player = humanPlayer(state);
    const army = armiesOf(state, player.id)[0];
    const home = state.tiles[army.hex];
    expect(player.homeRegion).toBe(home.regionId);
    // Everything reachable on day one is inside the home sector.
    for (const hex of Object.keys(reachableHexes(state, army))) {
      expect(state.tiles[hex].regionId).toBe(home.regionId);
    }
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

describe('diplomacy', () => {
  it('starts everyone neutral with no opinion', () => {
    const state = newMatch();
    for (const player of state.players) {
      for (const other of state.players) {
        if (other.id === player.id) continue;
        expect(relationOf(player, other.id).stance).toBe('neutral');
        expect(relationOf(player, other.id).opinion).toBe(0);
      }
    }
  });

  it('refuses a pact from someone who has done nothing to earn it', () => {
    const state = newMatch();
    const result = offerTreaty(state, state.humanId, 'p1', 'nonAggression');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/confianza/i);
  });

  it('lets tribute buy the goodwill a pact needs', () => {
    const state = newMatch();
    const human = humanPlayer(state);
    human.stock.titanium = 40;
    // Titanium is weighted heavily, so a serious gift moves the needle.
    for (let i = 0; i < 3; i++) offerTribute(state, human.id, 'p1', { titanium: 8 });
    const bot = state.players.find((p) => p.id === 'p1')!;
    expect(relationOf(bot, human.id).opinion).toBeGreaterThan(20);
    expect(offerTreaty(state, human.id, 'p1', 'nonAggression').ok).toBe(true);
    expect(relationOf(bot, human.id).stance).toBe('nonAggression');
  });

  it('moves the goods for real when tribute is sent', () => {
    const state = newMatch();
    const human = humanPlayer(state);
    const bot = state.players.find((p) => p.id === 'p1')!;
    human.stock.materials = 200;
    const botBefore = bot.stock.materials;
    offerTribute(state, human.id, 'p1', { materials: 100 });
    expect(human.stock.materials).toBe(100);
    expect(bot.stock.materials).toBeGreaterThan(botBefore);
  });

  it('refuses tribute the player cannot pay', () => {
    const state = newMatch();
    const human = humanPlayer(state);
    human.stock.titanium = 1;
    expect(offerTribute(state, human.id, 'p1', { titanium: 50 }).ok).toBe(false);
  });

  it('turns an attack into a war and costs standing', () => {
    const state = newMatch(999);
    const human = humanPlayer(state);
    const army = armiesOf(state, human.id)[0];
    army.composition = { infantry: 40 };
    const enemy = armiesOf(state, 'p1')[0];
    const home = state.tiles[army.hex];
    const target = neighborIds(home.q, home.r).find((id) => state.tiles[id])!;
    enemy.hex = target;
    enemy.composition = { infantry: 5 };

    attackWithCommander(state, human.id, army.id, target, null);
    const bot = state.players.find((p) => p.id === 'p1')!;
    expect(relationOf(bot, human.id).stance).toBe('war');
    expect(relationOf(bot, human.id).opinion).toBeLessThan(0);
  });

  it('makes breaking a signed pact cost standing with everyone watching', () => {
    const state = newMatch(4242);
    const human = humanPlayer(state);
    human.stock.titanium = 100;
    for (let i = 0; i < 3; i++) offerTribute(state, human.id, 'p1', { titanium: 8 });
    expect(offerTreaty(state, human.id, 'p1', 'nonAggression').ok).toBe(true);

    const bystanderBefore = relationOf(
      state.players.find((p) => p.id === 'p2')!,
      human.id,
    ).opinion;

    breakRelations(state, human.id, 'p1');

    const bystanderAfter = relationOf(
      state.players.find((p) => p.id === 'p2')!,
      human.id,
    ).opinion;
    expect(bystanderAfter).toBeLessThan(bystanderBefore);
  });

  it('lets grudges fade a little each day rather than poisoning the match', () => {
    const state = newMatch();
    adjustOpinion(state, 'p1', state.humanId, -50);
    const before = relationOf(state.players.find((p) => p.id === 'p1')!, state.humanId).opinion;
    endDay(state);
    const after = relationOf(state.players.find((p) => p.id === 'p1')!, state.humanId).opinion;
    expect(after).toBeGreaterThan(before);
  });
});

describe('barracks-driven recruitment', () => {
  it('offers only what the barracks has unlocked', () => {
    const state = newMatch();
    const player = humanPlayer(state);
    player.loadout.barracksLevel = 1;
    const roster = availableTroops(player);
    expect(roster).toContain('infantry');
    expect(roster).toContain('recon');
    expect(roster).not.toContain('tank');
    expect(troopLockReason(player, 'tank')).toMatch(/Cuartel nivel 4/);
  });

  it('opens new troops as the barracks grows', () => {
    const state = newMatch();
    const player = humanPlayer(state);
    player.loadout.barracksLevel = 5;
    // Tech-gated troops still need their doctrine.
    expect(availableTroops(player)).not.toContain('tank');
    player.technologies = [...TECHNOLOGY_IDS];
    expect(availableTroops(player)).toContain('tank');
    expect(availableTroops(player)).toContain('frigate');
  });

  it('caps the whole contingent, not each army separately', () => {
    const state = newMatch();
    const player = humanPlayer(state);
    const army = armiesOf(state, player.id)[0];
    player.stock.materials = 99999;
    player.stock.food = 99999;
    const capacity = trainingCapacity(state, player);
    // Fill the pool, then verify one more soldier is refused.
    army.composition = { infantry: capacity };
    const check = canTrain(state, player, army, 'infantry', 1);
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/Contingente completo/);
  });
});
