import { defineConfig } from '@playwright/test';

// The golden e2e runs against the production build served by `vite preview`,
// because that is what GitHub Pages serves. Chrome is the system binary; we do
// not download Playwright browsers from here (blocked/flaky in China).
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173/mandarin-bubble/',
    // Locally we use the system Chrome (Playwright browser downloads are flaky
    // from here); CI installs the bundled chromium and says so.
    channel: process.env.PW_CHANNEL ?? 'chrome',
    headless: true,
    trace: 'off',
  },
  webServer: {
    command: 'npm run build:web && npx vite preview --port 4173 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4173/mandarin-bubble/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});