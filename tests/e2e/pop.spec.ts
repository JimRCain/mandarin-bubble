import { test, expect, type Page } from '@playwright/test';

/**
 * The pop mirage: a correct tap leaves the Hanzi behind, still, green, a little
 * larger, then dims to nothing.
 *
 * Motion is left ON for this file on purpose. The golden loop runs with
 * `reducedMotion: reduce`, and the stylesheet collapses every animation to
 * nothing under that setting, so the mirage is gone before it can be seen. That
 * collapse is the designed behaviour for a player who asks for less motion, not
 * a bug, so it must not be asserted here.
 *
 * The mirage is presentation only: it is not board state, it cannot be tapped,
 * and the bubble it stands for has already left the board by the time it appears.
 */

const SEED = '20261010';

interface Probe {
  phase: string;
  targetId: string | null;
}

const probe = (page: Page): Promise<Probe> =>
  page.evaluate(() => (window as unknown as { __mbTest: Probe }).__mbTest);

const centre = (box: { x: number; y: number; width: number; height: number } | null) => ({
  x: (box?.x ?? 0) + (box?.width ?? 0) / 2,
  y: (box?.y ?? 0) + (box?.height ?? 0) / 2,
});

test('a correct tap leaves a green mirage of the Hanzi where the bubble was', async ({ page }) => {
  await page.goto(`/?seed=${SEED}`);
  await page.getByTestId('nav-settings').click();
  await page.getByTestId('pace-chill').click();
  await page.getByTestId('settings-back').click();
  await page.getByTestId('start-session').click();
  await expect.poll(async () => (await probe(page)).targetId, { timeout: 15_000 }).toBeTruthy();

  const target = (await probe(page)).targetId as string;
  const bubble = page.locator(`[data-testid="bubble"][data-word-id="${target}"]`);
  await expect(bubble).toHaveCount(1);
  await expect(bubble).toBeInViewport({ ratio: 0.5, timeout: 10_000 });

  // The bubble carries the Hanzi and the pinyin; the mirage carries the Hanzi.
  const bubbleText = (await bubble.innerText()).replace(/\s+/g, ' ').trim();
  const wasAt = centre(await bubble.boundingBox());

  // The board click resolves by hit test, so the tap is a pointer event on the
  // board rather than a click on the button.
  await bubble.click({ force: true });

  const ghost = page.getByTestId('bubble-ghost');
  await expect(ghost).toHaveCount(1);

  const ghostText = (await ghost.innerText()).replace(/\s+/g, ' ').trim();
  expect(ghostText.length).toBeGreaterThan(0);
  expect(bubbleText.startsWith(ghostText)).toBe(true);

  // Still means still: it holds the position the bubble occupied. The tolerance
  // covers the bubble falling between the measurement and the tap.
  const isAt = centre(await ghost.boundingBox());
  expect(Math.abs(isAt.x - wasAt.x)).toBeLessThan(16);
  expect(Math.abs(isAt.y - wasAt.y)).toBeLessThan(40);

  // The bubble it stands for is gone, and the round has moved on.
  await expect(bubble).toHaveCount(0);
  await expect.poll(async () => (await probe(page)).targetId).not.toBe(target);

  // And the mirage dims to nothing on its own: it is removed by its animation
  // ending, not by the next tap.
  await expect(ghost).toHaveCount(0, { timeout: 3_000 });
});