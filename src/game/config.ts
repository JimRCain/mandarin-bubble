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
  /**
   * How long a correct answer may take and still count as instant, per pace.
   * This is the game's stand-in for Anki's Easy button: there are no buttons
   * here, so the clock grades the answer. Longer for the slow paces, because a
   * bubble that takes 35 s to cross the board is not meant to be read at speed.
   */
  fastMs: { chill: 2500, normal: 1800, rush: 1300 },
  /** A correct answer this many times slower than fastMs counts as slow. */
  slowFactor: 2,
  /** Boxes gained by an instant correct answer. An ordinary one gains 1. */
  instantBoxes: 2,
  /** Response times kept per word. The median of these is the word's speed. */
  medianWindow: 5,
  /** Correct response times that may sit on one board without having been quizzed. */
  newPerBoard: 1,
  /** Lapses after which a word becomes sticky and earns board space. */
  leechLapses: 4,
  /**
   * Spawn weight by box: how much more likely a word is to be dealt than a word
   * of weight 1. A known word is never zero, it just thins out. The multipliers
   * below compound on top of this (docs/SRS-PROPOSAL.md 4.1).
   */
  boxWeights: [8, 6, 4, 2, 0.75],
  weightDueMultiplier: 2,
  weightNotDueMultiplier: 0.5,
  weightFastMultiplier: 0.5,
  weightSlowMultiplier: 1.6,
  weightLeechMultiplier: 1.5,
  /** Nothing is ever fully retired: this is the floor of the product of weights. */
  weightFloor: 0.25,
} as const;

export const STORAGE_KEYS = {
  progress: 'mb.progress.v1',
  session: 'mb.session.v1',
  settings: 'mb.settings.v1',
} as const;