import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:8901',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  reporter: [['list'], ['html', { open: 'never' }]],
  webServer: {
    command: 'node tests/serve-e2e.mjs',
    url: 'http://127.0.0.1:8901/api/v1/me',
    reuseExistingServer: false,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
    timeout: 60000,
    env: { WRANGLER_SEND_METRICS: 'false' },
  },
});
