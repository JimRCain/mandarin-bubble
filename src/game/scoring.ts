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
 *
 * The board persists for the whole session, which is the POC's mechanic
 * (docs/POC-MECHANICS.md): `bubbleIds` is what is on screen right now, a correct
 * answer pops exactly one bubble, and the target hops to a bubble that was
 * already up rather than to a freshly dealt set. Spawns refill free lanes on
 * their own timer (`refill`). The caller decides WHICH bubble to hop to and what
 * the refill deals, because the reducer may not touch randomness or the pool
 * (see tests/hygiene.test.ts); the reducer enforces that the target it is given
 * is a bubble that is really on the board.
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
  /** The bubble IDs currently on the board */
  readonly bubbleIds: readonly string[];
  /** Targets already used this session (FR-11). */
  readonly askedIds: readonly string[];
  /** Words answered wrongly, in the order they were missed (FR-19, FR-20). */
  readonly wrongIds: readonly string[];
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
  bubbleIds: [],
  askedIds: [],
  wrongIds: [],
  lastFeedback: null,
  paused: false,
};

export type SessionAction =
  | { readonly type: 'deal'; readonly bubbleIds: readonly string[]; readonly targetId: string }
  /** Tops the board up by one, never past the pace's capacity. */
  | { readonly type: 'refill'; readonly newBubbleId: string; readonly capacity: number }
  | { readonly type: 'tick'; readonly ms: number }
  | { 
      readonly type: 'answer'; 
      readonly wordId: string; 
      readonly hopIndex?: number; 
      readonly replacementId?: string; 
    }
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

/**
 * Where the target hops to after a correct answer: a bubble that is still on the
 * board, chosen by the caller's rolled index so this stays a pure function.
 *
 * Returns null only when the board handed in is genuinely empty, which the caller
 * must never allow (see the note on `answer` in useGame): the POC's version had
 * exactly that hole, where an emptied board left the target null and every later
 * tap did nothing.
 */
function hopTarget(boardIds: readonly string[], hopIndex = 0): string | null {
  if (boardIds.length === 0) return null;
  return boardIds[((hopIndex % boardIds.length) + boardIds.length) % boardIds.length] ?? null;
}

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'deal':
      return {
        ...state,
        phase: 'playing',
        bubbleIds: action.bubbleIds,
        targetId: action.targetId,
        roundElapsedMs: 0,
        lastFeedback: null,
      };

    case 'tick': {
      if (state.phase === 'summary' || state.paused || action.ms <= 0) return state;
      const elapsedMs = state.elapsedMs + action.ms;
      const roundElapsedMs = state.roundElapsedMs + action.ms;
      if (elapsedMs + state.penaltyMs >= SESSION.timeLimitMs) {
        return { ...state, elapsedMs, roundElapsedMs, phase: 'summary', targetId: null, bubbleIds: [] };
      }
      return { ...state, elapsedMs, roundElapsedMs };
    }

    case 'refill': {
      if (state.phase !== 'playing' || state.targetId === null) return state;
      if (state.bubbleIds.includes(action.newBubbleId)) return state;
      if (state.bubbleIds.length >= action.capacity) return state;
      return { ...state, bubbleIds: [...state.bubbleIds, action.newBubbleId] };
    }

    case 'answer': {
      if (state.phase !== 'playing' || state.targetId === null) return state;
      // A correct tap leaves the bubble tappable for the green flash, so a quick
      // double-tap is a real possibility: the word that was just answered cannot
      // score again. Only that word is blocked, so nothing else about the round
      // changes while it is being held.
      if (
        action.wordId === state.targetId &&
        state.lastFeedback?.correct === true &&
        state.lastFeedback.wordId === state.targetId
      ) {
        return state;
      }
      if (action.wordId === state.targetId) {
        const streak = state.streak + 1;
        const correct = state.correct + 1;
        const finished = correct >= SESSION.correctToFinish;

        // The board after the pop but BEFORE any replacement, which is the board
        // the hop is allowed to choose from: the POC moved the target to a
        // bubble the player could already see, never to one it had just dealt
        // (GameBoard 396-405 in the POC).
        const popped = state.bubbleIds.filter((id) => id !== action.wordId);
        const board = action.replacementId
          ? [...popped, action.replacementId]
          : popped;
        // Hop over the board as it stands after the pop: the POC never made a
        // just-dealt bubble the new challenge. The one exception is the pop that
        // empties the board, where the replacement is all that is left to ask.
        const newTargetId = finished ? null : hopTarget(popped.length > 0 ? popped : board, action.hopIndex);

        return {
          ...state,
          correct,
          score: state.score + pointsFor(state.streak),
          streak,
          longestCombo: Math.max(state.longestCombo, streak),
          fastestMs: state.fastestMs === null ? state.roundElapsedMs : Math.min(state.fastestMs, state.roundElapsedMs),
          // The hop shows a new prompt, so the response time starts again here;
          // without this the second tap of a session would be timed from the
          // first prompt and no fast answer could ever beat the first one.
          roundElapsedMs: finished ? state.roundElapsedMs : 0,
          askedIds: state.askedIds.includes(action.wordId) ? state.askedIds : [...state.askedIds, action.wordId],
          bubbleIds: finished ? [] : board,
          lastFeedback: { wordId: action.wordId, correct: true },
          phase: finished ? 'summary' : state.phase,
          targetId: newTargetId,
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
          ? { phase: 'summary' as SessionPhase, targetId: null, bubbleIds: [] }
          : {}),
      };
    }

    case 'pause':
      return state.paused ? state : { ...state, paused: true };

    case 'resume':
      return state.paused ? { ...state, paused: false } : state;

    case 'finish':
      return { ...state, phase: 'summary', targetId: null, bubbleIds: [] };

    default:
      return state;
  }
}