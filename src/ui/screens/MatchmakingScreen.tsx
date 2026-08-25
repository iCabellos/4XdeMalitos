import { useMemo, useState } from 'react';
import { useGame } from '../store';
import { BOT_NAMES, BOT_PERSONALITIES, PLAYER_COLORS } from '../../core/gameState';
import { deriveCityEffects, cityTier } from '../../entities/city';
import { hexToCss } from '../../rendering/palette';
import { STRATEGIES } from '../../ai/strategies';
import { BALANCE } from '../../data/balance';

const PERSONALITY_BLURB: Record<string, string> = {
  military: 'Prioriza ejercito, conflicto y el objetivo central. Ataca en cuanto tiene ventaja.',
  economic: 'Prioriza recursos, edificios e investigacion. Crece antes de pelear.',
  explorer: 'Prioriza descubrir mapa, capturar puntos y recursos raros. Se mueve mucho.',
  diplomatic: 'Prioriza territorio, influencia y objetivos. Evita combates innecesarios.',
};

/** Lobby: shows exactly who the player is about to face and with what. */
export function MatchmakingScreen() {
  const city = useGame((s) => s.city);
  const seedInput = useGame((s) => s.seedInput);
  const setSeedInput = useGame((s) => s.setSeedInput);
  const startMatch = useGame((s) => s.startMatch);
  const setScreen = useGame((s) => s.setScreen);
  const [rolled] = useState(() => Math.floor(Math.random() * 1_000_000));

  const effects = useMemo(() => deriveCityEffects(city), [city]);

  return (
    <div className="screen">
      <header className="topbar">
        <span className="brand">OPERACION 9 DIAS</span>
        <span className="day-chip">MATCHMAKING</span>
      </header>

      <div className="fullscreen-screen">
        <div className="hero">
          <h1>Operacion de 9 dias</h1>
          <p>
            Cinco participantes, un mapa, nueve dias. Explora, explota, construye, investiga y
            disputa el objetivo central. Lo que traigas de vuelta hace crecer tu ciudad.
          </p>
        </div>

        <div className="grid-2">
          <div className="panel">
            <div className="panel-title">Tu despliegue</div>
            <div className="panel-body">
              <div className="grid-3">
                <div className="stat-tile">
                  <div className="label">Nivel tec</div>
                  <div className="value">{cityTier(city)}</div>
                </div>
                <div className="stat-tile">
                  <div className="label">Ciudadanos</div>
                  <div className="value">{BALANCE.citizens.base + effects.citizens}</div>
                </div>
                <div className="stat-tile">
                  <div className="label">Infanteria</div>
                  <div className="value">{effects.startResources.infantryStart ?? 0}</div>
                </div>
                <div className="stat-tile">
                  <div className="label">Ejercitos</div>
                  <div className="value small">{effects.armySlots}</div>
                </div>
                <div className="stat-tile">
                  <div className="label">Comandantes</div>
                  <div className="value small">{effects.commanderSlots}</div>
                </div>
                <div className="stat-tile">
                  <div className="label">Inteligencia</div>
                  <div className="value small">{effects.intelReveal > 0 ? `radio ${effects.intelReveal}` : '-'}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">Rivales · 4 bots</div>
            <div className="panel-body">
              <div className="list">
                {BOT_PERSONALITIES.map((personality, index) => (
                  <div key={personality} className="row">
                    <span className="dot" style={{ background: hexToCss(PLAYER_COLORS[index + 1]) }} />
                    <span className="grow">
                      <span className="name">{BOT_NAMES[personality]}</span>
                      <span className="sub">{PERSONALITY_BLURB[personality]}</span>
                      <span className="sub mono faint">
                        agresion {STRATEGIES[personality].aggression} · economia{' '}
                        {STRATEGIES[personality].economy} · exploracion {STRATEGIES[personality].explore}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
              <div className="small faint" style={{ marginTop: 8 }}>
                Los bots escalan con el nivel de tu ciudad, asi que la partida sigue siendo
                competitiva a medida que progresas.
              </div>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-title">Semilla del mapa</div>
          <div className="panel-body stack">
            <div className="small faint">
              La misma semilla genera el mismo mapa, los mismos recursos y las mismas posiciones.
              Dejalo vacio para una partida aleatoria.
            </div>
            <label className="field">
              Semilla
              <input
                type="text"
                inputMode="text"
                placeholder={`aleatoria (p.ej. ${rolled})`}
                value={seedInput}
                onChange={(event) => setSeedInput(event.target.value)}
              />
            </label>
            <div className="btn-row">
              <button className="btn small" onClick={() => setSeedInput(String(rolled))}>
                USAR {rolled}
              </button>
              <button className="btn small" onClick={() => setSeedInput('')}>
                ALEATORIA
              </button>
            </div>
          </div>
        </div>
      </div>

      <footer className="actionbar">
        <button className="btn ghost" onClick={() => setScreen('city')}>
          ← CIUDAD
        </button>
        <span className="spacer" />
        <button className="btn primary" onClick={() => startMatch()}>
          DESPLEGAR →
        </button>
      </footer>
    </div>
  );
}
