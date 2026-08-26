import { useState } from 'react';
import { troopDef, troopAttackAt, troopDefenseAt, troopsUnlockedAtBarracks, TROOP_IDS } from '../../data/troops';
import { CITY_BUILDINGS } from '../../data/buildings.city';
import { availableTroops, troopLockReason } from '../../core/technology';
import { canTrain, canTrainAt, trainingCapacity, trainingCapacityUsed } from '../../core/economy';
import { trainTroops, splitArmy, effectiveArmySlots } from '../../core/actions';
import { armiesOf } from '../../core/gameState';
import { formatCost } from '../../core/resources';
import { armySize } from '../../core/movement';
import { CompositionBadges } from './MilitaryBadges';
import type { MatchState, PlayerId } from '../../core/types';
import type { HexId } from '../../map/hex';

/**
 * Your city, reachable from inside the match.
 *
 * The capital hex in zone 1 is the city itself: it is where the barracks
 * recruits, where new marches are formed, and where the persistent bonuses you
 * bought between matches are visible while they are actually mattering.
 */
export function BasePanel({
  state,
  viewerId,
  onAct,
  onFocus,
  onSelectArmy,
}: {
  state: MatchState;
  viewerId: PlayerId;
  onAct: (message: string) => void;
  onFocus: (hex: HexId) => void;
  onSelectArmy: (armyId: string) => void;
}) {
  const player = state.players.find((p) => p.id === viewerId)!;
  const [count, setCount] = useState(5);

  const capital = state.tileOrder.find((id) => state.tiles[id].feature.startFor === viewerId);
  const armies = armiesOf(state, viewerId);
  const garrison = capital ? armies.filter((a) => a.hex === capital) : [];
  // Recruiting happens at the city or at any finished forward base.
  const trainingSites = armies.filter((a) => canTrainAt(state, player, a.hex));
  const [siteId, setSiteId] = useState<string | null>(null);
  const site = trainingSites.find((a) => a.id === siteId) ?? trainingSites[0] ?? null;

  const used = trainingCapacityUsed(state, viewerId);
  const capacity = trainingCapacity(state, player);
  const barracks = player.loadout.barracksLevel;
  const nextUnlocks = troopsUnlockedAtBarracks(barracks + 1);

  const act = (result: { ok: boolean; reason?: string }, success: string) => {
    onAct(result.ok ? success : (result.reason ?? 'No se puede'));
  };

  return (
    <div className="panel">
      <div className="panel-title">Tu ciudad · base de operaciones</div>
      <div className="panel-body stack">
        {!capital ? (
          <div className="small faint">Has perdido tu ciudad.</div>
        ) : (
          <>
            <button className="row clickable" onClick={() => onFocus(capital)}>
              <span className="grow">
                <span className="name">{'\u{1F3D9}'} Ciudad en {capital}</span>
                <span className="sub">
                  Zona 1 · desde aqui despliegas y reclutas. Toca para centrar la camara.
                </span>
              </span>
            </button>

            <div className="grid-3">
              <div className="stat-tile">
                <div className="label">Cuartel</div>
                <div className="value">N{barracks}</div>
              </div>
              <div className="stat-tile">
                <div className="label">Contingente</div>
                <div className="value small">
                  {used}/{capacity}
                </div>
              </div>
              <div className="stat-tile">
                <div className="label">Ejercitos</div>
                <div className="value small">
                  {armies.length}/{effectiveArmySlots(state, viewerId)}
                </div>
              </div>
            </div>

            <div className="bar good">
              <span style={{ width: `${Math.min(100, (used / Math.max(1, capacity)) * 100)}%` }} />
            </div>

            {/* ---------------------------------------------------- recruiting */}
            <div className="panel-title" style={{ padding: '6px 0 2px' }}>
              Reclutamiento
            </div>

            {trainingSites.length === 0 ? (
              <div className="small faint">
                Necesitas un ejercito situado en tu ciudad o en una base militar propia para
                reclutar. Lleva uno de vuelta, o construye una base militar en el frente.
              </div>
            ) : (
              <>
                {trainingSites.length > 1 && (
                  <div className="btn-row">
                    {trainingSites.map((a) => (
                      <button
                        key={a.id}
                        className={`btn small${site?.id === a.id ? ' active' : ''}`}
                        onClick={() => setSiteId(a.id)}
                      >
                        {a.name}
                      </button>
                    ))}
                  </div>
                )}

                <div className="inline">
                  {[1, 5, 10, 25].map((n) => (
                    <button
                      key={n}
                      className={`btn small${count === n ? ' active' : ''}`}
                      onClick={() => setCount(n)}
                    >
                      x{n}
                    </button>
                  ))}
                </div>

                <div className="list">
                  {TROOP_IDS.map((troopId) => {
                    const def = troopDef(troopId);
                    const unlocked = availableTroops(player).includes(troopId);
                    const lock = troopLockReason(player, troopId);
                    const check = site ? canTrain(state, player, site, troopId, count) : null;
                    const level = player.troopLevels[troopId] ?? 1;
                    const enabled = unlocked && !!check?.ok;
                    return (
                      <button
                        key={troopId}
                        className="row clickable"
                        disabled={!enabled}
                        style={{ opacity: unlocked ? (enabled ? 1 : 0.6) : 0.4, textAlign: 'left' }}
                        onClick={() =>
                          site &&
                          act(
                            trainTroops(state, viewerId, site.id, troopId, count),
                            `Reclutados ${count} x ${def.name}`,
                          )
                        }
                      >
                        <span className="grow">
                          <span className="name">
                            {def.name} <span className="faint">N{level}</span> x{count}
                          </span>
                          <span className="sub">
                            Atk {troopAttackAt(def, level)} · Def {troopDefenseAt(def, level)} · Mov{' '}
                            {def.movement} · {def.slots} plazas c/u
                          </span>
                          <span className="sub">{def.description}</span>
                          {lock ? (
                            <span className="sub bad">{lock}</span>
                          ) : (
                            <span className="sub mono">{formatCost(check?.cost ?? def.cost)}</span>
                          )}
                          {!lock && check && !check.ok && (
                            <span className="sub bad">{check.reason}</span>
                          )}
                        </span>
                        <span className="tag">{def.domain}</span>
                      </button>
                    );
                  })}
                </div>

                {nextUnlocks.length > 0 && (
                  <div className="small faint">
                    Cuartel nivel {barracks + 1} abriria:{' '}
                    {nextUnlocks.map((d) => d.name).join(', ')}. Se sube en la ciudad, entre
                    partidas.
                  </div>
                )}
              </>
            )}

            {/* ------------------------------------------------------ deploying */}
            <div className="panel-title" style={{ padding: '6px 0 2px' }}>
              Despliegue
            </div>
            {garrison.length === 0 ? (
              <div className="small faint">
                No hay tropas en la ciudad para formar una marcha nueva.
              </div>
            ) : (
              <div className="list">
                {garrison.map((army) => (
                  <div key={army.id} className="row" style={{ flexWrap: 'wrap' }}>
                    <span className="grow">
                      <span className="name">{army.name}</span>
                      <span className="sub">{armySize(army)} unidades en la ciudad</span>
                      <CompositionBadges composition={army.composition} />
                    </span>
                    <span className="btn-row">
                      <button className="btn small" onClick={() => onSelectArmy(army.id)}>
                        SELECCIONAR
                      </button>
                      <button
                        className="btn small"
                        disabled={
                          armies.length >= effectiveArmySlots(state, viewerId) || armySize(army) < 4
                        }
                        title="Separa la mitad de la infanteria en una marcha nueva"
                        onClick={() => {
                          const split: Record<string, number> = {};
                          for (const [troopId, n] of Object.entries(army.composition)) {
                            if (n >= 2) split[troopId] = Math.floor(n / 2);
                          }
                          act(
                            splitArmy(state, viewerId, army.id, split),
                            'Nueva marcha desplegada desde la ciudad',
                          );
                        }}
                      >
                        DESPLEGAR MARCHA
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* -------------------------------------------- persistent bonuses */}
            <div className="panel-title" style={{ padding: '6px 0 2px' }}>
              Lo que aporta tu ciudad
            </div>
            <div className="grid-3">
              <div className="stat-tile">
                <div className="label">{CITY_BUILDINGS.factory.name}</div>
                <div className="value small">x{player.modifiers.productionMultiplier.toFixed(2)}</div>
              </div>
              <div className="stat-tile">
                <div className="label">Ataque</div>
                <div className="value small">x{player.modifiers.attackMultiplier.toFixed(2)}</div>
              </div>
              <div className="stat-tile">
                <div className="label">Defensa</div>
                <div className="value small">x{player.modifiers.defenseMultiplier.toFixed(2)}</div>
              </div>
              <div className="stat-tile">
                <div className="label">Ciudadanos</div>
                <div className="value small">
                  {player.citizensFree}/{player.citizensTotal}
                </div>
              </div>
              <div className="stat-tile">
                <div className="label">Comandantes</div>
                <div className="value small">{player.commanders.length}</div>
              </div>
              <div className="stat-tile">
                <div className="label">Items</div>
                <div className="value small">{player.items.length}</div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
