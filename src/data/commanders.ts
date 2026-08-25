import type { TroopRole } from './troops';

export interface CommanderAbility {
  id: string;
  name: string;
  description: string;
  /** Passive multipliers applied while the commander leads an army. */
  attackMultiplier?: number;
  defenseMultiplier?: number;
  movementBonus?: number;
  visionBonus?: number;
  /** Multiplier on resources gathered by the led army. */
  gatherMultiplier?: number;
  /** Reduces casualties taken by the led army. */
  casualtyReduction?: number;
}

export interface CommanderDefinition {
  id: string;
  name: string;
  callsign: string;
  /** Troop role the commander specialises in. */
  specialty: TroopRole;
  portraitColor: number;
  /** Base bonus applied only to troops of the matching role. */
  specialtyAttackBonus: number;
  specialtyDefenseBonus: number;
  ability: CommanderAbility;
  /** Unlock condition described against city buildings. */
  unlock: { building: string; level: number };
  bio: string;
}

/**
 * Commanders are persistent meta entities: they level up across matches and
 * define build identity. Bonuses are tied to a troop role, but the player is
 * free to mix compositions, so a commander shapes an army without dictating it.
 */
export const COMMANDERS: Record<string, CommanderDefinition> = {
  marcus: {
    id: 'marcus',
    name: 'Marcus Adeyemi',
    callsign: 'YUNQUE',
    specialty: 'infantry',
    portraitColor: 0xb04a3a,
    specialtyAttackBonus: 0.15,
    specialtyDefenseBonus: 0.1,
    ability: {
      id: 'coordinated_defense',
      name: 'Defensa coordinada',
      description: '+10% defensa a todo el ejercito y -15% de bajas propias.',
      defenseMultiplier: 1.1,
      casualtyReduction: 0.15,
    },
    unlock: { building: 'command_center', level: 1 },
    bio: 'Instructor de infanteria. No pierde posiciones; las convierte en problemas ajenos.',
  },
  helena: {
    id: 'helena',
    name: 'Helena Vardas',
    callsign: 'CENIT',
    specialty: 'air',
    portraitColor: 0x5aa8b0,
    specialtyAttackBonus: 0.2,
    specialtyDefenseBonus: 0.0,
    ability: {
      id: 'air_superiority',
      name: 'Superioridad aerea',
      description: '+2 movimiento y +2 vision al ejercito que dirige.',
      movementBonus: 2,
      visionBonus: 2,
    },
    unlock: { building: 'academy', level: 2 },
    bio: 'Pilotos que llegan antes que la informacion. Reescribe el mapa cada dia.',
  },
  torres: {
    id: 'torres',
    name: 'Rafael Torres',
    callsign: 'CANTERA',
    specialty: 'recon',
    portraitColor: 0x8fbf5a,
    specialtyAttackBonus: 0.05,
    specialtyDefenseBonus: 0.05,
    ability: {
      id: 'field_requisition',
      name: 'Requisa de campana',
      description: '+40% de recursos recolectados y +1 vision.',
      gatherMultiplier: 1.4,
      visionBonus: 1,
    },
    unlock: { building: 'logistics_center', level: 2 },
    bio: 'Logista antes que soldado. Encuentra titanio donde otros ven piedra.',
  },
  koval: {
    id: 'koval',
    name: 'Irina Koval',
    callsign: 'MARTILLO',
    specialty: 'armor',
    portraitColor: 0x9a6b3a,
    specialtyAttackBonus: 0.22,
    specialtyDefenseBonus: 0.08,
    ability: {
      id: 'breakthrough',
      name: 'Ruptura',
      description: '+12% ataque y +1 movimiento; castiga posiciones fortificadas.',
      attackMultiplier: 1.12,
      movementBonus: 1,
    },
    unlock: { building: 'barracks', level: 3 },
    bio: 'Doctrina de choque. Considera que un frente estatico ya es una derrota.',
  },
  sable: {
    id: 'sable',
    name: 'Noor Sabel',
    callsign: 'SABLE',
    specialty: 'artillery',
    portraitColor: 0x8a5fb0,
    specialtyAttackBonus: 0.25,
    specialtyDefenseBonus: -0.05,
    ability: {
      id: 'counterbattery',
      name: 'Contrabateria',
      description: '+18% ataque, pero el ejercito sufre un 10% mas de bajas.',
      attackMultiplier: 1.18,
      casualtyReduction: -0.1,
    },
    unlock: { building: 'academy', level: 3 },
    bio: 'Calcula trayectorias mas rapido de lo que el enemigo se reposiciona.',
  },
  danil: {
    id: 'danil',
    name: 'Danil Ostrov',
    callsign: 'ANCLA',
    specialty: 'naval',
    portraitColor: 0x4f7fb0,
    specialtyAttackBonus: 0.18,
    specialtyDefenseBonus: 0.12,
    ability: {
      id: 'littoral_control',
      name: 'Control litoral',
      description: '+2 vision y +20% de recoleccion en hexagonos costeros.',
      visionBonus: 2,
      gatherMultiplier: 1.2,
    },
    unlock: { building: 'diplomatic_center', level: 3 },
    bio: 'Convierte cada franja de agua en una autopista propia.',
  },
};

export const COMMANDER_IDS = Object.keys(COMMANDERS);

export function commanderDef(id: string): CommanderDefinition {
  const def = COMMANDERS[id];
  if (!def) throw new Error(`Comandante desconocido: ${id}`);
  return def;
}

/** XP needed to go from `level` to `level + 1`. */
export function commanderXpForLevel(level: number): number {
  return Math.round(100 * Math.pow(1.55, level - 1));
}

export const MAX_COMMANDER_LEVEL = 10;

/** Commander stats scale mildly with level so they never eclipse composition. */
export function commanderLevelScale(level: number): number {
  return 1 + (level - 1) * 0.06;
}
