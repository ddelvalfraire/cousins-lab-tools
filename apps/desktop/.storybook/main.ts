import type { StorybookConfig } from '@storybook/react-vite';
import { mergeConfig } from 'vite';

const config: StorybookConfig = {
  stories: ['../src/ui/**/*.stories.tsx'],
  addons: [
    '@storybook/addon-docs',
    '@storybook/addon-a11y',
    '@storybook/addon-themes',
    '@storybook/addon-vitest',
  ],
  framework: { name: '@storybook/react-vite', options: {} },
  viteFinal: (config) =>
    mergeConfig(config, {
      optimizeDeps: { include: ['@mantine/hooks'] },
      server: {
        watch: {
          ignored: [
            '**/storybook-static/**',
            '**/test-results/**',
            '**/playwright-report/**',
          ],
        },
      },
    }),
  core: {
    disableTelemetry: true,
    allowedHosts:
      process.env.STORYBOOK_ALLOWED_HOSTS?.split(',')
        .map((host) => host.trim())
        .filter(Boolean) ?? [],
  },
};
export default config;
