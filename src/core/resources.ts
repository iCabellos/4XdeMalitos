import { ALL_MATCH_RESOURCE_IDS, isRare, type AnyMatchResourceId } from '../data/resources';
import { BALANCE } from '../data/balance';
import type { MatchPlayer, Stock } from './types';
import type { ResourceCost } from '../data/troops';

/** Default storage ceilings: rare resources are deliberately far tighter. */
export function defaultStorage(bonus = 0): Record<AnyMatchResourceId, number> {
  const out = {} as Record<AnyMatchResourceId, number>;
  for (const id of ALL_MATCH_RESOURCE_IDS) {
    out[id] = isRare(id) ? BALANCE.economy.rareStorage : BALANCE.economy.baseStorage + bonus;
  }
  return out;
}

export function canAfford(stock: Stock, cost: ResourceCost): boolean {
  for (const [key, amount] of Object.entries(cost)) {
    if (!amount) continue;
    if ((stock[key as AnyMatchResourceId] ?? 0) < amount) return false;
  }
  return true;
}

/** Resources the player is short of, for UI feedback. */
export function missingResources(stock: Stock, cost: ResourceCost): ResourceCost {
  const out: ResourceCost = {};
  for (const [key, amount] of Object.entries(cost)) {
    if (!amount) continue;
    const have = stock[key as AnyMatchResourceId] ?? 0;
    if (have < amount) out[key as AnyMatchResourceId] = Math.ceil(amount - have);
  }
  return out;
}

export function spend(stock: Stock, cost: ResourceCost): boolean {
  if (!canAfford(stock, cost)) return false;
  for (const [key, amount] of Object.entries(cost)) {
    if (!amount) continue;
    stock[key as AnyMatchResourceId] -= amount;
  }
  return true;
}

/**
 * Adds resources, clamped to storage. Returns how much was actually stored so
 * callers can report overflow, which is the pressure that makes depots matter.
 */
export function grant(
  player: MatchPlayer,
  resource: AnyMatchResourceId,
  amount: number,
): { stored: number; wasted: number } {
  if (amount <= 0) return { stored: 0, wasted: 0 };
  const cap = player.storage[resource] ?? Infinity;
  const before = player.stock[resource];
  const after = Math.min(cap, before + amount);
  const stored = after - before;
  player.stock[resource] = after;
  return { stored, wasted: amount - stored };
}

export function grantMany(player: MatchPlayer, amounts: Partial<Record<string, number>>): number {
  let total = 0;
  for (const [key, amount] of Object.entries(amounts)) {
    if (!amount) continue;
    total += grant(player, key as AnyMatchResourceId, amount).stored;
  }
  return total;
}

/** Drains as much of `cost` as possible; returns true only if fully paid. */
export function drainPartial(stock: Stock, cost: ResourceCost): boolean {
  let fullyPaid = true;
  for (const [key, amount] of Object.entries(cost)) {
    if (!amount) continue;
    const id = key as AnyMatchResourceId;
    if (stock[id] < amount) {
      stock[id] = 0;
      fullyPaid = false;
    } else {
      stock[id] -= amount;
    }
  }
  return fullyPaid;
}

export function addCost(a: ResourceCost, b: ResourceCost): ResourceCost {
  const out: ResourceCost = { ...a };
  for (const [key, amount] of Object.entries(b)) {
    if (!amount) continue;
    const id = key as AnyMatchResourceId;
    out[id] = (out[id] ?? 0) + amount;
  }
  return out;
}

export function scaleCost(cost: ResourceCost, factor: number): ResourceCost {
  const out: ResourceCost = {};
  for (const [key, amount] of Object.entries(cost)) {
    if (!amount) continue;
    out[key as AnyMatchResourceId] = Math.round(amount * factor);
  }
  return out;
}

export function totalRare(stock: Stock): number {
  return stock.titanium + stock.uranium + stock.crystal;
}

export function totalCommon(stock: Stock): number {
  let sum = 0;
  for (const id of ALL_MATCH_RESOURCE_IDS) {
    if (!isRare(id)) sum += stock[id];
  }
  return sum;
}

export function formatCost(cost: ResourceCost): string {
  return Object.entries(cost)
    .filter(([, v]) => !!v)
    .map(([k, v]) => `${Math.round(v as number)} ${k}`)
    .join('  ');
}
