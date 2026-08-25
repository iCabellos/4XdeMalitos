import type { AnyMatchResourceId } from './resources';

/**
 * Items are won by clearing the purple secondary objectives in zone 2 and by
 * conquering the core. They are match-scoped: they buff the run that earned
 * them, and their rarity is what the results screen reports back to the city.
 */
export type ItemRarity = 'raro' | 'epico' | 'legendario';

export interface ItemEffects {
  attackMultiplier?: number;
  defenseMultiplier?: number;
  productionMultiplier?: number;
  gatherMultiplier?: number;
  movementBonus?: number;
  visionBonus?: number;
  rareYieldMultiplier?: number;
  /** One-off payout granted the moment the item is claimed. */
  grant?: Partial<Record<AnyMatchResourceId, number>>;
}

export interface ItemDefinition {
  id: string;
  name: string;
  rarity: ItemRarity;
  icon: string;
  description: string;
  effects: ItemEffects;
}

export const ITEMS: Record<string, ItemDefinition> = {
  targeting_suite: {
    id: 'targeting_suite',
    name: 'Suite de puntería',
    rarity: 'raro',
    icon: '\u{1F3AF}',
    description: '+15% de ataque para todos tus ejercitos durante el resto de la partida.',
    effects: { attackMultiplier: 1.15, grant: { ammo: 40 } },
  },
  reactive_plating: {
    id: 'reactive_plating',
    name: 'Blindaje reactivo',
    rarity: 'raro',
    icon: '\u{1F6E1}',
    description: '+18% de defensa para todos tus ejercitos.',
    effects: { defenseMultiplier: 1.18, grant: { metal: 50 } },
  },
  survey_array: {
    id: 'survey_array',
    name: 'Antena de prospección',
    rarity: 'raro',
    icon: '\u{1F4E1}',
    description: '+35% de recoleccion y +1 de vision.',
    effects: { gatherMultiplier: 1.35, visionBonus: 1, grant: { science: 60 } },
  },
  supply_convoy: {
    id: 'supply_convoy',
    name: 'Convoy de suministros',
    rarity: 'epico',
    icon: '\u{1F69B}',
    description: '+20% de produccion y +1 de movimiento.',
    effects: { productionMultiplier: 1.2, movementBonus: 1, grant: { materials: 120, fuel: 60 } },
  },
  refinery_codes: {
    id: 'refinery_codes',
    name: 'Códigos de refinería',
    rarity: 'epico',
    icon: '⚙',
    description: '+50% de rendimiento en extractores de recursos raros.',
    effects: { rareYieldMultiplier: 1.5, grant: { energy: 80 } },
  },
  // The core prize. Deliberately the only legendary in the pool.
  core_of_x: {
    id: 'core_of_x',
    name: 'Núcleo del Elemento X',
    rarity: 'legendario',
    icon: '☄',
    description:
      'Material que nadie ha sabido explicar. +25% ataque, +25% defensa, +30% produccion y un cargamento de recursos raros.',
    effects: {
      attackMultiplier: 1.25,
      defenseMultiplier: 1.25,
      productionMultiplier: 1.3,
      rareYieldMultiplier: 1.4,
      grant: { titanium: 12, uranium: 8, crystal: 10 },
    },
  },
};

export const ITEM_IDS = Object.keys(ITEMS);

export function itemDef(id: string): ItemDefinition {
  const def = ITEMS[id];
  if (!def) throw new Error(`Item desconocido: ${id}`);
  return def;
}

/** Items handed out by the three zone-2 secondary objectives, in order. */
export const SECONDARY_OBJECTIVE_ITEMS = ['targeting_suite', 'reactive_plating', 'survey_array'];

/** Extra items seeded into the zone-2 pool so runs differ. */
export const BONUS_ITEM_POOL = ['supply_convoy', 'refinery_codes'];

export const CORE_ITEM = 'core_of_x';

export const RARITY_COLORS: Record<ItemRarity, string> = {
  raro: '#4da3ff',
  epico: '#c77dff',
  legendario: '#ffb340',
};
