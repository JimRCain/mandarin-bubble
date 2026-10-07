import { masteryCounts } from '../game/review';
import { REVIEW } from '../game/config';
import { useGame } from '../useGame';
import Button from './ui/Button';
import Meter from './ui/Meter';

interface ProgressScreenProps {
  onBack: () => void;
}

export default function ProgressScreen({ onBack }: ProgressScreenProps) {
  const { pool, progress } = useGame();
  const counts = masteryCounts(pool, progress.words);
  const total = Math.max(1, counts.unseen + counts.learning + counts.known);
  const best = progress.best;

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col overflow-hidden" data-testid="progress">
      <header className="flex items-center justify-between border-b border-ink-800 p-4">
        <h1 className="text-lg font-bold text-white">Progress</h1>
        <Button variant="ghost" size="small" onClick={onBack} data-testid="progress-back">
          Back
        </Button>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-wide text-gray-400">
            Mastery across the {pool.length} words you selected
          </h2>
          <Meter label="Known" value={counts.known} max={total} caption={`${counts.known} words`} />
          <Meter
            label="Learning"
            value={counts.learning}
            max={total}
            caption={`${counts.learning} words`}
          />
          <Meter label="Not yet seen" value={counts.unseen} max={total} caption={`${counts.unseen} words`} />
          <p className="text-xs text-gray-500">
            A word counts as known from box {REVIEW.knownBox}, which is roughly three weeks of
            correct answers at widening intervals.
          </p>
        </section>

        <section className="rounded-xl border border-ink-800 bg-ink-900 p-4 text-sm text-gray-300">
          <h2 className="text-xs uppercase tracking-wide text-gray-400">Your best run</h2>
          <ul className="mt-2 space-y-1">
            <li>
              Longest combo:{' '}
              <span className="font-mono text-white" data-testid="best-combo">
                {best.longestCombo}
              </span>
            </li>
            <li>
              Fastest answer:{' '}
              <span className="font-mono text-white" data-testid="best-fastest">
                {best.fastestMs === null ? 'not yet' : `${(best.fastestMs / 1000).toFixed(1)}s`}
              </span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}