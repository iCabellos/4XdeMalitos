import { axialOf, hexDistanceId, neighborIds, type HexId } from '../map/hex';
import { nodeDef } from '../data/terrain';
import { isRare } from '../data/resources';
import { armyPower } from '../core/combat';
import { armySize } from '../core/movement';
import { findMainObjectiveHex } from '../core/objectives';
import { ZONES } from '../data/zones';
import { isBoundNotToAttack } from '../core/diplomacy';
import type { Army, MatchPlayer, MatchState } from '../core/types';
import type { StrategyWeights } from './strategies';

/**
 * Whether two regions are joined by a gate that has already opened. Regions are
 * few, so a direct scan beats maintaining a graph that could fall out of date.
 */
function regionReachable(state: MatchState, fromRegion: number, toRegion: number): boolean {
  for (const id of state.tileOrder) {
    const gate = state.tiles[id].feature.gate;
    if (!gate || !gate.open) continue;
    const joins =
      (gate.regionA === fromRegion && gate.regionB === toRegion) ||
      (gate.regionB === fromRegion && gate.regionA === toRegion);
    if (joins) return true;
  }
  return false;
}

export interface ScoredHex {
  hex: HexId;
  score: number;
  reason: string;
}

/** Counts unknown neighbours: a cheap proxy for "how much would I learn here". */
function frontierValue(state: MatchState, player: MatchPlayer, hex: HexId): number {
  const { q, r } = axialOf(hex);
  let unknown = 0;
  for (const nId of neighborIds(q, r)) {
    if (!state.tiles[nId]) continue;
    if ((player.fog[nId] ?? 0) === 0) unknown++;
  }
  return unknown;
}

/**
 * Scores a destination for one army. Everything the bot cares about is a term
 * here, so tuning a personality means changing weights, never control flow.
 */
export function scoreDestination(
  state: MatchState,
  player: MatchPlayer,
  army: Army,
  hex: HexId,
  weights: StrategyWeights,
): ScoredHex {
  const tile = state.tiles[hex];
  if (!tile) return { hex, score: -Infinity, reason: 'fuera del mapa' };

  // Ground behind a sealed wall is unreachable, and scoring it would drown out
  // every legal option and leave the army standing still. Reachability itself
  // is settled by the pathfinder; this only skips other regions we cannot yet
  // cross into at all.
  const origin = state.tiles[army.hex];
  if (tile.regionId !== origin.regionId && !regionReachable(state, origin.regionId, tile.regionId)) {
    return { hex, score: -Infinity, reason: 'muro sellado' };
  }

  let score = 0;
  let reason = 'reposicionamiento';
  const fog = player.fog[hex] ?? 0;

  // Exploration: unknown ground and the edge of the known world.
  if (fog === 0) {
    score += weights.explore * 6;
    reason = 'explorar';
  }
  score += frontierValue(state, player, hex) * weights.explore * 1.5;

  // Resource nodes: rare deposits are the real prize.
  if (tile.node && tile.node.remaining > 0 && !tile.buildingId) {
    const node = nodeDef(tile.node.nodeId);
    if (isRare(node.resource)) {
      score += weights.rare * 18;
      reason = `asegurar ${node.name}`;
    } else {
      score += weights.economy * 7;
      if (reason === 'reposicionamiento') reason = `explotar ${node.name}`;
    }
  }

  // Gates are the only doorways. Sitting on one before it opens is how a bot
  // is through the instant it does.
  const gate = tile.feature.gate;
  if (gate) {
    const daysAway = gate.opensOnDay - state.day;
    if (gate.open) {
      score += weights.objective * 14;
      reason = 'cruzar la puerta';
    } else if (daysAway <= 2) {
      score += weights.objective * 18;
      reason = `esperar la puerta (dia ${gate.opensOnDay})`;
    }
  }

  // Garrisoned objectives are worth a real army: they pay an item and a buff.
  const secondary = tile.feature.secondaryObjective;
  if (secondary && !secondary.defeatedBy) {
    const garrison = Object.values(secondary.garrison).reduce((a, b) => a + b, 0);
    const mine = armySize(army);
    if (mine > garrison * 1.4) {
      score += weights.objective * 26;
      reason = `asaltar ${secondary.name}`;
    } else {
      score -= weights.caution * 8;
    }
  }

  // Facilities and the central objective.
  if (tile.feature.facility) {
    const facility = tile.feature.facility;
    if (facility.owner !== player.id) {
      score += weights.objective * (tile.feature.mainObjective ? 30 : 16);
      reason = tile.feature.mainObjective ? 'asaltar el Mando Central' : `activar ${facility.name}`;
    }
  }

  const mainHex = findMainObjectiveHex(state);
  if (mainHex && state.tiles[mainHex].zone === 3) {
    // Once the core gates are open, gravity pulls towards the centre.
    const coreOpen = state.day >= ZONES[3].gatesOpenOnDay;
    if (coreOpen) {
      const distanceToMain = hexDistanceId(hex, mainHex);
      score += weights.objective * Math.max(0, 8 - distanceToMain);
    }
  }

  // Untaken caches are free tempo.
  if (tile.feature.cache && !tile.feature.cache.taken && fog >= 1) {
    score += weights.economy * 8;
  }

  // Enemy presence: attractive when we are stronger, repellent when we are not.
  const myPower = armyPower(state, army);
  for (const other of Object.values(state.armies)) {
    if (other.owner === army.owner || armySize(other) <= 0) continue;
    if ((player.fog[other.hex] ?? 0) < 1) continue;
    const distance = hexDistanceId(hex, other.hex);
    if (distance > 2) continue;
    const theirPower = armyPower(state, other);
    const ratio = theirPower > 0 ? myPower / theirPower : 3;
    const proximity = 3 - distance;
    if (isBoundNotToAttack(state, player.id, other.owner)) continue;
    if (ratio >= 1.2) {
      score += weights.aggression * proximity * 6 * Math.min(2, ratio);
      if (distance <= 1) reason = 'atacar';
    } else {
      score -= weights.caution * proximity * 10;
    }
  }

  // Staying near owned ground is safer and keeps supply short.
  if (tile.controlledBy === player.id) score += weights.caution * 2;
  else if (tile.controlledBy && tile.controlledBy !== player.id) score -= weights.caution * 3;

  // Distance cost: a bot should not cross the map for a marginal gain.
  score -= hexDistanceId(army.hex, hex) * 1.2;

  return { hex, score, reason };
}

/** Picks the best of a bounded candidate set. */
export function bestOf(candidates: ScoredHex[]): ScoredHex | null {
  let best: ScoredHex | null = null;
  for (const candidate of candidates) {
    if (!Number.isFinite(candidate.score)) continue;
    if (!best || candidate.score > best.score) best = candidate;
  }
  return best;
}
