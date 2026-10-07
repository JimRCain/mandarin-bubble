Read the spec; `spec/00-poc-analysis.md`, `spec/10-critique-qwen3.8-max.md`, and both `.err` files are empty. The POC clone and audit script live outside this project directory and were not readable, so §10's "measured" numbers are taken on the author's word.

## Findings

1. **blocker** · §1.1 vs §1.3.2 — The one-liner says bubbles escape "off the bottom"; the core loop says they "rise from the bottom." The single most important sentence in the document contradicts itself, and every downstream requirement (fall time, escape, spawn edge) inherits the ambiguity. Pick one direction and delete the other phrasing.

2. **blocker** · §1.3, FR-7, FR-8 — **The fail state does not exist.** Nothing says what happens when the correct bubble leaves the screen: is it a miss, a penalty, a re-target, a life lost, a session end? FR-8 covers only correct/incorrect taps. An arcade game whose lose condition is unspecified cannot be implemented or tested, and an agent will invent one. Add FRs: on correct-bubble escape → recorded as a miss, counts toward FR-13, new target chosen; define lives or their absence; define session termination.

3. **blocker** · S3, §4.2 vs §10 — Difficulty is still conflated. S3 promises tiers that "mean something per-word," but §10 reproduces the POC model where the same switch sets bubble count, fall speed, *and* scoring. Choosing "hard" filters the word pool and accelerates the game simultaneously, so a player who wants harder words cannot avoid a faster game. Split into two independent controls: word band (content filter) and speed/aggression (game setting), each separately selectable.

4. **blocker** · §10 parameters, §1.2 — The inherited scoring is unwinnable and contradicts the stated use. At +10/−20 with goal 200, score = n(30a−20): below ~67% accuracy the player can *never* finish, and there is no floor, no failure exit, no easier path. Above it, a session is 24–50 rounds — not the "short sessions" §1.2 promises. Redesign scoring with a stated target session length (e.g. 90 s or 20 words), clamp at zero or drop negative scoring, and define the session-ends condition explicitly.

5. **blocker** · FR-7 vs FR-17 — FR-17 forbids duplicate `hanzi` *within* a category only, and nothing checks duplicate `english` anywhere. FR-1 permits multi-category selection, so two visible bubbles can carry identical Hanzi, or two different Hanzi can share one English gloss ("rice", "to be"). CI passes green while FR-7 is violated at runtime. Require global Hanzi uniqueness across the whole corpus (or spawn-time exclusion of any bubble matching the target's Hanzi), and add duplicate-`english` detection within a spawn candidate set.

6. **blocker** · §9 vs §3 — Q1, Q5, Q7, Q8 are marked open or non-blocking, but §3 already hard-codes their answers: arcade scoring, TTS fallback, drill as MUST, pinyin toggle. If Q1 resolves to "learning tool," FR-8, FR-12, FR-13, §4.2 and the entire fall-timer model are wrong. Do not carry blocking opens that invalidate most of the MUSTs — answer Q1 in this document, then re-derive §3 from the answer.

7. **blocker** · AR-3, NFR-1, NFR-6/S8 — No size budget exists anywhere, yet the spec requires pre-rendered audio for up to 3,042 words, sub-2.5 s first interaction on 4G, *and* full offline playability. Those three cannot all hold without numbers. State: total v1 payload cap, audio format/bitrate, clip count for v1, and lazy-load vs bundled. "Mid-range phone over 4G" also needs a concrete throttling profile or NFR-1 is unmeasurable.

8. **blocker** · §7 (State), NFR-1 — "Animation must not depend on React re-rendering per frame" and "React renders from it" are mutually exclusive as written, and this is the highest-risk decision an agent will make. Specify concretely: rAF loop mutating DOM transforms directly with React owning only discrete state (score, target, round), or canvas. Also specify hit-testing. One table cell is not a decision.

9. **major** · §3 (absent) — **No first-run requirement at all.** A new user faces 51 categories and 3 bands with no defaults, no explanation of what a bubble is, no tutorial. Add: pre-selected starter set (e.g. HSK 1 + simple), a one-screen how-to-play shown once, and a "just play" button that bypasses the menu entirely.

10. **major** · §1.4, FR-14 — Nothing surfaces improvement to the player. §1.4's success criteria are entirely absence-of-defects; FR-14 stores per-word accuracy that no requirement ever displays. With no streaks, unlocks, mastery view, or curriculum, session 20 is identical to session 1 — this is the churn mechanism. Add one MUST: a visible per-category mastery signal (e.g. known/learning/new counts) on the menu.

11. **major** · Q8, §1.2, FR-5 — Pinyin determines which skill is trained. With pinyin on bubbles, the loop is "read pinyin → match English," and the player never reads Hanzi, contradicting §1.2's claim that it trains English→Hanzi recognition. This is not a parity question; decide it, and state that pinyin defaults off for the target skill or that the product trains pinyin reading.

12. **major** · FR-11, AR-1 — The justification for pre-answer Hanzi audio is unexamined: with pinyin on it is an answer oracle, with pinyin off it is useless to a beginner who cannot map sound to characters. Either justify it against a stated learner level or move replay to post-answer only.

13. **major** · §1.4 vs FR-14 — "Session progress survives a page reload" has no corresponding requirement. FR-14 persists *history* and per-word accuracy, not in-flight session state, so a lazy implementation persists completed sessions only and still satisfies every FR while failing §1.4. Promote it to an FR or delete the claim.

14. **major** · FR-13 vs Q7 — "Drill the misses" is a MUST while Q7 asks whether it should exist; "missed" (escaped? wrong-tapped? never shown?) and "drill" (mode? filtered restart?) are undefined. A button that restarts with the same selection complies. Either specify the drill fully or reduce FR-13 to display-only for v1.

15. **major** · FR-10 — "Pause cleanly" and "must not stack violations" are not testable. A `visibilitychange` handler that sets `paused=true` while rAF keeps running, then applies six accumulated escapes on resume, reads as compliant. Restate as: on resume, no bubble position, score, or timer may have changed; add an injectable clock so this is testable.

16. **major** · FR-3, FR-4 — The category × band intersection is unspecified, and FR-4's number is not required to equal what can actually spawn. A lazy build shows raw category totals and validates categories and bands independently, both passing while some selected categories contribute zero words. Require the displayed count to be computed from the same filtered pool the spawner uses.

17. **major** · FR-6 (absent policy) — No target-selection or distractor-selection policy. Nothing prevents the same target repeating indefinitely, and random distractors drawn from an 863-word HSK 5 pool produce trivially distinguishable options — the game gets *easier* as content grows. Specify: no target repeat within a session, and distractors chosen for confusability (same category, similar length/radical) rather than uniformly at random.

18. **major** · NFR-5 vs FR-8 — FR-8's feedback is a red/green flash, the canonical colour-only failure mode, while NFR-5 claims WCAG AA. And screen-reader labels on real-time moving bubbles are not achievable: no reader can announce a bubble before it escapes. Either specify a genuinely accessible turn-based mode (out of scope) or narrow NFR-5 to contrast, reduced-motion, keyboard menu access, and non-colour feedback (shape/icon/text) for correct vs incorrect.

19. **major** · NFR-3 — "One e2e test covering a full session" against 30–40 s fall timers will be either minutes-long and flaky, or will assert nothing real. Add a MUST that game time be injectable, and downgrade the v1 e2e to a smoke test (boots, starts, one tap scores); keep unit tests on `src/game/`, which is where the value is.

20. **minor** · §1.3.6, FR-12 — Endless mode is referenced twice and scoped nowhere; S1 does not include it. Cut it from v1 or write its FRs.

21. **minor** · NFR-8, §7, FR-18, S8 — Scope to cut: i18n externalisation (zero v1 users, pure cost); the component library (§10's own evidence is that the POC's kit was mostly unused — §7 contradicts §10); FR-18's CI count report (nobody reads CI prose); the offline service worker (stale-cache-after-deploy is the exact bug class the POC suffered, and it collides with finding 7). Also close OPEN-S6 — the spec already answers it.

22. **minor** · §4.3, §8 step 2 — The migration assumption never does the arithmetic: if Q4 derives difficulty from HSK level, all 1,707 HSK words are re-derivable from public lists and only the ~1,335 non-HSK words need migrating. Step 2 also depends on Q4, which is unresolved — the delivery order is broken. Do the count, then decide.

23. **minor** · FR-16, §1.4 — "Editable by a non-programmer" and "without touching TypeScript" are asserted, not specified. Stable human-readable word ids, filename-equals-id, and `group`/`order` in `categories.json` are a programmer's workflow; if `group` is a code-side enum, adding a category *does* touch TypeScript. Write the actual add-a-category procedure and validate it once by hand.

24. **minor** · §3 (absent) — No storage requirements: schema version key, quota handling, Safari private-mode `localStorage` throwing, or what happens to per-word accuracy when a word id changes. Add a version field and a stated migration/discard behaviour.

25. **minor** · §1.4 — "No console errors" is a vacuous success criterion; drop it or replace with the named acceptance test.

## Top 3 changes

1. **Answer Q1 in the document, then specify the fail state and re-derive scoring (findings 6, 2, 4).** Right now the game has no lose condition, is mathematically unwinnable below 67% accuracy, has no session length target, and the question that determines the whole shape is deferred while §3 quietly assumes the answer. Nothing can be built until this is closed.

2. **Separate difficulty from speed, and close the ambiguity hole between FR-7 and FR-17 (findings 3, 5).** These two together are what make a round fair. As specified, CI can pass green on content that produces rounds with two correct answers, and "hard" remains a meaningless label — the exact defect §2.3 claims to fix.

3. **Cut v1 to the loop plus one retention signal, and put the freed time into first-run and numbers (findings 9, 10, 7, 21).** Drop offline PWA, i18n, screen-reader arcade mode, the e2e suite, drill mode, and the component library. Spend it on: starter defaults and a one-screen tutorial, one visible mastery count, and hard size/latency budgets for audio. A polished offline-capable i18n-ready game nobody finishes is worse than a small one that teaches.
