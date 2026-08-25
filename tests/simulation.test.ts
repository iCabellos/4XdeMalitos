import { describe, it, expect } from 'vitest';
import { createMatch, humanPlayer, armiesOf } from '../src/core/gameState';
import { startDay } from '../src/core/turnSystem';
import { autoPlayRemainingDays, simulateMatch } from '../src/sim/simulateMatch';
import { createNewCity } from '../src/entities/city';
import { BALANCE } from '../src/data/balance';

describe('headless simulation', () => {
  it('plays a full match and names a winner', () => {
    const result = simulateMatch({ seed: 847392, city: createNewCity() });
    expect(result.state.finished).toBe(true);
    expect(result.winner).toBeTruthy();
    expect(result.days).toBeLessThanOrEqual(BALANCE.match.totalDays);
    expect(result.log.join('\n')).toContain('GANADOR');
  });

  it('is reproducible for a given seed', () => {
    const a = simulateMatch({ seed: 5150, city: createNewCity() });
    const b = simulateMatch({ seed: 5150, city: createNewCity() });
    expect(a.winner).toBe(b.winner);
    expect(a.log).toEqual(b.log);
  });

  /**
   * Regression: the day pipeline deliberately skips the human seat, so any
   * auto-play must drive it explicitly. A previous version of the in-game
   * AUTO-SIM did not, and the player finished every match with two hexes and no
   * research while the bots played normally.
   */
  it('auto-play actually plays the human seat', () => {
    const state = createMatch({ seed: 4242, city: createNewCity() });
    startDay(state);
    autoPlayRemainingDays(state);

    const human = humanPlayer(state);
    expect(state.finished).toBe(true);
    expect(human.stats.hexesControlled).toBeGreaterThan(3);
    expect(human.technologies.length).toBeGreaterThan(0);
    expect(human.stats.resourcesGathered).toBeGreaterThan(0);
  });

  it('leaves the human seat competitive rather than last by default', () => {
    // Across several seeds an auto-played human should not be dead last every
    // time; that would mean the seat is being skipped rather than played badly.
    let lastPlaceCount = 0;
    const runs = 8;
    for (let i = 0; i < runs; i++) {
      const result = simulateMatch({ seed: 900 + i, city: createNewCity() });
      const sorted = [...result.state.players].sort((a, b) => b.score - a.score);
      if (sorted[sorted.length - 1].isHuman) lastPlaceCount++;
    }
    expect(lastPlaceCount).toBeLessThan(runs);
  });

  it('restores the human personality after auto-play so manual play still works', () => {
    const state = createMatch({ seed: 77, city: createNewCity() });
    startDay(state);
    expect(humanPlayer(state).personality).toBeNull();
    autoPlayRemainingDays(state);
    expect(humanPlayer(state).personality).toBeNull();
  });

  it('keeps every participant fielding armies through the whole match', () => {
    const state = createMatch({ seed: 31337, city: createNewCity() });
    startDay(state);
    autoPlayRemainingDays(state);
    const withArmies = state.players.filter((p) => armiesOf(state, p.id).length > 0);
    expect(withArmies.length).toBeGreaterThanOrEqual(3);
  });

  it('produces real conflict and real expansion across a sweep of seeds', () => {
    let battles = 0;
    let rareGathered = 0;
    let techs = 0;
    const runs = 10;
    for (let i = 0; i < runs; i++) {
      const result = simulateMatch({ seed: 2000 + i, city: createNewCity() });
      battles += result.state.combatLog.length;
      for (const player of result.state.players) {
        rareGathered += player.stats.rareGathered;
        techs += player.technologies.length;
      }
    }
    // A prototype where nothing ever fights, no rare resource is taken and no
    // research lands is not a 4X; these assert the loop is actually alive.
    expect(battles).toBeGreaterThan(0);
    expect(rareGathered).toBeGreaterThan(0);
    expect(techs).toBeGreaterThan(runs);
  });

  it('never runs past day nine', () => {
    for (let seed = 300; seed < 306; seed++) {
      const result = simulateMatch({ seed, city: createNewCity() });
      expect(result.state.day).toBeLessThanOrEqual(BALANCE.match.totalDays);
    }
  });
});
