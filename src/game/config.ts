/**
 * Session shape and reward constants. Every number here is a decision recorded
 * in docs/SPEC.md section 1.5 and 1.7; changing one changes the product.
 */

export const SESSION = {
  /** A session ends after this many correct answers. */
  correctToFinish: 15,
  /** ...or after this much playing time, whichever comes first. */
  timeLimitMs: 90_000,
  /** A wrong tap costs time, not points (the session must stay winnable). */
  wrongPenaltyMs: 2_000,
  /** Points are a scoreboard, not a gate. */
  pointsPerCorrect: 10,
  /** Combo multiplier caps here, so the score stays comparable between runs. */
  comboCap: 5,
  /** Distractors visible per round, including the target. */
  choicesMin: 3,
  /** Soft cap on items in one session's queue. */
  queueCap: 20,
} as const;

export const REVIEW = {
  /** Leitner intervals, in minutes: 10 min / 1 day / 3 days / 7 days / 21 days. */
  intervalsMinutes: [10, 60 * 24, 60 * 24 * 3, 60 * 24 * 7, 60 * 24 * 21],
  /** A lapse drops the word to box 0 rather than removing progress. */
  lapseBox: 0,
  /** Boxes at or above this count as known in the mastery meters. */
  knownBox: 3,
  /** Box at or above this counts as learning rather than unseen. */
  learningBox: 0,
} as const;

export const STORAGE_KEYS = {
  progress: 'mb.progress.v1',
  session: 'mb.session.v1',
  settings: 'mb.settings.v1',
} as const;