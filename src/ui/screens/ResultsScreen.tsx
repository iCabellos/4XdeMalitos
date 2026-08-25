import { useGame } from '../store';
import { standings } from '../../core/scoring';
import { computeScore } from '../../core/scoring';
import { resourceDef } from '../../data/resources';
import { commanderDef } from '../../data/commanders';
import { hexToCss } from '../../rendering/palette';
import { objectiveDef } from '../../data/objectives';

/** End-of-match report and the rewards that were just banked into the city. */
export function ResultsScreen() {
  const match = useGame((s) => s.match);
  const rewards = useGame((s) => s.lastRewards);
  const returnToCity = useGame((s) => s.returnToCity);
  const startMatch = useGame((s) => s.startMatch);

  if (!match || !rewards) return null;

  const table = standings(match);
  const player = match.players.find((p) => p.id === match.humanId)!;
  const breakdown = computeScore(match, player);
  const winner = match.players.find((p) => p.id === match.winner);
  const won = match.winner === player.id;

  return (
    <div className="screen">
      <header className="topbar">
        <span className="brand">OPERACION 9 DIAS</span>
        <span className="day-chip">RESULTADO · DIA {match.day}</span>
      </header>

      <div className="fullscreen-screen">
        <div className="hero">
          <h1 style={{ color: won ? 'var(--good)' : 'var(--accent)' }}>
            {won ? 'OPERACION EXITOSA' : `POSICION ${rewards.placement}`}
          </h1>
          <p>
            {winner?.name} {match.endReason === 'objective'
              ? `completa el objetivo principal: ${objectiveDef(match.mainObjective.objectiveId).name}.`
              : match.endReason === 'elimination'
                ? 'queda como unico superviviente.'
                : 'gana por puntuacion al termino del dia 9.'}
          </p>
        </div>

        <div className="grid-2">
          <div className="panel">
            <div className="panel-title">Clasificacion final</div>
            <div className="panel-body">
              <div className="list">
                {table.map((p, index) => (
                  <div key={p.id} className={`row${p.isHuman ? ' selected' : ''}`}>
                    <span className="mono faint">{index + 1}</span>
                    <span className="dot" style={{ background: hexToCss(p.color) }} />
                    <span className="grow">
                      <span className="name">
                        {p.name}
                        {p.isHuman ? ' (tu)' : ''}
                      </span>
                      <span className="sub">
                        {p.stats.hexesControlled} hex · {p.technologies.length} tec ·{' '}
                        {p.stats.battlesWon}-{p.stats.battlesLost} batallas ·{' '}
                        {p.stats.troopsKilled} bajas infligidas
                      </span>
                    </span>
                    <span className="mono" style={{ fontWeight: 700 }}>
                      {p.score}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">Tu puntuacion 4X</div>
            <div className="panel-body">
              <div className="grid-3">
                <div className="stat-tile">
                  <div className="label">Territorio</div>
                  <div className="value small">{breakdown.territory}</div>
                </div>
                <div className="stat-tile">
                  <div className="label">Recursos</div>
                  <div className="value small">{breakdown.resources}</div>
                </div>
                <div className="stat-tile">
                  <div className="label">Raros</div>
                  <div className="value small">{breakdown.rare}</div>
                </div>
                <div className="stat-tile">
                  <div className="label">Tecnologia</div>
                  <div className="value small">{breakdown.technology}</div>
                </div>
                <div className="stat-tile">
                  <div className="label">Militar</div>
                  <div className="value small">{breakdown.military}</div>
                </div>
                <div className="stat-tile">
                  <div className="label">Objetivos</div>
                  <div className="value small">{breakdown.objectives}</div>
                </div>
              </div>
              <div className="stat-tile" style={{ marginTop: 10 }}>
                <div className="label">Total</div>
                <div className="value">{breakdown.total}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-title">Recompensas transferidas a la ciudad</div>
          <div className="panel-body stack">
            <div className="grid-3">
              {Object.entries(rewards.resources)
                .filter(([, value]) => value > 0)
                .map(([key, value]) => (
                  <div key={key} className="stat-tile">
                    <div className="label">
                      {resourceDef(key)?.icon} {resourceDef(key)?.name ?? key}
                    </div>
                    <div className="value small">+{value}</div>
                  </div>
                ))}
              <div className="stat-tile">
                <div className="label">Puntos meta</div>
                <div className="value small">+{rewards.metaPoints}</div>
              </div>
            </div>

            {Object.keys(rewards.commanderXp).length > 0 && (
              <>
                <div className="panel-title" style={{ padding: '6px 0 2px' }}>
                  Experiencia de comandantes
                </div>
                <div className="list">
                  {Object.entries(rewards.commanderXp).map(([id, xp]) => (
                    <div key={id} className="row">
                      <span className="grow">
                        <span className="name">{commanderDef(id).name}</span>
                        <span className="sub">+{xp} XP</span>
                      </span>
                      {rewards.commanderLevelUps[id] && (
                        <span className="tag good">+{rewards.commanderLevelUps[id]} nivel</span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {Object.keys(rewards.passiveIncome).length > 0 && (
              <div className="small faint">
                Produccion pasiva de la ciudad durante los 9 dias:{' '}
                {Object.entries(rewards.passiveIncome)
                  .map(([k, v]) => `+${v} ${resourceDef(k)?.short ?? k}`)
                  .join('  ')}
              </div>
            )}
          </div>
        </div>
      </div>

      <footer className="actionbar">
        <span className="spacer" />
        <button className="btn" onClick={() => startMatch()}>
          OTRA PARTIDA
        </button>
        <button className="btn primary" onClick={returnToCity}>
          VOLVER A LA CIUDAD →
        </button>
      </footer>
    </div>
  );
}
