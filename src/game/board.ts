/**
 * The falling-bubble field.
 *
 * Deliberately NOT React state (SPEC 7): positions live in this object and are
 * written to the DOM by the caller's rAF loop, so React re-renders only on
 * discrete events (score, target, phase). Hit-testing reads the same positions
 * the loop writes, so a tap can never disagree with what the player sees.
 *
 * Layout is ONE BUBBLE PER LANE. Lanes are as wide as a bubble plus air, so two
 * bubbles can never overlap while both are in play. That is not cosmetic: the
 * tap test resolves against these positions, and bubbles drawn on top of each
 * other turn two answers into one target. A wrapping bubble therefore swaps
 * lanes with another bubble rather than drawing a fresh random x, which is what
 * an earlier version did and what let the field collapse into a pile.
 *
 * The wrap is the product decision, not a bug (SPEC 1.3): a bubble that reaches
 * the wrap line is teleported to a lane at the top. Nothing is lost, so there is
 * no miss and no lose condition; pressure comes from the clock.
 */

import type { Rng } from './rng';

export interface BoardConfig {
  /** Number of bubbles on the board at once; also the number of lanes. */
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

/** Air left between neighbouring lanes, as a fraction of a lane's width. */
export const LANE_AIR = 0.2;

/** Clear margin at the board's left and right edges, as a fraction of width. */
export const EDGE_GUTTER = 0.015;

/**
 * The largest radius that still fits `count` lanes of bubbles with `LANE_AIR`
 * between them. The lane width depends on the radius and the radius must fit
 * inside the lane, so this solves the one-step equation rather than picking a
 * number and hoping: drawing, hit test and spacing all read this value.
 */
export function bubbleRadiusFor(count: number): number {
  const k = (1 - LANE_AIR) / (2 * Math.max(count, 1));
  return (k * (1 - 2 * EDGE_GUTTER)) / (1 + 2 * k);
}

/** Width of one lane, as a fraction of board width. */
export function laneWidthFor(config: BoardConfig): number {
  return (1 - 2 * config.radius - 2 * EDGE_GUTTER) / Math.max(config.bubbleCount, 1);
}

/** Centre of every lane, left to right, as fractions of board width. */
export function laneCentres(config: BoardConfig): number[] {
  const minX = config.radius + EDGE_GUTTER;
  const width = laneWidthFor(config);
  return Array.from({ length: Math.max(config.bubbleCount, 1) }, (_, lane) => minX + width * (lane + 0.5));
}

export const DEFAULT_BOARD: BoardConfig = {
  bubbleCount: 5,
  speed: 0.075,
  // A sane fraction for direct construction; boardConfigFor() derives it from a
  // pace's spawn offset in seconds (stagger seconds x fall speed).
  stagger: 0.03,
  wrapAt: 0.8,
  radius: bubbleRadiusFor(5),
};

export interface BubblePos {
  readonly wordId: string;
  /** Centre X as a fraction of width, 0..1, left to right. */
  readonly x: number;
  /** Centre Y as a fraction of height, 0..1, top to bottom. */
  readonly y: number;
}

export class BubbleField {
  private readonly config: BoardConfig;
  private readonly rng: Rng;
  /**
   * One entry per bubble. `lane` is unique across the list at all times, which
   * is the whole spacing guarantee; x is derived from it when asked for.
   */
  private items: { wordId: string; lane: number; y: number }[] = [];

  constructor(config: BoardConfig, rng: Rng) {
    this.config = config;
    this.rng = rng;
  }

  /** Replaces the board with a fresh set of bubbles for a new round. */
  reset(wordIds: readonly string[]): void {
    const lanes = this.rng.shuffle(
      Array.from({ length: Math.max(this.config.bubbleCount, 1) }, (_, lane) => lane),
    );
    this.items = wordIds.map((wordId, index) => ({
      wordId,
      lane: lanes[index % lanes.length] ?? index,
      // Stagger entry so the board fills from the top instead of popping in all
      // at once; the last bubble starts just above the board.
      y: -0.06 - this.config.stagger * index,
    }));
  }

  /** Advances every bubble. `dtMs` comes from the injected clock only. */
  step(dtMs: number): void {
    if (dtMs <= 0) return;
    const dy = (this.config.speed * dtMs) / 1000;
    for (const item of this.items) {
      item.y += dy;
      if (item.y >= this.config.wrapAt) {
        item.y = -0.06;
        // Trade lanes rather than drawing a new x: lanes stay unique, so a
        // wrapped bubble can arrive beside another but never on top of it.
        const other = this.rng.pick(this.items);
        const lane = other.lane;
        other.lane = item.lane;
        item.lane = lane;
      }
    }
  }

  /** Removes a bubble, e.g. after it was answered. */
  pop(wordId: string): void {
    this.items = this.items.filter((item) => item.wordId !== wordId);
  }

  bubbles(): BubblePos[] {
    const centres = laneCentres(this.config);
    return this.items.map((item) => ({
      wordId: item.wordId,
      x: centres[item.lane] ?? 0.5,
      y: item.y,
    }));
  }

  get size(): number {
    return this.items.length;
  }

  has(wordId: string): boolean {
    return this.items.some((item) => item.wordId === wordId);
  }

  /**
   * Topmost bubble under a tap, in the same fraction space the DOM writes.
   * The tap target is the bubble the player can see: a circle of the drawn
   * radius, not an ellipse stretched across a neighbour's lane.
   */
  hitTest(x: number, y: number, radiusScale = 1): string | null {
    const radius = this.config.radius * radiusScale;
    const centres = laneCentres(this.config);
    let best: { wordId: string; distance: number } | null = null;
    for (const item of this.items) {
      const dx = (centres[item.lane] ?? 0.5) - x;
      const distance = Math.hypot(dx, item.y - y);
      if (distance <= radius && (!best || distance < best.distance)) {
        best = { wordId: item.wordId, distance };
      }
    }
    return best?.wordId ?? null;
  }
}