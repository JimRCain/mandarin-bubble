# Mandarin Bubble

A Mandarin vocabulary trainer disguised as an arcade game.

Bubbles fall, each carrying a Hanzi. The prompt at the top gives you the English
gloss (and pinyin, if you want it). Tap the bubble that matches. Correct pops it
and steps the combo up; wrong costs you two seconds and resets the streak.

The game is the point. Drill apps are a chore you schedule; this is a thing you
play for ninety seconds while the kettle boils. The vocabulary is arranged so
that ninety seconds is not a waste of time.

## Status

Iteration 1: skeleton and the playable loop, single-category sessions.

- 50 decks, 3081 entries, 2345 unique words migrated from the POC corpus
- banding from corpus frequency (wordfreq Zipf), never from HSK level
- spaced repetition is stored and consumed by the selector
- pre-rendered audio clips: manifest-gated, silent until the batch job runs

The spec lives in `docs/SPEC.md`; the migration plan in
`docs/spec/21-content-migration.md`; how the work is run in `docs/HANDOFF.md`.

## Running it

```
npm install
npm run dev          # local dev server
npm run build        # production build into dist/
npm run preview      # serve the production build
```

Checks:

```
npm run typecheck    # tsc --noEmit
npm test             # unit tests (vitest)
npm run test:e2e     # golden loop, against the production build
npm run content:validate
```

## Content pipeline

The corpus is committed, not generated at build time.

| Command | What it does |
| --- | --- |
| `npm run content:migrate` | **one shot.** Turns `content/_source/poc-vocabulary/` into `content/words/*.json`. Output is committed and diffed in CI. |
| `npm run content:validate` | idempotent, runs in CI, **exits non-zero** on any rule failure |
| `npm run content:build` | publishes validated content as static JSON under `public/content/` |

`content:validate` failing is a red build, not a warning. A validator that
prints problems and exits 0 is worse than no validator: it looks like coverage.

Word identity is derived from the word itself (`<hanzi>-<pinyin-with-tone-digits>`),
never from the deck it happens to sit in, so a word can appear in several decks
without forking into several words. Where the POC corpus glossed one word two
ways, the migration picks one gloss by a fixed, order-independent rule; the three
genuine homographs (a license-plate province abbreviation sharing Hanzi *and*
pinyin with a common word) are split into their own ids in
`scripts/data/gloss-overrides.json`. Both decisions are recorded in
`content/_reports/migration-report.json`.

## Architecture

```
src/game/     pure game core: typed, deterministic, no React, no DOM
src/store/    versioned local persistence, degrades to memory
src/content.ts  lazy per-deck content loading
src/audio.ts    pre-rendered clips + feedback tones
src/components/ React UI (the only layer allowed to know about the DOM)
```

Two rules hold the core together:

1. **No clock and no randomness in the game layer.** Time and RNG are injected.
   That is what makes exact-delta unit tests and one deterministic golden e2e
   possible. `tests/hygiene.test.ts` scans the source and fails the build if a
   forbidden call appears outside the allowed layers.
2. **The board is not React state.** Bubble positions live in the engine and are
   written to the DOM by the render loop. Re-rendering per frame is how taps end
   up hit-testing stale coordinates.

## License

MIT.