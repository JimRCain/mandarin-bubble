#!/usr/bin/env node
/**
 * content:build — idempotent, runs in CI and before dev/build.
 *
 * Publishes the validated content as static JSON under public/content/ so the
 * app fetches word data lazily per deck instead of bundling 300 KB of JSON into
 * the JS payload (docs/SPEC.md 5.1: initial JS+CSS <= 300 KB gzip, no bundle
 * over 150 KB gzip).
 *
 * Fails loudly rather than publishing invalid content, so a broken corpus can
 * never reach the browser.
 *
 *   node scripts/content-build.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateContent } from './content-validate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'content');

const problems = validateContent(ROOT);
if (problems.length) {
  console.error(`content:build aborted — content:validate failed with ${problems.length} problem(s)`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

const categories = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'categories.json'), 'utf8'));
const golden = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'golden', 'counts.json'), 'utf8'));
const goldenById = new Map(golden.decks.map((d) => [d.id, d]));

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'words'), { recursive: true });

const indexPath = path.join(OUT, 'index.json');
const decks = categories
  .slice()
  .sort((a, b) => a.order - b.order)
  .map((category) => {
    const stats = goldenById.get(category.id);
    return {
      id: category.id,
      name: category.name,
      group: category.group,
      order: category.order,
      entries: stats.entries,
      uniqueWords: stats.uniqueWords,
      bands: stats.bands,
      usableBands: stats.usableBands,
    };
  });

fs.writeFileSync(
  indexPath,
  JSON.stringify(
    {
      contentVersion: 1,
      generatedBy: 'scripts/content-build.mjs',
      totals: golden.totals,
      decks,
    },
    null,
    1,
  ) + '\n',
);

let bytes = 0;
for (const category of categories) {
  const source = path.join(ROOT, 'content', 'words', `${category.id}.json`);
  const target = path.join(OUT, 'words', `${category.id}.json`);
  fs.copyFileSync(source, target);
  bytes += fs.statSync(target).size;
}

console.log(
  `content:build OK — public/content/index.json + ${categories.length} deck files (${(bytes / 1024).toFixed(0)} KiB raw)`,
);