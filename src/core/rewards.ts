import { BALANCE } from '../data/balance';
import { RARE_RESOURCE_IDS } from '../data/resources';
import { placementOf } from './scoring';
import { addCityResources, awardCommanderXp, deriveCityEffects, type CityState } from '../entities/city';
import type { MatchState, PlayerId } from './types';

export interface MatchRewards {
  placement: number;
  score: number;
  won: boolean;
  mainObjectiveCompleted: boolean;
  secondaryCompleted: number;
  resources: Record<string, number>;
  commanderXp: Record<string, number>;
  commanderLevelUps: Record<string, number>;
  metaPoints: number;
  /** Small passive city income representing the nine days that elapsed. */
  passiveIncome: Record<string, number>;
}

/**
 * Turns a finished match into permanent city progress. Placement matters, but
 * the objective and the rare resources actually carried home matter more: that
 * is the pressure that sends players back into contested ground.
 */
export function computeRewards(state: MatchState, playerId: PlayerId, city: CityState): MatchRewards {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new Error(`Jugador desconocido: ${playerId}`);

  const placement = placementOf(state, playerId);
  const multiplier =
    BALANCE.rewards.placementMultiplier[placement - 1] ??
    BALANCE.rewards.placementMultiplier[BALANCE.rewards.placementMultiplier.length - 1];
  const cityMultiplier = deriveCityEffects(city).rewardMultiplier;
  const factor = multiplier * cityMultiplier;
  const score = player.score;

  const resources: Record<string, number> = {
    gold: Math.round(score * BALANCE.rewards.goldPerScore * factor),
    materials: Math.round(score * BALANCE.rewards.materialsPerScore * factor),
    science: Math.round(score * BALANCE.rewards.sciencePerScore * factor),
    influence: Math.round(score * BALANCE.rewards.influencePerScore * factor),
  };

  // Rare resources are carried home only in part: hoarding in-match is not free.
  for (const id of RARE_RESOURCE_IDS) {
    const carried = Math.floor(player.stock[id] * BALANCE.rewards.rareCarryFraction * cityMultiplier);
    if (carried > 0) resources[id] = (resources[id] ?? 0) + carried;
  }

  const mainObjectiveCompleted = state.mainObjective.completedBy === playerId;
  if (mainObjectiveCompleted) {
    for (const [key, value] of Object.entries(BALANCE.rewards.mainObjectiveBonus)) {
      resources[key] = (resources[key] ?? 0) + Math.round(value * cityMultiplier);
    }
  }

  const secondaryCompleted = state.secondaryObjectives.filter((o) => o.completedBy === playerId).length;

  const commanderXp: Record<string, number> = {};
  const scoreXp = score * BALANCE.rewards.commanderXpPerScore + player.loadout.commanderXpBonus;
  const led = player.commanders;
  for (const commanderId of led) {
    const battleXp = state.commanderXp[commanderId] ?? 0;
    const total = Math.round(battleXp + scoreXp / Math.max(1, led.length));
    if (total > 0) commanderXp[commanderId] = total;
  }

  const metaPoints =
    Math.round(score / 20) + secondaryCompleted * 5 + (mainObjectiveCompleted ? 25 : 0);

  const passiveIncome: Record<string, number> = {};
  for (const [key, value] of Object.entries(deriveCityEffects(city).passiveIncome)) {
    passiveIncome[key] = value;
  }

  return {
    placement,
    score,
    won: state.winner === playerId,
    mainObjectiveCompleted,
    secondaryCompleted,
    resources,
    commanderXp,
    commanderLevelUps: {},
    metaPoints,
    passiveIncome,
  };
}

/** Applies rewards to the persistent city. Mutates and returns the city. */
export function applyRewards(city: CityState, rewards: MatchRewards): CityState {
  addCityResources(city, rewards.resources);
  addCityResources(city, rewards.passiveIncome);
  city.metaPoints += rewards.metaPoints;
  city.matchesPlayed++;
  if (rewards.won) city.matchesWon++;
  if (rewards.score > city.bestScore) city.bestScore = rewards.score;
  for (const [commanderId, xp] of Object.entries(rewards.commanderXp)) {
    const levels = awardCommanderXp(city, commanderId, xp);
    if (levels > 0) rewards.commanderLevelUps[commanderId] = levels;
  }
  return city;
}
