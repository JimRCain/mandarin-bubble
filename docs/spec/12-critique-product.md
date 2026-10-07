# Round 2 adversarial critique — product / learning-science lens

Independent agent, **distinct model lineage from round 1**. Brief: find what is wrong with `SPEC.md` (then v1) and say nothing about what is fine. Raw findings as returned. Dispositions are in `SPEC.md` §11.2.

---

## 1. [BLOCKER] §1.2, §1.3 steps 2–5, FR-5–FR-8
**Problem.** The loop is test-first: a learner's first sight of a character is a timed tap with a penalty. No requirement ever exposes Hanzi, pinyin, sound and meaning together before quizzing, so the only way to "learn" a never-seen character is a −20 wrong tap followed by a green flash. That is trial-and-error, not instruction.

**Change.** Add a MUST: a word's first encounter in a session renders as an untimed exposure card showing Hanzi + pinyin + audio + English together; the word enters the quiz pool only after that teach step.

## 2. [BLOCKER] FR-15, §9 Q1, §8 step 3
**Problem.** Q1 (learning tool vs arcade game) is flagged blocking, yet §8 ships a "must be fun with one category" arcade loop at step 3 and leaves FR-15 as a SHOULD. If Q1 is resolved late or defaults to arcade, v1 ships with no scheduling mechanism and the rewrite reproduces the POC's core flaw: a game wearing vocabulary.

**Change.** Resolve Q1 before step 3 and rewrite FR-15 as a MUST with a concrete persisted model (per-word box/interval, next-due timestamp, lapse count) stored alongside FR-14.

## 3. [MAJOR] FR-12 / FR-14 / FR-15, §9 Q6
**Problem.** Nothing defines what makes session 4, 5 or 10 different from session 1. Without a scheduler and with rewards undecided (Q6), every session is an independent random draw from a static pool: once common words are seen the game is trivial, and the unseen remainder is a wall of −20 guesses. There is no mastery signal, no novelty curve, and no reason to return.

**Change.** Add a player-facing progression model: a "Today" queue (due reviews + a bounded number of new words), a per-deck mastery meter (known / learning / unseen), and a streak or equivalent return trigger, shipped in v1.

## 4. [BLOCKER] §1.2, §3 Selection (FR-1–FR-4)
**Problem.** Trace a complete beginner's first run: 51 categories with no recommended start, no explanation of the loop, pinyin possibly on. Unknown characters rise; the player guesses. Each wrong tap costs −20 against a +10 gain, so the 200 score goal is unreachable, and the only teaching is a post-hoc green flash. They quit within the first 30–60 seconds, before any word is encoded.

**Change.** Add a MUST first-run flow: auto-pin a starter deck (top-N HSK 1), default difficulty to the band that actually contains words, and walk through one teach→test item before releasing the player into the pool.

## 5. [MAJOR] §1.3 step 6, §10 difficulty parameters
**Problem.** "Level Complete" fires on an arbitrary score threshold (200/400/800) inherited from the POC and tied to point values, not to anything learned; "endless" then deletes the only progress signal. The structure measures taps, not acquisition, so completion is meaningless as an outcome.

**Change.** Redefine a session as a learning unit (clear the due-review queue + introduce K new words) and make completion a scheduler state. Keep score, if at all, as cosmetic; retire the 200/400/800 goal.

## 6. [MAJOR] FR-14 / S4 / §7 Persistence
**Problem.** Per-word accuracy is persisted, but with FR-15 open nothing consumes it. "History survives reload" therefore yields a passive log, not learning: the data never changes what appears next. This is the POC's `adjustWeight` mistake with a database attached.

**Change.** Specify FR-14's store as the scheduler state (box, interval, next-due, lapses, last-seen) and make target selection read it as the primary source rather than drawing randomly.

## 7. [MAJOR] §4.2 / S3
**Problem.** "Difficulty" carries two incompatible meanings: a pedagogical label per word (HSK/frequency) and the POC's gameplay parameters (bubble count, fall speed, goal points). A learner, or the implementation, cannot tell whether choosing "hard" selects harder words or simply makes the game twitchier.

**Change.** Split into two orthogonal settings — word level (which words are eligible) and pressure (bubbles/fall speed) — and never allow one to control the other; label them distinctly in the UI.

## 8. [MAJOR] FR-7 / FR-17
**Problem.** FR-7 promises exactly one unambiguous match, but FR-17 only validates duplicate hanzi within a category, not duplicate or overlapping English glosses. With 3,042 curated words, two entries glossed "rice" or "to close" yield multiple defensible answers, and the game penalizes the learner for the app's own ambiguity.

**Change.** Extend FR-17 to normalize and detect near-duplicate English glosses (and cross-deck hanzi collisions), and require the target selector to exclude any target whose gloss collides with a candidate on screen.

## 9. [MINOR] AR-1 / FR-11
**Problem.** Audio is specified only as replay "available before the answer", never as an automatic cue, so the strongest beginner signal (hearing the word while seeing its character) is opt-in and easily missed. Separately, pinyin-on lets a learner match the romanized string rather than the Hanzi form, training pinyin reading, not character recognition.

**Change.** Require auto-play of the target's Hanzi pronunciation on prompt (mute-respecting), and default bubbles to Hanzi-only during the test, revealing pinyin with the answer.

## 10. [MINOR] NFR-3 / FR-15
**Problem.** NFR-3 mandates unit tests for "weighting" while FR-15 is explicitly undecided. The spec requires verified behavior for a mechanism it has not chosen, so the test either blocks the build or gets written against whatever the implementer improvises.

**Change.** Gate the weighting test on the Q1/FR-15 decision, or remove it from NFR-3 until the mechanism is specified.

## 11. [MINOR] FR-13 / §9 Q7 / S1
**Problem.** The misses drill is the only consolidation step in the whole design, and Q7 leaves it optional in v1. If cut, a session ends with a score and no mechanism to re-encounter what was missed — errors evaporate.

**Change.** Make the misses drill (or, better, enrollment of misses into the review queue) a MUST for v1 rather than a scope question.

---

## Top 3 changes (as stated by the critic)
1. Resolve Q1 as a learning tool and promote FR-15 to MUST: persist a per-word scheduler (new-word introduction + Leitner-style expanding review intervals) that — not a random draw — decides what spawns each session, and make FR-14 store that state.
2. Add a teach-then-test requirement: every word's first encounter is an untimed exposure card (Hanzi + pinyin + audio + English); add first-run onboarding that pins a starter deck. This fixes both the shallow-reflex problem and the beginner's first session.
3. Replace the score-threshold "Level Complete"/endless split with a learning-defined session (clear the due-review queue + introduce K new words), enroll misses into the review queue, and make escape/timeout non-punitive.