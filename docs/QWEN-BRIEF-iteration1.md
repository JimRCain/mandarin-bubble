# Qwen brief — Mandarin Bubble, iteration 1 UI

You are writing the entire **presentation layer** for an existing, finished game
core. The core is already written, typechecked and unit tested. Your job is the
React UI only.

Repo root: the current working directory. Read these first, in this order:

1. `docs/HANDOFF.md` — how this project is run.
2. `docs/SPEC.md` — the product spec. Sections **1.3–1.7** (the loop, the
   falling-bubble board, the session shape, the untimed first-sight exposure
   card, reward layers), **1.9**, **3** (every NFR), **4** (content model) and
   **7** (architecture: the engine is not React state).
3. `src/game/index.ts` — the barrel. Everything you may call lives behind it.
   Skim `src/game/types.ts`, `config.ts`, `scoring.ts`, `selection.ts`,
   `board.ts`, `review.ts`, `rng.ts` for the exact signatures.
4. `src/content.ts` (deck loading), `src/store/persistence.ts` (settings,
   progress, in-flight session), `src/audio.ts` (speech + feedback).
5. `src/styles/index.css` — the Tailwind theme tokens already defined (ink /
   jade palette). Use them; do not redefine the palette.
6. `playwright.config.ts`, `vitest.config.ts`, `package.json`.

## The loop you are building

A session is: pick decks → a round appears → the board shows several falling
bubbles, each carrying the **Hanzi** of a candidate word → the top of the screen
prompts with the **English gloss** (and pinyin when the setting is on) of one
target word → the player taps the bubble whose Hanzi matches → correct pops the
bubble and advances, wrong costs a small time penalty and breaks the combo.
A word's **first appearance in a session** shows the untimed exposure card
before it can be tapped at all. The session ends at the configured target or
when the clock runs out, then a summary.

Read the exact numbers from `src/game/config.ts`. Do not invent constants, and do
not hardcode them in components: import them.

## Files to write (only these)

- `src/useGame.ts` — the one stateful hook: owns the reducer, the rAF loop that
  drives `BubbleField.step`, round planning via `selection`, persistence writes,
  and the exposure/playing/summary phase transitions. No game rules of its own;
  it wires the core together.
- `src/components/App.tsx` — shell + screen routing.
- `src/components/HomeScreen.tsx`, `DecksScreen.tsx`, `SettingsScreen.tsx`,
  `ProgressScreen.tsx`, `GameBoard.tsx`, `Bubble.tsx`, `ExposureCard.tsx`,
  `SummaryScreen.tsx`, `HowToCard.tsx`
- `src/components/ui/Button.tsx`, `src/components/ui/Meter.tsx`

Do **not** touch anything else in the repo. In particular do not edit
`src/game/**`, `src/content.ts`, `src/store/**`, `src/audio.ts`,
`src/styles/index.css`, `scripts/**`, `content/**`, or the test configs. If you
believe something there is wrong, write it in your final message instead.

`src/main.tsx` already imports `./components/App` and mounts it into `#root`.
It must keep working with no change to `main.tsx`.

## Hard requirements

- **Tailwind v4 utility classes only.** No `tailwind.config.js`, no CSS files
  beyond the existing `src/styles/index.css`.
- **Portrait, mobile-first, thumb-reachable.** The board is the whole viewport
  minus a slim HUD. Bubbles are absolutely positioned by the engine's fractional
  coordinates, written to the DOM by the rAF loop, never by React state per
  frame (SPEC 7). A tap resolves against the engine's current position, so a
  tap must be hit-tested through the field, not through a stale render.
- **Determinism (NFR-3).** Read `?seed=` from the URL and pass it to the seeded
  RNG so one golden e2e run is reproducible. Never call `Math.random`,
  `Date.now` or `performance.now` outside the allowed layers (`tests/hygiene.test.ts`
  enforces this by scanning `src/**`).
- **Accessibility (NFR-5).** WCAG AA contrast against the existing palette.
  Correct/wrong feedback must not be colour-only: a wrong tap needs a shape or
  text cue too. Everything reachable by keyboard: bubbles are focusable and
  answerable with Enter/Space. Respect `prefers-reduced-motion` (no falling
  animation, no particle effects, but the game stays playable).
- **Honest failure states.** If the content fetch fails, show a retry, never a
  blank screen. If a deck has too few words to build a fair round (the core
  returns `null` from `planRound`), say so in the UI instead of crashing.
- **`data-testid` hooks, exactly these names:** `home`, `start-session`,
  `deck-toggle` on each deck row, `pace-chill|pace-normal|pace-rush`,
  `target-prompt`, `bubble` on every bubble (with `data-word-id`),
  `exposure-card`, `exposure-dismiss`, `hud-progress`, `hud-timer`,
  `summary`, `summary-accuracy`, `summary-score`, `summary-combo`,
  `play-again`, `back-home`.
- **Test handle.** Expose `window.__mbTest` with at least
  `{ phase, targetId, candidateIds, correct, wrong, score, remainingMs }`,
  refreshed on every state change, so the e2e can assert the loop without
  scraping pixels.
- Plain ASCII punctuation in user-facing strings. **No em dashes** anywhere a
  person can read them.

## Definition of done (run these yourself, in this order, and fix what fails)

```
npm run typecheck
npx vitest run
npm run build
```

All three must pass before you report back. `vitest run` must stay at its
current pass count or better. Then report: files written, any core bug you
found (with the evidence), and anything in the spec you could not satisfy.