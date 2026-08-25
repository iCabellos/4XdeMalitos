import { standings } from '../../core/scoring';
import { hexToCss } from '../../rendering/palette';
import type { MatchState } from '../../core/types';

export function StandingsPanel({ state }: { state: MatchState }) {
  const table = standings(state);
  return (
    <div className="panel">
      <div className="panel-title">Clasificacion</div>
      <div className="panel-body">
        <div className="list">
          {table.map((player, index) => (
            <div key={player.id} className="row">
              <span className="mono faint">{index + 1}</span>
              <span className="dot" style={{ background: hexToCss(player.color) }} />
              <div className="grow">
                <div className="name">
                  {player.name}
                  {player.isHuman ? ' (tu)' : ''}
                </div>
                <div className="sub">
                  {player.stats.hexesControlled} hex · {player.technologies.length} tec ·{' '}
                  {player.stats.battlesWon}-{player.stats.battlesLost}
                </div>
              </div>
              {player.eliminated && <span className="tag bad">FUERA</span>}
              <span className="mono" style={{ fontWeight: 700 }}>
                {player.score}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
