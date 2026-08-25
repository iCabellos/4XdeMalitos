import type { HexId } from '../map/hex';
import type { TerrainId } from '../data/terrain';
import type { AnyMatchResourceId } from '../data/resources';
import type { MapBuildingId } from '../data/buildings.map';
import type { ObjectiveGoal } from '../data/objectives';

export type PlayerId = string;

/** Stockpile: every match resource maps to a number, always present. */
export type Stock = Record<AnyMatchResourceId, number>;

export type FogLevel = 0 | 1 | 2; // 0 hidden, 1 explored (memory), 2 visible

export interface ResourceNodeInstance {
  /** Key into RESOURCE_NODES. */
  nodeId: string;
  /** Remaining extractable amount. Depleted nodes stop yielding. */
  remaining: number;
}

export interface MapBuildingInstance {
  id: string;
  buildingId: MapBuildingId;
  owner: PlayerId;
  hex: HexId;
  level: number;
  /** Days remaining until it becomes operational. 0 == finished. */
  daysRemaining: number;
  /** Citizens locked into this building. */
  citizens: number;
  /** False when upkeep could not be paid this day. */
  online: boolean;
}

export type FacilityState = 'inactive' | 'active';

export interface TileFeature {
  /** Strategic gate guarding a region. */
  gate?: { regionId: number; controlledBy: PlayerId | null };
  /** Secondary/main objective facility. */
  facility?: { id: string; name: string; state: FacilityState; owner: PlayerId | null };
  /** The main objective hex. */
  mainObjective?: boolean;
  /** Start position of a participant. */
  startFor?: PlayerId;
  /** Abandoned base: a one-off cache of resources for whoever reaches it first. */
  cache?: { loot: Partial<Stock>; taken: boolean };
}

export interface Tile {
  id: HexId;
  q: number;
  r: number;
  terrain: TerrainId;
  regionId: number;
  road: boolean;
  node: ResourceNodeInstance | null;
  feature: TileFeature;
  /** Player currently exerting control over the hex, or null. */
  controlledBy: PlayerId | null;
  /** Building instance id occupying the hex, or null. */
  buildingId: string | null;
}

export type RegionLock =
  | { type: 'none' }
  | { type: 'gate'; gateHexes: HexId[] }
  | { type: 'tech'; techId: string }
  | { type: 'resource'; cost: Partial<Stock> }
  | { type: 'building'; buildingId: MapBuildingId };

export interface Region {
  id: number;
  name: string;
  kind: 'start' | 'field' | 'core' | 'restricted';
  lock: RegionLock;
  hexes: HexId[];
  /** Designer-facing note used by the UI. */
  blurb: string;
}

export type BotPersonality = 'military' | 'economic' | 'explorer' | 'diplomatic';

export interface ArmyOrder {
  type: 'move' | 'attack' | 'gather' | 'capture' | 'build' | 'scout' | 'hold';
  target?: HexId;
  buildingId?: MapBuildingId;
}

export interface Army {
  id: string;
  name: string;
  owner: PlayerId;
  hex: HexId;
  commanderId: string | null;
  /** troopId -> count */
  composition: Record<string, number>;
  movementPoints: number;
  maxMovementPoints: number;
  /** Set when the army acted this day in a way that consumes its action. */
  actedThisDay: boolean;
  /** Last order issued, kept for UI feedback and bot continuity. */
  lastOrder: ArmyOrder | null;
}

export interface ObjectiveProgress {
  objectiveId: string;
  goal: ObjectiveGoal;
  /** Per-player progress counter, meaning depends on the goal type. */
  progress: Record<PlayerId, number>;
  completedBy: PlayerId | null;
  completedOnDay: number | null;
}

/**
 * Everything the persistent city (or a bot profile) contributes to a match.
 * Keeping it on the player lets modifiers be recomputed from scratch whenever a
 * technology lands, with no risk of drifting multipliers.
 */
export interface PlayerLoadout {
  cityTier: number;
  startStock: Partial<Stock>;
  citizens: number;
  armySlots: number;
  commanderSlots: number;
  commanders: string[];
  /** Persistent commander levels carried in from the city. */
  commanderLevels: Record<string, number>;
  troopLevels: Record<string, number>;
  baseModifiers: PlayerModifiers;
  /** Starting infantry count placed in the first army. */
  startingInfantry: number;
  intelReveal: number;
  diplomacyPressure: number;
  rewardMultiplier: number;
  commanderXpBonus: number;
}

export interface MatchPlayer {
  id: PlayerId;
  name: string;
  isHuman: boolean;
  personality: BotPersonality | null;
  color: number;
  /** Match stockpile. */
  stock: Stock;
  /** Per-resource storage ceiling. */
  storage: Record<AnyMatchResourceId, number>;
  /** Citizens not currently locked into buildings. */
  citizensFree: number;
  /** Total citizens including those locked into buildings. */
  citizensTotal: number;
  /** Researched technology ids. */
  technologies: string[];
  /** Troop levels for this match, seeded from the city. */
  troopLevels: Record<string, number>;
  /** Regions this player may enter. */
  unlockedRegions: number[];
  /** Fog per hex. */
  fog: Record<HexId, FogLevel>;
  /** Bonuses derived from the city + in-match techs, recomputed on change. */
  modifiers: PlayerModifiers;
  /** Immutable contribution of the city / bot profile to this match. */
  loadout: PlayerLoadout;
  /** Commander ids brought into the match. */
  commanders: string[];
  /** Maximum simultaneous armies. */
  armySlots: number;
  score: number;
  eliminated: boolean;
  /** Bots this player has a non-aggression understanding with. */
  nonAggression: PlayerId[];
  /** Running per-match statistics used by the results screen. */
  stats: {
    hexesControlled: number;
    buildingsBuilt: number;
    battlesWon: number;
    battlesLost: number;
    troopsLost: number;
    troopsKilled: number;
    resourcesGathered: number;
    rareGathered: number;
    techsResearched: number;
  };
}

export interface PlayerModifiers {
  productionMultiplier: number;
  scienceMultiplier: number;
  attackMultiplier: number;
  defenseMultiplier: number;
  movementBonus: number;
  visionBonus: number;
  rareYieldMultiplier: number;
  storageBonus: number;
  /** Troop ids unlocked beyond the always-available set. */
  unlockedTroops: string[];
  unlockedBuildings: string[];
  gatherMultiplier: number;
}

export type MatchPhase =
  | 'dayStart'
  | 'production'
  | 'player'
  | 'bots'
  | 'movement'
  | 'construction'
  | 'gathering'
  | 'combat'
  | 'objectives'
  | 'mapUpdate'
  | 'dayEnd'
  | 'finished';

export interface MatchEvent {
  day: number;
  phase: MatchPhase;
  playerId: PlayerId | null;
  /** Machine-readable kind for filtering/testing. */
  kind: string;
  text: string;
  hex?: HexId;
  /** True when the human player should be able to see this in the log. */
  visibleToHuman: boolean;
}

export interface CombatReport {
  day: number;
  hex: HexId;
  attacker: PlayerId;
  defender: PlayerId;
  attackerPower: number;
  defenderPower: number;
  winner: PlayerId;
  attackerLosses: Record<string, number>;
  defenderLosses: Record<string, number>;
  capturedHex: boolean;
  xpAwarded: number;
}

export interface MatchState {
  seed: number;
  day: number;
  totalDays: number;
  phase: MatchPhase;
  finished: boolean;
  /** Winner once the match ends. */
  winner: PlayerId | null;
  /** How the match ended. */
  endReason: 'objective' | 'score' | 'elimination' | null;
  tiles: Record<HexId, Tile>;
  tileOrder: HexId[];
  regions: Region[];
  players: MatchPlayer[];
  humanId: PlayerId;
  armies: Record<string, Army>;
  buildings: Record<string, MapBuildingInstance>;
  mainObjective: ObjectiveProgress;
  secondaryObjectives: ObjectiveProgress[];
  events: MatchEvent[];
  combatLog: CombatReport[];
  /** Commander XP accumulated during the match, paid out to the city at the end. */
  commanderXp: Record<string, number>;
  /** Monotonic id source so entity ids stay deterministic. */
  nextEntityId: number;
  /** Serialized RNG state so the match is resumable bit-exact. */
  rngState: number;
}

export function emptyStock(): Stock {
  return {
    food: 0,
    materials: 0,
    energy: 0,
    fuel: 0,
    ammo: 0,
    metal: 0,
    science: 0,
    titanium: 0,
    uranium: 0,
    crystal: 0,
  };
}

export function defaultModifiers(): PlayerModifiers {
  return {
    productionMultiplier: 1,
    scienceMultiplier: 1,
    attackMultiplier: 1,
    defenseMultiplier: 1,
    movementBonus: 0,
    visionBonus: 0,
    rareYieldMultiplier: 1,
    storageBonus: 0,
    unlockedTroops: [],
    unlockedBuildings: [],
    gatherMultiplier: 1,
  };
}
