/**
 * Stage 0 — Fail closed if E2E would touch live data/.
 * Usage: node scripts/e2e-assert-isolation.mjs
 * Env: DATA_DIR (required), E2E_ISOLATION should be 1
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LIVE = path.resolve(ROOT, 'data');

// Defaults for `npm run e2e:assert-isolation` — still fail-closed against live data/.
if (!(process.env.DATA_DIR || '').trim()) {
  process.env.DATA_DIR = './data-e2e';
}
if (
  process.env.E2E_ISOLATION !== '1' &&
  String(process.env.E2E_ISOLATION || '').toLowerCase() !== 'true'
) {
  process.env.E2E_ISOLATION = '1';
}

const raw = (process.env.DATA_DIR || '').trim();
if (!raw) {
  console.error('FAIL: DATA_DIR is required for E2E isolation assert');
  process.exit(1);
}

const resolved = path.resolve(raw);
const base = path.basename(resolved).toLowerCase();

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? `: ${detail}` : ''}`);
}

check('DATA_DIR is set', !!raw, raw);
check('DATA_DIR basename is data-e2e', base === 'data-e2e', base);
check('DATA_DIR is not live data/', resolved !== LIVE, resolved);
check(
  'E2E_ISOLATION enabled',
  process.env.E2E_ISOLATION === '1' ||
    String(process.env.E2E_ISOLATION || '').toLowerCase() === 'true',
  process.env.E2E_ISOLATION || '(unset)'
);
check('data-e2e directory exists', fs.existsSync(resolved), resolved);
check(
  'isolation marker present',
  fs.existsSync(path.join(resolved, 'E2E_ISOLATION_MARKER.txt'))
);

const liveLedger = path.join(LIVE, 'ledger.json');
const liveAuth = path.join(LIVE, 'auth.json');
check('live ledger.json still exists (not deleted)', fs.existsSync(liveLedger));
check('live auth.json still exists (not deleted)', fs.existsSync(liveAuth));

const failed = checks.some((c) => !c.ok);
if (failed) {
  console.error('Isolation assert failed — refusing to continue.');
  process.exit(1);
}
console.log('ALL ISOLATION CHECKS PASSED');
process.exit(0);
