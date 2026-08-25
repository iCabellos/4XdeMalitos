import { MATCH_RESOURCE_IDS, RARE_RESOURCE_IDS, resourceDef } from '../../data/resources';
import type { MatchPlayer } from '../../core/types';

/** Top-bar readout of a player's match stockpile, rare resources included. */
export function ResourceStrip({ player }: { player: MatchPlayer }) {
  return (
    <div className="resource-strip">
      {MATCH_RESOURCE_IDS.map((id) => {
        const def = resourceDef(id);
        const value = player.stock[id];
        const cap = player.storage[id];
        // Flag anything nearly exhausted: on nine days, running dry is fatal.
        const low = value < 5;
        return (
          <div key={id} className={`res${low ? ' warn' : ''}`} title={`${def.name} - ${def.role}`}>
            <span className="icon">{def.icon}</span>
            <span className="value">{Math.floor(value)}</span>
            <span className="faint small">/{cap}</span>
          </div>
        );
      })}
      {RARE_RESOURCE_IDS.map((id) => {
        const def = resourceDef(id);
        return (
          <div key={id} className="res rare" title={`${def.name} - ${def.role}`}>
            <span className="icon">{def.icon}</span>
            <span className="value">{Math.floor(player.stock[id])}</span>
          </div>
        );
      })}
    </div>
  );
}
