/**
 * The first-sight exposure card (SPEC 1.6a).
 *
 * It appears before a word the player has never met can be tapped, and it is
 * untimed: GameBoard.tsx only advances the session clock while the phase is
 * 'playing', so time spent reading is free. Teaching before testing is the point
 * of the mode, so this is not a hint, it is the lesson.
 */

import type { PoolWord } from '../game/types';
import Button from './ui/Button';

export interface ExposureCardProps {
  word: PoolWord | null;
  onDismiss: () => void;
}

export default function ExposureCard({ word, onDismiss }: ExposureCardProps) {
  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-ink-950/90 p-6"
      data-testid="exposure-card"
    >
      <div className="w-full max-w-sm rounded-2xl border border-jade-500/60 bg-ink-900 p-6 text-center shadow-xl">
        <p className="text-xs uppercase tracking-wide text-jade-400">New word</p>
        <p className="mt-3 text-6xl font-bold leading-none text-white">{word?.hanzi ?? ''}</p>
        <p className="mt-2 text-xl text-jade-400">{word?.pinyin ?? ''}</p>
        <p className="mt-1 text-base text-gray-200">{word?.english ?? ''}</p>
        <Button className="mt-6 w-full" onClick={onDismiss} autoFocus data-testid="exposure-dismiss">
          Got it, show me the bubbles
        </Button>
        <p className="mt-2 text-[11px] text-gray-500">The clock is stopped while this card is up.</p>
      </div>
    </div>
  );
}