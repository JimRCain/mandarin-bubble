/** Shared vocabulary for the game layer. Pure types only: no React, no DOM. */

/** Word difficulty band. Derived from corpus frequency, never from HSK level. */
export type Band = 'common' | 'mid' | 'rare';

export const BANDS: readonly Band[] = ['common', 'mid', 'rare'];

export const BAND_LABELS: Record<Band, string> = {
  common: 'Common',
  mid: 'Mid',
  rare: 'Rare',
};

/**
 * How crowded the board is: bubble count, and therefore lane count.
 *
 * The modes used to set the fall speed too, and no longer do (Jim, 2026-10-12).
 * All three fall at the same rate, so the choice a player makes here is "how many
 * words are on screen at once" and not "how little time do I get to read them".
 * Deliberately independent of Band, which is about the words (SPEC 4.3).
 *
 * The board is no longer a fixed number of bubbles for the session (Jim,
 * 2026-10-31): a correct tap pops one and deals the replacement at once, so the
 * board holds this many at once while a fast player cycles through many more. The
 * mode is therefore a board WIDTH, not a count per run.
 */
export type Pace = 'chill' | 'normal' | 'hard';

export const PACES: readonly Pace[] = ['chill', 'normal', 'hard'];

export const PACE_LABELS: Record<Pace, string> = {
  chill: 'Chill',
  normal: 'Normal',
  hard: 'Hard',
};

export interface PaceSpec {
  /**
   * Bubble count on the board at once; also the number of lanes. The only figure
   * that differs between the modes, and its ceiling is deliberate: 5 bubbles is
   * the widest board this ships. The POC went to 6, and 6 lanes on a 390 px phone
   * is precisely the crowding Jim reported (docs/POC-MECHANICS.md, "Bubble size"),
   * so `hard` stops one short of the layout that caused the complaint.
   */
  readonly bubbleCount: number;
  /**
   * Fall speed in board-height fractions per second, and the SAME in all three
   * modes: one bubble crosses the board height in 35 s, the POC's medium figure
   * (docs/POC-MECHANICS.md). It is still far slower than the build Jim played on
   * 2026-10-07 (18/13/10 s per height), which felt rushed, and it stays one value
   * because a speed that moved with the mode would turn the modes back into a
   * reflex test: the POC has no clock, so its fall is the only pressure it
   * applies, and ours gets its pressure from the session clock instead.
   */
  readonly speed: number;
  /**
   * Vertical offset between bubbles that enter the board together, as a fraction
   * of board height. Bubbles now appear on screen rather than cascading in from
   * above (docs/POC-MECHANICS.md), so this is a straight fraction, not seconds:
   * the POC's STAGGER_Y steps by 0.08 per bubble over the top 40% of the board.
   * The board turns the count into lanes and this into the staggered entry.
   */
  readonly stagger: number;
}

/**
 * One row per mode. Read down the `bubbleCount` column and the `speed` column
 * looks like a mistake, so it is worth saying plainly: the speeds are identical
 * on purpose (Jim, 2026-10-12). 3 / 4 / 5 bubbles is the whole difference.
 */
export const PACE_SPECS: Record<Pace, PaceSpec> = {
  chill: { bubbleCount: 3, speed: 1 / 35, stagger: 0.08 },
  normal: { bubbleCount: 4, speed: 1 / 35, stagger: 0.08 },
  hard: { bubbleCount: 5, speed: 1 / 35, stagger: 0.08 },
};

export interface Word {
  readonly id: string;
  readonly hanzi: string;
  readonly pinyin: string;
  readonly english: string;
  readonly band: Band;
  readonly zipf: number;
  readonly sharedGloss?: boolean;
  readonly sharedHanzi?: boolean;
}

/** A word plus where it can be found, after cross-deck deduplication (SPEC 4.2). */
export interface PoolWord extends Word {
  readonly decks: readonly string[];
}

export interface DeckMeta {
  readonly id: string;
  readonly name: string;
  readonly group: string;
  readonly order: number;
  readonly entries: number;
  readonly uniqueWords: number;
  readonly bands: Record<Band, number>;
  readonly usableBands: number;
}

export interface ContentIndex {
  readonly contentVersion: number;
  readonly generatedBy: string;
  readonly totals: {
    readonly decks: number;
    readonly entries: number;
    readonly duplicateEntries: number;
    readonly uniqueWords: number;
    readonly bands: Record<Band, number>;
  };
  readonly decks: readonly DeckMeta[];
}

/**
 * Where the player is in one session. There is no 'exposure' phase: the owner
 * removed the first-sight teaching card on 2026-10-07 (docs/SPEC.md §1.6).
 */
export type SessionPhase = 'playing' | 'summary';

/** A visible bubble. Position is engine-owned; React never re-renders per frame. */
export interface Bubble {
  readonly wordId: string;
  /** Horizontal centre, as a fraction of board width. */
  x: number;
  /** Vertical centre, as a fraction of board height. */
  y: number;
}

/** Session length. Default is the 90 s run the product shipped with; Jim added
 * the two-minute and five-minute choices on 2026-10-31 so a session can be a
 * quick coffee break or a real sitting. Length is a preference, so it lives on
 * SessionSettings; the clock itself stays in SESSION.lengthsMs.
 */
export type Length = 'short' | 'default' | 'long';

export const LENGTHS: readonly Length[] = ['short', 'default', 'long'];

export const LENGTH_LABELS: Record<Length, string> = {
  short: 'Short',
  default: 'Default',
  long: 'Long',
};

/** One line per mode, shown under the label in Settings and on Home. */
export const LENGTH_MS: Record<Length, number> = {
  short: 2 * 60_000,
  default: 3 * 60_000,
  long: 5 * 60_000,
};

export interface SessionSettings {
  readonly decks: readonly string[];
  readonly bands: readonly Band[];
  readonly pace: Pace;
  readonly length: Length;
  readonly pinyin: boolean;
  readonly sound: boolean;
}

export const DEFAULT_SETTINGS: SessionSettings = {
  decks: ['hsk-1'],
  bands: [...BANDS],
  pace: 'normal',
  length: 'default',
  // On by default, the owner's call on 2026-10-07 and what the POC did. The
  // toggle still turns it off; it just no longer starts off, because a beginner
  // reading a Hanzi they have never seen has nothing to hold on to.
  pinyin: true,
  sound: true,
};

export const SOLO_DECK_MIN_WORDS = 30;