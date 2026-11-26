/**
 * Phase 8B.1 — Production start entry.
 * Forces NODE_ENV=production, refuses missing build artifacts, never starts Vite.
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT, 'server.mjs');
const DIST_INDEX = path.join(ROOT, 'dist', 'index.html');

const existingEnv = process.env.NODE_ENV;
if (existingEnv && existingEnv !== 'production') {
  console.error(
    `[start] Refusing to start: NODE_ENV must be "production" or unset for npm start. Got "${existingEnv}".`
  );
  console.error(
    '[start] Use npm run dev for local development (Vite middleware).'
  );
  process.exit(1);
}

process.env.NODE_ENV = 'production';

/**
 * Production requires PostgreSQL auth + business SoR.
 * JSON must not silently become the production fallback.
 * Local/dev continues to use `npm run dev` with AUTH_BACKEND/BUSINESS_DATA_BACKEND=json.
 */
function assertProductionPostgresBackends(env = process.env) {
  const auth = String(env.AUTH_BACKEND || '')
    .trim()
    .toLowerCase();
  const business = String(env.BUSINESS_DATA_BACKEND || '')
    .trim()
    .toLowerCase();
  const orgId = String(env.AUTH_ORGANIZATION_ID || '').trim();
  const databaseUrl = String(env.DATABASE_URL || '').trim();

  if (auth !== 'postgres' && auth !== 'postgresql') {
    throw new Error(
      'Production start requires AUTH_BACKEND=postgres (JSON is not a production fallback).'
    );
  }
  if (business !== 'postgres' && business !== 'postgresql') {
    throw new Error(
      'Production start requires BUSINESS_DATA_BACKEND=postgres (JSON is not a production fallback).'
    );
  }
  if (!databaseUrl) {
    throw new Error('Production start requires DATABASE_URL.');
  }
  if (!orgId) {
    throw new Error('Production start requires AUTH_ORGANIZATION_ID.');
  }
}

try {
  assertProductionPostgresBackends();
  console.info(
    '[start] AUTH_BACKEND=postgres BUSINESS_DATA_BACKEND=postgres (required for production)'
  );
} catch (err) {
  console.error(
    `[start] ${err instanceof Error ? err.message : String(err)}`
  );
  console.error(
    '[start] For local JSON development use `npm run dev`, not `npm start`.'
  );
  process.exit(1);
}

if (!fs.existsSync(SERVER_ENTRY)) {
  console.error(
    '[start] Missing server.mjs. Run `npm run build` before `npm start`.'
  );
  process.exit(1);
}

if (!fs.existsSync(DIST_INDEX)) {
  console.error(
    '[start] Missing dist/index.html. Run `npm run build` before `npm start`.'
  );
  process.exit(1);
}

console.info('[start] NODE_ENV=production');
console.info(`[start] Starting ${path.relative(ROOT, SERVER_ENTRY)}`);

const child = spawn(process.execPath, [SERVER_ENTRY], {
  cwd: ROOT,
  env: process.env,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    child.kill(sig);
  });
}
