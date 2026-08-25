import type { Domain } from './terrain';
import type { AnyMatchResourceId } from './resources';

export type ResourceCost = Partial<Record<AnyMatchResourceId, number>>;

export type TroopRole = 'infantry' | 'armor' | 'artillery' | 'recon' | 'naval' | 'air';

export interface TroopDefinition {
  id: string;
  name: string;
  domain: Domain;
  role: TroopRole;
  /** Level 1 stats. Higher levels are derived from growth below. */
  attack: number;
  defense: number;
  /** Movement points per day. */
  movement: number;
  /** Hexes it can strike / see from. */
  range: number;
  vision: number;
  cost: ResourceCost;
  /** Resources drained every day this troop is alive, per unit. */
  upkeep: ResourceCost;
  /** Population slots inside an army. */
  slots: number;
  unlockTechnology?: string;
  /** Minimum city technology tier required to field the troop at all. */
  cityTier: number;
  /** Multiplicative stat growth per level, applied as base * growth^(level-1). */
  growth: number;
  /** Extra damage multiplier against these roles. */
  strongVs?: TroopRole[];
  description: string;
}

/**
 * Deliberately small roster: two or three representative units per domain.
 * The system is data-driven, so adding units later is a table edit.
 */
export const TROOPS: Record<string, TroopDefinition> = {
  infantry: {
    id: 'infantry',
    name: 'Infanteria',
    domain: 'land',
    role: 'infantry',
    attack: 10,
    defense: 10,
    movement: 4,
    range: 1,
    vision: 2,
    cost: { materials: 8, food: 4 },
    upkeep: { food: 0.25, ammo: 0.12 },
    slots: 1,
    cityTier: 1,
    growth: 1.35,
    description: 'Barata, versatil y sostenible. La columna vertebral de cualquier avance.',
  },
  heavy_infantry: {
    id: 'heavy_infantry',
    name: 'Infanteria pesada',
    domain: 'land',
    role: 'infantry',
    attack: 16,
    defense: 22,
    movement: 3,
    range: 1,
    vision: 2,
    cost: { materials: 14, metal: 8, ammo: 4 },
    upkeep: { food: 0.35, ammo: 0.25 },
    slots: 2,
    unlockTechnology: 'combined_arms',
    cityTier: 2,
    growth: 1.32,
    strongVs: ['infantry'],
    description: 'Aguanta posiciones. Cara de mover, brutal de desalojar.',
  },
  recon: {
    id: 'recon',
    name: 'Reconocimiento',
    domain: 'land',
    role: 'recon',
    attack: 6,
    defense: 6,
    movement: 8,
    range: 1,
    vision: 4,
    cost: { materials: 6, fuel: 4 },
    upkeep: { fuel: 0.25 },
    slots: 1,
    cityTier: 1,
    growth: 1.25,
    description: 'Abre el mapa. Casi inutil en combate, decisivo en informacion.',
  },
  artillery: {
    id: 'artillery',
    name: 'Artilleria',
    domain: 'land',
    role: 'artillery',
    attack: 26,
    defense: 6,
    movement: 2,
    range: 2,
    vision: 2,
    cost: { materials: 12, metal: 14, ammo: 10 },
    upkeep: { ammo: 0.5, fuel: 0.15 },
    slots: 2,
    unlockTechnology: 'ballistics',
    cityTier: 2,
    growth: 1.38,
    strongVs: ['infantry', 'artillery'],
    description: 'Golpea antes de que el enemigo llegue. Se derrumba si la alcanzan.',
  },
  apc: {
    id: 'apc',
    name: 'Vehiculo blindado',
    domain: 'land',
    role: 'armor',
    attack: 18,
    defense: 18,
    movement: 6,
    range: 1,
    vision: 3,
    cost: { metal: 16, fuel: 8, materials: 8 },
    upkeep: { fuel: 0.7, ammo: 0.3 },
    slots: 2,
    unlockTechnology: 'mechanization',
    cityTier: 2,
    growth: 1.33,
    strongVs: ['artillery', 'recon'],
    description: 'Movilidad blindada. Convierte kilometros en territorio.',
  },
  tank: {
    id: 'tank',
    name: 'Tanque',
    domain: 'land',
    role: 'armor',
    attack: 34,
    defense: 30,
    movement: 5,
    range: 1,
    vision: 3,
    cost: { metal: 26, fuel: 14, titanium: 4 },
    upkeep: { fuel: 1.2, ammo: 0.5 },
    slots: 3,
    unlockTechnology: 'armor_doctrine',
    cityTier: 3,
    growth: 1.36,
    strongVs: ['infantry', 'armor'],
    description: 'El martillo. Necesita titanio, y el titanio se pelea.',
  },
  patrol_boat: {
    id: 'patrol_boat',
    name: 'Patrullera',
    domain: 'water',
    role: 'naval',
    attack: 12,
    defense: 12,
    movement: 7,
    range: 1,
    vision: 4,
    cost: { metal: 12, fuel: 6 },
    upkeep: { fuel: 0.6 },
    slots: 2,
    unlockTechnology: 'naval_ops',
    cityTier: 2,
    growth: 1.3,
    description: 'Cruza el agua y ve lejos. Sin ella el mapa tiene muros liquidos.',
  },
  frigate: {
    id: 'frigate',
    name: 'Fragata',
    domain: 'water',
    role: 'naval',
    attack: 30,
    defense: 26,
    movement: 6,
    range: 2,
    vision: 5,
    cost: { metal: 24, fuel: 12, titanium: 3 },
    upkeep: { fuel: 1.1, ammo: 0.5 },
    slots: 3,
    unlockTechnology: 'blue_water_fleet',
    cityTier: 3,
    growth: 1.34,
    strongVs: ['naval'],
    description: 'Domina el litoral y castiga la costa.',
  },
  drone: {
    id: 'drone',
    name: 'Dron',
    domain: 'air',
    role: 'air',
    attack: 14,
    defense: 6,
    movement: 10,
    range: 2,
    vision: 5,
    cost: { materials: 10, energy: 8, crystal: 1 },
    upkeep: { energy: 0.6 },
    slots: 1,
    unlockTechnology: 'drone_warfare',
    cityTier: 2,
    growth: 1.4,
    strongVs: ['artillery'],
    description: 'Ojos y bisturi. Ignora el terreno, teme al fuego dirigido.',
  },
  helicopter: {
    id: 'helicopter',
    name: 'Helicoptero',
    domain: 'air',
    role: 'air',
    attack: 28,
    defense: 14,
    movement: 8,
    range: 1,
    vision: 4,
    cost: { metal: 18, fuel: 14, titanium: 2 },
    upkeep: { fuel: 1.0, ammo: 0.4 },
    slots: 3,
    unlockTechnology: 'rotary_wing',
    cityTier: 3,
    growth: 1.35,
    strongVs: ['armor'],
    description: 'Llega donde el blindado no llega y lo abre por arriba.',
  },
};

export const TROOP_IDS = Object.keys(TROOPS);

export function troopDef(id: string): TroopDefinition {
  const def = TROOPS[id];
  if (!def) throw new Error(`Tropa desconocida: ${id}`);
  return def;
}

/** Stat at a given level; level 1 returns the base value exactly. */
export function troopStatAtLevel(base: number, level: number, growth: number): number {
  return Math.round(base * Math.pow(growth, Math.max(0, level - 1)));
}

export function troopAttackAt(def: TroopDefinition, level: number): number {
  return troopStatAtLevel(def.attack, level, def.growth);
}

export function troopDefenseAt(def: TroopDefinition, level: number): number {
  return troopStatAtLevel(def.defense, level, def.growth);
}

/** Cost of upgrading a troop line from `level` to `level + 1`. */
export function troopUpgradeCost(def: TroopDefinition, level: number): ResourceCost {
  const scale = 1 + level * 0.9;
  const out: ResourceCost = { science: Math.round(20 * scale) };
  const anchor = def.cost.metal ?? def.cost.materials ?? 10;
  out.materials = Math.round(anchor * 2 * scale);
  if (level >= 2) out.titanium = level - 1 + (def.cityTier >= 3 ? 1 : 0);
  return out;
}

export const MAX_TROOP_LEVEL = 5;
