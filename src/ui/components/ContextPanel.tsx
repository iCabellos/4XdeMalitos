import { TERRAINS, nodeDef } from '../../data/terrain';
import { mapBuildingDef } from '../../data/buildings.map';
import { resourceDef } from '../../data/resources';
import { ZONES } from '../../data/zones';
import { itemDef, RARITY_COLORS } from '../../data/items';
import { hexToCss } from '../../rendering/palette';
import { armyPower } from '../../core/combat';
import { ArmyPresence, GarrisonPresence } from './MilitaryBadges';
import type { HexId } from '../../map/hex';
import type { MatchState, PlayerId } from '../../core/types';

interface Props {
  state: MatchState;
  viewerId: PlayerId;
  hex: HexId | null;
}

/** Zone banner: the first thing that should register about any hex. */
function ZoneBanner({ zone, regionName }: { zone: 1 | 2 | 3; regionName: string }) {
  const def = ZONES[zone];
  return (
    <div className={`zone-banner zone-${zone}`}>
      <span className="zone-num">Z{zone}</span>
      <span className="grow">
        <span className="name">{regionName}</span>
        <span className="sub">{def.name}</span>
      </span>
    </div>
  );
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

  // Our own strength on this hex, so enemy stacks can be read as a threat.
  const ownPower = armiesHere
    .filter((a) => a.owner === viewerId)
    .reduce((sum, a) => sum + armyPower(state, a), 0);

  if (fog === 0) {
    return (
      <div className="panel">
        <div className="panel-title">Hexagono {hex}</div>
        <div className="panel-body stack">
          {region && <ZoneBanner zone={tile.zone} regionName={region.name} />}
          <div className="small faint">
            Territorio sin explorar. Envia reconocimiento o construye una torre de vigilancia.
          </div>
        </div>
      </div>
    );
  }

  const gate = tile.feature.gate;
  const secondary = tile.feature.secondaryObjective;

  return (
    <div className="panel">
      <div className="panel-title">
        Hexagono {hex} {fog === 1 ? '· memoria' : ''}
      </div>
      <div className="panel-body stack">
        {region && <ZoneBanner zone={tile.zone} regionName={region.name} />}

        <div className="inline">
          <span className="tag">{terrain.name}</span>
          {tile.road && <span className="tag info">Carretera</span>}
          <span className="tag" title="Coste de movimiento">
            Mov {terrain.moveCost}
          </span>
          <span className="tag" title="Modificador defensivo del terreno">
            Def x{terrain.defenseModifier}
          </span>
        </div>

        {gate && (
          <div className={`gate-status${gate.open ? ' open' : ''}`}>
            <span style={{ fontSize: 18 }}>{gate.open ? '\u{1F513}' : '\u{1F512}'}</span>
            <span className="grow">
              <span className="name">Puerta Z{gate.zoneA} · Z{gate.zoneB}</span>
              <span className="sub">
                {gate.open
                  ? 'Abierta: el paso esta libre para todos.'
                  : `Sellada. Abre el dia ${gate.opensOnDay} (faltan ${Math.max(0, gate.opensOnDay - state.day)}).`}
              </span>
              {gate.controlledBy && (
                <span className="sub">
                  Controlada por {state.players.find((p) => p.id === gate.controlledBy)?.name}
                </span>
              )}
            </span>
          </div>
        )}

        {!gate && region && (
          <div className="small faint">
            Los muros de sector solo se cruzan por una puerta. Busca la mas cercana.
          </div>
        )}

        {owner && (
          <div className="inline">
            <span className="dot" style={{ background: hexToCss(owner.color) }} />
            <span className="small">Control: {owner.name}</span>
          </div>
        )}

        {secondary && (
          <div className="stack" style={{ gap: 6 }}>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <span className="grow">
                <span className="name">
                  {'\u{1F7E3}'} {secondary.name}
                </span>
                <span className="sub">
                  {secondary.defeatedBy
                    ? `Derrotado por ${state.players.find((p) => p.id === secondary.defeatedBy)?.name}`
                    : 'Objetivo secundario: derrota la guarnicion para llevarte el item.'}
                </span>
              </span>
            </div>
            {!secondary.defeatedBy && <GarrisonPresence garrison={secondary.garrison} />}
            <div
              className="item-card"
              style={{ borderLeftColor: RARITY_COLORS[itemDef(secondary.itemId).rarity] }}
            >
              <span className="item-icon">{itemDef(secondary.itemId).icon}</span>
              <span className="grow">
                <span className="name">{itemDef(secondary.itemId).name}</span>
                <span className="sub">{itemDef(secondary.itemId).description}</span>
              </span>
            </div>
          </div>
        )}

        {tile.node && (
          <div className="row">
            <span className="grow">
              <span className="name">{nodeDef(tile.node.nodeId).name}</span>
              <span className="sub">
                {resourceDef(nodeDef(tile.node.nodeId).resource).name} ·{' '}
                {(nodeDef(tile.node.nodeId).yieldPerDay * tile.node.richness).toFixed(1)}/dia
              </span>
            </span>
            <span
              className={`tag ${resourceDef(nodeDef(tile.node.nodeId).resource).rare ? 'rare' : 'good'}`}
              title="Riqueza del yacimiento"
            >
              {tile.node.richness >= 1.5 ? 'MUY ABUNDANTE' : tile.node.richness >= 0.9 ? 'ABUNDANTE' : 'ESCASO'}
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

        {tile.feature.facility && (
          <div className="row">
            <span className="grow">
              <span className="name">
                {tile.feature.mainObjective ? '⭐ ' : ''}
                {tile.feature.facility.name}
              </span>
              <span className="sub">
                {tile.feature.mainObjective
                  ? 'Objetivo final: conquistalo para el item legendario'
                  : 'Instalacion estrategica'}
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
              <span className="name">{'\u{1F4E6}'} Base abandonada</span>
              <span className="sub">Botin sin reclamar: llega el primero</span>
            </span>
          </div>
        )}

        {armiesHere.length > 0 && (
          <div className="stack" style={{ gap: 6 }}>
            <div className="panel-title" style={{ padding: '4px 0 0' }}>
              Presencia militar
            </div>
            {armiesHere.map((army) => {
              const armyOwner = state.players.find((p) => p.id === army.owner);
              const hostile = army.owner !== viewerId;
              return (
                <div key={army.id} className="stack" style={{ gap: 4 }}>
                  <div className="inline" style={{ gap: 6 }}>
                    <span className="dot" style={{ background: hexToCss(armyOwner?.color ?? 0xffffff) }} />
                    <span className="name">{army.name}</span>
                  </div>
                  <ArmyPresence
                    state={state}
                    army={army}
                    compareWith={hostile ? ownPower : undefined}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
