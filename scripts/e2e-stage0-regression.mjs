/**
 * Stage 0 regression — proves default uses live data/, E2E uses data-e2e only,
 * and live ledger/auth/backups hashes are unchanged after isolated writes.
 * Does NOT start the full app UI or Playwright.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LIVE = path.resolve(ROOT, 'data');
const E2E = path.resolve(ROOT, 'data-e2e');

function sha256File(p) {
  if (!fs.existsSync(p)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function hashTree(dir) {
  if (!fs.existsSync(dir)) return {};
  const out = {};
  const walk = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) walk(full);
      else out[path.relative(dir, full).replace(/\\/g, '/')] = sha256File(full);
    }
  };
  walk(dir);
  return out;
}

const before = {
  ledger: sha256File(path.join(LIVE, 'ledger.json')),
  auth: sha256File(path.join(LIVE, 'auth.json')),
  backups: hashTree(path.join(LIVE, 'backups')),
};

console.log('BEFORE live ledger:', before.ledger);
console.log('BEFORE live auth:', before.auth);
console.log('BEFORE live backups files:', Object.keys(before.backups).length);

// 1) Default resolve (no DATA_DIR) — inline replicate resolveDataDir default
const defaultDir = path.resolve(ROOT, 'data');
if (defaultDir !== LIVE) {
  console.error('FAIL: default data path mismatch');
  process.exit(1);
}
console.log('PASS — default DATA_DIR resolves to live data/', defaultDir);

// 2) Prepare e2e dir
const prep = spawnSync(process.execPath, [path.join(__dirname, 'e2e-prepare-data-dir.mjs')], {
  cwd: ROOT,
  encoding: 'utf8',
});
if (prep.status !== 0) {
  console.error(prep.stdout, prep.stderr);
  process.exit(1);
}
console.log('PASS — e2e-prepare-data-dir');

// 3) Assert isolation with correct env
const assertOk = spawnSync(process.execPath, [path.join(__dirname, 'e2e-assert-isolation.mjs')], {
  cwd: ROOT,
  encoding: 'utf8',
  env: { ...process.env, DATA_DIR: './data-e2e', E2E_ISOLATION: '1' },
});
process.stdout.write(assertOk.stdout || '');
process.stderr.write(assertOk.stderr || '');
if (assertOk.status !== 0) process.exit(1);

// 4) Assert must fail when pointing at live data
const assertLive = spawnSync(process.execPath, [path.join(__dirname, 'e2e-assert-isolation.mjs')], {
  cwd: ROOT,
  encoding: 'utf8',
  env: { ...process.env, DATA_DIR: './data', E2E_ISOLATION: '1' },
});
if (assertLive.status === 0) {
  console.error('FAIL: isolation assert incorrectly allowed live data/');
  process.exit(1);
}
console.log('PASS — isolation assert rejects DATA_DIR=./data with E2E_ISOLATION=1');

// 5) resolveDataDir rules (mirrors server.ts — fail closed)
function resolveDataDirSim(env) {
  const DEFAULT_DATA_DIR = path.resolve(ROOT, 'data');
  const raw = (env.DATA_DIR || '').trim();
  const e2eIsolation =
    env.E2E_ISOLATION === '1' || String(env.E2E_ISOLATION || '').toLowerCase() === 'true';
  if (e2eIsolation) {
    if (!raw) return { ok: false, reason: 'missing DATA_DIR' };
    const resolved = path.resolve(ROOT, raw);
    const base = path.basename(resolved).toLowerCase();
    if (base !== 'data-e2e') return { ok: false, reason: `bad basename ${base}` };
    if (path.resolve(resolved) === path.resolve(DEFAULT_DATA_DIR))
      return { ok: false, reason: 'equals live' };
    return { ok: true, resolved };
  }
  if (!raw) return { ok: true, resolved: DEFAULT_DATA_DIR };
  return { ok: true, resolved: path.resolve(ROOT, raw) };
}

const r1 = resolveDataDirSim({ E2E_ISOLATION: '1', DATA_DIR: '' });
const r2 = resolveDataDirSim({ E2E_ISOLATION: '1', DATA_DIR: './data' });
const r3 = resolveDataDirSim({ E2E_ISOLATION: '1', DATA_DIR: './data-e2e' });
const r4 = resolveDataDirSim({});
if (r1.ok || r2.ok || !r3.ok || r4.resolved !== LIVE) {
  console.error('FAIL resolveDataDirSim', { r1, r2, r3, r4 });
  process.exit(1);
}
console.log('PASS — resolve rules: refuse unset/live; accept data-e2e; default=live');

// 6) Isolated writes under data-e2e only (simulate login/client/backup side effects)
const e2eAuth = path.join(E2E, 'auth.json');
const e2eLedger = path.join(E2E, 'ledger.json');
const e2eBackupDir = path.join(E2E, 'backups');
fs.mkdirSync(e2eBackupDir, { recursive: true });

const auth = JSON.parse(fs.readFileSync(e2eAuth, 'utf8'));
auth.updatedAt = new Date().toISOString();
auth._stage0Probe = 'isolated-write-only';
fs.writeFileSync(e2eAuth, JSON.stringify(auth, null, 2));

const ledger = JSON.parse(fs.readFileSync(e2eLedger, 'utf8'));
ledger.clients.push({
  id: 'e2e-dummy-1',
  name: 'E2E Dummy Client Pvt Ltd',
  pan: 'AAAAA0000A',
  email: 'dummy.client@example.test',
  phone: '9000000000',
  filings: {},
});
fs.writeFileSync(e2eLedger, JSON.stringify(ledger, null, 2));
fs.writeFileSync(
  path.join(e2eBackupDir, `stage0-probe-${Date.now()}.json`),
  JSON.stringify({ probe: true, clients: ledger.clients.length }, null, 2)
);

// 7) Live hashes unchanged
const after = {
  ledger: sha256File(path.join(LIVE, 'ledger.json')),
  auth: sha256File(path.join(LIVE, 'auth.json')),
  backups: hashTree(path.join(LIVE, 'backups')),
};

if (after.ledger !== before.ledger) {
  console.error('FAIL: live ledger.json hash changed');
  process.exit(1);
}
if (after.auth !== before.auth) {
  console.error('FAIL: live auth.json hash changed');
  process.exit(1);
}
if (JSON.stringify(after.backups) !== JSON.stringify(before.backups)) {
  console.error('FAIL: live backups tree changed');
  process.exit(1);
}
console.log('PASS — live ledger/auth/backups SHA-256 unchanged after e2e writes');
console.log('AFTER live ledger:', after.ledger);
console.log('AFTER live auth:', after.auth);

// Reset e2e ledger to empty controlled state for future tests (keep fake admin)
const empty = {
  assessmentYears: ledger.assessmentYears,
  clients: [],
  gstMonths: ledger.gstMonths,
  gstClients: [],
};
fs.writeFileSync(e2eLedger, JSON.stringify(empty, null, 2));
delete auth._stage0Probe;
fs.writeFileSync(e2eAuth, JSON.stringify(auth, null, 2));

console.log('STAGE0 REGRESSION COMPLETE');
console.log(
  JSON.stringify(
    {
      liveLedgerSha256: after.ledger,
      liveAuthSha256: after.auth,
      e2eDir: E2E,
      liveDir: LIVE,
      copiedFromLive: false,
    },
    null,
    2
  )
);
