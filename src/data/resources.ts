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
  /** One line on what the resource IS, in the world's own terms. */
  flavour: string;
  /** Where it comes from, so a player short of it knows what to go build. */
  sources: string[];
  /** What drains it, so a negative balance is explainable. */
  drains: string[];
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
    flavour: 'Raciones, agua y forraje movidos en camion hasta el frente.',
    sources: ['Granjas sobre tierra fertil', 'Rendimiento base de tu ciudad', 'Bosques y agua adyacentes'],
    drains: ['Cada ciudadano consume 0,3 al dia', 'Infanteria y tropas a pie'],
    rare: false,
    role: 'Sostiene ciudadanos y crecimiento de poblacion en partida.',
  },
  materials: {
    id: 'materials',
    name: 'Materiales',
    short: 'MAT',
    icon: '\u{1F9F1}',
    color: '#c8a165',
    flavour: 'Hormigon, vigas, sacos terreros y todo lo que se atornilla.',
    sources: ['Campamentos forestales', 'Centros logisticos', 'Bases abandonadas'],
    drains: ['Toda construccion en el mapa', 'Reclutamiento de infanteria'],
    rare: false,
    role: 'Moneda de construccion, dentro y fuera de la ciudad.',
  },
  energy: {
    id: 'energy',
    name: 'Energia',
    short: 'ENE',
    icon: '⚡',
    color: '#63c7e8',
    flavour: 'Corriente de plantas geotermicas y generadores de campana.',
    sources: ['Plantas energeticas sobre fuentes geotermicas', 'Zonas urbanas'],
    drains: ['Refinerias y extractores de raros', 'Activar instalaciones (20 por uso)'],
    rare: false,
    role: 'Mantiene edificios avanzados y extractores en linea.',
  },
  fuel: {
    id: 'fuel',
    name: 'Combustible',
    short: 'CBL',
    icon: '\u{1F6E2}',
    color: '#d4772f',
    flavour: 'Diesel y queroseno. Sin el, nada con motor se mueve.',
    sources: ['Pozos sobre campos petroliferos', 'Refinerias'],
    drains: ['Vehiculos, aviacion y unidades navales cada dia'],
    rare: false,
    role: 'Movilidad: vehiculos, aviacion y unidades navales.',
  },
  ammo: {
    id: 'ammo',
    name: 'Municion',
    short: 'MUN',
    icon: '\u{1F4A5}',
    color: '#d9534f',
    flavour: 'Munición de todos los calibres, empaquetada y paletizada.',
    sources: ['Refinerias', 'Rendimiento base de tu ciudad'],
    drains: ['Cada batalla consume segun el poder comprometido', 'Artilleria y blindados'],
    rare: false,
    role: 'Consumida al combatir; sin municion el poder cae.',
  },
  metal: {
    id: 'metal',
    name: 'Metal',
    short: 'MTL',
    icon: '⚙',
    color: '#9aa7b4',
    flavour: 'Acero y aleaciones laminadas para chasis y estructura.',
    sources: ['Minas sobre vetas de hierro', 'Colinas y montanas'],
    drains: ['Vehiculos, buques y estructuras militares'],
    rare: false,
    role: 'Chasis de vehiculos y estructuras militares.',
  },
  science: {
    id: 'science',
    name: 'Ciencia',
    short: 'CIE',
    icon: '\u{1F9EA}',
    color: '#a98ce8',
    flavour: 'Datos, muestras y planos arrancados al terreno.',
    sources: ['Puestos de investigacion sobre yacimientos arqueotecnicos', 'Ruinas y zonas urbanas'],
    drains: ['Cada tecnologia que investigas en partida'],
    rare: false,
    role: 'Investigacion durante la partida.',
  },
  titanium: {
    id: 'titanium',
    name: 'Titanio',
    short: 'TIT',
    icon: '\u{1F537}',
    color: '#7fd4d4',
    flavour: 'Metal ligero y terco. El cuello de botella de todo blindaje serio.',
    sources: ['Extractores sobre depositos de titanio (Zona 2 escaso, Zona 3 abundante)'],
    drains: ['Tanques, fragatas, helicopteros y tecnologias tardias'],
    rare: true,
    role: 'Blindaje y estructuras de nivel alto. El cuello de botella militar.',
  },
  uranium: {
    id: 'uranium',
    name: 'Uranio',
    short: 'URA',
    icon: '☢',
    color: '#b6e34a',
    flavour: 'Combustible de alta densidad, mal contado y peor guardado.',
    sources: ['Extractores sobre depositos de uranio (Zona 2 y Zona 3)'],
    drains: ['Tecnologias avanzadas y mejoras de nivel alto'],
    rare: true,
    role: 'Energia de alta densidad; abre las tecnologias tardias.',
  },
  crystal: {
    id: 'crystal',
    name: 'Cristal energetico',
    short: 'CRI',
    icon: '\u{1F48E}',
    color: '#e470c8',
    flavour: 'Material anomalo. Responde a estimulos que nadie ha sabido explicar.',
    sources: ['Afloramientos de cristal, casi todos en el Nucleo'],
    drains: ['Drones, el arbol tecnologico tardio y el objetivo central'],
    rare: true,
    role: 'Material anomalo poco comprendido. Requerido por el objetivo central.',
  },
  gold: {
    id: 'gold',
    name: 'Oro',
    short: 'ORO',
    icon: '\u{1FA99}',
    color: '#e8c14a',
    flavour: 'Presupuesto operativo de la ciudad.',
    sources: ['Recompensas de fin de partida', 'Produccion pasiva de la ciudad'],
    drains: ['Mejoras de edificios de ciudad'],
    rare: false,
    role: 'Moneda de ciudad: mejoras y mantenimiento.',
  },
  influence: {
    id: 'influence',
    name: 'Influencia',
    short: 'INF',
    icon: '\u{1F91D}',
    color: '#7ea6e8',
    flavour: 'Favores, acuerdos y silencios comprados.',
    sources: ['Recompensas de partida', 'Centro diplomatico'],
    drains: ['Rama diplomatica de la ciudad'],
    rare: false,
    role: 'Rama diplomatica: acuerdos, comercio y espionaje.',
  },
  population: {
    id: 'population',
    name: 'Poblacion',
    short: 'POB',
    icon: '\u{1F465}',
    color: '#e8dcc8',
    flavour: 'Gente disponible para desplegar.',
    sources: ['Centro logistico'],
    drains: ['Techo de ciudadanos por partida'],
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
