/**
 * The play screen: HUD and falling bubbles.
 *
 * Nothing here keeps a bubble position in React state (SPEC 7). The frame loop
 * moves the engine and writes `left`/`top` straight onto the bubble nodes, so
 * React re-renders only when the session changes discretely: a round, a score,
 * a phase. Taps are hit-tested against the same coordinates the loop writes, so
 * a tap can never resolve against a stale render.
 */

import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { BubbleField } from '../game/board';
import { createRng } from '../game/rng';
import { SESSION } from '../game/config';
import { remainingMs } from '../game/scoring';
import { useGame } from '../useGame';
import Bubble from './Bubble';
import Button from './ui/Button';

interface GameBoardProps {
  onExit: () => void;
}

/**
 * The engine measures a bubble's radius as a fraction of board WIDTH, and the
 * board spans the viewport, so a diameter of 2 * radius is 2 * radius * 100 in
 * vw. Deriving it from the engine keeps the drawing and the hit test one shape.
 */

export default function GameBoard({ onExit }: GameBoardProps) {
  const {
    state,
    boardConfig,
    seed,
    advance,
    answer,
    audio,
    word,
  } = useGame();
  // The bubble engine lives here, not in the provider: it is a rendering detail,
  // and App.tsx remounts this screen (key = pace + session epoch) whenever a new
  // session needs fresh geometry. Its random stream is its own, seeded from the
  // same ?seed=, so a replay lays the board out identically.
  const [field] = useState(() => new BubbleField(boardConfig, createRng(seed)));
  const boardRef = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<string, HTMLButtonElement>());
  const lastFrame = useRef<number | null>(null);

  const register = useCallback((wordId: string, element: HTMLButtonElement | null) => {
    if (element) nodes.current.set(wordId, element);
    else nodes.current.delete(wordId);
  }, []);

  const paint = useCallback(() => {
    // Write what the engine says, not what React last rendered.
    for (const bubble of field.bubbles()) {
      const node = nodes.current.get(bubble.wordId);
      if (!node) continue;
      node.style.left = `${bubble.x * 100}%`;
      node.style.top = `${bubble.y * 100}%`;
    }
  }, [field]);

  // Reset from the round's own candidate list, so the bubbles on screen and the
  // ids the reducer answers against can never disagree. Declared before the frame
  // loop so a new round is placed before it is first painted.
  //
  // The paint() here is not redundant: a brand-new bubble node has no inline
  // left/top until it is written, so waiting for the next animation frame to
  // place it leaves the whole round stacked in one spot for a frame. Refs are
  // attached before effects run, so every node is already registered.
  useEffect(() => {
    if (state.phase === 'playing' && state.candidateIds.length > 0) {
      field.reset(state.candidateIds);
      paint();
    }
  }, [field, state.phase, state.candidateIds, paint]);

  useEffect(() => {
    if (state.phase !== 'playing') return;
    let stopped = false;
    let handle = 0;
    const frame = (timestamp: number) => {
      if (stopped) return;
      const previous = lastFrame.current ?? timestamp;
      // Clamp the delta: a backgrounded tab must not teleport every bubble.
      const dt = Math.min(64, Math.max(0, timestamp - previous));
      lastFrame.current = timestamp;
      if (state.phase === 'playing' && !state.paused) {
        field.step(dt);
        advance(dt);
      }
      paint();
      handle = requestAnimationFrame(frame);
    };
    handle = requestAnimationFrame(frame);
    return () => {
      stopped = true;
      cancelAnimationFrame(handle);
      lastFrame.current = null;
    };
  }, [state.phase, state.paused, field, advance, paint]);

  const handleBoardClick = (event: MouseEvent<HTMLDivElement>) => {
    if (state.phase !== 'playing' || state.paused) return;
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    const hit = field.hitTest(
      (event.clientX - rect.left) / rect.width,
      (event.clientY - rect.top) / rect.height,
    );
    if (hit) answer(hit);
  };

  const target = word(state.targetId);
  const remainingSeconds = Math.ceil(remainingMs(state) / 1000);
  const urgent = remainingSeconds <= 15;
  const lastFeedback = state.lastFeedback;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-ink-950" data-testid="game">
      <div className="z-10 shrink-0 border-b border-ink-800 bg-ink-900/95 p-3 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="small" onClick={onExit} data-testid="exit-session">
            Exit
          </Button>
          <div className="min-w-0 flex-1 text-center">
            <div className="truncate text-xl font-bold text-white" data-testid="target-prompt">
              {target?.english ?? (state.phase === 'playing' ? 'Dealing…' : '')}
            </div>
            {target && (
              <button
                type="button"
                className="mt-0.5 text-xs text-jade-400 underline decoration-dotted"
                onClick={() => audio.replay(target.id)}
                data-testid="replay"
              >
                hear it again
              </button>
            )}
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-gray-400">Score</div>
            <div className="font-mono text-lg font-bold text-white" data-testid="hud-score">
              {state.score}
            </div>
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between text-xs text-gray-300">
          <span data-testid="hud-progress">
            {state.correct}/{SESSION.correctToFinish} correct
          </span>
          <span className="font-mono">{state.streak}x streak</span>
          <span
            className={urgent ? 'font-mono text-lantern-400' : 'font-mono'}
            data-testid="hud-timer"
          >
            {remainingSeconds}s
          </span>
        </div>
      </div>

      <div
        ref={boardRef}
        className="relative min-h-0 flex-1 overflow-hidden"
        onClick={handleBoardClick}
        data-testid="board"
      >
        {state.phase === 'playing' &&
          state.candidateIds.map((candidateId) => {
            const candidate = word(candidateId);
            if (!candidate) return null;
            const feedback =
              lastFeedback && lastFeedback.wordId === candidateId
                ? lastFeedback.correct
                  ? 'correct'
                  : 'wrong'
                : null;
            return (
              <Bubble
                key={candidateId}
                word={candidate}
                diameterVw={boardConfig.radius * 200}
                feedback={feedback}
                register={register}
                onSelect={answer}
              />
            );
          })}

        {state.streak >= 2 && state.phase === 'playing' && (
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-3xl font-bold text-jade-400/70"
            data-testid="combo"
          >
            {state.streak}x combo
          </div>
        )}
      </div>

      {state.paused && state.phase !== 'summary' && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-ink-950/85 text-lg text-white"
          data-testid="paused"
        >
          Paused while the tab is hidden
        </div>
      )}

      <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-[11px] text-gray-500">
        Tap the bubble whose Hanzi matches the prompt
      </p>
    </div>
  );
}