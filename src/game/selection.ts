/**
 * Target and distractor selection — the rules that make a round fair.
 *
 * Spec commitments enforced here:
 *  - FR-9  every spawned word is in the selected decks and bands
 *  - FR-10 exactly ONE visible bubble matches the target, which is a data
 *          problem as much as a code problem: 56 glosses collide inside a deck
 *          and 588 Hanzi appear in more than one deck (SPEC 4.4)
 *  - FR-11 no target repeats inside a session until the pool is exhausted
 *  - FR-12 distractors are preferences too: same deck, comparable band
 */

import { createRng, type Rng } from './rng';
import type { Band, PoolWord, Word } from './types';

export interface RoundPlan {
  readonly target: PoolWord;
  /** Candidate ids, target included, in the order they should be shown. */
  readonly candidateIds: readonly string[];
}

/** Words the player could be quizzed on, given decks and bands. */
export function filterPool(pool: readonly PoolWord[], decks: readonly string[], bands: readonly Band[]): PoolWord[] {
  const deckSet = new Set(decks);
  const bandSet = new Set(bands);
  return pool.filter(
    (word) => word.decks.some((deck) => deckSet.has(deck)) && bandSet.has(word.band),
  );
}

/** Two words are interchangeable in a round only if nothing visible separates them. */
function collides(a: Word, b: Word): boolean {
  return a.id === b.id || a.hanzi === b.hanzi || a.english === b.english;
}

/**
 * Targets that can never be unambiguous: some other word in the pool shares its
 * Hanzi or its English gloss, so the round would have two right answers.
 */
export function ambiguousTargets(pool: readonly PoolWord[]): Set<string> {
  const byHanzi = new Map<string, number>();
  const byGloss = new Map<string, number>();
  for (const word of pool) {
    byHanzi.set(word.hanzi, (byHanzi.get(word.hanzi) ?? 0) + 1);
    byGloss.set(word.english, (byGloss.get(word.english) ?? 0) + 1);
  }
  const blocked = new Set<string>();
  for (const word of pool) {
    if ((byHanzi.get(word.hanzi) ?? 0) > 1 || (byGloss.get(word.english) ?? 0) > 1) blocked.add(word.id);
  }
  return blocked;
}

export interface SelectOptions {
  readonly pool: readonly PoolWord[];
  readonly choices: number;
  readonly excludeIds?: readonly string[];
  readonly rng?: Rng;
  readonly seed?: number;
  /** Prefer distractors from these decks. */
  readonly preferDecks?: readonly string[];
}

/**
 * Chooses a target and its distractors, or returns null when the pool cannot
 * support an unambiguous round (the caller then offers fewer choices or asks
 * for a wider selection rather than showing a broken round).
 */
export function planRound(options: SelectOptions): RoundPlan | null {
  const { pool, choices } = options;
  const rng = options.rng ?? createRng(options.seed ?? 1);
  const excluded = new Set(options.excludeIds ?? []);
  const blocked = ambiguousTargets(pool);

  const eligible = pool.filter((word) => !excluded.has(word.id) && !blocked.has(word.id));
  if (eligible.length === 0) return null;

  const preferDecks = new Set(options.preferDecks ?? []);
  const preferred = eligible.filter((word) => word.decks.some((deck) => preferDecks.has(deck)));
  const targetPool = preferred.length > 0 ? preferred : eligible;
  const target = rng.pick(targetPool);

  const candidates = chooseDistractors(target, pool, choices - 1, rng);
  if (candidates.length < choices - 1) return null;

  const candidateIds = rng.shuffle([target.id, ...candidates.map((word) => word.id)]);
  return { target, candidateIds };
}

/**
 * Distractors for one round: never colliding with the target or with each other,
 * same deck and comparable band preferred so difficulty does not drift with
 * corpus size (FR-12).
 */
export function chooseDistractors(
  target: PoolWord,
  pool: readonly PoolWord[],
  count: number,
  rng: Rng = createRng(1),
): PoolWord[] {
  const targetDecks = new Set(target.decks);
  const bandRank = (band: Band) => ['common', 'mid', 'rare'].indexOf(band);
  const candidates = pool.filter((word) => !collides(word, target));

  const scored = candidates.map((word) => {
    const sameDeck = word.decks.some((deck) => targetDecks.has(deck)) ? 0 : 1;
    const bandDistance = Math.abs(bandRank(word.band) - bandRank(target.band));
    return { word, score: sameDeck * 10 + bandDistance };
  });

  scored.sort((a, b) => a.score - b.score || a.word.id.localeCompare(b.word.id, 'en'));

  const chosen: PoolWord[] = [];
  // Walk outward from the best-scoring distractors, taking only words that stay
  // unambiguous against everything already chosen.
  for (const { word } of scored) {
    if (chosen.length >= count) break;
    if (chosen.some((picked) => collides(picked, word))) continue;
    chosen.push(word);
  }

  if (chosen.length < count) {
    // Nothing better available; the caller decides whether to shrink the round.
    return chosen;
  }
  return rng.shuffle(chosen);
}