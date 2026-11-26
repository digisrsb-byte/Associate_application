import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';

const pgAuthDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(pgAuthDir, '../..');

/**
 * Vitest config for PostgreSQL auth test helpers only.
 * Separate from root vitest.config.ts (JSON unit suite) and Playwright E2E.
 * Does not connect to PostgreSQL by itself.
 */
export default defineConfig({
  root: appRoot,
  resolve: {
    alias: {
      '@': appRoot,
    },
  },
  test: {
    name: 'pg-auth',
    environment: 'node',
    include: ['tests/pg-auth/**/*.test.ts'],
    exclude: ['e2e/**', 'tests/unit/**', 'node_modules/**', 'dist/**'],
  },
});
