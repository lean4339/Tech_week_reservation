import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:3100',
    // Authentication traces can contain credentials; keep them disabled.
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  webServer: [
    {
      command:
        'npm run build -w @tech-week/backend && node apps/backend/dist/server.js',
      url: 'http://127.0.0.1:3101/health',
      reuseExistingServer: false,
      timeout: 60000,
      env: {
        NODE_ENV: 'test',
        HOST: '127.0.0.1',
        PORT: '3101',
        DATABASE_URL:
          'postgresql://tech_week:tech_week_test@127.0.0.1:55432/tech_week_test',
        REDIS_URL: 'redis://127.0.0.1:56379/15',
        APP_ORIGINS: 'http://127.0.0.1:3100',
        LOG_LEVEL: 'warn',
      },
    },
    {
      command:
        'node node_modules/next/dist/bin/next dev apps/frontend --hostname 127.0.0.1 --port 3100',
      url: 'http://127.0.0.1:3100/login',
      reuseExistingServer: false,
      timeout: 60000,
      env: { BACKEND_URL: 'http://127.0.0.1:3101', NEXT_DIST_DIR: '.next-e2e' },
    },
  ],
});
