import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

/**
 * Web smoke tests run against the exported static build, so they exercise the
 * same bundle that ships. `npm run build:web` first, or let webServer do it.
 */

/**
 * Use whichever Chromium this machine already has. CI images often ship a
 * revision that does not match the pinned Playwright version.
 */
const CANDIDATES = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium/chrome-linux/chrome',
].filter((p): p is string => Boolean(p));

const executablePath = CANDIDATES.find((p) => existsSync(p));

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:8081',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      // Containers commonly run as root, where the Chromium sandbox refuses to start.
      args: ['--no-sandbox'],
    },
  },
  webServer: {
    command: 'npx serve dist --listen 8081 --single --no-clipboard',
    url: 'http://127.0.0.1:8081',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } },
    // The phone project keeps the iPhone viewport and touch input but stays on
    // Chromium, which is the only engine installed here.
    {
      name: 'phone',
      use: {
        ...devices['iPhone 13'],
        browserName: 'chromium',
        isMobile: false,
        hasTouch: true,
      },
    },
  ],
});
