import { test, expect, type Page } from '@playwright/test';

/**
 * The golden loop, run against the production build (see playwright.config.ts).
 *
 * One seed, one path, asserted step by step: teach then test, a correct tap is
 * scored and advances the round, a wrong tap costs time and does not advance,
 * progress survives a reload, and the console stays clean. This is the test that
 * would have caught the POC's regressions; the POC had none of it (defect 9).
 */

const SEED = '20261007';

interface Probe {
  phase: string;
  targetId: string | null;
  candidateIds: string[];
  correct: number;
  wrong: number;
  score: number;
  remainingMs: number;
}

const probe = (page: Page): Promise<Probe> =>
  page.evaluate(() => (window as unknown as { __mbTest: Probe }).__mbTest);

async function startSession(page: Page, seed = SEED): Promise<void> {
  await page.goto(`/?seed=${seed}`);
  await expect(page.getByTestId('home')).toBeVisible();

  // Pace lives in Settings. `chill` gives the most clock, so the assertions below
  // are not racing a session timeout.
  await page.getByTestId('nav-settings').click();
  await page.getByTestId('pace-chill').click();
  await page.getByTestId('settings-back').click();

  // A first run has no deck chosen yet: the app falls back to the starter deck
  // itself, so nothing to do here. This used to click a deck toggle, which hung
  // because the guard never fired once a deck was already selected.
  await page.getByTestId('start-session').click();
}

/** Dismiss the exposure card; fails if the app forgot to teach a new word. */
async function expectExposure(page: Page): Promise<void> {
  const card = page.getByTestId('exposure-card');
  await expect(card).toBeVisible();
  await page.getByTestId('exposure-dismiss').click();
  await expect(card).toBeHidden();
  expect((await probe(page)).phase).toBe('playing');
}

/** Wait until the board is answerable, teaching first if a card is up. */
async function reachPlaying(page: Page): Promise<void> {
  const card = page.getByTestId('exposure-card');
  if (await card.isVisible()) {
    await page.getByTestId('exposure-dismiss').click();
    await expect(card).toBeHidden();
  }
  await expect.poll(async () => (await probe(page)).phase).toBe('playing');
}

test.use({ reducedMotion: 'reduce' });

test('teach, tap, score, advance', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));

  await startSession(page);

  // First sight is taught before it can be tested (SPEC 1.6a).
  await expectExposure(page);

  // 1. The prompt names a target, and exactly one bubble carries it.
  const before = await probe(page);
  expect(before.targetId).toBeTruthy();
  expect(before.candidateIds.length).toBeGreaterThan(1);
  await expect(page.getByTestId('target-prompt')).toBeVisible();

  const right = page.locator(`[data-testid="bubble"][data-word-id="${before.targetId}"]`);
  await expect(right).toHaveCount(1);

  // Bubbles fall in from above the board at the start of every round, so wait
  // until the right one has actually arrived before tapping it.
  await expect(right).toBeInViewport({ ratio: 0.5, timeout: 10_000 });

  // force: bubbles move; Playwright's stability wait would never settle.
  await right.click({ force: true });

  await expect.poll(async () => (await probe(page)).correct).toBe(before.correct + 1);
  const afterRight = await probe(page);
  expect(afterRight.score).toBeGreaterThan(before.score);
  expect(afterRight.wrong).toBe(before.wrong);

  // 2. A wrong tap costs time, breaks nothing else, and keeps the same target.
  const wrong = page
    .locator(`[data-testid="bubble"][data-word-id]:not([data-word-id="${afterRight.targetId}"])`)
    .first();
  await expect(wrong).toHaveCount(1);
  await expect(wrong).toBeInViewport({ ratio: 0.5, timeout: 10_000 });
  await wrong.click({ force: true });

  await expect.poll(async () => (await probe(page)).wrong).toBe(afterRight.wrong + 1);
  const afterWrong = await probe(page);
  expect(afterWrong.targetId).toBe(afterRight.targetId);
  expect(afterWrong.correct).toBe(afterRight.correct);
  // Weaker than it looks (the real clock also advances), but the rule is that a
  // wrong tap never *gives* time back. Exact deltas live in tests/scoring.test.ts.
  expect(afterWrong.remainingMs).toBeLessThan(afterRight.remainingMs);

  // 3. Progress is written to storage, so a reload is not amnesia (FR-21..23).
  const keys = await page.evaluate(() => Object.keys(window.localStorage));
  expect(keys.length).toBeGreaterThan(0);

  await page.reload();
  await expect(page.getByTestId('home')).toBeVisible();
  const keysAfter = await page.evaluate(() => Object.keys(window.localStorage));
  expect(keysAfter).toEqual(expect.arrayContaining(keys));

  expect(errors).toEqual([]);
});

test('one seed deals one session (NFR-3)', async ({ page }) => {
  await startSession(page, SEED);
  await reachPlaying(page);
  const first = await probe(page);

  await startSession(page, SEED);
  await reachPlaying(page);
  const second = await probe(page);

  expect(second.targetId).toBe(first.targetId);
  expect([...second.candidateIds].sort()).toEqual([...first.candidateIds].sort());

  // A different seed is allowed to deal differently, but must not crash.
  await startSession(page, `${SEED}-other`);
  await reachPlaying(page);
  expect((await probe(page)).targetId).toBeTruthy();
});