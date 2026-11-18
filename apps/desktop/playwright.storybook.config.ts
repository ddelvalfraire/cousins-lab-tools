import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testMatch: 'storybook.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: 'list',
  use: {
    baseURL: process.env.STORYBOOK_URL ?? 'http://127.0.0.1:6006',
    browserName: 'chromium',
    viewport: { width: 1280, height: 1000 },
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
  },
  webServer: {
    command: 'bun run storybook --host 127.0.0.1 --ci',
    url: `${process.env.STORYBOOK_URL ?? 'http://127.0.0.1:6006'}/index.json`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
