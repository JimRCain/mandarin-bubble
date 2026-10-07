import { useGame } from '../useGame';
import Button from './ui/Button';

interface HomeScreenProps {
  onStartSession: () => void;
  onNavigate: (screen: 'decks' | 'settings' | 'progress') => void;
}

export default function HomeScreen({ onStartSession, onNavigate }: HomeScreenProps) {
  const { loading, error, pool, settings, progress, howToSeen, setHowToSeen, index } = useGame();

  const ready = !loading && pool.length > 0;
  const wordsSeen = Object.keys(progress.words).length;

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col gap-5 overflow-y-auto p-6" data-testid="home">
      <header className="mt-4 text-center">
        <h1 className="text-3xl font-bold text-white">Mandarin Bubble</h1>
        <p className="mt-1 text-sm text-gray-400">
          Tap the bubble that matches the English prompt. Nothing is lost, nothing is punished: the
          clock is the only pressure.
        </p>
      </header>

      {error && (
        <p className="rounded-lg border border-lantern-500 bg-ink-800 p-3 text-sm text-lantern-400" data-testid="home-error">
          {error}
        </p>
      )}

      <Button size="medium" className="w-full py-4 text-base" onClick={onStartSession} disabled={!ready} data-testid="start-session">
        {loading ? 'Loading words...' : ready ? 'Start a 90 second run' : 'No words selected'}
      </Button>

      <div className="grid grid-cols-3 gap-2">
        <Button variant="subtle" onClick={() => onNavigate('decks')} data-testid="nav-decks">
          Decks
        </Button>
        <Button variant="subtle" onClick={() => onNavigate('settings')} data-testid="nav-settings">
          Settings
        </Button>
        <Button variant="subtle" onClick={() => onNavigate('progress')} data-testid="nav-progress">
          Progress
        </Button>
      </div>

      <section className="rounded-xl border border-ink-800 bg-ink-900 p-4 text-sm text-gray-300">
        <h2 className="text-xs uppercase tracking-wide text-gray-400">Your setup</h2>
        <ul className="mt-2 space-y-1">
          <li>
            Decks in play:{' '}
            <span className="font-mono text-white" data-testid="home-deck-count">
              {settings.decks.length}
            </span>
            {index ? <span className="text-gray-500"> of {index.decks.length}</span> : null}
          </li>
          <li>
            Words in the pool: <span className="font-mono text-white">{pool.length}</span>
          </li>
          <li>
            Bands: <span className="font-mono text-white">{settings.bands.join(', ')}</span>
          </li>
          <li>
            Pace: <span className="font-mono text-white">{settings.pace}</span>
          </li>
          <li>
            Words you have answered: <span className="font-mono text-white">{wordsSeen}</span>
          </li>
        </ul>
      </section>

      {!howToSeen && (
        <section
          className="rounded-xl border border-jade-500/50 bg-ink-900 p-4 text-sm text-gray-300"
          data-testid="how-to"
        >
          <h2 className="text-xs uppercase tracking-wide text-jade-400">How to play</h2>
          <ol className="mt-2 list-inside list-decimal space-y-1">
            <li>The English meaning sits at the top. The clock is running.</li>
            <li>Bubbles fall; a bubble that reaches the bottom wraps back to the top.</li>
            <li>Tap the bubble whose Hanzi means what the prompt says.</li>
            <li>15 correct answers or 90 seconds, whichever lands first.</li>
            <li>A correct tap pops the bubble and the next word comes straight away.</li>
          </ol>
          <Button
            variant="ghost"
            size="small"
            className="mt-3"
            onClick={() => setHowToSeen(true)}
            data-testid="how-to-dismiss"
          >
            Got it
          </Button>
        </section>
      )}

      <p className="pb-2 text-center text-[11px] text-gray-500">
        Add ?seed=123 to the URL to replay a session exactly. Useful for bug reports.
      </p>
    </div>
  );
}