/**
 * Leitner spaced repetition, deliberately simpler than Anki: five boxes,
 * explainable on one screen, unit-testable (SPEC 1.7).
 *
 * The point of storing this is that the *selector consumes it* (FR-21, R2-6):
 * persisted progress that nothing reads is a passive log, not learning. That
 * consumption is spawnWeight() below: a word the player knows comes back less
 * often, and something weaker takes its slot (docs/SRS-PROPOSAL.md 4.1).
 *
 * The player never grades themselves, so the clock grades for them. A correct
 * answer inside REVIEW.fastMs for the pace is an instant answer and moves two
 * boxes up, an ordinary correct answer moves one, and a slow correct answer
 * moves none. That last one is Anki's Hard, not a punishment: the box stays put
 * and the due date is refreshed, which is the same non-punitive rule the board
 * follows (SPEC 1.3). See docs/SRS-PROPOSAL.md 4.2.
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
  /**
   * The last few CORRECT response times in ms, oldest first, capped at
   * REVIEW.medianWindow. Empty before the first correct answer. The median of
   * these is the word's speed, and a median rather than a mean so that one
   * distracted tap cannot reclassify a word the player clearly knows.
   */
  readonly recentMs: readonly number[];
}

export type Mastery = 'unseen' | 'learning' | 'known';

/** How a correct answer is graded, from the clock alone. */
export type Grade = 'instant' | 'good' | 'slow';

export function intervalMs(box: number): number {
  const index = Math.min(Math.max(box, 0), REVIEW.intervalsMinutes.length - 1);
  const minutes = REVIEW.intervalsMinutes[index] ?? REVIEW.intervalsMinutes[0] ?? 10;
  return minutes * 60_000;
}

export function unseenProgress(): WordProgress {
  return { box: 0, dueAt: null, seen: 0, correct: 0, lapses: 0, lastSeenAt: null, recentMs: [] };
}

/** Median of a list of response times, or null when there are none. */
export function medianOf(values: readonly number[] | undefined): number | null {
  // A record written before response times were tracked has no recentMs at all,
  // and this is the only place the difference is visible.
  if (values === undefined || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  const lower = sorted[middle - 1];
  const upper = sorted[middle];
  if (lower === undefined || upper === undefined) return null;
  return (lower + upper) / 2;
}

/**
 * The clock's grade. `elapsedMs` null means the caller did not measure it, and
 * that is graded as an ordinary correct answer rather than a slow one: the game
 * must not punish a word for a missing stopwatch.
 */
export function gradeFor(elapsedMs: number | null, fastMs: number): Grade {
  if (elapsedMs === null) return 'good';
  if (elapsedMs <= fastMs) return 'instant';
  if (elapsedMs >= fastMs * REVIEW.slowFactor) return 'slow';
  return 'good';
}

/** The response times with a new sample appended, oldest dropped. */
function withSample(recent: readonly number[] | undefined, elapsedMs: number | null): readonly number[] {
  const kept = recent ?? [];
  if (elapsedMs === null) return kept;
  return [...kept, elapsedMs].slice(-REVIEW.medianWindow);
}

/**
 * Answered correctly: move up a box according to the grade and schedule the next
 * review. The two extra arguments are optional so that callers which do not time
 * their answers (and the tests for plain promotion) behave exactly as before.
 */
export function afterCorrect(
  prior: WordProgress | undefined,
  now: number,
  elapsedMs: number | null = null,
  fastMs: number = Number.POSITIVE_INFINITY,
): WordProgress {
  const base = prior ?? unseenProgress();
  const grade = gradeFor(elapsedMs, fastMs);
  const step = grade === 'instant' ? REVIEW.instantBoxes : grade === 'good' ? 1 : 0;
  const box = Math.min(base.box + step, REVIEW.boxWeights.length - 1);
  return {
    box,
    dueAt: now + intervalMs(box),
    seen: base.seen + 1,
    correct: base.correct + 1,
    lapses: base.lapses,
    lastSeenAt: now,
    recentMs: withSample(base.recentMs, elapsedMs),
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
    // A wrong answer says nothing about how fast the word is read correctly.
    recentMs: base.recentMs,
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

/**
 * How much the player needs to see this word again, as a number the selector
 * can weigh. Four things move it (docs/SRS-PROPOSAL.md 4.1):
 *
 *  - the box: an unseen or lapsed word is worth 8, a known one 0.75;
 *  - whether the review is due: twice the weight when it is, half when it is
 *    not, but only for a word that has been quizzed at all (an unseen word is
 *    already at the top of the list and must not be multiplied further);
 *  - speed: a word answered instantly and correctly thins out, a slow one comes
 *    back more;
 *  - lapses: a word that keeps beating the player earns extra board time
 *    instead of being suspended the way Anki suspends a leech.
 *
 * Never zero: nothing is retired. The floor is REVIEW.weightFloor.
 */
export function spawnWeight(progress: WordProgress | undefined, now: number, fastMs: number): number {
  const base = progress ?? unseenProgress();
  const boxIndex = Math.min(Math.max(base.box, 0), REVIEW.boxWeights.length - 1);
  const byBox = REVIEW.boxWeights[boxIndex] ?? REVIEW.boxWeights[0];

  const familiarity =
    base.seen === 0
      ? 1
      : base.dueAt !== null && base.dueAt <= now
        ? REVIEW.weightDueMultiplier
        : REVIEW.weightNotDueMultiplier;

  const median = medianOf(base.recentMs);
  const bySpeed =
    median === null
      ? 1
      : median <= fastMs
        ? REVIEW.weightFastMultiplier
        : median >= fastMs * REVIEW.slowFactor
          ? REVIEW.weightSlowMultiplier
          : 1;

  const byLapses = base.lapses >= REVIEW.leechLapses ? REVIEW.weightLeechMultiplier : 1;

  return Math.max(REVIEW.weightFloor, byBox * familiarity * bySpeed * byLapses);
}

/** True for a word the player has never answered, which is what the budget counts. */
export function isNewWord(progress: WordProgress | undefined): boolean {
  return progress === undefined || progress.seen === 0;
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
 *
 * It is a tiebreaker for the board, never a gate: the game must not refuse to
 * start because nothing is due (docs/SRS-PROPOSAL.md 6).
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