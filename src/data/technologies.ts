import type { ResourceCost } from './troops';

export type TechBranch = 'economy' | 'military' | 'expansion';

export interface TechEffects {
  unlockTroops?: string[];
  unlockBuildings?: string[];
  /** Multiplier on all map building output. */
  productionMultiplier?: number;
  attackMultiplier?: number;
  defenseMultiplier?: number;
  /** Flat movement points added to every army. */
  movementBonus?: number;
  /** Flat vision radius added to every army and building. */
  visionBonus?: number;
  /** Extra citizens made available. */
  citizens?: number;
  /** Extra storage capacity. */
  storage?: number;
  /** Regions whose lock type is 'tech' matching this id become passable. */
  opensRegionLock?: boolean;
  /** Yield multiplier specific to rare extractors. */
  rareYieldMultiplier?: number;
}

export interface TechnologyDefinition {
  id: string;
  name: string;
  branch: TechBranch;
  cost: ResourceCost;
  requires: string[];
  /** Minimum city technology tier. Meta-progression gates the tree. */
  cityTier: number;
  effects: TechEffects;
  description: string;
}

/**
 * A single in-match tree, ~15 nodes deep enough to force choices in 9 days.
 * Science income is tight on purpose: a player can realistically finish 5-7.
 */
export const TECHNOLOGIES: Record<string, TechnologyDefinition> = {
  field_engineering: {
    id: 'field_engineering',
    name: 'Ingenieria de campana',
    branch: 'economy',
    cost: { science: 30 },
    requires: [],
    cityTier: 1,
    effects: { unlockBuildings: ['refinery', 'power_plant'], productionMultiplier: 1.05 },
    description: 'Refinerias y plantas energeticas sobre el terreno.',
  },
  logistics_network: {
    id: 'logistics_network',
    name: 'Red logistica',
    branch: 'economy',
    cost: { science: 45, materials: 30 },
    requires: ['field_engineering'],
    cityTier: 1,
    effects: { unlockBuildings: ['logistics_hub'], movementBonus: 1, citizens: 2 },
    description: 'Centros logisticos, +1 movimiento y dos ciudadanos mas en el frente.',
  },
  industrial_scale: {
    id: 'industrial_scale',
    name: 'Escala industrial',
    branch: 'economy',
    cost: { science: 70, materials: 50 },
    requires: ['logistics_network'],
    cityTier: 2,
    effects: { productionMultiplier: 1.2, storage: 200 },
    description: '+20% de produccion en todo el mapa y mas almacenamiento.',
  },
  deep_extraction: {
    id: 'deep_extraction',
    name: 'Extraccion profunda',
    branch: 'economy',
    cost: { science: 80, metal: 40, energy: 20 },
    requires: ['field_engineering'],
    cityTier: 2,
    effects: { unlockBuildings: ['rare_extractor'], rareYieldMultiplier: 1 },
    description: 'Desbloquea el extractor: la unica puerta a titanio, uranio y cristal.',
  },
  anomalous_materials: {
    id: 'anomalous_materials',
    name: 'Materiales anomalos',
    branch: 'economy',
    cost: { science: 140, crystal: 3 },
    requires: ['deep_extraction'],
    cityTier: 3,
    effects: { rareYieldMultiplier: 1.5, productionMultiplier: 1.1 },
    description: 'El cristal responde a estimulos que nadie ha sabido explicar. +50% de raros.',
  },
  combined_arms: {
    id: 'combined_arms',
    name: 'Armas combinadas',
    branch: 'military',
    cost: { science: 40, materials: 25 },
    requires: [],
    cityTier: 1,
    effects: { unlockTroops: ['heavy_infantry'], defenseMultiplier: 1.05 },
    description: 'Infanteria pesada y doctrina de posiciones.',
  },
  ballistics: {
    id: 'ballistics',
    name: 'Balistica',
    branch: 'military',
    cost: { science: 60, metal: 30 },
    requires: ['combined_arms'],
    cityTier: 1,
    effects: { unlockTroops: ['artillery'], attackMultiplier: 1.08 },
    description: 'Artilleria de alcance 2 y +8% de ataque general.',
  },
  mechanization: {
    id: 'mechanization',
    name: 'Mecanizacion',
    branch: 'military',
    cost: { science: 70, metal: 40, fuel: 20 },
    requires: ['combined_arms'],
    cityTier: 2,
    effects: { unlockTroops: ['apc'], movementBonus: 1 },
    description: 'Vehiculos blindados: territorio a velocidad de motor.',
  },
  armor_doctrine: {
    id: 'armor_doctrine',
    name: 'Doctrina acorazada',
    branch: 'military',
    cost: { science: 120, metal: 60, titanium: 4 },
    requires: ['mechanization'],
    cityTier: 3,
    effects: { unlockTroops: ['tank'], attackMultiplier: 1.12 },
    description: 'Tanques. Requiere titanio, y el titanio esta en el centro del mapa.',
  },
  drone_warfare: {
    id: 'drone_warfare',
    name: 'Guerra de drones',
    branch: 'military',
    cost: { science: 90, energy: 40, crystal: 1 },
    requires: ['ballistics'],
    cityTier: 2,
    effects: { unlockTroops: ['drone'], visionBonus: 1 },
    description: 'Drones: vision y golpe quirurgico sin pisar el terreno.',
  },
  rotary_wing: {
    id: 'rotary_wing',
    name: 'Ala rotatoria',
    branch: 'military',
    cost: { science: 130, fuel: 50, titanium: 3 },
    requires: ['drone_warfare'],
    cityTier: 3,
    effects: { unlockTroops: ['helicopter'], movementBonus: 1 },
    description: 'Helicopteros de ataque: el contrablindado por excelencia.',
  },
  recon_doctrine: {
    id: 'recon_doctrine',
    name: 'Doctrina de reconocimiento',
    branch: 'expansion',
    cost: { science: 25 },
    requires: [],
    cityTier: 1,
    effects: { visionBonus: 1, movementBonus: 1 },
    description: 'Barata y temprana: +1 vision y +1 movimiento para todo el ejercito.',
  },
  forward_command: {
    id: 'forward_command',
    name: 'Mando avanzado',
    branch: 'expansion',
    cost: { science: 75, materials: 45, metal: 20 },
    requires: ['recon_doctrine'],
    cityTier: 2,
    effects: { unlockBuildings: ['military_base'] },
    description: 'Bases militares en el frente: fortificacion, vision y una plaza de ejercito extra.',
  },
  breaching_protocols: {
    id: 'breaching_protocols',
    name: 'Protocolos de apertura',
    branch: 'expansion',
    cost: { science: 110, energy: 40, materials: 40 },
    requires: ['recon_doctrine'],
    cityTier: 2,
    effects: { opensRegionLock: true },
    description: 'Abre las regiones restringidas cerradas por tecnologia, sin tomar su puerta.',
  },
  naval_ops: {
    id: 'naval_ops',
    name: 'Operaciones navales',
    branch: 'expansion',
    cost: { science: 65, metal: 35 },
    requires: [],
    cityTier: 2,
    effects: { unlockTroops: ['patrol_boat'] },
    description: 'Patrulleras: el agua deja de ser un muro.',
  },
  blue_water_fleet: {
    id: 'blue_water_fleet',
    name: 'Flota de altura',
    branch: 'expansion',
    cost: { science: 125, metal: 55, titanium: 3 },
    requires: ['naval_ops'],
    cityTier: 3,
    effects: { unlockTroops: ['frigate'] },
    description: 'Fragatas capaces de castigar la costa desde alcance 2.',
  },
};

export const TECHNOLOGY_IDS = Object.keys(TECHNOLOGIES);

export function techDef(id: string): TechnologyDefinition {
  const def = TECHNOLOGIES[id];
  if (!def) throw new Error(`Tecnologia desconocida: ${id}`);
  return def;
}
