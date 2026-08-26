import { useState } from 'react';
import {
  STANCE_COLOR,
  STANCE_ICON,
  STANCE_LABEL,
  TREATY_DESCRIPTION,
  TREATY_LABEL,
  TRIBUTE_PRESETS,
  OPINION,
  type TreatyKind,
} from '../../data/diplomacy';
import { relationOf, evaluateTreaty, tributeValue } from '../../core/diplomacy';
import { offerTreaty, offerTribute, breakRelations } from '../../core/actions';
import { canAfford, formatCost } from '../../core/resources';
import { playerMilitaryPower } from '../../core/combat';
import { hexToCss } from '../../rendering/palette';
import type { MatchState, PlayerId } from '../../core/types';
import type { ResourceCost } from '../../data/troops';

/**
 * Diplomacy. Opinion is shown as a real bar with the threshold marked, because
 * "they refused" is useless feedback if you cannot see how far off you were.
 */
export function DiplomacyPanel({
  state,
  viewerId,
  onAct,
}: {
  state: MatchState;
  viewerId: PlayerId;
  onAct: (message: string) => void;
}) {
  const player = state.players.find((p) => p.id === viewerId)!;
  const [expanded, setExpanded] = useState<PlayerId | null>(null);
  const rivals = state.players.filter((p) => p.id !== viewerId);

  const act = (result: { ok: boolean; reason?: string }, success: string) => {
    onAct(result.ok ? success : (result.reason ?? 'No ha salido'));
  };

  return (
    <div className="panel">
      <div className="panel-title">Diplomacia</div>
      <div className="panel-body stack">
        <div className="small faint">
          La confianza se gana con tributo y se pierde atacando. Romper un pacto firmado te
          cuesta credito con todos los que miran, no solo con la victima.
        </div>

        {rivals.map((rival) => {
          const relation = relationOf(player, rival.id);
          const theirView = relationOf(rival, viewerId);
          const open = expanded === rival.id;
          const threshold = OPINION.requiredFor.nonAggression;
          // Map opinion (-100..100) onto the bar, and mark where a pact becomes
          // possible so the gap is a distance, not a mystery.
          const pct = ((theirView.opinion - OPINION.min) / (OPINION.max - OPINION.min)) * 100;
          const markerPct = ((threshold - OPINION.min) / (OPINION.max - OPINION.min)) * 100;
          const power = playerMilitaryPower(state, rival.id);

          return (
            <div key={rival.id} className="stack" style={{ gap: 6 }}>
              <button className="row clickable" onClick={() => setExpanded(open ? null : rival.id)}>
                <span className="dot" style={{ background: hexToCss(rival.color) }} />
                <span className="grow">
                  <span className="name">
                    {rival.name}
                    {rival.eliminated ? ' (fuera)' : ''}
                  </span>
                  <span className="sub">
                    Opinion de ti: {Math.round(theirView.opinion)} · poder militar {power}
                  </span>
                  <div className="opinion-bar">
                    <span className="fill" style={{ width: `${Math.max(0, pct)}%` }} />
                    <span className="threshold" style={{ left: `${markerPct}%` }} />
                  </div>
                </span>
                <span className="tag" style={{ color: STANCE_COLOR[relation.stance] }}>
                  {STANCE_ICON[relation.stance]} {STANCE_LABEL[relation.stance]}
                </span>
              </button>

              {open && !rival.eliminated && (
                <div className="stack" style={{ gap: 8, paddingLeft: 8 }}>
                  <div className="panel-title" style={{ padding: '2px 0 0' }}>
                    Enviar tributo
                  </div>
                  <div className="list">
                    {TRIBUTE_PRESETS.map((preset) => {
                      const cost = preset.resources as ResourceCost;
                      const affordable = canAfford(player.stock, cost);
                      return (
                        <button
                          key={preset.label}
                          className="row clickable"
                          disabled={!affordable}
                          style={{ opacity: affordable ? 1 : 0.45, textAlign: 'left' }}
                          onClick={() =>
                            act(
                              offerTribute(state, viewerId, rival.id, cost),
                              `Tributo enviado a ${rival.name}`,
                            )
                          }
                        >
                          <span className="grow">
                            <span className="name">{preset.label}</span>
                            <span className="sub mono">{formatCost(cost)}</span>
                          </span>
                          <span className="tag good">
                            +{Math.round(tributeValue(cost))} confianza
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="panel-title" style={{ padding: '2px 0 0' }}>
                    Proponer acuerdo
                  </div>
                  <div className="list">
                    {(['nonAggression', 'alliance'] as TreatyKind[]).map((kind) => {
                      const verdict = evaluateTreaty(state, viewerId, rival.id, kind);
                      return (
                        <button
                          key={kind}
                          className="row clickable"
                          style={{ textAlign: 'left' }}
                          onClick={() =>
                            act(
                              offerTreaty(state, viewerId, rival.id, kind),
                              `${TREATY_LABEL[kind]} firmado con ${rival.name}`,
                            )
                          }
                        >
                          <span className="grow">
                            <span className="name">{TREATY_LABEL[kind]}</span>
                            <span className="sub">{TREATY_DESCRIPTION[kind]}</span>
                            <span className={`sub ${verdict.accepted ? '' : 'bad'}`}>
                              {verdict.accepted ? 'Lo aceptaria ahora mismo.' : verdict.reason}
                            </span>
                          </span>
                          <span className={`tag ${verdict.accepted ? 'good' : 'bad'}`}>
                            {verdict.accepted ? 'VIABLE' : 'NO'}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {relation.stance !== 'war' && (
                    <button
                      className="btn small danger"
                      onClick={() =>
                        act(
                          breakRelations(state, viewerId, rival.id),
                          `Guerra declarada a ${rival.name}`,
                        )
                      }
                    >
                      DECLARAR LA GUERRA
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
