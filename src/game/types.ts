/** Shared vocabulary for the game layer. Pure types only: no React, no DOM. */

/** Word difficulty band. Derived from corpus frequency, never from HSK level. */
export type Band = 'common' | 'mid' | 'rare';

export const BANDS: readonly Band[] = ['common', 'mid', 'rare'];

export const BAND_LABELS: Record<Band, string> = {
  common: 'Common',
  mid: 'Mid',
  rare: 'Rare',
};

/** Fall speed and bubble count. Deliberately independent of Band (SPEC 4.3). */
export type Pace = 'chill' | 'normal' | 'rush';

export const PACES: readonly Pace[] = ['chill', 'normal', 'rush'];

export const PACE_LABELS: Record<Pace, string> = {
  chill: 'Chill',
  normal: 'Normal',
  rush: 'Rush',
};

export interface PaceSpec {
  /** Bubble count on the board at once. */
  readonly bubbleCount: number;
  /** Fall speed, in board-height fractions per second. */
  readonly speed: number;
  /**
   * Spawn offset between bubbles, in seconds. The board turns this into a
   * vertical gap so the entry reads as a diagonal cascade rather than a row of
   * bubbles arriving side by side.
   */
  readonly stagger: number;
}

export const PACE_SPECS: Record<Pace, PaceSpec> = {
  chill: { bubbleCount: 4, speed: 0.055, stagger: 0.55 },
  normal: { bubbleCount: 5, speed: 0.075, stagger: 0.45 },
  rush: { bubbleCount: 6, speed: 0.1, stagger: 0.35 },
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

export interface SessionSettings {
  readonly decks: readonly string[];
  readonly bands: readonly Band[];
  readonly pace: Pace;
  readonly pinyin: boolean;
  readonly sound: boolean;
}

export const DEFAULT_SETTINGS: SessionSettings = {
  decks: ['hsk-1'],
  bands: [...BANDS],
  pace: 'normal',
  // On by default, the owner's call on 2026-10-07 and what the POC did. The
  // toggle still turns it off; it just no longer starts off, because a beginner
  // reading a Hanzi they have never seen has nothing to hold on to.
  pinyin: true,
  sound: true,
};

export const SOLO_DECK_MIN_WORDS = 30;