import { describe, expect, it } from 'vitest';
import { BubbleField, DEFAULT_BOARD, bubbleRadiusFor } from '../src/game/board';
import { createRng } from '../src/game/rng';
import { PACES, PACE_SPECS } from '../src/game/types';

/**
 * The bubble counts the shipped modes actually use, read from PACE_SPECS rather
 * than written out here. The modes changed once already (4/5/6 became 3/4/5 on
 * 2026-10-12) and a hard-coded list is exactly what would let these tests keep
 * passing against layouts that no longer ship.
 */
const SHIPPED_COUNTS = [...new Set(PACES.map((pace) => PACE_SPECS[pace].bubbleCount))];

/** Smallest horizontal gap between any two bubbles; the overlap measure. */
function closestPair(bubbles: readonly { x: number }[]): number {
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < bubbles.length; i += 1) {
    for (let j = i + 1; j < bubbles.length; j += 1) {
      min = Math.min(min, Math.abs((bubbles[i]?.x ?? 0) - (bubbles[j]?.x ?? 0)));
    }
  }
  return min;
}

describe('BubbleField', () => {
  it('syncs one bubble per word, inside the playable width', () => {
    const board = new BubbleField(DEFAULT_BOARD, createRng(1));
    board.sync(['a', 'b', 'c', 'd', 'e']);
    const bubbles = board.bubbles();
    expect(bubbles).toHaveLength(5);
    expect(new Set(bubbles.map((b) => b.wordId)).size).toBe(5);
    for (const bubble of bubbles) {
      expect(bubble.x).toBeGreaterThan(0);
      expect(bubble.x).toBeLessThan(1);
      expect(bubble.y).toBeGreaterThanOrEqual(0); // Now on-screen, not above
    }
  });

  it('falls at the configured speed, measured from an injected delta only', () => {
    const board = new BubbleField({ ...DEFAULT_BOARD, speed: 0.1 }, createRng(2));
    board.sync(['a']);
    const start = board.bubbles()[0];
    expect(start).toBeDefined();
    board.step(1000);
    const after = board.bubbles()[0];
    expect(after?.y).toBeCloseTo((start?.y ?? 0) + 0.1, 10);
  });

  it('wraps a bubble to the top instead of removing it (SPEC 1.3)', () => {
    const board = new BubbleField({ ...DEFAULT_BOARD, speed: 1, wrapAt: 0.8 }, createRng(3));
    board.sync(['a']);
    expect(board.size).toBe(1);
    board.step(1000);
    const wrapped = board.bubbles()[0];
    expect(board.size).toBe(1);
    expect(wrapped?.wordId).toBe('a');
    // Teleported to a lane at the top, not stuck on the wrap line.
    expect(wrapped?.y).toBeLessThan(0.8); // Should be at the top or pinned
    expect(wrapped?.x).toBeGreaterThan(0);
    expect(wrapped?.x).toBeLessThan(1);
  });

  it('ignores zero and negative deltas, so a paused frame cannot move the board', () => {
    const board = new BubbleField({ ...DEFAULT_BOARD, speed: 0.5 }, createRng(4));
    board.sync(['a', 'b']);
    const before = board.bubbles();
    board.step(0);
    board.step(-500);
    expect(board.bubbles()).toEqual(before);
  });

  it('hit-tests the nearest bubble and nothing outside the radius', () => {
    const board = new BubbleField({ ...DEFAULT_BOARD, radius: 0.1 }, createRng(5));
    board.sync(['a', 'b']);
    const bubble = board.bubbles()[0];
    expect(bubble).toBeDefined();
    if (!bubble) return;
    expect(board.hitTest(bubble.x, bubble.y)).toBe(bubble.wordId);
    expect(board.hitTest(bubble.x + 0.5, bubble.y + 0.5)).toBeNull();
  });

  it('pops a bubble without disturbing the others', () => {
    const board = new BubbleField(DEFAULT_BOARD, createRng(6));
    board.sync(['a', 'b', 'c']);
    board.pop('b');
    expect(board.size).toBe(2);
    expect(board.has('b')).toBe(false);
    expect(board.has('a')).toBe(true);
  });

  it('produces the same layout for the same seed and a different one otherwise', () => {
    const one = new BubbleField(DEFAULT_BOARD, createRng(9));
    one.sync(['a', 'b', 'c']);
    const two = new BubbleField(DEFAULT_BOARD, createRng(9));
    two.sync(['a', 'b', 'c']);
    const three = new BubbleField(DEFAULT_BOARD, createRng(10));
    three.sync(['a', 'b', 'c']);
    expect(one.bubbles()).toEqual(two.bubbles());
    expect(one.bubbles()).not.toEqual(three.bubbles());
  });
});

/**
 * The owner's report: "the bubbles are too dense, they overlap one another".
 * They overlapped because a lane was narrower than a bubble and a wrapped bubble
 * drew a fresh random x. Both are engine facts, so they are engine tests.
 */
describe('spacing: bubbles never overlap', () => {
  it.each(SHIPPED_COUNTS)('gives %i bubbles a lane each, with air between them', (count) => {
    const config = { ...DEFAULT_BOARD, bubbleCount: count, radius: bubbleRadiusFor(count) };
    const board = new BubbleField(config, createRng(11));
    board.sync(['a', 'b', 'c', 'd', 'e', 'f'].slice(0, count));

    const bubbles = board.bubbles();
    expect(bubbles).toHaveLength(count);
    // A gap of at least a diameter means no two circles can touch.
    expect(closestPair(bubbles)).toBeGreaterThanOrEqual(2 * config.radius);
    for (const bubble of bubbles) {
      expect(bubble.x - config.radius).toBeGreaterThan(0);
      expect(bubble.x + config.radius).toBeLessThan(1);
    }
  });

  it('keeps them apart after many wraps instead of piling them up', () => {
    const config = {
      ...DEFAULT_BOARD,
      bubbleCount: 4,
      radius: bubbleRadiusFor(4),
      speed: 1,
      wrapAt: 0.2,
    };
    const board = new BubbleField(config, createRng(12));
    board.sync(['a', 'b', 'c', 'd']);

    for (let step = 0; step < 200; step += 1) {
      board.step(1000);
      expect(closestPair(board.bubbles())).toBeGreaterThanOrEqual(2 * config.radius);
    }
  });

  it('never separates two bubbles by less than the tap radius', () => {
    // A tap resolves against the drawn circle, so lanes must be wider than a
    // bubble or one tap can mean two answers.
    for (const count of SHIPPED_COUNTS) {
      const config = { ...DEFAULT_BOARD, bubbleCount: count, radius: bubbleRadiusFor(count) };
      const board = new BubbleField(config, createRng(13));
      board.sync(['a', 'b', 'c', 'd', 'e', 'f'].slice(0, count));
      const [first, second] = board.bubbles();
      if (!first || !second) throw new Error('need at least two bubbles');
      expect(board.hitTest(first.x, first.y)).toBe(first.wordId);
      expect(board.hitTest(second.x, second.y)).toBe(second.wordId);
      // The midpoint between two lanes answers to neither of them, never to both.
      expect(board.hitTest((first.x + second.x) / 2, first.y)).toBeNull();
    }
  });
});

describe('sync functionality', () => {
  it('syncs adds new bubbles and removes old ones', () => {
    const board = new BubbleField(DEFAULT_BOARD, createRng(1));
    
    // Initial sync
    board.sync(['a', 'b', 'c']);
    expect(board.size).toBe(3);
    expect(board.has('a')).toBe(true);
    expect(board.has('b')).toBe(true);
    expect(board.has('c')).toBe(true);
    
    // Sync with different set
    board.sync(['b', 'c', 'd', 'e']);
    expect(board.size).toBe(4);
    expect(board.has('a')).toBe(false); // Removed
    expect(board.has('b')).toBe(true);  // Kept
    expect(board.has('c')).toBe(true);  // Kept
    expect(board.has('d')).toBe(true);  // Added
    expect(board.has('e')).toBe(true);  // Added
  });

  it('hasFreeLane indicates if there are available lanes', () => {
    const config = { ...DEFAULT_BOARD, bubbleCount: 3 };
    const board = new BubbleField(config, createRng(1));
    
    // Initially has free lanes
    expect(board.hasFreeLane()).toBe(true);
    
    // Add bubbles up to capacity
    board.sync(['a', 'b', 'c']);
    expect(board.hasFreeLane()).toBe(false); // No free lanes
    
    // Remove one bubble
    board.pop('b');
    expect(board.hasFreeLane()).toBe(true); // Has free lane now
  });

  it('returns a wrapped bubble to the top even when every lane is taken', () => {
    // The POC pinned the bubble just above the wrap line here, which stalls the
    // wrap that SPEC 1.3 promises; ours swaps lanes with another bubble instead.
    const config = { ...DEFAULT_BOARD, bubbleCount: 2, wrapAt: 0.8, speed: 1 };
    const board = new BubbleField(config, createRng(1));
    board.sync(['a', 'b']);
    expect(board.hasFreeLane()).toBe(false);

    board.step(1000);

    const bubbles = board.bubbles();
    expect(bubbles).toHaveLength(2);
    for (const bubble of bubbles) expect(bubble.y).toBeLessThan(config.wrapAt);
    // Swapping lanes must not put two bubbles in one lane: the x values differ.
    expect(new Set(bubbles.map((bubble) => bubble.x)).size).toBe(2);
  });

  it('deals a new bubble on screen, below the ones already up', () => {
    // Nothing is ever dealt above the board: the POC dealt at fixed slot
    // positions inside it, and a bubble off-screen cannot be tapped.
    const board = new BubbleField({ ...DEFAULT_BOARD, stagger: 0.1 }, createRng(21));
    board.sync(['a', 'b', 'c']);
    const ys = board.bubbles().map((bubble) => bubble.y);
    expect(ys).toEqual([0, 0.1, 0.2]);
    expect(Math.max(...ys)).toBeLessThan(DEFAULT_BOARD.wrapAt);
  });

  it('keeps a bubble that stays on the board where it was', () => {
    // Only the ids that changed may be dealt or dropped; a refill landing next to
    // a falling bubble must not teleport it.
    const board = new BubbleField(DEFAULT_BOARD, createRng(22));
    board.sync(['a', 'b']);
    board.step(500);
    const before = board.bubbles().find((bubble) => bubble.wordId === 'a');
    board.sync(['a', 'c']);
    const after = board.bubbles().find((bubble) => bubble.wordId === 'a');
    expect(after).toEqual(before);
  });
});