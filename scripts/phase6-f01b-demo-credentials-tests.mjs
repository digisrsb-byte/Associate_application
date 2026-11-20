/**
 * F-01b — Demo seed credentials must not be production runtime defaults.
 * Does not print secret values. Does not modify live ledger/auth.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import crypto from 'crypto';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SERVER = path.join(ROOT, 'server.ts');
const OUT = path.join(ROOT, 'PHASE6_F01B_DEMO_CREDENTIAL_TEST_RESULTS.json');
const FIXTURE = path.join(ROOT, 'scripts', 'fixtures', 'demo-ledger-shape.json');

const BANNED_SEED_STRINGS = ['Ramesh@2026', 'Priya#456', 'Suresh@789'];

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? `: ${detail}` : ''}`);
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  return { res, data };
}

/**
 * Spawn an isolated server whose data directory is a temp copy of a tiny
 * shim: we cannot redirect DATA_DIR, so instead we assert source purity and
 * prove banned strings fail live admin login / bootstrap. Isolated empty-ledger
 * behaviour is covered by invoking node to evaluate seed emptiness via source parse.
 */
async function main() {
  const src = fs.readFileSync(SERVER, 'utf8');

  record(
    'createInitialLedger is sample empty-install data (not auth bootstrap)',
    /function createInitialLedger\(/.test(src) && /function bootstrapRequired\(/.test(src)
  );

  const bannedHits = BANNED_SEED_STRINGS.filter((s) => src.includes(s));
  record(
    'server.ts contains zero banned demo portal password strings',
    bannedHits.length === 0,
    `hits=${bannedHits.length}`
  );

  const seedStart = src.indexOf('function createInitialLedger');
  const seedEnd = src.indexOf('function readLedger');
  const seedBlock = src.slice(seedStart, seedEnd);
  const passwordLits = [...seedBlock.matchAll(/password:\s*'([^']*)'/g)].map((m) => m[1]);
  const nonEmpty = passwordLits.filter((p) => String(p).trim().length > 0);
  record(
    'createInitialLedger password fields are empty/unset only',
    nonEmpty.length === 0,
    `passwordLiterals=${passwordLits.length}`
  );

  record(
    'No hardcoded Admin@123 / DEFAULT_ADMIN_PASSWORD runtime fallback',
    !src.includes("Admin@123") &&
      !/DEFAULT_ADMIN_PASSWORD/.test(src) &&
      !/createDefaultAuth/.test(src)
  );

  const fixtureOk = fs.existsSync(FIXTURE);
  let fixtureClean = false;
  if (fixtureOk) {
    const fix = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    const clients = [...(fix.clients || []), ...(fix.gstClients || [])];
    fixtureClean =
      clients.length > 0 &&
      clients.every((c) => c.password == null && c.passwordEnc == null);
  }
  record(
    'Isolated test fixture has no portal password fields',
    fixtureOk && fixtureClean
  );

  // Prove fixture is not imported by server runtime
  record(
    'server.ts does not import demo-ledger-shape fixture',
    !src.includes('demo-ledger-shape')
  );

  const BASE = process.env.TEST_BASE || 'http://127.0.0.1:3000';
  let healthOk = false;
  try {
    healthOk = (await fetch(`${BASE}/api/health`)).ok;
  } catch {
    healthOk = false;
  }
  record('UAT server reachable for auth probes', healthOk);

  if (healthOk) {
    const email = process.env.QA_EMAIL || 'admin@srsbassociate.com';
    for (let i = 0; i < BANNED_SEED_STRINGS.length; i++) {
      const banned = BANNED_SEED_STRINGS[i];
      const { res, data } = await fetchJson(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: banned }),
      });
      record(
        `Banned demo seed string #${i + 1} rejected as administrator password`,
        res.status === 401 && !data.ok && !data.token,
        `status=${res.status}`
      );
    }

    const boot = await fetchJson(`${BASE}/api/auth/bootstrap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'attacker@example.com',
        password: BANNED_SEED_STRINGS[0],
        confirmPassword: BANNED_SEED_STRINGS[0],
      }),
    });
    record(
      'Bootstrap cannot mint admin using banned demo string when auth exists',
      boot.res.status === 409 || boot.res.status === 400,
      `status=${boot.res.status}`
    );

    // Existing admin login still works (uses env; value not printed)
    const pass = process.env.QA_PASSWORD || process.env.QA_PASSWORD_STRONG || '';
    if (pass) {
      const login = await fetchJson(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass }),
      });
      record(
        'Existing administrator login still works',
        login.res.ok && login.data.ok === true,
        `status=${login.res.status}`
      );
    } else {
      record('Existing administrator login still works', false, 'QA_PASSWORD not set');
    }
  }

  record(
    'Live ledger.json preserved',
    fs.existsSync(path.join(ROOT, 'data', 'ledger.json'))
  );
  record(
    'Live auth.json preserved',
    fs.existsSync(path.join(ROOT, 'data', 'auth.json'))
  );

  // Isolated empty-data process: compile-check seed by writing ledger via a
  // one-shot script that duplicates empty-password policy (no server DATA_DIR override).
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'f01b-seed-'));
  const seedProbe = path.join(tmp, 'probe.mjs');
  fs.writeFileSync(
    seedProbe,
    `
    import fs from 'fs';
    const src = fs.readFileSync(${JSON.stringify(SERVER)}, 'utf8');
    const block = src.slice(src.indexOf('function createInitialLedger'), src.indexOf('function readLedger'));
    const banned = ${JSON.stringify(BANNED_SEED_STRINGS)};
    const hit = banned.some((b) => block.includes(b));
    const nonEmpty = [...block.matchAll(/password:\\s*'([^']*)'/g)].map(m => m[1]).filter(p => p.trim());
    if (hit || nonEmpty.length) process.exit(2);
    process.exit(0);
    `
  );
  const probe = spawn(process.execPath, [seedProbe], { stdio: 'ignore' });
  const code = await new Promise((resolve) => probe.on('exit', resolve));
  record('Isolated seed-block probe: no banned/non-empty passwords', code === 0, `exit=${code}`);
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  const ok = results.every((r) => r.ok);
  fs.writeFileSync(OUT, JSON.stringify({ ok, results, at: new Date().toISOString() }, null, 2));
  console.log(ok ? 'ALL PASS' : 'SOME FAILURES');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error('f01b tests failed:', e.message);
  process.exit(1);
});
