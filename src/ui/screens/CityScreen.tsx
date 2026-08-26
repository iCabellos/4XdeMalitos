import { useState } from 'react';
import { useGame } from '../store';
import { CityViewport } from '../components/CityViewport';
import { CITY_BUILDINGS, CITY_BUILDING_IDS, type CityBranch } from '../../data/buildings.city';
import { TROOP_IDS, troopDef, troopAttackAt, troopDefenseAt, MAX_TROOP_LEVEL } from '../../data/troops';
import {

  commanderXpForLevel,
  COMMANDER_ROLE_ICON,
  COMMANDER_ROLE_LABEL,
  COMMANDERS,
  type CommanderRole,
} from '../../data/commanders';
import { CITY_RESOURCE_IDS, RARE_RESOURCE_IDS, resourceDef } from '../../data/resources';
import {
  canUpgradeCityBuilding,
  upgradeCityBuilding,
  canUpgradeTroop,
  upgradeTroop,
  cityTier,
  deriveCityEffects,
  unlockedCommanders,
  troopLevelCap,
} from '../../entities/city';

type Tab = 'buildings' | 'troops' | 'commanders' | 'summary';

const BRANCHES: { id: CityBranch; label: string }[] = [
  { id: 'economic', label: 'ECONOMICA' },
  { id: 'military', label: 'MILITAR' },
  { id: 'diplomatic', label: 'DIPLOMATICA' },
];

function formatCityCost(cost: Record<string, number> | null | undefined): string {
  if (!cost) return '-';
  return Object.entries(cost)
    .filter(([, v]) => !!v)
    .map(([k, v]) => `${v} ${resourceDef(k)?.short ?? k}`)
    .join('  ');
}

export function CityScreen() {
  const city = useGame((s) => s.city);
  const tick = useGame((s) => s.tick);
  const mutateCity = useGame((s) => s.mutateCity);
  const setScreen = useGame((s) => s.setScreen);
  const notify = useGame((s) => s.notify);
  const resetCity = useGame((s) => s.resetCity);
  const [tab, setTab] = useState<Tab>('buildings');
  const [branch, setBranch] = useState<CityBranch>('economic');
  const [selectedBuilding, setSelectedBuilding] = useState<string | null>('command_center');

  const effects = deriveCityEffects(city);
  const commanders = unlockedCommanders(city);

  return (
    <div className="screen">
      <CityViewport
        city={city}
        selectedId={selectedBuilding}
        onPickBuilding={(id) => {
          if (!id) return;
          setSelectedBuilding(id);
          setTab('buildings');
          setBranch(CITY_BUILDINGS[id].branch);
        }}
        tick={tick}
      />

      <header className="topbar">
        <span className="brand">OPERACION 9 DIAS</span>
        <span className="day-chip">CIUDAD · NIVEL TEC {cityTier(city)}</span>
        <div className="resource-strip">
          {CITY_RESOURCE_IDS.filter((id) => id !== 'population' && id !== 'energy').map((id) => (
            <div key={id} className="res" title={resourceDef(id).role}>
              <span className="icon">{resourceDef(id).icon}</span>
              <span className="value">{Math.floor(city.resources[id] ?? 0)}</span>
            </div>
          ))}
          {RARE_RESOURCE_IDS.map((id) => (
            <div key={id} className="res rare" title={resourceDef(id).role}>
              <span className="icon">{resourceDef(id).icon}</span>
              <span className="value">{Math.floor(city.resources[id] ?? 0)}</span>
            </div>
          ))}
        </div>
      </header>

      <div className="city-layout">
        <div className="viewport" />

        <div className="rail">
          <div className="panel">
            <div className="branch-tabs" style={{ padding: '10px 12px' }}>
              <button
                className={`btn small${tab === 'buildings' ? ' active' : ''}`}
                onClick={() => setTab('buildings')}
              >
                EDIFICIOS
              </button>
              <button
                className={`btn small${tab === 'troops' ? ' active' : ''}`}
                onClick={() => setTab('troops')}
              >
                TROPAS
              </button>
              <button
                className={`btn small${tab === 'commanders' ? ' active' : ''}`}
                onClick={() => setTab('commanders')}
              >
                COMANDANTES
              </button>
              <button
                className={`btn small${tab === 'summary' ? ' active' : ''}`}
                onClick={() => setTab('summary')}
              >
                RESUMEN
              </button>
            </div>
          </div>

          {tab === 'buildings' && (
            <>
              <div className="panel">
                <div className="branch-tabs" style={{ padding: '10px 12px' }}>
                  {BRANCHES.map((b) => (
                    <button
                      key={b.id}
                      className={`btn small${branch === b.id ? ' active' : ''}`}
                      onClick={() => setBranch(b.id)}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="panel">
                <div className="panel-title">Rama {BRANCHES.find((b) => b.id === branch)?.label}</div>
                <div className="panel-body">
                  <div className="list">
                    {CITY_BUILDING_IDS.filter((id) => CITY_BUILDINGS[id].branch === branch).map((id) => {
                      const def = CITY_BUILDINGS[id];
                      const level = city.buildings[id] ?? 0;
                      const check = canUpgradeCityBuilding(city, id);
                      return (
                        <div
                          key={id}
                          className={`row${selectedBuilding === id ? ' selected' : ''}`}
                          style={{ flexWrap: 'wrap' }}
                        >
                          <span className="icon" style={{ fontSize: 18 }}>
                            {def.icon}
                          </span>
                          <span
                            className="grow"
                            onClick={() => setSelectedBuilding(id)}
                            style={{ cursor: 'pointer' }}
                          >
                            <span className="name">
                              {def.name} <span className="faint">N{level}</span>
                            </span>
                            <span className="sub">{def.description}</span>
                            <span className="sub mono">
                              {check.cost ? formatCityCost(check.cost) : 'Nivel maximo'}
                            </span>
                            {!check.ok && check.reason && (
                              <span className="sub" style={{ color: 'var(--bad)' }}>
                                {check.reason}
                              </span>
                            )}
                          </span>
                          <button
                            className="btn small primary"
                            disabled={!check.ok}
                            onClick={() =>
                              mutateCity((c) => {
                                if (upgradeCityBuilding(c, id)) {
                                  notify(`${def.name} mejorado a nivel ${(c.buildings[id] ?? 0)}`);
                                }
                              })
                            }
                          >
                            {level === 0 ? 'CONSTRUIR' : 'MEJORAR'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === 'troops' && (
            <div className="panel">
              <div className="panel-title">
                Evolucion de tropas · techo actual N{troopLevelCap(city)}
              </div>
              <div className="panel-body stack">
                <div className="small faint">
                  Cada linea de tropa evoluciona por separado. Subir la Academia eleva el techo; el
                  titanio limita los niveles altos.
                </div>
                <div className="list">
                  {TROOP_IDS.map((id) => {
                    const def = troopDef(id);
                    const level = city.troopLevels[id] ?? 1;
                    const check = canUpgradeTroop(city, id);
                    const locked = (city.buildings.barracks ?? 0) < def.barracksLevel;
                    return (
                      <div key={id} className="row" style={{ flexWrap: 'wrap' }}>
                        <span className="grow">
                          <span className="name">
                            {def.name} <span className="faint">N{level}</span>
                            {locked && <span className="tag bad"> BLOQUEADA</span>}
                          </span>
                          <span className="sub">
                            Atk {troopAttackAt(def, level)} → {troopAttackAt(def, Math.min(level + 1, MAX_TROOP_LEVEL))}
                            {'  ·  '}
                            Def {troopDefenseAt(def, level)} → {troopDefenseAt(def, Math.min(level + 1, MAX_TROOP_LEVEL))}
                          </span>
                          <span className="sub mono">
                            {check.cost ? formatCityCost(check.cost) : (check.reason ?? '')}
                          </span>
                        </span>
                        <button
                          className="btn small"
                          disabled={!check.ok}
                          title={check.reason ?? ''}
                          onClick={() =>
                            mutateCity((c) => {
                              if (upgradeTroop(c, id)) notify(`${def.name} evoluciona a N${(c.troopLevels[id] ?? 1)}`);
                            })
                          }
                        >
                          SUBIR
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {tab === 'commanders' && (
            <div className="panel">
              <div className="panel-title">
                Comandantes · {commanders.length} disponibles · {effects.commanderSlots} plazas
              </div>
              <div className="panel-body stack">
                <div className="small faint">
                  Cada mecanica tiene sus propios comandantes. Se desbloquean subiendo edificios, y
                  suben de nivel con la experiencia que ganan en partida.
                </div>

                {(['assault', 'scout', 'gather', 'build'] as CommanderRole[]).map((role) => {
                  const roster = Object.values(COMMANDERS).filter((c) => c.role === role);
                  return (
                    <div key={role} className="stack" style={{ gap: 6 }}>
                      <div className="panel-title" style={{ padding: '6px 0 0' }}>
                        {COMMANDER_ROLE_ICON[role]} {COMMANDER_ROLE_LABEL[role]}
                      </div>
                      <div className="list">
                        {roster.map((def) => {
                          const progress = city.commanders[def.id];
                          const unlocked = !!progress;
                          const needed = unlocked ? commanderXpForLevel(progress.level) : 0;
                          const pct = unlocked ? Math.min(100, (progress.xp / needed) * 100) : 0;
                          return (
                            <div
                              key={def.id}
                              className="row"
                              style={{ flexWrap: 'wrap', opacity: unlocked ? 1 : 0.55 }}
                            >
                              <span className="grow">
                                <span className="name">
                                  {def.name} <span className="faint">· {def.callsign}</span>{' '}
                                  {unlocked ? (
                                    <span className="tag accent">N{progress.level}</span>
                                  ) : (
                                    <span className="tag bad">BLOQUEADO</span>
                                  )}
                                </span>
                                <span className="sub">
                                  {def.ability.name}: {def.ability.description}
                                </span>
                                <span className="sub faint">
                                  Especialidad {def.specialty} · +
                                  {Math.round(def.specialtyAttackBonus * 100)}% ataque a esa rama
                                </span>
                                {unlocked ? (
                                  <>
                                    <div className="bar info" style={{ marginTop: 4 }}>
                                      <span style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className="sub mono">
                                      {progress.xp}/{needed} XP
                                    </span>
                                  </>
                                ) : (
                                  <span className="sub" style={{ color: 'var(--accent)' }}>
                                    Requiere {CITY_BUILDINGS[def.unlock.building].name} nivel{' '}
                                    {def.unlock.level}
                                  </span>
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === 'summary' && (
            <div className="panel">
              <div className="panel-title">Aportacion de la ciudad a la proxima partida</div>
              <div className="panel-body">
                <div className="grid-3">
                  <div className="stat-tile">
                    <div className="label">Nivel tec</div>
                    <div className="value">{effects.cityTier}</div>
                  </div>
                  <div className="stat-tile">
                    <div className="label">Ciudadanos</div>
                    <div className="value">{6 + effects.citizens}</div>
                  </div>
                  <div className="stat-tile">
                    <div className="label">Ejercitos</div>
                    <div className="value">{effects.armySlots}</div>
                  </div>
                  <div className="stat-tile">
                    <div className="label">Infanteria inicial</div>
                    <div className="value">{effects.startResources.infantryStart ?? 0}</div>
                  </div>
                  <div className="stat-tile">
                    <div className="label">Produccion</div>
                    <div className="value small">x{effects.productionMultiplier.toFixed(2)}</div>
                  </div>
                  <div className="stat-tile">
                    <div className="label">Ataque</div>
                    <div className="value small">x{effects.attackMultiplier.toFixed(2)}</div>
                  </div>
                  <div className="stat-tile">
                    <div className="label">Recompensas</div>
                    <div className="value small">x{effects.rewardMultiplier.toFixed(2)}</div>
                  </div>
                  <div className="stat-tile">
                    <div className="label">Partidas</div>
                    <div className="value small">
                      {city.matchesWon}/{city.matchesPlayed}
                    </div>
                  </div>
                  <div className="stat-tile">
                    <div className="label">Mejor score</div>
                    <div className="value small">{city.bestScore}</div>
                  </div>
                </div>
                <div className="btn-row" style={{ marginTop: 12 }}>
                  <button
                    className="btn small danger"
                    onClick={() => {
                      if (confirm('Esto borra toda la metaprogresion. Continuar?')) resetCity();
                    }}
                  >
                    REINICIAR CIUDAD
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <footer className="actionbar">
        <span className="small faint nowrap" style={{ alignSelf: 'center' }}>
          La ciudad es tu progreso permanente. La partida es el motor que la hace crecer.
        </span>
        <span className="spacer" />
        <button className="btn small" onClick={() => setScreen('simulator')}>
          SIMULADOR
        </button>
        <button className="btn primary" onClick={() => setScreen('matchmaking')}>
          BUSCAR PARTIDA →
        </button>
      </footer>
    </div>
  );
}
