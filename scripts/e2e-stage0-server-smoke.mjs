/**
 * Stage 0 — brief server process smoke (no browser). Verifies refuse + isolated listen.
 */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LIVE = path.resolve(ROOT, 'data');

function sha(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

const beforeL = sha(path.join(LIVE, 'ledger.json'));
const beforeA = sha(path.join(LIVE, 'auth.json'));

function runOnce(env, expectExit) {
  return new Promise((resolve) => {
    const child = spawn('npx', ['tsx', 'server.ts'], {
      cwd: ROOT,
      env: { ...process.env, ...env },
      shell: true,
    });
    let out = '';
    const onData = (d) => {
      out += d.toString();
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 1000);
      resolve({ timedOut: true, out, code: null });
    }, expectExit ? 8000 : 5000);

    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ timedOut: false, out, code });
    });
  });
}

const refuse1 = await runOnce(
  { E2E_ISOLATION: '1', DATA_DIR: '', PORT: '3191', HOST: '127.0.0.1' },
  true
);
if (refuse1.timedOut || refuse1.code === 0 || !/E2E_ISOLATION=1 requires DATA_DIR/i.test(refuse1.out)) {
  console.error('FAIL refuse unset DATA_DIR', refuse1);
  process.exit(1);
}
console.log('PASS — server exits when E2E_ISOLATION=1 and DATA_DIR unset');

const refuse2 = await runOnce(
  { E2E_ISOLATION: '1', DATA_DIR: './data', PORT: '3192', HOST: '127.0.0.1' },
  true
);
if (
  refuse2.timedOut ||
  refuse2.code === 0 ||
  !/basename data-e2e|refuses to use the live/i.test(refuse2.out)
) {
  console.error('FAIL refuse live DATA_DIR', refuse2);
  process.exit(1);
}
console.log('PASS — server exits when E2E_ISOLATION=1 and DATA_DIR=./data');

const ok = await runOnce(
  {
    E2E_ISOLATION: '1',
    DATA_DIR: './data-e2e',
    PORT: '3193',
    HOST: '127.0.0.1',
  },
  false
);
if (!/DATA_DIR=.*data-e2e/i.test(ok.out) || !/listening/i.test(ok.out)) {
  console.error('FAIL isolated start', ok);
  process.exit(1);
}
console.log('PASS — server starts with DATA_DIR=./data-e2e and logs storage path');

const afterL = sha(path.join(LIVE, 'ledger.json'));
const afterA = sha(path.join(LIVE, 'auth.json'));
if (afterL !== beforeL || afterA !== beforeA) {
  console.error('FAIL live hashes changed during server smoke');
  process.exit(1);
}
console.log('PASS — live ledger/auth unchanged after server smoke');
console.log('STAGE0 SERVER SMOKE COMPLETE');
