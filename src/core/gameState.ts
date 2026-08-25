import { Rng } from './rng';
import { generateMap } from '../map/mapGeneration';
import { BALANCE } from '../data/balance';
import { TROOP_IDS } from '../data/troops';
import {
  createNewCity,
  deriveCityEffects,
  unlockedCommanders,
  type CityState,
} from '../entities/city';
import {
  defaultModifiers,
  emptyStock,
  type Army,
  type BotPersonality,
  type MatchPlayer,
  type MatchState,
  type PlayerId,
  type PlayerLoadout,
  type Stock,
} from './types';
import { defaultStorage, grant } from './resources';
import { recomputeModifiers } from './technology';
import { updateFog, revealArea } from '../map/fogOfWar';
import { updateTerritory } from './territory';
import { createObjectiveProgress, pickMainObjective, allSecondaryObjectiveIds } from './objectives';
import { updateAllScores } from './scoring';
import { computeMaxMovementPoints } from './movement';
import type { AnyMatchResourceId } from '../data/resources';

export const PLAYER_COLORS = [0x4da3ff, 0xff6b4d, 0x63d471, 0xffd166, 0xc77dff];

export const BOT_NAMES: Record<BotPersonality, string> = {
  military: 'Brigada Hierro',
  economic: 'Consorcio Meridian',
  explorer: 'Grupo Vanguardia',
  diplomatic: 'Pacto Solano',
};

export const BOT_PERSONALITIES: BotPersonality[] = [
  'military',
  'economic',
  'explorer',
  'diplomatic',
];

export interface CreateMatchOptions {
  seed: number;
  city: CityState;
  humanName?: string;
}

/** Converts the persistent city into everything the match needs from it. */
export function buildHumanLoadout(city: CityState): PlayerLoadout {
  const effects = deriveCityEffects(city);
  const commanders = unlockedCommanders(city);
  const commanderLevels: Record<string, number> = {};
  for (const [id, progress] of Object.entries(city.commanders)) {
    commanderLevels[id] = progress.level;
  }

  const startStock: Partial<Stock> = {};
  for (const [key, value] of Object.entries(effects.startResources)) {
    if (key === 'infantryStart') continue;
    startStock[key as AnyMatchResourceId] = value;
  }

  const baseModifiers = defaultModifiers();
  baseModifiers.productionMultiplier = effects.productionMultiplier;
  baseModifiers.scienceMultiplier = effects.scienceMultiplier;
  baseModifiers.attackMultiplier = effects.attackMultiplier;
  baseModifiers.defenseMultiplier = effects.defenseMultiplier;
  baseModifiers.movementBonus = effects.movementBonus;
  baseModifiers.storageBonus = effects.storage;

  return {
    cityTier: effects.cityTier,
    startStock,
    citizens: effects.citizens,
    armySlots: Math.max(1, effects.armySlots),
    commanderSlots: Math.max(1, effects.commanderSlots),
    commanders: commanders.slice(0, Math.max(1, effects.commanderSlots)),
    commanderLevels,
    troopLevels: { ...city.troopLevels },
    baseModifiers,
    startingInfantry: effects.startResources.infantryStart ?? 10,
    intelReveal: effects.intelReveal,
    diplomacyPressure: effects.diplomacyPressure,
    rewardMultiplier: effects.rewardMultiplier,
    commanderXpBonus: effects.commanderXpBonus,
  };
}

/**
 * Bots are built from a synthetic city of roughly the human's strength, then
 * skewed by personality. Matchmaking stays interesting as the player grows
 * without needing a separate bot balance table.
 */
export function buildBotLoadout(
  personality: BotPersonality,
  humanLoadout: PlayerLoadout,
  rng: Rng,
): PlayerLoadout {
  const tier = Math.max(1, humanLoadout.cityTier + rng.int(-1, 1));
  const baseModifiers = defaultModifiers();
  baseModifiers.productionMultiplier = 1 + (tier - 1) * 0.1;
  baseModifiers.scienceMultiplier = 1 + (tier - 1) * 0.1;
  baseModifiers.attackMultiplier = 1 + (tier - 1) * 0.05;
  baseModifiers.defenseMultiplier = 1 + (tier - 1) * 0.05;

  const troopLevels: Record<string, number> = {};
  const botTroopLevel = Math.max(1, Math.min(5, Math.round(averageTroopLevel(humanLoadout))));
  for (const id of TROOP_IDS) troopLevels[id] = botTroopLevel;

  const startStock: Partial<Stock> = {};
  for (const [key, value] of Object.entries(humanLoadout.startStock)) {
    startStock[key as AnyMatchResourceId] = Math.round((value ?? 0) * 0.95);
  }

  const loadout: PlayerLoadout = {
    cityTier: tier,
    startStock,
    citizens: humanLoadout.citizens,
    armySlots: Math.max(2, humanLoadout.armySlots),
    commanderSlots: 1,
    commanders: [],
    commanderLevels: {},
    troopLevels,
    baseModifiers,
    startingInfantry: humanLoadout.startingInfantry,
    intelReveal: 0,
    diplomacyPressure: 0,
    rewardMultiplier: 1,
    commanderXpBonus: 0,
  };

  // Personality skew: each bot is genuinely better at the thing it cares about.
  switch (personality) {
    case 'military':
      loadout.baseModifiers.attackMultiplier *= 1.15;
      loadout.startingInfantry = Math.round(loadout.startingInfantry * 1.5);
      break;
    case 'economic':
      loadout.baseModifiers.productionMultiplier *= 1.2;
      loadout.citizens += 4;
      break;
    case 'explorer':
      loadout.baseModifiers.movementBonus += 2;
      loadout.baseModifiers.visionBonus += 1;
      break;
    case 'diplomatic':
      loadout.baseModifiers.defenseMultiplier *= 1.15;
      loadout.baseModifiers.scienceMultiplier *= 1.15;
      break;
  }
  return loadout;
}

function averageTroopLevel(loadout: PlayerLoadout): number {
  const values = Object.values(loadout.troopLevels);
  if (values.length === 0) return 1;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function createPlayer(
  id: PlayerId,
  name: string,
  isHuman: boolean,
  personality: BotPersonality | null,
  color: number,
  loadout: PlayerLoadout,
): MatchPlayer {
  const player: MatchPlayer = {
    id,
    name,
    isHuman,
    personality,
    color,
    stock: emptyStock(),
    storage: defaultStorage(loadout.baseModifiers.storageBonus),
    citizensFree: 0,
    citizensTotal: 0,
    technologies: [],
    troopLevels: { ...loadout.troopLevels },
    unlockedRegions: [],
    fog: {},
    modifiers: defaultModifiers(),
    loadout,
    commanders: [...loadout.commanders],
    armySlots: loadout.armySlots,
    score: 0,
    eliminated: false,
    nonAggression: [],
    stats: {
      hexesControlled: 0,
      buildingsBuilt: 0,
      battlesWon: 0,
      battlesLost: 0,
      troopsLost: 0,
      troopsKilled: 0,
      resourcesGathered: 0,
      rareGathered: 0,
      techsResearched: 0,
    },
  };
  recomputeModifiers(player);
  const citizens = Math.min(BALANCE.citizens.max, BALANCE.citizens.base + loadout.citizens);
  player.citizensTotal = citizens;
  player.citizensFree = citizens;
  // Baseline kit first, then whatever the city's warehouse adds on top.
  for (const [key, value] of Object.entries(BALANCE.economy.startingKit)) {
    grant(player, key as AnyMatchResourceId, value);
  }
  for (const [key, value] of Object.entries(loadout.startStock)) {
    if (!value) continue;
    grant(player, key as AnyMatchResourceId, value);
  }
  return player;
}

export function createMatch(options: CreateMatchOptions): MatchState {
  const { seed } = options;
  const city = options.city ?? createNewCity();
  const rng = new Rng(seed);

  const humanLoadout = buildHumanLoadout(city);
  const playerIds: PlayerId[] = ['p0', 'p1', 'p2', 'p3', 'p4'];
  const personalities = rng.shuffle(BOT_PERSONALITIES);

  const players: MatchPlayer[] = playerIds.map((id, index) => {
    if (index === 0) {
      return createPlayer(id, options.humanName ?? 'Comandante', true, null, PLAYER_COLORS[0], humanLoadout);
    }
    const personality = personalities[(index - 1) % personalities.length];
    return createPlayer(
      id,
      BOT_NAMES[personality],
      false,
      personality,
      PLAYER_COLORS[index],
      buildBotLoadout(personality, humanLoadout, rng),
    );
  });

  const generated = generateMap(seed, playerIds);

  const state: MatchState = {
    seed,
    day: 1,
    totalDays: BALANCE.match.totalDays,
    phase: 'dayStart',
    finished: false,
    winner: null,
    endReason: null,
    tiles: generated.tiles,
    tileOrder: generated.tileOrder,
    regions: generated.regions,
    players,
    humanId: playerIds[0],
    armies: {},
    buildings: {},
    mainObjective: createObjectiveProgress(pickMainObjective(rng), playerIds),
    secondaryObjectives: allSecondaryObjectiveIds().map((id) =>
      createObjectiveProgress(id, playerIds),
    ),
    events: [],
    combatLog: [],
    commanderXp: {},
    nextEntityId: 1,
    rngState: rng.getState(),
  };

  // Regions with no lock are open to everyone from day one.
  for (const player of players) {
    player.unlockedRegions = state.regions.filter((r) => r.lock.type === 'none').map((r) => r.id);
    for (const id of state.tileOrder) player.fog[id] = 0;
  }

  // Every participant fields one army on their start hex.
  for (const player of players) {
    const startHex = generated.startPositions[player.id];
    const army = createArmy(state, player, startHex, `${player.name} Alfa`);
    army.composition.infantry = player.loadout.startingInfantry;
    army.composition.recon = 2;
    if (player.commanders.length > 0) army.commanderId = player.commanders[0];
    army.maxMovementPoints = computeMaxMovementPoints(state, army);
    army.movementPoints = army.maxMovementPoints;
  }

  updateTerritory(state);
  updateFog(state);

  // Diplomatic intel: the city's diplomatic centre reveals rival deployments.
  const human = players[0];
  if (human.loadout.intelReveal > 0) {
    for (const player of players) {
      if (player.id === human.id) continue;
      revealArea(human, state, generated.startPositions[player.id], human.loadout.intelReveal);
    }
  }

  updateAllScores(state);
  state.rngState = rng.getState();
  return state;
}

export function createArmy(
  state: MatchState,
  player: MatchPlayer,
  hex: string,
  name?: string,
): Army {
  const id = `a${state.nextEntityId++}`;
  const army: Army = {
    id,
    name: name ?? `${player.name} ${String.fromCharCode(65 + countArmies(state, player.id))}`,
    owner: player.id,
    hex,
    commanderId: null,
    composition: {},
    movementPoints: 0,
    maxMovementPoints: 0,
    actedThisDay: false,
    lastOrder: null,
  };
  state.armies[id] = army;
  return army;
}

export function countArmies(state: MatchState, playerId: PlayerId): number {
  return Object.values(state.armies).filter((a) => a.owner === playerId).length;
}

export function armiesOf(state: MatchState, playerId: PlayerId): Army[] {
  return Object.values(state.armies).filter((a) => a.owner === playerId);
}

export function playerById(state: MatchState, id: PlayerId): MatchPlayer {
  const player = state.players.find((p) => p.id === id);
  if (!player) throw new Error(`Jugador desconocido: ${id}`);
  return player;
}

export function humanPlayer(state: MatchState): MatchPlayer {
  return playerById(state, state.humanId);
}

/** Restores the RNG mid-match, so day advancement stays reproducible. */
export function matchRng(state: MatchState): Rng {
  const rng = new Rng(state.seed);
  rng.setState(state.rngState);
  return rng;
}

export function saveRng(state: MatchState, rng: Rng): void {
  state.rngState = rng.getState();
}
