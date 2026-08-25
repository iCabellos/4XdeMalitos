import { TERRAINS, nodeDef } from '../../data/terrain';
import { mapBuildingDef } from '../../data/buildings.map';
import { resourceDef } from '../../data/resources';
import { hexToCss } from '../../rendering/palette';
import { armySize } from '../../core/movement';
import { armyPower } from '../../core/combat';
import { troopDef } from '../../data/troops';
import { commanderDef } from '../../data/commanders';
import type { HexId } from '../../map/hex';
import type { MatchState, PlayerId } from '../../core/types';

interface Props {
  state: MatchState;
  viewerId: PlayerId;
  hex: HexId | null;
}

/**
 * Everything known about the selected hex. Deliberately honest about fog:
 * unexplored ground shows nothing, remembered ground shows what was last seen.
 */
export function ContextPanel({ state, viewerId, hex }: Props) {
  const viewer = state.players.find((p) => p.id === viewerId)!;
  if (!hex || !state.tiles[hex]) {
    return (
      <div className="panel">
        <div className="panel-title">Hexagono</div>
        <div className="panel-body small faint">Toca un hexagono para inspeccionarlo.</div>
      </div>
    );
  }

  const tile = state.tiles[hex];
  const fog = viewer.fog[hex] ?? 0;
  const region = state.regions.find((r) => r.id === tile.regionId);
  const terrain = TERRAINS[tile.terrain];
  const building = tile.buildingId ? state.buildings[tile.buildingId] : null;
  const armiesHere = Object.values(state.armies).filter(
    (a) => a.hex === hex && (a.owner === viewerId || fog === 2),
  );
  const owner = state.players.find((p) => p.id === tile.controlledBy);
  const locked = region && region.lock.type !== 'none' && !viewer.unlockedRegions.includes(region.id);

  if (fog === 0) {
    return (
      <div className="panel">
        <div className="panel-title">Hexagono {hex}</div>
        <div className="panel-body">
          <div className="small faint">
            Territorio sin explorar. Envia reconocimiento o construye una torre de vigilancia.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-title">
        Hexagono {hex} {fog === 1 ? '· memoria' : ''}
      </div>
      <div className="panel-body stack">
        <div className="inline">
          <span className="tag">{terrain.name}</span>
          {tile.road && <span className="tag info">Carretera</span>}
          {region && (
            <span className={`tag ${locked ? 'bad' : ''}`}>
              {region.name}
              {locked ? ' · BLOQUEADA' : ''}
            </span>
          )}
        </div>

        <div className="small muted">
          Mov {terrain.moveCost} · Def x{terrain.defenseModifier} · Atk x{terrain.attackModifier}
        </div>

        {locked && region && (
          <div className="small" style={{ color: 'var(--accent)' }}>
            {region.lock.type === 'gate' && 'Toma una de sus puertas para entrar.'}
            {region.lock.type === 'tech' && `Requiere la tecnologia ${region.lock.techId}.`}
            {region.lock.type === 'building' &&
              `Requiere un ${mapBuildingDef(region.lock.buildingId).name} adyacente.`}
          </div>
        )}

        {owner && (
          <div className="inline">
            <span className="dot" style={{ background: hexToCss(owner.color) }} />
            <span className="small">Control: {owner.name}</span>
          </div>
        )}

        {tile.node && (
          <div className="row">
            <span className="grow">
              <span className="name">{nodeDef(tile.node.nodeId).name}</span>
              <span className="sub">
                {resourceDef(nodeDef(tile.node.nodeId).resource).name} ·{' '}
                {nodeDef(tile.node.nodeId).yieldPerDay}/dia
              </span>
            </span>
            <span className={`tag ${resourceDef(nodeDef(tile.node.nodeId).resource).rare ? 'rare' : ''}`}>
              {tile.node.remaining >= 999 ? 'Inagotable' : `${Math.round(tile.node.remaining)} rest.`}
            </span>
          </div>
        )}

        {building && (
          <div className="row">
            <span className="grow">
              <span className="name">
                {mapBuildingDef(building.buildingId).name} N{building.level}
              </span>
              <span className="sub">
                {building.daysRemaining > 0
                  ? `En obra: ${building.daysRemaining} dia(s)`
                  : building.online
                    ? 'Operativa'
                    : 'Sin energia'}
              </span>
            </span>
            <span className="tag">{building.citizens} ciud.</span>
          </div>
        )}

        {tile.feature.gate && (
          <div className="row">
            <span className="grow">
              <span className="name">Puerta estrategica</span>
              <span className="sub">Abre el Nucleo Central a quien la controle</span>
            </span>
            <span className="tag accent">
              {tile.feature.gate.controlledBy
                ? state.players.find((p) => p.id === tile.feature.gate!.controlledBy)?.name
                : 'Libre'}
            </span>
          </div>
        )}

        {tile.feature.facility && (
          <div className="row">
            <span className="grow">
              <span className="name">{tile.feature.facility.name}</span>
              <span className="sub">
                {tile.feature.mainObjective ? 'Objetivo principal' : 'Instalacion estrategica'}
              </span>
            </span>
            <span className={`tag ${tile.feature.facility.state === 'active' ? 'good' : ''}`}>
              {tile.feature.facility.state === 'active' ? 'ACTIVA' : 'INACTIVA'}
            </span>
          </div>
        )}

        {tile.feature.cache && !tile.feature.cache.taken && (
          <div className="row">
            <span className="grow">
              <span className="name">Base abandonada</span>
              <span className="sub">Botin sin reclamar: llega el primero</span>
            </span>
          </div>
        )}

        {armiesHere.map((army) => {
          const armyOwner = state.players.find((p) => p.id === army.owner);
          return (
            <div key={army.id} className="row">
              <span className="dot" style={{ background: hexToCss(armyOwner?.color ?? 0xffffff) }} />
              <span className="grow">
                <span className="name">{army.name}</span>
                <span className="sub">
                  {armySize(army)} unidades · poder {armyPower(state, army)}
                  {army.commanderId ? ` · ${commanderDef(army.commanderId).callsign}` : ''}
                </span>
              </span>
            </div>
          );
        })}

        {armiesHere.length > 0 && (
          <div className="small faint">
            {armiesHere
              .flatMap((a) =>
                Object.entries(a.composition)
                  .filter(([, count]) => count > 0)
                  .map(([id, count]) => `${count} ${troopDef(id).name}`),
              )
              .join(' · ')}
          </div>
        )}
      </div>
    </div>
  );
}
