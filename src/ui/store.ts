import { create } from 'zustand';
import type { HexId } from '../map/hex';
import type { MatchState } from '../core/types';
import { createMatch } from '../core/gameState';
import { startDay, endDay } from '../core/turnSystem';
import { runBotTurn } from '../ai/botController';
import { autoPlayRemainingDays } from '../sim/simulateMatch';
import { computeRewards, applyRewards, type MatchRewards } from '../core/rewards';
import { CITY_SAVE_VERSION, createNewCity, type CityState } from '../entities/city';
import { hashSeed } from '../core/rng';

export type Screen = 'city' | 'matchmaking' | 'match' | 'results' | 'simulator';

/**
 * A queued action waiting for the player to pick a hex on the map. This is what
 * makes the UI touch-friendly: choose the verb, then tap the target, with no
 * drag gestures or hover states required.
 */
export type PendingAction = { type: 'move' } | { type: 'attack' } | null;

const CITY_STORAGE_KEY = 'op9d.city.v1';

function loadCity(): CityState {
  try {
    const raw = localStorage.getItem(CITY_STORAGE_KEY);
    if (!raw) return createNewCity();
    const parsed = JSON.parse(raw) as CityState;
    if (parsed.version !== CITY_SAVE_VERSION) return createNewCity();
    // Merge over a fresh city so a save from an older build cannot leave holes.
    return { ...createNewCity(), ...parsed };
  } catch {
    return createNewCity();
  }
}

function persistCity(city: CityState): void {
  try {
    localStorage.setItem(CITY_STORAGE_KEY, JSON.stringify(city));
  } catch {
    // Storage may be unavailable (private mode). The session still works.
  }
}

export interface GameStore {
  screen: Screen;
  city: CityState;
  match: MatchState | null;
  /** Bumped on every mutation so React re-renders against mutable state. */
  tick: number;
  selectedHex: HexId | null;
  selectedArmyId: string | null;
  pendingAction: PendingAction;
  lastRewards: MatchRewards | null;
  toast: string | null;
  debugOpen: boolean;
  /** Seed of the next match; empty means "roll one". */
  seedInput: string;

  refresh: () => void;
  setScreen: (screen: Screen) => void;
  notify: (message: string) => void;
  clearToast: () => void;

  saveCity: () => void;
  resetCity: () => void;
  mutateCity: (fn: (city: CityState) => void) => void;

  setSeedInput: (seed: string) => void;
  startMatch: (seed?: number) => void;
  abandonMatch: () => void;
  nextDay: () => void;
  simulateRestOfMatch: () => void;
  finishAndCollect: () => void;
  returnToCity: () => void;

  selectHex: (hex: HexId | null) => void;
  selectArmy: (armyId: string | null) => void;
  setPendingAction: (action: PendingAction) => void;
  toggleDebug: () => void;
}

export const useGame = create<GameStore>((set, get) => ({
  screen: 'city',
  city: loadCity(),
  match: null,
  tick: 0,
  selectedHex: null,
  selectedArmyId: null,
  pendingAction: null,
  lastRewards: null,
  toast: null,
  debugOpen: false,
  seedInput: '',

  refresh: () => set((s) => ({ tick: s.tick + 1 })),

  setScreen: (screen) => set({ screen }),

  notify: (message) => set({ toast: message }),
  clearToast: () => set({ toast: null }),

  saveCity: () => {
    persistCity(get().city);
    get().refresh();
  },

  resetCity: () => {
    const city = createNewCity();
    persistCity(city);
    set({ city, match: null, lastRewards: null, screen: 'city' });
    get().refresh();
  },

  mutateCity: (fn) => {
    const city = get().city;
    fn(city);
    persistCity(city);
    get().refresh();
  },

  setSeedInput: (seedInput) => set({ seedInput }),

  startMatch: (seed) => {
    const raw = get().seedInput.trim();
    const resolved =
      seed ??
      (raw.length > 0
        ? /^\d+$/.test(raw)
          ? Number(raw)
          : hashSeed(raw)
        : Math.floor(Math.random() * 1_000_000));
    const match = createMatch({ seed: resolved, city: get().city });
    startDay(match);
    const humanArmy = Object.values(match.armies).find((a) => a.owner === match.humanId);
    set({
      match,
      screen: 'match',
      selectedArmyId: humanArmy?.id ?? null,
      selectedHex: humanArmy?.hex ?? null,
      pendingAction: null,
      lastRewards: null,
    });
    get().refresh();
  },

  abandonMatch: () => {
    set({ match: null, screen: 'city', selectedArmyId: null, selectedHex: null, pendingAction: null });
    get().refresh();
  },

  nextDay: () => {
    const match = get().match;
    if (!match || match.finished) return;
    endDay(match, (state, botId) => runBotTurn(state, botId));
    if (match.finished) {
      get().finishAndCollect();
      return;
    }
    set({ pendingAction: null });
    get().refresh();
  },

  simulateRestOfMatch: () => {
    const match = get().match;
    if (!match || match.finished) return;
    // Shared with the CLI simulator: the turn pipeline skips the human seat, so
    // auto-play has to drive it explicitly or the player just stands still.
    autoPlayRemainingDays(match);
    get().finishAndCollect();
  },

  finishAndCollect: () => {
    const match = get().match;
    if (!match) return;
    const city = get().city;
    const rewards = computeRewards(match, match.humanId, city);
    applyRewards(city, rewards);
    persistCity(city);
    set({ lastRewards: rewards, screen: 'results', city });
    get().refresh();
  },

  returnToCity: () => {
    set({ screen: 'city', match: null, selectedArmyId: null, selectedHex: null, pendingAction: null });
    get().refresh();
  },

  selectHex: (selectedHex) => {
    set({ selectedHex });
    get().refresh();
  },

  selectArmy: (selectedArmyId) => {
    const match = get().match;
    const army = selectedArmyId && match ? match.armies[selectedArmyId] : null;
    set({ selectedArmyId, selectedHex: army ? army.hex : get().selectedHex });
    get().refresh();
  },

  setPendingAction: (pendingAction) => {
    set({ pendingAction });
    get().refresh();
  },

  toggleDebug: () => {
    set((s) => ({ debugOpen: !s.debugOpen }));
    get().refresh();
  },
}));

