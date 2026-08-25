/**
 * The day pipeline. A match is exactly nine days, and each day resolves in a
 * fixed order so results are reproducible and testable:
 *
 *   1 dayStart      movement points reset
 *   2 production    buildings yield, upkeep is paid, citizens grow
 *   3 player        (interactive: the human acts before calling endDay)
 *   4 bots          each bot AI takes its decisions
 *   5 movement      multi-day marches continue
 *   6 construction  build queues advance and complete
 *   7 gathering     armies standing on nodes scrape resources
 *   8 combat        any hostile stacks left on the same hex resolve
 *   9 objectives    hold counters tick, objectives complete
 *  10 mapUpdate     territory and fog recomputed
 *  11 dayEnd        scores update, victory conditions are checked
 */
import { BALANCE } from '../data/balance';
import { mapBuildingDef } from '../data/buildings.map';
import { logEvent } from './events';
import { growCitizens, runProduction, runUpkeep, gatherWithArmy } from './economy';
import { computeMaxMovementPoints, isArmyEmpty, armySize } from './movement';
import { resolveCombat } from './combat';
import { tickObjectives } from './objectives';
import { updateTerritory } from './territory';
import { updateFog } from '../map/fogOfWar';
import { updateAllScores, standings } from './scoring';
import { armiesOf, createArmy, matchRng, playerById, saveRng } from './gameState';
import { enemyArmiesAt, openBuildingLockedRegions } from './actions';
import type { MatchState, PlayerId } from './types';

export type BotRunner = (state: MatchState, botId: PlayerId) => void;

/** Phase 1-2. Called at the start of every day, including day 1. */
export function startDay(state: MatchState): void {
  if (state.finished) return;

  state.phase = 'dayStart';
  for (const army of Object.values(state.armies)) {
    army.maxMovementPoints = computeMaxMovementPoints(state, army);
    army.movementPoints = army.maxMovementPoints;
    army.actedThisDay = false;
  }

  // A player with nothing left still holding their capital gets a reserve levy,
  // so nobody is silently removed from a nine-day match on day three.
  for (const player of state.players) {
    if (player.eliminated) continue;
    if (armiesOf(state, player.id).length > 0) continue;
    const capital = state.tileOrder.find((id) => state.tiles[id].feature.startFor === player.id);
    if (!capital) continue;
    if (enemyArmiesAt(state, capital, player.id).length > 0) continue;
    const army = createArmy(state, player, capital, `${player.name} Reserva`);
    army.composition.infantry = 5;
    army.maxMovementPoints = computeMaxMovementPoints(state, army);
    army.movementPoints = army.maxMovementPoints;
    logEvent(state, 'levy', `${player.name} moviliza una reserva de emergencia.`, {
      playerId: player.id,
      hex: capital,
    });
  }

  state.phase = 'production';
  for (const player of state.players) {
    if (player.eliminated) continue;
    const { produced, offline } = runProduction(state, player);
    const { starving, unsupplied } = runUpkeep(state, player);
    const growth = growCitizens(player, starving);

    if (offline > 0) {
      logEvent(state, 'offline', `${player.name}: ${offline} estructuras sin energia.`, {
        playerId: player.id,
        visibleToHuman: player.isHuman,
      });
    }
    if (starving) {
      logEvent(state, 'starving', `${player.name} se queda sin comida: la poblacion cae.`, {
        playerId: player.id,
        visibleToHuman: player.isHuman,
      });
    }
    if (unsupplied.length > 0) {
      logEvent(
        state,
        'unsupplied',
        `${player.name} sin suministros de ${unsupplied.join(', ')}: las tropas pierden eficacia.`,
        { playerId: player.id, visibleToHuman: player.isHuman },
      );
    }
    if (growth > 0) {
      logEvent(state, 'citizens', `${player.name} suma un ciudadano (${player.citizensTotal}).`, {
        playerId: player.id,
        visibleToHuman: player.isHuman,
      });
    }
    const total = Object.values(produced).reduce((a, b) => a + (b ?? 0), 0);
    if (total > 0 && player.isHuman) {
      logEvent(
        state,
        'production',
        `Produccion del dia ${state.day}: ${Object.entries(produced)
          .filter(([, v]) => (v ?? 0) >= 1)
          .map(([k, v]) => `${Math.round(v ?? 0)} ${k}`)
          .join(', ')}.`,
        { playerId: player.id },
      );
    }
  }

  state.phase = 'player';
}

/** Phases 4-11, followed by the next day's 1-2. */
export function endDay(state: MatchState, runBot?: BotRunner): void {
  if (state.finished) return;

  state.phase = 'bots';
  for (const player of state.players) {
    if (player.isHuman || player.eliminated) continue;
    runBot?.(state, player.id);
  }

  state.phase = 'movement';
  // Movement itself is applied immediately by actions; this step exists so the
  // pipeline order is explicit and multi-day marches have a home later.

  state.phase = 'construction';
  advanceConstruction(state);

  state.phase = 'gathering';
  for (const army of Object.values(state.armies)) {
    if (army.lastOrder?.type !== 'gather') continue;
    const player = playerById(state, army.owner);
    gatherWithArmy(state, player, army);
  }

  state.phase = 'combat';
  resolveStackedCombat(state);

  state.phase = 'objectives';
  updateTerritory(state);
  const objectiveResult = tickObjectives(state);
  for (const done of objectiveResult.completed) {
    const player = playerById(state, done.playerId);
    logEvent(state, 'objective', `${player.name} completa el objetivo ${done.objectiveId}.`, {
      playerId: done.playerId,
    });
  }

  state.phase = 'mapUpdate';
  updateTerritory(state);
  updateFog(state);
  for (const player of state.players) openBuildingLockedRegions(state, player.id);

  state.phase = 'dayEnd';
  accumulateCommanderXp(state);
  updateAllScores(state);
  checkElimination(state);

  if (objectiveResult.mainCompletedBy) {
    finishMatch(state, objectiveResult.mainCompletedBy, 'objective');
    return;
  }

  const survivors = state.players.filter((p) => !p.eliminated);
  if (survivors.length === 1) {
    finishMatch(state, survivors[0].id, 'elimination');
    return;
  }

  if (state.day >= state.totalDays) {
    finishMatch(state, standings(state)[0].id, 'score');
    return;
  }

  state.day++;
  startDay(state);
}

/** Runs a whole day: bots, resolution, and the next day's production. */
export function advanceDay(state: MatchState, runBot?: BotRunner): void {
  endDay(state, runBot);
}

/** Advances until the match ends, with a hard cap as a runaway guard. */
export function simulateToEnd(state: MatchState, runBot?: BotRunner): void {
  let guard = 0;
  while (!state.finished && guard < 100) {
    advanceDay(state, runBot);
    guard++;
  }
}

function advanceConstruction(state: MatchState): void {
  for (const building of Object.values(state.buildings)) {
    if (building.daysRemaining <= 0) continue;
    building.daysRemaining--;
    if (building.daysRemaining === 0) {
      const player = playerById(state, building.owner);
      const def = mapBuildingDef(building.buildingId);
      logEvent(state, 'buildComplete', `${player.name}: ${def.name} operativa.`, {
        playerId: building.owner,
        hex: building.hex,
        visibleToHuman: player.isHuman,
      });
    }
  }
}

/**
 * Safety net: if hostile armies are somehow sharing a hex at end of day (a hex
 * captured under a defender, for instance), they fight. Deterministic ordering
 * by army id keeps the resolution reproducible.
 */
function resolveStackedCombat(state: MatchState): void {
  const byHex: Record<string, string[]> = {};
  for (const army of Object.values(state.armies)) {
    if (isArmyEmpty(army)) continue;
    (byHex[army.hex] ??= []).push(army.id);
  }
  for (const [hex, armyIds] of Object.entries(byHex)) {
    const sorted = armyIds.slice().sort();
    const owners = new Set(sorted.map((id) => state.armies[id].owner));
    if (owners.size < 2) continue;
    const tile = state.tiles[hex];
    if (!tile) continue;
    const first = state.armies[sorted[0]];
    for (const otherId of sorted.slice(1)) {
      const other = state.armies[otherId];
      if (!other || !state.armies[first.id]) break;
      if (other.owner === first.owner) continue;
      const outcome = resolveCombat(state, first, other, tile);
      state.combatLog.push(outcome.report);
      logEvent(
        state,
        'combat',
        `Choque en ${hex}: vence ${playerById(state, outcome.report.winner).name}.`,
        { hex, playerId: outcome.report.winner },
      );
      if (outcome.defenderDestroyed) delete state.armies[other.id];
      if (outcome.attackerDestroyed) {
        delete state.armies[first.id];
        break;
      }
    }
  }
  // Remove any formation that ended the day with nothing left.
  for (const army of Object.values(state.armies)) {
    if (isArmyEmpty(army)) delete state.armies[army.id];
  }
}

/** Commanders earn XP from the battles their army won during the day. */
function accumulateCommanderXp(state: MatchState): void {
  for (const report of state.combatLog) {
    if (report.day !== state.day) continue;
    const winnerArmies = Object.values(state.armies).filter(
      (a) => a.owner === report.winner && a.hex === report.hex && a.commanderId,
    );
    for (const army of winnerArmies) {
      if (!army.commanderId) continue;
      state.commanderXp[army.commanderId] =
        (state.commanderXp[army.commanderId] ?? 0) + report.xpAwarded;
    }
  }
}

function checkElimination(state: MatchState): void {
  for (const player of state.players) {
    if (player.eliminated) continue;
    const hasArmy = armiesOf(state, player.id).length > 0;
    const hasBuilding = Object.values(state.buildings).some((b) => b.owner === player.id);
    const capital = state.tileOrder.find((id) => state.tiles[id].feature.startFor === player.id);
    const holdsCapital = capital ? state.tiles[capital].controlledBy === player.id : false;
    if (!hasArmy && !hasBuilding && !holdsCapital) {
      player.eliminated = true;
      logEvent(state, 'eliminated', `${player.name} queda fuera de la operacion.`, {
        playerId: player.id,
      });
    }
  }
}

export function finishMatch(
  state: MatchState,
  winner: PlayerId,
  reason: 'objective' | 'score' | 'elimination',
): void {
  updateAllScores(state);
  state.finished = true;
  state.winner = winner;
  state.endReason = reason;
  state.phase = 'finished';
  const name = playerById(state, winner).name;
  const reasonText =
    reason === 'objective'
      ? 'completa el objetivo principal'
      : reason === 'elimination'
        ? 'queda como unico superviviente'
        : 'gana por puntuacion';
  logEvent(state, 'matchEnd', `FIN: ${name} ${reasonText}.`, { playerId: winner });
}

/** Total troops still standing, used by the results screen and tests. */
export function totalArmyStrength(state: MatchState, playerId: PlayerId): number {
  return armiesOf(state, playerId).reduce((sum, army) => sum + armySize(army), 0);
}

export { BALANCE, matchRng, saveRng };
