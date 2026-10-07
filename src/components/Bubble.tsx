/**
 * One falling bubble.
 *
 * It holds no position of its own: the frame loop in GameBoard.tsx writes
 * `left`/`top` onto this node through the `register` callback. Pointer taps are
 * resolved by hit-testing on the board, so there is deliberately no click
 * handler here (that would answer the same tap twice). Keyboard players answer
 * the focused bubble with Enter or Space.
 */

import type { KeyboardEvent } from 'react';
import type { PoolWord } from '../game/types';

export interface BubbleProps {
  word: PoolWord;
  /** Diameter as a percentage of viewport width, matching the engine's hit radius. */
  diameterVw: number;
  /**
   * Reading aid, on by default (Jim, 2026-10-07; the POC did the same). It shows
   * under the Hanzi inside the bubble, and both sizes are derived from the
   * bubble's own diameter so the pair scales together on any screen.
   */
  showPinyin: boolean;
  feedback: 'correct' | 'wrong' | null;
  register: (wordId: string, element: HTMLButtonElement | null) => void;
  onSelect: (wordId: string) => void;
}

export default function Bubble({ word, diameterVw, showPinyin, feedback, register, onSelect }: BubbleProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(word.id);
    }
  };

  return (
    <button
      ref={(element) => register(word.id, element)}
      type="button"
      data-testid="bubble"
      data-word-id={word.id}
      aria-label={`Bubble showing ${word.hanzi}${showPinyin ? ` (${word.pinyin})` : ''}`}
      onKeyDown={handleKeyDown}
      style={{ width: `${diameterVw}vw`, height: `${diameterVw}vw`, left: '50%', top: '-10%' }}
      className={[
        'absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border-2',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-jade-400',
        feedback === 'correct'
          ? 'border-jade-400 bg-jade-500/30'
          : feedback === 'wrong'
            ? 'border-lantern-400 bg-lantern-500/20'
            : 'border-ink-700 bg-ink-800 hover:border-jade-400',
      ].join(' ')}
    >
      <span className="font-bold leading-none text-white" style={{ fontSize: `${diameterVw * 0.46}vw` }}>
        {word.hanzi}
      </span>
      {showPinyin && (
        <span
          className="whitespace-nowrap leading-none text-gray-300"
          data-testid="bubble-pinyin"
          style={{ fontSize: `${diameterVw * 0.22}vw` }}
        >
          {word.pinyin}
        </span>
      )}
    </button>
  );
}