/**
 * Headless match simulation. Runs the exact same core the UI runs, with no
 * rendering at all, which is what makes it usable for balance work and tests.
 */
import { createMatch } from '../core/gameState';
import { startDay, endDay } from '../core/turnSystem';
import { runBotTurn } from '../ai/botController';
import { standings } from '../core/scoring';
import { createNewCity, type CityState } from '../entities/city';
import { computeRewards, type MatchRewards } from '../core/rewards';
import type { MatchState, PlayerId } from '../core/types';
import { eventsForDay } from '../core/events';

export interface SimulationOptions {
  seed: number;
  city?: CityState;
  /** Also drive the human seat with the bot AI. */
  autoPlayHuman?: boolean;
  /** Personality used for the human seat when auto-played. */
  onEvent?: (day: number, line: string) => void;
}

export interface SimulationResult {
  state: MatchState;
  winner: PlayerId;
  log: string[];
  rewards: MatchRewards;
  days: number;
}

const AUTOPLAY_PERSONALITY = 'economic' as const;

/** Runs a full nine-day match with no human input and returns a readable log. */
export function simulateMatch(options: SimulationOptions): SimulationResult {
  const city = options.city ?? createNewCity();
  const state = createMatch({ seed: options.seed, city });

  // Give the human seat a personality so the AI can drive it too.
  const human = state.players.find((p) => p.isHuman)!;
  const originalPersonality = human.personality;
  if (options.autoPlayHuman !== false) human.personality = AUTOPLAY_PERSONALITY;

  const log: string[] = [];
  startDay(state);

  let guard = 0;
  while (!state.finished && guard < 50) {
    const day = state.day;
    if (options.autoPlayHuman !== false) runBotTurn(state, human.id);
    endDay(state, (s, botId) => runBotTurn(s, botId));

    const header = `DIA ${day}`;
    log.push(header);
    options.onEvent?.(day, header);
    for (const event of eventsForDay(state, day)) {
      if (event.kind === 'production') continue;
      const line = `  ${event.text}`;
      log.push(line);
      options.onEvent?.(day, line);
    }
    guard++;
  }

  human.personality = originalPersonality;

  const table = standings(state);
  log.push('');
  log.push('CLASIFICACION FINAL');
  table.forEach((player, index) => {
    log.push(
      `  ${index + 1}. ${player.name.padEnd(20)} ${String(player.score).padStart(5)} pts   ` +
        `territorio ${player.stats.hexesControlled}  raros ${Math.round(
          player.stock.titanium + player.stock.uranium + player.stock.crystal,
        )}  tec ${player.technologies.length}  batallas ${player.stats.battlesWon}-${player.stats.battlesLost}`,
    );
  });
  const winnerName = state.players.find((p) => p.id === state.winner)?.name ?? '-';
  log.push('');
  log.push(`GANADOR: ${winnerName} (${state.endReason})`);

  const rewards = computeRewards(state, state.humanId, city);

  return {
    state,
    winner: state.winner ?? table[0].id,
    log,
    rewards,
    days: state.day,
  };
}
