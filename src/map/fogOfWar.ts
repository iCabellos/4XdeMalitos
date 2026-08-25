import { axialOf, neighborIds, type HexId } from './hex';
import { TERRAINS } from '../data/terrain';
import type { MatchState, MatchPlayer, FogLevel } from '../core/types';
import { troopDef } from '../data/troops';
import { commanderDef } from '../data/commanders';
import { mapBuildingDef } from '../data/buildings.map';
import { BALANCE } from '../data/balance';

export interface VisionSource {
  hex: HexId;
  radius: number;
}

/**
 * Reveals hexes around a source. Vision-blocking terrain is revealed itself but
 * does not propagate, which gives forests and mountains a real shadow without
 * paying for true line-of-sight raycasting on every tile.
 */
function floodVision(state: MatchState, source: VisionSource, out: Set<HexId>): void {
  if (!state.tiles[source.hex]) return;
  out.add(source.hex);
  let frontier: HexId[] = [source.hex];
  for (let step = 1; step <= source.radius; step++) {
    const next: HexId[] = [];
    for (const id of frontier) {
      const { q, r } = axialOf(id);
      for (const nId of neighborIds(q, r)) {
        const tile = state.tiles[nId];
        if (!tile || out.has(nId)) continue;
        out.add(nId);
        // Blocking terrain is seen, but nothing behind it is.
        if (!TERRAINS[tile.terrain].blocksVision) next.push(nId);
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
}

export function armyVisionRadius(state: MatchState, armyId: string): number {
  const army = state.armies[armyId];
  if (!army) return 0;
  const player = state.players.find((p) => p.id === army.owner);
  let best: number = BALANCE.vision.minimum;
  for (const [troopId, count] of Object.entries(army.composition)) {
    if (count <= 0) continue;
    best = Math.max(best, troopDef(troopId).vision);
  }
  if (army.commanderId) {
    best += commanderDef(army.commanderId).ability.visionBonus ?? 0;
  }
  best += player?.modifiers.visionBonus ?? 0;
  return Math.max(BALANCE.vision.minimum, best);
}

export function collectVisionSources(state: MatchState, playerId: string): VisionSource[] {
  const sources: VisionSource[] = [];
  for (const army of Object.values(state.armies)) {
    if (army.owner !== playerId) continue;
    sources.push({ hex: army.hex, radius: armyVisionRadius(state, army.id) });
  }
  const player = state.players.find((p) => p.id === playerId);
  const bonus = player?.modifiers.visionBonus ?? 0;
  for (const building of Object.values(state.buildings)) {
    if (building.owner !== playerId || building.daysRemaining > 0) continue;
    const def = mapBuildingDef(building.buildingId);
    if (def.vision) sources.push({ hex: building.hex, radius: def.vision + bonus });
  }
  // The starting hex always sees its surroundings, so a wiped player still has eyes.
  for (const tile of Object.values(state.tiles)) {
    if (tile.feature.startFor === playerId) {
      sources.push({ hex: tile.id, radius: BALANCE.vision.capital + bonus });
    }
  }
  return sources;
}

/**
 * Recomputes fog for one player. Previously seen hexes decay from visible (2)
 * to explored (1) rather than back to hidden, so the map remembers.
 */
export function updateFogForPlayer(state: MatchState, player: MatchPlayer): void {
  const visible = new Set<HexId>();
  for (const source of collectVisionSources(state, player.id)) {
    floodVision(state, source, visible);
  }
  for (const id of state.tileOrder) {
    const current = player.fog[id] ?? 0;
    if (visible.has(id)) player.fog[id] = 2;
    else if (current === 2) player.fog[id] = 1;
    else player.fog[id] = current as FogLevel;
  }
}

export function updateFog(state: MatchState): void {
  for (const player of state.players) updateFogForPlayer(state, player);
}

/** Reveals a disc of hexes regardless of vision. Used by intel and debug tools. */
export function revealArea(player: MatchPlayer, state: MatchState, center: HexId, radius: number): void {
  const seen = new Set<HexId>();
  floodVision(state, { hex: center, radius }, seen);
  for (const id of seen) {
    if ((player.fog[id] ?? 0) < 1) player.fog[id] = 1;
  }
}

export function revealAll(player: MatchPlayer, state: MatchState): void {
  for (const id of state.tileOrder) {
    if ((player.fog[id] ?? 0) < 1) player.fog[id] = 1;
  }
}

