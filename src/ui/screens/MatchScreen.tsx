import { useEffect, useMemo, useState } from 'react';
import { useGame } from '../store';
import { MapViewport } from '../components/MapViewport';
import { ResourceStrip } from '../components/ResourceStrip';
import { ObjectivesPanel } from '../components/ObjectivesPanel';
import { EventLog } from '../components/EventLog';
import { ContextPanel } from '../components/ContextPanel';
import { ArmyPanel } from '../components/ArmyPanel';
import { TechPanel } from '../components/TechPanel';
import { BuildPanel } from '../components/BuildPanel';
import { StandingsPanel } from '../components/StandingsPanel';
import { reachableHexes } from '../../core/movement';
import { hexDistanceId } from '../../map/hex';
import { troopDef } from '../../data/troops';
import {
  activateFacility,
  attack,
  buildAt,
  captureGate,
  gather,
  moveArmy,
  moveTowards,
} from '../../core/actions';
import type { MapViewSelection } from '../../rendering/mapRenderer';
import type { HexId } from '../../map/hex';
import type { MapBuildingId } from '../../data/buildings.map';

type Tab = 'info' | 'army' | 'build' | 'tech' | 'standings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'info', label: 'INFO' },
  { id: 'army', label: 'EJERCITO' },
  { id: 'build', label: 'CONSTRUIR' },
  { id: 'tech', label: 'TECNOLOGIA' },
  { id: 'standings', label: 'RANKING' },
];

export function MatchScreen() {
  const match = useGame((s) => s.match);
  const tick = useGame((s) => s.tick);
  const selectedHex = useGame((s) => s.selectedHex);
  const selectedArmyId = useGame((s) => s.selectedArmyId);
  const pendingAction = useGame((s) => s.pendingAction);
  const setPendingAction = useGame((s) => s.setPendingAction);
  const selectHex = useGame((s) => s.selectHex);
  const selectArmy = useGame((s) => s.selectArmy);
  const notify = useGame((s) => s.notify);
  const refresh = useGame((s) => s.refresh);
  const nextDay = useGame((s) => s.nextDay);
  const simulateRest = useGame((s) => s.simulateRestOfMatch);
  const abandon = useGame((s) => s.abandonMatch);
  const [tab, setTab] = useState<Tab>('info');
  // The camera opens on the player's own base rather than the map origin: the
  // centre of the map is locked terrain they cannot act on yet.
  const [focusHex, setFocusHex] = useState<HexId | null>(null);
  const [framedMatch, setFramedMatch] = useState<number | null>(null);

  const player = match?.players.find((p) => p.id === match.humanId) ?? null;
  const army = selectedArmyId && match ? match.armies[selectedArmyId] : null;

  useEffect(() => {
    if (!match || framedMatch === match.seed) return;
    const home = match.tileOrder.find((id) => match.tiles[id].feature.startFor === match.humanId);
    if (!home) return;
    setFocusHex(home);
    setFramedMatch(match.seed);
  }, [match, framedMatch]);

  // Highlights are recomputed from state, never cached across a mutation.
  const selection = useMemo<MapViewSelection>(() => {
    const reachable = new Set<HexId>();
    const targets = new Set<HexId>();
    if (match && army) {
      if (pendingAction?.type === 'move') {
        for (const hex of Object.keys(reachableHexes(match, army))) reachable.add(hex);
      }
      if (pendingAction?.type === 'attack') {
        const maxRange = Math.max(
          1,
          ...Object.entries(army.composition)
            .filter(([, c]) => c > 0)
            .map(([id]) => troopDef(id).range),
        );
        for (const other of Object.values(match.armies)) {
          if (other.owner === army.owner) continue;
          if ((player?.fog[other.hex] ?? 0) !== 2) continue;
          if (hexDistanceId(army.hex, other.hex) <= maxRange) targets.add(other.hex);
        }
      }
    }
    return { hex: selectedHex, armyId: selectedArmyId, reachable, targets };
  }, [match, army, pendingAction, selectedHex, selectedArmyId, player, tick]);

  if (!match || !player) return null;

  const run = (result: { ok: boolean; reason?: string }, success: string) => {
    notify(result.ok ? success : (result.reason ?? 'Accion no permitida'));
    refresh();
  };

  const handlePickHex = (hex: HexId | null) => {
    if (!hex) return;
    // A queued verb consumes the tap; otherwise the tap is plain inspection.
    if (army && pendingAction?.type === 'move') {
      run(moveArmy(match, army.id, hex), 'Ejercito desplazado');
      setPendingAction(null);
      selectHex(hex);
      return;
    }
    if (army && pendingAction?.type === 'attack') {
      run(attack(match, army.id, hex), 'Combate resuelto');
      setPendingAction(null);
      selectHex(hex);
      return;
    }
    selectHex(hex);
    // Tapping a hex holding one of our armies selects it: fewer taps on mobile.
    const own = Object.values(match.armies).find((a) => a.hex === hex && a.owner === player.id);
    if (own) selectArmy(own.id);
  };

  const onBuildPick = (buildingId: MapBuildingId) => {
    if (!selectedHex) {
      notify('Selecciona primero un hexagono');
      return;
    }
    run(buildAt(match, player.id, selectedHex, buildingId), 'Construccion iniciada');
  };

  /** One-tap exploration: march towards the nearest unknown ground. */
  const scout = () => {
    if (!army) return;
    let best: HexId | null = null;
    let bestDistance = Infinity;
    for (const id of match.tileOrder) {
      if ((player.fog[id] ?? 0) !== 0) continue;
      const distance = hexDistanceId(army.hex, id);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = id;
      }
    }
    if (!best) {
      notify('El mapa ya esta explorado');
      return;
    }
    run(moveTowards(match, army.id, best), 'Reconocimiento en marcha');
    setFocusHex(match.armies[army.id]?.hex ?? null);
  };

  const captureHere = () => {
    if (!army) return;
    const tile = match.tiles[army.hex];
    if (tile.feature.gate) {
      run(captureGate(match, army.id), 'Puerta tomada: region abierta');
      return;
    }
    if (tile.feature.facility) {
      run(activateFacility(match, army.id), 'Instalacion activada');
      return;
    }
    notify('No hay puerta ni instalacion en este hexagono');
  };

  const tile = selectedHex ? match.tiles[selectedHex] : null;
  // CAPTURAR acts on whatever the selected army is standing on.
  const armyTile = army ? match.tiles[army.hex] : null;
  const canCapture = !!armyTile && (!!armyTile.feature.gate || !!armyTile.feature.facility);

  return (
    <div className="screen">
      <MapViewport
        state={match}
        viewerId={player.id}
        selection={selection}
        onPickHex={handlePickHex}
        tick={tick}
        focusHex={focusHex}
      />

      <header className="topbar">
        <span className="brand">OP·9D</span>
        <span className="day-chip">
          DIA {match.day}/{match.totalDays}
        </span>
        <ResourceStrip player={player} />
        <span className="res" title="Ciudadanos libres / totales">
          <span className="icon">👥</span>
          <span className="value">
            {player.citizensFree}/{player.citizensTotal}
          </span>
        </span>
        <span className="res" title="Puntuacion 4X">
          <span className="icon">★</span>
          <span className="value">{player.score}</span>
        </span>
      </header>

      <div className="match-layout">
        <div className="rail rail-left">
          <ObjectivesPanel state={match} viewerId={player.id} />
          <EventLog state={match} />
        </div>

        <div className="rail-center" />

        <div className="rail">
          <div className="panel">
            <div className="branch-tabs" style={{ padding: '10px 12px' }}>
              {TABS.map((t) => (
                <button
                  key={t.id}
                  className={`btn small${tab === t.id ? ' active' : ''}`}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {tab === 'info' && (
            <>
              <ContextPanel state={match} viewerId={player.id} hex={selectedHex} />
              <ObjectivesPanel state={match} viewerId={player.id} />
            </>
          )}
          {tab === 'army' && (
            <ArmyPanel
              state={match}
              viewerId={player.id}
              selectedArmyId={selectedArmyId}
              onSelectArmy={(id) => {
                selectArmy(id);
                setFocusHex(match.armies[id]?.hex ?? null);
              }}
              onAct={(message) => {
                notify(message);
                refresh();
              }}
            />
          )}
          {tab === 'build' && (
            <BuildPanel
              state={match}
              viewerId={player.id}
              hex={selectedHex}
              onPickBuilding={onBuildPick}
              onAct={(message) => {
                notify(message);
                refresh();
              }}
            />
          )}
          {tab === 'tech' && (
            <TechPanel
              state={match}
              viewerId={player.id}
              onAct={(message) => {
                notify(message);
                refresh();
              }}
            />
          )}
          {tab === 'standings' && (
            <>
              <StandingsPanel state={match} />
              <EventLog state={match} />
            </>
          )}
        </div>
      </div>

      <footer className="actionbar">
        <button
          className={`btn${pendingAction?.type === 'move' ? ' active' : ''}`}
          disabled={!army}
          onClick={() => setPendingAction(pendingAction?.type === 'move' ? null : { type: 'move' })}
        >
          MOVER
        </button>
        <button
          className={`btn${pendingAction?.type === 'attack' ? ' active' : ''}`}
          disabled={!army}
          onClick={() => setPendingAction(pendingAction?.type === 'attack' ? null : { type: 'attack' })}
        >
          ATACAR
        </button>
        <button
          className="btn"
          disabled={!army}
          onClick={() => army && run(gather(match, army.id), 'Recursos recolectados')}
        >
          RECOLECTAR
        </button>
        <button className="btn" disabled={!tile} onClick={() => setTab('build')}>
          CONSTRUIR
        </button>
        <button className="btn" disabled={!army} onClick={scout}>
          EXPLORAR
        </button>
        <button className="btn" disabled={!canCapture} onClick={captureHere}>
          CAPTURAR
        </button>

        <span className="spacer" />

        <button className="btn ghost small" onClick={abandon} title="Abandonar y volver a la ciudad">
          SALIR
        </button>
        <button className="btn small" onClick={simulateRest} title="Deja que la IA juegue los dias restantes">
          AUTO-SIM
        </button>
        <button className="btn primary" onClick={nextDay}>
          {match.day >= match.totalDays ? 'FINALIZAR' : 'DIA SIGUIENTE →'}
        </button>
      </footer>
    </div>
  );
}
