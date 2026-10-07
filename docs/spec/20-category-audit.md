# Category audit — inventory and difficulty integrity

Generated 2026-10-05 from the POC's `src/data/vocabulary/*.json` (52 files). Reproduce with `~/.hermes/cache/scratch/audit-v2.mjs` plus the per-band pass.

## Thresholds used **[PROPOSED — challenge these]**

- **MIN_SOLO = 30** words: below this a deck cannot be played alone with variety.

- **MIN_SESSION = 20** words: below this a deck cannot fill one session (~20 targets) without repeating a word.

- **MIN_BAND = 10** words: below this, a difficulty band is not usable as a filter within that deck. All three bands need this many for the band control to mean anything.


## Full inventory

| category | total | unique | simple | medium | hard | bands ≥10 | flag |
|---|---:|---:|---:|---:|---:|---:|---|
| `Animals (pets)` | 11 | 11 | 6 | 5 | 0 | 0 | **UNPLAYABLE SOLO**; cannot fill a session; **no usable band** |
| `Animals (farm)` | 14 | 14 | 6 | 3 | 5 | 0 | **UNPLAYABLE SOLO**; cannot fill a session; **no usable band** |
| `Family (immediate)` | 15 | 15 | 15 | 0 | 0 | 1 | thin (<30); cannot fill a session; only 1 band; all one band |
| `Drinks` | 18 | 18 | 7 | 11 | 0 | 1 | thin (<30); cannot fill a session; only 1 band |
| `Animals (wild basic)` | 23 | 23 | 6 | 5 | 12 | 1 | thin (<30); only 1 band |
| `Clothing` | 26 | 26 | 2 | 15 | 9 | 1 | thin (<30); only 1 band |
| `Food` | 26 | 26 | 8 | 18 | 0 | 1 | thin (<30); only 1 band |
| `Body parts` | 29 | 29 | 13 | 16 | 0 | 2 | thin (<30) |
| `Body actions (run, jump, sit, clap, etc.)` | 30 | 30 | 7 | 16 | 7 | 1 | only 1 band |
| `Colors` | 30 | 30 | 11 | 13 | 6 | 2 |  |
| `Common adverbs of degree` | 30 | 30 | 7 | 13 | 10 | 2 |  |
| `Communication verbs` | 30 | 30 | 4 | 14 | 12 | 2 |  |
| `Cooking & household verbs` | 30 | 30 | 6 | 17 | 7 | 1 | only 1 band |
| `Daily routines` | 30 | 30 | 23 | 7 | 0 | 1 | only 1 band |
| `Days of week` | 30 | 30 | 22 | 7 | 1 | 1 | only 1 band |
| `Emotion-state verbs` | 30 | 30 | 4 | 14 | 12 | 2 |  |
| `Emotions` | 30 | 30 | 8 | 13 | 9 | 1 | only 1 band |
| `Frequency adverbs` | 30 | 30 | 11 | 10 | 9 | 2 |  |
| `Fruits` | 30 | 30 | 8 | 6 | 16 | 1 | only 1 band |
| `Furniture` | 30 | 30 | 8 | 16 | 6 | 1 | only 1 band |
| `Greetings-polite-phrases` | 30 | 29 | 17 | 11 | 2 | 2 | duplicate: 不客气 |
| `Health` | 30 | 30 | 7 | 9 | 14 | 1 | only 1 band |
| `Hobbies` | 30 | 30 | 8 | 10 | 12 | 2 |  |
| `House-rooms` | 30 | 30 | 9 | 16 | 5 | 1 | only 1 band |
| `Mental verbs` | 30 | 30 | 4 | 19 | 7 | 1 | only 1 band |
| `Modal verbs` | 30 | 30 | 9 | 15 | 6 | 1 | only 1 band |
| `Months-seasons` | 30 | 30 | 16 | 6 | 8 | 1 | only 1 band |
| `Nationalities & languages` | 30 | 30 | 10 | 6 | 14 | 2 |  |
| `Nature` | 30 | 30 | 15 | 11 | 4 | 2 |  |
| `Numbers (1-20)` | 30 | 30 | 25 | 5 | 0 | 1 | only 1 band |
| `Occupations (basic)` | 30 | 30 | 5 | 15 | 10 | 2 |  |
| `Opposites` | 30 | 30 | 15 | 15 | 0 | 2 |  |
| `Personality traits` | 30 | 30 | 3 | 19 | 8 | 1 | only 1 band |
| `Physical conditions` | 30 | 30 | 6 | 19 | 5 | 1 | only 1 band |
| `Prepositions & location words` | 30 | 28 | 14 | 12 | 4 | 2 | duplicate: 在...上, 旁边 |
| `School objects` | 30 | 30 | 11 | 13 | 6 | 2 |  |
| `Sensory verbs` | 30 | 30 | 6 | 19 | 5 | 1 | only 1 band |
| `Shopping & money` | 30 | 30 | 4 | 18 | 8 | 1 | only 1 band |
| `Size-shape` | 30 | 29 | 10 | 15 | 5 | 2 | duplicate: 庞大 |
| `Social activities` | 30 | 30 | 5 | 16 | 9 | 1 | only 1 band |
| `Sports` | 30 | 30 | 5 | 4 | 21 | 1 | only 1 band |
| `Time expressions (relative)` | 30 | 30 | 14 | 14 | 2 | 2 |  |
| `Transportation` | 30 | 30 | 6 | 11 | 13 | 2 |  |
| `Travel & directions` | 30 | 30 | 7 | 18 | 5 | 1 | only 1 band |
| `Vegetables` | 30 | 30 | 7 | 13 | 10 | 2 |  |
| `Weather` | 30 | 30 | 8 | 9 | 13 | 1 | only 1 band |
| `Chinese license plates` | 33 | 33 | 10 | 14 | 9 | 2 |  |
| `HSK 2` | 151 | 150 | 151 | 0 | 0 | 1 | only 1 band; all one band; duplicate: 游泳 |
| `HSK 1` | 159 | 159 | 159 | 0 | 0 | 1 | only 1 band; all one band |
| `HSK 3` | 258 | 257 | 258 | 0 | 0 | 1 | only 1 band; all one band; duplicate: 注意 |
| `HSK 4` | 276 | 276 | 276 | 0 | 0 | 1 | only 1 band; all one band |
| `HSK 5` | 863 | 863 | 863 | 0 | 0 | 1 | only 1 band; all one band |
| **TOTAL** | **3042** | **3036** | **2145** | **571** | **326** | | **52 categories** |

## Finding 1 — the difficulty bands do not mean anything consistent

This is the important one, and it is not a balancing problem. **The band labels carry no shared definition across decks.**

HSK 1–5 — the 1,707 words most learners would call the *graded* progression — are **100% `simple`**:

- HSK 1: {'simple': 159}
- HSK 2: {'simple': 151}
- HSK 3: {'simple': 258}
- HSK 4: {'simple': 276}
- HSK 5: {'simple': 863}

Meanwhile the words called `hard` are ordinary concrete topical nouns:

- Sports → `hard`: 排球 volleyball · 高尔夫球 golf · 拳击 boxing · 滑雪 skiing · 滑冰 ice skating · 武术 martial arts

And the words called `simple` include genuinely abstract HSK 5 vocabulary:

- HSK 5 → `simple`: 爱惜 to cherish · 安排 to arrange · 安全 safe · 按时 on time · 把握 to grasp · 摆脱 to get rid of

So a player who selects **Hard** gets Sports and Clothing vocabulary, and **none of HSK 4 or HSK 5**. A player who selects **Simple** gets 2,145 words that include all of HSK 5. The control is not merely unbalanced — it is inverted, and it cannot be fixed by adding words. **The band definition must be re-derived before any per-category balancing is meaningful.**

All 897 non-`simple` words (571 medium + 326 hard) live in the topical decks; the only banding signal that exists in the corpus today is HSK level, and it was flattened.


## Finding 2 — decks that cannot be played alone

| category | words | needs | note |
|---|---:|---:|---|
| `Animals (pets)` | 11 | +19 | **no band reaches 10 words** — the difficulty filter is dead here |
| `Animals (farm)` | 14 | +16 | **no band reaches 10 words** — the difficulty filter is dead here |
| `Family (immediate)` | 15 | +15 | one band usable |
| `Drinks` | 18 | +12 | one band usable |
| `Animals (wild basic)` | 23 | +7 | one band usable |
| `Clothing` | 26 | +4 | one band usable |
| `Food` | 26 | +4 | one band usable |
| `Body parts` | 29 | +1 | one band usable |

**Top-up worklist: 8 decks, ≈78 words to bring them all to 30.** This is a small, bounded job — roughly 3% of the corpus.


## Finding 3 — the band filter is dead for 31 of 52 decks

31 decks have only **one** band with ≥10 words, and 2 have **none**. So selecting a global difficulty silently empties almost every deck. Combined with Finding 1, the practical conclusion is that **the global difficulty selector should not be on the main screen** — it is a preference that promises something the content cannot yet deliver. See the menu redesign in `SPEC.md` §1.9.


## Finding 4 — duplicate entries

6 duplicate pairs across 5 files: `Greetings & polite phrases` 不客气 · `Prepositions & location words` 在...上, 旁边 · `Size & shape` 庞大 · `HSK 2` 游泳 · `HSK 3` 注意. Plus **1,333 cross-deck duplicate entries** (749 of 3,042 words repeat a Hanzi from another deck) — see `SPEC.md` §4.4.
