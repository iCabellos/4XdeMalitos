import type { TroopRole } from './troops';

/**
 * Commanders exist on two axes:
 *  - `role`  : which game mechanic they are built around (attack, gather,
 *              build, scout). This is what the player picks a commander FOR.
 *  - `specialty`: which troop role they personally amplify. This is what makes
 *              two attack commanders play differently.
 */
export type CommanderRole = 'assault' | 'gather' | 'build' | 'scout';

export const COMMANDER_ROLE_LABEL: Record<CommanderRole, string> = {
  assault: 'Asalto',
  gather: 'Recoleccion',
  build: 'Construccion',
  scout: 'Exploracion',
};

export const COMMANDER_ROLE_ICON: Record<CommanderRole, string> = {
  assault: '⚔',
  gather: '\u{1F33E}',
  build: '\u{1F3D7}',
  scout: '\u{1F50D}',
};

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
  /** Fraction shaved off the material cost of buildings raised by this army. */
  buildCostReduction?: number;
  /** Days shaved off construction time (floored at one day). */
  buildSpeedBonus?: number;
  /** Fewer citizens locked into each structure this commander raises. */
  citizenDiscount?: number;
}

export interface CommanderDefinition {
  id: string;
  name: string;
  callsign: string;
  role: CommanderRole;
  /** Troop role the commander personally amplifies. */
  specialty: TroopRole;
  portraitColor: number;
  specialtyAttackBonus: number;
  specialtyDefenseBonus: number;
  ability: CommanderAbility;
  unlock: { building: string; level: number };
  bio: string;
}

/**
 * Three commanders per mechanic, so a player always has a real choice inside a
 * role rather than one obvious pick.
 */
export const COMMANDERS: Record<string, CommanderDefinition> = {
  // ------------------------------------------------------------- ASALTO
  marcus: {
    id: 'marcus',
    name: 'Marcus Adeyemi',
    callsign: 'YUNQUE',
    role: 'assault',
    specialty: 'infantry',
    portraitColor: 0xb04a3a,
    specialtyAttackBonus: 0.15,
    specialtyDefenseBonus: 0.1,
    ability: {
      id: 'coordinated_defense',
      name: 'Defensa coordinada',
      description: '+10% defensa al ejercito y -15% de bajas propias.',
      defenseMultiplier: 1.1,
      casualtyReduction: 0.15,
    },
    unlock: { building: 'command_center', level: 1 },
    bio: 'Instructor de infanteria. No pierde posiciones; las convierte en problemas ajenos.',
  },
  koval: {
    id: 'koval',
    name: 'Irina Koval',
    callsign: 'MARTILLO',
    role: 'assault',
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
    unlock: { building: 'barracks', level: 2 },
    bio: 'Doctrina de choque. Considera que un frente estatico ya es una derrota.',
  },
  sable: {
    id: 'sable',
    name: 'Noor Sabel',
    callsign: 'SABLE',
    role: 'assault',
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
    unlock: { building: 'barracks', level: 3 },
    bio: 'Calcula trayectorias mas rapido de lo que el enemigo se reposiciona.',
  },

  // -------------------------------------------------------- RECOLECCION
  torres: {
    id: 'torres',
    name: 'Rafael Torres',
    callsign: 'CANTERA',
    role: 'gather',
    specialty: 'recon',
    portraitColor: 0x8fbf5a,
    specialtyAttackBonus: 0.05,
    specialtyDefenseBonus: 0.05,
    ability: {
      id: 'field_requisition',
      name: 'Requisa de campana',
      description: '+40% de recursos recolectados y +1 de vision.',
      gatherMultiplier: 1.4,
      visionBonus: 1,
    },
    unlock: { building: 'logistics_center', level: 1 },
    bio: 'Logista antes que soldado. Encuentra titanio donde otros ven piedra.',
  },
  mbeki: {
    id: 'mbeki',
    name: 'Anaya Mbeki',
    callsign: 'VETA',
    role: 'gather',
    specialty: 'infantry',
    portraitColor: 0x5aa87a,
    specialtyAttackBonus: 0.06,
    specialtyDefenseBonus: 0.12,
    ability: {
      id: 'deep_seam',
      name: 'Filon profundo',
      description: '+65% de recoleccion, pero -1 de movimiento: extrae, no persigue.',
      gatherMultiplier: 1.65,
      movementBonus: -1,
    },
    unlock: { building: 'logistics_center', level: 3 },
    bio: 'Geologa de guerra. Sabe cuanto queda en un yacimiento antes de abrirlo.',
  },
  vance: {
    id: 'vance',
    name: 'Cora Vance',
    callsign: 'PEAJE',
    role: 'gather',
    specialty: 'armor',
    portraitColor: 0x7ab0a0,
    specialtyAttackBonus: 0.1,
    specialtyDefenseBonus: 0.1,
    ability: {
      id: 'armed_convoy',
      name: 'Convoy armado',
      description: '+30% de recoleccion, +1 movimiento y -10% de bajas: recolecta bajo fuego.',
      gatherMultiplier: 1.3,
      movementBonus: 1,
      casualtyReduction: 0.1,
    },
    unlock: { building: 'warehouse', level: 3 },
    bio: 'Escolta caravanas por territorio disputado y nunca pierde una.',
  },

  // ------------------------------------------------------- CONSTRUCCION
  okonkwo: {
    id: 'okonkwo',
    name: 'Emeka Okonkwo',
    callsign: 'CIMIENTO',
    role: 'build',
    specialty: 'infantry',
    portraitColor: 0xc09a5a,
    specialtyAttackBonus: 0.05,
    specialtyDefenseBonus: 0.15,
    ability: {
      id: 'field_works',
      name: 'Obra de campana',
      description: '-30% de materiales al construir y un ciudadano menos por estructura.',
      buildCostReduction: 0.3,
      citizenDiscount: 1,
    },
    unlock: { building: 'command_center', level: 2 },
    bio: 'Ingeniero de combate. Levanta un puesto avanzado donde otros ven barro.',
  },
  lindqvist: {
    id: 'lindqvist',
    name: 'Sten Lindqvist',
    callsign: 'ANDAMIO',
    role: 'build',
    specialty: 'artillery',
    portraitColor: 0xb0894a,
    specialtyAttackBonus: 0.08,
    specialtyDefenseBonus: 0.1,
    ability: {
      id: 'prefabrication',
      name: 'Prefabricado',
      description: 'Un dia menos de obra en todo lo que construya y -15% de materiales.',
      buildSpeedBonus: 1,
      buildCostReduction: 0.15,
    },
    unlock: { building: 'factory', level: 2 },
    bio: 'Trae las piezas cortadas de fabrica. Solo hay que atornillarlas.',
  },
  reyes: {
    id: 'reyes',
    name: 'Paula Reyes',
    callsign: 'BASTION',
    role: 'build',
    specialty: 'infantry',
    portraitColor: 0x9a7f4a,
    specialtyAttackBonus: 0.04,
    specialtyDefenseBonus: 0.2,
    ability: {
      id: 'hardened_works',
      name: 'Obra endurecida',
      description: '-20% de materiales, +15% de defensa y -20% de bajas: construye y aguanta.',
      buildCostReduction: 0.2,
      defenseMultiplier: 1.15,
      casualtyReduction: 0.2,
    },
    unlock: { building: 'logistics_center', level: 2 },
    bio: 'Fortifica primero y discute despues. Sus puestos avanzados no caen.',
  },

  // -------------------------------------------------------- EXPLORACION
  helena: {
    id: 'helena',
    name: 'Helena Vardas',
    callsign: 'CENIT',
    role: 'scout',
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
  danil: {
    id: 'danil',
    name: 'Danil Ostrov',
    callsign: 'ANCLA',
    role: 'scout',
    specialty: 'naval',
    portraitColor: 0x4f7fb0,
    specialtyAttackBonus: 0.18,
    specialtyDefenseBonus: 0.12,
    ability: {
      id: 'littoral_control',
      name: 'Control litoral',
      description: '+2 vision y +20% de recoleccion en la costa.',
      visionBonus: 2,
      gatherMultiplier: 1.2,
    },
    unlock: { building: 'diplomatic_center', level: 2 },
    bio: 'Convierte cada franja de agua en una autopista propia.',
  },
  ferran: {
    id: 'ferran',
    name: 'Iu Ferran',
    callsign: 'AGUJA',
    role: 'scout',
    specialty: 'recon',
    portraitColor: 0x7ec8e8,
    specialtyAttackBonus: 0.08,
    specialtyDefenseBonus: 0.02,
    ability: {
      id: 'forced_march',
      name: 'Marcha forzada',
      description: '+3 movimiento y +1 vision. Llega a la puerta el dia que se abre.',
      movementBonus: 3,
      visionBonus: 1,
    },
    unlock: { building: 'academy', level: 1 },
    bio: 'Explorador de largo alcance. Duerme donde le pilla el amanecer.',
  },
};

export const COMMANDER_IDS = Object.keys(COMMANDERS);

export function commanderDef(id: string): CommanderDefinition {
  const def = COMMANDERS[id];
  if (!def) throw new Error(`Comandante desconocido: ${id}`);
  return def;
}

export function commandersByRole(role: CommanderRole): CommanderDefinition[] {
  return Object.values(COMMANDERS).filter((c) => c.role === role);
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
