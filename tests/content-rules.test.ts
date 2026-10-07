import { describe, expect, it } from 'vitest';
import { validateContent } from '../scripts/content-validate.mjs';
import { buildPoolWords, deckIds, readCategories, readDeck, readGolden } from './helpers/pool';

describe('content validator (FR-26)', () => {
  it('passes on the committed corpus', () => {
    expect(validateContent()).toEqual([]);
  });

  it('reports the corpus it actually checked', () => {
    const golden = readGolden();
    expect(golden.totals.decks).toBe(50);
    expect(golden.totals.entries).toBe(3081);
    expect(golden.totals.uniqueWords).toBe(2345);
  });
});

describe('corpus properties the game depends on', () => {
  const pool = buildPoolWords();

  it('has one file per deck and one deck per file (bijection)', () => {
    const files = deckIds();
    const categories = readCategories();
    expect(files).toEqual(categories.map((deck) => deck.id).sort());
    expect(new Set(categories.map((deck) => deck.id)).size).toBe(categories.length);
  });

  it('keeps every deck id slug-safe and every word id derived from its Hanzi', () => {
    for (const deckId of deckIds()) {
      expect(deckId).toMatch(/^[a-z0-9-]+$/);
      for (const word of readDeck(deckId)) {
        expect(word.id.startsWith(`${word.hanzi}-`)).toBe(true);
        expect(word.id).toMatch(/^.+-\S+$/);
      }
    }
  });

  it('never repeats a word id inside a deck', () => {
    for (const deckId of deckIds()) {
      const ids = readDeck(deckId).map((word) => word.id);
      expect(new Set(ids).size, `duplicate id in ${deckId}`).toBe(ids.length);
    }
  });

  it('keeps a word identical wherever it appears', () => {
    const seen = new Map<string, string>();
    for (const deckId of deckIds()) {
      for (const word of readDeck(deckId)) {
        const fingerprint = JSON.stringify([word.hanzi, word.pinyin, word.english, word.band, word.zipf]);
        const prior = seen.get(word.id);
        if (prior === undefined) seen.set(word.id, fingerprint);
        else expect(fingerprint, `${word.id} differs between decks`).toBe(prior);
      }
    }
  });

  it('bands every word by the committed Zipf score, with no HSK leftovers', () => {
    for (const deckId of deckIds()) {
      for (const word of readDeck(deckId)) {
        const expected = word.zipf >= 5 ? 'common' : word.zipf >= 4.2 ? 'mid' : 'rare';
        expect(word.band, `${word.id} band disagrees with its Zipf ${word.zipf}`).toBe(expected);
      }
    }
  });

  it('gives every word a non-blank Hanzi, pinyin and English gloss', () => {
    for (const word of pool) {
      expect(word.hanzi.trim()).not.toBe('');
      expect(word.pinyin.trim()).not.toBe('');
      expect(word.english.trim()).not.toBe('');
      // Same character class as scripts/content-validate.mjs: tone marks reach
      // into Latin Extended-B and Hangul-style combining marks; \p{M} keeps the
      // intent explicit instead of spelling out a combining range.
      expect(word.pinyin).toMatch(/^[a-zA-Zü\u00c0-\u024f\p{M}'(). ]+$/u);
      expect(word.pinyin).not.toMatch(/[0-9]/);
    }
  });

  it('marks every same-deck gloss collision instead of hiding it', () => {
    for (const deckId of deckIds()) {
      const words = readDeck(deckId);
      const byGloss = new Map<string, number>();
      for (const word of words) byGloss.set(word.english, (byGloss.get(word.english) ?? 0) + 1);
      for (const word of words) {
        if ((byGloss.get(word.english) ?? 0) > 1) {
          expect(word.sharedGloss, `${word.id} shares a gloss in ${deckId} without being marked`).toBe(true);
        }
      }
    }
  });

  it('matches the golden counts file it ships with (FR-27)', () => {
    const golden = readGolden();
    expect(golden.totals.decks).toBe(50);
    expect(golden.totals.uniqueWords).toBe(2345);
    for (const deck of golden.decks) {
      const words = readDeck(deck.id);
      expect(words.length, `entry count drift in ${deck.id}`).toBe(deck.entries);
      const bands = { common: 0, mid: 0, rare: 0 } as Record<string, number>;
      for (const word of words) bands[word.band] = (bands[word.band] ?? 0) + 1;
      expect(bands).toEqual(deck.bands);
    }
  });

  it('offers a first-run deck with enough unambiguous words to play', () => {
    const starter = readDeck('hsk-1');
    expect(starter.length).toBeGreaterThanOrEqual(30);
    const distinctGlosses = new Set(starter.map((word) => word.english));
    expect(distinctGlosses.size).toBeGreaterThan(100);
  });
});