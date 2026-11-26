/**
 * Stage 0 — Create isolated data-e2e storage (never copies live data/).
 * Usage: node scripts/e2e-prepare-data-dir.mjs
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

const TEST_EMAIL = process.env.E2E_EMAIL || 'e2e.tester@example.com';
const TEST_PASSWORD = process.env.E2E_PASSWORD || 'E2eTest@Pass123!';

function scryptHash(secret, salt) {
  return crypto.scryptSync(secret, salt, 64).toString('hex');
}

function hashSecret(secret) {
  const salt = crypto.randomBytes(16);
  return { salt: salt.toString('hex'), hash: scryptHash(secret, salt) };
}

if (path.resolve(E2E) === path.resolve(LIVE)) {
  console.error('Refusing: data-e2e resolves to live data/');
  process.exit(1);
}

fs.mkdirSync(path.join(E2E, 'backups'), { recursive: true });

// Stage 7C — stable backup encryption key for E2E (never under backups/; never touches live data/)
const backupKeyPath = path.join(E2E, 'BACKUP_ENCRYPTION_KEY');
let backupKeyCreated = false;
if (!fs.existsSync(backupKeyPath)) {
  const key = crypto.randomBytes(32).toString('base64');
  const tmp = `${backupKeyPath}.tmp`;
  fs.writeFileSync(tmp, `${key}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, backupKeyPath);
  backupKeyCreated = true;
}
if (process.platform === 'win32') {
  const user = process.env.USERNAME || process.env.USER || '';
  if (user) {
    spawnSync('icacls', [backupKeyPath, '/inheritance:r'], {
      windowsHide: true,
      stdio: 'ignore',
    });
    spawnSync('icacls', [backupKeyPath, '/grant:r', `${user}:R`], {
      windowsHide: true,
      stdio: 'ignore',
    });
  }
} else {
  try {
    fs.chmodSync(backupKeyPath, 0o600);
  } catch {
    /* ignore */
  }
}
console.error(
  `[e2e:prepare] Backup key file ${backupKeyCreated ? 'created' : 'reused'}: ${backupKeyPath}`
);

const emptyLedger = {
  assessmentYears: [
    'AY 2019-20',
    'AY 2020-21',
    'AY 2021-22',
    'AY 2022-23',
    'AY 2023-24',
    'AY 2024-25',
    'AY 2025-26',
    'AY 2026-27',
  ],
  clients: [],
  gstMonths: [
    'Apr 2026',
    'May 2026',
    'Jun 2026',
    'Jul 2026',
    'Aug 2026',
    'Sep 2026',
    'Oct 2026',
    'Nov 2026',
    'Dec 2026',
    'Jan 2027',
    'Feb 2027',
    'Mar 2027',
  ],
  gstClients: [],
};

const pwd = hashSecret(TEST_PASSWORD);
const recovery = hashSecret(crypto.randomBytes(16).toString('hex'));
const auth = {
  email: TEST_EMAIL.toLowerCase(),
  passwordSalt: pwd.salt,
  passwordHash: pwd.hash,
  recoverySalt: recovery.salt,
  recoveryHash: recovery.hash,
  updatedAt: new Date().toISOString(),
  passwordReset: null,
  _comment: 'E2E ONLY — fake admin for automated tests. Not production.',
};

fs.writeFileSync(path.join(E2E, 'ledger.json'), JSON.stringify(emptyLedger, null, 2));
fs.writeFileSync(path.join(E2E, 'auth.json'), JSON.stringify(auth, null, 2));

// Marker so humans/tools can identify the tree
fs.writeFileSync(
  path.join(E2E, 'E2E_ISOLATION_MARKER.txt'),
  'This directory is for automated E2E tests only. Not live application data.\n'
);

console.log(
  JSON.stringify(
    {
      ok: true,
      e2eDir: E2E,
      liveDir: LIVE,
      sameAsLive: false,
      email: TEST_EMAIL,
      ledgerClients: 0,
      gstClients: 0,
      copiedFromLive: false,
    },
    null,
    2
  )
);
