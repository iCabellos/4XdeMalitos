/**
 * Diplomacy data.
 *
 * Every participant holds an opinion of every other, moved by what they do to
 * each other rather than by a menu: tribute buys goodwill, an attack burns it,
 * and breaking a signed pact burns it with everyone watching. Stance is what
 * that opinion has been formalised into.
 */
import type { BotPersonality } from '../core/types';

export type Stance = 'war' | 'neutral' | 'nonAggression' | 'alliance';

export const STANCE_LABEL: Record<Stance, string> = {
  war: 'En guerra',
  neutral: 'Neutral',
  nonAggression: 'No agresion',
  alliance: 'Alianza',
};

export const STANCE_COLOR: Record<Stance, string> = {
  war: '#ff5c5c',
  neutral: '#8b98a8',
  nonAggression: '#4da3ff',
  alliance: '#63d471',
};

export const STANCE_ICON: Record<Stance, string> = {
  war: '⚔',
  neutral: '\u{1F91D}',
  nonAggression: '\u{1F54A}',
  alliance: '\u{1F91D}',
};

export type TreatyKind = 'nonAggression' | 'alliance';

export const TREATY_LABEL: Record<TreatyKind, string> = {
  nonAggression: 'Pacto de no agresion',
  alliance: 'Alianza',
};

export const TREATY_DESCRIPTION: Record<TreatyKind, string> = {
  nonAggression:
    'Ninguno de los dos ataca al otro. Romperlo es posible, pero lo ve todo el mundo.',
  alliance:
    'No agresion y vision compartida de lo que cada uno descubre. Solo con alguien que ya te aprecia.',
};

export const OPINION = {
  min: -100,
  max: 100,
  /**
   * Goodwill needed before a bot will sign. Deliberately high: when a pact was
   * nearly free, every bot signed with every bot and the match had no combat
   * left in it. A pact has to be bought, with tribute or with time.
   */
  requiredFor: { nonAggression: 22, alliance: 60 } as Record<TreatyKind, number>,
  /** Opinion change per event. */
  onTribute: 1 / 12, // per unit of common resource offered
  onTributeRare: 4, // per unit of rare resource offered
  onAttacked: -35,
  onPactBroken: -60,
  /** Everyone else's opinion of an oath-breaker also drops. */
  onPactBrokenWitness: -15,
  onTreatySigned: 12,
  onWarDeclared: -45,
  /** Drift back towards neutral each day, so grudges fade slowly. */
  dailyDrift: 2,
} as const;

/** How eager each personality is to sign anything at all. */
export const DIPLOMATIC_APPETITE: Record<BotPersonality, number> = {
  military: 0.35,
  economic: 0.9,
  explorer: 0.7,
  diplomatic: 1.4,
};

/**
 * A bot will not hold more treaties than this. Without a ceiling, a table of
 * five ends up fully pacted and nobody ever fights.
 */
export const MAX_BOT_TREATIES = 2;

/** Cost in influence-equivalent goodwill a bot expects before allying. */
export const TRIBUTE_PRESETS: { label: string; resources: Record<string, number> }[] = [
  { label: 'Suministros', resources: { materials: 60, food: 40 } },
  { label: 'Municion', resources: { ammo: 40, metal: 30 } },
  { label: 'Titanio', resources: { titanium: 4 } },
];
