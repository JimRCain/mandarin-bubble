import { accuracy } from '../game/scoring';
import { useGame } from '../useGame';
import Button from './ui/Button';

interface SummaryScreenProps {
  onPlayAgain: () => void;
  onBackHome: () => void;
}

export default function SummaryScreen({ onPlayAgain, onBackHome }: SummaryScreenProps) {
  const { state, word, settings } = useGame();
  const missed = state.wrongIds.map((id) => word(id)).filter((entry) => entry !== null);
  const answered = state.askedIds.map((id) => word(id)).filter((entry) => entry !== null);

  return (
    <div
      className="mx-auto flex h-full w-full max-w-md flex-col gap-5 overflow-y-auto p-6"
      data-testid="summary"
    >
      <header className="mt-2 text-center">
        <h1 className="text-2xl font-bold text-white">
          {state.correct >= 15 ? 'Session cleared' : 'Time'}
        </h1>
        <p className="mt-1 text-sm text-gray-400">
          {state.correct} correct of {state.correct + state.wrong} taps
          {state.correct + state.wrong > 0 ? ` (${Math.round(accuracy(state) * 100)}%)` : ''}
        </p>
      </header>

      <section className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border border-ink-800 bg-ink-900 p-3">
          <div className="text-[10px] uppercase tracking-wide text-gray-400">Score</div>
          <div className="font-mono text-xl text-white" data-testid="summary-score">
            {state.score}
          </div>
        </div>
        <div className="rounded-xl border border-ink-800 bg-ink-900 p-3">
          <div className="text-[10px] uppercase tracking-wide text-gray-400">Best combo</div>
          <div className="font-mono text-xl text-white">{state.longestCombo}</div>
        </div>
        <div className="rounded-xl border border-ink-800 bg-ink-900 p-3">
          <div className="text-[10px] uppercase tracking-wide text-gray-400">Fastest</div>
          <div className="font-mono text-xl text-white">
            {state.fastestMs === null ? '-' : `${(state.fastestMs / 1000).toFixed(1)}s`}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <Button onClick={onPlayAgain} data-testid="play-again">
          Play again
        </Button>
        <Button variant="subtle" onClick={onBackHome} data-testid="back-home">
          Home
        </Button>
      </div>

      {missed.length > 0 && (
        <section className="rounded-xl border border-lantern-500/40 bg-ink-900 p-4">
          <h2 className="text-xs uppercase tracking-wide text-lantern-400">Worth another look</h2>
          <ul className="mt-2 space-y-2" data-testid="summary-missed">
            {missed.map((entry) => (
              <li key={entry.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-xl text-white">{entry.hanzi}</span>
                <span className="text-gray-400">
                  {settings.pinyin ? `${entry.pinyin} · ` : ''}
                  {entry.english}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {answered.length > 0 && (
        <section className="rounded-xl border border-ink-800 bg-ink-900 p-4">
          <h2 className="text-xs uppercase tracking-wide text-gray-400">Words you got right</h2>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-lg" data-testid="summary-answered">
            {answered.map((entry) => (
              <span key={entry.id} className="text-white">
                {entry.hanzi}
              </span>
            ))}
          </p>
        </section>
      )}

      <p className="pb-2 text-center text-[11px] text-gray-500">
        Wrong taps cost two seconds and broke the combo. They never cost points.
      </p>
    </div>
  );
}