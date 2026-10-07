/**
 * The falling-bubble field.
 *
 * Deliberately NOT React state (SPEC 7): positions live in this object and are
 * written to the DOM by the caller's rAF loop, so React re-renders only on
 * discrete events (score, target, phase). Hit-testing reads the same positions
 * the loop writes, so a tap can never disagree with what the player sees.
 *
 * The wrap is the product decision, not a bug (SPEC 1.3): a bubble that reaches
 * the wrap line is teleported to a random slot at the top. Nothing is lost, so
 * there is no miss and no lose condition; pressure comes from the clock.
 */

import type { Rng } from './rng';

export interface BoardConfig {
  /** Number of bubbles on the board at once. */
  readonly bubbleCount: number;
  /** Fall speed as a fraction of board height per second. */
  readonly speed: number;
  /** Vertical gap between spawns, as a fraction of board height. */
  readonly stagger: number;
  /** Fraction of board height at which a bubble wraps to the top. */
  readonly wrapAt: number;
  /** Bubble radius as a fraction of board WIDTH (hit tests use the same unit). */
  readonly radius: number;
}

export const DEFAULT_BOARD: BoardConfig = {
  bubbleCount: 5,
  speed: 0.075,
  stagger: 0.25,
  wrapAt: 0.8,
  radius: 0.11,
};

export interface BubblePos {
  readonly wordId: string;
  /** Centre X as a fraction of width, 0..1, left to right. */
  readonly x: number;
  /** Centre Y as a fraction of height, 0..1, top to bottom. */
  readonly y: number;
}

const MIN_X = 0.14;
const MAX_X = 0.86;

export class BubbleField {
  private readonly config: BoardConfig;
  private readonly rng: Rng;
  private items: { wordId: string; x: number; y: number }[] = [];

  constructor(config: BoardConfig, rng: Rng) {
    this.config = config;
    this.rng = rng;
  }

  /** Replaces the board with a fresh set of bubbles for a new round. */
  reset(wordIds: readonly string[]): void {
    const slots = this.rng.shuffle(wordIds.map((_, index) => index));
    this.items = wordIds.map((wordId, index) => {
      const slot = slots[index] ?? index;
      const laneWidth = (MAX_X - MIN_X) / Math.max(wordIds.length, 1);
      return {
        wordId,
        x: MIN_X + laneWidth * (slot + 0.5),
        // Stagger entry so the board fills from the top instead of popping in
        // all at once; the last bubble starts just above the board.
        y: -0.06 - this.config.stagger * index,
      };
    });
  }

  /** Advances every bubble. `dtMs` comes from the injected clock only. */
  step(dtMs: number): void {
    if (dtMs <= 0) return;
    const dy = (this.config.speed * dtMs) / 1000;
    for (const item of this.items) {
      item.y += dy;
      if (item.y >= this.config.wrapAt) {
        item.y = -0.06;
        const lane = this.rng.next();
        item.x = MIN_X + (MAX_X - MIN_X) * lane;
      }
    }
  }

  /** Removes a bubble, e.g. after it was answered. */
  pop(wordId: string): void {
    this.items = this.items.filter((item) => item.wordId !== wordId);
  }

  bubbles(): BubblePos[] {
    return this.items.map((item) => ({ wordId: item.wordId, x: item.x, y: item.y }));
  }

  get size(): number {
    return this.items.length;
  }

  has(wordId: string): boolean {
    return this.items.some((item) => item.wordId === wordId);
  }

  /**
   * Topmost bubble under a tap, in the same fraction space the DOM writes.
   * `radiusScale` lets a touch target stay finger-sized on a small board.
   */
  hitTest(x: number, y: number, radiusScale = 1): string | null {
    const radius = this.config.radius * radiusScale;
    let best: { wordId: string; distance: number } | null = null;
    for (const item of this.items) {
      const dx = (item.x - x) * 0.6; // a bubble is taller than it is wide is false: keep x weight gentle
      const distance = Math.hypot(dx, item.y - y);
      if (distance <= radius && (!best || distance < best.distance)) {
        best = { wordId: item.wordId, distance };
      }
    }
    return best?.wordId ?? null;
  }
}