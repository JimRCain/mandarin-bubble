import { describe, expect, it } from 'vitest';
import { SESSION } from '../src/game/config';
import {
  initialSession,
  pointsFor,
  progressRatio,
  remainingMs,
  sessionReducer,
  type SessionState,
} from '../src/game/scoring';

const round = (state: SessionState, targetId = 'a', bubbleIds: string[] = ['a', 'b', 'c', 'd']) =>
  sessionReducer(state, { type: 'deal', targetId, bubbleIds });

/**
 * Answers whatever the board is asking for, the way GameBoard does when the
 * player taps the bubble that matches the prompt.
 */
const tapTarget = (state: SessionState, replacementId?: string) =>
  sessionReducer(state, {
    type: 'answer',
    wordId: state.targetId ?? '',
    hopIndex: 0,
    replacementId,
  });

describe('session shape (SPEC 1.5)', () => {
  it('starts playing, at zero, with the full clock', () => {
    expect(initialSession.correct).toBe(0);
    expect(remainingMs(initialSession)).toBe(SESSION.timeLimitMs);
    expect(progressRatio(initialSession)).toBe(0);
  });

  it('pays exact points, stepping the combo up to a cap and never past it', () => {
    expect(pointsFor(0)).toBe(10);
    expect(pointsFor(1)).toBe(20);
    expect(pointsFor(2)).toBe(30);
    expect(pointsFor(3)).toBe(40);
    expect(pointsFor(4)).toBe(50);
    // Capped, even on a long streak.
    expect(pointsFor(5)).toBe(50);
    expect(pointsFor(41)).toBe(50);
  });

  it('keeps an exact running score across a streak', () => {
    let state = round(initialSession);
    const deltas: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const before = state.score;
      // The board persists between taps; only the popped bubble is replaced.
      state = tapTarget(state, `spare-${i}`);
      deltas.push(state.score - before);
    }
    expect(deltas).toEqual([10, 20, 30, 40, 50]);
    expect(state.score).toBe(150);
    expect(state.longestCombo).toBe(5);
  });

  it('charges a wrong tap 2 seconds and no points, and breaks the streak', () => {
    let state = round(initialSession);
    state = tapTarget(state);
    expect(state.streak).toBe(1);
    expect(state.targetId).toBe('b');

    const scoreBefore = state.score;
    // Anything that is not the current target: the target hops on every correct
    // tap, so a hard-coded id would be tapping the right bubble by the second tap.
    const distractor = state.bubbleIds.find((id) => id !== state.targetId);
    expect(distractor).toBeDefined();
    const target = state.targetId;
    state = sessionReducer(state, { type: 'answer', wordId: distractor ?? 'zzz' });

    expect(state.score).toBe(scoreBefore);
    expect(state.wrong).toBe(1);
    expect(state.penaltyMs).toBe(SESSION.wrongPenaltyMs);
    expect(state.streak).toBe(0);
    expect(remainingMs(state)).toBe(SESSION.timeLimitMs - SESSION.wrongPenaltyMs);
    expect(state.wrongIds).toEqual([distractor]);
    expect(state.targetId).toBe(target);
  });

  it('records each missed word once, in the order missed (FR-19)', () => {
    let state = round(initialSession);
    state = sessionReducer(state, { type: 'answer', wordId: 'b' });
    state = sessionReducer(state, { type: 'answer', wordId: 'c' });
    state = sessionReducer(state, { type: 'answer', wordId: 'b' });
    expect(state.wrongIds).toEqual(['b', 'c']);
    expect(state.wrong).toBe(3);
  });

  it('ends after 15 correct answers, not before', () => {
    let state = round(initialSession);
    for (let i = 0; i < SESSION.correctToFinish - 1; i += 1) {
      state = tapTarget(state, `spare-${i}`);
      expect(state.phase).toBe('playing');
    }
    state = tapTarget(state, 'spare-last');
    expect(state.correct).toBe(SESSION.correctToFinish);
    expect(state.phase).toBe('summary');
    expect(state.targetId).toBeNull();
    // A finished session has no board left to render.
    expect(state.bubbleIds).toEqual([]);
  });

  it('ends when playing time plus penalties reaches 90 seconds', () => {
    let state = round(initialSession);
    state = sessionReducer(state, { type: 'tick', ms: SESSION.timeLimitMs - 1 });
    expect(state.phase).toBe('playing');
    state = sessionReducer(state, { type: 'tick', ms: 1 });
    expect(state.phase).toBe('summary');
    expect(progressRatio(state)).toBe(0);
  });

  it('can be ended early by a wrong tap when only the penalty remains', () => {
    let state = round(initialSession);
    state = sessionReducer(state, { type: 'tick', ms: SESSION.timeLimitMs - 1000 });
    state = sessionReducer(state, { type: 'answer', wordId: 'b' });
    expect(state.phase).toBe('summary');
  });
});

/**
 * The POC's mechanic (docs/POC-MECHANICS.md): a correct tap pops ONE bubble and
 * the target hops to a bubble that is still on the board. The board is never
 * re-dealt and a pop never leaves the session without a target, which is the hole
 * the POC's version had.
 */
describe('a correct tap pops one bubble and hops the target', () => {
  it('hops to a bubble that was already on the board', () => {
    let state = round(initialSession, 'a', ['a', 'b', 'c']);
    state = sessionReducer(state, { type: 'answer', wordId: 'a', hopIndex: 0, replacementId: 'd' });

    expect(state.correct).toBe(1);
    // 'b' and 'c' were up when the tap happened; 'd' arrived with it and the POC
    // never made a just-dealt bubble the new challenge.
    expect(state.targetId).toBe('b');
    expect(state.bubbleIds).toEqual(['b', 'c', 'd']);
    expect(state.bubbleIds).not.toContain('a');
  });

  it('hops within the board for any index it is given', () => {
    const board = ['a', 'b', 'c'];
    const seen = new Set<string | null>();
    for (let hopIndex = 0; hopIndex < 6; hopIndex += 1) {
      const state = sessionReducer(round(initialSession, 'a', board), {
        type: 'answer',
        wordId: 'a',
        hopIndex,
      });
      expect(['b', 'c']).toContain(state.targetId);
      seen.add(state.targetId);
    }
    // Every bubble on the board is reachable, so the hop is not stuck on one lane.
    expect(seen).toEqual(new Set(['b', 'c']));
  });

  it('leaves the board alone when no replacement is dealt', () => {
    const state = sessionReducer(round(initialSession, 'a', ['a', 'b', 'c']), {
      type: 'answer',
      wordId: 'a',
      hopIndex: 1,
    });
    expect(state.bubbleIds).toEqual(['b', 'c']);
    expect(state.targetId).toBe('c');
  });

  it('asks for the replacement when the pop would empty the board', () => {
    // The POC left the target null here and every later tap did nothing. The
    // caller must deal a replacement; when it does, that becomes the challenge.
    const state = sessionReducer(round(initialSession, 'a', ['a']), {
      type: 'answer',
      wordId: 'a',
      replacementId: 'd',
    });
    expect(state.bubbleIds).toEqual(['d']);
    expect(state.targetId).toBe('d');
  });

  it('never scores the same tap twice', () => {
    const state = round(initialSession, 'a', ['a', 'b', 'c']);
    const answered = sessionReducer(state, { type: 'answer', wordId: 'a', hopIndex: 0 });
    const again = sessionReducer(answered, { type: 'answer', wordId: 'a' });
    expect(again.correct).toBe(1);
    expect(again.score).toBe(answered.score);
  });

  it('changes nothing about the board or the target on a wrong tap', () => {
    const state = round(initialSession, 'a', ['a', 'b', 'c']);
    const wrong = sessionReducer(state, { type: 'answer', wordId: 'b' });
    expect(wrong.correct).toBe(0);
    expect(wrong.wrong).toBe(1);
    expect(wrong.targetId).toBe('a');
    expect(wrong.bubbleIds).toEqual(['a', 'b', 'c']);
  });
});

describe('refill', () => {
  it('tops the board up by one, never past the capacity', () => {
    let state = round(initialSession, 'a', ['a', 'b']);
    state = sessionReducer(state, { type: 'refill', newBubbleId: 'c', capacity: 3 });
    expect(state.bubbleIds).toEqual(['a', 'b', 'c']);

    // Already up, or already full: either way the board does not grow.
    expect(sessionReducer(state, { type: 'refill', newBubbleId: 'c', capacity: 3 })).toBe(state);
    expect(sessionReducer(state, { type: 'refill', newBubbleId: 'd', capacity: 3 })).toBe(state);
  });

  it('does not deal into a session that is not being played', () => {
    const serving = initialSession;
    expect(serving.targetId).toBeNull();
    expect(sessionReducer(serving, { type: 'refill', newBubbleId: 'c', capacity: 4 })).toBe(serving);
  });
});

describe('the clock and the record', () => {
  it('freezes on pause and resumes without counting paused time', () => {
    let state = round(initialSession);
    state = sessionReducer(state, { type: 'tick', ms: 1000 });
    state = sessionReducer(state, { type: 'pause' });
    state = sessionReducer(state, { type: 'tick', ms: 10_000 });
    expect(state.elapsedMs).toBe(1000);
    state = sessionReducer(state, { type: 'resume' });
    state = sessionReducer(state, { type: 'tick', ms: 500 });
    expect(state.elapsedMs).toBe(1500);
  });

  it('tracks the fastest correct response, and only the fastest', () => {
    let state = round(initialSession);
    state = sessionReducer(state, { type: 'tick', ms: 1800 });
    state = tapTarget(state, 'spare-1');
    expect(state.fastestMs).toBe(1800);

    state = sessionReducer(state, { type: 'tick', ms: 900 });
    state = tapTarget(state, 'spare-2');
    expect(state.fastestMs).toBe(900);

    state = sessionReducer(state, { type: 'tick', ms: 2400 });
    state = tapTarget(state, 'spare-3');
    expect(state.fastestMs).toBe(900);
  });

  it('records the target once asked, so FR-11 can exclude it', () => {
    let state = round(initialSession, 'a', ['a', 'b', 'c']);
    state = tapTarget(state, 'spare-1');
    expect(state.askedIds).toEqual(['a']);
    state = tapTarget(state, 'spare-2');
    expect(state.askedIds).toEqual(['a', 'b']);
  });
});