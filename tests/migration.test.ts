import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bandFor, buildDecks, migrate, pinyinSlug, plannedWrites, wordId } from '../scripts/content-migrate.mjs';
import { CONTENT_DIR } from './helpers/pool';

describe('band rule (SPEC 4.6)', () => {
  it('splits on the documented Zipf thresholds, inclusively', () => {
    expect(bandFor(6.5)).toBe('common');
    expect(bandFor(5.0)).toBe('common');
    expect(bandFor(4.999)).toBe('mid');
    expect(bandFor(4.2)).toBe('mid');
    expect(bandFor(4.199)).toBe('rare');
    expect(bandFor(0)).toBe('rare');
  });
});

describe('word identity (SPEC 4.2)', () => {
  it('slugs pinyin with tone digits, so two tones of one Hanzi stay distinct', () => {
    expect(pinyinSlug('mǐ fàn')).toBe('mi3-fan4');
    expect(pinyinSlug('yā zi')).toBe('ya1-zi5');
    expect(pinyinSlug('lǜ')).toBe('lv4');
    expect(pinyinSlug('nǚ')).toBe('nv3');
    expect(wordId('中', 'zhōng')).toBe('中-zhong1');
    expect(wordId('中', 'zhòng')).toBe('中-zhong4');
    expect(wordId('中', 'zhōng')).not.toBe(wordId('中', 'zhòng'));
  });

  it('derives ids from the word, never from the deck', () => {
    // 马 lives in Animals and HSK 2; both must produce the same id (SPEC 4.2).
    const { files } = migrate();
    const animals = files.get('animals') ?? [];
    const hsk2 = files.get('hsk-2') ?? [];
    const inAnimals = animals.find((word) => word.hanzi === '马');
    const inHsk = hsk2.find((word) => word.hanzi === '马');
    expect(inAnimals?.id).toBe('马-ma3');
    expect(inHsk?.id).toBe(inAnimals?.id);
  });
});

describe('deck plan', () => {
  it('produces 50 decks and places every POC file', () => {
    const decks = buildDecks();
    expect(decks).toHaveLength(50);
    expect(decks.every((deck) => deck.sources.every((source) => typeof source === 'string'))).toBe(true);
  });

  it('merges the three animal decks into one', () => {
    const decks = buildDecks();
    const animals = decks.find((deck) => deck.id === 'animals');
    expect(animals?.name).toBe('Animals');
    expect(animals?.sources).toHaveLength(3);
  });
});

describe('committed content is exactly what the migration produces', () => {
  // plannedWrites() is the real output: migrate() alone does not carry the
  // extra decks (radicals) that main() appends after it.
  const { writes } = plannedWrites();
  const byName = new Map(
    writes.map(([file, content]) => [file.slice(file.indexOf('content/')), content] as const),
  );
  const categories = JSON.parse(byName.get('content/categories.json') as string);
  const golden = JSON.parse(byName.get('content/golden/counts.json') as string);
  const files = new Map(
    writes
      .map(([file, content]) => [file, content] as const)
      .filter(([file]) => file.includes('/words/'))
      .map(([file, content]) => [file.slice(file.lastIndexOf('/') + 1, -5), content] as const),
  );

  it('matches content/categories.json byte for byte', () => {
    const onDisk = readFileSync(join(CONTENT_DIR, 'categories.json'), 'utf8');
    expect(`${JSON.stringify(categories, null, 2)}\n`).toBe(onDisk);
  });

  it('matches content/golden/counts.json byte for byte', () => {
    const onDisk = readFileSync(join(CONTENT_DIR, 'golden', 'counts.json'), 'utf8');
    expect(`${JSON.stringify(golden, null, 2)}\n`).toBe(onDisk);
  });

  it('matches every content/words/<deck>.json byte for byte', () => {
    // `files` holds the exact text main() would write, so this compares output
    // to output rather than re-serialising and hoping the two agree.
    for (const [deckId, text] of files) {
      const onDisk = readFileSync(join(CONTENT_DIR, 'words', `${deckId}.json`), 'utf8');
      expect(onDisk, `deck ${deckId} drifted from the migration output`).toBe(text);
    }
  });

  it('records the numbers quoted in the migration plan', () => {
    // The POC migration totals from docs/spec/21-content-migration.md, plus the
    // Kangxi radicals deck added 2026-11-01: 214 entries, 214 new word ids (they
    // are characters nothing else in the corpus teaches), so unique words rose
    // by exactly 214 while the cross-deck repeats stayed at 736.
    expect(golden.totals.decks).toBe(51);
    expect(golden.totals.entries).toBe(3295);
    expect(golden.totals.uniqueWords).toBe(2559);
    expect(golden.totals.duplicateEntries).toBe(736);
    expect(golden.totals.bands).toEqual({ common: 1111, mid: 1181, rare: 1003 });
  });
});

describe('migration findings', () => {
  const { report } = migrate();

  it('removes exactly the six duplicate pairs the audit found', () => {
    expect(report.inFileDuplicatesRemoved).toHaveLength(6);
    expect(report.inFileDuplicatesRemoved.map((entry) => entry.id).sort()).toEqual(
      [
        '不客气-bu2-ke4-qi4',
        '在...上-zai4-shang4',
        '庞大-pang2-da4',
        '游泳-you2-yong3',
        '注意-zhu4-yi4',
        '旁边-pang2-bian1',
      ].sort(),
    );
  });

  it('adds the 45 planned expansion words and marks the 56 gloss collisions', () => {
    expect(report.expansionWordsAdded).toHaveLength(45);
    expect(report.ambiguousGlosses).toHaveLength(56);
    expect(report.zipfMismatches).toEqual([]);
    expect(report.zeroFrequency).toEqual([]);
  });

  it('leaves no same-deck Hanzi pair for the player to guess between', () => {
    expect(report.sameDeckHanziPairs).toEqual([]);
  });
});