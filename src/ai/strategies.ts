import type { BotPersonality } from '../core/types';

/**
 * Personality weights feed a utility score. They are intentionally readable
 * numbers rather than a learned policy: the point is that a designer can look
 * at a bot's behaviour and know which line to change.
 */
export interface StrategyWeights {
  /** Value of revealing unknown hexes. */
  explore: number;
  /** Value of common resource nodes and economic buildings. */
  economy: number;
  /** Willingness to spend on troops. */
  military: number;
  /** Value of rare deposits specifically. */
  rare: number;
  /** Value of gates, facilities and the main objective. */
  objective: number;
  /** Willingness to attack when ahead on power. */
  aggression: number;
  /** Preference for staying near owned territory. */
  caution: number;
  /** Likelihood of proposing non-aggression instead of fighting. */
  diplomacy: number;
  /** Fraction of income kept for research. */
  research: number;
}

export const STRATEGIES: Record<BotPersonality, StrategyWeights> = {
  military: {
    explore: 0.6,
    economy: 0.7,
    military: 1.6,
    rare: 1.1,
    objective: 1.3,
    aggression: 1.7,
    caution: 0.4,
    diplomacy: 0.1,
    research: 0.5,
  },
  economic: {
    explore: 0.7,
    economy: 1.7,
    military: 0.7,
    rare: 1.2,
    objective: 0.9,
    aggression: 0.5,
    caution: 1.1,
    diplomacy: 0.6,
    research: 1.3,
  },
  explorer: {
    explore: 1.8,
    economy: 0.9,
    military: 0.8,
    rare: 1.6,
    objective: 1.2,
    aggression: 0.7,
    caution: 0.5,
    diplomacy: 0.5,
    research: 0.9,
  },
  diplomatic: {
    explore: 0.8,
    economy: 1.2,
    military: 0.9,
    rare: 1.0,
    objective: 1.5,
    aggression: 0.4,
    caution: 1.3,
    diplomacy: 1.6,
    research: 1.1,
  },
};

/** Research order preference per personality; first affordable one wins. */
export const RESEARCH_PRIORITY: Record<BotPersonality, string[]> = {
  military: [
    'combined_arms',
    'ballistics',
    'mechanization',
    'recon_doctrine',
    'armor_doctrine',
    'field_engineering',
    'forward_command',
    'drone_warfare',
  ],
  economic: [
    'field_engineering',
    'logistics_network',
    'deep_extraction',
    'industrial_scale',
    'recon_doctrine',
    'anomalous_materials',
    'combined_arms',
  ],
  explorer: [
    'recon_doctrine',
    'field_engineering',
    'deep_extraction',
    'breaching_protocols',
    'logistics_network',
    'naval_ops',
    'drone_warfare',
  ],
  diplomatic: [
    'recon_doctrine',
    'field_engineering',
    'combined_arms',
    'logistics_network',
    'breaching_protocols',
    'deep_extraction',
    'industrial_scale',
  ],
};

/** Troop preference per personality; the first trainable one is bought. */
export const TROOP_PRIORITY: Record<BotPersonality, string[]> = {
  military: ['tank', 'apc', 'artillery', 'heavy_infantry', 'infantry'],
  economic: ['heavy_infantry', 'infantry', 'apc'],
  explorer: ['recon', 'drone', 'apc', 'infantry'],
  diplomatic: ['heavy_infantry', 'artillery', 'infantry'],
};
