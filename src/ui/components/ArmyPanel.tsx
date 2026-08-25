import { useState } from 'react';
import { troopDef, troopAttackAt, troopDefenseAt } from '../../data/troops';
import { commanderDef } from '../../data/commanders';
import { armySize } from '../../core/movement';
import { armyPower } from '../../core/combat';
import { armySlotsUsed, armySlotCapacity, canTrain, canTrainAt } from '../../core/economy';
import { availableTroops } from '../../core/technology';
import { assignCommander, effectiveArmySlots, splitArmy, trainTroops, mergeArmies } from '../../core/actions';
import { armiesOf } from '../../core/gameState';
import { formatCost } from '../../core/resources';
import type { MatchState, PlayerId } from '../../core/types';

interface Props {
  state: MatchState;
  viewerId: PlayerId;
  selectedArmyId: string | null;
  onSelectArmy: (id: string) => void;
  onAct: (message: string) => void;
}

/** Army roster, composition, commander assignment and recruitment. */
export function ArmyPanel({ state, viewerId, selectedArmyId, onSelectArmy, onAct }: Props) {
  const [trainCount, setTrainCount] = useState(5);
  const player = state.players.find((p) => p.id === viewerId)!;
  const armies = armiesOf(state, viewerId);
  const selected = selectedArmyId ? state.armies[selectedArmyId] : null;
  const slots = effectiveArmySlots(state, viewerId);

  const runAction = (result: { ok: boolean; reason?: string }, success: string) => {
    onAct(result.ok ? success : (result.reason ?? 'Accion no permitida'));
  };

  return (
    <div className="panel">
      <div className="panel-title">
        Ejercitos {armies.length}/{slots}
      </div>
      <div className="panel-body stack">
        <div className="list">
          {armies.map((army) => (
            <button
              key={army.id}
              className={`row clickable${army.id === selectedArmyId ? ' selected' : ''}`}
              onClick={() => onSelectArmy(army.id)}
              style={{ textAlign: 'left', border: undefined }}
            >
              <span className="grow">
                <span className="name">{army.name}</span>
                <span className="sub">
                  {armySize(army)} u · poder {armyPower(state, army)} · MP{' '}
                  {army.movementPoints.toFixed(1)}/{army.maxMovementPoints.toFixed(1)}
                </span>
              </span>
              {army.commanderId && <span className="tag accent">{commanderDef(army.commanderId).callsign}</span>}
            </button>
          ))}
        </div>

        {selected && (
          <>
            <div className="small faint">
              Capacidad {armySlotsUsed(selected)}/{armySlotCapacity(player)} plazas
            </div>

            <div className="list">
              {Object.entries(selected.composition)
                .filter(([, count]) => count > 0)
                .map(([troopId, count]) => {
                  const def = troopDef(troopId);
                  const level = player.troopLevels[troopId] ?? 1;
                  return (
                    <div key={troopId} className="row">
                      <span className="grow">
                        <span className="name">
                          {def.name} <span className="faint">N{level}</span>
                        </span>
                        <span className="sub">
                          Atk {troopAttackAt(def, level)} · Def {troopDefenseAt(def, level)} · Mov{' '}
                          {def.movement} · Alc {def.range}
                        </span>
                      </span>
                      <span className="mono" style={{ fontWeight: 700 }}>
                        {count}
                      </span>
                    </div>
                  );
                })}
            </div>

            <div className="panel-title" style={{ padding: '6px 0 2px' }}>
              Comandante
            </div>
            <div className="btn-grid">
              <button
                className={`btn small${selected.commanderId === null ? ' active' : ''}`}
                onClick={() =>
                  runAction(assignCommander(state, viewerId, selected.id, null), 'Comandante retirado')
                }
              >
                Ninguno
              </button>
              {player.commanders.map((id) => {
                const def = commanderDef(id);
                return (
                  <button
                    key={id}
                    className={`btn small${selected.commanderId === id ? ' active' : ''}`}
                    title={`${def.name} · ${def.ability.name}: ${def.ability.description}`}
                    onClick={() =>
                      runAction(
                        assignCommander(state, viewerId, selected.id, id),
                        `${def.callsign} al mando de ${selected.name}`,
                      )
                    }
                  >
                    {def.callsign}
                  </button>
                );
              })}
            </div>
            {selected.commanderId && (
              <div className="small faint">
                {commanderDef(selected.commanderId).ability.name}:{' '}
                {commanderDef(selected.commanderId).ability.description}
              </div>
            )}

            <div className="panel-title" style={{ padding: '6px 0 2px' }}>
              Reclutar
            </div>
            {!canTrainAt(state, player, selected.hex) ? (
              <div className="small faint">
                Solo puedes reclutar en tu base inicial o en una base militar propia.
              </div>
            ) : (
              <>
                <div className="inline">
                  {[1, 5, 10, 25].map((n) => (
                    <button
                      key={n}
                      className={`btn small${trainCount === n ? ' active' : ''}`}
                      onClick={() => setTrainCount(n)}
                    >
                      x{n}
                    </button>
                  ))}
                </div>
                <div className="list">
                  {availableTroops(player).map((troopId) => {
                    const def = troopDef(troopId);
                    const check = canTrain(state, player, selected, troopId, trainCount);
                    return (
                      <button
                        key={troopId}
                        className="row clickable"
                        disabled={!check.ok}
                        style={{ opacity: check.ok ? 1 : 0.45, textAlign: 'left' }}
                        title={check.reason ?? def.description}
                        onClick={() =>
                          runAction(
                            trainTroops(state, viewerId, selected.id, troopId, trainCount),
                            `Reclutados ${trainCount} x ${def.name}`,
                          )
                        }
                      >
                        <span className="grow">
                          <span className="name">
                            {def.name} x{trainCount}
                          </span>
                          <span className="sub mono">{formatCost(check.cost)}</span>
                        </span>
                        <span className="tag">{def.domain}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            <div className="btn-row">
              <button
                className="btn small"
                disabled={armies.length >= slots || armySize(selected) < 4}
                onClick={() => {
                  // Peel off a scout detachment: the cheapest way to open a map.
                  const split: Record<string, number> = {};
                  const recon = selected.composition.recon ?? 0;
                  const infantry = selected.composition.infantry ?? 0;
                  if (recon >= 2) split.recon = Math.floor(recon / 2);
                  else if (infantry >= 4) split.infantry = Math.floor(infantry / 3);
                  runAction(
                    splitArmy(state, viewerId, selected.id, split),
                    'Nuevo destacamento formado',
                  );
                }}
              >
                Dividir
              </button>
              {armies
                .filter((a) => a.id !== selected.id && a.hex === selected.hex)
                .map((a) => (
                  <button
                    key={a.id}
                    className="btn small"
                    onClick={() => runAction(mergeArmies(state, a.id, selected.id), 'Ejercitos unidos')}
                  >
                    Absorber {a.name}
                  </button>
                ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
