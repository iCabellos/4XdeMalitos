import { MAIN_OBJECTIVES, SECONDARY_OBJECTIVES, objectiveDef } from '../data/objectives';
import { Rng } from './rng';
import { grantMany } from './resources';
import type { MatchState, ObjectiveProgress, PlayerId } from './types';
import type { AnyMatchResourceId } from '../data/resources';

export function createObjectiveProgress(objectiveId: string, playerIds: PlayerId[]): ObjectiveProgress {
  const def = objectiveDef(objectiveId);
  const progress: Record<PlayerId, number> = {};
  for (const id of playerIds) progress[id] = 0;
  return { objectiveId, goal: def.goal, progress, completedBy: null, completedOnDay: null };
}

/** The main objective is drawn from the pool by seed, so maps vary in shape. */
export function pickMainObjective(rng: Rng): string {
  return rng.pick(MAIN_OBJECTIVES).id;
}

export function allSecondaryObjectiveIds(): string[] {
  return SECONDARY_OBJECTIVES.map((o) => o.id);
}

/** How far a player is towards a goal right now, in the goal's own units. */
function measure(state: MatchState, objective: ObjectiveProgress, playerId: PlayerId): number {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return 0;
  const goal = objective.goal;
  switch (goal.type) {
    case 'holdHex': {
      // Consecutive-day counters are advanced in tick(), not measured here.
      return objective.progress[playerId] ?? 0;
    }
    case 'activateFacilities': {
      let count = 0;
      for (const tile of Object.values(state.tiles)) {
        const facility = tile.feature.facility;
        if (!facility || tile.feature.mainObjective) continue;
        if (facility.state === 'active' && facility.owner === playerId) count++;
      }
      return count;
    }
    case 'controlRare':
      return player.stock[goal.resource as AnyMatchResourceId] ?? 0;
    case 'techChain':
      return goal.techs.filter((t) => player.technologies.includes(t)).length;
    case 'controlTerritory':
      return player.stats.hexesControlled;
  }
}

function targetOf(objective: ObjectiveProgress): number {
  const goal = objective.goal;
  switch (goal.type) {
    case 'holdHex':
      return goal.days;
    case 'activateFacilities':
      return goal.count;
    case 'controlRare':
      return goal.amount;
    case 'techChain':
      return goal.techs.length;
    case 'controlTerritory':
      return goal.hexes;
  }
}

export function objectiveTarget(objective: ObjectiveProgress): number {
  return targetOf(objective);
}

export function objectiveProgressFor(
  state: MatchState,
  objective: ObjectiveProgress,
  playerId: PlayerId,
): number {
  return objective.goal.type === 'holdHex'
    ? objective.progress[playerId] ?? 0
    : measure(state, objective, playerId);
}

export interface ObjectiveTickResult {
  completed: { objectiveId: string; playerId: PlayerId }[];
  /** Set when the main objective was claimed and the match should end. */
  mainCompletedBy: PlayerId | null;
}

/**
 * Advances every objective one day. Hold-style goals track consecutive control
 * and reset the moment the hex is lost, which is what makes the centre a fight
 * rather than a one-time capture.
 */
export function tickObjectives(state: MatchState): ObjectiveTickResult {
  const completed: ObjectiveTickResult['completed'] = [];
  let mainCompletedBy: PlayerId | null = null;

  const advance = (objective: ObjectiveProgress, isMain: boolean) => {
    if (objective.completedBy) return;
    const target = targetOf(objective);

    if (objective.goal.type === 'holdHex') {
      const hex = findMainObjectiveHex(state);
      const holder = hex ? state.tiles[hex]?.controlledBy ?? null : null;
      for (const player of state.players) {
        if (player.id === holder) objective.progress[player.id] = (objective.progress[player.id] ?? 0) + 1;
        else objective.progress[player.id] = 0;
      }
    } else {
      for (const player of state.players) {
        objective.progress[player.id] = measure(state, objective, player.id);
      }
    }

    // The first player to hit the target claims it; later arrivals get nothing.
    for (const player of state.players) {
      if ((objective.progress[player.id] ?? 0) >= target) {
        objective.completedBy = player.id;
        objective.completedOnDay = state.day;
        completed.push({ objectiveId: objective.objectiveId, playerId: player.id });
        const def = objectiveDef(objective.objectiveId);
        if (def.reward) grantMany(player, def.reward);
        if (isMain) mainCompletedBy = player.id;
        break;
      }
    }
  };

  advance(state.mainObjective, true);
  for (const objective of state.secondaryObjectives) advance(objective, false);

  return { completed, mainCompletedBy };
}

export function findMainObjectiveHex(state: MatchState): string | null {
  for (const tile of Object.values(state.tiles)) {
    if (tile.feature.mainObjective) return tile.id;
  }
  return null;
}

/** Facilities other than the central one, used by the activation objective. */
export function facilityHexes(state: MatchState): string[] {
  return state.tileOrder.filter(
    (id) => !!state.tiles[id].feature.facility && !state.tiles[id].feature.mainObjective,
  );
}

export function objectiveLabel(objective: ObjectiveProgress): string {
  return objectiveDef(objective.objectiveId).name;
}

export function objectiveDescription(objective: ObjectiveProgress): string {
  return objectiveDef(objective.objectiveId).description;
}
