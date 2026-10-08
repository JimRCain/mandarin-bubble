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
 *
 * The board is PERSISTENT, and that is the POC's mechanic (docs/POC-MECHANICS.md,
 * port order): a fixed set of bubbles stays in play for the whole session, a
 * correct tap pops one of them and the target hops to another one already on the
 * board, and spawns refill free lanes on their own timer. Nothing is ever
 * re-dealt. sync() is therefore the only way the board changes: the session
 * decides WHICH ids are up, this class decides WHERE they are.
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
  speed: 1 / 35,
  // A sane fraction for direct construction; boardConfigFor() passes the pace's
  // own figure through. One bubble's worth of the POC's STAGGER_Y.
  stagger: 0.08,
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

  /**
   * Makes the board's contents equal the given id list: ids that are new are
   * dealt, ids that are gone are dropped, and ids that stay keep their lane and
   * their height. The session owns the list (see the note at the top of the
   * file), so this is the one place a bubble appears or disappears.
   *
   * New bubbles enter ON SCREEN, staggered down the board by `config.stagger`,
   * which is the POC's behaviour: it dealt at fixed slot positions inside the
   * board and never above it, so nothing untappable is ever dealt. Each new
   * bubble takes a free lane in random order, so a refilled bubble does not
   * always arrive in the same column.
   */
  sync(wordIds: readonly string[]): void {
    const wanted = new Set(wordIds);
    this.items = this.items.filter((item) => wanted.has(item.wordId));

    const present = new Set(this.items.map((item) => item.wordId));
    const added = wordIds.filter((wordId) => !present.has(wordId));
    if (added.length === 0) return;

    const lanes = this.rng.shuffle(this.freeLanes());
    for (const [index, wordId] of added.entries()) {
      const lane = lanes[index];
      // A full board cannot happen through the session (it never holds more ids
      // than there are lanes), but a stray id must not become an unpositioned
      // bubble drawing on top of another: leave it out instead.
      if (lane === undefined) return;
      this.items.push({ wordId, lane, y: this.config.stagger * index });
    }
  }

  /** A lane with no bubble in it, which is where a refill can land. */
  hasFreeLane(): boolean {
    return this.items.length < Math.max(this.config.bubbleCount, 1);
  }

  /** Lanes with no bubble, left to right. */
  private freeLanes(): number[] {
    const occupied = new Set(this.items.map((item) => item.lane));
    const lanes: number[] = [];
    for (let lane = 0; lane < Math.max(this.config.bubbleCount, 1); lane++) {
      if (!occupied.has(lane)) lanes.push(lane);
    }
    return lanes;
  }

  /** Advances every bubble. `dtMs` comes from the injected clock only. */
  step(dtMs: number): void {
    if (dtMs <= 0) return;
    const dy = (this.config.speed * dtMs) / 1000;
    for (const item of this.items) {
      item.y += dy;
      if (item.y >= this.config.wrapAt) {
        // Back to the top, in a free lane when there is one. The POC pins the
        // bubble above the wrap line when every lane is taken, which stalls the
        // wrap that SPEC 1.3 promises; here a full board trades lanes with
        // another bubble instead, so the bubble always returns to the top and
        // lanes stay unique (the spacing guarantee, and the no-overlap tests).
        const lanes = this.freeLanes();
        if (lanes.length > 0) {
          item.lane = this.rng.pick(lanes);
        } else {
          const other = this.rng.pick(this.items);
          const lane = other.lane;
          other.lane = item.lane;
          item.lane = lane;
        }
        item.y = 0;
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