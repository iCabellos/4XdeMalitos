import type { AnyMatchResourceId, MatchResourceId, RareResourceId } from './resources';
import type { ResourceCost } from './troops';
import type { TerrainId } from './terrain';

export type MapBuildingId =
  | 'farm'
  | 'lumber_camp'
  | 'mine'
  | 'well'
  | 'power_plant'
  | 'refinery'
  | 'research_post'
  | 'rare_extractor'
  | 'depot'
  | 'watchtower'
  | 'outpost'
  | 'logistics_hub'
  | 'military_base'
  | 'road';

export interface MapBuildingDefinition {
  id: MapBuildingId;
  name: string;
  short: string;
  /** Citizens locked in while the building stands. Freed on destruction. */
  citizens: number;
  cost: ResourceCost;
  /** Days of construction. Resolved on day advance. */
  buildDays: number;
  /** Flat yield per day regardless of node. */
  flatYield?: Partial<Record<MatchResourceId | RareResourceId, number>>;
  /** Multiplier applied to the yield of the resource node underneath. */
  nodeMultiplier?: number;
  /** If set, may only be built on a hex holding a node of one of these types. */
  requiresNode?: string[];
  /** If set, may only be built on these terrains. */
  allowedTerrain?: TerrainId[];
  /** Extra vision radius granted to the owner. */
  vision?: number;
  /** Defensive multiplier for armies stationed on the hex. */
  fortification?: number;
  /** Daily resource drain to stay online. Unpaid buildings go idle. */
  upkeep?: ResourceCost;
  unlockTechnology?: string;
  cityTier?: number;
  /** Grants territory control over adjacent hexes at this radius. */
  claimRadius?: number;
  maxLevel: number;
  description: string;
  color: number;
}

export const MAP_BUILDINGS: Record<MapBuildingId, MapBuildingDefinition> = {
  farm: {
    id: 'farm',
    name: 'Granja',
    short: 'GRJ',
    citizens: 2,
    cost: { materials: 20 },
    buildDays: 1,
    nodeMultiplier: 1,
    flatYield: { food: 2 },
    requiresNode: ['farmland'],
    claimRadius: 1,
    maxLevel: 3,
    description: 'Alimenta ciudadanos y tropas. Sin comida la poblacion deja de crecer.',
    color: 0x9dd45a,
  },
  lumber_camp: {
    id: 'lumber_camp',
    name: 'Campamento forestal',
    short: 'FOR',
    citizens: 2,
    cost: { materials: 15 },
    buildDays: 1,
    nodeMultiplier: 1,
    requiresNode: ['timber'],
    claimRadius: 1,
    maxLevel: 3,
    description: 'Materiales constantes desde el primer dia.',
    color: 0x4f8a3f,
  },
  mine: {
    id: 'mine',
    name: 'Mina',
    short: 'MIN',
    citizens: 3,
    cost: { materials: 30 },
    buildDays: 1,
    nodeMultiplier: 1,
    requiresNode: ['ironVein'],
    claimRadius: 1,
    maxLevel: 3,
    description: 'Metal para vehiculos y estructuras militares.',
    color: 0xa0a8b0,
  },
  well: {
    id: 'well',
    name: 'Pozo',
    short: 'POZ',
    citizens: 2,
    cost: { materials: 25, metal: 10 },
    buildDays: 1,
    nodeMultiplier: 1,
    requiresNode: ['oilField'],
    claimRadius: 1,
    maxLevel: 3,
    description: 'Combustible: sin el, los blindados y la aviacion se paran.',
    color: 0x2f2a24,
  },
  power_plant: {
    id: 'power_plant',
    name: 'Planta energetica',
    short: 'PLE',
    citizens: 3,
    cost: { materials: 35, metal: 15 },
    buildDays: 2,
    nodeMultiplier: 1,
    flatYield: { energy: 3 },
    requiresNode: ['geothermal'],
    unlockTechnology: 'field_engineering',
    claimRadius: 1,
    maxLevel: 3,
    description: 'Energia para extractores y drones.',
    color: 0x63c7e8,
  },
  refinery: {
    id: 'refinery',
    name: 'Refineria',
    short: 'REF',
    citizens: 4,
    cost: { materials: 45, metal: 25 },
    buildDays: 2,
    flatYield: { fuel: 4, ammo: 3 },
    upkeep: { energy: 2 },
    allowedTerrain: ['plains', 'wasteland', 'urban', 'ruins', 'hills'],
    unlockTechnology: 'field_engineering',
    claimRadius: 1,
    maxLevel: 3,
    description: 'Convierte infraestructura en combustible y municion. Consume energia.',
    color: 0xd4772f,
  },
  research_post: {
    id: 'research_post',
    name: 'Puesto de investigacion',
    short: 'INV',
    citizens: 3,
    cost: { materials: 30, energy: 10 },
    buildDays: 1,
    nodeMultiplier: 1,
    flatYield: { science: 1 },
    requiresNode: ['researchSite'],
    claimRadius: 1,
    maxLevel: 3,
    description: 'Ciencia sobre el terreno. Las ruinas guardan cosas que no deberian existir.',
    color: 0xa98ce8,
  },
  rare_extractor: {
    id: 'rare_extractor',
    name: 'Extractor de recurso raro',
    short: 'EXT',
    citizens: 5,
    cost: { materials: 50, metal: 30, energy: 15 },
    buildDays: 2,
    nodeMultiplier: 1,
    upkeep: { energy: 3 },
    requiresNode: ['titaniumDeposit', 'uraniumDeposit', 'crystalDeposit'],
    unlockTechnology: 'deep_extraction',
    claimRadius: 1,
    maxLevel: 3,
    description: 'La unica forma de sacar titanio, uranio o cristal del suelo.',
    color: 0x7fd4d4,
  },
  depot: {
    id: 'depot',
    name: 'Deposito',
    short: 'DEP',
    citizens: 2,
    cost: { materials: 25 },
    buildDays: 1,
    claimRadius: 1,
    maxLevel: 3,
    description: 'Sube el techo de almacenamiento. Lo que no cabe, se pierde.',
    color: 0xc8a165,
  },
  watchtower: {
    id: 'watchtower',
    name: 'Torre de vigilancia',
    short: 'TOR',
    citizens: 1,
    cost: { materials: 18 },
    buildDays: 1,
    vision: 3,
    fortification: 1.15,
    claimRadius: 1,
    maxLevel: 3,
    description: 'Vision permanente. Barata, y por eso decisiva contra el fog of war.',
    color: 0xe8dcc8,
  },
  outpost: {
    id: 'outpost',
    name: 'Puesto avanzado',
    short: 'PAV',
    citizens: 3,
    cost: { materials: 40, metal: 10 },
    buildDays: 1,
    vision: 2,
    fortification: 1.3,
    claimRadius: 2,
    maxLevel: 3,
    description: 'Proyecta territorio. Abre regiones restringidas si esta adyacente a ellas.',
    color: 0xb0603a,
  },
  logistics_hub: {
    id: 'logistics_hub',
    name: 'Centro logistico',
    short: 'LOG',
    citizens: 4,
    cost: { materials: 45, metal: 20 },
    buildDays: 2,
    flatYield: { materials: 3 },
    upkeep: { energy: 1 },
    unlockTechnology: 'logistics_network',
    claimRadius: 2,
    vision: 2,
    maxLevel: 3,
    description: 'Aumenta puntos de movimiento de los ejercitos que empiezan cerca.',
    color: 0x7ea6e8,
  },
  military_base: {
    id: 'military_base',
    name: 'Base militar',
    short: 'BAS',
    citizens: 5,
    cost: { materials: 60, metal: 40, ammo: 10 },
    buildDays: 2,
    fortification: 1.5,
    vision: 3,
    claimRadius: 2,
    upkeep: { food: 2, ammo: 1 },
    unlockTechnology: 'forward_command',
    cityTier: 2,
    maxLevel: 3,
    description: 'Permite reclutar en el frente y suma una plaza de ejercito.',
    color: 0xd9534f,
  },
  road: {
    id: 'road',
    name: 'Carretera',
    short: 'CTR',
    citizens: 1,
    cost: { materials: 10 },
    buildDays: 1,
    maxLevel: 1,
    description: 'Reduce el coste de movimiento del hexagono a la mitad.',
    color: 0x5a5148,
  },
};

export const MAP_BUILDING_IDS = Object.keys(MAP_BUILDINGS) as MapBuildingId[];

export function mapBuildingDef(id: string): MapBuildingDefinition {
  const def = MAP_BUILDINGS[id as MapBuildingId];
  if (!def) throw new Error(`Edificio de mapa desconocido: ${id}`);
  return def;
}

/** Upgrading multiplies output by this per level above 1. */
export const MAP_BUILDING_LEVEL_MULTIPLIER = 0.6;

export function mapBuildingUpgradeCost(def: MapBuildingDefinition, level: number): ResourceCost {
  const out: ResourceCost = {};
  const scale = 1.6 * level;
  for (const [k, v] of Object.entries(def.cost) as [AnyMatchResourceId, number][]) {
    out[k] = Math.round(v * scale);
  }
  return out;
}
