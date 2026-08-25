import { BALANCE } from '../data/balance';
import { mapBuildingDef } from '../data/buildings.map';
import { nodeDef, TERRAINS } from '../data/terrain';
import { troopDef } from '../data/troops';
import { commanderDef } from '../data/commanders';
import { isRare, type AnyMatchResourceId } from '../data/resources';
import { grant, spend, canAfford, missingResources } from './resources';
import { buildingLevelMultiplier } from './construction';
import { extraCitizensFromTech } from './technology';
import { availableTroops } from './technology';
import type { Army, MatchPlayer, MatchState } from './types';
import type { ResourceCost } from '../data/troops';
import { armySize } from './movement';

export interface ProductionLine {
  source: string;
  hex: string;
  amounts: Partial<Record<AnyMatchResourceId, number>>;
  online: boolean;
}

/**
 * Everything a player's buildings and capital yield this day, before storage
 * clamping. Returned as lines so the UI can explain the economy hex by hex.
 */
export function computeProduction(state: MatchState, player: MatchPlayer): ProductionLine[] {
  const lines: ProductionLine[] = [];

  // The capital always trickles: a wiped-out player can still act.
  for (const tile of Object.values(state.tiles)) {
    if (tile.feature.startFor !== player.id) continue;
    lines.push({
      source: 'Base de operaciones',
      hex: tile.id,
      amounts: { ...BALANCE.economy.capitalYield } as Partial<Record<AnyMatchResourceId, number>>,
      online: true,
    });
    break;
  }

  for (const building of Object.values(state.buildings)) {
    if (building.owner !== player.id || building.daysRemaining > 0) continue;
    const def = mapBuildingDef(building.buildingId);
    const tile = state.tiles[building.hex];
    if (!tile) continue;

    const amounts: Partial<Record<AnyMatchResourceId, number>> = {};
    const levelMult = buildingLevelMultiplier(building.level);
    const prodMult = player.modifiers.productionMultiplier;

    if (def.flatYield) {
      for (const [key, value] of Object.entries(def.flatYield)) {
        if (!value) continue;
        amounts[key as AnyMatchResourceId] =
          (amounts[key as AnyMatchResourceId] ?? 0) + value * levelMult * prodMult;
      }
    }

    if (def.nodeMultiplier && tile.node && tile.node.remaining > 0) {
      const node = nodeDef(tile.node.nodeId);
      let yieldAmount = node.yieldPerDay * def.nodeMultiplier * levelMult * prodMult;
      if (isRare(node.resource)) yieldAmount *= player.modifiers.rareYieldMultiplier;
      // Terrain contributes its own small base yield on top.
      const terrainYield = TERRAINS[tile.terrain].baseYield?.[node.resource as never];
      if (typeof terrainYield === 'number') yieldAmount += terrainYield * 0.5 * prodMult;
      amounts[node.resource] = (amounts[node.resource] ?? 0) + yieldAmount;
    }

    if (Object.keys(amounts).length > 0 || def.upkeep) {
      lines.push({ source: def.name, hex: building.hex, amounts, online: building.online });
    }
  }

  return lines;
}

/** Applies upkeep first, then production. Unpaid buildings go offline. */
export function runProduction(state: MatchState, player: MatchPlayer): {
  produced: Partial<Record<AnyMatchResourceId, number>>;
  offline: number;
} {
  // Building upkeep: a building that cannot pay goes idle and produces nothing.
  let offline = 0;
  for (const building of Object.values(state.buildings)) {
    if (building.owner !== player.id || building.daysRemaining > 0) continue;
    const def = mapBuildingDef(building.buildingId);
    if (!def.upkeep) {
      building.online = true;
      continue;
    }
    const paid = canAfford(player.stock, def.upkeep);
    if (paid) spend(player.stock, def.upkeep);
    building.online = paid;
    if (!paid) offline++;
  }

  const produced: Partial<Record<AnyMatchResourceId, number>> = {};
  for (const line of computeProduction(state, player)) {
    if (!line.online) continue;
    for (const [key, value] of Object.entries(line.amounts)) {
      if (!value) continue;
      const id = key as AnyMatchResourceId;
      const scaled = id === 'science' ? value * player.modifiers.scienceMultiplier : value;
      const { stored } = grant(player, id, scaled);
      produced[id] = (produced[id] ?? 0) + stored;
      player.stats.resourcesGathered += stored;
      if (isRare(id)) player.stats.rareGathered += stored;
    }
  }

  // Deplete nodes by what was actually taken from them.
  for (const building of Object.values(state.buildings)) {
    if (building.owner !== player.id || building.daysRemaining > 0 || !building.online) continue;
    const def = mapBuildingDef(building.buildingId);
    if (!def.nodeMultiplier) continue;
    const tile = state.tiles[building.hex];
    if (!tile?.node || tile.node.remaining >= 999) continue;
    const node = nodeDef(tile.node.nodeId);
    tile.node.remaining = Math.max(0, tile.node.remaining - node.yieldPerDay * def.nodeMultiplier);
  }

  return { produced, offline };
}

/**
 * Troop upkeep and the citizen food draw, resolved once per day.
 *
 * Food is deliberately separated from the rest: running out of food starves
 * citizens, while running out of fuel or ammunition leaves units unsupplied
 * (which costs them power in combat) without killing the population. Folding
 * the two together made every player starve on day one purely for lacking ammo.
 */
export function runUpkeep(
  state: MatchState,
  player: MatchPlayer,
): { starving: boolean; unsupplied: AnyMatchResourceId[] } {
  const total: ResourceCost = {};
  for (const army of Object.values(state.armies)) {
    if (army.owner !== player.id) continue;
    for (const [troopId, count] of Object.entries(army.composition)) {
      if (count <= 0) continue;
      const def = troopDef(troopId);
      for (const [key, value] of Object.entries(def.upkeep)) {
        if (!value) continue;
        total[key as AnyMatchResourceId] = (total[key as AnyMatchResourceId] ?? 0) + value * count;
      }
    }
  }

  const foodNeeded =
    (total.food ?? 0) + player.citizensTotal * BALANCE.citizens.foodPerCitizen;
  delete total.food;

  const starving = player.stock.food + 1e-9 < foodNeeded;
  player.stock.food = Math.max(0, player.stock.food - foodNeeded);

  const unsupplied: AnyMatchResourceId[] = [];
  for (const [key, amount] of Object.entries(total)) {
    if (!amount) continue;
    const id = key as AnyMatchResourceId;
    const rounded = Math.round(amount * 10) / 10;
    if (player.stock[id] + 1e-9 < rounded) {
      player.stock[id] = 0;
      unsupplied.push(id);
    } else {
      player.stock[id] -= rounded;
    }
  }

  return { starving, unsupplied };
}

/**
 * Citizens grow from food surplus. They are the hard constraint on how much a
 * player can build in nine days, so growth is deliberately slow.
 */
export function growCitizens(player: MatchPlayer, starving: boolean): number {
  const cap = Math.min(
    BALANCE.citizens.max,
    BALANCE.citizens.base + player.loadout.citizens + extraCitizensFromTech(player),
  );
  if (starving) {
    // Starvation costs a citizen, taken from the free pool first.
    if (player.citizensFree > 0) {
      player.citizensFree--;
      player.citizensTotal--;
      return -1;
    }
    return 0;
  }
  if (player.citizensTotal >= cap) return 0;
  if (player.stock.food < BALANCE.citizens.foodPerNewCitizen) return 0;
  player.stock.food -= BALANCE.citizens.foodPerNewCitizen;
  player.citizensTotal++;
  player.citizensFree++;
  return 1;
}

export function citizenCap(player: MatchPlayer): number {
  return Math.min(
    BALANCE.citizens.max,
    BALANCE.citizens.base + player.loadout.citizens + extraCitizensFromTech(player),
  );
}

/** Resources an army scrapes directly off the hex it is standing on. */
export function gatherWithArmy(
  state: MatchState,
  player: MatchPlayer,
  army: Army,
): Partial<Record<AnyMatchResourceId, number>> {
  const tile = state.tiles[army.hex];
  const out: Partial<Record<AnyMatchResourceId, number>> = {};
  if (!tile?.node || tile.node.remaining <= 0) return out;
  // A built extractor is always better; hand-gathering is the fallback.
  if (tile.buildingId) return out;

  const node = nodeDef(tile.node.nodeId);
  const rare = isRare(node.resource);
  let amount: number = BALANCE.gathering.armyGatherPerDay;
  if (rare) amount *= BALANCE.gathering.armyRareGatherRate;
  amount *= player.modifiers.gatherMultiplier;
  if (army.commanderId) amount *= commanderDef(army.commanderId).ability.gatherMultiplier ?? 1;
  amount = Math.min(amount, tile.node.remaining);
  if (amount <= 0) return out;

  const { stored } = grant(player, node.resource, amount);
  if (tile.node.remaining < 999) tile.node.remaining = Math.max(0, tile.node.remaining - amount);
  player.stats.resourcesGathered += stored;
  if (rare) player.stats.rareGathered += stored;
  out[node.resource] = stored;
  return out;
}

export interface TrainCheck {
  ok: boolean;
  reason: string | null;
  cost: ResourceCost;
  missing: ResourceCost;
}

/** Cost of training `count` of a troop, including its population slots. */
export function trainCost(troopId: string, count: number): ResourceCost {
  const def = troopDef(troopId);
  const out: ResourceCost = {};
  for (const [key, value] of Object.entries(def.cost)) {
    if (!value) continue;
    out[key as AnyMatchResourceId] = value * count;
  }
  return out;
}

export function canTrain(
  state: MatchState,
  player: MatchPlayer,
  army: Army,
  troopId: string,
  count: number,
): TrainCheck {
  const empty: TrainCheck = { ok: false, reason: null, cost: {}, missing: {} };
  if (count <= 0) return { ...empty, reason: 'Cantidad invalida' };
  if (!availableTroops(player).includes(troopId)) {
    return { ...empty, reason: 'Tropa no desbloqueada' };
  }
  const cost = trainCost(troopId, count);
  // Training happens at the capital or at a military base the player owns.
  if (!canTrainAt(state, player, army.hex)) {
    return { ...empty, cost, reason: 'Solo en la base inicial o en una base militar' };
  }
  const def = troopDef(troopId);
  const slotsUsed = armySlotsUsed(army);
  if (slotsUsed + def.slots * count > armySlotCapacity(player)) {
    return { ...empty, cost, reason: 'Capacidad del ejercito superada' };
  }
  if (!canAfford(player.stock, cost)) {
    return { ...empty, cost, reason: 'Recursos insuficientes', missing: missingResources(player.stock, cost) };
  }
  return { ok: true, reason: null, cost, missing: {} };
}

export function canTrainAt(state: MatchState, player: MatchPlayer, hex: string): boolean {
  const tile = state.tiles[hex];
  if (!tile) return false;
  if (tile.feature.startFor === player.id) return true;
  const building = tile.buildingId ? state.buildings[tile.buildingId] : null;
  return !!building && building.owner === player.id && building.buildingId === 'military_base' && building.daysRemaining === 0;
}

export function train(
  state: MatchState,
  player: MatchPlayer,
  army: Army,
  troopId: string,
  count: number,
): boolean {
  const check = canTrain(state, player, army, troopId, count);
  if (!check.ok) return false;
  if (!spend(player.stock, check.cost)) return false;
  army.composition[troopId] = (army.composition[troopId] ?? 0) + count;
  return true;
}

/** Population slots used by an army's current composition. */
export function armySlotsUsed(army: Army): number {
  let used = 0;
  for (const [troopId, count] of Object.entries(army.composition)) {
    if (count <= 0) continue;
    used += troopDef(troopId).slots * count;
  }
  return used;
}

/** How large a single army may grow, driven by city tier and citizens. */
export function armySlotCapacity(player: MatchPlayer): number {
  return 40 + player.loadout.cityTier * 25 + player.citizensTotal * 2;
}

export function totalTroops(state: MatchState, playerId: string): number {
  let total = 0;
  for (const army of Object.values(state.armies)) {
    if (army.owner === playerId) total += armySize(army);
  }
  return total;
}
