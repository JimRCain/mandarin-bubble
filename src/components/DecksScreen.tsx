import { useGame } from '../useGame';
import { BAND_LABELS, type Band } from '../game/types';
import Button from './ui/Button';

interface DecksScreenProps {
  onBack: () => void;
}

const BAND_ORDER: readonly Band[] = ['common', 'mid', 'rare'];

export default function DecksScreen({ onBack }: DecksScreenProps) {
  const { index, settings, toggleDeck, pool } = useGame();

  if (!index) {
    return (
      <div className="p-6 text-sm text-gray-300" data-testid="decks">
        Loading decks...
      </div>
    );
  }

  const groups = [...new Set(index.decks.map((deck) => deck.group))];

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col overflow-hidden" data-testid="decks">
      <header className="flex items-center justify-between border-b border-ink-800 p-4">
        <div>
          <h1 className="text-lg font-bold text-white">Decks</h1>
          <p className="text-xs text-gray-400">
            {settings.decks.length} selected, {pool.length} words in the pool
          </p>
        </div>
        <Button variant="ghost" size="small" onClick={onBack} data-testid="decks-back">
          Back
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {groups.map((group) => (
          <section key={group} className="mb-5">
            <h2 className="mb-2 text-xs uppercase tracking-wide text-gray-400">{group}</h2>
            <ul className="space-y-2">
              {index.decks
                .filter((deck) => deck.group === group)
                .map((deck) => {
                  const selected = settings.decks.includes(deck.id);
                  return (
                    <li key={deck.id}>
                      <button
                        type="button"
                        onClick={() => toggleDeck(deck.id)}
                        data-testid="deck-toggle"
                        data-deck-id={deck.id}
                        aria-pressed={selected}
                        className={[
                          'w-full rounded-lg border p-3 text-left transition-colors',
                          selected
                            ? 'border-jade-500 bg-jade-500/10'
                            : 'border-ink-800 bg-ink-900 hover:border-ink-700',
                        ].join(' ')}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-white">{deck.name}</span>
                          <span className="font-mono text-xs text-gray-400">
                            {deck.uniqueWords} words
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-gray-400">
                          {BAND_ORDER.filter((band) => deck.bands[band] > 0).map((band) => (
                            <span key={band}>
                              {BAND_LABELS[band]} {deck.bands[band]}
                            </span>
                          ))}
                          {deck.usableBands === 0 && <span className="text-lantern-400">too small to play solo</span>}
                        </div>
                      </button>
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}