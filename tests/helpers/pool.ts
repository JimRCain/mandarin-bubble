/**
 * Test-only helpers: load the real committed corpus from disk and expose the
 * game-layer entry points under test-friendly names. Reading the real content
 * (rather than fixtures) is deliberate: the selection rules exist because of
 * properties of THIS corpus (56 colliding glosses, 588 shared Hanzi).
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildPool } from '../../src/content';
import { filterPool, planRound, ambiguousTargets, chooseDistractors } from '../../src/game/selection';
import type { PoolWord, Word } from '../../src/game/types';

export { filterPool, planRound, ambiguousTargets, chooseDistractors };

const ROOT = new URL('../../', import.meta.url).pathname;
export const CONTENT_DIR = join(ROOT, 'content');

export function deckIds(): string[] {
  return readdirSync(join(CONTENT_DIR, 'words'))
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.replace(/\.json$/, ''))
    .sort();
}

export function readDeck(deckId: string): Word[] {
  return JSON.parse(readFileSync(join(CONTENT_DIR, 'words', `${deckId}.json`), 'utf8')) as Word[];
}

export function readCategories(): { id: string; name: string; group: string; order: number }[] {
  return JSON.parse(readFileSync(join(CONTENT_DIR, 'categories.json'), 'utf8')) as {
    id: string;
    name: string;
    group: string;
    order: number;
  }[];
}

export function readGolden(): {
  totals: { decks: number; entries: number; uniqueWords: number; duplicateEntries: number };
  decks: { id: string; entries: number; uniqueWords: number; bands: Record<string, number> }[];
} {
  return JSON.parse(readFileSync(join(CONTENT_DIR, 'golden', 'counts.json'), 'utf8'));
}

/** The whole corpus as one deduplicated pool, the way the app builds it. */
export function buildPoolWords(): PoolWord[] {
  return buildPool(deckIds().map((deckId) => ({ deckId, words: readDeck(deckId) })));
}