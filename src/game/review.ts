/**
 * Leitner spaced repetition, deliberately simpler than Anki: five boxes,
 * explainable on one screen, unit-testable (SPEC 1.7).
 *
 * The point of storing this is that the *selector consumes it* (FR-21, R2-6):
 * persisted progress that nothing reads is a passive log, not learning.
 */

import { REVIEW } from './config';
import type { Word } from './types';

export interface WordProgress {
  /** Leitner box, 0..4. */
  readonly box: number;
  /** When the word should next be quizzed, or null until it is first scored. */
  readonly dueAt: number | null;
  /** Times quizzed. */
  readonly seen: number;
  /** Times answered correctly. */
  readonly correct: number;
  /** Times answered wrongly after having been learned. */
  readonly lapses: number;
  readonly lastSeenAt: number | null;
}

export type Mastery = 'unseen' | 'learning' | 'known';

export function intervalMs(box: number): number {
  const index = Math.min(Math.max(box, 0), REVIEW.intervalsMinutes.length - 1);
  const minutes = REVIEW.intervalsMinutes[index] ?? REVIEW.intervalsMinutes[0] ?? 10;
  return minutes * 60_000;
}

export function unseenProgress(): WordProgress {
  return { box: 0, dueAt: null, seen: 0, correct: 0, lapses: 0, lastSeenAt: null };
}

/** Answered correctly: move up a box and schedule the next review. */
export function afterCorrect(prior: WordProgress | undefined, now: number): WordProgress {
  const base = prior ?? unseenProgress();
  const box = Math.min(base.box + 1, REVIEW.intervalsMinutes.length - 1);
  return {
    box,
    dueAt: now + intervalMs(box),
    seen: base.seen + 1,
    correct: base.correct + 1,
    lapses: base.lapses,
    lastSeenAt: now,
  };
}

/**
 * Answered wrongly: drop back to the first box. Nothing is ever lost, which is
 * the same non-punitive rule the board follows (SPEC 1.3): a wrong tap costs a
 * little time and a little progress, never the word itself.
 */
export function afterWrong(prior: WordProgress | undefined, now: number): WordProgress {
  const base = prior ?? unseenProgress();
  return {
    box: REVIEW.lapseBox,
    dueAt: now + intervalMs(REVIEW.lapseBox),
    seen: base.seen + 1,
    correct: base.correct,
    lapses: base.lapses + (base.seen > 0 ? 1 : 0),
    lastSeenAt: now,
  };
}

export function masteryOf(progress: WordProgress | undefined): Mastery {
  if (!progress || progress.seen === 0) return 'unseen';
  return progress.box >= REVIEW.knownBox ? 'known' : 'learning';
}

export function masteryCounts(
  words: readonly Word[],
  progress: Readonly<Record<string, WordProgress>>,
): Record<Mastery, number> {
  const counts: Record<Mastery, number> = { unseen: 0, learning: 0, known: 0 };
  for (const word of words) counts[masteryOf(progress[word.id])] += 1;
  return counts;
}

export interface Queue {
  /** Words whose review is due, soonest first. */
  readonly due: readonly Word[];
  /** Words never quizzed, in deck order. */
  readonly fresh: readonly Word[];
  /** due + fresh, capped: today's session. */
  readonly ids: readonly string[];
}

/**
 * Today's queue: due reviews first (they are the ones about to be forgotten),
 * then new words, then nothing. The queue is what makes "done" mean "learned"
 * rather than "reached a score" (SPEC 1.7).
 */
export function buildQueue(
  words: readonly Word[],
  progress: Readonly<Record<string, WordProgress>>,
  now: number,
  limits: { newPerSession: number; cap: number },
): Queue {
  const due = words
    .filter((word) => {
      const record = progress[word.id];
      return record !== undefined && record.dueAt !== null && record.dueAt <= now;
    })
    .sort((a, b) => {
      const left = progress[a.id]?.dueAt ?? 0;
      const right = progress[b.id]?.dueAt ?? 0;
      return left - right || a.id.localeCompare(b.id, 'en');
    });

  const fresh = words.filter((word) => !progress[word.id]).slice(0, limits.newPerSession);

  const ids = [...due.map((w) => w.id), ...fresh.map((w) => w.id)].slice(0, limits.cap);
  return { due, fresh, ids };
}