import { troopDef, type TroopRole } from '../../data/troops';
import { commanderDef, COMMANDER_ROLE_ICON } from '../../data/commanders';
import { armyPower } from '../../core/combat';
import { armySize } from '../../core/movement';
import type { Army, MatchState } from '../../core/types';

/** Icons carry the read at a glance; the label is there for anyone unsure. */
const DOMAIN_ICON: Record<string, { icon: string; label: string }> = {
  land: { icon: '\u{1F6B6}', label: 'Terrestre' },
  water: { icon: '\u{1F6A2}', label: 'Naval' },
  air: { icon: '✈', label: 'Aereo' },
};

const ROLE_ICON: Record<TroopRole, { icon: string; label: string }> = {
  infantry: { icon: '\u{1F396}', label: 'Infanteria' },
  armor: { icon: '\u{1F69C}', label: 'Blindados' },
  artillery: { icon: '\u{1F4A5}', label: 'Artilleria' },
  recon: { icon: '\u{1F50D}', label: 'Reconocimiento' },
  naval: { icon: '⚓', label: 'Naval' },
  air: { icon: '\u{1F681}', label: 'Aviacion' },
};

/** Counts a composition by troop role and by domain. */
export function summariseComposition(composition: Record<string, number>) {
  const byRole: Partial<Record<TroopRole, number>> = {};
  const byDomain: Record<string, number> = {};
  let total = 0;
  for (const [troopId, count] of Object.entries(composition)) {
    if (count <= 0) continue;
    const def = troopDef(troopId);
    byRole[def.role] = (byRole[def.role] ?? 0) + count;
    byDomain[def.domain] = (byDomain[def.domain] ?? 0) + count;
    total += count;
  }
  return { byRole, byDomain, total };
}

export function CompositionBadges({ composition }: { composition: Record<string, number> }) {
  const { byRole, byDomain, total } = summariseComposition(composition);
  if (total === 0) return <span className="tag">Sin tropas</span>;
  return (
    <div className="badges">
      {Object.entries(byDomain).map(([domain, count]) => {
        const meta = DOMAIN_ICON[domain];
        if (!meta) return null;
        return (
          <span key={domain} className="badge" title={`${meta.label}: ${count} unidades`}>
            <span className="badge-icon">{meta.icon}</span>
            {count}
          </span>
        );
      })}
      <span className="badge-sep" />
      {(Object.entries(byRole) as [TroopRole, number][]).map(([role, count]) => (
        <span key={role} className="badge" title={`${ROLE_ICON[role].label}: ${count}`}>
          <span className="badge-icon">{ROLE_ICON[role].icon}</span>
          {count}
        </span>
      ))}
    </div>
  );
}

/**
 * Full military read on one army: strength, composition and, when a viewer is
 * given, how it compares with the viewer's own force on that hex.
 */
export function ArmyPresence({
  state,
  army,
  compareWith,
}: {
  state: MatchState;
  army: Army;
  compareWith?: number;
}) {
  const power = armyPower(state, army);
  const size = armySize(army);
  const commander = army.commanderId ? commanderDef(army.commanderId) : null;

  // Threat is relative: the same enemy stack is a problem or a target depending
  // on what the player has standing in front of it.
  let threat: { label: string; tone: string } | null = null;
  if (compareWith !== undefined && compareWith > 0) {
    const ratio = power / compareWith;
    threat =
      ratio > 1.5
        ? { label: 'Superior', tone: 'bad' }
        : ratio > 0.85
          ? { label: 'Equilibrado', tone: 'accent' }
          : { label: 'Inferior', tone: 'good' };
  }

  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="inline" style={{ gap: 6 }}>
        <span className="tag info" title="Unidades totales">
          {'\u{1F465}'} {size}
        </span>
        <span className="tag accent" title="Poder militar estimado">
          ⚔ {power}
        </span>
        {commander && (
          <span className="tag" title={`${commander.name} - ${commander.ability.name}`}>
            {COMMANDER_ROLE_ICON[commander.role]} {commander.callsign}
          </span>
        )}
        {threat && <span className={`tag ${threat.tone}`}>{threat.label}</span>}
      </div>
      <CompositionBadges composition={army.composition} />
    </div>
  );
}

/** The same read for a static garrison, which has no owner or commander. */
export function GarrisonPresence({ garrison }: { garrison: Record<string, number> }) {
  const { total } = summariseComposition(garrison);
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="inline" style={{ gap: 6 }}>
        <span className="tag bad" title="Guarnicion defensora">
          {'\u{1F6E1}'} Guarnicion {total}
        </span>
      </div>
      <CompositionBadges composition={garrison} />
    </div>
  );
}
