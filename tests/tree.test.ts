import { describe, expect, it } from 'vitest';
import {
  BAND_RAMP,
  bandsForDeck,
  boxesToKnown,
  buildTree,
  deckTally,
  filterByRamp,
  groupIcon,
  isLadderDeck,
  isMastered,
  STARTER_DECKS,
  UNLOCK_KNOWN_FRACTION,
  unlockedDeckIds,
} from '../src/game/tree';
import { REVIEW } from '../src/game/config';
import type { Band, DeckMeta, Word } from '../src/game/types';

const word = (id: string, band: Band = 'common'): Word => ({
  id,
  hanzi: id,
  pinyin: id,
  english: id,
  band,
  zipf: 5.5,
});

const deck = (id: string, group: string, order: number, words: readonly Word[]): DeckMeta => {
  const bands: Record<Band, number> = { common: 0, mid: 0, rare: 0 };
  for (const w of words) bands[w.band] += 1;
  return {
    id,
    name: id,
    group,
    order,
    entries: words.length,
    uniqueWords: new Set(words.map((w) => w.id)).size,
    bands,
    usableBands: Object.values(bands).filter((n) => n > 0).length,
  };
};

/** A progress record that reads as KNOWN, without going through the box logic. */
const known = { box: REVIEW.knownBox, dueAt: 0, seen: 3, correct: 3, wrong: 0, lastSeenAt: 0 } as never;
const seenOnly = { box: 0, dueAt: 0, seen: 1, correct: 0, wrong: 1, lastSeenAt: 0 } as never;

/** What the corpus looks like to a screen that has loaded every deck. */
const withWords = (decks: readonly DeckMeta[], words: readonly Word[]) => (deckId: string) =>
  decks.some((d) => d.id === deckId)
    ? words.filter((w) => w.id.startsWith(`${deckId}-`))
    : [];

describe('deck tallies (tree.ts counts words, not boxes)', () => {
  it('counts a word as seen once answered and known only at the known box', () => {
    const words = [word('a'), word('b'), word('c')];
    const tally = deckTally(words, { a: known, b: seenOnly });
    expect(tally.seen).toBe(2);
    expect(tally.known).toBe(1);
  });

  it('a deck with no loaded words reports zero progress, not "unknown and therefore done"', () => {
    expect(deckTally([], { a: known })).toEqual({ seen: 0, known: 0 });
  });

  it('mastery is a fraction of the deck, and an empty deck is never mastered', () => {
    const meta = deck('x', 'Nouns', 0, [word('x-1'), word('x-2'), word('x-3')]);
    // 2/3 = 0.667 clears the 0.6 bar; 1/3 does not.
    expect(isMastered({ known: 1, seen: 3 }, meta)).toBe(false);
    expect(isMastered({ known: 2, seen: 3 }, meta)).toBe(true);
    expect(isMastered({ known: 1, seen: 1 }, deck('e', 'Nouns', 0, []))).toBe(false);
    expect(UNLOCK_KNOWN_FRACTION).toBe(0.6);
  });
});

describe('the band ramp replaces the Settings bands toggle', () => {
  const mixed = deck('m', 'Nouns', 0, [word('m-1'), word('m-2', 'mid'), word('m-3', 'rare')]);

  it('opens bands as the deck is learned', () => {
    expect(bandsForDeck(mixed, 0)).toEqual(['common']);
    expect(bandsForDeck(mixed, 0.4)).toEqual(['common', 'mid']);
    expect(bandsForDeck(mixed, 0.69)).toEqual(['common', 'mid']);
    expect(bandsForDeck(mixed, 0.7)).toEqual(['common', 'mid', 'rare']);
  });

  it('never returns an empty list for a deck with no common words', () => {
    // Colors is the real case: rare and mid but no common.
    const colors = deck('c', 'Nouns', 0, [word('c-1', 'rare'), word('c-2', 'mid')]);
    // Falls back to EVERY band the deck has, not just the one the ramp reached.
    expect(bandsForDeck(colors, 0)).toEqual(['mid', 'rare']);
  });

  it('drops a band the deck does not contain even when the ramp has reached it', () => {
    const commonOnly = deck('o', 'Nouns', 0, [word('o-1')]);
    expect(bandsForDeck(commonOnly, 1)).toEqual(['common']);
  });

  it('the ramp starts at common, so a fresh deck is always playable', () => {
    expect(BAND_RAMP[0]).toEqual({ band: 'common', at: 0 });
  });
});

describe('filterByRamp', () => {
  const words = [
    { band: 'common' as Band, decks: ['a'] },
    { band: 'rare' as Band, decks: ['a'] },
    { band: 'rare' as Band, decks: ['b'] },
  ];
  const bandsOf = (deckId: string, ratio: number) =>
    deckId === 'a' ? bandsForDeck(deck('a', 'Nouns', 0, [word('a-1'), word('a-2', 'rare')]), ratio) : ['rare' as Band];

  it('keeps a word if ANY deck it belongs to allows its band', () => {
    // Deck a is fresh (common only); deck b is a different deck that allows rare.
    const kept = filterByRamp(words, (id) => (id === 'a' ? 0 : 1), bandsOf);
    expect(kept).toEqual([0, 2]);
  });

  it('keeps the rare word once deck a has ramped to rare', () => {
    // Deck b's ratio is 0, and its ramp still allows rare (it has no common
    // band to fall back to), so word 2 stays.
    const kept = filterByRamp(words, (id) => (id === 'a' ? 0.8 : 0), bandsOf);
    expect(kept).toEqual([0, 1, 2]);
  });
});

describe('buildTree unlocking', () => {
  const nouns = ['n1', 'n2', 'n3'].map((id, i) => deck(id, 'Nouns', i, [word(`${id}-w`)]));
  const verbs = ['v1', 'v2'].map((id, i) => deck(id, 'Verbs & Routines', i, [word(`${id}-w`)]));
  const all = [...nouns, ...verbs];

  it('opens the first deck of the first world on a fresh install', () => {
    const tree = buildTree(all, {}, withWords(all, all.flatMap((d) => [word(`${d.id}-w`)])));
    const open = unlockedDeckIds(tree);
    // These fixture ids are not STARTER_DECKS, so the group falls back to
    // opening its first deck rather than showing an empty world.
    expect(open).toEqual(['n1']);
    expect(STARTER_DECKS.some((id) => all.some((d) => d.id === id))).toBe(false);
  });

  it('opens the next deck in a world once the previous one is mastered', () => {
    const words = all.flatMap((d) => [word(`${d.id}-w`)]);
    const progress = { 'n1-w': known };
    const tree = buildTree(all, progress, withWords(all, words));
    expect(unlockedDeckIds(tree)).toContain('n2');
  });

  it('keeps a later world shut until enough decks are mastered', () => {
    const words = all.flatMap((d) => [word(`${d.id}-w`)]);
    const shut = buildTree(all, {}, withWords(all, words));
    expect(unlockedDeckIds(shut)).not.toContain('v1');
  });

  it('reports group progress as known over total words', () => {
    const words = all.flatMap((d) => [word(`${d.id}-w`)]);
    const tree = buildTree(all, { 'n1-w': known }, withWords(all, words));
    const nounGroup = tree.find((g) => g.name === 'Nouns');
    expect(nounGroup?.known).toBe(1);
    expect(nounGroup?.words).toBe(3);
    expect(nounGroup?.progress).toBeCloseTo(1 / 3);
  });

  it('does not invent progress for decks whose words are not loaded', () => {
    const tree = buildTree(all, { 'n1-w': known }, () => []);
    const nounGroup = tree.find((g) => g.name === 'Nouns');
    expect(nounGroup?.known).toBe(0);
    expect(nounGroup?.progress).toBe(0);
  });
});

describe('the HSK ladder opens on its own rung', () => {
  const hsk = ['hsk-1', 'hsk-2', 'hsk-3'].map((id, i) => deck(id, 'HSK', i, [word(`${id}-w`)]));

  it('opens HSK 1 from the start and holds the rest for mastery of the rung below', () => {
    const words = hsk.flatMap((d) => [word(`${d.id}-w`)]);
    const tree = buildTree(hsk, {}, withWords(hsk, words));
    const ladder = tree.find((g) => g.ladder);
    expect(ladder?.nodes.map((n) => [n.deck.id, n.unlocked])).toEqual([
      ['hsk-1', true],
      ['hsk-2', false],
      ['hsk-3', false],
    ]);
  });

  it('opens the next rung once the rung below is mastered', () => {
    const words = hsk.flatMap((d) => [word(`${d.id}-w`)]);
    const tree = buildTree(hsk, { 'hsk-1-w': known }, withWords(hsk, words));
    expect(unlockedDeckIds(tree)).toEqual(['hsk-1', 'hsk-2']);
  });

  it('recognises a ladder deck by group', () => {
    expect(isLadderDeck(hsk[0]!)).toBe(true);
    expect(isLadderDeck(deck('n', 'Nouns', 0, [word('n-w')]))).toBe(false);
  });
});

describe('presentation helpers', () => {
  it('gives every group an icon and an unknown group a fallback', () => {
    expect(groupIcon('Nouns')).not.toBe(groupIcon('HSK'));
    expect(groupIcon('Characters')).toBe('\u{1F4E6}');
  });

  it('counts boxes left to known, never negative', () => {
    expect(boxesToKnown(0)).toBe(REVIEW.knownBox);
    expect(boxesToKnown(REVIEW.knownBox)).toBe(0);
    expect(boxesToKnown(REVIEW.knownBox + 2)).toBe(0);
  });

  it('declares starter decks that exist in the corpus naming style', () => {
    expect(STARTER_DECKS).toContain('hsk-1');
    expect(STARTER_DECKS.length).toBeGreaterThan(1);
  });
});