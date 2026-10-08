/**
 * The exposure system: how the clock grades an answer, how the grade moves a
 * word through the boxes, and how that becomes a chance of being dealt again.
 *
 * These are the rules in docs/SRS-PROPOSAL.md 4.1 and 4.2, which is where the
 * reasoning lives. They are pure functions with an injected clock and rng, so
 * they are tested here directly rather than through the board.
 */

import { describe, expect, it } from 'vitest';
import { REVIEW } from '../src/game/config';
import { createRng } from '../src/game/rng';
import {
  afterCorrect,
  afterWrong,
  gradeFor,
  isNewWord,
  medianOf,
  spawnWeight,
  unseenProgress,
  type WordProgress,
} from '../src/game/review';
import { nextBubbleWord, planRound } from '../src/game/selection';
import type { PoolWord } from '../src/game/types';

const poolWord = (id: string, hanzi: string, english: string): PoolWord => ({
  id,
  hanzi,
  pinyin: 'pinyin',
  english,
  band: 'common',
  zipf: 5,
  decks: ['hsk-1'],
});

// Enough words for a three-bubble round, all in one deck and band so nothing but
// the weights under test can decide the pick.
const pool: readonly PoolWord[] = [
  poolWord('a', '一', 'one'),
  poolWord('b', '二', 'two'),
  poolWord('c', '三', 'three'),
  poolWord('d', '四', 'four'),
  poolWord('e', '五', 'five'),
  poolWord('f', '六', 'six'),
];

const progress = (patch: Partial<WordProgress> = {}): WordProgress => ({
  ...unseenProgress(),
  ...patch,
});

const FAST = REVIEW.fastMs.normal;

describe('gradeFor', () => {
  it('calls an answer inside fastMs instant and one past twice fastMs slow', () => {
    expect(gradeFor(FAST, FAST)).toBe('instant');
    expect(gradeFor(FAST + 1, FAST)).toBe('good');
    expect(gradeFor(FAST * REVIEW.slowFactor - 1, FAST)).toBe('good');
    expect(gradeFor(FAST * REVIEW.slowFactor, FAST)).toBe('slow');
  });

  it('grades an unmeasured answer as ordinary, never as slow', () => {
    // A missing stopwatch must not take progress away from a word.
    expect(gradeFor(null, FAST)).toBe('good');
  });
});

describe('afterCorrect', () => {
  it('moves two boxes for an instant answer and one for an ordinary one', () => {
    expect(afterCorrect(undefined, 0, 500, FAST).box).toBe(REVIEW.instantBoxes);
    expect(afterCorrect(undefined, 0, FAST * 1.2, FAST).box).toBe(1);
  });

  it('keeps the box for a slow answer but still refreshes the due date', () => {
    const learned = progress({ box: 3, seen: 4, correct: 4, dueAt: 1 });
    const after = afterCorrect(learned, 10_000, FAST * 5, FAST);
    expect(after.box).toBe(3);
    expect(after.dueAt).toBe(10_000 + (REVIEW.intervalsMinutes[3] ?? 0) * 60_000);
    expect(after.correct).toBe(5);
    expect(after.lapses).toBe(learned.lapses);
  });

  it('never moves past the last box', () => {
    const top = progress({ box: REVIEW.boxWeights.length - 1, seen: 9, correct: 9 });
    expect(afterCorrect(top, 0, 100, FAST).box).toBe(REVIEW.boxWeights.length - 1);
  });

  it('keeps a window of response times, dropping the oldest', () => {
    let record: WordProgress = unseenProgress();
    for (let sample = 1; sample <= REVIEW.medianWindow + 2; sample += 1) {
      record = afterCorrect(record, sample, sample * 100, FAST);
    }
    expect(record.recentMs).toHaveLength(REVIEW.medianWindow);
    expect(record.recentMs[0]).toBe(300);
  });

  it('still promotes with no response time at all, as it did before timing existed', () => {
    expect(afterCorrect(undefined, 0).box).toBe(1);
  });
});

describe('afterWrong', () => {
  it('drops to the lapse box, counts the lapse, and keeps the speed history', () => {
    const learned = progress({ box: 4, seen: 3, correct: 3, recentMs: [700, 800] });
    const after = afterWrong(learned, 0);
    expect(after.box).toBe(REVIEW.lapseBox);
    expect(after.lapses).toBe(1);
    expect(after.recentMs).toEqual([700, 800]);
  });
});

describe('spawnWeight', () => {
  it('puts an unseen word at the top of the list', () => {
    expect(spawnWeight(undefined, 0, FAST)).toBe(REVIEW.boxWeights[0]);
    expect(spawnWeight(unseenProgress(), 0, FAST)).toBe(REVIEW.boxWeights[0]);
  });

  it('thins out a word the player answers instantly and correctly', () => {
    const known = progress({ box: 4, seen: 9, correct: 9, dueAt: 0, recentMs: [600, 700, 800] });
    expect(spawnWeight(known, 10, FAST)).toBeLessThan(spawnWeight(undefined, 10, FAST));
  });

  it('brings a word back when its review is due', () => {
    const base = { box: 3, seen: 5, correct: 5, recentMs: [1100] };
    const due = progress({ ...base, dueAt: 0 });
    const notDue = progress({ ...base, dueAt: 10 ** 12 });
    expect(spawnWeight(due, 10, FAST)).toBeGreaterThan(spawnWeight(notDue, 10, FAST));
  });

  it('gives a word that keeps beating the player extra board time instead of retiring it', () => {
    const shared = { box: 4, seen: 9, correct: 5, dueAt: 10 ** 12, recentMs: [600] };
    const clean = progress({ ...shared, lapses: 0 });
    const leech = progress({ ...shared, lapses: REVIEW.leechLapses });
    expect(spawnWeight(leech, 10, FAST)).toBeGreaterThan(spawnWeight(clean, 10, FAST));
  });

  it('never retires a word completely', () => {
    const spent = progress({
      box: 4,
      seen: 20,
      correct: 20,
      dueAt: 10 ** 12,
      recentMs: [100, 100, 100],
    });
    expect(spawnWeight(spent, 10, FAST)).toBeGreaterThanOrEqual(REVIEW.weightFloor);
  });
});

describe('medianOf', () => {
  it('is the middle value, averaging the middle pair', () => {
    expect(medianOf([300, 100, 200])).toBe(200);
    expect(medianOf([100, 200, 300, 400])).toBe(250);
  });

  it('is null for no samples, and for a record written before times were kept', () => {
    expect(medianOf([])).toBeNull();
    expect(medianOf(undefined)).toBeNull();
  });
});

describe('isNewWord', () => {
  it('is true until the player has answered the word once', () => {
    expect(isNewWord(undefined)).toBe(true);
    expect(isNewWord(unseenProgress())).toBe(true);
    expect(isNewWord(progress({ seen: 1 }))).toBe(false);
  });
});

describe('weighted spawn', () => {
  it('deals the word the weights ask for', () => {
    const plan = planRound({
      pool,
      choices: 3,
      rng: createRng(4),
      weightOf: (candidate) => (candidate.id === 'c' ? 1000 : 0),
    });
    expect(plan?.target.id).toBe('c');
  });

  it('still deals a word when every weight is zero', () => {
    const plan = planRound({ pool, choices: 3, rng: createRng(4), weightOf: () => 0 });
    expect(plan).not.toBeNull();
    expect(pool.map((word) => word.id)).toContain(plan?.target.id);
  });

  it('keeps the plain rule when no weights are given: one seed, one draw', () => {
    const first = planRound({ pool, choices: 3, rng: createRng(11) });
    const second = planRound({ pool, choices: 3, rng: createRng(11) });
    expect(first?.target.id).toBe(second?.target.id);
  });
});

describe('the new-word budget on one board', () => {
  /** Only b and c have never been answered. */
  const isNew = (word: PoolWord) => word.id === 'b' || word.id === 'c';
  const weighNew = (word: PoolWord) => (isNew(word) ? 1000 : 0);

  it('fills a free lane from the new words while the budget is unspent', () => {
    const refill = nextBubbleWord({
      pool,
      boardIds: ['a'],
      askedIds: [],
      rng: createRng(3),
      weightOf: weighNew,
      isNew,
      newWordBudget: 1,
    });
    expect(['b', 'c']).toContain(refill?.id);
  });

  it('refuses a second new word once the board already has one', () => {
    const refill = nextBubbleWord({
      pool,
      boardIds: ['a', 'b'],
      askedIds: [],
      rng: createRng(3),
      weightOf: weighNew,
      isNew,
      newWordBudget: 1,
    });
    expect(refill).not.toBeNull();
    expect(['d', 'e', 'f']).toContain(refill?.id);
  });

  it('gives up the budget rather than leave a lane empty when everything is new', () => {
    const refill = nextBubbleWord({
      pool,
      boardIds: ['a'],
      askedIds: [],
      rng: createRng(3),
      isNew: () => true,
      newWordBudget: 1,
    });
    expect(refill).not.toBeNull();
  });
});