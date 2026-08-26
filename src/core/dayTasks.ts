/**
 * The day's to-do list.
 *
 * A 4X turn offers a dozen legal actions and a new player sees none of them.
 * This derives, from the actual state, what is worth doing today and whether it
 * has been done - so the player is never staring at a map wondering what the
 * turn is for. It reads state and never mutates it.
 */
import { hexDistanceId, type HexId } from '../map/hex';
import { ZONES } from '../data/zones';
import { availableTroops } from './technology';
import { researchableCount } from './technology';
import { canTrainAt, trainingCapacity, trainingCapacityUsed } from './economy';
import { armiesOf, playerById } from './gameState';
import { canBuild } from './construction';
import { availableMapBuildings } from './technology';
import { relationOf } from './diplomacy';
import type { MapBuildingId } from '../data/buildings.map';
import type { MatchState, PlayerId } from './types';

export type TaskStatus = 'done' | 'pending' | 'unavailable';

export interface DayTask {
  id: string;
  label: string;
  /** One line on why this matters today. */
  hint: string;
  status: TaskStatus;
  /** Progress, when the task is countable (e.g. armies still able to move). */
  progress?: { done: number; total: number };
  /** Hex the UI should focus when the task is tapped. */
  focusHex?: HexId;
  /** Tab the UI should switch to when the task is tapped. */
  tab?: 'info' | 'base' | 'army' | 'build' | 'tech' | 'diplomacy';
  /** Highest first. */
  priority: number;
}

export function deriveDayTasks(state: MatchState, playerId: PlayerId): DayTask[] {
  const player = playerById(state, playerId);
  const armies = armiesOf(state, playerId);
  const tasks: DayTask[] = [];

  const capital = state.tileOrder.find((id) => state.tiles[id].feature.startFor === playerId);

  // -- Move: the single most repeated action of a turn -----------------------
  const withMoves = armies.filter((a) => a.movementPoints >= 1);
  tasks.push({
    id: 'move',
    label: 'Mover tus ejercitos',
    hint: withMoves.length
      ? 'Todavia hay formaciones con puntos de movimiento sin gastar.'
      : 'Todo lo que podia moverse ya se ha movido.',
    status: armies.length === 0 ? 'unavailable' : withMoves.length > 0 ? 'pending' : 'done',
    progress: { done: armies.length - withMoves.length, total: armies.length },
    focusHex: withMoves[0]?.hex,
    tab: 'army',
    priority: withMoves.length > 0 ? 90 : 20,
  });

  // -- Recruit: gated by the barracks, capped by the contingent --------------
  const canRecruitHere = armies.some((a) => canTrainAt(state, player, a.hex));
  const used = trainingCapacityUsed(state, playerId);
  const capacity = trainingCapacity(state, player);
  const roster = availableTroops(player);
  tasks.push({
    id: 'recruit',
    label: 'Reclutar en tu ciudad',
    hint: !canRecruitHere
      ? 'Necesitas un ejercito en tu ciudad o en una base militar.'
      : used >= capacity
        ? 'Contingente completo: sube el Cuartel entre partidas.'
        : `Puedes sostener ${capacity - used} plazas mas de tropa.`,
    status: !canRecruitHere || roster.length === 0 ? 'unavailable' : used < capacity ? 'pending' : 'done',
    progress: { done: used, total: capacity },
    focusHex: capital,
    tab: 'base',
    priority: 70,
  });

  // -- Build: citizens are the real constraint, so surface them --------------
  const buildable = availableMapBuildings(player) as MapBuildingId[];
  const someBuildSpot = armies.find((army) => {
    const tile = state.tiles[army.hex];
    return tile && buildable.some((id) => canBuild(state, player, tile, id).ok);
  });
  tasks.push({
    id: 'build',
    label: 'Construir sobre el terreno',
    hint: player.citizensFree <= 0
      ? 'Sin ciudadanos libres: los que tienes estan ocupados en estructuras.'
      : someBuildSpot
        ? 'Hay un hexagono bajo tus tropas donde se puede levantar algo.'
        : 'Lleva un ejercito a un nodo de recursos para explotarlo.',
    status: player.citizensFree <= 0 ? 'unavailable' : someBuildSpot ? 'pending' : 'unavailable',
    progress: { done: player.citizensTotal - player.citizensFree, total: player.citizensTotal },
    focusHex: someBuildSpot?.hex,
    tab: 'build',
    priority: 60,
  });

  // -- Research --------------------------------------------------------------
  const affordable = researchableCount(player);
  tasks.push({
    id: 'research',
    label: 'Investigar',
    hint: affordable > 0
      ? `${affordable} tecnologias a tu alcance ahora mismo.`
      : 'Sin ciencia suficiente. Construye un puesto de investigacion.',
    status: affordable > 0 ? 'pending' : 'unavailable',
    tab: 'tech',
    priority: 55,
  });

  // -- Gather ----------------------------------------------------------------
  const onNode = armies.find((army) => {
    const tile = state.tiles[army.hex];
    return !!tile?.node && tile.node.remaining > 0 && !tile.buildingId;
  });
  if (onNode) {
    tasks.push({
      id: 'gather',
      label: 'Recolectar a mano',
      hint: 'Un ejercito esta sobre un nodo sin explotar. Rinde menos que construir, pero es hoy.',
      status: 'pending',
      focusHex: onNode.hex,
      tab: 'info',
      priority: 50,
    });
  }

  // -- Gates: the clock everyone shares --------------------------------------
  const nextGateDay = ([2, 3] as const)
    .map((zone) => ZONES[zone].gatesOpenOnDay)
    .find((day) => day > state.day);
  const openGateNearby = state.tileOrder.find((id) => {
    const gate = state.tiles[id].feature.gate;
    if (!gate || !gate.open) return false;
    return armies.some((a) => hexDistanceId(a.hex, id) <= 6);
  });
  if (nextGateDay !== undefined) {
    tasks.push({
      id: 'gate-wait',
      label: `Posicionarte en una puerta (abre el dia ${nextGateDay})`,
      hint: 'Quien espera en la puerta cruza el mismo dia que se abre.',
      status: 'pending',
      tab: 'info',
      priority: nextGateDay - state.day <= 1 ? 95 : 40,
    });
  } else if (openGateNearby) {
    tasks.push({
      id: 'gate-cross',
      label: 'Cruzar hacia la siguiente zona',
      hint: 'Hay una puerta abierta a tu alcance. Al otro lado hay mas y mejor.',
      status: 'pending',
      focusHex: openGateNearby,
      tab: 'info',
      priority: 80,
    });
  }

  // -- Garrisoned objectives -------------------------------------------------
  const objectiveHex = state.tileOrder.find((id) => {
    const objective = state.tiles[id].feature.secondaryObjective;
    if (!objective || objective.defeatedBy) return false;
    return (player.fog[id] ?? 0) >= 1;
  });
  if (objectiveHex) {
    const standingOn = armies.some((a) => a.hex === objectiveHex);
    tasks.push({
      id: 'objective',
      label: standingOn ? 'Asaltar el objetivo' : 'Ir a por un objetivo',
      hint: 'Derrotar su guarnicion da un item con buffo para el resto de la partida.',
      status: 'pending',
      focusHex: objectiveHex,
      tab: 'info',
      priority: standingOn ? 85 : 45,
    });
  }

  // -- Diplomacy -------------------------------------------------------------
  const neutrals = state.players.filter(
    (other) => other.id !== playerId && !other.eliminated && relationOf(player, other.id).stance === 'neutral',
  );
  tasks.push({
    id: 'diplomacy',
    label: 'Negociar con un rival',
    hint: neutrals.length
      ? `${neutrals.length} rivales sin acuerdo. Un pacto es un flanco que no tienes que defender.`
      : 'Ya tienes una postura definida con todos.',
    status: neutrals.length > 0 ? 'pending' : 'done',
    tab: 'diplomacy',
    priority: 35,
  });

  return tasks.sort((a, b) => b.priority - a.priority);
}

export function pendingTaskCount(tasks: DayTask[]): number {
  return tasks.filter((t) => t.status === 'pending').length;
}
