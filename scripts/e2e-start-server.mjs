/**
 * Stage 1 — Start app server bound to isolated data-e2e only.
 * Always sets DATA_DIR + E2E_ISOLATION; asserts before spawn.
 */
import { spawn, spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const E2E_DIR = path.resolve(ROOT, 'data-e2e');
const PORT = process.env.E2E_PORT || process.env.PORT || '3100';

const env = {
  ...process.env,
  HOST: '127.0.0.1',
  PORT: String(PORT),
  DATA_DIR: E2E_DIR,
  E2E_ISOLATION: '1',
  COOKIE_SECURE: process.env.COOKIE_SECURE || 'false',
  // Stage 7B: allow XFF differentiation in E2E; short window for retry tests.
  TRUST_PROXY: process.env.TRUST_PROXY || '1',
  LOGIN_RATE_IP_MAX: process.env.LOGIN_RATE_IP_MAX || '5',
  LOGIN_RATE_ACCOUNT_MAX: process.env.LOGIN_RATE_ACCOUNT_MAX || '5',
  LOGIN_RATE_WINDOW_MS: process.env.LOGIN_RATE_WINDOW_MS || '3000',
  // Stage 7C — backup key file under data-e2e only (not live data/, not inside backups/)
  BACKUP_ENCRYPTION_KEY_FILE:
    process.env.BACKUP_ENCRYPTION_KEY_FILE ||
    path.join(E2E_DIR, 'BACKUP_ENCRYPTION_KEY'),
};

// Ensure fixture tree exists (never copies live data/)
if (!fs.existsSync(path.join(E2E_DIR, 'auth.json'))) {
  const prep = spawnSync(process.execPath, [path.join(__dirname, 'e2e-prepare-data-dir.mjs')], {
    cwd: ROOT,
    encoding: 'utf8',
    env,
  });
  if (prep.status !== 0) {
    console.error(prep.stdout, prep.stderr);
    process.exit(1);
  }
}

const assert = spawnSync(process.execPath, [path.join(__dirname, 'e2e-assert-isolation.mjs')], {
  cwd: ROOT,
  encoding: 'utf8',
  env,
});
process.stdout.write(assert.stdout || '');
process.stderr.write(assert.stderr || '');
if (assert.status !== 0) {
  console.error('[e2e:server] Isolation assert failed — refusing to start.');
  process.exit(1);
}

console.log(`[e2e:server] Starting with DATA_DIR=${E2E_DIR} E2E_ISOLATION=1 PORT=${PORT}`);

const child = spawn('npx', ['tsx', 'server.ts'], {
  cwd: ROOT,
  env,
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    child.kill(sig);
  });
}
