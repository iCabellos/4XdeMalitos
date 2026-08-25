import { useMemo } from 'react';
import type { MatchState } from '../../core/types';

/** The day's narrative. Only what the human could plausibly know is shown. */
export function EventLog({ state }: { state: MatchState }) {
  const lines = useMemo(() => {
    return state.events
      .filter((e) => e.visibleToHuman && e.kind !== 'production')
      .slice(-40)
      .reverse();
  }, [state.events, state.events.length, state.day]);

  return (
    <div className="panel">
      <div className="panel-title">Partes de operaciones</div>
      <div className="panel-body">
        {lines.length === 0 ? (
          <div className="small faint">Sin novedades todavia.</div>
        ) : (
          <div className="log">
            {lines.map((event, index) => (
              <div key={`${event.day}-${index}-${event.kind}`} className={`log-line ${event.kind}`}>
                <span className="mono faint">D{event.day} </span>
                {event.text}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
