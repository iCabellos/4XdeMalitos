/**
 * Resource definitions. Two economies exist side by side:
 *  - MATCH resources: spent and produced inside a 9-day match, discarded at the end.
 *  - CITY resources: persistent meta-currency, only meaningfully earned by playing.
 * Rare resources are the bridge: scarce on the map, required by high tiers of both.
 */

export type MatchResourceId =
  | 'food'
  | 'materials'
  | 'energy'
  | 'fuel'
  | 'ammo'
  | 'metal'
  | 'science';

export type RareResourceId = 'titanium' | 'uranium' | 'crystal';

export type CityResourceId =
  | 'gold'
  | 'materials'
  | 'science'
  | 'influence'
  | 'population'
  | 'energy';

/** Anything that can sit in a match stockpile. */
export type AnyMatchResourceId = MatchResourceId | RareResourceId;

export interface ResourceDefinition {
  id: AnyMatchResourceId | CityResourceId;
  name: string;
  short: string;
  icon: string;
  color: string;
  rare: boolean;
  /** Short designer-facing note on what the resource gates. */
  role: string;
}

export const MATCH_RESOURCE_IDS: readonly MatchResourceId[] = [
  'food',
  'materials',
  'energy',
  'fuel',
  'ammo',
  'metal',
  'science',
];

export const RARE_RESOURCE_IDS: readonly RareResourceId[] = ['titanium', 'uranium', 'crystal'];

export const ALL_MATCH_RESOURCE_IDS: readonly AnyMatchResourceId[] = [
  ...MATCH_RESOURCE_IDS,
  ...RARE_RESOURCE_IDS,
];

export const CITY_RESOURCE_IDS: readonly CityResourceId[] = [
  'gold',
  'materials',
  'science',
  'influence',
  'population',
  'energy',
];

export const RESOURCES: Record<string, ResourceDefinition> = {
  food: {
    id: 'food',
    name: 'Comida',
    short: 'COM',
    icon: '\u{1F33E}',
    color: '#8fbf5a',
    rare: false,
    role: 'Sostiene ciudadanos y crecimiento de poblacion en partida.',
  },
  materials: {
    id: 'materials',
    name: 'Materiales',
    short: 'MAT',
    icon: '\u{1F9F1}',
    color: '#c8a165',
    rare: false,
    role: 'Moneda de construccion, dentro y fuera de la ciudad.',
  },
  energy: {
    id: 'energy',
    name: 'Energia',
    short: 'ENE',
    icon: '⚡',
    color: '#63c7e8',
    rare: false,
    role: 'Mantiene edificios avanzados y extractores en linea.',
  },
  fuel: {
    id: 'fuel',
    name: 'Combustible',
    short: 'CBL',
    icon: '\u{1F6E2}',
    color: '#d4772f',
    rare: false,
    role: 'Movilidad: vehiculos, aviacion y unidades navales.',
  },
  ammo: {
    id: 'ammo',
    name: 'Municion',
    short: 'MUN',
    icon: '\u{1F4A5}',
    color: '#d9534f',
    rare: false,
    role: 'Consumida al combatir; sin municion el poder cae.',
  },
  metal: {
    id: 'metal',
    name: 'Metal',
    short: 'MTL',
    icon: '⚙',
    color: '#9aa7b4',
    rare: false,
    role: 'Chasis de vehiculos y estructuras militares.',
  },
  science: {
    id: 'science',
    name: 'Ciencia',
    short: 'CIE',
    icon: '\u{1F9EA}',
    color: '#a98ce8',
    rare: false,
    role: 'Investigacion durante la partida.',
  },
  titanium: {
    id: 'titanium',
    name: 'Titanio',
    short: 'TIT',
    icon: '\u{1F537}',
    color: '#7fd4d4',
    rare: true,
    role: 'Blindaje y estructuras de nivel alto. El cuello de botella militar.',
  },
  uranium: {
    id: 'uranium',
    name: 'Uranio',
    short: 'URA',
    icon: '☢',
    color: '#b6e34a',
    rare: true,
    role: 'Energia de alta densidad; abre las tecnologias tardias.',
  },
  crystal: {
    id: 'crystal',
    name: 'Cristal energetico',
    short: 'CRI',
    icon: '\u{1F48E}',
    color: '#e470c8',
    rare: true,
    role: 'Material anomalo poco comprendido. Requerido por el objetivo central.',
  },
  gold: {
    id: 'gold',
    name: 'Oro',
    short: 'ORO',
    icon: '\u{1FA99}',
    color: '#e8c14a',
    rare: false,
    role: 'Moneda de ciudad: mejoras y mantenimiento.',
  },
  influence: {
    id: 'influence',
    name: 'Influencia',
    short: 'INF',
    icon: '\u{1F91D}',
    color: '#7ea6e8',
    rare: false,
    role: 'Rama diplomatica: acuerdos, comercio y espionaje.',
  },
  population: {
    id: 'population',
    name: 'Poblacion',
    short: 'POB',
    icon: '\u{1F465}',
    color: '#e8dcc8',
    rare: false,
    role: 'Techo de ciudadanos desplegables por partida.',
  },
};

export function resourceDef(id: string): ResourceDefinition {
  const def = RESOURCES[id];
  if (!def) throw new Error(`Recurso desconocido: ${id}`);
  return def;
}

export function isRare(id: string): boolean {
  return RESOURCES[id]?.rare === true;
}
