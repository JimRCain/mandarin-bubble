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
  /**
   * How much the player needs this word (review.ts spawnWeight). Omitted means
   * uniform, which is what the pure-selection tests want.
   *
   * Only the TARGET is weighted. Distractors keep their plausibility scoring
   * (same deck, comparable band): their job is to be a fair choice on screen,
   * and weighting them by need would fill the board with words the player
   * cannot read, which is the coin flip FR-12 exists to avoid.
   */
  readonly weightOf?: (word: PoolWord) => number;
}

/**
 * Picks one item with probability proportional to its weight. Falls back to a
 * uniform pick when every weight is zero or negative, so a bad weight can never
 * leave the board empty.
 */
function weightedPick<T>(items: readonly T[], weightOf: (item: T) => number, rng: Rng): T {
  const weights = items.map((item) => Math.max(0, weightOf(item)));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const last = items[items.length - 1];
  if (last === undefined) throw new Error('weightedPick() from an empty list');
  if (total <= 0) return rng.pick(items);
  let roll = rng.next() * total;
  for (let index = 0; index < items.length; index += 1) {
    roll -= weights[index] ?? 0;
    if (roll <= 0) return items[index] ?? last;
  }
  return last;
}

/**
 * Chooses a target and its distractors, or returns null when the pool cannot
 * support an unambiguous round (the caller then offers fewer choices or asks
 * for a wider selection rather than showing a broken round).
 *
 * This is how the OPENING board is dealt: one call fills every lane, because the
 * returned candidates never collide with each other or with the target. After
 * that the board persists for the session and nextBubbleWord() refills one lane.
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
  // Uniform when no weights are given, so the seeded expectations in the
  // selection tests keep holding exactly.
  const target =
    options.weightOf === undefined ? rng.pick(targetPool) : weightedPick(targetPool, options.weightOf, rng);

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

export interface BubbleOptions {
  readonly pool: readonly PoolWord[];
  /** Ids currently on the board. */
  readonly boardIds: readonly string[];
  /** Ids already asked this session (FR-11). */
  readonly askedIds: readonly string[];
  readonly rng: Rng;
  /** Prefer refills drawn from these decks. */
  readonly preferDecks?: readonly string[];
  /** How much the player needs this word (review.ts spawnWeight). */
  readonly weightOf?: (word: PoolWord) => number;
  /** True for a word the player has never answered. */
  readonly isNew?: (word: PoolWord) => boolean;
  /**
   * How many never-quizzed words may sit on one board (SRS 4.4). Once the board
   * has that many, a refill or a new target is drawn from words the player has
   * met: four unseen bubbles at once is a coin flip, not a reading test.
   */
  readonly newWordBudget?: number;
}

/**
 * The word a refill tick deals, or null when the board cannot be topped up.
 *
 * The board is live, so this is the rule that keeps it answerable: the new
 * bubble may not be a word already up, and it may not collide with anything
 * already up by Hanzi or by gloss, or the board would show two bubbles that
 * answer the same prompt (FR-10). Words not yet asked this session come first,
 * so a session keeps meeting new words; the deck preference only chooses among
 * those, because repeating a word the player has already answered is worse than
 * drawing one from another deck.
 */
export function nextBubbleWord(options: BubbleOptions): PoolWord | null {
  const { pool, boardIds, askedIds, rng } = options;
  const boardSet = new Set(boardIds);
  const boardWords = pool.filter((word) => boardSet.has(word.id));

  const eligible = pool.filter(
    (word) => !boardSet.has(word.id) && !boardWords.some((up) => collides(word, up)),
  );
  if (eligible.length === 0) return null;

  const budget = options.newWordBudget;
  const isNew = options.isNew;
  const unseenOnBoard = isNew === undefined ? 0 : boardWords.filter((word) => isNew(word)).length;
  const budgetSpent = budget !== undefined && isNew !== undefined && unseenOnBoard >= budget;
  const affordable = budgetSpent ? eligible.filter((word) => !isNew(word)) : eligible;
  // If every eligible word is new, the budget cannot be honoured and a repeat is
  // worse than an unseen word, so the full eligible set stands.
  const withinBudget = affordable.length > 0 ? affordable : eligible;

  const asked = new Set(askedIds);
  const unasked = withinBudget.filter((word) => !asked.has(word.id));
  const fromPool = unasked.length > 0 ? unasked : withinBudget;

  const preferDecks = new Set(options.preferDecks ?? []);
  const preferred = fromPool.filter((word) => word.decks.some((deck) => preferDecks.has(deck)));
  const finalPool = preferred.length > 0 ? preferred : fromPool;
  return options.weightOf === undefined ? rng.pick(finalPool) : weightedPick(finalPool, options.weightOf, rng);
}