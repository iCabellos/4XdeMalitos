import { techDef } from '../../data/technologies';
import { checkTechnology, visibleTechnologies } from '../../core/technology';
import { researchTechnology } from '../../core/actions';
import { formatCost } from '../../core/resources';
import type { MatchState, PlayerId } from '../../core/types';

const BRANCH_LABEL: Record<string, string> = {
  economy: 'Economia',
  military: 'Militar',
  expansion: 'Expansion',
};

/** In-match research. Science is scarce, so this is a genuine choice each day. */
export function TechPanel({
  state,
  viewerId,
  onAct,
}: {
  state: MatchState;
  viewerId: PlayerId;
  onAct: (message: string) => void;
}) {
  const player = state.players.find((p) => p.id === viewerId)!;
  const visible = visibleTechnologies(player);

  return (
    <div className="panel">
      <div className="panel-title">
        Investigacion · {player.technologies.length} completadas
      </div>
      <div className="panel-body">
        <div className="list">
          {visible.map((techId) => {
            const def = techDef(techId);
            const done = player.technologies.includes(techId);
            const check = checkTechnology(player, techId);
            return (
              <button
                key={techId}
                className={`row clickable${done ? ' selected' : ''}`}
                disabled={done || !check.available}
                style={{ opacity: done || check.available ? 1 : 0.5, textAlign: 'left' }}
                title={def.description}
                onClick={() =>
                  onAct(
                    researchTechnology(state, viewerId, techId).ok
                      ? `Investigacion completada: ${def.name}`
                      : (check.reason ?? 'No disponible'),
                  )
                }
              >
                <span className="grow">
                  <span className="name">{def.name}</span>
                  <span className="sub">
                    {done ? 'Completada' : (check.reason ?? formatCost(def.cost))}
                  </span>
                </span>
                <span className={`tag ${done ? 'good' : ''}`}>{BRANCH_LABEL[def.branch]}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
