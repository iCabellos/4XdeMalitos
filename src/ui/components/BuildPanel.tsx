import { mapBuildingDef, type MapBuildingId } from '../../data/buildings.map';
import { availableMapBuildings } from '../../core/technology';
import { canBuild, canUpgradeBuilding } from '../../core/construction';
import { upgradeMapBuilding } from '../../core/actions';
import { formatCost } from '../../core/resources';
import type { HexId } from '../../map/hex';
import type { MatchState, PlayerId } from '../../core/types';

interface Props {
  state: MatchState;
  viewerId: PlayerId;
  hex: HexId | null;
  onPickBuilding: (id: MapBuildingId) => void;
  onAct: (message: string) => void;
}

/**
 * Construction on the selected hex. Citizens are shown front and centre because
 * they, not materials, are what actually limits how much a player can build.
 */
export function BuildPanel({ state, viewerId, hex, onPickBuilding, onAct }: Props) {
  const player = state.players.find((p) => p.id === viewerId)!;
  const tile = hex ? state.tiles[hex] : null;
  const existing = tile?.buildingId ? state.buildings[tile.buildingId] : null;

  return (
    <div className="panel">
      <div className="panel-title">
        Construccion · {player.citizensFree}/{player.citizensTotal} ciudadanos libres
      </div>
      <div className="panel-body stack">
        {!tile && <div className="small faint">Selecciona un hexagono.</div>}

        {existing && existing.owner === viewerId && (
          <button
            className="btn small"
            disabled={!canUpgradeBuilding(state, player, existing.id).ok}
            title={canUpgradeBuilding(state, player, existing.id).reason ?? ''}
            onClick={() =>
              onAct(
                upgradeMapBuilding(state, viewerId, existing.id).ok
                  ? `${mapBuildingDef(existing.buildingId).name} mejorada`
                  : (canUpgradeBuilding(state, player, existing.id).reason ?? 'No se puede mejorar'),
              )
            }
          >
            Mejorar {mapBuildingDef(existing.buildingId).name} a N{existing.level + 1} ·{' '}
            {formatCost(canUpgradeBuilding(state, player, existing.id).cost)}
          </button>
        )}

        {tile && (
          <div className="list">
            {(availableMapBuildings(player) as MapBuildingId[]).map((buildingId) => {
              const def = mapBuildingDef(buildingId);
              const check = canBuild(state, player, tile, buildingId);
              return (
                <button
                  key={buildingId}
                  className="row clickable"
                  disabled={!check.ok}
                  style={{ opacity: check.ok ? 1 : 0.4, textAlign: 'left' }}
                  title={`${def.description}${check.reason ? ` — ${check.reason}` : ''}`}
                  onClick={() => onPickBuilding(buildingId)}
                >
                  <span className="grow">
                    <span className="name">{def.name}</span>
                    <span className="sub mono">
                      {formatCost(def.cost)} · {def.citizens} ciud · {def.buildDays}d
                    </span>
                    {!check.ok && check.reason && <span className="sub bad">{check.reason}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
