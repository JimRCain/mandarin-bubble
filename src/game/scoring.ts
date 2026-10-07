/**
 * The session reducer: scoring, streak and clock, as a pure function.
 *
 * NFR-3 wants EXACT score deltas asserted here, because the POC's scoring bug
 * was a correct-looking score whose update was swallowed inside a state updater
 * (SPEC 2.3 defect 9). So: no side effects, no Date.now(), no Math.random().
 *
 * Session shape (SPEC 1.5), all of it non-punitive:
 *   - 15 correct answers or 90 seconds of playing time, whichever comes first
 *   - progress counts correct answers; points are a scoreboard, not a gate
 *   - a wrong tap costs 2 seconds and breaks the streak; it never deducts points
 *     and can never make the session unwinnable
 *   - no misses exist: bubbles wrap to the top (SPEC 1.3)
 */

import { SESSION } from './config';
import type { SessionPhase } from './types';

export interface SessionState {
  readonly phase: SessionPhase;
  readonly correct: number;
  readonly wrong: number;
  readonly score: number;
  /** Consecutive correct answers, before the current answer. */
  readonly streak: number;
  readonly longestCombo: number;
  /** Playing time so far, excluding pauses and untimed exposure cards. */
  readonly elapsedMs: number;
  /** Time lost to wrong taps. */
  readonly penaltyMs: number;
  /** Fastest correct response this session, in ms. */
  readonly fastestMs: number | null;
  /** ms since the current round appeared. */
  readonly roundElapsedMs: number;
  readonly targetId: string | null;
  readonly candidateIds: readonly string[];
  /** Targets already used this session (FR-11). */
  readonly askedIds: readonly string[];
  /** Words answered wrongly, in the order they were missed (FR-19, FR-20). */
  readonly wrongIds: readonly string[];
  /** Word being taught before it may be quizzed (FR-17). */
  readonly exposureId: string | null;
  /** Feedback for the last answer, so the UI can flash it without extra state. */
  readonly lastFeedback: { readonly wordId: string; readonly correct: boolean } | null;
  readonly paused: boolean;
}

export const initialSession: SessionState = {
  phase: 'playing',
  correct: 0,
  wrong: 0,
  score: 0,
  streak: 0,
  longestCombo: 0,
  elapsedMs: 0,
  penaltyMs: 0,
  fastestMs: null,
  roundElapsedMs: 0,
  targetId: null,
  candidateIds: [],
  askedIds: [],
  wrongIds: [],
  exposureId: null,
  lastFeedback: null,
  paused: false,
};

export type SessionAction =
  | { readonly type: 'round'; readonly targetId: string; readonly candidateIds: readonly string[]; readonly teach: boolean }
  | { readonly type: 'acknowledgeExposure' }
  | { readonly type: 'tick'; readonly ms: number }
  | { readonly type: 'answer'; readonly wordId: string }
  | { readonly type: 'pause' }
  | { readonly type: 'resume' }
  | { readonly type: 'finish' };

export function remainingMs(state: SessionState): number {
  return Math.max(0, SESSION.timeLimitMs - state.elapsedMs - state.penaltyMs);
}

export function progressRatio(state: SessionState): number {
  return Math.min(1, state.correct / SESSION.correctToFinish);
}

export function accuracy(state: SessionState): number {
  const attempts = state.correct + state.wrong;
  return attempts === 0 ? 0 : state.correct / attempts;
}

/** Points for the next correct answer, given the current streak (0 = first tap). */
export function pointsFor(streak: number): number {
  return SESSION.pointsPerCorrect * Math.min(streak + 1, SESSION.comboCap);
}

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'round':
      return {
        ...state,
        phase: action.teach ? 'exposure' : 'playing',
        targetId: action.targetId,
        candidateIds: action.candidateIds,
        exposureId: action.teach ? action.targetId : null,
        roundElapsedMs: 0,
        lastFeedback: null,
      };

    case 'acknowledgeExposure':
      if (state.phase !== 'exposure') return state;
      return { ...state, phase: 'playing', exposureId: null };

    case 'tick': {
      if (state.phase === 'summary' || state.paused || action.ms <= 0) return state;
      // Untimed exposure card: the clock is genuinely stopped, not merely hidden.
      if (state.phase === 'exposure') return { ...state, roundElapsedMs: state.roundElapsedMs };
      const elapsedMs = state.elapsedMs + action.ms;
      const roundElapsedMs = state.roundElapsedMs + action.ms;
      if (elapsedMs + state.penaltyMs >= SESSION.timeLimitMs) {
        return { ...state, elapsedMs, roundElapsedMs, phase: 'summary', targetId: null, candidateIds: [] };
      }
      return { ...state, elapsedMs, roundElapsedMs };
    }

    case 'answer': {
      if (state.phase !== 'playing' || state.targetId === null) return state;
      if (action.wordId === state.targetId) {
        const streak = state.streak + 1;
        const correct = state.correct + 1;
        const finished = correct >= SESSION.correctToFinish;
        return {
          ...state,
          correct,
          score: state.score + pointsFor(state.streak),
          streak,
          longestCombo: Math.max(state.longestCombo, streak),
          fastestMs: state.fastestMs === null ? state.roundElapsedMs : Math.min(state.fastestMs, state.roundElapsedMs),
          askedIds: state.askedIds.includes(action.wordId) ? state.askedIds : [...state.askedIds, action.wordId],
          lastFeedback: { wordId: action.wordId, correct: true },
          phase: finished ? 'summary' : state.phase,
          targetId: finished ? null : state.targetId,
          candidateIds: finished ? [] : state.candidateIds,
        };
      }
      // Wrong tap: a small time penalty, a broken streak, and a review entry.
      // Points are untouched, so the scoreboard can still only mean "correct".
      return {
        ...state,
        wrong: state.wrong + 1,
        streak: 0,
        penaltyMs: state.penaltyMs + SESSION.wrongPenaltyMs,
        wrongIds: state.wrongIds.includes(action.wordId) ? state.wrongIds : [...state.wrongIds, action.wordId],
        lastFeedback: { wordId: action.wordId, correct: false },
        ...(state.elapsedMs + (state.penaltyMs + SESSION.wrongPenaltyMs) >= SESSION.timeLimitMs
          ? { phase: 'summary' as SessionPhase, targetId: null, candidateIds: [] }
          : {}),
      };
    }

    case 'pause':
      return state.paused ? state : { ...state, paused: true };

    case 'resume':
      return state.paused ? { ...state, paused: false } : state;

    case 'finish':
      return { ...state, phase: 'summary', targetId: null, candidateIds: [] };

    default:
      return state;
  }
}