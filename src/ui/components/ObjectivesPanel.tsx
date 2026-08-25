import { objectiveDef } from '../../data/objectives';
import { objectiveProgressFor, objectiveTarget } from '../../core/objectives';
import type { MatchState, ObjectiveProgress, PlayerId } from '../../core/types';

function ObjectiveRow({
  state,
  objective,
  viewerId,
  main,
}: {
  state: MatchState;
  objective: ObjectiveProgress;
  viewerId: PlayerId;
  main?: boolean;
}) {
  const def = objectiveDef(objective.objectiveId);
  const target = objectiveTarget(objective);
  const mine = objectiveProgressFor(state, objective, viewerId);
  const pct = Math.min(100, (mine / Math.max(1, target)) * 100);

  // Show the strongest rival so the player knows how contested the goal is.
  let leader: { name: string; value: number } | null = null;
  for (const player of state.players) {
    if (player.id === viewerId) continue;
    const value = objectiveProgressFor(state, objective, player.id);
    if (!leader || value > leader.value) leader = { name: player.name, value };
  }

  const claimed = objective.completedBy
    ? state.players.find((p) => p.id === objective.completedBy)?.name
    : null;

  return (
    <div className="stack" style={{ gap: 5, marginBottom: 10 }}>
      <div className="inline" style={{ justifyContent: 'space-between', gap: 6 }}>
        <span className="name" style={{ fontWeight: 700 }}>
          {main ? '◆ ' : ''}
          {def.name}
        </span>
        <span className={`tag ${claimed ? 'good' : main ? 'accent' : ''}`}>
          {claimed ? `${claimed}` : `${Math.floor(mine)}/${target}`}
        </span>
      </div>
      <div className={`bar ${main ? '' : 'info'}`}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="small faint">{def.description}</div>
      {leader && !claimed && (
        <div className="small muted">
          Rival mas avanzado: {leader.name} ({Math.floor(leader.value)}/{target})
        </div>
      )}
    </div>
  );
}

export function ObjectivesPanel({ state, viewerId }: { state: MatchState; viewerId: PlayerId }) {
  return (
    <div className="panel">
      <div className="panel-title">Objetivos</div>
      <div className="panel-body">
        <ObjectiveRow state={state} objective={state.mainObjective} viewerId={viewerId} main />
        {state.secondaryObjectives.map((objective) => (
          <ObjectiveRow
            key={objective.objectiveId}
            state={state}
            objective={objective}
            viewerId={viewerId}
          />
        ))}
      </div>
    </div>
  );
}
