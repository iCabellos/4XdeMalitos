import { useMemo } from 'react';
import { ALL_MATCH_RESOURCE_IDS, resourceDef } from '../../data/resources';
import { computeNetBalance } from '../../core/economy';
import type { MatchState, PlayerId } from '../../core/types';

/**
 * The economy, explained. Every resource shows what it is, what it will do
 * tomorrow, where it comes from and what drains it - so a player watching a
 * number fall knows which building fixes it.
 */
export function ResourcePanel({
  state,
  viewerId,
  tick,
}: {
  state: MatchState;
  viewerId: PlayerId;
  tick: number;
}) {
  const player = state.players.find((p) => p.id === viewerId)!;
  const net = useMemo(() => computeNetBalance(state, player), [state, player, tick]);

  return (
    <div className="panel">
      <div className="panel-title">Materiales · balance diario</div>
      <div className="panel-body">
        <div className="list">
          {ALL_MATCH_RESOURCE_IDS.map((id) => {
            const def = resourceDef(id);
            const amount = player.stock[id];
            const cap = player.storage[id];
            const delta = net[id] ?? 0;
            const rounded = Math.round(delta * 10) / 10;
            const tone = rounded > 0.05 ? 'good' : rounded < -0.05 ? 'bad' : '';
            const daysLeft = rounded < -0.05 ? Math.floor(amount / -rounded) : null;

            return (
              <details key={id} className={`resource-row${def.rare ? ' rare' : ''}`}>
                <summary>
                  <span className="res-icon">{def.icon}</span>
                  <span className="grow">
                    <span className="name">{def.name}</span>
                    <span className="sub">{def.flavour}</span>
                  </span>
                  <span className="res-figures">
                    <span className="mono">
                      {Math.floor(amount)}
                      <span className="faint">/{cap}</span>
                    </span>
                    <span className={`tag ${tone}`}>
                      {rounded >= 0 ? '+' : ''}
                      {rounded}/dia
                    </span>
                  </span>
                </summary>
                <div className="resource-detail">
                  <p className="small muted">{def.role}</p>
                  {daysLeft !== null && (
                    <p className="small" style={{ color: 'var(--bad)' }}>
                      A este ritmo se agota en {daysLeft} {daysLeft === 1 ? 'dia' : 'dias'}.
                    </p>
                  )}
                  <div className="source-block">
                    <span className="source-label good">Se genera con</span>
                    <ul>
                      {def.sources.map((source) => (
                        <li key={source}>{source}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="source-block">
                    <span className="source-label bad">Se consume en</span>
                    <ul>
                      {def.drains.map((drain) => (
                        <li key={drain}>{drain}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      </div>
    </div>
  );
}
