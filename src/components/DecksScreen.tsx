/**
 * Decks: the tree, not a list.
 *
 * The screen used to be every deck in one flat scroll with a band breakdown per
 * deck. That made the first day a wall of 51 rows and told the player about
 * rarity, which is a property of the progression rather than a choice to make.
 * Now it shows worlds, opens them as the player masters what they have, and says
 * plainly when a deck is shut.
 *
 * A locked deck is not hidden: seeing the next one is the point of the tree.
 */
import { useGame } from '../useGame';
import { UNLOCK_KNOWN_FRACTION } from '../game/tree';
import Button from './ui/Button';

interface DecksScreenProps {
  onBack: () => void;
}

const percent = (value: number): string => `${Math.round(value * 100)}%`;

export default function DecksScreen({ onBack }: DecksScreenProps) {
  const { index, settings, toggleDeck, tree, pool } = useGame();

  if (!index) {
    return (
      <div className="p-6 text-sm text-gray-300" data-testid="decks">
        Loading decks...
      </div>
    );
  }

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
        {tree.map((group) => (
          <section key={group.name} className="mb-5" data-testid="deck-group" data-group={group.name}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs uppercase tracking-wide text-gray-400">
                <span className="mr-1" aria-hidden>
                  {group.icon}
                </span>
                {group.name}
                {group.ladder && <span className="ml-1 text-gray-600">· ladder</span>}
              </h2>
              <span className="font-mono text-[11px] text-gray-400">
                {group.open}/{group.total} open · {percent(group.progress)}
              </span>
            </div>
            <div className="mb-2 h-[3px] overflow-hidden rounded bg-ink-800" aria-hidden>
              <div
                className="h-full bg-jade-500"
                style={{ width: `${Math.round(group.progress * 100)}%` }}
              />
            </div>

            <ul className="space-y-2">
              {group.nodes.map((node) => {
                const selected = settings.decks.includes(node.deck.id);
                return (
                  <li key={node.deck.id}>
                    <button
                      type="button"
                      onClick={() => toggleDeck(node.deck.id)}
                      disabled={!node.unlocked}
                      data-testid="deck-toggle"
                      data-deck-id={node.deck.id}
                      data-unlocked={node.unlocked}
                      aria-pressed={selected}
                      className={[
                        'w-full rounded-lg border p-3 text-left transition-colors',
                        !node.unlocked
                          ? 'cursor-not-allowed border-ink-800 bg-ink-950 opacity-50'
                          : selected
                            ? 'border-jade-500 bg-jade-500/10'
                            : 'border-ink-800 bg-ink-900 hover:border-ink-700',
                      ].join(' ')}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-white">
                          {node.deck.name}
                          {node.complete && <span className="ml-1 text-jade-400">✓</span>}
                        </span>
                        <span className="font-mono text-xs text-gray-400">
                          {node.deck.uniqueWords} words
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-gray-400">
                        {node.unlocked ? (
                          <span>
                            {node.known} known · {node.seen} seen
                          </span>
                        ) : (
                          <span>Opens at {percent(UNLOCK_KNOWN_FRACTION)} of the deck before it</span>
                        )}
                        <span className="font-mono">{percent(node.progress)}</span>
                      </div>
                      {node.unlocked && node.progress > 0 && (
                        <div className="mt-1 h-[2px] overflow-hidden rounded bg-ink-800" aria-hidden>
                          <div
                            className="h-full bg-jade-500"
                            style={{ width: `${Math.round(node.progress * 100)}%` }}
                          />
                        </div>
                      )}
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