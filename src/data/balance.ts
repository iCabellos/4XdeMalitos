/**
 * Central balance table. Everything a designer would want to tweak without
 * reading systems code lives here.
 */
export const BALANCE = {
  match: {
    totalDays: 9,
    participants: 5,
    /** Radius 8 gives 217 hexes: three zones with room to manoeuvre in each. */
    mapRadius: 8,
    /** Ring the five spawns sit on, one per zone-1 sector. */
    spawnRing: 7,
  },

  /** How much of each resource category each zone carries. See /data/zones.ts. */
  zoneContent: {
    /** Common nodes per zone-1 sector (abundant). */
    zone1CommonPerSector: 3,
    zone1Richness: 1,
    /** Common nodes per zone-2 sector (very abundant). */
    zone2CommonPerSector: 2,
    zone2Richness: 1.9,
    /** Rare nodes per zone-2 sector (thin seams). */
    zone2RarePerSector: 1,
    zone2RareRichness: 0.55,
    /** Rare nodes in the core: few, but the richest on the map. */
    zone3RareAbundant: 2,
    zone3RareRichness: 1.9,
    zone3RareThin: 1,
    zone3ThinRichness: 0.6,
    /** One garrisoned item encounter per zone-2 sector. */
    secondaryPerZone2Sector: 1,
  },

  citizens: {
    /** Citizens available before any city bonus. */
    base: 6,
    /** Food consumed per citizen per day. */
    foodPerCitizen: 0.3,
    /** Food surplus needed to gain one citizen at day end. */
    foodPerNewCitizen: 25,
    /** Hard ceiling regardless of bonuses. */
    max: 40,
  },

  economy: {
    /** Base storage cap per resource before warehouse/depot bonuses. */
    baseStorage: 400,
    /** Rare resources use a much tighter cap: scarcity must be felt. */
    rareStorage: 60,
    /**
     * The capital yields this much per day for free. It is tuned to roughly
     * cover a starting force so a player is never locked out of acting, but
     * never enough to win on: everything beyond survival must be taken from
     * the map.
     */
    capitalYield: {
      food: 8,
      materials: 8,
      science: 4,
      energy: 3,
      metal: 2,
      fuel: 2,
      ammo: 2,
    } as Record<string, number>,
    /**
     * Kit every participant lands with, before the city warehouse adds to it.
     * Without this, day one has no fuel or ammunition at all and the match
     * opens with every army already unsupplied.
     */
    startingKit: {
      food: 70,
      materials: 70,
      energy: 25,
      fuel: 25,
      ammo: 25,
      metal: 25,
      science: 15,
    } as Record<string, number>,
    /** Fraction of a building's output lost when its upkeep is unpaid. */
    idlePenalty: 1,
  },

  movement: {
    /** Movement points every army receives at day start, before bonuses. */
    basePoints: 6,
    /** Extra points given by a friendly logistics hub within this radius. */
    logisticsRadius: 3,
    logisticsBonus: 2,
    /** Movement cost to enter an enemy-controlled hex, on top of terrain. */
    enemyTerritorySurcharge: 1,
  },

  combat: {
    /** Fraction of the loser's army destroyed at a 1:1 power ratio. */
    baseLoserCasualties: 0.45,
    /** Fraction of the winner's army destroyed at a 1:1 power ratio. */
    baseWinnerCasualties: 0.25,
    /** How strongly the power ratio swings casualties. */
    ratioExponent: 1.15,
    /** Casualties can never exceed this fraction in a single battle. */
    maxCasualties: 0.9,
    /** Ammunition spent per 10 power committed. */
    ammoPerPower: 0.1,
    /** Power multiplier when the attacker has no ammunition left. */
    outOfAmmoPenalty: 0.6,
    /** XP granted to the winning commander per point of enemy power destroyed. */
    xpPerPowerDestroyed: 0.35,
    /** Bonus multiplier applied by strongVs matchups. */
    counterBonus: 1.25,
    /** Defender advantage baked in, before terrain. */
    defenderBonus: 1.1,
  },

  gathering: {
    /** Resources an army pulls from an unclaimed node it is standing on. */
    armyGatherPerDay: 3,
    /** Multiplier for rare nodes gathered by an army without an extractor. */
    armyRareGatherRate: 0.34,
  },

  vision: {
    /** Vision radius of the player's starting capital. */
    capital: 3,
    /** Extra vision from technologies and commanders is added on top. */
    minimum: 1,
  },

  scoring: {
    territory: 3,
    resources: 0.05,
    rareResources: 4,
    technology: 12,
    military: 0.5,
    secondaryObjective: 60,
    mainObjectiveHold: 40,
    mainObjectiveWin: 300,
  },

  rewards: {
    /** Multiplier applied to the reward pool per final placement (1st..5th). */
    placementMultiplier: [1.6, 1.25, 1.0, 0.8, 0.65],
    /** Reward pool derived from score: reward = score * factor. */
    goldPerScore: 0.55,
    materialsPerScore: 0.7,
    sciencePerScore: 0.35,
    influencePerScore: 0.25,
    /** Fraction of rare resources held at match end carried to the city. */
    rareCarryFraction: 0.6,
    /** Flat bonus for completing the main objective. */
    mainObjectiveBonus: { gold: 400, materials: 500, science: 250, influence: 200 },
    /** Commander XP awarded from match score. */
    commanderXpPerScore: 0.12,
  },

  bots: {
    /** How willing a bot is to attack when it has this power ratio advantage. */
    attackPowerRatio: 1.25,
    /** Bots evaluate this many candidate hexes per decision to bound cost. */
    searchBudget: 40,
  },
} as const;

export type BalanceTable = typeof BALANCE;
