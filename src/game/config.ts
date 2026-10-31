/**
 * Session shape and reward constants. Every number here is a decision recorded
 * in docs/SPEC.md section 1.5 and 1.7; changing one changes the product.
 */

export const SESSION = {
  /** A session ends after this many correct answers. */
  correctToFinish: 15,
  /**
   * ...or after this much playing time, whichever comes first. The default run
   * is 3 minutes; Settings offers 2 (short) and 5 (long) as well. The table
   * itself is LENGTH_MS in ./types, which is the one place the figures live, so
   * this line is only the default and history.
   *
   * It was 90 s until 2026-10-31 (Jim). The old figure was sized for a 15-answer
   * session, and a 3-minute run now gives a beginner room to read rather than
   * race. Nothing ends a run except the clock: a fast player keeps answering.
   */
  timeLimitMs: 3 * 60_000,
  /**
   * The clock for each length, keyed by the Settings choice. This is the table
   * the game reads; timeLimitMs above is kept only as the default and as the
   * history of what the number used to be. LENGTH_MS in ./types is for display.
   */
  lengthsMs: { short: 2 * 60_000, default: 3 * 60_000, long: 5 * 60_000 } as const,
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
   * How fast a correct answer has to be, relative to the player's own baseline
   * click time, to count as instant. Speed is judged against the player, not
   * against a fixed millisecond figure (Jim, 2026-10-31): a fixed threshold
   * graded a fast reader the same as a slow one.
   */
  instantFactor: 0.85,
  /** A correct answer this many times slower than the baseline counts as slow. */
  slowFactor: 2,
  /**
   * Response times that build the player's baseline, and how few is too few to
   * have one. Five samples is enough for a median to be stable and few enough
   * that a player has a baseline inside the first minute of play.
   */
  baselineWindow: 20,
  baselineMinSamples: 5,
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
  /**
   * The floor of the fast case. A word tapped at half the player's baseline
   * lands near this, so it comes up rarely but never vanishes; weightFloor below
   * is the hard stop that applies after the box and due multipliers.
   */
  weightFastFloor: 0.3,
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