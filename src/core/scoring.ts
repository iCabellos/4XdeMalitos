import { BALANCE } from '../data/balance';
import { totalCommon, totalRare } from './resources';
import { playerMilitaryPower } from './combat';
import type { MatchState, MatchPlayer, PlayerId } from './types';

export interface ScoreBreakdown {
  playerId: PlayerId;
  territory: number;
  resources: number;
  rare: number;
  technology: number;
  military: number;
  objectives: number;
  total: number;
}

/** The 4X score. Every term is visible in the UI so players can steer it. */
export function computeScore(state: MatchState, player: MatchPlayer): ScoreBreakdown {
  const w = BALANCE.scoring;
  const territory = player.stats.hexesControlled * w.territory;
  const resources = totalCommon(player.stock) * w.resources;
  const rare = totalRare(player.stock) * w.rareResources;
  const technology = player.technologies.length * w.technology;
  const military = playerMilitaryPower(state, player.id) * w.military;

  let objectives = 0;
  for (const obj of state.secondaryObjectives) {
    if (obj.completedBy === player.id) objectives += w.secondaryObjective;
  }
  if (state.mainObjective.completedBy === player.id) {
    objectives += w.mainObjectiveWin;
  } else {
    objectives += (state.mainObjective.progress[player.id] ?? 0) * w.mainObjectiveHold;
  }

  const total = territory + resources + rare + technology + military + objectives;
  return {
    playerId: player.id,
    territory: Math.round(territory),
    resources: Math.round(resources),
    rare: Math.round(rare),
    technology: Math.round(technology),
    military: Math.round(military),
    objectives: Math.round(objectives),
    total: Math.round(total),
  };
}

export function updateAllScores(state: MatchState): ScoreBreakdown[] {
  const out: ScoreBreakdown[] = [];
  for (const player of state.players) {
    const breakdown = computeScore(state, player);
    player.score = breakdown.total;
    out.push(breakdown);
  }
  return out;
}

/** Final standings, best first. Ties break on rare resources then territory. */
export function standings(state: MatchState): MatchPlayer[] {
  return [...state.players].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const rare = totalRare(b.stock) - totalRare(a.stock);
    if (rare !== 0) return rare;
    return b.stats.hexesControlled - a.stats.hexesControlled;
  });
}

export function placementOf(state: MatchState, playerId: PlayerId): number {
  return standings(state).findIndex((p) => p.id === playerId) + 1;
}
