import type { CityResourceId, RareResourceId } from './resources';

export type CityCost = Partial<Record<CityResourceId | RareResourceId, number>>;

export type CityBranch = 'economic' | 'military' | 'diplomatic';

/**
 * Effects a city building grants at a given level. These are the ONLY channel
 * through which the persistent city changes what a match looks like, so the
 * whole meta -> match contract is readable in one place.
 */
export interface CityEffects {
  /** Extra starting citizens in a match. */
  citizens?: number;
  /** Extra starting match resources. */
  startResources?: Partial<Record<string, number>>;
  /** Maximum simultaneous armies. */
  armySlots?: number;
  /** Commanders that may be taken into a match. */
  commanderSlots?: number;
  /** Cap for in-match troop levels. */
  troopLevelCap?: number;
  /** Multiplier on all map building output. */
  productionMultiplier?: number;
  /** Multiplier on science earned in match. */
  scienceMultiplier?: number;
  /** Extra storage capacity for every match resource. */
  storage?: number;
  /** Flat movement points added to every army each day. */
  movementBonus?: number;
  /** Multiplier on troop attack, applied in combat. */
  attackMultiplier?: number;
  /** Multiplier on troop defense, applied in combat. */
  defenseMultiplier?: number;
  /** Extra commander XP gained per match. */
  commanderXpBonus?: number;
  /** Multiplier on end-of-match rewards. */
  rewardMultiplier?: number;
  /** Chance bots offer non-aggression instead of attacking (0..1). */
  diplomacyPressure?: number;
  /** Reveals this many hexes around rival start positions at match start. */
  intelReveal?: number;
  /** Raises the city technology tier, gating advanced buildings and research. */
  cityTier?: number;
  /**
   * Barracks level. This is what decides which troops you can recruit at all,
   * so it is surfaced as its own effect rather than inferred from the building.
   */
  barracksLevel?: number;
  /** Troops that can be held across all your armies in a match. */
  trainingCapacity?: number;
  /** Passive per-match trickle into the city stockpile. */
  passiveIncome?: Partial<Record<CityResourceId, number>>;
}

export interface CityBuildingDefinition {
  id: string;
  name: string;
  branch: CityBranch;
  icon: string;
  maxLevel: number;
  /** Cost of reaching level N (index 0 == level 1, i.e. the initial build). */
  costPerLevel: CityCost[];
  /** Effects at level N (index 0 == level 1). Cumulative values are absolute. */
  effectsPerLevel: CityEffects[];
  /** Requires the command centre to be at least this level. */
  requiresCommandLevel: number[];
  description: string;
  /** Position on the 3D city plot (axial-ish layout coordinates). */
  plot: { x: number; z: number };
  color: number;
}

const NONE: CityCost = {};

export const CITY_BUILDINGS: Record<string, CityBuildingDefinition> = {
  command_center: {
    id: 'command_center',
    name: 'Centro de mando',
    branch: 'economic',
    icon: '\u{1F3DB}',
    maxLevel: 5,
    plot: { x: 0, z: 0 },
    color: 0xd9d3c4,
    description:
      'Define el nivel tecnologico de la ciudad. Cada nivel abre tropas, edificios y tecnologias mas profundas.',
    costPerLevel: [
      NONE,
      { gold: 200, materials: 250 },
      { gold: 500, materials: 600, science: 200, titanium: 8 },
      { gold: 1200, materials: 1400, science: 600, titanium: 20, uranium: 10 },
      { gold: 2600, materials: 3000, science: 1400, titanium: 45, uranium: 25, crystal: 15 },
    ],
    effectsPerLevel: [
      { cityTier: 1, armySlots: 2, commanderSlots: 1, passiveIncome: { gold: 40, materials: 30 } },
      { cityTier: 2, armySlots: 2, commanderSlots: 1, passiveIncome: { gold: 60, materials: 45 } },
      { cityTier: 3, armySlots: 3, commanderSlots: 2, passiveIncome: { gold: 85, materials: 65 } },
      { cityTier: 4, armySlots: 3, commanderSlots: 2, passiveIncome: { gold: 115, materials: 90 } },
      { cityTier: 5, armySlots: 4, commanderSlots: 3, passiveIncome: { gold: 150, materials: 120 } },
    ],
    requiresCommandLevel: [0, 0, 0, 0, 0],
  },
  barracks: {
    id: 'barracks',
    name: 'Cuartel',
    branch: 'military',
    icon: '\u{1F396}',
    maxLevel: 5,
    plot: { x: -2.2, z: 1.6 },
    color: 0xb04a3a,
    description:
      'Decide QUE tropas puedes reclutar. Cada nivel abre una rama nueva, sube el ' +
      'contingente que puedes sostener y mejora el ataque.',
    costPerLevel: [
      { gold: 60, materials: 80 },
      { gold: 160, materials: 200 },
      { gold: 380, materials: 460, titanium: 6 },
      { gold: 800, materials: 950, titanium: 16, uranium: 6 },
      { gold: 1700, materials: 2000, titanium: 34, uranium: 16 },
    ],
    effectsPerLevel: [
      { attackMultiplier: 1.0, barracksLevel: 1, trainingCapacity: 60, startResources: { infantryStart: 10 } },
      { attackMultiplier: 1.06, barracksLevel: 2, trainingCapacity: 95, startResources: { infantryStart: 16 } },
      { attackMultiplier: 1.12, barracksLevel: 3, trainingCapacity: 135, startResources: { infantryStart: 24 } },
      { attackMultiplier: 1.2, barracksLevel: 4, trainingCapacity: 185, startResources: { infantryStart: 34 } },
      { attackMultiplier: 1.3, barracksLevel: 5, trainingCapacity: 250, startResources: { infantryStart: 46 } },
    ],
    requiresCommandLevel: [1, 1, 2, 3, 4],
  },
  academy: {
    id: 'academy',
    name: 'Academia',
    branch: 'military',
    icon: '\u{1F393}',
    maxLevel: 5,
    plot: { x: -3.4, z: -1.2 },
    color: 0x8a5fb0,
    description: 'Comandantes disponibles, experiencia ganada y techo de nivel de tropa.',
    costPerLevel: [
      { gold: 80, science: 60 },
      { gold: 220, science: 180 },
      { gold: 500, science: 420, titanium: 5 },
      { gold: 1000, science: 900, titanium: 14, crystal: 6 },
      { gold: 2100, science: 1900, titanium: 30, crystal: 14 },
    ],
    effectsPerLevel: [
      { commanderSlots: 1, troopLevelCap: 2, commanderXpBonus: 0 },
      { commanderSlots: 1, troopLevelCap: 3, commanderXpBonus: 20 },
      { commanderSlots: 2, troopLevelCap: 3, commanderXpBonus: 45 },
      { commanderSlots: 2, troopLevelCap: 4, commanderXpBonus: 80 },
      { commanderSlots: 3, troopLevelCap: 5, commanderXpBonus: 130 },
    ],
    requiresCommandLevel: [1, 2, 2, 3, 4],
  },
  logistics_center: {
    id: 'logistics_center',
    name: 'Centro logistico',
    branch: 'economic',
    icon: '\u{1F69B}',
    maxLevel: 5,
    plot: { x: 2.4, z: 1.4 },
    color: 0x4f7fb0,
    description: 'Ciudadanos desplegables y puntos de movimiento de los ejercitos.',
    costPerLevel: [
      { gold: 70, materials: 90 },
      { gold: 190, materials: 240 },
      { gold: 430, materials: 520, titanium: 4 },
      { gold: 900, materials: 1050, titanium: 12 },
      { gold: 1900, materials: 2200, titanium: 26, uranium: 12 },
    ],
    effectsPerLevel: [
      { citizens: 8, movementBonus: 0 },
      { citizens: 11, movementBonus: 1 },
      { citizens: 14, movementBonus: 1 },
      { citizens: 18, movementBonus: 2 },
      { citizens: 23, movementBonus: 3 },
    ],
    requiresCommandLevel: [1, 1, 2, 3, 4],
  },
  warehouse: {
    id: 'warehouse',
    name: 'Almacen',
    branch: 'economic',
    icon: '\u{1F4E6}',
    maxLevel: 5,
    plot: { x: 3.4, z: -1.4 },
    color: 0xc09a5a,
    description: 'Recursos iniciales de partida y techo de almacenamiento.',
    costPerLevel: [
      { gold: 50, materials: 70 },
      { gold: 150, materials: 190 },
      { gold: 350, materials: 430 },
      { gold: 760, materials: 880, titanium: 10 },
      { gold: 1600, materials: 1850, titanium: 22 },
    ],
    effectsPerLevel: [
      { storage: 300, startResources: { materials: 60, food: 40, metal: 20 } },
      { storage: 420, startResources: { materials: 90, food: 60, metal: 35, energy: 15 } },
      { storage: 560, startResources: { materials: 130, food: 85, metal: 55, energy: 30, fuel: 20 } },
      { storage: 740, startResources: { materials: 180, food: 115, metal: 80, energy: 50, fuel: 40, ammo: 25 } },
      { storage: 980, startResources: { materials: 250, food: 150, metal: 115, energy: 75, fuel: 65, ammo: 45 } },
    ],
    requiresCommandLevel: [1, 1, 2, 3, 4],
  },
  factory: {
    id: 'factory',
    name: 'Fabrica',
    branch: 'economic',
    icon: '\u{1F3ED}',
    maxLevel: 5,
    plot: { x: 1.4, z: 3.2 },
    color: 0x9a6b3a,
    description: 'Multiplica la produccion de todos los edificios construidos en el mapa.',
    costPerLevel: [
      { gold: 100, materials: 140 },
      { gold: 260, materials: 330, energy: 40 },
      { gold: 580, materials: 700, energy: 90, titanium: 7 },
      { gold: 1200, materials: 1400, energy: 200, titanium: 18, uranium: 8 },
      { gold: 2400, materials: 2800, energy: 420, titanium: 38, uranium: 20 },
    ],
    effectsPerLevel: [
      { productionMultiplier: 1.0 },
      { productionMultiplier: 1.1 },
      { productionMultiplier: 1.22 },
      { productionMultiplier: 1.36 },
      { productionMultiplier: 1.55 },
    ],
    requiresCommandLevel: [1, 2, 2, 3, 4],
  },
  tech_center: {
    id: 'tech_center',
    name: 'Centro tecnologico',
    branch: 'economic',
    icon: '\u{1F52C}',
    maxLevel: 5,
    plot: { x: -1.4, z: 3.4 },
    color: 0x5aa8b0,
    description: 'Ciencia inicial, ritmo de investigacion y acceso a tecnologias tardias.',
    costPerLevel: [
      { gold: 90, science: 80 },
      { gold: 240, science: 220 },
      { gold: 540, science: 500, crystal: 4 },
      { gold: 1100, science: 1050, crystal: 12, uranium: 8 },
      { gold: 2300, science: 2200, crystal: 26, uranium: 18 },
    ],
    effectsPerLevel: [
      { scienceMultiplier: 1.0, startResources: { science: 20 } },
      { scienceMultiplier: 1.12, startResources: { science: 45 } },
      { scienceMultiplier: 1.26, startResources: { science: 80 } },
      { scienceMultiplier: 1.42, startResources: { science: 130 } },
      { scienceMultiplier: 1.6, startResources: { science: 200 } },
    ],
    requiresCommandLevel: [1, 2, 3, 3, 4],
  },
  diplomatic_center: {
    id: 'diplomatic_center',
    name: 'Centro diplomatico',
    branch: 'diplomatic',
    icon: '\u{1F54A}',
    maxLevel: 5,
    plot: { x: 0, z: -3.4 },
    color: 0x7ea6e8,
    description:
      'Inteligencia inicial sobre rivales, presion diplomatica sobre los bots y mejores recompensas.',
    costPerLevel: [
      { gold: 80, influence: 60 },
      { gold: 210, influence: 170 },
      { gold: 480, influence: 400, crystal: 3 },
      { gold: 980, influence: 850, crystal: 10 },
      { gold: 2000, influence: 1800, crystal: 22, uranium: 14 },
    ],
    effectsPerLevel: [
      { diplomacyPressure: 0.05, intelReveal: 0, rewardMultiplier: 1.0 },
      { diplomacyPressure: 0.12, intelReveal: 1, rewardMultiplier: 1.06 },
      { diplomacyPressure: 0.2, intelReveal: 2, rewardMultiplier: 1.14 },
      { diplomacyPressure: 0.3, intelReveal: 2, rewardMultiplier: 1.24 },
      { diplomacyPressure: 0.42, intelReveal: 3, rewardMultiplier: 1.4 },
    ],
    requiresCommandLevel: [1, 2, 2, 3, 4],
  },
};

export const CITY_BUILDING_IDS = Object.keys(CITY_BUILDINGS);

export function cityBuildingDef(id: string): CityBuildingDefinition {
  const def = CITY_BUILDINGS[id];
  if (!def) throw new Error(`Edificio de ciudad desconocido: ${id}`);
  return def;
}
