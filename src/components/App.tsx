/**
 * The app shell: which screen is showing, and nothing else.
 *
 * The provider is mounted once, above every screen, so there is a single session
 * for the whole app (SPEC 2.3, defect 9: a second copy of the state is how the
 * POC's score ended up lying).
 */

import { useState } from 'react';
import { GameProvider, useGame } from '../useGame';
import DecksScreen from './DecksScreen';
import GameBoard from './GameBoard';
import HomeScreen from './HomeScreen';
import ProgressScreen from './ProgressScreen';
import SettingsScreen from './SettingsScreen';
import SummaryScreen from './SummaryScreen';

type Screen = 'home' | 'game' | 'decks' | 'settings' | 'progress';

function Screens() {
  const { state, settings, sessionEpoch, startSession, updateSettings } = useGame();
  const [screen, setScreen] = useState<Screen>('home');

  const begin = () => {
    startSession();
    setScreen('game');
  };

  if (screen === 'game') {
    if (state.phase === 'summary') {
      return <SummaryScreen onPlayAgain={begin} onBackHome={() => setScreen('home')} />;
    }
    // Keyed by pace and session epoch: a new session (or a new pace) builds a new
    // board engine rather than trying to re-shape a running one.
    return <GameBoard key={`${settings.pace}:${sessionEpoch}`} onExit={() => setScreen('home')} />;
  }

  if (screen === 'decks') return <DecksScreen onBack={() => setScreen('home')} />;
  if (screen === 'progress') return <ProgressScreen onBack={() => setScreen('home')} />;
  if (screen === 'settings') {
    return (
      <SettingsScreen
        settings={settings}
        onUpdate={updateSettings}
        onBack={() => setScreen('home')}
      />
    );
  }

  return <HomeScreen onStartSession={begin} onNavigate={setScreen} />;
}

export function App() {
  return (
    <GameProvider>
      <Screens />
    </GameProvider>
  );
}

export default App;