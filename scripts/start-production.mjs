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
