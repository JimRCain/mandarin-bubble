import { describe, expect, it } from 'vitest';
import { BubbleField, DEFAULT_BOARD } from '../src/game/board';
import { createRng } from '../src/game/rng';

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
    // Teleported to a random slot at the top, not stuck on the wrap line.
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