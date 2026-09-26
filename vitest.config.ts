import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      { test: { name: 'shared', include: ['src/**/*.test.ts'], environment: 'node' } },
      {
        plugins: [
          cloudflareTest({
            wrangler: { configPath: './wrangler.jsonc' },
            miniflare: {
              compatibilityDate: '2026-08-22',
              bindings: { ADMIN_PASSPHRASE: 'test passphrase' },
            },
          }),
        ],
        test: { name: 'worker', include: ['worker/**/*.test.ts'] },
      },
    ],
  },
});
