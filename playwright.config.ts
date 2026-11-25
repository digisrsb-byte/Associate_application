import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const E2E_PORT = process.env.E2E_PORT || '3100';
const BASE_URL = `http://127.0.0.1:${E2E_PORT}`;

/**
 * Stage 1 — Playwright against isolated data-e2e only.
 * Fail closed: webServer always sets DATA_DIR=./data-e2e and E2E_ISOLATION=1.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  outputDir: 'test-results',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run e2e:server',
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    cwd: __dirname,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: E2E_PORT,
      DATA_DIR: path.resolve(__dirname, 'data-e2e'),
      E2E_ISOLATION: '1',
      COOKIE_SECURE: 'false',
      // Stage 7B E2E: TRUST_PROXY for XFF IP tests; short login rate window.
      TRUST_PROXY: '1',
      LOGIN_RATE_IP_MAX: '5',
      LOGIN_RATE_ACCOUNT_MAX: '5',
      LOGIN_RATE_WINDOW_MS: '3000',
      BACKUP_ENCRYPTION_KEY_FILE: path.resolve(
        __dirname,
        'data-e2e',
        'BACKUP_ENCRYPTION_KEY'
      ),
      // Never inherit a live DATA_DIR override into the E2E server.
    },
  },
});
