# Round 2 adversarial critique — engineering / delivery lens

Independent agent, **distinct model lineage from round 1**. Brief: find what is wrong with `SPEC.md` (then v1) and say nothing about what is fine. Raw findings as returned. Dispositions are in `SPEC.md` §11.2.

> **Accuracy note.** This critic's *existence* claims about duplicate and ambiguous content were correct and valuable. Its **counts were low**: it reported 385 shared Hanzi and 391 duplicate entries; the verified truth is **588** and **1,333**. It also correctly caught four errors in the spec author's own audit (§11.3). Scripts to reproduce: `~/.hermes/cache/scratch/audit-v2.mjs`.

---

## 1. [BLOCKER] FR-7 / FR-17
**Problem.** Content already breaks FR-7: 56 English strings map to multiple Hanzi in one category (HSK 5 "to visit" → 访问/参观/探望), so two bubbles match a target. FR-17 lists no invariant for this, nor for the 385 hanzi shared between HSK and topical decks.

**Change.** Add validator invariants (one target→one word-id; globally unique ids; flag ambiguous English and cross-category hanzi) and hand-disambiguate the 56 groups during migration.

## 2. [BLOCKER] §4.1
**Problem.** Ids like `food-rice-cooked` embed the category; 385 hanzi overlap HSK and topical decks, so one word gets two ids and FR-14 accuracy plus FR-15 weighting fork per-id.

**Change.** Make ids category-independent (`米饭-mi-fan`) and globally unique; keep a sidecar id map so re-sourcing never renumbers.

## 3. [BLOCKER] §2.3 / §10
**Problem.** The audit is wrong: 52 content files (not 51), 12 null-category files (not 13), 5 filename↔category mismatches (not 1). Planning numbers can't be trusted.

**Change.** Regenerate the audit, publish the per-file delta table, and size phase 2 from the corrected figures.

## 4. [BLOCKER] FR-17
**Problem.** Validator is gameable: script prints errors but exits 0; a `.passthrough()`/optional Zod schema passes blanks; only within-category rules run. No rule for duplicate id, blank pinyin, or bad difficulty token.

**Change.** Exit non-zero; one failing CI fixture per rule; all fields required, enums for difficulty, unknown keys rejected.

## 5. [BLOCKER] §8 phase 2
**Problem.** "Migration of the 3,042 words" is one line but hides: reconcile 52 categories, dedupe 6 in-file and 385 cross-file hanzi, disambiguate 56 English groups, re-derive 1,707 HSK difficulties, generate ids, author schema/guide. It is the biggest workstream.

**Change.** Split into 2a (schema/validator/registry) and 2b (reconcile/dedupe/disambiguate), and size 2b in words touched.

## 6. [MAJOR] §2.3 defect 1 / FR-3
**Problem.** The unreachable category is caused by filename→display-name normalization whose override map misses `Food.json` and matches `Numbers` via a non-breaking hyphen; a name-based migration repeats this at scale.

**Change.** Use registry ids only; add a migration test asserting a bijection between `categories.json` ids and `words/<id>.json`.

## 7. [MAJOR] FR-7
**Problem.** Five files hold duplicate hanzi (不客气, 游泳, 注意, 在...上, 旁边, 庞大) and select-all collides the 385 shared hanzi, so single-match is false even with correct code.

**Change.** Dedupe on migration; property-test that every category set × difficulty yields exactly one correct candidate.

## 8. [MAJOR] FR-4
**Problem.** Pool-size display is gameable: sum(words) of selected categories, ignoring difficulty band and dedup.

**Change.** Compute the count with the same selector that spawns; e2e asserts it equals distinct spawnable ids and changes with difficulty.

## 9. [MAJOR] FR-6
**Problem.** Implementation can filter by category only and ignore difficulty (the POC bug) and still pass a smoke test.

**Change.** Unit-test that every spawned word's band equals the selection; e2e runs medium and hard.

## 10. [MAJOR] FR-8 / defect 9
**Problem.** Score can look right while the numeric update is swallowed inside a state updater; "no console errors" won't catch it.

**Change.** Assert exact deltas (+10/−20, +20/−40, +40/−80) in reducer unit tests and the on-screen score in e2e.

## 11. [MAJOR] FR-9 / FR-10
**Problem.** FR-9 claimable via CSS `pointer-events` only (fails keyboard/rapid taps); FR-10 pause can freeze rendering while spawn/fall timers run and `visibilitychange` misses window blur.

**Change.** Reducer-level tap guard by word-id; pause must stop the game clock and handle both blur events; e2e fires two taps in the same frame and blur/focus 10×.

## 12. [MAJOR] FR-11 / FR-13 / FR-14
**Problem.** Replay can be a silent no-op when audio is missing (AR-4 hides it); summary can use last-round counters; persistence can write but never rehydrate or use sessionStorage.

**Change.** Unit-test replay passes the target hanzi; snapshot a scripted session's summary; Vitest round-trip plus Playwright hard-reload asserting restored accuracy.

## 13. [MAJOR] NFR-1
**Problem.** "<2.5 s on a mid-range phone over 4G / 60 fps / no per-frame React render" is unmeasurable in a solo CI, so it is unfalsifiable.

**Change.** Demote to a one-time Lighthouse budget plus a dev render-count assertion; keep out of required CI gates.

## 14. [MAJOR] NFR-3
**Problem.** "CI blocks merge on failure" is a branch-protection setting, not code; without required checks red CI still merges, and a title-loading smoke test passes it.

**Change.** Enable required status checks on the default branch; require an e2e that plays one full scored round.

## 15. [MAJOR] NFR-6 / NFR-5 / NFR-8
**Problem.** Over-scoped for a solo v1: a service worker can cache the shell but not content/audio (offline play dies, cache-versioning bugs, no offline test); an aria pass can claim a11y while focus never moves and reduced-motion is unused; i18n-ready is YAGNI given Q2.

**Change.** Drop NFR-8; reduce NFR-5 to axe-core + one keyboard e2e; either cut NFR-6 or gate it on a Playwright `setOffline(true)` full round with content precached.

## 16. [MAJOR] §8 phase 5
**Problem.** "Polish" hides all of offline/PWA, the a11y pass, and AR-3 audio — which the spec calls the biggest lever and biggest cost. No phase is sized for ~3,000-word audio or content disambiguation.

**Change.** Break offline, a11y, and audio into funded phases; resolve Q5 before phase 5.

## 17. [MAJOR] §8 / Q1
**Problem.** Phases 3–4 build session model, weighting, and summary before Q1 (learning tool vs arcade) is answered, though Q1 rewrites FR-12/13/15.

**Change.** Resolve Q1/Q2/Q5 before phase 3 exits; treat phase 3 as a throwaway spike.

## 18. [MAJOR] §4.3
**Problem.** The idempotent `content:build` is conflated with the one-time migration, so re-running it re-clobbers curated content — defect 4 at a new layer.

**Change.** Separate one-shot `content:migrate` (frozen `content/_source/` snapshot) from `content:build`; commit migration output, never auto-regenerate.

## 19. [MAJOR] §7 / NFR-3
**Problem.** The migration script is untested and Playwright on a timing-driven game is inherently flaky with no seeded clock, so month two produces ignored CI.

**Change.** Add a migration fixture+snapshot test and inject a seeded clock/spawn source.

## 20. [MINOR] FR-16 / FR-18 / NFR-4 / NFR-7 / OPEN-S1
**Problem.** Round-out gaps: no content guide/template or `$schema` for the promised non-programmer editing; printed counts aren't a gate; `dist/` stays tracked with a committed built `index.html`; "no network during play" unverified; no hosting choice blocks the e2e base URL.

**Change.** Ship `content/README.md` + `$schema` + `content:new`; commit a counts golden file; `git rm --cached dist` and delete `assets//index.html.BAK`; route-block in Playwright; pick Vercel now.

---

## Top 3 changes (as stated by the critic)
1. Fix content before UI: add the FR-17 invariants (one target = one word-id, globally unique ids, duplicate-English and cross-category-hanzi detection) and make migration disambiguate the 56 ambiguous-English groups and dedupe the 391 duplicate-hanzi entries — otherwise FR-7/FR-8 are wrong and green CI cannot see it.
2. Make word ids category-independent (`<hanzi>-<pinyin>`) and globally unique so the 385 HSK↔topical overlaps are one word; otherwise FR-14 accuracy and FR-15 weighting fork and FR-4 counts inflate.
3. Cut v1 to strict-TS + a real validator gate + one deterministic golden e2e + repo hygiene; defer NFR-6/NFR-8, the manual WCAG audit, and full-3,000-word audio, and split phase 2 into schema/validator vs. reconcile-and-disambiguate so the real effort is visible.