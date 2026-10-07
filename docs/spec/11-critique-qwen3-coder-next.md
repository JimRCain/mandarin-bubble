## Findings

1. **blocker** · §1.3 vs §1.1 — Bubbles are said to "rise from the bottom" in the core loop but escape "off the bottom" in the one-liner. This contradiction undermines every spawn/fall/score rule. Pick one direction and delete the other phrasing.

2. **blocker** · FR-8 ⊃ FR-5 — **No fail state exists.** The spec defines correct/incorrect taps but nothing for when the *correct bubble leaves the screen*. Is it a miss? Penalty? Session end? FR-8 covers only taps, so an agent will invent a lose condition. Add: on correct-bubble-escape → recorded as miss, new target chosen; define lives or session termination.

3. **blocker** · S3, §4.2, §10 — Difficulty tiers conflate content (word band) with aggression (speed/scoring). "Hard" both filters words *and* accelerates fall time, but §1.2 wants "short sessions"; a learner who wants harder words cannot avoid an impossible speed. Split: word band (content filter) and speed/aggression (game setting), independently selectable.

4. **blocker** · §10 parameters, FR-8, §1.2 — Scoring is mathematically unwinnable: at +10/−20 with goal 200, score = n(30a−20), meaning below ~67% accuracy the player can never finish, and there is no floor/failure exit. A session of 24–50 rounds contradicts "short sessions." Redesign with a stated session length target (e.g. 90 s or 20 words), clamp at zero, and define explicit session termination.

5. **blocker** · FR-7 vs FR-17 — FR-17 forbids duplicate `hanzi` *within* a category only, but multi-category selection (FR-1) permits duplicate Hanzi among visible bubbles, violating FR-7 ("exactly one bubble MATCHES the target"). Also, no check for duplicate `english` glosses (e.g. "rice" vs "rice (cooked)"). CI passes while the runtime fails. Require global Hanzi uniqueness across the entire corpus, and add duplicate-`english` detection within spawn candidates.

6. **blocker** · §9 (Q1, Q5, Q7, Q8) vs §3 — Q1 ("game vs learning tool?"), Q5 (pre-render all audio?), Q7 (misses drill?), and Q8 (Pinyin on?) are marked open/non-blocking, but §3 already assumes answers: arcade scoring, TTS fallback, drill MUST, pinyin toggle. If Q1 resolves to "learning tool," the entire fall-timer model and scoring are wrong. Close Q1 first, then derive §3.

7. **blocker** · AR-3, NFR-1, NFR-6/S8 — No payload budget exists. Pre-rendering ~3,042 words *and* sub-2.5 s 4G boot *and* offline play is impossible without numbers. State: total payload cap, audio format/bitrate, clip count for v1, and lazy-load vs bundled. Do the math or NFR-1 is unmeasurable.

8. **blocker** · §7 (State) vs NFR-1 — "Animation must not depend on React re-rendering per frame" and "React renders from it" are mutually exclusive. An agent cannot implement both. Specify concretely: rAF loop mutating DOM directly (React owns discrete state only), or canvas. Also specify hit-testing.

9. **major** · §3 (absent) — **No first-run experience.** A new user faces 51 categories and 3 bands with no defaults, no tutorial, no "just play" button. Add: starter set (e.g. HSK 1 + simple), one-screen how-to-play shown once, and a "just play" button.

10. **major** · §1.4, FR-14 — Nothing surfaces improvement to the player. FR-14 stores per-word accuracy, but §1.4 success criteria are absence-of-defects only. With no mastery view, no streaks, no unlocks, session 20 is identical to session 1 — churn is inevitable. Add: visible per-category mastery signal on the menu (e.g. known/learning/new counts).

11. **major** · Q8, FR-5, §1.2 — Pinyin on bubbles trains *reading*, not English→Hanzi recognition. With pinyin visible, the loop is "read pinyin → match English," not the skill §1.2 claims to train. Decide: pinyin defaults off for the target skill, or explicitly train pinyin reading.

12. **major** · FR-11, AR-1 — Pre-answer Hanzi audio is useless to a beginner without pinyin (sound→character mapping unknown) and an oracle with pinyin. Either justify against a stated learner level or move replay to post-answer only.

13. **major** · §1.4 vs FR-14 — "Session progress survives reload" is not covered by FR-14, which persists *completed* sessions only. A lazy implementation satisfies FR-14 while failing §1.4. Promote in-flight session persistence to an FR.

14. **major** · FR-13 vs Q7 — "Drill the misses" is a MUST, but Q7 asks if it belongs in v1, and "missed" and "drill" are undefined. A restart button with the same selection complies, so either specify the drill fully or reduce FR-13 to display-only for v1.

15. **major** · FR-10 — "Pause cleanly" and "must not stack violations" are not testable. A `visibilitychange` handler that sets `paused=true` while rAF keeps running and applies accumulated escapes on resume reads as compliant. Restate as: on resume, no position/score/timer may have changed; add an injectable clock for testing.

16. **major** · FR-3, FR-4 — The category × band intersection is unspecified, and FR-4's displayed count is not required to equal what can spawn. A lazy build shows raw category totals and validates categories/bands independently, both passing while some selected categories contribute zero words. Require the displayed count to be computed from the same filtered pool the spawner uses.

17. **major** · FR-6 (absent policy) — No target-selection or distractor-selection policy. Nothing prevents the same target repeating indefinitely, and random distractors from an 863-word HSK 5 pool produce trivially distinguishable options — the game gets *easier* as content grows. Specify: no target repeat within a session; distractors chosen for confusability (same category, similar length/radical) rather than uniformly at random.

18. **major** · NFR-5 vs FR-8 — FR-8's red/green flash is the canonical colour-only failure mode, contradicting NFR-5's WCAG AA claim. Screen-reader labels on real-time moving bubbles are impossible to announce before they escape. Either specify a genuinely accessible turn-based mode (out of scope) or narrow NFR-5 to contrast, reduced-motion, keyboard menu access, and non-colour feedback.

19. **major** · NFR-3 — "One e2e test covering a full session" against 30–40 s fall timers will be either minutes-long and flaky, or assert nothing real. Add a MUST that game time be injectable, and downgrade the v1 e2e to a smoke test (boots, starts, one tap scores); keep unit tests on `src/game/`.

20. **minor** · §1.4, FR-12 — Endless mode is referenced twice and scoped nowhere. Cut it from v1 or write its FRs.

21. **minor** · NFR-8, §7, FR-18, S8 — Cut: i18n externalisation (zero v1 users), component library (§10 shows POC's was mostly unused), FR-18's CI count report (nobody reads CI prose), offline service worker (stale-cache bug class the POC suffered). Also close OPEN-S6.

22. **minor** · §4.3, §8 step 2 — The migration arithmetic is unperformed. If Q4 derives difficulty from HSK level, all 1,707 HSK words are re-derivable from public lists; only ~1,335 non-HSK words need migrating. Step 2 depends on Q4, which is unresolved. Do the count, then decide.

23. **minor** · FR-16, §1.4 — "Editable by a non-programmer" and "without touching TypeScript" are asserted, not specified. Stable human-readable word ids, filename-equals-id, and `group`/`order` in `categories.json` are a programmer's workflow. If `group` is a code-side enum, adding a category *does* touch TypeScript. Write the actual add-a-category procedure and validate it once by hand.

24. **minor** · §3 (absent) — No storage requirements: schema version key, quota handling, Safari private-mode `localStorage` throwing, or migration/discard behaviour when a word id changes. Add a version field and stated migration/discard behaviour.

25. **minor** · §1.4 — "No console errors" is a vacuous success criterion. Drop it or replace with named acceptance tests.

## Top 3 changes

1. **Answer Q1 in the document, then specify the fail state and re-derive scoring.** The game has no lose condition, is mathematically unwinnable below ~67% accuracy, has no session length target, and the question that determines the whole shape is deferred while §3 quietly assumes the answer. Nothing can be built until this is closed.

2. **Separate difficulty from speed, and close the ambiguity between FR-7 and FR-17.** As specified, CI can pass green on content that produces rounds with two correct answers, and "hard" remains meaningless. These two together are what make a round fair.

3. **Cut v1 to the loop plus one retention signal, and put the freed time into first-run and numbers.** Drop offline PWA, i18n, screen-reader arcade mode, the e2e suite, drill mode, and the component library. Spend it on: starter defaults, one-screen tutorial, one visible mastery count, and hard size/latency budgets for audio. A polished offline-capable i18n-ready game nobody finishes is worse than a small one that teaches.
