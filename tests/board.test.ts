import { describe, expect, it } from 'vitest';
import { BubbleField, DEFAULT_BOARD, bubbleRadiusFor } from '../src/game/board';
import { createRng } from '../src/game/rng';

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
  it('spawns one bubble per word, inside the playable width', () => {
    const board = new BubbleField(DEFAULT_BOARD, createRng(1));
    board.reset(['a', 'b', 'c', 'd', 'e']);
    const bubbles = board.bubbles();
    expect(bubbles).toHaveLength(5);
    expect(new Set(bubbles.map((b) => b.wordId)).size).toBe(5);
    for (const bubble of bubbles) {
      expect(bubble.x).toBeGreaterThan(0);
      expect(bubble.x).toBeLessThan(1);
      expect(bubble.y).toBeLessThan(0);
    }
  });

  it('falls at the configured speed, measured from an injected delta only', () => {
    const board = new BubbleField({ ...DEFAULT_BOARD, speed: 0.1 }, createRng(2));
    board.reset(['a']);
    const start = board.bubbles()[0];
    expect(start).toBeDefined();
    board.step(1000);
    const after = board.bubbles()[0];
    expect(after?.y).toBeCloseTo((start?.y ?? 0) + 0.1, 10);
  });

  it('wraps a bubble to the top instead of removing it (SPEC 1.3)', () => {
    const board = new BubbleField({ ...DEFAULT_BOARD, speed: 1, wrapAt: 0.8 }, createRng(3));
    board.reset(['a']);
    expect(board.size).toBe(1);
    board.step(1000);
    const wrapped = board.bubbles()[0];
    expect(board.size).toBe(1);
    expect(wrapped?.wordId).toBe('a');
    // Teleported to a lane at the top, not stuck on the wrap line.
    expect(wrapped?.y).toBeLessThan(0);
    expect(wrapped?.x).toBeGreaterThan(0);
    expect(wrapped?.x).toBeLessThan(1);
  });

  it('ignores zero and negative deltas, so a paused frame cannot move the board', () => {
    const board = new BubbleField({ ...DEFAULT_BOARD, speed: 0.5 }, createRng(4));
    board.reset(['a', 'b']);
    const before = board.bubbles();
    board.step(0);
    board.step(-500);
    expect(board.bubbles()).toEqual(before);
  });

  it('hit-tests the nearest bubble and nothing outside the radius', () => {
    const board = new BubbleField({ ...DEFAULT_BOARD, radius: 0.1 }, createRng(5));
    board.reset(['a', 'b']);
    const bubble = board.bubbles()[0];
    expect(bubble).toBeDefined();
    if (!bubble) return;
    expect(board.hitTest(bubble.x, bubble.y)).toBe(bubble.wordId);
    expect(board.hitTest(bubble.x + 0.5, bubble.y + 0.5)).toBeNull();
  });

  it('pops a bubble without disturbing the others', () => {
    const board = new BubbleField(DEFAULT_BOARD, createRng(6));
    board.reset(['a', 'b', 'c']);
    board.pop('b');
    expect(board.size).toBe(2);
    expect(board.has('b')).toBe(false);
    expect(board.has('a')).toBe(true);
  });

  it('produces the same layout for the same seed and a different one otherwise', () => {
    const one = new BubbleField(DEFAULT_BOARD, createRng(9));
    one.reset(['a', 'b', 'c']);
    const two = new BubbleField(DEFAULT_BOARD, createRng(9));
    two.reset(['a', 'b', 'c']);
    const three = new BubbleField(DEFAULT_BOARD, createRng(10));
    three.reset(['a', 'b', 'c']);
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
  it.each([4, 5, 6])('gives %i bubbles a lane each, with air between them', (count) => {
    const config = { ...DEFAULT_BOARD, bubbleCount: count, radius: bubbleRadiusFor(count) };
    const board = new BubbleField(config, createRng(11));
    board.reset(['a', 'b', 'c', 'd', 'e', 'f'].slice(0, count));

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
    board.reset(['a', 'b', 'c', 'd']);

    for (let step = 0; step < 200; step += 1) {
      board.step(1000);
      expect(closestPair(board.bubbles())).toBeGreaterThanOrEqual(2 * config.radius);
    }
  });

  it('never separates two bubbles by less than the tap radius', () => {
    // A tap resolves against the drawn circle, so lanes must be wider than a
    // bubble or one tap can mean two answers.
    for (const count of [4, 5, 6]) {
      const config = { ...DEFAULT_BOARD, bubbleCount: count, radius: bubbleRadiusFor(count) };
      const board = new BubbleField(config, createRng(13));
      board.reset(['a', 'b', 'c', 'd', 'e', 'f'].slice(0, count));
      const [first, second] = board.bubbles();
      if (!first || !second) throw new Error('need at least two bubbles');
      expect(board.hitTest(first.x, first.y)).toBe(first.wordId);
      expect(board.hitTest(second.x, second.y)).toBe(second.wordId);
      // The midpoint between two lanes answers to neither of them, never to both.
      expect(board.hitTest((first.x + second.x) / 2, first.y)).toBeNull();
    }
  });
});