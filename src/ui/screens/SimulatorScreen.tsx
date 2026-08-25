import { useState } from 'react';
import { useGame } from '../store';
import { simulateMatch } from '../../sim/simulateMatch';
import { createNewCity } from '../../entities/city';

/**
 * SIMULATE MATCH: runs whole matches with no human input. This is the balance
 * tool - it is far faster to spot a dominant strategy here than by playing.
 */
export function SimulatorScreen() {
  const setScreen = useGame((s) => s.setScreen);
  const city = useGame((s) => s.city);
  const [seed, setSeed] = useState('847392');
  const [runs, setRuns] = useState('1');
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [useCity, setUseCity] = useState(true);

  const run = () => {
    setBusy(true);
    // Yield a frame so the button state paints before the (synchronous) run.
    setTimeout(() => {
      const seedNumber = Number(seed) || 1;
      const count = Math.max(1, Math.min(50, Number(runs) || 1));
      const base = useCity ? city : createNewCity();

      if (count === 1) {
        const result = simulateMatch({ seed: seedNumber, city: structuredClone(base) });
        setLog(result.log);
      } else {
        const wins: Record<string, number> = {};
        const reasons: Record<string, number> = {};
        let days = 0;
        let score = 0;
        for (let i = 0; i < count; i++) {
          const result = simulateMatch({ seed: seedNumber + i, city: structuredClone(base) });
          const winner = result.state.players.find((p) => p.id === result.winner);
          const key = winner?.isHuman ? 'humano (auto)' : (winner?.personality ?? '?');
          wins[key] = (wins[key] ?? 0) + 1;
          reasons[result.state.endReason ?? '?'] = (reasons[result.state.endReason ?? '?'] ?? 0) + 1;
          days += result.days;
          score += result.state.players.reduce((a, p) => a + p.score, 0) / result.state.players.length;
        }
        setLog([
          `SIMULACIONES: ${count}  (semillas ${seedNumber}..${seedNumber + count - 1})`,
          '',
          'VICTORIAS POR PERFIL',
          ...Object.entries(wins)
            .sort((a, b) => b[1] - a[1])
            .map(([k, v]) => `  ${k.padEnd(16)} ${v}  (${Math.round((v / count) * 100)}%)`),
          '',
          'FIN DE PARTIDA',
          ...Object.entries(reasons).map(([k, v]) => `  ${k.padEnd(16)} ${v}`),
          '',
          `DIAS MEDIOS:       ${(days / count).toFixed(2)}`,
          `PUNTUACION MEDIA:  ${(score / count).toFixed(1)}`,
        ]);
      }
      setBusy(false);
    }, 20);
  };

  return (
    <div className="screen">
      <header className="topbar">
        <span className="brand">OPERACION 9 DIAS</span>
        <span className="day-chip">SIMULADOR</span>
      </header>

      <div className="fullscreen-screen">
        <div className="hero">
          <h1>Simulador de partidas</h1>
          <p>
            Ejecuta partidas completas sin interaccion. Con una sola semilla veras el parte dia a
            dia; con varias, un informe agregado para detectar desequilibrios.
          </p>
        </div>

        <div className="panel">
          <div className="panel-body stack" style={{ paddingTop: 12 }}>
            <div className="grid-3">
              <label className="field">
                Semilla
                <input type="text" inputMode="numeric" value={seed} onChange={(e) => setSeed(e.target.value)} />
              </label>
              <label className="field">
                Partidas (1-50)
                <input type="text" inputMode="numeric" value={runs} onChange={(e) => setRuns(e.target.value)} />
              </label>
              <label className="field">
                Ciudad
                <button className={`btn${useCity ? ' active' : ''}`} onClick={() => setUseCity(!useCity)}>
                  {useCity ? 'LA TUYA' : 'CIUDAD NUEVA'}
                </button>
              </label>
            </div>
            <div className="btn-row">
              <button className="btn primary" disabled={busy} onClick={run}>
                {busy ? 'SIMULANDO…' : 'SIMULAR'}
              </button>
              <button className="btn small" disabled={busy} onClick={() => setLog([])}>
                LIMPIAR
              </button>
            </div>
          </div>
        </div>

        {log.length > 0 && (
          <div className="panel">
            <div className="panel-title">Parte de simulacion</div>
            <div className="panel-body">
              <pre className="sim-log">{log.join('\n')}</pre>
            </div>
          </div>
        )}
      </div>

      <footer className="actionbar">
        <button className="btn ghost" onClick={() => setScreen('city')}>
          ← CIUDAD
        </button>
        <span className="spacer" />
      </footer>
    </div>
  );
}
