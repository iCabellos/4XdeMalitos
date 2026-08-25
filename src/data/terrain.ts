import type { MatchResourceId, RareResourceId } from './resources';

export type TerrainId =
  | 'plains'
  | 'forest'
  | 'hills'
  | 'mountain'
  | 'water'
  | 'urban'
  | 'ruins'
  | 'wasteland';

export type Domain = 'land' | 'water' | 'air';

export interface TerrainDefinition {
  id: TerrainId;
  name: string;
  /** Movement points consumed when entering. Infinity == impassable for land. */
  moveCost: number;
  /** Multiplier applied to the defender's power on this tile. */
  defenseModifier: number;
  /** Multiplier applied to the attacker's power on this tile. */
  attackModifier: number;
  /** Blocks line of sight beyond it (used by fog of war). */
  blocksVision: boolean;
  /** Which domains may occupy the tile at all. */
  passableBy: Domain[];
  /** Passive yield when a worker building sits here, before building multipliers. */
  baseYield?: Partial<Record<MatchResourceId, number>>;
  color: number;
  /** Visual height of the hex prism, in world units. */
  height: number;
}

export const TERRAINS: Record<TerrainId, TerrainDefinition> = {
  plains: {
    id: 'plains',
    name: 'Llanura',
    moveCost: 1,
    defenseModifier: 1.0,
    attackModifier: 1.0,
    blocksVision: false,
    passableBy: ['land', 'air'],
    baseYield: { food: 2 },
    color: 0x6f8f4f,
    height: 0.18,
  },
  forest: {
    id: 'forest',
    name: 'Bosque',
    moveCost: 2,
    defenseModifier: 1.25,
    attackModifier: 0.85,
    blocksVision: true,
    passableBy: ['land', 'air'],
    baseYield: { materials: 2, food: 1 },
    color: 0x3f6b39,
    height: 0.3,
  },
  hills: {
    id: 'hills',
    name: 'Colinas',
    moveCost: 2,
    defenseModifier: 1.2,
    attackModifier: 0.95,
    blocksVision: false,
    passableBy: ['land', 'air'],
    baseYield: { metal: 2 },
    color: 0x8a7f52,
    height: 0.45,
  },
  mountain: {
    id: 'mountain',
    name: 'Montana',
    moveCost: 4,
    defenseModifier: 1.5,
    attackModifier: 0.7,
    blocksVision: true,
    passableBy: ['land', 'air'],
    baseYield: { metal: 3 },
    color: 0x7d7a72,
    height: 0.85,
  },
  water: {
    id: 'water',
    name: 'Agua',
    moveCost: 1,
    defenseModifier: 0.9,
    attackModifier: 1.0,
    blocksVision: false,
    passableBy: ['water', 'air'],
    baseYield: { food: 2 },
    color: 0x2c5f86,
    height: 0.08,
  },
  urban: {
    id: 'urban',
    name: 'Zona urbana',
    moveCost: 1,
    defenseModifier: 1.35,
    attackModifier: 0.9,
    blocksVision: true,
    passableBy: ['land', 'air'],
    baseYield: { materials: 2, energy: 1 },
    color: 0x8b8f96,
    height: 0.36,
  },
  ruins: {
    id: 'ruins',
    name: 'Ruinas',
    moveCost: 2,
    defenseModifier: 1.15,
    attackModifier: 0.9,
    blocksVision: false,
    passableBy: ['land', 'air'],
    baseYield: { materials: 1, science: 1 },
    color: 0x6d6357,
    height: 0.26,
  },
  wasteland: {
    id: 'wasteland',
    name: 'Erial',
    moveCost: 1,
    defenseModifier: 0.95,
    attackModifier: 1.05,
    blocksVision: false,
    passableBy: ['land', 'air'],
    baseYield: { fuel: 1 },
    color: 0x9c8a6a,
    height: 0.15,
  },
};

/** Roads are an overlay on top of terrain, not a terrain type. */
export const ROAD_MOVE_COST = 0.5;
export const ROAD_SPEED_BONUS = 1.2;

export interface ResourceNodeDefinition {
  id: string;
  name: string;
  resource: MatchResourceId | RareResourceId;
  /** Yield per day when exploited by the right building. */
  yieldPerDay: number;
  /** Total extractable amount; the node depletes and stops producing. */
  deposit: number;
  /** Building id required to exploit this node. */
  requiresBuilding: string;
  color: number;
}

export const RESOURCE_NODES: Record<string, ResourceNodeDefinition> = {
  farmland: {
    id: 'farmland',
    name: 'Tierra fertil',
    resource: 'food',
    yieldPerDay: 6,
    deposit: 999,
    requiresBuilding: 'farm',
    color: 0x9dd45a,
  },
  timber: {
    id: 'timber',
    name: 'Explotacion forestal',
    resource: 'materials',
    yieldPerDay: 6,
    deposit: 999,
    requiresBuilding: 'lumber_camp',
    color: 0x4f8a3f,
  },
  ironVein: {
    id: 'ironVein',
    name: 'Veta de hierro',
    resource: 'metal',
    yieldPerDay: 6,
    deposit: 120,
    requiresBuilding: 'mine',
    color: 0xa0a8b0,
  },
  oilField: {
    id: 'oilField',
    name: 'Campo petrolifero',
    resource: 'fuel',
    yieldPerDay: 5,
    deposit: 90,
    requiresBuilding: 'well',
    color: 0x2f2a24,
  },
  geothermal: {
    id: 'geothermal',
    name: 'Fuente geotermica',
    resource: 'energy',
    yieldPerDay: 5,
    deposit: 999,
    requiresBuilding: 'power_plant',
    color: 0x63c7e8,
  },
  researchSite: {
    id: 'researchSite',
    name: 'Yacimiento arqueotecnico',
    resource: 'science',
    yieldPerDay: 4,
    deposit: 60,
    requiresBuilding: 'research_post',
    color: 0xa98ce8,
  },
  titaniumDeposit: {
    id: 'titaniumDeposit',
    name: 'Deposito de titanio',
    resource: 'titanium',
    yieldPerDay: 3,
    deposit: 30,
    requiresBuilding: 'rare_extractor',
    color: 0x7fd4d4,
  },
  uraniumDeposit: {
    id: 'uraniumDeposit',
    name: 'Deposito de uranio',
    resource: 'uranium',
    yieldPerDay: 2,
    deposit: 20,
    requiresBuilding: 'rare_extractor',
    color: 0xb6e34a,
  },
  crystalDeposit: {
    id: 'crystalDeposit',
    name: 'Afloramiento de cristal',
    resource: 'crystal',
    yieldPerDay: 2,
    deposit: 18,
    requiresBuilding: 'rare_extractor',
    color: 0xe470c8,
  },
};

export function nodeDef(id: string): ResourceNodeDefinition {
  const def = RESOURCE_NODES[id];
  if (!def) throw new Error(`Nodo de recurso desconocido: ${id}`);
  return def;
}
