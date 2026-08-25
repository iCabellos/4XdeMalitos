import { axialOf, hexDistanceId, hexesInRadius, hexId, type HexId } from '../map/hex';
import { mapBuildingDef } from '../data/buildings.map';
import { armyPower } from './combat';
import type { MatchState, PlayerId } from './types';

/**
 * Recomputes who controls each hex. Claims are scored rather than assigned
 * first-come, so a stronger army genuinely takes ground from a weaker claim,
 * and ties leave the previous owner in place (no flicker between days).
 */
export function updateTerritory(state: MatchState): void {
  const claims: Record<HexId, Record<PlayerId, number>> = {};

  const addClaim = (hex: HexId, playerId: PlayerId, weight: number) => {
    if (!state.tiles[hex]) return;
    (claims[hex] ??= {})[playerId] = (claims[hex][playerId] ?? 0) + weight;
  };

  // Start positions are permanent, heavy claims: a capital is never neutral.
  for (const tile of Object.values(state.tiles)) {
    if (tile.feature.startFor) addClaim(tile.id, tile.feature.startFor, 1000);
  }

  // Buildings project control over their claim radius.
  for (const building of Object.values(state.buildings)) {
    if (building.daysRemaining > 0) continue;
    const def = mapBuildingDef(building.buildingId);
    const radius = def.claimRadius ?? 0;
    addClaim(building.hex, building.owner, 500 + building.level * 10);
    if (radius > 0) {
      const origin = axialOf(building.hex);
      for (const axial of hexesInRadius(origin, radius)) {
        const id = hexId(axial.q, axial.r);
        if (id === building.hex) continue;
        const distance = hexDistanceId(building.hex, id);
        addClaim(id, building.owner, 60 / distance);
      }
    }
  }

  // Armies hold the ground they stand on, weighted by how strong they are.
  for (const army of Object.values(state.armies)) {
    addClaim(army.hex, army.owner, 200 + armyPower(state, army) * 0.05);
  }

  for (const id of state.tileOrder) {
    const tile = state.tiles[id];
    const tileClaims = claims[id];
    if (!tileClaims) {
      // No claim at all: ground reverts to neutral unless a building holds it.
      if (tile.controlledBy && !tile.buildingId) tile.controlledBy = null;
      continue;
    }
    let bestPlayer: PlayerId | null = tile.controlledBy;
    let bestScore = tile.controlledBy ? (tileClaims[tile.controlledBy] ?? 0) : 0;
    for (const [playerId, score] of Object.entries(tileClaims)) {
      if (score > bestScore) {
        bestScore = score;
        bestPlayer = playerId;
      }
    }
    tile.controlledBy = bestScore > 0 ? bestPlayer : null;
  }

  // Refresh per-player territory counters used by objectives and scoring.
  for (const player of state.players) player.stats.hexesControlled = 0;
  for (const id of state.tileOrder) {
    const owner = state.tiles[id].controlledBy;
    if (!owner) continue;
    const player = state.players.find((p) => p.id === owner);
    if (player) player.stats.hexesControlled++;
  }
}

export function territoryOf(state: MatchState, playerId: PlayerId): HexId[] {
  return state.tileOrder.filter((id) => state.tiles[id].controlledBy === playerId);
}
