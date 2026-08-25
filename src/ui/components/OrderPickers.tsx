import { troopDef, troopAttackAt, troopDefenseAt } from '../../data/troops';
import {
  commanderDef,
  COMMANDER_ROLE_ICON,
  COMMANDER_ROLE_LABEL,
  type CommanderRole,
} from '../../data/commanders';
import { CompositionBadges } from './MilitaryBadges';
import type { Army, MatchPlayer } from '../../core/types';

const ROLE_ORDER: CommanderRole[] = ['assault', 'scout', 'gather', 'build'];

/**
 * Picks which units move. Defaults to the whole army, because sending
 * everything is the common case; anything less peels off a detachment.
 */
export function UnitPicker({
  army,
  player,
  selection,
  onChange,
  onCancel,
}: {
  army: Army;
  player: MatchPlayer;
  selection: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
  onCancel: () => void;
}) {
  const entries = Object.entries(army.composition).filter(([, count]) => count > 0);
  const totalSelected = Object.values(selection).reduce((a, b) => a + b, 0);
  const totalAvailable = entries.reduce((sum, [, count]) => sum + count, 0);
  const partial = totalSelected > 0 && totalSelected < totalAvailable;

  const setCount = (troopId: string, value: number) => {
    const max = army.composition[troopId] ?? 0;
    onChange({ ...selection, [troopId]: Math.max(0, Math.min(max, value)) });
  };

  const all = () => {
    const next: Record<string, number> = {};
    for (const [troopId, count] of entries) next[troopId] = count;
    onChange(next);
  };

  const none = () => onChange({});

  return (
    <div className="panel">
      <div className="panel-title">Mover · elige las unidades</div>
      <div className="panel-body stack">
        <div className="btn-row">
          <button className="btn small" onClick={all}>
            TODAS
          </button>
          <button className="btn small" onClick={none}>
            NINGUNA
          </button>
          <span className="spacer" />
          <button className="btn small ghost" onClick={onCancel}>
            CANCELAR
          </button>
        </div>

        <div className="list">
          {entries.map(([troopId, available]) => {
            const def = troopDef(troopId);
            const level = player.troopLevels[troopId] ?? 1;
            const value = selection[troopId] ?? 0;
            return (
              <div key={troopId} className="picker-row">
                <span className="grow">
                  <span className="name">
                    {def.name} <span className="faint">N{level}</span>
                  </span>
                  <span className="sub">
                    Atk {troopAttackAt(def, level)} · Def {troopDefenseAt(def, level)} · Mov{' '}
                    {def.movement} · disponibles {available}
                  </span>
                </span>
                <span className="stepper">
                  <button onClick={() => setCount(troopId, value - 1)} disabled={value <= 0}>
                    −
                  </button>
                  <span className="count">{value}</span>
                  <button
                    onClick={() => setCount(troopId, value + 1)}
                    disabled={value >= available}
                  >
                    +
                  </button>
                </span>
              </div>
            );
          })}
        </div>

        <CompositionBadges composition={selection} />

        <div className="small faint">
          {totalSelected === 0
            ? 'Selecciona al menos una unidad y toca el hexagono destino.'
            : partial
              ? `Se separara un destacamento de ${totalSelected} unidades. Toca el hexagono destino.`
              : `Se movera el ejercito completo (${totalSelected}). Toca el hexagono destino.`}
        </div>
      </div>
    </div>
  );
}

/**
 * Picks which commander leads the attack. Reassigning is allowed mid-order, so
 * "attack with Koval" works even when Koval is currently elsewhere.
 */
export function CommanderPicker({
  army,
  player,
  selected,
  onSelect,
  onCancel,
}: {
  army: Army;
  player: MatchPlayer;
  selected: string | null;
  onSelect: (commanderId: string | null) => void;
  onCancel: () => void;
}) {
  const available = player.commanders;
  const byRole = ROLE_ORDER.map((role) => ({
    role,
    commanders: available.filter((id) => commanderDef(id).role === role),
  })).filter((group) => group.commanders.length > 0);

  return (
    <div className="panel">
      <div className="panel-title">Atacar · elige comandante</div>
      <div className="panel-body stack">
        <div className="btn-row">
          <button
            className={`btn small${selected === null ? ' active' : ''}`}
            onClick={() => onSelect(null)}
          >
            SIN COMANDANTE
          </button>
          <span className="spacer" />
          <button className="btn small ghost" onClick={onCancel}>
            CANCELAR
          </button>
        </div>

        {byRole.map((group) => (
          <div key={group.role} className="stack" style={{ gap: 6 }}>
            <div className="panel-title" style={{ padding: '2px 0 0' }}>
              {COMMANDER_ROLE_ICON[group.role]} {COMMANDER_ROLE_LABEL[group.role]}
            </div>
            <div className="list">
              {group.commanders.map((id) => {
                const def = commanderDef(id);
                const leadingElsewhere = army.commanderId !== id;
                return (
                  <button
                    key={id}
                    className={`row clickable${selected === id ? ' selected' : ''}`}
                    style={{ textAlign: 'left' }}
                    onClick={() => onSelect(id)}
                  >
                    <span className="grow">
                      <span className="name">
                        {def.name} <span className="faint">· {def.callsign}</span>
                      </span>
                      <span className="sub">{def.ability.name}: {def.ability.description}</span>
                      <span className="sub faint">
                        Especialidad {def.specialty} · +
                        {Math.round(def.specialtyAttackBonus * 100)}% ataque a esa rama
                      </span>
                    </span>
                    {!leadingElsewhere && <span className="tag good">AL MANDO</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div className="small faint">
          Toca el hexagono enemigo para lanzar el ataque.
        </div>
      </div>
    </div>
  );
}
