import { useEffect } from 'react';
import { useGame } from './store';
import { CityScreen } from './screens/CityScreen';
import { MatchmakingScreen } from './screens/MatchmakingScreen';
import { MatchScreen } from './screens/MatchScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { SimulatorScreen } from './screens/SimulatorScreen';
import { DebugPanel } from './components/DebugPanel';

export function App() {
  const screen = useGame((s) => s.screen);
  const toast = useGame((s) => s.toast);
  const clearToast = useGame((s) => s.clearToast);
  const toggleDebug = useGame((s) => s.toggleDebug);
  const nextDay = useGame((s) => s.nextDay);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (event.key === 'F1') {
        event.preventDefault();
        toggleDebug();
      }
      // Space advances the day: the single most repeated action in a match.
      if (event.code === 'Space' && useGame.getState().screen === 'match') {
        event.preventDefault();
        nextDay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleDebug, nextDay]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(clearToast, 2600);
    return () => clearTimeout(timer);
  }, [toast, clearToast]);

  return (
    <div className="app">
      {screen === 'city' && <CityScreen />}
      {screen === 'matchmaking' && <MatchmakingScreen />}
      {screen === 'match' && <MatchScreen />}
      {screen === 'results' && <ResultsScreen />}
      {screen === 'simulator' && <SimulatorScreen />}
      {toast && (
        <div className="toast" onClick={clearToast}>
          {toast}
        </div>
      )}
      <DebugPanel />
    </div>
  );
}
