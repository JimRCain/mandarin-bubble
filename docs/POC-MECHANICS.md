# POC mechanics inventory (read from source, 2026-10-07)

The original "Bubble Mandarin" POC lives at `~/business/dyad-apps/BubbleMandarin`
(leave it alone, it is the reference). Jim's instruction on 2026-10-07: *"I want
you to look at the mechanics of the original version a bit more. We can largely
keep the same mechanics for the game."* This file is that reading, with the
constants taken from the source rather than from memory, so the port does not
have to re-read the POC.

Everything below is cited from
`BubbleMandarin/src/components/GameBoard.tsx` (549 lines, the whole loop;
`Bubble.tsx` in the POC is a stale leftover, see Defects).

## The engine's constants (verbatim)

| Difficulty | bubbles | fallSpeedMs | pointsCorrect | penaltyWrong | goal | word filter |
|---|---|---|---|---|---|---|
| simple | 4 | 40 000 | 10 | 20 | 200 | simple |
| medium | 5 | 35 000 | 20 | 40 | 400 | simple+medium |
| hard | 6 | 30 000 | 40 | 80 | 800 | all |

`LOCK_THRESHOLD = 0.6`, `WRAP_THRESHOLD = 0.8`,
`STAGGER_Y = [0, 0.08, 0.16, 0.24, 0.32, 0.40]` (lines 70-72).

`fallSpeedMs` is the time to cross the *whole* board height, so a bubble falls
at `height / fallSpeedMs`. Ours is `PACE_SPECS` at 18/13/10 s per height, i.e.
about 3x faster. The POC is a slow game; there is no clock anywhere in it, so
its only pressure is the fall.

## The loop, mechanically

1. **Lanes.** `slotPositions` (196-205): one lane per bubble, evenly spaced
   across the width with a 5% margin. Same idea our `boardConfigFor` now uses,
   and it is what the POC did, so lanes are not an invention of ours.
2. **Initial fill.** Spawns `maxBubbles` bubbles 200 ms apart (298-302).
3. **Refill, not re-deal.** After that, one bubble is spawned every
   800-2000 ms (305-310) **into a free lane**, and only while the board holds
   fewer than `maxBubbles` (243). A lane counts as free while its bubble is
   above `LOCK_THRESHOLD` (223-233).
4. **Wrap.** A bubble that passes `WRAP_THRESHOLD` is moved back near the top of
   a free lane. If no lane is free it is pinned just above the wrap line instead.
5. **A correct tap (`handleCorrectTap`, 367-408).** Ding; speak the Hanzi if the
   voice toggle is on; `adjustWeight(word, 0.8)`; flash green and pop the bubble
   after 200 ms; `score += pointsCorrect`; if the score reaches the goal, show
   "Level Complete". Then, and this is the mechanic we are missing,
   **the target hops to a random bubble that is still on the board** (396-405).
   The board never re-deals.
6. **A wrong tap (`handleWrongTap`, 410-438).** Buzz; `adjustWeight(target, 1.3)`;
   the tapped bubble flashes red for 300 ms; the *correct* bubble flashes green
   for 300 ms; `score = max(0, score - penaltyWrong)`; vibrate 100 ms. The target
   does not change, and the tapped bubble stays on the board.
7. **Word weighting** (152-164, 360-365): per-English weight, default 2 for
   selection, clamped to 0.2-5, `x0.8` on correct and `x1.3` on wrong, applied
   only when the pool is bigger than 20 words. This is the POC's spacing
   algorithm, and it keys on the **English gloss**, not the word id.
8. **Endless** (173, 392): after Level Complete, "Yes, continue" resets the score
   and makes the goal infinite.

## Reading aids

- `CategoryMenu.tsx:64`: `showPinyin` starts **true**.
- `CategoryMenu.tsx:65`: `speakOnCorrect` starts **false**.
- `Bubble.tsx:64`: pinyin renders *inside* the bubble under the Hanzi.

## Defects in the POC that must not be ported

- **The goal arithmetic.** +10 for a correct answer and -20 for a wrong one
  against a goal of 200 means an answer rate below 2/3 can never finish a level
  (SPEC 2.3). Whatever we do with the score, a session must always be finishable.
- **Bubble size.** `clamp(70px, 10vw, 120px)` bubbles with up to 6 lanes on a
  390 px screen is the crowding Jim reported. We fit the bubble to the lane and
  have a test that measures the gap (FR-11).
- **The stale `Bubble.tsx`.** It carries its own dead pop state and a comment
  thread admitting the design changed; the live render is inline in GameBoard.
  Nothing to port from it except the pinyin placement.
- **Audio.** An empty sprite with a `SpeechSynthesisUtterance` fallback (121-127)
  means playback depended on the device having a zh-CN voice. Replaced by
  pre-rendered clips with silent degradation (SPEC AR-2/AR-4).
- **DOM poking.** The correct bubble is flashed by a
  `document.querySelector([data-hanzi=...])` and a class toggle (430-434). Ours
  goes through reducer state, which is testable.

## Where our build stands against this

| Mechanic | POC | Ours today |
|---|---|---|
| Lanes | yes, 4-6 | yes, fitted to the lane + density test |
| Refill into a free lane | yes | no: we re-deal a whole round |
| Target hops to an on-board bubble | yes | no: we re-deal |
| Fall speed (s per height) | 40 / 35 / 30 | 18 / 13 / 10 |
| Clock | none | 90 s per session |
| Score | flat 10/20/40 | streak-scaled 10-50 |
| Wrong answer | -score, target stays | -2 s |
| Goal | 200/400/800 + endless | 15 correct |
| Pinyin | in the bubble, on by default | in the bubble, on by default (2026-10-07) |
| Spawn | on screen, staggered in place | cascades from above the board |

## Port order for the next session (Jim paused this on 2026-10-07)

1. Engine: keep N bubbles on the board and refill into free lanes; wrap to a
   free lane; pin above the wrap line when every lane is locked.
2. Target hop: the target is one of the on-board bubbles; on a correct pop it
   hops to a remaining bubble. A spawn must never collide with a bubble already
   on the board, by Hanzi **or** by gloss (56 ambiguous glosses in the content).
   This matters because the POC's weighting is keyed on the gloss.
3. Spawn on screen and staggered in place, never above the board. This also
   removes the class of bug where a dealt bubble cannot be tapped yet.
4. Pacing: move to the POC speeds (40/35/30 s per height). Decide the clock at
   the same time, because slow fall plus a 90 s clock is not coherent.
5. Scoring, goal, Level Complete, endless: **Jim has not decided this.**
   *"The scoring system, I'm still open to change on, we will tune as we build."*
   Ask before implementing, and keep any penalty small enough that a level is
   always finishable.
6. Keep: pinyin in the bubble on by default, the lane density rule and its test,
   the reducer double-tap guard, and the e2e assertion that the target moves on
   after a correct tap.
