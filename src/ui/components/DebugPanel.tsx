import { useGame } from '../store';
import { ALL_MATCH_RESOURCE_IDS, CITY_RESOURCE_IDS, RARE_RESOURCE_IDS } from '../../data/resources';
import { TECHNOLOGY_IDS } from '../../data/technologies';
import { TROOP_IDS } from '../../data/troops';
import { revealAll } from '../../map/fogOfWar';
import { recomputeModifiers } from '../../core/technology';
import { updateTerritory } from '../../core/territory';
import { updateAllScores } from '../../core/scoring';
import { finishMatch } from '../../core/turnSystem';
import { armiesOf, createArmy } from '../../core/gameState';
import { addCityResources } from '../../entities/city';
import { computeMaxMovementPoints } from '../../core/movement';

/**
 * F1 debug console. Not shipped-quality UI on purpose - its only job is to make
 * every state reachable in seconds so systems can be exercised without playing
 * nine days by hand.
 */
export function DebugPanel() {
  const open = useGame((s) => s.debugOpen);
  const toggle = useGame((s) => s.toggleDebug);
  const match = useGame((s) => s.match);
  const refresh = useGame((s) => s.refresh);
  const notify = useGame((s) => s.notify);
  const nextDay = useGame((s) => s.nextDay);
  const simulateRest = useGame((s) => s.simulateRestOfMatch);
  const startMatch = useGame((s) => s.startMatch);
  const mutateCity = useGame((s) => s.mutateCity);
  const selectedArmyId = useGame((s) => s.selectedArmyId);
  const selectedHex = useGame((s) => s.selectedHex);

  if (!open) return null;

  const player = match?.players.find((p) => p.id === match.humanId) ?? null;

  const act = (fn: () => string) => {
    const message = fn();
    refresh();
    notify(message);
  };

  return (
    <div className="overlay" onClick={toggle}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h2>Debug · F1</h2>
        <p className="small faint">
          Herramientas de desarrollo. Cambian el estado directamente sin pasar por las reglas.
        </p>

        <div className="panel-title">Ciudad</div>
        <div className="btn-grid">
          <button
            className="btn small"
            onClick={() =>
              act(() => {
                mutateCity((city) => {
                  const bump: Record<string, number> = {};
                  for (const id of CITY_RESOURCE_IDS) bump[id] = 5000;
                  for (const id of RARE_RESOURCE_IDS) bump[id] = 200;
                  addCityResources(city, bump);
                });
                return '+5000 de cada recurso de ciudad';
              })
            }
          >
            +RECURSOS CIUDAD
          </button>
          <button
            className="btn small"
            onClick={() =>
              act(() => {
                mutateCity((city) => {
                  for (const id of Object.keys(city.resources)) city.resources[id] = 0;
                });
                return 'Recursos de ciudad vaciados';
              })
            }
          >
            VACIAR CIUDAD
          </button>
          <button
            className="btn small"
            onClick={() =>
              act(() => {
                mutateCity((city) => {
                  for (const id of Object.keys(city.buildings)) {
                    city.buildings[id] = Math.min(5, (city.buildings[id] ?? 0) + 1);
                  }
                });
                return 'Todos los edificios +1 nivel';
              })
            }
          >
            +1 NIVEL EDIFICIOS
          </button>
          <button
            className="btn small"
            onClick={() =>
              act(() => {
                mutateCity((city) => {
                  for (const id of TROOP_IDS) {
                    city.troopLevels[id] = Math.min(5, (city.troopLevels[id] ?? 1) + 1);
                  }
                });
                return 'Todas las tropas +1 nivel';
              })
            }
          >
            +1 NIVEL TROPAS
          </button>
        </div>

        <div className="panel-title" style={{ marginTop: 10 }}>
          Partida
        </div>
        {!match || !player ? (
          <div className="small faint">No hay partida en curso.</div>
        ) : (
          <>
            <div className="btn-grid">
              <button
                className="btn small"
                onClick={() =>
                  act(() => {
                    for (const id of ALL_MATCH_RESOURCE_IDS) {
                      player.stock[id] = player.storage[id];
                    }
                    return 'Almacenes llenos';
                  })
                }
              >
                +RECURSOS
              </button>
              <button
                className="btn small"
                onClick={() =>
                  act(() => {
                    for (const id of ALL_MATCH_RESOURCE_IDS) player.stock[id] = 0;
                    return 'Recursos a cero';
                  })
                }
              >
                -RECURSOS
              </button>
              <button
                className="btn small"
                onClick={() =>
                  act(() => {
                    player.technologies = [...TECHNOLOGY_IDS];
                    recomputeModifiers(player);
                    for (const region of match.regions) {
                      if (!player.unlockedRegions.includes(region.id)) {
                        player.unlockedRegions.push(region.id);
                      }
                    }
                    return 'Arbol tecnologico completo';
                  })
                }
              >
                TODA LA TECNOLOGIA
              </button>
              <button
                className="btn small"
                onClick={() =>
                  act(() => {
                    revealAll(player, match);
                    return 'Mapa revelado';
                  })
                }
              >
                REVELAR MAPA
              </button>
              <button
                className="btn small"
                onClick={() =>
                  act(() => {
                    player.citizensTotal += 10;
                    player.citizensFree += 10;
                    return '+10 ciudadanos';
                  })
                }
              >
                +10 CIUDADANOS
              </button>
              <button
                className="btn small"
                onClick={() =>
                  act(() => {
                    const army = selectedArmyId ? match.armies[selectedArmyId] : armiesOf(match, player.id)[0];
                    if (!army) return 'Sin ejercito seleccionado';
                    for (const id of TROOP_IDS) {
                      army.composition[id] = (army.composition[id] ?? 0) + 10;
                    }
                    army.maxMovementPoints = computeMaxMovementPoints(match, army);
                    return '+10 de cada tropa en el ejercito';
                  })
                }
              >
                +TROPAS
              </button>
              <button
                className="btn small"
                onClick={() =>
                  act(() => {
                    const hex = selectedHex ?? armiesOf(match, player.id)[0]?.hex;
                    if (!hex) return 'Selecciona un hexagono';
                    const army = createArmy(match, player, hex);
                    army.composition.infantry = 20;
                    army.composition.recon = 4;
                    army.maxMovementPoints = computeMaxMovementPoints(match, army);
                    army.movementPoints = army.maxMovementPoints;
                    return `Ejercito creado en ${hex}`;
                  })
                }
              >
                CREAR EJERCITO
              </button>
              <button
                className="btn small danger"
                onClick={() =>
                  act(() => {
                    if (!selectedArmyId || !match.armies[selectedArmyId]) return 'Sin ejercito seleccionado';
                    delete match.armies[selectedArmyId];
                    updateTerritory(match);
                    return 'Ejercito eliminado';
                  })
                }
              >
                ELIMINAR EJERCITO
              </button>
              <button
                className="btn small"
                onClick={() =>
                  act(() => {
                    const army = selectedArmyId ? match.armies[selectedArmyId] : null;
                    if (!army) return 'Sin ejercito seleccionado';
                    if (!selectedHex) return 'Selecciona un hexagono destino';
                    army.hex = selectedHex;
                    updateTerritory(match);
                    return `Ejercito teletransportado a ${selectedHex}`;
                  })
                }
              >
                TELEPORTAR EJERCITO
              </button>
              <button className="btn small" onClick={() => act(() => { nextDay(); return 'Dia avanzado'; })}>
                DIA SIGUIENTE
              </button>
              <button
                className="btn small"
                onClick={() => act(() => { simulateRest(); return 'Partida simulada'; })}
              >
                SIMULAR PARTIDA
              </button>
              <button
                className="btn small primary"
                onClick={() =>
                  act(() => {
                    match.mainObjective.completedBy = player.id;
                    match.mainObjective.completedOnDay = match.day;
                    updateAllScores(match);
                    finishMatch(match, player.id, 'objective');
                    useGame.getState().finishAndCollect();
                    return 'Victoria forzada';
                  })
                }
              >
                GANAR PARTIDA
              </button>
              <button
                className="btn small danger"
                onClick={() => act(() => { startMatch(match.seed); return 'Partida reiniciada'; })}
              >
                REINICIAR PARTIDA
              </button>
            </div>

            <div className="small faint" style={{ marginTop: 10 }}>
              Semilla {match.seed} · dia {match.day}/{match.totalDays} · fase {match.phase} ·{' '}
              {Object.keys(match.armies).length} ejercitos · {Object.keys(match.buildings).length}{' '}
              estructuras
            </div>
          </>
        )}

        <div className="btn-row" style={{ marginTop: 14 }}>
          <button className="btn" onClick={toggle}>
            CERRAR
          </button>
        </div>
      </div>
    </div>
  );
}
