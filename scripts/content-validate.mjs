#!/usr/bin/env node
/**
 * content:validate — idempotent, runs in CI, EXITS NON-ZERO on any rule failure.
 *
 * A validator that prints errors and exits 0 is gameable (docs/SPEC.md FR-26),
 * so every rule below is a hard failure and one failing fixture per rule lives
 * in tests/content/validator.test.ts.
 *
 * Rules
 *  1. categories.json entries are strict: id/name/group/order, unique ids and names
 *  2. bijection between categories.json ids and content/words/<id>.json filenames
 *  3. word records are strict objects: no unknown keys, no blank required fields
 *  4. band is an enum; zipf is a number in 0..8
 *  5. pinyin is tone-marked pinyin (letters + tone marks + spaces, no digits)
 *  6. ids are globally consistent: one id means one word, everywhere
 *  7. no duplicate id inside a deck
 *  8. a repeated English gloss inside a deck must be marked sharedGloss
 *  9. a repeated Hanzi inside a deck must be marked sharedHanzi
 * 10. the committed golden counts (content/golden/counts.json) still match
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = path.join(ROOT, 'content');
const GOLDEN_FILE = path.join(CONTENT, 'golden', 'counts.json');

// Pinyin is tone-marked (bǎ), tone-neutral (zi), sometimes capitalised (Ānhuī),
// and four 在...上 style pattern entries carry a literal '...' placeholder.
// Latin Extended-B (U+0180-U+024F) is required: ǎ ǐ ǒ ǔ ǚ ǜ live there, not in
// U+00C0-U+017F.
const PY_RE = /^[a-zA-ZüÜ\u00c0-\u024f\p{M}'(). ]+$/u;

const categorySchema = z.strictObject({
  id: z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/, 'id must be kebab-case'),
  name: z.string().min(1),
  group: z.string().min(1),
  order: z.number().int().nonnegative(),
});

const wordSchema = z.strictObject({
  id: z.string().min(1),
  hanzi: z.string().min(1),
  pinyin: z.string().min(1),
  english: z.string().min(1),
  band: z.enum(['common', 'mid', 'rare']),
  zipf: z.number().min(0).max(8),
  sharedGloss: z.boolean().optional(),
  sharedHanzi: z.boolean().optional(),
});

export function validateContent(root = ROOT) {
  const problems = [];
  const push = (where, message) => problems.push(`${where}: ${message}`);

  const categoriesFile = path.join(root, 'content', 'categories.json');
  const wordsDir = path.join(root, 'content', 'words');
  const goldenFile = path.join(root, 'content', 'golden', 'counts.json');

  let categories;
  try {
    categories = JSON.parse(fs.readFileSync(categoriesFile, 'utf8'));
  } catch (error) {
    push('content/categories.json', `unreadable: ${error.message}`);
    return problems;
  }

  const parsed = z.array(categorySchema).safeParse(categories);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      push('content/categories.json', `${issue.path.join('.')} ${issue.message}`);
    }
    return problems;
  }

  const ids = new Set();
  const names = new Set();
  const orders = new Set();
  for (const category of categories) {
    if (ids.has(category.id)) push('content/categories.json', `duplicate id ${category.id}`);
    if (names.has(category.name)) push('content/categories.json', `duplicate name ${category.name}`);
    if (orders.has(category.order)) push('content/categories.json', `duplicate order ${category.order}`);
    ids.add(category.id);
    names.add(category.name);
    orders.add(category.order);
  }

  const files = fs
    .readdirSync(wordsDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();
  const fileSet = new Set(files);

  for (const id of ids) if (!fileSet.has(id)) push('content/words', `missing content/words/${id}.json`);
  for (const id of fileSet) if (!ids.has(id)) push('content/words', `${id}.json is not in categories.json`);

  /** id -> first record seen, for the "one id means one word" rule. */
  const identity = new Map();
  const uniqueIds = new Set();
  let entries = 0;
  const goldenDecks = [];

  for (const id of files) {
    if (!ids.has(id)) continue;
    const file = path.join(wordsDir, `${id}.json`);
    let words;
    try {
      words = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      push(`content/words/${id}.json`, `unreadable: ${error.message}`);
      continue;
    }
    const arrayParse = z.array(wordSchema).safeParse(words);
    if (!arrayParse.success) {
      for (const issue of arrayParse.error.issues) {
        push(`content/words/${id}.json`, `entry ${issue.path.join('.')} ${issue.message}`);
      }
      continue;
    }

    const seenIds = new Set();
    const glosses = new Map();
    const hanzi = new Map();
    const bands = { common: 0, mid: 0, rare: 0 };

    for (const word of words) {
      entries += 1;
      uniqueIds.add(word.id);
      bands[word.band] += 1;

      if (seenIds.has(word.id)) push(`content/words/${id}.json`, `duplicate id in deck: ${word.id}`);
      seenIds.add(word.id);

      if (!PY_RE.test(word.pinyin)) push(`content/words/${id}.json`, `${word.id} has non-pinyin characters: "${word.pinyin}"`);

      const prior = identity.get(word.id);
      if (!prior) {
        identity.set(word.id, word);
      } else {
        for (const field of ['hanzi', 'pinyin', 'english', 'band']) {
          if (prior[field] !== word[field]) {
            push(
              'content/words',
              `id ${word.id} is not one word: ${field} is "${prior[field]}" in one deck and "${word[field]}" in another`,
            );
          }
        }
      }

      const glossList = glosses.get(word.english) ?? [];
      glossList.push(word);
      glosses.set(word.english, glossList);
      const hanziList = hanzi.get(word.hanzi) ?? [];
      hanziList.push(word);
      hanzi.set(word.hanzi, hanziList);
    }

    for (const [gloss, list] of glosses) {
      if (list.length > 1 && list.some((w) => w.sharedGloss !== true)) {
        push(
          `content/words/${id}.json`,
          `ambiguous English gloss "${gloss}" shared by ${list.map((w) => w.id).join(', ')} — disambiguate or mark sharedGloss: true`,
        );
      }
    }
    for (const [character, list] of hanzi) {
      if (list.length > 1 && list.some((w) => w.sharedHanzi !== true)) {
        push(
          `content/words/${id}.json`,
          `duplicate Hanzi ${character} in one deck (${list.map((w) => w.id).join(', ')}) — mark sharedHanzi: true or fix the content`,
        );
      }
    }

    goldenDecks.push({
      id,
      name: categories.find((c) => c.id === id).name,
      group: categories.find((c) => c.id === id).group,
      entries: words.length,
      uniqueWords: seenIds.size,
      bands,
      usableBands: Object.values(bands).filter((n) => n > 0).length,
    });
  }

  let golden;
  try {
    golden = JSON.parse(fs.readFileSync(goldenFile, 'utf8'));
  } catch (error) {
    push('content/golden/counts.json', `unreadable: ${error.message}`);
    return problems;
  }

  const totals = {
    decks: goldenDecks.length,
    entries,
    duplicateEntries: entries - uniqueIds.size,
    uniqueWords: uniqueIds.size,
    bands: {
      common: goldenDecks.reduce((n, d) => n + d.bands.common, 0),
      mid: goldenDecks.reduce((n, d) => n + d.bands.mid, 0),
      rare: goldenDecks.reduce((n, d) => n + d.bands.rare, 0),
    },
  };
  if (JSON.stringify(totals) !== JSON.stringify(golden.totals)) {
    push(
      'content/golden/counts.json',
      `totals drifted — run "npm run content:migrate" if the change is intended.\n    committed: ${JSON.stringify(golden.totals)}\n    computed:  ${JSON.stringify(totals)}`,
    );
  }
  const sortedComputed = goldenDecks.slice().sort((a, b) => a.id.localeCompare(b.id, 'en'));
  const sortedGolden = golden.decks.slice().sort((a, b) => a.id.localeCompare(b.id, 'en'));
  if (JSON.stringify(sortedComputed) !== JSON.stringify(sortedGolden)) {
    const changed = sortedComputed.filter((d, i) => JSON.stringify(d) !== JSON.stringify(sortedGolden[i]));
    push(
      'content/golden/counts.json',
      `per-deck counts drifted for: ${changed.map((d) => d.id).join(', ') || '(ordering)'}`,
    );
  }

  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const problems = validateContent(ROOT);
  if (problems.length) {
    console.error(`content:validate FAILED — ${problems.length} problem(s)`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  const golden = JSON.parse(fs.readFileSync(GOLDEN_FILE, 'utf8'));
  console.log(
    `content:validate OK — ${golden.totals.decks} decks · ${golden.totals.entries} entries · ` +
      `${golden.totals.uniqueWords} unique words · ` +
      `common ${golden.totals.bands.common} / mid ${golden.totals.bands.mid} / rare ${golden.totals.bands.rare}`,
  );
}