import { TECHNOLOGIES, TECHNOLOGY_IDS, techDef } from '../data/technologies';
import { defaultModifiers, type MatchPlayer, type PlayerModifiers } from './types';
import { canAfford, missingResources, spend, defaultStorage } from './resources';
import type { ResourceCost } from '../data/troops';
import { ALL_MATCH_RESOURCE_IDS, isRare } from '../data/resources';
import { BALANCE } from '../data/balance';
import { itemDef } from '../data/items';
import { TROOP_IDS, troopDef } from '../data/troops';
import { MAP_BUILDING_IDS, mapBuildingDef } from '../data/buildings.map';

export interface TechAvailability {
  id: string;
  available: boolean;
  reason: string | null;
  missing: ResourceCost;
}

/**
 * Recomputes a player's modifiers from their loadout plus every researched
 * technology. Always derived, never incremented in place, so repeated calls are
 * idempotent and a reloaded match produces identical numbers.
 */
export function recomputeModifiers(player: MatchPlayer): void {
  const base = player.loadout.baseModifiers;
  const mods: PlayerModifiers = {
    ...defaultModifiers(),
    ...base,
    unlockedTroops: [...base.unlockedTroops],
    unlockedBuildings: [...base.unlockedBuildings],
  };

  // Items won from objectives buff the rest of the run, so they are folded in
  // here alongside research: modifiers stay a pure function of what is owned.
  for (const itemId of player.items) {
    const effects = itemDef(itemId).effects;
    mods.attackMultiplier *= effects.attackMultiplier ?? 1;
    mods.defenseMultiplier *= effects.defenseMultiplier ?? 1;
    mods.productionMultiplier *= effects.productionMultiplier ?? 1;
    mods.gatherMultiplier *= effects.gatherMultiplier ?? 1;
    mods.rareYieldMultiplier *= effects.rareYieldMultiplier ?? 1;
    mods.movementBonus += effects.movementBonus ?? 0;
    mods.visionBonus += effects.visionBonus ?? 0;
  }

  for (const techId of player.technologies) {
    const effects = techDef(techId).effects;
    mods.productionMultiplier *= effects.productionMultiplier ?? 1;
    mods.attackMultiplier *= effects.attackMultiplier ?? 1;
    mods.defenseMultiplier *= effects.defenseMultiplier ?? 1;
    mods.rareYieldMultiplier *= effects.rareYieldMultiplier ?? 1;
    mods.movementBonus += effects.movementBonus ?? 0;
    mods.visionBonus += effects.visionBonus ?? 0;
    mods.storageBonus += effects.storage ?? 0;
    for (const troop of effects.unlockTroops ?? []) {
      if (!mods.unlockedTroops.includes(troop)) mods.unlockedTroops.push(troop);
    }
    for (const building of effects.unlockBuildings ?? []) {
      if (!mods.unlockedBuildings.includes(building)) mods.unlockedBuildings.push(building);
    }
  }

  player.modifiers = mods;

  // Storage follows modifiers, so a warehouse upgrade or tech is felt at once.
  const storage = defaultStorage(mods.storageBonus);
  for (const id of ALL_MATCH_RESOURCE_IDS) {
    player.storage[id] = isRare(id)
      ? BALANCE.economy.rareStorage + Math.round(mods.storageBonus * 0.1)
      : storage[id];
  }
}

export function extraCitizensFromTech(player: MatchPlayer): number {
  let extra = 0;
  for (const techId of player.technologies) {
    extra += techDef(techId).effects.citizens ?? 0;
  }
  return extra;
}

export function checkTechnology(player: MatchPlayer, techId: string): TechAvailability {
  const def = TECHNOLOGIES[techId];
  if (!def) return { id: techId, available: false, reason: 'Tecnologia desconocida', missing: {} };
  if (player.technologies.includes(techId)) {
    return { id: techId, available: false, reason: 'Ya investigada', missing: {} };
  }
  const missingPrereq = def.requires.filter((r) => !player.technologies.includes(r));
  if (missingPrereq.length > 0) {
    return {
      id: techId,
      available: false,
      reason: `Requiere: ${missingPrereq.map((r) => techDef(r).name).join(', ')}`,
      missing: {},
    };
  }
  if (player.loadout.cityTier < def.cityTier) {
    return {
      id: techId,
      available: false,
      reason: `Requiere ciudad nivel ${def.cityTier}`,
      missing: {},
    };
  }
  if (!canAfford(player.stock, def.cost)) {
    return {
      id: techId,
      available: false,
      reason: 'Recursos insuficientes',
      missing: missingResources(player.stock, def.cost),
    };
  }
  return { id: techId, available: true, reason: null, missing: {} };
}

/** Techs the player could see in the UI: prerequisites met, tier permitting. */
export function visibleTechnologies(player: MatchPlayer): string[] {
  return TECHNOLOGY_IDS.filter((id) => {
    const def = techDef(id);
    if (player.technologies.includes(id)) return true;
    return def.requires.every((r) => player.technologies.includes(r));
  });
}

/**
 * Research resolves instantly on payment. Nine days is too short for multi-day
 * research queues to read as anything but dead time.
 */
export function research(player: MatchPlayer, techId: string): boolean {
  const check = checkTechnology(player, techId);
  if (!check.available) return false;
  const def = techDef(techId);
  if (!spend(player.stock, def.cost)) return false;
  player.technologies.push(techId);
  player.stats.techsResearched++;
  recomputeModifiers(player);
  return true;
}

/**
 * Troops the player may recruit. The barracks decides which troops exist for
 * them at all; research adds the doctrine some of them additionally need.
 */
export function availableTroops(player: MatchPlayer): string[] {
  return TROOP_IDS.filter((id) => {
    const def = troopDef(id);
    if (def.barracksLevel > player.loadout.barracksLevel) return false;
    if (def.unlockTechnology) return player.technologies.includes(def.unlockTechnology);
    return true;
  });
}

/** How many technologies the player could pay for right now. */
export function researchableCount(player: MatchPlayer): number {
  return TECHNOLOGY_IDS.filter((id) => checkTechnology(player, id).available).length;
}

/** Why a troop is not recruitable yet, for the UI to explain. */
export function troopLockReason(player: MatchPlayer, troopId: string): string | null {
  const def = troopDef(troopId);
  if (def.barracksLevel > player.loadout.barracksLevel) {
    return `Requiere Cuartel nivel ${def.barracksLevel}`;
  }
  if (def.unlockTechnology && !player.technologies.includes(def.unlockTechnology)) {
    return `Requiere investigar ${techDef(def.unlockTechnology).name}`;
  }
  return null;
}

/** Map building ids the player may currently construct. */
export function availableMapBuildings(player: MatchPlayer): string[] {
  return MAP_BUILDING_IDS.filter((id) => {
    const def = mapBuildingDef(id);
    if (def.cityTier && def.cityTier > player.loadout.cityTier) return false;
    if (def.unlockTechnology) return player.technologies.includes(def.unlockTechnology);
    return true;
  });
}
