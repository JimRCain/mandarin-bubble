import { describe, expect, it } from 'vitest';
import { REVIEW } from '../src/game/config';
import { afterCorrect, afterWrong, buildQueue, intervalMs, masteryCounts, masteryOf, unseenProgress } from '../src/game/review';
import type { Word } from '../src/game/types';

const word = (id: string): Word => ({ id, hanzi: id, pinyin: id, english: id, band: 'common', zipf: 5.5 });

describe('Leitner boxes (SPEC 1.7)', () => {
  it('uses the documented intervals', () => {
    expect(intervalMs(0)).toBe(10 * 60_000);
    expect(intervalMs(1)).toBe(24 * 60 * 60_000);
    expect(intervalMs(2)).toBe(3 * 24 * 60 * 60_000);
    expect(intervalMs(3)).toBe(7 * 24 * 60 * 60_000);
    expect(intervalMs(4)).toBe(21 * 24 * 60 * 60_000);
    // Out-of-range boxes clamp rather than throwing.
    expect(intervalMs(9)).toBe(intervalMs(REVIEW.intervalsMinutes.length - 1));
    expect(intervalMs(-3)).toBe(intervalMs(0));
  });

  it('walks a word up the boxes on correct answers and schedules each return', () => {
    const now = 1_000_000;
    let progress = afterCorrect(undefined, now);
    expect(progress.box).toBe(1);
    expect(progress.dueAt).toBe(now + intervalMs(1));
    expect(progress.seen).toBe(1);
    expect(progress.correct).toBe(1);

    progress = afterCorrect(progress, now);
    expect(progress.box).toBe(2);
    progress = afterCorrect(progress, now);
    progress = afterCorrect(progress, now);
    progress = afterCorrect(progress, now);
    expect(progress.box).toBe(4);
    expect(progress.correct).toBe(5);
    expect(progress.lapses).toBe(0);
  });

  it('drops a lapse back to the first box without erasing the word', () => {
    const now = 0;
    let progress = afterCorrect(undefined, now);
    progress = afterCorrect(progress, now);
    progress = afterCorrect(progress, now);
    expect(progress.box).toBe(3);

    progress = afterWrong(progress, now);
    expect(progress.box).toBe(0);
    expect(progress.dueAt).toBe(intervalMs(0));
    expect(progress.lapses).toBe(1);
    expect(progress.correct).toBe(3);
    expect(progress.seen).toBe(4);
  });

  it('never counts a first-encounter mistake as a lapse', () => {
    const progress = afterWrong(undefined, 5);
    expect(progress.lapses).toBe(0);
    expect(progress.seen).toBe(1);
  });

  it('maps boxes to the mastery meter the menu shows', () => {
    expect(masteryOf(undefined)).toBe('unseen');
    expect(masteryOf(unseenProgress())).toBe('unseen');
    expect(masteryOf({ box: 1, dueAt: 0, seen: 2, correct: 2, lapses: 0, lastSeenAt: 0 })).toBe('learning');
    expect(masteryOf({ box: REVIEW.knownBox, dueAt: 0, seen: 4, correct: 4, lapses: 0, lastSeenAt: 0 })).toBe('known');
  });

  it('counts mastery across a deck', () => {
    const words = [word('a'), word('b'), word('c')];
    const counts = masteryCounts(words, {
      a: { box: 4, dueAt: 0, seen: 5, correct: 5, lapses: 0, lastSeenAt: 0 },
      b: { box: 1, dueAt: 0, seen: 1, correct: 1, lapses: 0, lastSeenAt: 0 },
    });
    expect(counts).toEqual({ unseen: 1, learning: 1, known: 1 });
  });
});

describe('today queue (SPEC 1.7, FR-21)', () => {
  const words = [word('a'), word('b'), word('c'), word('d')];

  it('puts due reviews first, soonest first, then new words', () => {
    const now = 1000;
    const queue = buildQueue(words, {
      a: { box: 1, dueAt: now + 60_000, seen: 1, correct: 1, lapses: 0, lastSeenAt: 0 },
      b: { box: 1, dueAt: now - 5000, seen: 1, correct: 1, lapses: 0, lastSeenAt: 0 },
      c: { box: 0, dueAt: now - 10_000, seen: 1, correct: 0, lapses: 0, lastSeenAt: 0 },
    }, now, { newPerSession: 5, cap: 20 });

    expect(queue.due.map((entry) => entry.id)).toEqual(['c', 'b']);
    expect(queue.fresh.map((entry) => entry.id)).toEqual(['d']);
    expect(queue.ids).toEqual(['c', 'b', 'd']);
  });

  it('caps how much new material one session can introduce', () => {
    const queue = buildQueue(words, {}, 0, { newPerSession: 2, cap: 20 });
    expect(queue.fresh.map((entry) => entry.id)).toEqual(['a', 'b']);
  });

  it('caps the whole queue', () => {
    const queue = buildQueue([...words, word('e'), word('f')], {}, 0, { newPerSession: 10, cap: 3 });
    expect(queue.ids).toHaveLength(3);
  });

  it('returns nothing to do when everything is scheduled for later', () => {
    const now = 0;
    const progress = Object.fromEntries(
      words.map((entry) => [entry.id, { box: 1, dueAt: now + 10_000, seen: 1, correct: 1, lapses: 0, lastSeenAt: 0 }]),
    );
    const queue = buildQueue(words, progress, now, { newPerSession: 5, cap: 20 });
    expect(queue.ids).toEqual([]);
  });
});