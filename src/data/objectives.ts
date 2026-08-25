export type ObjectiveKind = 'main' | 'secondary';

export type ObjectiveGoal =
  | { type: 'holdHex'; days: number }
  | { type: 'activateFacilities'; count: number }
  | { type: 'controlRare'; resource: string; amount: number }
  | { type: 'techChain'; techs: string[] }
  | { type: 'controlTerritory'; hexes: number };

export interface ObjectiveDefinition {
  id: string;
  kind: ObjectiveKind;
  name: string;
  goal: ObjectiveGoal;
  description: string;
  /** Score awarded on completion. */
  score: number;
  /** Immediate in-match payout on completion. */
  reward?: Record<string, number>;
}

/**
 * The main objective is picked per match from this pool (seeded), so the map's
 * strategic centre of gravity changes between runs.
 */
export const MAIN_OBJECTIVES: ObjectiveDefinition[] = [
  {
    id: 'central_command',
    kind: 'main',
    name: 'Mando Central',
    goal: { type: 'holdHex', days: 2 },
    score: 300,
    description:
      'Controla el Mando Central durante 2 dias consecutivos. Quien lo mantiene, gana la operacion.',
    reward: { science: 80, materials: 120 },
  },
  {
    id: 'grid_activation',
    kind: 'main',
    name: 'Activacion de la red',
    goal: { type: 'activateFacilities', count: 3 },
    score: 300,
    description:
      'Activa las 3 instalaciones estrategicas del mapa. Requieren un ejercito presente y energia.',
    reward: { energy: 60, science: 60 },
  },
  {
    id: 'crystal_monopoly',
    kind: 'main',
    name: 'Monopolio de cristal',
    goal: { type: 'controlRare', resource: 'crystal', amount: 12 },
    score: 300,
    description:
      'Acumula 12 unidades de cristal energetico. Solo hay dos afloramientos y ambos estan disputados.',
    reward: { science: 120 },
  },
];

export const SECONDARY_OBJECTIVES: ObjectiveDefinition[] = [
  {
    id: 'sec_territory',
    kind: 'secondary',
    name: 'Presencia territorial',
    goal: { type: 'controlTerritory', hexes: 14 },
    score: 60,
    description: 'Controla 14 hexagonos simultaneamente.',
    reward: { materials: 60, influence: 0 },
  },
  {
    id: 'sec_titanium',
    kind: 'secondary',
    name: 'Cadena de titanio',
    goal: { type: 'controlRare', resource: 'titanium', amount: 10 },
    score: 60,
    description: 'Consigue 10 de titanio: el material que separa un ejercito de una fuerza.',
    reward: { metal: 60 },
  },
  {
    id: 'sec_tech',
    kind: 'secondary',
    name: 'Cadena tecnologica',
    goal: { type: 'techChain', techs: ['field_engineering', 'deep_extraction'] },
    score: 60,
    description: 'Completa la cadena de extraccion profunda.',
    reward: { science: 60 },
  },
];

export function objectiveDef(id: string): ObjectiveDefinition {
  const found =
    MAIN_OBJECTIVES.find((o) => o.id === id) ?? SECONDARY_OBJECTIVES.find((o) => o.id === id);
  if (!found) throw new Error(`Objetivo desconocido: ${id}`);
  return found;
}
