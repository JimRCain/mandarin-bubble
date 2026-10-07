#!/usr/bin/env node
/**
 * content:migrate — ONE SHOT, output committed.
 *
 * Turns the frozen POC corpus (content/_source/poc-vocabulary/*.json) into the
 * v1 content model described in docs/SPEC.md sections 4.1-4.6, following the
 * deck/band plan in docs/spec/21-content-migration.md:
 *
 *   - category identity gets exactly one home (content/categories.json)
 *   - word ids derive from the word itself, never from its deck (SPEC 4.2)
 *   - bands come from corpus frequency (wordfreq Zipf, committed in
 *     content/_source/zipf.json), not from HSK level
 *   - the three animal decks merge into one playable deck
 *   - the 45 deck-expansion words are added
 *   - explicit duplicate pairs are removed; every remaining ambiguity is
 *     reported and marked in the data instead of being silently playable
 *
 * Deliberately NOT part of the CI path: content:validate and content:build are
 * idempotent, this is not (SPEC 4.4: a rebuild must never re-clobber curated
 * content).
 *
 *   node scripts/content-migrate.mjs [--check]
 *
 * --check fails if the committed output would change (used by tests).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = path.join(ROOT, 'content', '_source', 'poc-vocabulary');
const ZIPF_FILE = path.join(ROOT, 'content', '_source', 'zipf.json');
const ADDED_FILE = path.join(ROOT, 'scripts', 'data', 'added-words.json');
const OVERRIDES_FILE = path.join(ROOT, 'scripts', 'data', 'gloss-overrides.json');
const CATEGORIES_FILE = path.join(ROOT, 'content', 'categories.json');
const WORDS_DIR = path.join(ROOT, 'content', 'words');
const GOLDEN_FILE = path.join(ROOT, 'content', 'golden', 'counts.json');
const REPORT_DIR = path.join(ROOT, 'content', '_reports');

const CHECK = process.argv.includes('--check');

/** Band thresholds — docs/SPEC.md 4.6. */
export const BANDS = { common: 5.0, mid: 4.2 };

export function bandFor(zipf) {
  if (zipf >= BANDS.common) return 'common';
  if (zipf >= BANDS.mid) return 'mid';
  return 'rare';
}

/** POC group headers, in menu order (CategoryMenu.tsx GROUPS). */
const GROUPS = [
  {
    name: 'Nouns',
    decks: [
      'Colors', 'Numbers (1-20)', 'Family (immediate)', 'Animals (pets)', 'Animals (farm)',
      'Animals (wild basic)', 'Fruits', 'Vegetables', 'Food', 'Drinks', 'Clothing',
      'House-rooms', 'Furniture', 'School objects', 'Hobbies', 'Sports', 'Body parts', 'Health',
    ],
  },
  {
    name: 'Verbs & Routines',
    decks: [
      'Daily routines', 'Body actions (run, jump, sit, clap, etc.)', 'Communication verbs',
      'Mental verbs', 'Sensory verbs', 'Cooking & household verbs', 'Modal verbs',
      'Emotion-state verbs',
    ],
  },
  {
    name: 'Adjectives & Emotions',
    decks: ['Emotions', 'Size-shape', 'Opposites', 'Personality traits', 'Physical conditions', 'Nationalities & languages'],
  },
  {
    name: 'Time, Weather, Nature',
    decks: ['Weather', 'Nature', 'Days of week', 'Months-seasons', 'Time expressions (relative)', 'Frequency adverbs'],
  },
  {
    name: 'Social & Travel',
    decks: ['Greetings-polite-phrases', 'Transportation', 'Occupations (basic)', 'Social activities', 'Travel & directions', 'Shopping & money', 'Chinese license plates'],
  },
  { name: 'HSK', decks: ['HSK 1', 'HSK 2', 'HSK 3', 'HSK 4', 'HSK 5'] },
  { name: 'Grammar & Function Words', decks: ['Common adverbs of degree', 'Prepositions & location words'] },
];

/** POC source file -> deck id. Only where slugging the name is wrong or a merge is wanted. */
const ID_OVERRIDES = {
  'Animals (pets)': 'animals',
  'Animals (farm)': 'animals',
  'Animals (wild basic)': 'animals',
  'Family (immediate)': 'family',
  'Body actions (run, jump, sit, clap, etc.)': 'body-actions',
  'Prepositions & location words': 'prepositions-location-words',
  'Numbers (1-20)': 'numbers-1-20',
  'Chinese license plates': 'license-plates',
  'Nationalities & languages': 'nationalities-languages',
  'Cooking & household verbs': 'cooking-household-verbs',
  'Common adverbs of degree': 'adverbs-of-degree',
  'Time expressions (relative)': 'time-expressions',
  'Occupations (basic)': 'occupations',
  'Shopping & money': 'shopping-money',
  'Travel & directions': 'travel-directions',
  'Days of week': 'days-of-week',
  'Personality traits': 'personality-traits',
  'Physical conditions': 'physical-conditions',
  'Emotion-state verbs': 'emotion-state-verbs',
  'School objects': 'school-objects',
  'Social activities': 'social-activities',
  'Frequency adverbs': 'frequency-adverbs',
  'Mental verbs': 'mental-verbs',
  'Modal verbs': 'modal-verbs',
  'Sensory verbs': 'sensory-verbs',
  'Communication verbs': 'communication-verbs',
  'Daily routines': 'daily-routines',
  'House-rooms': 'house-rooms',
  'Months-seasons': 'months-seasons',
  'Size-shape': 'size-shape',
  'Greetings-polite-phrases': 'greetings-polite-phrases',
};

/** Display name when the merged id differs from a single POC filename. */
const NAME_OVERRIDES = { animals: 'Animals' };

const TONE_MARKS = {
  ā: ['a', 1], á: ['a', 2], ǎ: ['a', 3], à: ['a', 4],
  ē: ['e', 1], é: ['e', 2], ě: ['e', 3], è: ['e', 4],
  ī: ['i', 1], í: ['i', 2], ǐ: ['i', 3], ì: ['i', 4],
  ō: ['o', 1], ó: ['o', 2], ǒ: ['o', 3], ò: ['o', 4],
  ū: ['u', 1], ú: ['u', 2], ǔ: ['u', 3], ù: ['u', 4],
  ǖ: ['v', 1], ǘ: ['v', 2], ǚ: ['v', 3], ǜ: ['v', 4], ü: ['v', 5],
  ń: ['n', 2], ň: ['n', 3], ǹ: ['n', 4], ḿ: ['m', 2],
};

/** 'mǐ fàn' -> 'mi3-fan4'. Tone digits keep ids collision-free (中 zhōng vs zhòng). */
export function pinyinSlug(pinyin) {
  return pinyin
    .trim()
    .split(/\s+/)
    .map((syllable) => {
      let tone = 5;
      let plain = '';
      for (const ch of syllable) {
        const mark = TONE_MARKS[ch];
        if (mark) {
          tone = mark[1];
          plain += mark[0];
        } else {
          plain += ch;
        }
      }
      const letters = plain.toLowerCase().replace(/[^a-z]/g, '');
      // The four 在...上 style pattern entries carry a literal '...' placeholder.
      // It contributes no syllable, so it must not mint a phantom tone-5 id
      // segment (在...上 -> zai4-dd5-shang4 before this guard).
      return letters === '' ? '' : `${letters}${tone}`;
    })
    .filter((part) => part !== '')
    .join('-');
}

/**
 * Pick the one English gloss a word id will carry everywhere (SPEC 4.2).
 *
 * Rule, in order: prefer a gloss with no 'to ' prefix, then no '/', then no
 * bracket, then no comma, then the shortest, then alphabetical. Order
 * independent on purpose, so the choice does not depend on which deck happened
 * to be read first.
 */
export function pickCanonicalGloss(candidates) {
  const score = (gloss) => [
    /^to\s/.test(gloss) ? 1 : 0,
    gloss.includes('/') ? 1 : 0,
    /[()]/.test(gloss) ? 1 : 0,
    gloss.includes(',') ? 1 : 0,
    gloss.length,
  ];
  return candidates
    .slice()
    .sort((a, b) => {
      const left = score(a);
      const right = score(b);
      for (let i = 0; i < left.length; i += 1) {
        if (left[i] !== right[i]) return left[i] - right[i];
      }
      return a.localeCompare(b, 'en');
    })[0];
}

export function wordId(hanzi, pinyin) {
  return `${hanzi}-${pinyinSlug(pinyin)}`;
}

/**
 * Display pinyin. The POC corpus mixes full-width （） into what is otherwise a
 * Latin string (花（钱）), so the field is normalised once, here.
 */
export function normalizePinyin(pinyin) {
  return pinyin
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/\s+/g, ' ')
    .trim();
}

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function listSourceFiles() {
  return fs
    .readdirSync(SOURCE_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();
}

export function buildDecks() {
  const files = listSourceFiles();
  const byName = new Map(files.map((f) => [f.replace(/\.json$/, ''), f]));
  const decks = [];
  const used = new Set();

  GROUPS.forEach((group, groupIndex) => {
    for (const name of group.decks) {
      const id = ID_OVERRIDES[name] ?? slug(name);
      used.add(name);
      const existing = decks.find((d) => d.id === id);
      if (existing) {
        existing.sources.push(byName.get(name));
        continue;
      }
      decks.push({
        id,
        name: NAME_OVERRIDES[id] ?? name,
        group: group.name,
        groupOrder: groupIndex,
        order: decks.length,
        sources: [byName.get(name)],
      });
    }
  });

  const orphans = files.filter((f) => !used.has(f.replace(/\.json$/, '')));
  if (orphans.length) {
    throw new Error(`POC files not placed by the group table: ${orphans.join(', ')}`);
  }
  return decks;
}

export function migrate() {
  const zipf = readJson(ZIPF_FILE);
  const added = readJson(ADDED_FILE).words;
  const overrides = readJson(OVERRIDES_FILE);
  const decks = buildDecks();
  const nameToId = new Map(Object.entries(ID_OVERRIDES));
  const report = {
    generatedBy: 'scripts/content-migrate.mjs',
    source: 'content/_source/poc-vocabulary + scripts/data/added-words.json',
    inFileDuplicatesRemoved: [],
    expansionWordsAdded: [],
    ambiguousGlosses: [],
    sameDeckHanziPairs: [],
    zipfMismatches: [],
    zeroFrequency: [],
  };

  const categories = decks.map((d) => ({
    id: d.id,
    name: d.name,
    group: d.group,
    order: d.order,
  }));

  const perDeck = new Map();

  for (const deck of decks) {
    const seen = new Set();
    const rows = [];
    for (const file of deck.sources) {
      for (const entry of readJson(path.join(SOURCE_DIR, file))) {
        const hanzi = String(entry.hanzi ?? '').trim();
        const pinyin = String(entry.pinyin ?? '').trim();
        const english = String(entry.english ?? '').trim();
        const key = wordId(hanzi, pinyin);
        if (seen.has(key)) {
          report.inFileDuplicatesRemoved.push({ file, id: key });
          continue;
        }
        seen.add(key);
        rows.push({ id: key, hanzi, pinyin: normalizePinyin(pinyin), english, added: false });
      }
    }
    perDeck.set(deck.id, rows);
  }

  for (const entry of added) {
    const deckId = nameToId.get(entry.deck) ?? slug(entry.deck);
    const rows = perDeck.get(deckId);
    if (!rows) throw new Error(`expansion word targets unknown deck: ${entry.deck}`);
    const id = wordId(entry.hanzi, entry.pinyin);
    const known = zipf[entry.hanzi];
    if (known === undefined) throw new Error(`no Zipf score for expansion word ${entry.hanzi}`);
    if (Math.abs(known - entry.specZipf) > 0.011) {
      report.zipfMismatches.push({ hanzi: entry.hanzi, spec: entry.specZipf, computed: known });
    }
    const computedBand = bandFor(known);
    // The migration plan (docs/spec/21-content-migration.md) predates the band
    // rename in SPEC 4.6 and still labels buckets simple/medium/hard.
    const PLAN_BANDS = { simple: 'common', medium: 'mid', hard: 'rare' };
    if (computedBand !== (PLAN_BANDS[entry.specBand] ?? entry.specBand)) {
      report.zipfMismatches.push({ hanzi: entry.hanzi, specBand: entry.specBand, computedBand });
    }
    const existing = rows.find((r) => r.id === id);
    if (existing) {
      // 可乐 is already in the corpus: adding it to another deck must not fork
      // its identity (SPEC 4.2), so this is a no-op beyond deck membership.
      report.expansionWordsAdded.push({ deck: deckId, id, note: 'already in corpus' });
      continue;
    }
    rows.push({ id, hanzi: entry.hanzi, pinyin: entry.pinyin, english: entry.english, added: true });
    report.expansionWordsAdded.push({ deck: deckId, id });
  }

  // --- Identity, part 2: one id means one word (SPEC 4.2) --------------------
  // The POC corpus glossed the same word differently in different decks ("to
  // hold" in one, "to take" in another): 331 occurrences across 265 ids. One id
  // may carry only one gloss, so the whole corpus is normalised here, before
  // the per-deck ambiguity marks are computed.
  report.splitIdsApplied = [];
  report.glossConflictsResolved = [];

  // Genuine homographs go first: 新 as a plate abbreviation is a different word
  // from 新 'new' even though hanzi and pinyin are identical.
  for (const split of overrides.splitIds) {
    const deckId = nameToId.get(split.deck) ?? slug(split.deck);
    const rows = perDeck.get(deckId);
    if (!rows) throw new Error(`splitIds targets unknown deck: ${split.deck}`);
    const row = rows.find((r) => r.hanzi === split.hanzi && r.pinyin === split.pinyin);
    if (!row) throw new Error(`splitIds target not found: ${split.hanzi} in ${split.deck}`);
    report.splitIdsApplied.push({ deck: deckId, from: row.id, to: split.id, english: split.english });
    row.id = split.id;
    row.english = split.english;
  }

  const glossChoices = new Map();
  for (const rows of perDeck.values()) {
    for (const row of rows) {
      const set = glossChoices.get(row.id) ?? new Set();
      set.add(row.english);
      glossChoices.set(row.id, set);
    }
  }
  const canonicalGloss = new Map();
  for (const [id, set] of glossChoices) {
    const explicit = overrides.canonicalGloss[id];
    canonicalGloss.set(id, explicit ?? pickCanonicalGloss([...set]));
  }
  for (const [deckId, rows] of perDeck) {
    for (const row of rows) {
      const chosen = canonicalGloss.get(row.id);
      if (chosen !== row.english) {
        report.glossConflictsResolved.push({ deck: deckId, id: row.id, from: row.english, to: chosen });
        row.english = chosen;
      }
    }
  }

  const asWord = (row) => {
    const z = zipf[row.hanzi];
    if (z === undefined) throw new Error(`no Zipf score for ${row.hanzi} (${row.id})`);
    if (z === 0) report.zeroFrequency.push(row.id);
    return {
      id: row.id,
      hanzi: row.hanzi,
      pinyin: row.pinyin,
      english: row.english,
      band: bandFor(z),
      zipf: z,
    };
  };

  const files = new Map();
  for (const deck of decks) {
    const rows = perDeck.get(deck.id);
    const words = rows.map(asWord);

    const byGloss = new Map();
    for (const w of words) {
      const list = byGloss.get(w.english) ?? [];
      list.push(w);
      byGloss.set(w.english, list);
    }
    for (const [gloss, list] of byGloss) {
      if (list.length > 1) {
        // Ambiguity is a data fact, not a code fact: mark it so the validator
        // demands a decision, and so target selection can exclude the round
        // (SPEC FR-10). A hand pass through _reports/ is the real fix.
        for (const w of list) w.sharedGloss = true;
        report.ambiguousGlosses.push({
          deck: deck.id,
          english: gloss,
          ids: list.map((w) => w.id),
        });
      }
    }

    const byHanzi = new Map();
    for (const w of words) {
      const list = byHanzi.get(w.hanzi) ?? [];
      list.push(w);
      byHanzi.set(w.hanzi, list);
    }
    for (const [hanzi, list] of byHanzi) {
      if (list.length > 1) {
        for (const w of list) w.sharedHanzi = true;
        report.sameDeckHanziPairs.push({ deck: deck.id, hanzi, ids: list.map((w) => w.id) });
      }
    }

    words.sort((a, b) => a.id.localeCompare(b.id, 'en'));
    files.set(deck.id, words);
  }

  const uniqueIds = new Set();
  let entries = 0;
  const goldenDecks = [];
  for (const deck of decks) {
    const words = files.get(deck.id);
    entries += words.length;
    const bands = { common: 0, mid: 0, rare: 0 };
    for (const w of words) {
      uniqueIds.add(w.id);
      bands[w.band] += 1;
    }
    goldenDecks.push({
      id: deck.id,
      name: deck.name,
      group: deck.group,
      entries: words.length,
      uniqueWords: new Set(words.map((w) => w.id)).size,
      bands,
      usableBands: Object.values(bands).filter((n) => n > 0).length,
    });
  }

  const golden = {
    generatedBy: 'scripts/content-migrate.mjs — do not edit by hand; CI diffs this file',
    source: 'POC corpus snapshot 2026-10-05 + 45 expansion words',
    totals: {
      decks: decks.length,
      entries,
      duplicateEntries: entries - uniqueIds.size,
      uniqueWords: uniqueIds.size,
      bands: {
        common: goldenDecks.reduce((n, d) => n + d.bands.common, 0),
        mid: goldenDecks.reduce((n, d) => n + d.bands.mid, 0),
        rare: goldenDecks.reduce((n, d) => n + d.bands.rare, 0),
      },
    },
    decks: goldenDecks,
  };

  return { categories, files, golden, report };
}

function main() {
  const { categories, files, golden, report } = migrate();
  const writes = [
    [CATEGORIES_FILE, JSON.stringify(categories, null, 2) + '\n'],
    [path.join(GOLDEN_FILE), JSON.stringify(golden, null, 2) + '\n'],
    [path.join(REPORT_DIR, 'migration-report.json'), JSON.stringify(report, null, 2) + '\n'],
  ];
  for (const [id, words] of files) {
    writes.push([path.join(WORDS_DIR, `${id}.json`), JSON.stringify(words, null, 2) + '\n']);
  }

  if (CHECK) {
    const stale = writes.filter(([file, content]) => {
      const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
      return current !== content;
    });
    if (stale.length) {
      console.error(`content:migrate --check FAILED — ${stale.length} file(s) differ:`);
      for (const [file] of stale.slice(0, 10)) console.error(`  ${path.relative(ROOT, file)}`);
      process.exit(1);
    }
    console.log(`content:migrate --check OK (${writes.length} files)`);
    return;
  }

  for (const [file, content] of writes) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }

  const { totals } = golden;
  console.log(
    `migrated ${totals.decks} decks · ${totals.entries} entries · ${totals.uniqueWords} unique words ` +
      `(${totals.duplicateEntries} cross-deck repeats)`,
  );
  console.log(`bands: common ${totals.bands.common} · mid ${totals.bands.mid} · rare ${totals.bands.rare}`);
  console.log(`report: ${path.relative(ROOT, path.join(REPORT_DIR, 'migration-report.json'))}`);
  if (report.zipfMismatches.length) {
    console.warn(`WARNING: ${report.zipfMismatches.length} Zipf/band mismatch(es) vs the plan`);
  }
  if (report.sameDeckHanziPairs.length) {
    console.warn(`WARNING: ${report.sameDeckHanziPairs.length} same-deck Hanzi pair(s) — needs a hand pass`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();