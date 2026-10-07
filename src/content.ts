/**
 * Content loading.
 *
 * Word data is fetched lazily, one file per deck, from public/content/ (written
 * by scripts/content-build.mjs). Nothing about the corpus is bundled into the
 * JS payload, which is what keeps the initial bundle inside the SPEC 5.1 budget.
 */

import { BANDS, type Band, type ContentIndex, type DeckMeta, type PoolWord, type Word } from './game/types';

const cache = new Map<string, Promise<Word[]>>();

function base(): string {
  return `${import.meta.env.BASE_URL}content/`;
}

export async function loadIndex(signal?: AbortSignal): Promise<ContentIndex> {
  const response = await fetch(`${base()}index.json`, signal ? { signal } : undefined);
  if (!response.ok) throw new Error(`content index unavailable (${response.status})`);
  return (await response.json()) as ContentIndex;
}

export function loadDeck(deckId: string): Promise<Word[]> {
  const cached = cache.get(deckId);
  if (cached) return cached;
  const request = (async () => {
    const response = await fetch(`${base()}words/${deckId}.json`);
    if (!response.ok) throw new Error(`deck ${deckId} unavailable (${response.status})`);
    return (await response.json()) as Word[];
  })();
  cache.set(deckId, request);
  return request;
}

/** Merges deck files into one pool, deduplicated by word id (SPEC 4.2). */
export function buildPool(entries: readonly { deckId: string; words: readonly Word[] }[]): PoolWord[] {
  const byId = new Map<string, PoolWord>();
  for (const { deckId, words } of entries) {
    for (const word of words) {
      const existing = byId.get(word.id);
      if (!existing) {
        byId.set(word.id, { ...word, decks: [deckId] });
        continue;
      }
      if (!existing.decks.includes(deckId)) {
        byId.set(word.id, { ...existing, decks: [...existing.decks, deckId] });
      }
    }
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id, 'en'));
}

/** Decks a pool can actually be filtered by; a band with no words is disabled, not empty. */
export function usableBands(deck: DeckMeta): Band[] {
  return BANDS.filter((band) => deck.bands[band] > 0);
}

/**
 * The first-run path needs a deck that needs no configuration at all (FR-5):
 * HSK 1 when it exists, otherwise the largest deck that has all three bands.
 */
export function starterDeck(index: ContentIndex): DeckMeta | null {
  const hsk1 = index.decks.find((deck) => deck.id === 'hsk-1');
  if (hsk1) return hsk1;
  const withThreeBands = index.decks.filter((deck) => deck.usableBands === 3);
  const candidates = withThreeBands.length > 0 ? withThreeBands : index.decks;
  return [...candidates].sort((a, b) => b.uniqueWords - a.uniqueWords)[0] ?? null;
}