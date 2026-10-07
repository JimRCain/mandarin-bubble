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

const round = (state: SessionState, targetId = 'a', candidates: string[] = ['a', 'b', 'c', 'd']) =>
  sessionReducer(state, { type: 'round', targetId, candidateIds: candidates });

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
      state = sessionReducer(state, { type: 'answer', wordId: 'a' });
      deltas.push(state.score - before);
      state = round(state, 'a');
    }
    expect(deltas).toEqual([10, 20, 30, 40, 50]);
    expect(state.score).toBe(150);
    expect(state.longestCombo).toBe(5);
  });

  it('charges a wrong tap 2 seconds and no points, and breaks the streak', () => {
    let state = round(initialSession);
    state = sessionReducer(state, { type: 'answer', wordId: 'a' });
    expect(state.streak).toBe(1);

    const scoreBefore = state.score;
    state = sessionReducer(state, { type: 'answer', wordId: 'b' });

    expect(state.score).toBe(scoreBefore);
    expect(state.wrong).toBe(1);
    expect(state.penaltyMs).toBe(SESSION.wrongPenaltyMs);
    expect(state.streak).toBe(0);
    expect(remainingMs(state)).toBe(SESSION.timeLimitMs - SESSION.wrongPenaltyMs);
    expect(state.wrongIds).toEqual(['b']);
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
    let state = round(initialSession, 'a', ['a', 'b', 'c', 'd']);
    for (let i = 0; i < SESSION.correctToFinish - 1; i += 1) {
      state = sessionReducer(state, { type: 'answer', wordId: 'a' });
      expect(state.phase).toBe('playing');
      state = round(state, 'a');
    }
    state = sessionReducer(state, { type: 'answer', wordId: 'a' });
    expect(state.correct).toBe(SESSION.correctToFinish);
    expect(state.phase).toBe('summary');
    expect(state.targetId).toBeNull();
    expect(state.candidateIds).toEqual([]);
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

  it('holds an answered round until it is cleared, then allows the next one', () => {
    let state = round(initialSession, 'a');
    state = sessionReducer(state, { type: 'answer', wordId: 'a' });
    // The round stays on the board: the green flash needs something to sit on.
    expect(state.correct).toBe(1);
    expect(state.targetId).toBe('a');
    expect(state.candidateIds).toContain('a');

    // Until it is cleared the round cannot score again, so a double tap on the
    // bubble that is still flashing green cannot pay twice.
    const again = sessionReducer(state, { type: 'answer', wordId: 'a' });
    expect(again).toBe(state);
    expect(again.correct).toBe(1);

    state = sessionReducer(state, { type: 'clearRound' });
    expect(state.targetId).toBeNull();
    expect(state.candidateIds).toEqual([]);

    state = round(state, 'b');
    expect(state.targetId).toBe('b');
  });

  it('ignores clearRound when there is nothing to clear', () => {
    expect(sessionReducer(initialSession, { type: 'clearRound' })).toBe(initialSession);
    const over = sessionReducer({ ...initialSession, phase: 'summary' }, { type: 'clearRound' });
    expect(over.phase).toBe('summary');
  });

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
    let state = round(initialSession, 'a');
    state = sessionReducer(state, { type: 'tick', ms: 1800 });
    state = sessionReducer(state, { type: 'answer', wordId: 'a' });
    expect(state.fastestMs).toBe(1800);

    state = round(state, 'a');
    state = sessionReducer(state, { type: 'tick', ms: 900 });
    state = sessionReducer(state, { type: 'answer', wordId: 'a' });
    expect(state.fastestMs).toBe(900);

    state = round(state, 'a');
    state = sessionReducer(state, { type: 'tick', ms: 2400 });
    state = sessionReducer(state, { type: 'answer', wordId: 'a' });
    expect(state.fastestMs).toBe(900);
  });

  it('records the target once asked, so FR-11 can exclude it', () => {
    let state = round(initialSession, 'a');
    state = sessionReducer(state, { type: 'answer', wordId: 'a' });
    state = round(state, 'b');
    state = sessionReducer(state, { type: 'answer', wordId: 'b' });
    expect(state.askedIds).toEqual(['a', 'b']);
  });
});