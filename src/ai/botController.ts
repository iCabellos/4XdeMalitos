/**
 * Bot driver. Every decision goes through the same action API the human UI
 * uses, so replacing a bot with a networked player later is a matter of routing
 * commands from elsewhere, not rewriting the match.
 */
import { hexDistanceId, type HexId } from '../map/hex';
import { mapBuildingDef, type MapBuildingId } from '../data/buildings.map';
import { troopDef } from '../data/troops';
import { BALANCE } from '../data/balance';
import { RESEARCH_PRIORITY, STRATEGIES, TROOP_PRIORITY } from './strategies';
import { bestOf, scoreDestination, type ScoredHex } from './decisionSystem';
import {
  activateFacility,
  attack,
  buildAt,
  assaultObjective,
  holdGate,
  captureHex,
  effectiveArmySlots,
  enemyArmiesAt,
  gather,
  moveTowards,
  proposeNonAggression,
  researchTechnology,
  splitArmy,
  trainTroops,
} from '../core/actions';
import { canBuild } from '../core/construction';
import { canTrain } from '../core/economy';
import { checkTechnology, availableMapBuildings } from '../core/technology';
import { armyPower } from '../core/combat';
import { armySize, reachableHexes } from '../core/movement';
import { armiesOf, matchRng, playerById, saveRng } from '../core/gameState';
import { findMainObjectiveHex } from '../core/objectives';
import type { MatchState, MatchPlayer, PlayerId } from '../core/types';

export function runBotTurn(state: MatchState, botId: PlayerId): void {
  const player = playerById(state, botId);
  if (!player.personality || player.eliminated) return;
  const weights = STRATEGIES[player.personality];
  const rng = matchRng(state);

  botResearch(state, player);
  botDiplomacy(state, player, rng.next());
  botTrain(state, player);

  // Armies act in a stable order so a replay of the same seed is identical.
  const armies = armiesOf(state, botId).sort((a, b) => a.id.localeCompare(b.id));
  for (const army of armies) {
    if (!state.armies[army.id]) continue; // destroyed mid-turn
    botArmyTurn(state, player, army.id, weights);
  }

  botExpandArmies(state, player);
  saveRng(state, rng);
}

function botResearch(state: MatchState, player: MatchPlayer): void {
  if (!player.personality) return;
  const priority = RESEARCH_PRIORITY[player.personality];
  // One technology per day at most: bots should not out-tech the player by volume.
  for (const techId of priority) {
    if (player.technologies.includes(techId)) continue;
    if (!checkTechnology(player, techId).available) continue;
    researchTechnology(state, player.id, techId);
    return;
  }
}

/** Diplomatic bots seek pacts; the human's city can push them into one. */
function botDiplomacy(state: MatchState, player: MatchPlayer, roll: number): void {
  if (!player.personality) return;
  const weights = STRATEGIES[player.personality];
  if (weights.diplomacy < 1) return;
  const human = state.players.find((p) => p.isHuman);
  if (!human || human.eliminated) return;
  if (player.nonAggression.includes(human.id)) return;

  const chance = 0.25 * weights.diplomacy + human.loadout.diplomacyPressure;
  if (roll > chance) return;
  // Only propose once the two are actually near each other.
  const contact = armiesOf(state, player.id).some((a) =>
    armiesOf(state, human.id).some((h) => hexDistanceId(a.hex, h.hex) <= 4),
  );
  if (!contact) return;
  proposeNonAggression(state, player.id, human.id, true);
}

function botTrain(state: MatchState, player: MatchPlayer): void {
  if (!player.personality) return;
  const weights = STRATEGIES[player.personality];
  const armies = armiesOf(state, player.id);
  // Train at the capital or a forward base: pick the army sitting on one.
  const trainable = armies.find((a) => {
    const tile = state.tiles[a.hex];
    if (!tile) return false;
    if (tile.feature.startFor === player.id) return true;
    const building = tile.buildingId ? state.buildings[tile.buildingId] : null;
    return !!building && building.owner === player.id && building.buildingId === 'military_base';
  });
  if (!trainable) return;

  const budget = Math.max(1, Math.round(weights.military * 4));
  for (const troopId of TROOP_PRIORITY[player.personality]) {
    let count = budget;
    while (count > 0) {
      if (canTrain(state, player, trainable, troopId, count).ok) {
        trainTroops(state, player.id, trainable.id, troopId, count);
        return;
      }
      count--;
    }
  }
}

function botArmyTurn(
  state: MatchState,
  player: MatchPlayer,
  armyId: string,
  weights: ReturnType<() => (typeof STRATEGIES)['military']>,
): void {
  let army = state.armies[armyId];
  if (!army || armySize(army) <= 0) return;

  // 1. Act on whatever is under our feet before moving on.
  if (resolveOnSiteActions(state, player, armyId)) {
    army = state.armies[armyId];
    if (!army) return;
  }

  // 2. Attack an adjacent enemy when the numbers justify it.
  if (tryAttack(state, player, armyId, weights.aggression)) {
    army = state.armies[armyId];
    if (!army) return;
  }

  // 3. Otherwise move towards the best-scoring reachable hex.
  const reachable = reachableHexes(state, army);
  const candidates: ScoredHex[] = [];
  const hexes = Object.keys(reachable).slice(0, BALANCE.bots.searchBudget);
  for (const hex of hexes) {
    candidates.push(scoreDestination(state, player, army, hex, weights));
  }
  // Also consider a handful of known high-value hexes further away, so a bot
  // will commit to a multi-day march instead of only ever taking a step.
  for (const hex of strategicTargets(state, player)) {
    if (reachable[hex] !== undefined) continue;
    candidates.push(scoreDestination(state, player, army, hex, weights));
  }

  const best = bestOf(candidates);
  if (!best || best.score <= 0) return;
  // moveTowards, not moveArmy: the best target is often several days away.
  moveTowards(state, armyId, best.hex);

  army = state.armies[armyId];
  if (!army) return;
  resolveOnSiteActions(state, player, armyId);
  tryAttack(state, player, armyId, weights.aggression);
  botBuildHere(state, player, armyId);
}

/** Gates, facilities and gathering: things done by standing somewhere. */
function resolveOnSiteActions(state: MatchState, player: MatchPlayer, armyId: string): boolean {
  const army = state.armies[armyId];
  if (!army) return false;
  const tile = state.tiles[army.hex];
  if (!tile) return false;
  let acted = false;

  // Sitting on a gate marks it as ours and puts us through the moment it opens.
  if (tile.feature.gate && tile.feature.gate.controlledBy !== player.id) {
    if (holdGate(state, armyId).ok) acted = true;
  }
  // Only assault a garrison we can plausibly beat: losing the army here is worse
  // than never trying.
  const secondary = tile.feature.secondaryObjective;
  if (secondary && !secondary.defeatedBy && !army.actedThisDay) {
    const garrison = Object.values(secondary.garrison).reduce((a, b) => a + b, 0);
    if (armySize(army) > garrison * 1.4) {
      if (assaultObjective(state, armyId).ok) acted = true;
    }
  }
  if (tile.feature.facility && tile.feature.facility.owner !== player.id) {
    if (activateFacility(state, armyId).ok) acted = true;
  }
  if (tile.node && tile.node.remaining > 0 && !tile.buildingId) {
    if (gather(state, armyId).ok) acted = true;
  }
  return acted;
}

function tryAttack(
  state: MatchState,
  player: MatchPlayer,
  armyId: string,
  aggression: number,
): boolean {
  const army = state.armies[armyId];
  if (!army || army.actedThisDay) return false;
  const myPower = armyPower(state, army);
  if (myPower <= 0) return false;

  const maxRange = Math.max(
    1,
    ...Object.entries(army.composition)
      .filter(([, c]) => c > 0)
      .map(([id]) => troopDef(id).range),
  );

  let bestTarget: { hex: HexId; ratio: number } | null = null;
  for (const other of Object.values(state.armies)) {
    if (other.owner === army.owner || armySize(other) <= 0) continue;
    if (player.nonAggression.includes(other.owner)) continue;
    const distance = hexDistanceId(army.hex, other.hex);
    if (distance > maxRange) continue;
    const theirPower = armyPower(state, other);
    const ratio = theirPower > 0 ? myPower / theirPower : 5;
    const threshold = BALANCE.bots.attackPowerRatio / Math.max(0.5, aggression);
    if (ratio < threshold) continue;
    if (!bestTarget || ratio > bestTarget.ratio) bestTarget = { hex: other.hex, ratio };
  }
  if (!bestTarget) {
    // Nothing to fight, but an undefended enemy hex next door is worth taking.
    return tryCaptureAdjacent(state, player, armyId);
  }
  return attack(state, armyId, bestTarget.hex).ok;
}

function tryCaptureAdjacent(state: MatchState, player: MatchPlayer, armyId: string): boolean {
  const army = state.armies[armyId];
  if (!army || army.movementPoints < 1) return false;
  const neighbors = Object.keys(reachableHexes(state, army)).filter(
    (hex) => hexDistanceId(army.hex, hex) === 1,
  );
  for (const hex of neighbors) {
    const tile = state.tiles[hex];
    if (!tile || !tile.controlledBy || tile.controlledBy === player.id) continue;
    if (enemyArmiesAt(state, hex, player.id).length > 0) continue;
    if (captureHex(state, armyId, hex).ok) return true;
  }
  return false;
}

/** Builds on the hex the army occupies, choosing the highest-value option. */
function botBuildHere(state: MatchState, player: MatchPlayer, armyId: string): void {
  const army = state.armies[armyId];
  if (!army) return;
  const tile = state.tiles[army.hex];
  if (!tile || tile.buildingId || player.citizensFree <= 0) return;

  const options = availableMapBuildings(player) as MapBuildingId[];
  // Prefer node exploitation, then vision/territory structures.
  const ranked = options
    .filter((id) => id !== 'road')
    .sort((a, b) => buildPriority(state, player, b, army.hex) - buildPriority(state, player, a, army.hex));

  for (const buildingId of ranked) {
    if (buildPriority(state, player, buildingId, army.hex) <= 0) continue;
    if (!canBuild(state, player, tile, buildingId).ok) continue;
    buildAt(state, player.id, army.hex, buildingId);
    return;
  }
}

function buildPriority(
  state: MatchState,
  player: MatchPlayer,
  buildingId: MapBuildingId,
  hex: HexId,
): number {
  const tile = state.tiles[hex];
  if (!tile) return 0;
  const def = mapBuildingDef(buildingId);
  if (def.requiresNode) {
    if (!tile.node || !def.requiresNode.includes(tile.node.nodeId)) return 0;
    return buildingId === 'rare_extractor' ? 100 : 60;
  }
  if (tile.node) return 0; // do not waste a node hex on a non-extractor
  const weights = player.personality ? STRATEGIES[player.personality] : null;
  switch (buildingId) {
    case 'outpost':
      return 30 * (weights?.objective ?? 1);
    case 'watchtower':
      return 20 * (weights?.explore ?? 1);
    case 'military_base':
      return 28 * (weights?.military ?? 1);
    case 'refinery':
      return 26 * (weights?.economy ?? 1);
    case 'logistics_hub':
      return 22 * (weights?.economy ?? 1);
    case 'depot':
      return 12 * (weights?.economy ?? 1);
    default:
      return 5;
  }
}

/** Splits off a second formation once a bot's main army is large enough. */
function botExpandArmies(state: MatchState, player: MatchPlayer): void {
  const armies = armiesOf(state, player.id);
  if (armies.length >= effectiveArmySlots(state, player.id)) return;
  const biggest = armies.reduce<null | (typeof armies)[number]>(
    (best, a) => (!best || armySize(a) > armySize(best) ? a : best),
    null,
  );
  if (!biggest || armySize(biggest) < 24) return;

  // Peel off a mobile detachment: scouts first, then a slice of the line.
  const split: Record<string, number> = {};
  const recon = biggest.composition.recon ?? 0;
  if (recon >= 2) split.recon = Math.floor(recon / 2);
  const infantry = biggest.composition.infantry ?? 0;
  if (infantry >= 8) split.infantry = Math.floor(infantry / 3);
  if (Object.keys(split).length === 0) return;
  splitArmy(state, player.id, biggest.id, split);
}

/** A small set of far-away hexes worth a multi-day march. */
function strategicTargets(state: MatchState, player: MatchPlayer): HexId[] {
  const out: HexId[] = [];
  const mainHex = findMainObjectiveHex(state);
  if (mainHex) out.push(mainHex);
  for (const id of state.tileOrder) {
    const tile = state.tiles[id];
    if ((player.fog[id] ?? 0) === 0) continue;
    if (tile.feature.gate) out.push(id);
    else if (tile.feature.secondaryObjective && !tile.feature.secondaryObjective.defeatedBy) out.push(id);
    else if (tile.feature.facility && tile.feature.facility.owner !== player.id) out.push(id);
    else if (tile.node && !tile.buildingId && tile.node.remaining > 0) {
      const rare = ['titaniumDeposit', 'uraniumDeposit', 'crystalDeposit'].includes(tile.node.nodeId);
      if (rare) out.push(id);
    }
    if (out.length >= 24) break;
  }
  return out;
}

