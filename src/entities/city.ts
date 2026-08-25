import {
  CITY_BUILDINGS,
  CITY_BUILDING_IDS,
  cityBuildingDef,
  type CityBuildingDefinition,
  type CityCost,
  type CityEffects,
} from '../data/buildings.city';
import { COMMANDERS, commanderXpForLevel, MAX_COMMANDER_LEVEL } from '../data/commanders';
import { MAX_TROOP_LEVEL, TROOPS, TROOP_IDS, troopDef, troopUpgradeCost } from '../data/troops';
import type { ResourceCost } from '../data/troops';

export interface CommanderProgress {
  id: string;
  level: number;
  xp: number;
}

export interface CityState {
  /** Persistent stockpile. Keys are city resources plus rare resources. */
  resources: Record<string, number>;
  /** buildingId -> level. Level 0 means "not built yet". */
  buildings: Record<string, number>;
  /** Permanent per-troop-line levels. This is the troop evolution track. */
  troopLevels: Record<string, number>;
  commanders: Record<string, CommanderProgress>;
  matchesPlayed: number;
  matchesWon: number;
  /** Meta currency awarded by objectives, spent on nothing yet but tracked. */
  metaPoints: number;
  /** Best score achieved, shown on the city screen. */
  bestScore: number;
  version: number;
}

export const CITY_SAVE_VERSION = 1;

export function createNewCity(): CityState {
  const buildings: Record<string, number> = {};
  for (const id of CITY_BUILDING_IDS) buildings[id] = 0;
  // A fresh city starts with a level 1 command centre and a level 1 barracks:
  // enough to play a first match, not enough to do anything comfortably.
  buildings.command_center = 1;
  buildings.barracks = 1;
  buildings.logistics_center = 1;
  buildings.warehouse = 1;

  const troopLevels: Record<string, number> = {};
  for (const id of TROOP_IDS) troopLevels[id] = 1;

  return {
    resources: {
      gold: 250,
      materials: 300,
      science: 120,
      influence: 60,
      population: 40,
      energy: 40,
      titanium: 0,
      uranium: 0,
      crystal: 0,
    },
    buildings,
    troopLevels,
    commanders: {
      marcus: { id: 'marcus', level: 1, xp: 0 },
    },
    matchesPlayed: 0,
    matchesWon: 0,
    metaPoints: 0,
    bestScore: 0,
    version: CITY_SAVE_VERSION,
  };
}

export function cityBuildingLevel(city: CityState, id: string): number {
  return city.buildings[id] ?? 0;
}

export function cityTier(city: CityState): number {
  return Math.max(1, cityBuildingLevel(city, 'command_center'));
}

/** Cost of taking a building from its current level to the next one. */
export function nextLevelCost(city: CityState, id: string): CityCost | null {
  const def = cityBuildingDef(id);
  const level = cityBuildingLevel(city, id);
  if (level >= def.maxLevel) return null;
  return def.costPerLevel[level] ?? null;
}

export interface UpgradeCheck {
  ok: boolean;
  reason: string | null;
  cost: CityCost | null;
  missing: CityCost;
}

export function canUpgradeCityBuilding(city: CityState, id: string): UpgradeCheck {
  const def = cityBuildingDef(id);
  const level = cityBuildingLevel(city, id);
  if (level >= def.maxLevel) {
    return { ok: false, reason: 'Nivel maximo alcanzado', cost: null, missing: {} };
  }
  const requiredCommand = def.requiresCommandLevel[level] ?? 0;
  if (id !== 'command_center' && cityBuildingLevel(city, 'command_center') < requiredCommand) {
    return {
      ok: false,
      reason: `Requiere Centro de mando nivel ${requiredCommand}`,
      cost: def.costPerLevel[level],
      missing: {},
    };
  }
  const cost = def.costPerLevel[level] ?? {};
  const missing: CityCost = {};
  let affordable = true;
  for (const [key, amount] of Object.entries(cost)) {
    if (!amount) continue;
    const have = city.resources[key] ?? 0;
    if (have < amount) {
      affordable = false;
      missing[key as keyof CityCost] = Math.ceil(amount - have);
    }
  }
  if (!affordable) return { ok: false, reason: 'Recursos insuficientes', cost, missing };
  return { ok: true, reason: null, cost, missing: {} };
}

export function upgradeCityBuilding(city: CityState, id: string): boolean {
  const check = canUpgradeCityBuilding(city, id);
  if (!check.ok || !check.cost) return false;
  for (const [key, amount] of Object.entries(check.cost)) {
    if (!amount) continue;
    city.resources[key] = (city.resources[key] ?? 0) - amount;
  }
  city.buildings[id] = cityBuildingLevel(city, id) + 1;
  syncCommanderRoster(city);
  return true;
}

/** Every troop line evolves separately, so the player must choose a doctrine. */
export function canUpgradeTroop(city: CityState, troopId: string): UpgradeCheck {
  const def = troopDef(troopId);
  const level = city.troopLevels[troopId] ?? 1;
  const cap = Math.min(MAX_TROOP_LEVEL, troopLevelCap(city));
  if (level >= cap) {
    return {
      ok: false,
      reason: level >= MAX_TROOP_LEVEL ? 'Nivel maximo' : 'Sube la Academia para elevar el techo',
      cost: null,
      missing: {},
    };
  }
  if (cityTier(city) < def.cityTier) {
    return {
      ok: false,
      reason: `Requiere Centro de mando nivel ${def.cityTier}`,
      cost: null,
      missing: {},
    };
  }
  const matchCost = troopUpgradeCost(def, level);
  // Match resource ids map onto city resource ids for the shared ones.
  const cost: CityCost = {};
  for (const [key, amount] of Object.entries(matchCost)) {
    if (!amount) continue;
    cost[key as keyof CityCost] = amount;
  }
  const missing: CityCost = {};
  let affordable = true;
  for (const [key, amount] of Object.entries(cost)) {
    if (!amount) continue;
    const have = city.resources[key] ?? 0;
    if (have < amount) {
      affordable = false;
      missing[key as keyof CityCost] = Math.ceil(amount - have);
    }
  }
  if (!affordable) return { ok: false, reason: 'Recursos insuficientes', cost, missing };
  return { ok: true, reason: null, cost, missing: {} };
}

export function upgradeTroop(city: CityState, troopId: string): boolean {
  const check = canUpgradeTroop(city, troopId);
  if (!check.ok || !check.cost) return false;
  for (const [key, amount] of Object.entries(check.cost)) {
    if (!amount) continue;
    city.resources[key] = (city.resources[key] ?? 0) - amount;
  }
  city.troopLevels[troopId] = (city.troopLevels[troopId] ?? 1) + 1;
  return true;
}

/** Aggregates every city building's effects at its current level. */
export function deriveCityEffects(city: CityState): Required<
  Pick<
    CityEffects,
    | 'citizens'
    | 'armySlots'
    | 'commanderSlots'
    | 'troopLevelCap'
    | 'productionMultiplier'
    | 'scienceMultiplier'
    | 'storage'
    | 'movementBonus'
    | 'attackMultiplier'
    | 'defenseMultiplier'
    | 'commanderXpBonus'
    | 'rewardMultiplier'
    | 'diplomacyPressure'
    | 'intelReveal'
    | 'cityTier'
  >
> & { startResources: Record<string, number>; passiveIncome: Record<string, number> } {
  const acc = {
    citizens: 0,
    armySlots: 1,
    commanderSlots: 0,
    troopLevelCap: 1,
    productionMultiplier: 1,
    scienceMultiplier: 1,
    storage: 0,
    movementBonus: 0,
    attackMultiplier: 1,
    defenseMultiplier: 1,
    commanderXpBonus: 0,
    rewardMultiplier: 1,
    diplomacyPressure: 0,
    intelReveal: 0,
    cityTier: 1,
    startResources: {} as Record<string, number>,
    passiveIncome: {} as Record<string, number>,
  };

  for (const id of CITY_BUILDING_IDS) {
    const level = cityBuildingLevel(city, id);
    if (level <= 0) continue;
    const def: CityBuildingDefinition = CITY_BUILDINGS[id];
    const effects = def.effectsPerLevel[level - 1];
    if (!effects) continue;
    // Additive values accumulate; multipliers compound; slots take the maximum.
    acc.citizens += effects.citizens ?? 0;
    acc.storage += effects.storage ?? 0;
    acc.movementBonus += effects.movementBonus ?? 0;
    acc.commanderXpBonus += effects.commanderXpBonus ?? 0;
    acc.diplomacyPressure += effects.diplomacyPressure ?? 0;
    acc.intelReveal = Math.max(acc.intelReveal, effects.intelReveal ?? 0);
    acc.armySlots = Math.max(acc.armySlots, effects.armySlots ?? 0);
    acc.commanderSlots = Math.max(acc.commanderSlots, effects.commanderSlots ?? 0);
    acc.troopLevelCap = Math.max(acc.troopLevelCap, effects.troopLevelCap ?? 0);
    acc.cityTier = Math.max(acc.cityTier, effects.cityTier ?? 0);
    acc.productionMultiplier *= effects.productionMultiplier ?? 1;
    acc.scienceMultiplier *= effects.scienceMultiplier ?? 1;
    acc.attackMultiplier *= effects.attackMultiplier ?? 1;
    acc.defenseMultiplier *= effects.defenseMultiplier ?? 1;
    acc.rewardMultiplier *= effects.rewardMultiplier ?? 1;
    for (const [k, v] of Object.entries(effects.startResources ?? {})) {
      acc.startResources[k] = (acc.startResources[k] ?? 0) + (v ?? 0);
    }
    for (const [k, v] of Object.entries(effects.passiveIncome ?? {})) {
      acc.passiveIncome[k] = (acc.passiveIncome[k] ?? 0) + (v ?? 0);
    }
  }

  acc.citizens = Math.max(acc.citizens, 0);
  return acc;
}

export function troopLevelCap(city: CityState): number {
  return Math.max(1, deriveCityEffects(city).troopLevelCap);
}

/** Commanders unlocked by the current city layout, added to the roster. */
export function syncCommanderRoster(city: CityState): string[] {
  const unlocked: string[] = [];
  for (const def of Object.values(COMMANDERS)) {
    if (cityBuildingLevel(city, def.unlock.building) >= def.unlock.level) {
      unlocked.push(def.id);
      if (!city.commanders[def.id]) {
        city.commanders[def.id] = { id: def.id, level: 1, xp: 0 };
      }
    }
  }
  return unlocked;
}

export function unlockedCommanders(city: CityState): string[] {
  return syncCommanderRoster(city);
}

/** Troops the city is technologically able to field at all. */
export function unlockedTroopsForCity(city: CityState): string[] {
  const tier = cityTier(city);
  return TROOP_IDS.filter((id) => TROOPS[id].cityTier <= tier);
}

/** Applies commander XP and levels up, returning the levels gained. */
export function awardCommanderXp(city: CityState, commanderId: string, xp: number): number {
  const progress = city.commanders[commanderId];
  if (!progress || xp <= 0) return 0;
  progress.xp += Math.round(xp);
  let gained = 0;
  while (progress.level < MAX_COMMANDER_LEVEL) {
    const needed = commanderXpForLevel(progress.level);
    if (progress.xp < needed) break;
    progress.xp -= needed;
    progress.level++;
    gained++;
  }
  return gained;
}

export function addCityResources(city: CityState, amounts: Record<string, number>): void {
  for (const [key, value] of Object.entries(amounts)) {
    if (!value) continue;
    city.resources[key] = Math.max(0, (city.resources[key] ?? 0) + value);
  }
}

/** Cost helper shared by the UI. */
export function troopUpgradeCostForCity(city: CityState, troopId: string): ResourceCost | null {
  const level = city.troopLevels[troopId] ?? 1;
  if (level >= MAX_TROOP_LEVEL) return null;
  return troopUpgradeCost(troopDef(troopId), level);
}
