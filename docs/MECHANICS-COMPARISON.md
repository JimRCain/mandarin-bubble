# Mechanics comparison: POC vs new build

Read from source on 2026-10-09. POC = `~/business/dyad-apps/BubbleMandarin/src/components/GameBoard.tsx` (549 lines, the whole loop; its `Bubble.tsx` is a stale leftover). New build = `~/business/mandarin-bubble/src`. Every claim cites file:line.

Note on the existing inventory: `docs/POC-MECHANICS.md` is accurate about the POC, but its "Where our build stands" table (lines 97-108) and the fall-speed note (lines 26-27) are stale: they say the new build re-deals the board and cascades bubbles from above the board at 18/13/10 s. The current source does neither. Where that file and the source disagree, this document follows the source.

Verdict tokens: same, different, better, worse. "deliberate" marks a difference the code or docs say is intentional.

## Table

| Mechanic | Prototype behaviour | New-build behaviour | Verdict |
|---|---|---|---|
| Board on a correct tap | Pops the tapped bubble after 200 ms; board persists, nothing re-dealt (GameBoard.tsx:380-388, 396-405) | Pops the tapped bubble; board persists; refill tops up on its own timer (scoring.ts:173-194; useGame.tsx:475-497) | same |
| Target moves on a correct tap | Target hops to a random bubble still on the board (GameBoard.tsx:396-405) | Target hops by index into the post-pop board (scoring.ts:117-120, 173-180) | same |
| Hop source pool | Any remaining on-board bubble, uniform random (GameBoard.tsx:396-405) | Any on-board bubble after the pop, excludes the popped word (scoring.ts:173, 180) | same |
| Hop can pick a just-dealt bubble | No; on an empty board it sets target null instead (GameBoard.tsx:401-403) | No, except the empty-board corner where the one replacement is all that is left (scoring.ts:174-180; useGame.tsx:350-357) | different, better |
| Empty-board corner | Target null; refill cannot restore it (targetSetRef already true) and every later tap is ignored, game dead (GameBoard.tsx:401-403, 286-289, 441) | Deals one spare bubble and targets it (useGame.tsx:350-357; scoring.ts:174-180) | different, better |
| Refill trigger | One spawn every 800-1200 ms while the board holds fewer than maxBubbles (GameBoard.tsx:243, 305-310) | One refill every 800-2000 ms while bubbleIds is below the pace capacity (useGame.tsx:77, 480-490) | same |
| Refill word rules | Avoids a Hanzi already on the board; the same English gloss may repeat (GameBoard.tsx:262-264) | Avoids the same id, Hanzi or gloss; prefers words not yet asked (selection.ts:32-34, 155-172) | different, better |
| New-bubble entry | Initial fill 200 ms apart at fixed y slots; later refills enter at a random y in the top 20% (GameBoard.tsx:252-258, 298-302) | New ids dealt on screen at y = stagger * index (0, 0.08, ...); a refill enters at y = 0 (board.ts:116-133; types.ts:46-50) | different |
| Lane allocation and spacing | Fixed 4-6 slots at a 5% margin; a lane counts free once its bubble drops below 0.6 height, so two bubbles can share a lane (GameBoard.tsx:196-205, 221-237) | One bubble per lane, lane is as wide as a bubble plus air, radius solved from the lane width and reused by the hit test (board.ts:9-14, 44-70) | different, better |
| Wrap threshold | 0.8 of height (GameBoard.tsx:71, 338) | 0.8 of height (board.ts:78) | same |
| Wrap when every lane is full | Pins the bubble just above the wrap line and it stops falling (GameBoard.tsx:338-346) | Swaps lanes with another bubble and returns to the top; lanes stay unique (board.ts:156-172) | different, better |
| Wrap return position | A random y in the top 15% of the chosen lane (GameBoard.tsx:343) | y = 0, the top edge (board.ts:171) | different |
| Same word twice on the board | Blocked by Hanzi only (GameBoard.tsx:262-264) | Blocked by id, Hanzi and gloss; the opening round is built collision-free (selection.ts:32-34, 99-131) | different, better |
| Exactly one visible match | Not guaranteed; a later spawn can share the target's gloss, so two bubbles can both be right (GameBoard.tsx:262-264, 443) | planRound excludes ambiguous targets and colliding distractors; refills cannot collide with anything up (selection.ts:40-52, 155-162) | different, better |
| Target repeat inside a session | None; a re-spawned word can be the target again at once | askedIds blocks a repeat target until the pool is exhausted (scoring.ts:193; selection.ts:79; useGame.tsx:422) | different, better |
| Target chosen at deal | The first spawn becomes the target (GameBoard.tsx:286-289) | planRound picks a target and shuffles the round (selection.ts:85-91) | different |
| Wrong-tap cost | score = max(0, score - penaltyWrong), flat tiers 20/40/80 (GameBoard.tsx:428, 36-68) | No point loss; +2000 ms on the clock, streak reset, word into the review list (scoring.ts:202-212; config.ts:11) | different, deliberate (SPEC 1.5) |
| Wrong tap: correct answer revealed | Flashes the correct bubble green for 300 ms (GameBoard.tsx:430-434) | Does not reveal it; only the tapped bubble is marked (scoring.ts:208; GameBoard.tsx:175-180) | different, worse |
| Wrong tap: highlight duration | 300 ms animation, then cleared (GameBoard.tsx:418-426) | No timer; the tapped bubble stays marked until the next answer or deal (scoring.ts:131, 208; GameBoard.tsx:175-180) | different, worse (minor) |
| Correct tap: bubble feedback | 200 ms green pop animation, then removal (GameBoard.tsx:380-388; GameBoard.css:142-150) | The bubble is removed in the same state update, so the 'correct' feedback never renders and no pop animation exists (scoring.ts:194-195; GameBoard.tsx:171-192) | different, worse |
| Double-tap guard | A popping bubble ignores pointerdown (GameBoard.tsx:517) | Reducer refuses a re-score of the word just answered (scoring.ts:157-163), but the bubble is removed at once so the guard is unreachable | different, defensive only |
| Difficulty controls | One switch sets word filter, bubble count, fall speed and score together (GameBoard.tsx:36-68) | Band (word filter) and pace (count and speed) are independent (types.ts:14-15, 46-50, 115-124) | different, deliberate (SPEC 4.3) |
| Bubbles per level | 4 / 5 / 6 (GameBoard.tsx:36-68) | 4 / 5 / 6 (types.ts:46-50) | same |
| Fall speed, s per board height | 40 / 35 / 30 (GameBoard.tsx:36-68, 329) | 40 / 35 / 30 (types.ts:46-50) | same |
| Clock and session end | No clock; no end except reaching the score goal, then a Level Complete modal offers endless (GameBoard.tsx:172, 392, 528-544) | 15 correct or 90 s, then a summary screen (config.ts:6-10; scoring.ts:138-139, 167; SummaryScreen.tsx) | different, deliberate |
| Score rules | Flat pointsCorrect per answer, minus penaltyWrong on a wrong tap (GameBoard.tsx:36-68, 390-394, 428) | pointsPerCorrect * min(streak + 1, 5); no point penalty (config.ts:13-16; scoring.ts:104-106, 185) | different, deliberate |
| Combo feedback | None | A "Nx combo" overlay at streak >= 2 (GameBoard.tsx:194-201) | different, better |
| Weighting toward missed words | adjustWeight x0.8 on correct, x1.3 on the target when wrong, feeding the weighted spawn picker (GameBoard.tsx:152-164, 266-271, 360-365) | Leitner progress is written but no selector reads it; buildQueue is used only in tests (useGame.tsx:360-374; review.ts:97; selection.ts:155-172) | different, worse |
| Pause on hidden tab | None | Pauses on visibilitychange; the frame delta is clamped to 64 ms (useGame.tsx:454-458; GameBoard.tsx:88) | different, better |
| In-flight session persistence | None | Session state and asked ids saved on discrete events, restored on reload (useGame.tsx:284-297; store/persistence.ts) | different, better |
| Pinyin default | On (CategoryMenu.tsx:64) | On (types.ts:119-122) | same |

Row count: 31.

## Where the new build is still wrong

1. Correct taps give no bubble-level feedback, and the hold that the code and spec describe does not happen.
   `scoring.ts:194` sets `bubbleIds` to the post-pop board, so the answered word is gone from state in the same update that sets `lastFeedback` at `scoring.ts:195`. `GameBoard.tsx:171-192` renders bubbles only from `state.bubbleIds`, so the 'correct' feedback never renders, and there is no exit animation anywhere under `src/` (the only animation rule is the reduced-motion reset at `styles/index.css:35-38`). The guard comment at `scoring.ts:153-156` and `docs/SPEC.md:62` both assume the bubble stays up for a green flash (SPEC says 420 ms). On screen the player gets audio and a score change only.
   Fix: keep the answered id in `bubbleIds` for about 420 ms before removing it, or drive a CSS pop purely from `lastFeedback`.

2. The double-tap guard is dead code as a result.
   `scoring.ts:157-163` refuses a second score for the word just answered, but that word is already out of `bubbleIds` (`scoring.ts:194`), and taps only resolve against on-board ids (`GameBoard.tsx:109-113`; `board.ts:203-215`). The guard can never fire in normal play.
   Fix: either restore the hold (then the guard becomes live) or delete the guard and its comment, which currently states a premise the code does not implement.

3. Persisted spaced-repetition progress is written but never read by selection.
   `useGame.tsx:360-374` records a Leitner box and `dueAt` per word, but neither `planRound` nor `nextBubbleWord` takes `progress`; their inputs are the session-level `askedIds` only (`selection.ts:79, 155-172`). `buildQueue` (`review.ts:97-117`) is referenced only by tests (`tests/review.test.ts:3`). This is exactly the "persisted data nothing consumes" trap the spec named (`docs/SPEC.md:225`, `:511`), and it is what FR-21 forbids.
   Fix: seed `planRound` and `nextBubbleWord` from `buildQueue(progress.words, now, limits).ids` so due reviews and fresh words drive the pool.

4. A wrongly tapped bubble stays highlighted with no timer.
   `lastFeedback` is cleared only on a new deal (`scoring.ts:131`) or overwritten by the next answer (`scoring.ts:195, 208`). `GameBoard.tsx:175-180` therefore keeps the red border and background on that bubble for as long as the player hesitates. The POC cleared it after 300 ms (`GameBoard.tsx:422-426`).
   Fix: clear `lastFeedback` after a short timeout, or add a CSS animation that fades the mark.

5. Bubble feedback is colour-only, against the project's own accessibility requirement.
   `Bubble.tsx:49-53` conveys correct and wrong by border and background colour alone. FR-13 and NFR-5 require correct/incorrect to be non-colour-only (`docs/SPEC.md:207`, `:376`).
   Fix: add a shape or glyph (a tick and a cross) alongside the colour.

## Where the prototype was right and we are not

1. The POC revealed the correct bubble on a wrong tap.
   `GameBoard.tsx:430-434` flashes the correct bubble green for 300 ms. The new build marks only the bubble that was tapped (`scoring.ts:208`). For a learner meeting a character for the first time, the POC at least showed the right answer; the new build removes that signal and leaves no substitute. This is the sharper half of the wrong-tap row above.

2. The POC actually weighted repeats toward missed words.
   `adjustWeight` raises the weight x1.3 when the target is missed and the weighted picker consumes it at `GameBoard.tsx:152-164, 266-271, 360-365`. The new build stores the equivalent data (Leitner boxes and due dates) but the selector ignores it (finding 3 above), so this POC behaviour is lost rather than ported.

3. The POC gave a visual pop on a correct tap.
   `GameBoard.tsx:380-388` plus the `pop` keyframe (`GameBoard.css:142-150`) shows a 200 ms green glow and scale-down. The new build removes the answered bubble instantly with no animation (finding 1 above).

## Deliberate divergences

- Session shape: 15 correct or 90 s, and a 2 s wrong-tap penalty instead of a score penalty. Reason recorded at `docs/SPEC.md:38-45` and `:60-62`; constants at `config.ts:6-21`.
- Score is a combo multiplier capped at 5, not a flat per-tier value. Reason: the scoreboard is not a gate (`config.ts:13-16`; `docs/SPEC.md:64-77`).
- Band and pace are separate controls, so word difficulty no longer drags fall speed and scoring with it. Reason: `docs/SPEC.md:267-271`; `types.ts:14-44`.
- One bubble per lane with a fitted radius, replacing the POC's fixed-size bubbles that overlapped when the board got busy. Reason: `board.ts:9-14`; `docs/SPEC.md:268` / POC-MECHANICS defect "Bubble size".
- Duplicate prevention extended from Hanzi to id, Hanzi and gloss, because 56 glosses collide inside a deck. Reason: `selection.ts:6-10`, `:31-34`; `docs/SPEC.md:204`.
- The wrap always returns to the top and swaps lanes when the board is full, rather than pinning a bubble above the line. Reason: SPEC 1.3 as cited at `board.ts:156-161`.
- Fall speed set back to the POC's 40/35/30 s per height after an earlier faster build (18/13/10) felt rushed. Reason: `types.ts:29-34`.
- No first-sight teaching card; the exposure phase was removed by the owner on 2026-10-07. Reason: `types.ts:92-96`; `docs/SPEC.md:60`.
- Persistence of in-flight sessions and a tab-blur pause are new, because the new build has a clock and a phone-first target. Reason: `useGame.tsx:453-458`; FR-15, FR-22 (`docs/SPEC.md:209, 226`).
- Feedback goes through reducer state rather than a `document.querySelector` DOM poke. Reason: POC-MECHANICS defect "DOM poking"; `scoring.ts:52`, `:195`.
- The board's persistent pop-and-hop model and the independent refill timer are not a divergence: they were re-adopted from the POC on Jim's instruction, and the code says so (`board.ts:20-25`; `useGame.tsx:72-77`; `docs/POC-MECHANICS.md:42-52`).

## Unclear

- Whether removing the answered bubble instantly is intended. The implementation does it (`scoring.ts:194`), the in-file comment (`scoring.ts:153-156`) and SPEC (`docs/SPEC.md:62`) say the opposite (hold about 420 ms). The source is authoritative for behaviour, but which one is wanted is a product call, not readable from the code.
- Whether `lastFeedback` is meant to persist with no timer. There is no clearing timeout, and none is mentioned; it may be intended as a "what you tapped" marker rather than a flash.
- Whether `buildQueue` is meant to drive selection. It exists, is unit-tested, and is unused at runtime; only `docs/SRS-PROPOSAL.md` discusses it, and no code comment says which component should call it.
- Whether the mid-session re-deal path is expected. If a correct tap empties the board and `nextBubble` returns null, the deal effect (`useGame.tsx:401-402`) cannot tell "session start" from "mid-session empty board" and deals a whole new board, a re-deal the POC never did. It is reachable only when the pool has no non-colliding word left, so it is a rare fallback, not a routine path.