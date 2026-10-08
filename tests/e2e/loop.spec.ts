import { test, expect, type Page } from '@playwright/test';

/**
 * The golden loop, run against the production build (see playwright.config.ts).
 *
 * One seed, one path, asserted step by step: a correct tap is scored and moves
 * the round on, a wrong tap costs time and does not, progress survives a reload,
 * and the console stays clean. This is the test that would have caught the POC's
 * regressions; the POC had none of it (defect 9).
 *
 * The "moves the round on" assertion is the one that matters most. An earlier
 * version of this file checked that the counters changed but never that the
 * WORD changed, so it passed against a build where the same target stayed on the
 * board and could be tapped for the whole session.
 *
 * What a correct tap means is the POC's mechanic (docs/POC-MECHANICS.md): the
 * tapped bubble goes, and the new target is a bubble that was ALREADY up. That
 * last assertion is the one that keeps the board from being quietly re-dealt.
 */

const SEED = '20261007';

interface Probe {
  phase: string;
  targetId: string | null;
  bubbleIds: string[];
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

/**
 * A round is dealt a beat after the phase flips: the board is assembled from the
 * deck fetch, which is slow enough on a CI runner to be visible. Waiting on the
 * phase alone let a probe read a session mid-deal and report a null target.
 */
async function expectDealt(page: Page): Promise<void> {
  await expect.poll(async () => (await probe(page)).targetId, { timeout: 15_000 }).toBeTruthy();
}

/** Wait until the board is answerable and a word has been dealt. */
async function reachPlaying(page: Page): Promise<void> {
  await expect.poll(async () => (await probe(page)).phase).toBe('playing');
  await expectDealt(page);
}

test.use({ reducedMotion: 'reduce' });

test('tap, score, advance the round', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));

  await startSession(page);
  await reachPlaying(page);

  // 1. The prompt names a target, and exactly one bubble carries it.
  const before = await probe(page);
  expect(before.targetId).toBeTruthy();
  expect(before.bubbleIds.length).toBeGreaterThan(1);
  await expect(page.getByTestId('target-prompt')).toBeVisible();

  // Pinyin is a default-on reading aid (Jim, 2026-10-07, matching the POC): every
  // bubble carries it under the Hanzi, and it is legible rather than a smudge.
  const pinyin = page.getByTestId('bubble-pinyin');
  await expect(pinyin.first()).toBeVisible();
  expect(await pinyin.count()).toBe(before.bubbleIds.length);
  const pinyinBox = await pinyin.first().boundingBox();
  expect(pinyinBox?.height ?? 0).toBeGreaterThan(6);

  const right = page.locator(`[data-testid="bubble"][data-word-id="${before.targetId}"]`);
  await expect(right).toHaveCount(1);

  // Bubbles are now on screen at the start of every round, so they should be
  // visible without waiting for them to fall in from above.
  await expect(right).toBeInViewport({ ratio: 0.5, timeout: 10_000 });

  // force: bubbles move; Playwright's stability wait would never settle.
  await right.click({ force: true });

  await expect.poll(async () => (await probe(page)).correct).toBe(before.correct + 1);

  // 2. The round moves on, which is what a correct tap means. Holding the round
  //    for a moment (the green flash) is fine; keeping it forever is the bug.
  await expect.poll(async () => (await probe(page)).targetId).not.toBe(before.targetId);
  await expectDealt(page);
  const afterRight = await probe(page);
  expect(afterRight.score).toBeGreaterThan(before.score);
  expect(afterRight.wrong).toBe(before.wrong);
  // The new challenge was one of the bubbles already on the board: the tap hops
  // the target, it does not deal a fresh set (the POC's rule).
  expect(before.bubbleIds).toContain(afterRight.targetId);
  // The tapped bubble goes; the board is topped back up by the refill tick, so it
  // may still be a bubble short when this reads.
  expect(afterRight.bubbleIds).not.toContain(before.targetId);
  expect(afterRight.bubbleIds.length).toBeGreaterThanOrEqual(before.bubbleIds.length - 1);
  // The answered bubble leaves the board rather than being tapped again.
  await expect(
    page.locator(`[data-testid="bubble"][data-word-id="${before.targetId}"]`),
  ).toHaveCount(0);

  // 3. A wrong tap costs time, breaks nothing else, and keeps the same target.
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

  // 4. Progress is written to storage, so a reload is not amnesia (FR-21..23).
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
  expect([...second.bubbleIds].sort()).toEqual([...first.bubbleIds].sort());

  // A different seed is allowed to deal differently, but must not crash.
  await startSession(page, `${SEED}-other`);
  await reachPlaying(page);
  expect((await probe(page)).targetId).toBeTruthy();
});