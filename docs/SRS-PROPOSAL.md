# Adaptive exposure: what the game should do with what it already knows

Status: proposal, nothing implemented. Written 2026-10-08 for Jim to choose from.

## 1. The idea in one line

A word the player answers quickly and correctly should come back less often, and
something weaker should take its slot. The board has 4 to 6 slots, so "how often
a word appears" is the only scheduling lever this game has, and it is a better
fit than a calendar: the player never sits down to review a due list, they just
tap bubbles for 90 seconds.

## 2. What already exists (so this is an extension, not a rewrite)

`src/game/review.ts` is a five-box Leitner system and it is already wired to
storage and to the "known / learning / unseen" counters:

- `WordProgress` per word: `box` (0..4), `dueAt`, `seen`, `correct`, `lapses`, `lastSeenAt`.
- `afterCorrect` moves up a box and sets `dueAt = now + intervalMs(box)`.
- `afterWrong` drops to `REVIEW.lapseBox` and counts a lapse.
- `buildQueue` picks due reviews first, then fresh words, capped.

Two gaps make it a passive log rather than a scheduler:

1. **Board selection does not read any of it.** `planRound` and `nextBubbleWord`
   (`src/game/selection.ts`) select from the filtered pool, excluding only
   `session.askedIds`. A word in box 4 is exactly as likely to be dealt as a word
   the player has failed six times. The file's own header says the point of
   storing progress is that the selector consumes it.
2. **No signal about how easily the player answered.** `afterCorrect` treats a
   0.8 s tap and an 8 s tap identically. In a game where the player never presses
   Again/Hard/Good/Easy, response time is the grade, and right now the grade is
   thrown away.

There is also a fairness hole: distractor exposure is unrecorded. `askedIds` only
tracks words that were the target. A word can sit on the board as a distractor in
twenty sessions, be pushed to the front of the player's mind every time, and
still count as `unseen` and keep maximum priority.

## 3. What Anki actually does, and which parts map here

| Anki / FSRS mechanism | What it is for | Maps to this game? |
| --- | --- | --- |
| Grade buttons (Again, Hard, Good, Easy) | The whole feedback signal in a flashcard app | Yes, but with no buttons: a fast correct tap is Easy, a slow correct tap is Hard, a wrong tap is Again |
| Interval growth per successful review (SM-2 ease, FSRS stability) | Delay the next sighting as memory strengthens | Yes, expressed as a spawn weight instead of a date |
| Lapse handling (drop back, relearning steps) | A forgotten card returns soon | Already present (`lapseBox`), keep it |
| Leech detection (tag, then suspend after N lapses) | Stop wasting time on a card that will not stick | Yes to detection, no to suspension: in an arcade game nothing is ever taken away, so a leech should get *more* exposure, not less |
| New cards per day | Stop a big deck from swamping the learner | Yes, as a cap on how many unseen words may be on one board |
| Bury siblings (one card per note per session) | Do not ask the same fact twice in a row | Already stricter here: the collision rules forbid two bubbles sharing a Hanzi or a gloss (FR-10) |
| Fuzz on intervals | Avoid identical review patterns, spread the load | Yes, cheap: jitter the weights, never a fixed order |
| Desired retention (70 to 97 percent, 90 is the default) | The one dial that trades workload against remembering | Yes, as one setting: how often a learned word comes back |
| FSRS difficulty/stability model with fitted parameters | Personalised intervals from a long review history | No, see section 6 |

Two sources, if a reader wants the real thing: the FSRS technical write-up at
https://expertium.github.io/Algorithm.html and the fsrs4anki tutorial at
https://github.com/open-spaced-repetition/fsrs4anki/blob/main/docs/tutorial.md.

## 4. Four things I would build, in priority order

### 4.1 Weighted spawn by mastery (the core change)

Replace "exclude anything in `askedIds`, then pick uniformly" with a weight per
word and a weighted sample using the injected `rng` (stays deterministic and
unit-testable).

```
weight(word) = base(box) * dueFactor * speedFactor * leechFactor
```

- `base(box)`: unseen 8, box 1 = 6, box 2 = 4, box 3 = 2, box 4 = 0.75.
  A fully learned word is never zero: it still shows up, just rarely.
- `dueFactor`: 2.0 when `dueAt <= now`, 0.3 when not yet due.
- `speedFactor`: 0.4 when the player's median correct time for this word is
  under the fast threshold, 1.0 in the middle, 1.6 when it is slow.
- `leechFactor`: 1.5 once `lapses >= 4`.

Hard filters stay hard: deck and band membership (FR-9), and the collision rules
(FR-10: no two bubbles sharing a Hanzi or a gloss). Those must not become weights,
or the board can be dealt two bubbles that answer the same prompt.

Cost: one new pure function in `selection.ts`, and `planRound` / `nextBubbleWord`
take `progress` as an argument. No new storage, no migration.

### 4.2 Speed is the grade (what you asked for, and the interesting part)

Record response time on every correct answer and derive an implicit grade:

- Fast correct (under the threshold): **two** boxes up.
- Correct: one box up.
- Slow correct (over about twice the threshold): box stays, `dueAt` refreshed.
  This is Anki's Hard: it is not a failure, it just should not buy progress.
- Wrong: drop to `lapseBox`, count a lapse (as today).

Thresholds scale with pace, because rush pace is meant to be read quickly:
chill 2500 ms, normal 1800 ms, rush 1300 ms. **[superseded 2026-10-12]** the three
modes now share one fall speed, so `REVIEW.fastMs` holds 1800 ms for all three and
the record keeps its per-pace shape only so a mode that earns its own figure stays
a one-line change (SPEC §4.3).

Per word, store the median of the last 5 correct response times (a median, not a
mean, so one distracted tap does not reclassify a known word).

This is the single most valuable thing to take from Anki, and it needs no UI: the
player's finger is the grade button.

### 4.3 Leeches earn exposure instead of punishment

After 4 lapses a word becomes sticky: it is guaranteed a slot on the next board
it is eligible for, doubling as a distractor (passive reading practice) if it is
not the target, and it gets `leechFactor` 1.5 for the following sessions. It stops
being sticky after two clean correct answers. Nothing is ever removed, which keeps
the SPEC 1.3 non-punitive rule intact.

Note the overlap with FR-19 (`wrongIds` already feeds a review list): sticky words
are the same set, just consumed by the selector instead of only displayed.

### 4.4 A new-word budget per board

At most one unseen word per board slot set, and at most 3 new target words per
session. A four-bubble board should read as "two due reviews, one in progress,
one new" rather than four words the player has never seen, which is both
demoralising and unfair (an unknown target among unknown distractors is a coin
flip, not a test of reading).

Once more than half the pool is in box 3 or above, the budget can relax.

## 5. Two smaller things worth doing while the file is open

- **Fairness counter.** Add `surfaced` (times the word was on the board, asked or
  not) alongside `seen` (times asked). If `surfaced >= 5 && seen === 0`, force the
  word to be the target the next time it appears. Words should not live forever as
  invisible background scenery. Keep `seen` as asked-only so the leech and mastery
  maths stay meaningful.
- **A review screen that shows the model working.** Per word: box, seen, correct,
  lapses, median correct ms, surfaced. Two lists: "strong" (box 4, fast) and
  "stuck" (lapses high). Without this there is no way to tell whether the weights
  are any good, and no way to tune the constants.

## 6. What I would skip, and why

- **Full FSRS (difficulty plus stability, parameters fitted to review history).**
  It needs a long history per learner to fit, and its payoff is a smaller daily
  review count for a large deck. This pool is about 2,345 words, sessions are 90
  seconds, and the box model is explainable on one screen. `review.ts` already
  says it is deliberately simpler than Anki. Revisit only if the game gets a
  "study" mode with a real due list.
- **Calendar scheduling as the primary driver.** Do not block a session because
  nothing is due. `buildQueue` should stay a tiebreaker, not a gate.
- **Two representations of the same thing.** FSRS's difficulty and our box would
  be measuring one property twice. Pick the box, and let speed decide how fast the
  box moves.
- **Suspension / giving up on a word.** Wrong for a game, and it contradicts the
  no-punishment guarantee that makes the board's wrap rule safe.

## 7. Open decisions for Jim

1. Which of 4.1 to 4.4 to build first? My order: 4.1 and 4.2 together (they are
   the same mechanism), then 4.3 and 4.4 as one small change, then section 5.
2. Should a slow correct answer really earn nothing? It is the one place where
   speed-as-grade can feel unfair to a beginner who reads carefully. The
   alternative is half credit (a smaller box bump) instead of none.
3. Should the weights be visible to the player? A "focus on my weak words" toggle
   that collapses the pool to box 0 and 1 plus leeches would suit deliberate
   practice. It is the same selector with a different pool.
4. How strongly should learned words retire? `base(box4) = 0.75` against 8 for
   unseen means a known word is roughly one tenth as likely. That number is the
   game's desired retention dial and it is worth feeling before settling it.

---

## Status: what shipped (2026-10-09)

Implemented and tested, on the branch `exposure-and-feedback` (not pushed):

| # | Mechanism | Where |
| --- | --- | --- |
| 4.1 | Weighted spawn by mastery | `spawnWeight()` in `src/game/review.ts`, consumed through the new `weightOf` option of `planRound()` / `nextBubbleWord()` in `src/game/selection.ts`, wired in `src/useGame.tsx` |
| 4.2 | Speed is the grade | `gradeFor()` and the timed `afterCorrect(prior, now, elapsedMs, fastMs)` in `src/game/review.ts`; the response time is `roundElapsedMs`, the thresholds are `REVIEW.fastMs` per pace |
| 4.3 | Leeches get exposure, not suspension | `REVIEW.leechLapses` and `weightLeechMultiplier`, applied inside `spawnWeight()` |
| 4.4 | New-word budget per board | `REVIEW.newPerBoard`, enforced in `nextBubbleWord()` |

Rules now covered by tests in `tests/exposure.test.ts` (12 of them), alongside the
existing `tests/review.test.ts` and `tests/selection.test.ts`.

### Decisions taken while building

- **Distractors are not weighted.** Need decides the target; a distractor is still
  chosen for plausibility (same deck, comparable band). Weighting distractors would
  fill the board with words the player cannot read, which is the coin flip FR-12
  exists to avoid.
- **Weights multiply and are floored** at `REVIEW.weightFloor` (0.25). A word the
  player knows comes back roughly one tenth as often as an unseen word, and never
  stops coming back. Worked example, box 4 and not due and answered instantly:
  0.75 x 0.5 x 0.5 = 0.19 against 8 for an unseen word.
- **The unseen word is not given the due multiplier on top.** It is already at the top
  of the list; doubling it again would drown out the rest of the deck.
- **Section 5 item 1, "distractor exposure is unrecorded", is dropped rather than
  deferred.** It existed to stop a word that only ever appeared as scenery from sitting
  at top priority forever. The target is now drawn by weight from the whole pool
  instead of from the board, so an unseen word keeps the strongest weight and reaches
  the front soon enough. Recording distractor exposure would add a write per refill to
  buy a correction the weighting already makes.

### Still open, deliberately

- **SPEC.md:62, the 420 ms green hold on a correct tap.** Not implemented as written.
  The port pops the answered bubble in the same state update, so there is nothing left
  to colour; the wrong tap is the one that now reveals the right bubble. That line was
  written for the round-based mechanic and should be rewritten or dropped, not coded.
- **No pop animation.** The answered bubble leaves `bubbleIds` immediately, so a
  `@keyframes` on a popped bubble never plays. Roughly 20 lines, and it needs the node
  to outlive its state for one frame.
- **Leitner progress is read now, but nothing shows it.** `masteryCounts()` exists and
  is tested; no screen renders a "due today" row yet.
- **The three stale claims in `docs/POC-MECHANICS.md`** (lines 26-27 and 97-108) were
  not corrected yet. The comparison agent's findings in
  `docs/MECHANICS-COMPARISON.md` supersede them.
