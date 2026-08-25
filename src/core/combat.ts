import { BALANCE } from '../data/balance';
import { TERRAINS } from '../data/terrain';
import { troopAttackAt, troopDefenseAt, troopDef, type TroopRole } from '../data/troops';
import { commanderDef, commanderLevelScale } from '../data/commanders';
import { mapBuildingDef } from '../data/buildings.map';
import type { Army, CombatReport, MatchState, Tile } from './types';
import { armySize } from './movement';

export interface PowerBreakdown {
  base: number;
  technology: number;
  commander: number;
  terrain: number;
  fortification: number;
  ammo: number;
  counter: number;
  total: number;
}

function roleDistribution(army: Army): Record<string, number> {
  const dist: Record<string, number> = {};
  let total = 0;
  for (const [troopId, count] of Object.entries(army.composition)) {
    if (count <= 0) continue;
    const role = troopDef(troopId).role;
    dist[role] = (dist[role] ?? 0) + count;
    total += count;
  }
  if (total > 0) for (const key of Object.keys(dist)) dist[key] /= total;
  return dist;
}

/** Commander multipliers, split so the UI can explain where power comes from. */
function commanderMultipliers(
  state: MatchState,
  army: Army,
  attacking: boolean,
): { general: number; perRole: Record<string, number>; casualtyReduction: number } {
  const perRole: Record<string, number> = {};
  if (!army.commanderId) return { general: 1, perRole, casualtyReduction: 0 };
  const def = commanderDef(army.commanderId);
  const scale = commanderLevelScale(commanderLevelOf(state, army));
  const ability = def.ability;
  const general = (attacking ? ability.attackMultiplier ?? 1 : ability.defenseMultiplier ?? 1) * scale;
  const specialtyBonus = attacking ? def.specialtyAttackBonus : def.specialtyDefenseBonus;
  perRole[def.specialty] = 1 + specialtyBonus;
  return { general, perRole, casualtyReduction: ability.casualtyReduction ?? 0 };
}

/** Commander level travels with the match through the player's loadout. */
export function commanderLevelOf(state: MatchState, army: Army): number {
  if (!army.commanderId) return 1;
  const player = state.players.find((p) => p.id === army.owner);
  return player?.loadout.commanderLevels?.[army.commanderId] ?? 1;
}

export function computePower(
  state: MatchState,
  army: Army,
  enemy: Army | null,
  tile: Tile,
  attacking: boolean,
): PowerBreakdown {
  const player = state.players.find((p) => p.id === army.owner);
  const enemyRoles = enemy ? roleDistribution(enemy) : {};
  const cmd = commanderMultipliers(state, army, attacking);

  let base = 0;
  let counterWeighted = 0;
  for (const [troopId, count] of Object.entries(army.composition)) {
    if (count <= 0) continue;
    const def = troopDef(troopId);
    const level = player?.troopLevels[troopId] ?? 1;
    const stat = attacking ? troopAttackAt(def, level) : troopDefenseAt(def, level);

    // Counter bonus scales with how much of the enemy is in a countered role.
    let counter = 1;
    if (def.strongVs && def.strongVs.length > 0) {
      let fraction = 0;
      for (const role of def.strongVs as TroopRole[]) fraction += enemyRoles[role] ?? 0;
      counter = 1 + (BALANCE.combat.counterBonus - 1) * Math.min(1, fraction);
    }
    // Standoff weapons fire before the enemy closes.
    const rangeBonus = attacking && def.range >= 2 ? 1.25 : 1;
    const roleBonus = cmd.perRole[def.role] ?? 1;

    const contribution = count * stat * counter * rangeBonus * roleBonus;
    base += count * stat;
    counterWeighted += contribution;
  }

  const counterMultiplier = base > 0 ? counterWeighted / base : 1;
  const technology = attacking
    ? player?.modifiers.attackMultiplier ?? 1
    : player?.modifiers.defenseMultiplier ?? 1;

  const terrainDef = TERRAINS[tile.terrain];
  const terrain = attacking ? terrainDef.attackModifier : terrainDef.defenseModifier;

  let fortification = 1;
  if (!attacking) {
    fortification *= BALANCE.combat.defenderBonus;
    const building = tile.buildingId ? state.buildings[tile.buildingId] : null;
    if (building && building.owner === army.owner && building.daysRemaining === 0) {
      const def = mapBuildingDef(building.buildingId);
      if (def.fortification) fortification *= def.fortification;
    }
  }

  // An army without ammunition still fights, but badly.
  const ammoNeeded = (base / 10) * BALANCE.combat.ammoPerPower;
  const ammo = (player?.stock.ammo ?? 0) >= ammoNeeded ? 1 : BALANCE.combat.outOfAmmoPenalty;

  const total = base * counterMultiplier * technology * cmd.general * terrain * fortification * ammo;
  return {
    base,
    technology,
    commander: cmd.general,
    terrain,
    fortification,
    ammo,
    counter: counterMultiplier,
    total: Math.max(0, total),
  };
}

/**
 * Distributes a casualty fraction across a composition. Rounding is done with a
 * running remainder so totals stay exact and the result is fully deterministic.
 */
function applyCasualties(army: Army, fraction: number): Record<string, number> {
  const losses: Record<string, number> = {};
  const clamped = Math.max(0, Math.min(BALANCE.combat.maxCasualties, fraction));
  let carry = 0;
  // Iterate in a stable order so identical inputs always produce identical losses.
  for (const troopId of Object.keys(army.composition).sort()) {
    const count = army.composition[troopId];
    if (count <= 0) continue;
    const exact = count * clamped + carry;
    const killed = Math.min(count, Math.floor(exact));
    carry = exact - killed;
    if (killed > 0) {
      army.composition[troopId] = count - killed;
      losses[troopId] = killed;
    }
  }
  return losses;
}

export interface CombatOutcome {
  report: CombatReport;
  attackerDestroyed: boolean;
  defenderDestroyed: boolean;
}

/**
 * Resolves one battle. Fully deterministic: same inputs, same outcome, which is
 * what makes the simulator usable for balance work.
 */
export function resolveCombat(
  state: MatchState,
  attacker: Army,
  defender: Army,
  tile: Tile,
): CombatOutcome {
  const attackPower = computePower(state, attacker, defender, tile, true);
  const defensePower = computePower(state, defender, attacker, tile, false);

  const a = attackPower.total;
  const d = defensePower.total;
  const attackerWins = a > d;

  const winner = attackerWins ? attacker : defender;
  const loser = attackerWins ? defender : attacker;
  const winnerPower = attackerWins ? a : d;
  const loserPower = attackerWins ? d : a;

  const ratio = loserPower > 0 ? winnerPower / loserPower : 4;
  const swing = Math.pow(Math.max(0.25, Math.min(4, ratio)), BALANCE.combat.ratioExponent);

  const winnerReduction = winner.commanderId
    ? commanderDef(winner.commanderId).ability.casualtyReduction ?? 0
    : 0;
  const loserReduction = loser.commanderId
    ? commanderDef(loser.commanderId).ability.casualtyReduction ?? 0
    : 0;

  const loserFraction = BALANCE.combat.baseLoserCasualties * swing * (1 - loserReduction);
  const winnerFraction = (BALANCE.combat.baseWinnerCasualties / swing) * (1 - winnerReduction);

  const winnerLosses = applyCasualties(winner, winnerFraction);
  const loserLosses = applyCasualties(loser, loserFraction);

  // Ammunition is consumed by both sides in proportion to committed power.
  for (const army of [attacker, defender]) {
    const player = state.players.find((p) => p.id === army.owner);
    if (!player) continue;
    const power = army === attacker ? attackPower.base : defensePower.base;
    player.stock.ammo = Math.max(0, player.stock.ammo - (power / 10) * BALANCE.combat.ammoPerPower);
  }

  const defenderDestroyed = armySize(defender) <= 0;
  const attackerDestroyed = armySize(attacker) <= 0;
  const capturedHex = attackerWins && defenderDestroyed;

  const powerDestroyed = attackerWins ? d : a;
  const xpAwarded = Math.round(powerDestroyed * BALANCE.combat.xpPerPowerDestroyed);

  const report: CombatReport = {
    day: state.day,
    hex: tile.id,
    attacker: attacker.owner,
    defender: defender.owner,
    attackerPower: Math.round(a),
    defenderPower: Math.round(d),
    winner: winner.owner,
    attackerLosses: attackerWins ? winnerLosses : loserLosses,
    defenderLosses: attackerWins ? loserLosses : winnerLosses,
    capturedHex,
    xpAwarded,
  };

  // Statistics feed the results screen and the balance simulator.
  const attackerPlayer = state.players.find((p) => p.id === attacker.owner);
  const defenderPlayer = state.players.find((p) => p.id === defender.owner);
  const countLosses = (losses: Record<string, number>) =>
    Object.values(losses).reduce((x, y) => x + y, 0);
  const attackerLost = countLosses(report.attackerLosses);
  const defenderLost = countLosses(report.defenderLosses);
  if (attackerPlayer) {
    attackerPlayer.stats.troopsLost += attackerLost;
    attackerPlayer.stats.troopsKilled += defenderLost;
    if (attackerWins) attackerPlayer.stats.battlesWon++;
    else attackerPlayer.stats.battlesLost++;
  }
  if (defenderPlayer) {
    defenderPlayer.stats.troopsLost += defenderLost;
    defenderPlayer.stats.troopsKilled += attackerLost;
    if (attackerWins) defenderPlayer.stats.battlesLost++;
    else defenderPlayer.stats.battlesWon++;
  }

  return { report, attackerDestroyed, defenderDestroyed };
}

/** Raw army power used by the AI and the score, ignoring terrain and enemy. */
export function armyPower(state: MatchState, army: Army): number {
  const player = state.players.find((p) => p.id === army.owner);
  let total = 0;
  for (const [troopId, count] of Object.entries(army.composition)) {
    if (count <= 0) continue;
    const def = troopDef(troopId);
    const level = player?.troopLevels[troopId] ?? 1;
    total += count * (troopAttackAt(def, level) + troopDefenseAt(def, level)) * 0.5;
  }
  const mods = player?.modifiers;
  if (mods) total *= (mods.attackMultiplier + mods.defenseMultiplier) / 2;
  if (army.commanderId) {
    const def = commanderDef(army.commanderId);
    total *= 1 + (def.specialtyAttackBonus + def.specialtyDefenseBonus) / 4;
  }
  return Math.round(total);
}

export function playerMilitaryPower(state: MatchState, playerId: string): number {
  let total = 0;
  for (const army of Object.values(state.armies)) {
    if (army.owner === playerId) total += armyPower(state, army);
  }
  return total;
}
