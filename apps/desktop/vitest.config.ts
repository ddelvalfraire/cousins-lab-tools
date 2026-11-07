import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  test: {
    projects: [{
      plugins: [storybookTest({ configDir: fileURLToPath(new URL('./.storybook', import.meta.url)) })],
      test: {
        name: 'storybook', maxWorkers: 2, testTimeout: 30_000,
        browser: {
          enabled: true, headless: true,
          provider: playwright({ launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {} }),
          instances: [{ browser: 'chromium' }],
        },
      },
    }],
  },
});
