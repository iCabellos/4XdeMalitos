import { TECHNOLOGIES, TECHNOLOGY_IDS, techDef } from '../data/technologies';
import { defaultModifiers, type MatchPlayer, type MatchState, type PlayerModifiers } from './types';
import { canAfford, missingResources, spend, defaultStorage } from './resources';
import type { ResourceCost } from '../data/troops';
import { ALL_MATCH_RESOURCE_IDS, isRare } from '../data/resources';
import { BALANCE } from '../data/balance';
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

export function researchableTechnologies(player: MatchPlayer): string[] {
  return TECHNOLOGY_IDS.filter((id) => checkTechnology(player, id).available);
}

/**
 * Research resolves instantly on payment. Nine days is too short for multi-day
 * research queues to read as anything but dead time.
 */
export function research(state: MatchState, player: MatchPlayer, techId: string): boolean {
  const check = checkTechnology(player, techId);
  if (!check.available) return false;
  const def = techDef(techId);
  if (!spend(player.stock, def.cost)) return false;
  player.technologies.push(techId);
  player.stats.techsResearched++;
  recomputeModifiers(player);

  // Region locks of type 'tech' open the instant the technology lands.
  if (def.effects.opensRegionLock) {
    for (const region of state.regions) {
      if (region.lock.type === 'tech' && !player.unlockedRegions.includes(region.id)) {
        player.unlockedRegions.push(region.id);
      }
    }
  }
  return true;
}

/** Troop ids the player may currently train, given city tier and research. */
export function availableTroops(player: MatchPlayer): string[] {
  return TROOP_IDS.filter((id) => {
    const def = troopDef(id);
    if (def.cityTier > player.loadout.cityTier) return false;
    if (def.unlockTechnology) return player.technologies.includes(def.unlockTechnology);
    return true;
  });
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
