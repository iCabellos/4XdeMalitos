/**
 * CLI balance harness: `npm run sim -- [seed] [runs]`.
 * Prints a readable day-by-day log for a single seed, or an aggregate report
 * across many seeds when a run count is supplied.
 */
import { simulateMatch } from '../src/sim/simulateMatch';
import { createNewCity } from '../src/entities/city';

const seed = Number(process.argv[2] ?? 847392);
const runs = Number(process.argv[3] ?? 1);

if (runs === 1) {
  const result = simulateMatch({ seed, city: createNewCity() });
  console.log(result.log.join('\n'));
  console.log('');
  console.log('RECOMPENSAS DEL JUGADOR HUMANO');
  console.log(`  Posicion: ${result.rewards.placement}`);
  console.log(`  Puntuacion: ${result.rewards.score}`);
  console.log(`  Recursos: ${JSON.stringify(result.rewards.resources)}`);
  console.log(`  Puntos meta: ${result.rewards.metaPoints}`);
} else {
  const winsByPersonality: Record<string, number> = {};
  const endReasons: Record<string, number> = {};
  let totalScore = 0;
  let totalDays = 0;

  for (let i = 0; i < runs; i++) {
    const result = simulateMatch({ seed: seed + i, city: createNewCity() });
    const winner = result.state.players.find((p) => p.id === result.winner);
    const key = winner?.isHuman ? 'humano(auto)' : winner?.personality ?? 'desconocido';
    winsByPersonality[key] = (winsByPersonality[key] ?? 0) + 1;
    endReasons[result.state.endReason ?? 'none'] = (endReasons[result.state.endReason ?? 'none'] ?? 0) + 1;
    totalScore += result.state.players.reduce((a, p) => a + p.score, 0) / result.state.players.length;
    totalDays += result.days;
  }

  console.log(`Simulaciones: ${runs} (semillas ${seed}..${seed + runs - 1})`);
  console.log(`Victorias por perfil: ${JSON.stringify(winsByPersonality)}`);
  console.log(`Final de partida: ${JSON.stringify(endReasons)}`);
  console.log(`Puntuacion media por jugador: ${(totalScore / runs).toFixed(1)}`);
  console.log(`Dias medios: ${(totalDays / runs).toFixed(2)}`);
}
