# Mandarin Bubble — Product & Technical Specification

**Status:** Draft v3 — for review by Jim
**Date:** 2026-10-05
**Provenance:** Derived from the current POC (`github.com/JimRCain/BubbleMandarin`, a Dyad/DeepSeek vibe-coded React app) plus a measured audit of its source (§10). The POC is treated as *evidence of intent*, not code to inherit.
**Revision history:** v1 → hostile review → v2 → **second, independent hostile review from a different model lineage** → v3. Fixes are marked **[FIXED-n]** (round 1, §11.1) and **[R2-n]** (round 2, §11.2). **§11.3 records four places where my own audit numbers were wrong and the critics caught it.**

Labels: **[POC]** recovered from the existing app · **[ASSUMPTION]** my inference, challenge it · **[OPEN]** Jim must decide · **[PROPOSED]** my default, overridable.

---

## 1. Product definition

### 1.1 One-liner
A mobile-first Chinese vocabulary game: the player is shown an English word and must tap the matching Hanzi character among several drifting bubbles.

### 1.2 Audience and context of use
- **Primary user:** an adult beginner-to-intermediate learner of Mandarin, likely a non-native speaker living in China. **[ASSUMPTION]**
- **Context:** short sessions, one-handed, phone in portrait, sound usually available but not guaranteed.

### 1.3 Core loop as the POC actually implements it **[POC — verified in `src/components/GameBoard.tsx`]**
> **Correction [FIXED-1].** v1 described the mechanic inconsistently ("rise from the bottom" vs "escape off the bottom"). Measured truth: bubbles spawn near the top and **fall downward**; at 80% of the container height they are **teleported back to a random top slot**. They wrap; they never escape. There is **no fail state, no life, no miss, no time limit and no session end** except reaching the score goal.

> **Correction, 2026-10-05 — the wrap is deliberate, not a defect.** Jim: *"It's a learning tool masquerading as an arcade game. This is why the bubbles wrap to the top instead of penalizing the player."* Earlier drafts of this spec called the absence of a fail state a POC flaw. **It is not.** The non-punitive wrap is a product decision, and it constrains everything downstream: tension must come from speed, accuracy and self-competition — never from loss (§1.7).

1. Player picks categories, a difficulty tier, and toggles Pinyin and Voice.
2. Bubbles fall from the top. Each shows a Hanzi word (plus Pinyin if enabled).
3. A target English word is displayed at the top.
4. Correct tap: ascending "ding", +points, bubble pops; a new target is chosen.
5. Wrong tap: low "buzz", −penalty, the wrong bubble flashes red, the *correct* bubble flashes green, device vibrates.
6. Reaching the goal opens a "Level Complete" modal: continue (endless) or return to menu.

### 1.4 What success looks like for v1
- A learner plays one full session on a phone with no dead categories and no stuck states.
- The session has a defined end, the player can see whether they improved, and progress survives a reload. *(v1's "no console errors" criterion was vacuous — dropped [FIXED-25].)*
- A content editor can add a category by following a written procedure (§4.5) executed once by hand. **[FIXED-23]**

### 1.5 Session shape and pacing **[FIXED-2, FIXED-4]** — non-punitive by design
There is **no lose condition, by design** (see §1.3). The genuine defect is narrower than v2 claimed: the *scoring arithmetic* is broken. At `simple` settings (+10 correct, −20 wrong, goal 200) the required score is `c ≥ 2w + 20` — so **below ~67% accuracy the player can never finish, ever** — and a winning session is 24–50 rounds, not the "short session" §1.2 promises.

**[PROPOSED] — needs Jim's yes:**
- A session is **15 correct answers**, or **90 seconds**, whichever comes first.
- **Progress counts correct answers, not net score.** Points become a scoreboard, not a gate. This removes the unwinnable arithmetic at a stroke.
- **A wrong tap costs a small time penalty** (e.g. −2 s) and breaks a streak multiplier. It never makes the session unwinnable.
- **There is no miss, and v2/v3 were wrong to invent one.** A bubble reaching the bottom wraps to the top — deliberately (§1.3). Nothing is ever lost, so there is no miss counter and no miss limit. **OPEN-A3 is withdrawn as moot.** Pressure comes from response time, not from losing bubbles.
- **A "just play" endless mode stays** as the arcade surface [corrected: v3 cut it]. It awards no mastery progress, which keeps the incentive for the real mode honest.

### 1.6 Teach before test **[R2-1]** — the deepest open issue
Round 2's product critic made the sharpest observation in either review:

> *"The loop is test-first: a learner's first sight of a character is a timed tap with a penalty… the only way to 'learn' a never-seen character is a −20 wrong tap followed by a green flash. That is trial-and-error, not instruction."*

That is correct, and it is §1.5's flaw in different clothes: **the design measures taps, not acquisition.**

**Q1 is now answered — learning tool masquerading as an arcade game — and the wrap is deliberate (§1.3).** That decides this: the arcade surface stays, and instruction is inserted underneath it.

- **(a) Exposure first [ACCEPTED IN PRINCIPLE]:** a word's first appearance in a session shows an untimed card with Hanzi + pinyin + audio + English together; the word joins the quiz pool only after that. This is what makes the masquerade honest rather than a costume.
- **(b) Reflex trainer:** rejected — the app's own author says it is a learning tool.

### 1.7 Rewards and playtime **[PROPOSED — Jim asked for suggestions, 2026-10-05]**

The design rule that follows from §1.3: **arcade on the surface, learning underneath; tension from speed and self-competition, never from loss.** Three layers, each doing one job:

| Layer | Reward | Why |
|---|---|---|
| Moment-to-moment | combo counter, ding pitch rising with each combo step, pop animation, haptic | This is the masquerade, and it is pure juice — it teaches nothing, which is fine, because the layer below does |
| Session | clearing **today's queue**: N due reviews + M new words (teach card first) | A session becomes a *learning unit* rather than a score gate, so "done" means "learned", not "reached 200" |
| Long-term | per-deck mastery meter (unseen → learning → known) and personal bests (fastest response, longest combo) | The number that goes up **is** the reward. Arcade skin over a skill metric |

- **Playtime:** default session ≈ **3 minutes** (soft cap ~20 items), matching the "short session" §1.2 promises and what the POC's own maths failed to deliver. A "just play" endless mode stays available as the arcade surface.
- **Retired:** net-score gating; "Level Complete at 200/400/800"; and the miss counter (no misses exist — §1.5).
- **Spacing:** Leitner boxes, 5 levels, intervals ≈ 10 min / 1 day / 3 days / 7 days / 21 days. Deliberately simpler than Anki: it must be unit-testable and explainable on one screen.
- **Honest tension:** because nothing can be lost, the only real pressure is the clock. That is why response time — not score — is the metric worth showing.

### 1.8 Presentation modes — Hanzi ↔ picture **[PROPOSED — Jim's idea, 2026-10-05]**

Jim: *"For some categories, do something different — display the Chinese at the top and have pictures float down. This would be in the easy category."*

**Agreed on the pedagogy, with two cautions and one cheap shortcut.**

**Why it is right.** A picture has no romanisation to cheat from. Hanzi-at-top → tap-the-picture trains hanzi→meaning directly, and it is the one direction that cannot be gamed by reading pinyin (the A8 problem). The same asset also *is* the teach card of §1.6 — show picture + Hanzi + pinyin + audio together on first encounter, then quiz with it.

**Caution 1 — images are the expensive part, not the code.** Of 3,042 words, only a few hundred are depictable concrete nouns. Verbs, adverbs and most of HSK 5 are not. Sourcing, licensing and visual consistency for those few hundred is a project of its own.

**Caution 2 — do not bind mode to difficulty.** "Easy = pictures, hard = Hanzi" makes difficulty about *modality* instead of *vocabulary* — the same conflation as band-vs-pace (§4.3). Mode is a per-category property in `categories.json` (`"mode": "hanzi-bubbles" | "emoji-bubbles"`), independent of word band.

**Measured coverage [2026-10-05].** Rather than estimate, the 3,042-word corpus was matched against OpenMoji's annotation + keyword index (4,565 entries carrying English names and tags), deduplicated to **2,293 unique words**:

| Result | Count | Share |
|---|---|---|
| Whole gloss matches an emoji name/keyword | 216 | 9.4% |
| Head word matches | +21 | +0.9% |
| **Depictable, first pass (lower bound)** | **237** | **10.3%** |

Coverage is **not spread evenly — it lands almost entirely on the topical decks**, which is exactly where Jim wants it: Animals (pets) 11/11 · Animals (wild) 22/23 · Animals (farm) 11/14 · Fruits 14/30 · Transportation 11/24 · School objects 10/23 · Clothing 10/26 · Food 10/26 · Body parts 11/29 · Sports 8/24 · Vegetables 10/30. It barely touches HSK: HSK 1 19%, HSK 2 9%, HSK 3–4 ≈7%, **HSK 5 3% (17 of 623)** — and is entirely absent from adverbs, days of the week, numbers, greetings, emotions and nationalities. **Conclusion: this mode belongs to the topical object/animal/food decks, not to HSK.** That validates "easy mode only" — the topical decks *are* the easy content.

**This is a floor, not a ceiling.** 21 categories returned zero, including `Body actions (run, jump, sit, clap)` at **0/30** — which is obviously wrong, since emoji for running, jumping, clapping and sleeping all exist. The matcher compares gloss text ("to run") against emoji names ("person running") and fails on verb phrasing. A smarter match plus hand review should put the real figure nearer **350–450**. False positives were also found (火龙果 "dragon fruit" → *dragon*; 我 "I / me" → *I*; 捡 "pick up" → *pick*), so the final list needs a human pass regardless.

**Assets: use an open emoji-SVG set, not hand-drawn illustrations** — already vector, consistent, licensed, and free. Verified 2026-10-05:

| Set | License | Size | Note |
|---|---|---|---|
| **Noto Emoji** (Google) | **Apache 2.0** | ~3,710 SVG | Cleanest for a public repo — attribution via license file, no share-alike. **Recommended** |
| Twemoji (Twitter) | CC-BY 4.0 | 3,988 SVG, 36px grid | Fine; needs a visible attribution line |
| OpenMoji | **CC BY-SA 4.0** | 4,565 | **Avoid** — share-alike propagates to the asset set for no benefit |

~1.6 KB per SVG (measured: 🍚 = 1,630 bytes). 300 icons ≈ **500 KB**, served lazily — trivial for GitHub Pages, and far better than a bundled image set. Store as `public/icons/<word-id>.svg`; ship a `CREDITS.md`.

**"Emoji" vs "vector" is a false choice:** an emoji *character* 🍚 depends on the device font and renders differently on Apple/Google/Windows — the same platform-variance problem as §11.4. An SVG *file* does not. Use the files.

**Implementation:** per-word `icon` field plus per-category `mode`, held in data — **not** a rule hard-wired to the difficulty band. The data already concentrates coverage on easy concrete words, so the outcome Jim wants arrives without binding modality to difficulty (§4.3). A word with no icon simply does not get picture treatment.

**How it fits:** the same asset feeds the teach card of §1.6 — first encounter shows picture + Hanzi + pinyin + audio together, then the word enters the quiz pool. Build the picture map once, use it twice.

> **Deferred, 2026-10-05.** Jim: *"I think we can put the pictures on the back burner for now. It will be part of a 'kid mode' in the future."* §1.8 is **parked, not cut** — the coverage measurement and the asset/licence decision above are recorded so this resumes cheaply. Nothing in v1 depends on it.

### 1.9 Menu information architecture **[PROPOSED — Jim: "the menu is quite busy"]**

The POC menu carries four different jobs on one screen: a settings panel, a 52-deck browse tree, a global difficulty control, and a launcher. That is the source of the busyness — not the number of items but the number of **decisions demanded before play**. Today one screen holds: title · Simple/Medium/Hard · Show Pinyin · Voice · Start · 7 collapsible group headers · 52 checkboxes behind them (all collapsed; `expandedGroups` starts empty) — with Pinyin defaulting to **on**.

**Rule: one decision per screen.** Three levels.

**Level 1 — Home.** The primary action needs no configuration at all (S4):
- **▶ Play** — today's queue (§1.7), using the saved selection. The default path.
- **Decks** — choose what to practise.
- **Progress** — mastery meters and personal bests.

Three actions, no toggles. That is the entire screen.

**Level 2 — Decks.** The 52 decks, organised and searchable:
- Group headers become **cards carrying size and progress** — `Animals · 3 decks · 36/51 known` — instead of bare labels.
- Each deck row: name, **word count**, a mastery meter (unseen/learning/known), add/remove.
- **Search** across English name, Hanzi, pinyin and word contents. With 52 decks, typing beats scrolling.
- **Recommended** pinned at the top — HSK 1 plus the decks with the most due reviews. This answers "where do I start?", which the POC never does.
- Deck word counts surface the §4.6 audit in the UI itself: `Animals (pets) · 11 words` explains why it is not meant to be played alone.

**Level 3 — Settings.** Everything set-once moves off the home screen:
- **Word level** (which words — bands renamed **Common · Mid · Rare**, §4.6) and **Pace** (speed / bubble count) as two separate rows — the §4.3 split.
- Pinyin (default **off**, A8) and Sound.

**Three further fixes:**
- **Persist the selection.** Re-ticking 52 checkboxes every visit *is* the busyness.
- **The start button should count words, not categories.** `Start Game (5 categories)` becomes `Play · 412 words`, computed from the same deduplicated pool the spawner uses (FR-4) — a category count is meaningless when 25% of the corpus is a cross-deck duplicate (§10).
- **Pinyin defaults to on** in `CategoryMenu.tsx:64`, against A8.

---

## 2. Scope

### 2.1 In scope for v1
| # | Item |
|---|---|
| S1 | Core loop (§1.3) with a defined session end (§1.5) |
| S2 | Category selection that cannot present an empty or unreachable deck |
| S3 | Word band and game pace as **two independent controls** [FIXED-3] |
| S4 | First-run experience: pinned starter deck, one-screen how-to, "just play" [FIXED-9][R2-4] |
| S5 | One visible retention signal: per-category mastery counts [FIXED-10] |
| S6 | Persistent progress that the selection logic **actually consumes** [R2-6] |
| S7 | Consistent audio for a bounded core vocabulary (§5) |
| S8 | Content pipeline: one source of truth, validated in CI, **exiting non-zero on failure** [R2-4] |
| S9 | Unit tests on game logic + one deterministic golden e2e with a seeded clock [R2-19] |
| S10 | **Content migration and deduplication workstream (§4.4)** [R2-5] |

### 2.2 Explicit non-goals for v1
- No accounts, server, sync, leaderboards or social features. **[OPEN-A1]**
- No handwriting or character-production training.
- No native app. Web only.
- No monetisation. No runtime AI.
- **Cut by the reviews** [FIXED-21][R2-15]: i18n externalisation, the full component-library import, the offline service worker / PWA shell, drill mode, and the "full session" e2e.

### 2.3 POC defects that must NOT be carried forward
1. **Eight categories that load zero words.** The menu's `GROUPS` array names eight categories matching no filename, and the loader derives the runtime category from the *filename* — so those entries can never resolve. Verified: `Food (snacks/meals)`→`Food`, `House / rooms`→`House-rooms`, `Movement verbs`→`Body actions (run, jump, sit, clap, etc.)`, `Emotion/state verbs`→`Emotion-state verbs`, `Size & shape`→`Size-shape`, `Months / seasons`→`Months-seasons`, `Greetings & polite phrases`→`Greetings-polite-phrases`, `Numbers (1‑20)`→`Numbers (1-20)` (a U+2011 non-breaking hyphen). **~236 words are unplayable in the POC.** Fix and full table: `spec/21-content-migration.md` §4.
2. **Category identity lives in three places and drifts.** 12 files carry `category: null` (360 entries) and **5 files disagree with their own filename** — verified, §10.
3. **Difficulty is a lie for the biggest deck.** All 1,707 HSK 1–5 words are flattened to `"simple"`, committed — so "Hard" changes nothing for HSK content.
4. **Build scripts mutate source data and hit the network.** `npm run dev` fetches `raw.githubusercontent.com` (one URL corrupted to `bluejames2000/***`) then rewrites committed JSON on disk.
5. **Type safety off.** `strict: false`, `noImplicitAny: false`, `strictNullChecks: false`.
6. **Committed build output.** `dist/` in git (6 files); `index.html` points at the built bundle, not `/src/main.tsx`.
7. **Dead code.** `Bubble.tsx` never imported and contains a stream-of-consciousness comment block; `react-router-dom`, `pages/Index.tsx`, `NotFound.tsx` unused.
8. **Debug logging in production paths.** `vocabulary.ts` logs every module and the total on every load.
9. **State bugs.** `GameBoard` sets state inside a state updater, swallows the correct-score update, and never reliably re-targets after a wrong tap.
10. **No tests, no CI.**
11. **[R2] The content itself is not clean, and nobody noticed.** ~25% of the corpus is a duplicate (749 of 3,042 words share a Hanzi with a word in another deck), 5 files contain an outright duplicate, and 56 English glosses inside a single category map to more than one Hanzi. §10.

---

## 3. Functional requirements

**Selection**
- FR-1 MUST let the player select categories by group, including select-all/deselect-all per group.
- FR-2 MUST prevent starting with zero categories selected.
- FR-3 MUST NOT offer any category that resolves to an empty pool for the chosen word band. *(Fixes defect 1.)*
- FR-4 MUST show the effective pool size **computed from the identical filtered, deduplicated pool the spawner uses** — never from raw category totals [FIXED-16][R2-8].
- FR-5 MUST provide a first-run path needing no configuration: a **pinned starter deck** (top-N HSK 1) pre-selected, a band default that actually contains words, and a single "just play" action [FIXED-9][R2-4].
- FR-6 MUST show a one-screen how-to-play on first launch only.
- FR-7 MUST show per-category mastery counts (new / learning / known) on the menu [FIXED-10].

**Play**
- FR-8 MUST display a target English word and several candidate Hanzi bubbles.
- FR-9 MUST spawn only words in the selected categories and word band. **A unit test MUST assert every spawned word's band equals the selection** — the POC filtered by category only, which passes a smoke test [R2-9].
- FR-10 MUST guarantee **exactly one** visible bubble matches the target. **This is a data problem, not only a code problem** [R2-1]: with 56 ambiguous glosses and 588 Hanzi shared across decks, multi-category selection breaks single-match unless words are deduplicated by Hanzi identity (§4.2). The selector MUST exclude any target whose gloss collides with a visible candidate.
- FR-11 MUST NOT repeat the same target within a session until the eligible pool is exhausted.
- FR-12 MUST choose distractors deliberately — same category and comparable band preferred — so the round does not get *easier* as the corpus grows [FIXED-17].
- FR-13 MUST apply correct/incorrect/missed outcomes: scoreboard change, audio, **non-colour-only** feedback, haptic where available [FIXED-18].
- FR-14 MUST NOT allow a bubble to be tapped twice. **Enforced in the reducer by word id, not by CSS `pointer-events`** [R2-11].
- FR-15 MUST pause on tab blur **and window blur**, stopping the game clock; on resume no bubble position, score or timer may have changed. Time must be injectable [FIXED-15][R2-11].
- FR-16 MUST expose replay of the target's pronunciation, **and a test MUST assert the replay is passed the target's Hanzi** — a silent no-op is otherwise indistinguishable [R2-12]. **[OPEN-A4]** — pre- or post-answer; see §11.2.
- FR-17 **[PROPOSED, pending Q1]** MUST show a word's first encounter in a session as an untimed exposure card before it can be quizzed (§1.6) [R2-1].

**Session**
- FR-18 MUST show the scoreboard and progress toward the session end (§1.5).
- FR-19 MUST end the session at the defined condition and show a summary: correct, wrong, accuracy, fastest response, longest combo, and the words answered wrong.
- FR-20 MUST **enroll wrong-answered words into the review queue** — a session that ends with a score and no way to re-encounter the errors lets them evaporate. Both reviews flagged that consolidation was the only missing step in the design [R2-11].
- FR-21 MUST persist per-word state locally, surviving reload, **and the target selector MUST read it** — persisted data that nothing consumes is a passive log, not learning [R2-6].
- FR-22 MUST persist **in-flight session state**, so a reload mid-session does not lose it [FIXED-13].
- FR-23 MUST version the stored schema and state its migration-or-discard behaviour; MUST tolerate storage being unavailable (Safari private mode throws) [FIXED-24].
- FR-24 **[OPEN-A2]** SHOULD weight repeat appearances toward words the player gets wrong. **If Q1 is answered "learning tool", this becomes a MUST with a concrete persisted model** (per-word box/interval, next-due timestamp, lapse count) [R2-2]. Its tests are gated on that decision — NFR-3 must not require tests for an unchosen mechanism [R2-10].

**Content**
- FR-25 MUST load content from files a non-programmer can edit, per the procedure in §4.5.
- FR-26 MUST validate content at build time and **exit non-zero on failure**. A validator that prints errors and exits 0 is gameable [R2-4]. Rules: globally unique word ids; no duplicate Hanzi in a category; no duplicate Hanzi across the corpus unless deliberate and marked; no ambiguous English gloss within a category; blank required fields rejected; invalid pinyin characters rejected; difficulty restricted to an enum; unknown keys rejected; filename must equal category id; and a bijection test between `categories.json` ids and `words/<id>.json` [R2-1][R2-6].
- FR-27 MUST report per-category and per-band word counts to a **committed golden file that CI diffs** [R2-20].

---

## 4. Content and data model

### 4.1 One home for category identity
Content files reference a category by **stable id**, never a display string.

```jsonc
// content/categories.json — the ONLY source of truth for category identity
[
  { "id": "food", "name": "Food (snacks/meals)", "group": "Nouns", "order": 9 },
  { "id": "hsk-5", "name": "HSK 5", "group": "HSK", "order": 5 }
]
```

```jsonc
// content/words/food.json — filename MUST equal the id
[
  { "id": "米饭-mi-fan", "hanzi": "米饭", "pinyin": "mǐ fàn",
    "english": "rice (cooked)", "band": "simple", "tags": ["food"] }
]
```

- The filename **is** the category id. No normalization, no override map, no display-name matching.
- `category` is **not** stored per word; it is derived from the file. One fact, one home.
- Display names and grouping live only in `categories.json`.

### 4.2 Word ids must be category-independent **[R2-2]**
The engineering critic's point, and it is correct: **588 Hanzi appear in more than one category, and 560 of those touch an HSK deck.** If a word's id derives from its category (`food-rice-cooked`), then 米饭 in HSK and 米饭 in Food get two different ids — and per-word accuracy (FR-21) and weighting (FR-24) fork into two unrelated records for one word the learner either knows or does not.

**Therefore: ids are derived from the word itself (`<hanzi>-<pinyin>`), globally unique, and category membership is a property of the file, not of the id.** A sidecar id map preserves stability if content is ever re-sourced.

### 4.3 Word band and game pace are separate controls **[FIXED-3]**
The POC's single "difficulty" switch filters the word pool *and* sets bubble count, fall speed and scoring. A learner who wants harder **words** cannot avoid a faster, harsher **game**. Split them:
- **Word band** (content filter): `simple` / `medium` / `hard`, authored per word, **never rewritten by a build step** (fixes defect 3). A band with no words in the selection is disabled in the UI, not silently empty.
- **Pace** (game setting): `Chill` / `Normal` / `Rush` — fall speed and bubble count only.

**[OPEN-A5]** Band hand-authored, or derived from HSK level at import? Recommendation: derive at import, commit the result as data, allow hand override, never recompute at build.

### 4.4 Migration and deduplication — the biggest content workstream **[R2-5]**
v2 called this "migration of the 3,042 words" in one line of the delivery plan. Round 2 correctly called that out: it hides the real job. It is now an explicit workstream with a measured size:

- Reconcile **52 categories** into the registry (§10).
- Deduplicate **5 in-file duplicate pairs** (不客气, 游泳, 注意, 在...上, 旁边, 庞大).
- Resolve **588 cross-category Hanzi collisions / 1,333 duplicate entries** — per pair, decide whether it is one word in two decks (dedupe) or genuinely different (rare).
- Disambiguate **56 same-category ambiguous English glosses** by hand.
- Re-derive **1,707 HSK band values** from public lists rather than copying the flattened values.
- Generate stable ids (§4.2) and freeze a `content/_source/` snapshot.
- **Separate `content:migrate` (one-shot, output committed) from `content:build` (idempotent, CI)** — otherwise a rebuild re-clobbers curated content, which is defect 4 at a new layer [R2-18].

### 4.5 The add-a-category procedure (executed once by hand before v1)
1. Add an entry to `content/categories.json`. 2. Create `content/words/<id>.json` with filename = `<id>`. 3. Run `content:validate`. 4. Run the app; confirm the category appears and starts a game.
If any step requires editing TypeScript, the design has failed FR-25 [FIXED-23]. Ship `content/README.md`, a JSON `$schema`, and a `content:new` scaffold [R2-20].

### 4.6 Category inventory and band integrity **[new — 2026-10-05]**

Full audit with the per-deck table: `spec/20-category-audit.md`. Thresholds proposed there: **MIN_SOLO 30** words to play a deck alone, **MIN_SESSION 20** to fill a session without repeating, **MIN_BAND 10** for a difficulty band to be usable as a filter.

**The bands do not share a definition — and this is not a balancing problem.** HSK 1–5 (all 1,707 words) are **100% `simple`**, while `hard` is populated by ordinary concrete topical nouns — Sports `hard` = 排球 volleyball · 高尔夫球 golf · 拳击 boxing — and `simple` contains genuinely abstract HSK 5 vocabulary — 爱惜 to cherish · 安排 to arrange · 安全 safe. A player selecting **Hard** therefore gets *no HSK 4 or HSK 5 content at all*. The control is not merely unbalanced, it is **inverted**, and it cannot be repaired by adding words. **The band definition must be re-derived before per-category balancing means anything** — and it is the reason the global difficulty control moves off the home screen (§1.9).

**Eight decks are too small to play alone** (<30 words), two of them badly: `Animals (pets)` 11 and `Animals (farm)` 14 — both with no band reaching 10 words, so their difficulty filter is dead. The rest: Family 15, Drinks 18, Animals (wild) 23, Clothing 26, Food 26, Body parts 29. **Top-up worklist: 8 decks, ≈78 words — about 3% of the corpus.**

**31 of 52 decks have only one usable band**, and 2 have none — so a global difficulty selection silently empties most decks.

**Duplicates:** 6 pairs across 5 files (不客气 · 在...上 · 旁边 · 庞大 · 游泳 · 注意), plus the 1,333 cross-deck duplicate entries in §4.4.

**Where bands come from — resolved 2026-10-05 [A9].** Jim: *"I do not think we need to conform to HSK to grade the word difficulty. I think the more common words should be considered easy and the less common words: difficult."* Bands are therefore **corpus frequency only** (wordfreq Zipf): `simple` ≥ 5.00 · `medium` 4.20–5.00 · `hard` < 4.20, rank-calibrated at roughly top‑1,200 / 1,200–5,600 / beyond, splitting unique words 29% / 38% / 33%. Committed as data, hand-overridable, never recomputed at build (defect 3).

**Two consequences the measurement forced** (`spec/21-content-migration.md` §1):
- **Rename the bands to Common · Mid · Rare.** 排球 *volleyball* is correctly `hard` — it is a rare word — but the label reads as nonsense. Name the control for what it measures.
- **Word level is a global setting, not a per-deck filter.** Thematic decks are inherently rare-heavy (Fruits: 29 of 30 words are `hard`), so a per-deck filter would be dead in most decks — exactly the §1.9 finding. The five HSK decks go from 1 usable band each to 3, and the former inversion (HSK 5 all-`simple`, Sports 70% `hard`) disappears.

**Consolidation and expansion** (`spec/21-content-migration.md` §2–3): merge the three animal decks into `Animals` (11 + 14 + 23 = **48 words**), and add **45 words** — Family 15→35, Drinks 18→30, Clothing 26→31, Food 26→32, Body parts 29→31. Result: **50 decks, 2,338 unique words, no deck under 30.**

**Source caveat:** `wordfreq`'s Chinese data is a subtitles + Wikipedia blend and is noisy at the edges (12 HSK 1 words score below 4.20; 羽绒服 1.07 and 椰汁 1.66 are implausibly low). Good enough to sort a deck, not precise — hence bands are committed data, not computed at build.

---

## 5. Audio requirements
- AR-1 MUST pronounce the Hanzi of the target, not the English.
- AR-2 MUST sound the same on every device. The POC plays a bundled sprite *or* the OS speech engine and the sprite set is empty, so it depends entirely on the device having a Chinese voice — **root cause traced and documented in §11.4** [Jim, 2026-10-05: *"runs fine on my cell phone, but not on other PC web browsers"*].
- AR-3 **[DECIDED — pre-render]** Ship pre-rendered clips; **TTS is not the base case.** [Jim: *"If we could pre-render it at a reasonable size, that would be best."*] Sizing at 32 kbps mono, which is transparent for speech:
  - HSK 1+2 (310 words) ≈ **2 MB** — the v1 minimum.
  - **All 3,042 words ≈ 15 MB**, lazy-loaded per deck; the largest deck (HSK 5, 863 words) ≈ 4 MB. GitHub Pages handles this (§7), and per-deck loading means a player only ever fetches the deck they chose.
  - Generation is a batch job on existing infrastructure (Qwen TTS via DashScope), not a research problem.
- AR-4 MUST degrade silently and never block play.
- AR-5 MUST respect a global mute and never autoplay before a user gesture.

### 5.2 Music — MIDI source, pre-rendered output

Jim asked for MIDI background music — originally Tetris-themed, now leaning Oriental.

**What Alibaba offers, and why it is not the right tool.** Bailian / Model Studio carries exactly one music model: **`fun-music-v1`** (百聆), ¥0.002/second — prompt or lyrics in, **a full song with male/female vocals** out, Chinese or English. It does not appear in the compatible-mode `/models` list (262 models, all TTS/ASR/Omni, no music) because it is an async task API. **Qwen-Music** — the Qwen team's music model, arXiv 2607.11699 — is likewise a *song* generator with vocals, and is not exposed on the platform.

Two conclusions: **no music model on any platform emits MIDI** (they all emit audio), and **a sung song is the wrong shape** for a loop under a vocabulary drill.

**So: compose the MIDI ourselves, ship a pre-rendered loop.** Built and rendered 2026-10-05 (`music/jinghong-dawn.mid`):

| 41.7 s · 6 layers · 215 notes | Size |
|---|---|
| MIDI (source of truth) | **1,906 bytes** |
| MP3 render | 733 KB |
| WAV render | 4.7 MB |

MIDI is ~380× smaller and, unlike audio, it is **adaptive** — tempo can follow difficulty, layers can enter on combos, and one file serves many moods by swapping programs. That is arcade-music behaviour the static-sprite approach cannot produce.

**"Oriental" is mostly two decisions:**
1. **Scale** — the 五声音阶 pentatonic (宫商角徵羽 = C D E G A). The single largest lever, more so than any instrument choice.
2. **Patches — resolved: two soundfonts, one render pass.**
   - **Melodic 民乐 ← DSK Asian DreamZ** (freeware, 11.5 MB; bank 0 prog PIPA/0, PIPA TREM/1, LUAN/2, GUZHEN/3, ERHU/4, BAN-DI/5). Real recorded guzheng / erhu / pipa / dizi samples — the only obtainable SF2 with a genuine 民乐 ensemble.
   - **Percussion ← DSK bank 0 prog 6**, 13 sounds at MIDI 54–70. **Bass ← FluidR3_GM** (already on this machine: 148 MB, 189 presets, 1418 samples), Acoustic Bass prog 32.
   - Rejected: **Kong Audio's free instruments** (real 民乐, but Kontakt/VST — no headless render path); **musical-artifacts CC-BY fonts** (OLPC Guzheng, MFA Pipa, FS Dizi, FS Erhu v2 — better licensing, but the host is Cloudflare-walled and every download returns a 5.4 KB challenge stub); **Timbres of Heaven** (server declares 395,249,188 B but only 211,877,816 B arrives — 54%, and curl still exits 0, so the truncation is silent; the `pdta` preset table lives at the END of an SF2, so a half-length file yields **0 readable presets**. Range requests return empty through the VPN, so resuming is not possible. FluidR3_GM already beats the locally-installed TimGM6mb anyway).

**Three things measured, after getting the first two wrong — do not repeat either mistake:**
- **Percussion ← DSK bank 0 prog 6** (13 sounds at **MIDI 54–70**). This is real Chinese percussion, better than a GM rock kit. Probe one note per render: with a 0.35 s note grid a long decay bleeds between notes and mislabels the map. Notes 84–96 are simply unmapped, which is why an early probe found nothing there.
- **Bass ← FluidR3_GM** prog 32 (Acoustic Bass) — the one voice DSK does not define.
- **Soundfonts CAN be layered in a single pass.** The last-loaded font wins a contested preset: corr **1.000** against the winner, **−0.139** against the loser, tested in both load orders. An earlier 0.46/0.60 reading came from a test whose two renders shared a drum channel, which swamped the correlation. So one pass with `[FluidR3_GM, DSK]` — DSK overrides progs 0–6, GM supplies the rest.
- **DSK percussion outlives the barline.** FluidSynth pads the render ~30 s past the last note (tail RMS 0.0007 — it is silence, not ring), so a 16-bar loop measures 74–90 s. **Trim to `bars*4*60/bpm` seconds** or the loop never lines up.

**Shipping path:** MIDI stays in the repo as the source of truth; audio is **pre-rendered offline** with `fluidsynth` and committed as OGG — exactly the §5.1 sprite approach, so the browser never synthesises and the §11.4 device-variance class cannot recur. Toolchain lives in `music/tools/` (`compose.py` writes MIDI, `render.py` renders, trims to the barline and encodes) and is reproducible.

| song | bpm | loop | MIDI | OGG |
|---|---|---|---|---|
| `jinghong-dawn` | 92 | 41.7 s | 2,378 B | 214 KB |
| `lanterns` | 76 | 50.5 s | 2,388 B | 263 KB |
| `mist-on-the-river` | 66 | 58.2 s | 2,285 B | 294 KB |

**Adaptive:** the layers are guzheng (texture) · pipa (pulse) · bass · percussion · erhu (lead) · ban-di (counter) · pipa-trem (intensity), with **staggered entry points** (guzheng bar 1 → pipa/bass/perc bar 5 → erhu bar 9 → counter-melody + tremolo bar 13). The same MIDI therefore mixes sparse or full, giving a calm/normal/intense crossfade without composing anything twice.

**Licensing:** DSK Asian DreamZ grants free private and commercial *use* but no redistribution, and ships only a generic readme, so the renders never needed permission. On **2026-10-05 Victor Castilla granted in writing** a reduced, downsampled subset of the five melodic presets for public distribution with the project, on condition of a credit line and link (`music/soundfonts/PERMISSION-DSK.md`). That unblocks the MIDI + font route; DSK percussion and the unmodified 11.5 MB font are not covered. FluidR3_GM (reported MIT) remains the safer of the two, and both readmes should be archived next to the MIDI.

### 5.1 Payload budget **[FIXED-7]**
- Initial JS + CSS ≤ **300 KB gzip**. Word data lazy per category; no bundle over **150 KB gzip**. Audio ≤ **2 MB per deck**. Offline deferred to v2, which removes the third constraint.

---

## 6. Non-functional requirements
- **NFR-1 Performance:** **[R2-13]** demoted — "sub-2.5 s on a mid-range phone over 4G at 60 fps" is unmeasurable in a solo CI and therefore unfalsifiable. Becomes a **one-time Lighthouse budget plus a dev-only render-count assertion**, not a required gate.
- **NFR-2 Type safety:** `strict: true` plus `noUncheckedIndexedAccess`; no `any` in app code. *(Fixes defect 5.)*
- **NFR-3 Testing:** unit tests on `src/game/` and on the **migration script** (fixture + snapshot) — the migration is where the real risk lives [R2-19]. Scoring assertions are **exact deltas** in the reducer, because the POC's bug was a correct-looking score with the update swallowed inside a state updater [R2-10]. Plus one **deterministic golden e2e** with a seeded clock and spawn source: plays one full scored round, asserts the on-screen score, and hard-reloads to assert restored accuracy. Tailoring tests for an undecided weighting mechanism is forbidden (FR-24).
- **NFR-4 Repo hygiene:** `dist/` removed from tracking (`git rm --cached`), `index.html` points at the dev entry, `index.html.BAK` deleted, one lockfile. *(Fixes defect 6.)*
- **NFR-5 Accessibility, narrowed** [FIXED-18][R2-15]: keyboard access to menus, WCAG AA contrast, `prefers-reduced-motion` honoured, correct/incorrect conveyed by shape/icon/text not colour alone, verified by `axe-core` plus one keyboard e2e. Live screen-reader narration of moving bubbles is **not achievable** and is dropped.
- **NFR-6 Privacy:** no analytics, no accounts; "no network during play" must be **enforced by a Playwright route-block**, or it is just a claim [R2-20].
- **NFR-7 i18n-ready:** dropped from v1 [FIXED-21].
- **NFR-8 CI:** "CI blocks merge on failure" is **branch protection, not code** — enable required status checks on the default branch, or red CI still merges [R2-14].

---

## 7. Technical decisions
| Decision | Choice | Rationale |
|---|---|---|
| Language | TypeScript, `strict` | Non-negotiable after the POC |
| Framework | React + Vite | Known, small, deploys anywhere |
| Styling | Tailwind + hand-built game components | The POC's 40-component kit was mostly unused |
| Routing | None | One screen and a modal |
| **State** | React owns **discrete** state only (score, target, round, session phase). The fall animation runs in a `requestAnimationFrame` loop mutating bubble positions via refs and writing directly to the DOM; React does not re-render per frame. Hit-testing reads the same ref-held positions. | v1's wording was self-contradictory [FIXED-8] |
| Game logic | Pure functions in `src/game/`, unit-tested, clock injected | NFR-3 |
| Persistence | `localStorage` behind a typed, versioned store; IndexedDB only if it outgrows it | FR-23 |
| Content validation | Zod schema (strict, no `.passthrough()`) + build script exiting non-zero + one failing fixture per rule | FR-26 [R2-4] |
| Hosting | **[OPEN-A6]** Vercel (as now) or GitHub Pages — **decide now**, because it fixes the e2e base URL [R2-20] | |
| CI | Required status checks: typecheck → lint → unit → content validate → build → smoke e2e | NFR-8 |

**Repo layout (proposed)**
```
content/            categories.json, words/*.json, _source/ (frozen), README.md, $schema
scripts/            content:migrate (one-shot) · content:build (idempotent) · content:validate
src/game/           scoring, session, target + distractor selection  ← pure, tested
src/components/     board, bubble, menu, summary — app-specific only
src/store/          versioned persistence
tests/              unit + golden e2e
```

---

## 8. Delivery plan
1. **Skeleton** — repo, strict TS, CI with **required checks**, lint, test harness. Exit: green build, no features.
2. **Decisions closed** — Jim answers Q1–Q5 (§9). *(Round 1 found this step depended on unresolved questions [FIXED-22]; round 2 confirmed phases 3–4 would be guesswork without it [R2-17].)*
3. **Content core** — 3a: schema, validator (exiting non-zero), registry, bijection test. 3b: **migration and deduplication** (§4.4), sized in words touched, not as one line [R2-5].
4. **Playable loop** — spawn / target / distractors / tap / scoreboard / audio. No persistence. Must be *fun* with one category before anything else is added. Treat as a spike if Q1 is unresolved.
5. **Session & retention** — session end, summary, misses-to-review-queue, mastery counts, persistence, first-run, teach step if adopted.
6. **Funded phases, not "polish"** [R2-16] — 6a accessibility, 6b audio production (§5, the biggest content cost, gated on Q4), 6c pacing tuning. Offline/PWA stays deferred.
7. **Cut v1.**

---

## 9. Open questions for Jim

> **Jim answered Q1–Q5 on 2026-10-05, verbatim:**
> 1. *"It's a learning tool masquerading as an arcade game. This is why the bubbles wrap to the top instead of penalizing the player."*
> 2. *"I'm open to suggestions on how to structure the rewards and the playtime."* → §1.7
> 3. *"The users are myself and any other people who are interested in learning Hanzi. I posted the proof of concept online. People on Reddit seemed to like it."*
> 4. *"The audio is one of the bugs. It runs fine on my cell phone, but it does not run fine on other PC web browsers. If we could pre-render it at a reasonable size, that would be best."* → §5, §11.4
> 5. *"The repo is public right now and it is also live on GitHub Pages."*

**Blocking — Q1–Q5 resolved; consequences folded into §1.5, §1.6, §1.7 and §5.**

| # | Question | Why it matters |
|---|---|---|
| **Q1** | **Learning tool, or arcade game?** And if a learning tool, do you accept **teach-before-test** (§1.6) — a first-sight exposure card before a word can be quizzed? | The fork in the road. Round 1: *"§3 quietly assumed an answer while Q1 sat open."* Round 2: *"the rewrite reproduces the POC's core flaw — a game wearing vocabulary."* Both converged here |
| **Q2** | **Accept the §1.5 session shape** — 15 correct or 90 s, progress by correct count, wrong tap = small time penalty? | Removes the unwinnable 67%-accuracy trap. If you want the POC's harsh scoring kept, say so and I will spec it honestly |
| **Q3** | **Who's the user — you, Marie, or a stranger?** | Decides how much onboarding and tuning is worth |
| **Q4** | **Audio: pre-render HSK 1–2 (≈2 MB proposed), go bigger, or rely on device TTS?** | Biggest quality lever, biggest content cost |
| **Q5** | **Repo name and visibility** — I suggest `mandarin-bubble`, public, matching your existing apps | Needed before step 1 |

**Non-blocking — I default and note it.**

| # | Question | My default |
|---|---|---|
| **A1** | Accounts/sync later, or device-local forever? | Device-local |
| **A2** | Weighted review in v1? | In (MUST if Q1 = learning tool), persisted, and it drives selection |
| **A3** | ~~Does missing the correct bubble 3× end the session?~~ | **Withdrawn** — no misses exist (§1.3, §1.5) |
| **A4** | Target audio before or after the answer? | After. *(Round 2 argued for auto-play on prompt as the beginner's strongest cue; that is only sound if Q1 = learning tool **and** the word has been taught. Revisit with Q1.)* |
| **A5** | Word band hand-authored or HSK-derived? | **Superseded by A9** — bands are corpus-frequency derived (Zipf), hand-overridable, committed as data. Do not reintroduce an HSK basis here |
| **A6** | ~~Vercel or GitHub Pages?~~ | **Answered by Jim: GitHub Pages** — the POC is already live there; match the working setup. Consequence: Vite `base` must be `/<repo>/`, and asset weight matters (see §5.1) |
| **A7** | Keep the Dyad component-tagger plugin? | Drop it |
| **A8** | Pinyin on by default? | **Off** — with pinyin visible the loop becomes "read pinyin → match English" and never trains Hanzi reading [FIXED-11] |
| **A9** | ~~How are difficulty bands re-derived?~~ (§4.6) | **Answered by Jim: corpus frequency, not HSK** — *"the more common words should be considered easy and the less common words: difficult."* Zipf ≥ 5.00 / 4.20–5.00 / < 4.20, committed as data. Bands renamed **Common · Mid · Rare**. Word level is a **global** setting, not a per-deck filter |

---

## 10. Appendix — measured POC audit (corrected)

> **§11.3 records four places where my v1/v2 numbers were wrong.** This table is the corrected, re-verified version. Reproduce with `node ~/.hermes/cache/scratch/audit-v2.mjs`.

**Structure**
- **52** content files — not 51 as v2 claimed.
- **3,042** words. Difficulty: `simple` 2,145 · `medium` 571 · `hard` 326. All 1,707 HSK words are `simple` (80% of the easiest band).
- HSK decks: 1 = 159, 2 = 151, 3 = 258, 4 = 276, 5 = 863.
- **0** entries with a blank required field; pinyin passes a character-range check on all of them.

**Category-field integrity** — the drift behind defect 1
- **12 files / 360 entries** carry `category: null` (v2 said 13 files).
- **5 files disagree with their own filename**: `Emotion-state verbs`, `Food`, `Greetings-polite-phrases`, `House-rooms`, `Numbers (1-20)` (v2 said 1).
- 12 + 5 = **17 of 52 files** carry a wrong-or-missing category field. The loader ignores the field entirely and renames from the filename — the only reason the app mostly works.

**Duplicate and ambiguous content — not checked at all in v2** **[R2-1]**
- **5 files contain an outright duplicate**: `Greetings-polite-phrases` 不客气 ×2 · HSK 2 游泳 ×2 · HSK 3 注意 ×2 · `Prepositions & location words` 在...上 ×2 and 旁边 ×2 · `Size-shape` 庞大 ×2.
- **588 distinct Hanzi appear in more than one category; 560 of those touch an HSK deck.** Examples: 马 [Animals (farm) + HSK 2]; 猫 [Animals (pets) + HSK 2].
- **1,333 duplicate entries** — i.e. **749 of 3,042 words (~25%) repeat a word from another deck.** This is the load-bearing number: FR-10's "exactly one match" cannot hold for multi-category selection without deduplicating by Hanzi identity (§4.2).
- **2,293 distinct Hanzi** in a 3,042-word corpus.
- **56 same-category ambiguous English glosses** — e.g. HSK 5 "to visit" → 参观 / 访问 / 探望; "otherwise" → 不然 / 否则 / 再不.
- **161 corpus-wide ambiguous glosses** — e.g. "orange" → 橙色 / 橘子 / 橙子; "to call" → 叫 / 打电话 / 称呼.
- The POC has **no word-id field** at all.

**Other**
- POC parameters: `simple` 4 bubbles / 40 s / +10 / −20 / goal 200; `medium` 5 / 35 s / +20 / −40 / 400; `hard` 6 / 30 s / +40 / −80 / 800.
- Audio: the sprite manifest ships **empty** and `public/` has no audio file — the sprite path is dead weight; the app always falls back to device TTS.
- 121 files under `src/`; the bulk is an unused shadcn/ui kit. Real app code: `App.tsx`, `CategoryMenu.tsx`, `GameBoard.tsx`, `Bubble.tsx` (dead), `useGameAudio.ts`, `vocabulary.ts`, `audioSprites.ts`.

**Local artefacts**
- POC clone: `~/business/dyad-apps/BubbleMandarin` (canonical, git). `~/business/dyad-apps/Bubble Mandarin 5` is a Dyad export and should be retired.
- This spec: `~/business/mandarin-bubble/SPEC.md` · Critiques: `~/business/mandarin-bubble/spec/`

---

## 11. Adversarial review

### 11.1 Round 1 — two passes, same model family
`qwen3.8-max` and `qwen3-coder-next`, identical brief, each told to find what was wrong and say nothing about what was fine. **They came back near-identical: all 25 findings in the same order.** Same family, same prompt — effectively **one** independent view, not two. All 25 were accepted, fixed, or explicitly rejected in v2. Reports: `spec/10-critique-qwen3.8-max.md`, `spec/11-critique-qwen3-coder-next.md`.

**Rejected in round 1**
- *"Cut the component library entirely."* Partially accepted — the full kit is dropped, Tailwind plus a few primitives stays.
- *"Turn-based accessible mode."* Good, out of v1 scope. Recorded so it is not lost.

### 11.2 Round 2 — genuinely independent **[R2]**
Two agents from a **different model lineage**, each given a distinct lens (product/learning-science, and engineering-delivery). They returned **substantially different** findings and were materially sharper. Reports archived under `spec/`.

**Accepted and fixed in v3**

| # | Finding | Resolution |
|---|---|---|
| R2-1 | **Test-first loop**: a learner's first sight of a character is a timed tap with a penalty | §1.6; FR-17; escalated into Q1 |
| R2-2 | **Q1 must close before the loop is built**, and weighting must be a MUST with a concrete persisted model | §8 step 2; FR-24 stated conditionally; NFR-3 forbids tests for an unchosen mechanism |
| R2-3 | Nothing differentiates session 4, 5, 10 | FR-7 + FR-21 (selection must consume history) |
| R2-4 | Beginner multi-handicaps: 52 categories, no recommended start, unreachable goal | FR-5 pinned starter deck; FR-6 how-to |
| R2-5 | **Migration is the biggest workstream and §8 hid it in one line** | §4.4; §8 split 3a/3b; S10 |
| R2-6 | Persisted data nothing consumes = *"the POC's adjustWeight mistake with a database attached"* | FR-21 requires the selector to read it |
| R2-7 | Ids embedding the category fork one word into two records across HSK/topical decks | §4.2 category-independent ids |
| R2-8 | FR-4 pool count gameable | FR-4 tightened |
| R2-9 | Implementation can filter by category and ignore band, passing a smoke test | FR-9 unit assertion |
| R2-10 | Score can look right while the numeric update is swallowed | NFR-3 exact-delta reducer assertions |
| R2-11 | Tap-guard gameable via CSS; pause misses window blur; replay can be a silent no-op | FR-14, FR-15, FR-16 tightened |
| R2-12 | Misses drill was optional while being the only consolidation step | FR-20 makes the review queue a MUST |
| R2-13 | NFR-1 unfalsifiable in a solo CI | Demoted to a one-time budget |
| R2-14 | **"CI blocks merge" is branch protection, not code** | NFR-8 |
| R2-15 | Over-scoped a11y and offline | NFR-5 narrowed; offline deferred |
| R2-16 | "Polish" hid audio, a11y, offline | §8 step 6 funded phases |
| R2-17 | Phases 3–4 precede Q1 | §8 step 2 gates them; step 4 flagged a spike |
| R2-18 | `content:build` conflated with migration | §4.4 separates migrate from build |
| R2-19 | Migration script untested; Playwright timers flaky | NFR-3 seeded clock + migration snapshot test |
| R2-20 | Round-out gaps: no content guide, counts not a gate, `dist/` tracked, network unverified, no hosting choice | §4.5, FR-27, NFR-4, NFR-6, A6 |

**Rejected or deferred in round 2**
- *"Make teach-before-test unconditional."* Escalated to Q1 instead. If Jim wants a reflex trainer, mandating a teach step builds the wrong product.
- *"Auto-play target audio on prompt."* Deferred with Q1 (A4). Rounds 1 and 2 contradict each other here, and each is right under a different answer to Q1.
- *"Drop offline entirely."* Accepted in effect — offline is already deferred; the critic's sharper point (a service worker that caches the shell but not content produces a broken offline mode) is why it stays out.

### 11.3 Where my own audit was wrong
The engineering critic disputed my numbers, so I re-verified rather than defend them. **It was right; I was wrong in four places**, and one whole category of problem I had never checked:

| Claim in v1/v2 | Verified truth |
|---|---|
| 51 categories | **52** |
| 13 files with `category: null` | **12 files / 360 entries** |
| 1 filename↔category mismatch | **5 files** |
| "The data is decent — the plumbing around it is not" | **False.** 749 of 3,042 words (~25%) duplicate a Hanzi from another deck; 5 files contain an outright duplicate; 56 glosses are ambiguous within a category |

The critic's own figures were also off — it said 385 shared Hanzi and 391 duplicate entries; the real counts are **588** and **1,333**. Its *existence* claim was right; its arithmetic was low. Both facts are recorded because this document's credibility rests on which numbers can be reproduced: both audit scripts are on disk in `~/.hermes/cache/scratch/` and every figure above comes from re-running them.

**Practical consequence:** the content migration is not a tidy-up, it is a designed workstream (§4.4) — and after the game loop it is the second-largest item in the plan.

### 11.4 Root cause: why the audio works on the phone and not in desktop browsers **[verified 2026-10-05]**

Jim: *"It runs fine on my cell phone, but it does not run fine on other PC web browsers."* Traced to one function — `speakHanzi()` in `src/components/GameBoard.tsx:110-131`:

1. It looks up `audioSpriteManifest[hanzi]`. **The manifest ships empty** and no audio file exists in `public/` (verified: no `.mp3`/`.ogg`/`.wav` anywhere in the repo), so this branch never fires. The POC's own comment in `src/data/audioSprites.ts` describes sprites as the override "if the browser's TTS pronounces certain Hanzi poorly" — designed, wired, never populated.
2. It therefore always falls through to `new SpeechSynthesisUtterance(hanzi)` with `utterance.lang = 'zh-CN'`.

**So the app is 100% dependent on the device having a Chinese TTS voice installed.** Phones have one (Android and China-market handsets ship zh-CN). Many desktop browsers do not: Firefox on Linux typically exposes **zero** voices without `speech-dispatcher`; Chrome on Windows only has whatever the OS has installed. With no zh-CN voice the call fails **silently** — `speechSynthesis.speak()` raises no error, it simply says nothing, or reads the characters with an English voice and mangles the tones. That is exactly the phone-works/desktop-doesn't pattern Jim reported, and it is why the bug looks like "broken audio" rather than an error.

**Fix — pre-render, which deletes the dependency rather than working around it.** The wiring already exists: `audioSpriteManifest` and `loadSpriteAudio()` are in the POC and simply unfed. Real clips in place of the empty manifest remove the entire failure class, and make audio identical on every device (AR-2).