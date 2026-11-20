/**
 * Phase 4 – Admin credential / bootstrap tests.
 * Does not print passwords or hashes.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BASE = process.env.TEST_BASE || 'http://127.0.0.1:3000';
const AUTH_FILE = path.join(ROOT, 'data', 'auth.json');
const SERVER_SRC = path.join(ROOT, 'server.ts');
const ENV_EXAMPLE = path.join(ROOT, '.env.example');

const results = [];
function record(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
}

async function jsonFetch(urlPath, options = {}) {
  const res = await fetch(`${BASE}${urlPath}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { _raw: text.slice(0, 120) };
  }
  return { res, data };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function resolveLoginPassword(email) {
  const candidates = [
    process.env.QA_PASSWORD,
    process.env.QA_PASSWORD_STRONG,
    'SecureUat!Ledger2026',
    'SecureUat!Admin2026',
    'Phase1Test@2026Xx',
    'Admin@123',
  ].filter(Boolean);
  for (const password of candidates) {
    const { res } = await jsonFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) return password;
  }
  return null;
}

async function main() {
  console.log(`Phase 4 admin credential tests → ${BASE}\n`);

  const health = await jsonFetch('/api/health');
  record('Server health', health.res.ok, `status=${health.res.status}`);
  if (!health.res.ok) process.exit(1);

  const serverSrc = fs.readFileSync(SERVER_SRC, 'utf-8');
  const envExample = fs.readFileSync(ENV_EXAMPLE, 'utf-8');
  record(
    'No hardcoded Admin@123 fallback in server.ts',
    !serverSrc.includes('Admin@123') &&
      !serverSrc.includes('createDefaultAuth') &&
      !/DEFAULT_ADMIN_PASSWORD/.test(serverSrc),
    'server runtime defaults removed'
  );
  record(
    '.env.example does not ship default admin password',
    !envExample.includes('ADMIN_PASSWORD=Admin@123') &&
      !envExample.includes('Admin@123'),
    'example cleaned'
  );

  const status = await jsonFetch('/api/auth/setup-status');
  record(
    'setup-status reports configured for existing install',
    status.res.ok &&
      status.data.configured === true &&
      status.data.bootstrapRequired === false,
    `configured=${status.data.configured} bootstrap=${status.data.bootstrapRequired}`
  );

  // Existing admin login (preserve access)
  const email =
    process.env.QA_EMAIL ||
    (fs.existsSync(AUTH_FILE)
      ? JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8')).email
      : 'admin@srsbassociate.com');
  const password = await resolveLoginPassword(email);
  record(
    'Existing administrator login still works',
    !!password,
    password ? 'login ok (password not printed)' : 'no candidate succeeded'
  );
  if (!password) process.exit(1);

  {
    const { res } = await jsonFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: 'DefinitelyWrong!!99' }),
    });
    record('Incorrect password rejected', res.status === 401, `status=${res.status}`);
  }

  // Bootstrap rejected while configured
  {
    const { res, data } = await jsonFetch('/api/auth/bootstrap', {
      method: 'POST',
      body: JSON.stringify({
        email: 'newadmin@example.com',
        password: 'BrandNewAdmin!2026',
        confirmPassword: 'BrandNewAdmin!2026',
      }),
    });
    record(
      'Repeated bootstrap rejected when auth.json exists',
      res.status === 409,
      `status=${res.status}`
    );
    record(
      'Bootstrap response does not include password fields',
      !JSON.stringify(data).toLowerCase().includes('passwordhash') &&
        !('password' in data && typeof data.password === 'string' && data.password.length > 0),
      `keys=${Object.keys(data).join(',')}`
    );
  }

  // Weak password rejected on reset path (need token) — use policy via bootstrap on isolated port
  const PORT_ISO = 3461;
  const AUTH_BAK = `${AUTH_FILE}.phase4test.bak`;
  const hadAuth = fs.existsSync(AUTH_FILE);
  if (hadAuth) fs.renameSync(AUTH_FILE, AUTH_BAK);

  const tsxCli = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const child = spawn(process.execPath, [tsxCli, 'server.ts'], {
    cwd: ROOT,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(PORT_ISO),
      NODE_ENV: 'production',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let childOut = '';
  child.stdout.on('data', (d) => {
    childOut += d.toString();
  });
  child.stderr.on('data', (d) => {
    childOut += d.toString();
  });

  const isoBase = `http://127.0.0.1:${PORT_ISO}`;
  async function isoFetch(p, opts = {}) {
    const res = await fetch(`${isoBase}${p}`, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  }

  let up = false;
  for (let i = 0; i < 40; i++) {
    try {
      const h = await fetch(`${isoBase}/api/health`);
      if (h.ok) {
        up = true;
        break;
      }
    } catch {
      /* wait */
    }
    await sleep(250);
  }
  record('Isolated server started for bootstrap tests', up, up ? `port=${PORT_ISO}` : childOut.slice(-200));

  if (up) {
    const st = await isoFetch('/api/auth/setup-status');
    record(
      'Missing auth.json → bootstrapRequired',
      st.data.bootstrapRequired === true && st.data.configured === false,
      `bootstrap=${st.data.bootstrapRequired}`
    );

    const weak = await isoFetch('/api/auth/bootstrap', {
      method: 'POST',
      body: JSON.stringify({
        email: 'bootstrap-admin@example.com',
        password: 'Admin@123',
        confirmPassword: 'Admin@123',
      }),
    });
    record(
      'Weak bootstrap password rejected',
      weak.res.status === 400,
      `status=${weak.res.status}`
    );

    const short = await isoFetch('/api/auth/bootstrap', {
      method: 'POST',
      body: JSON.stringify({
        email: 'bootstrap-admin@example.com',
        password: 'Short1!',
        confirmPassword: 'Short1!',
      }),
    });
    record(
      'Too-short bootstrap password rejected',
      short.res.status === 400,
      `status=${short.res.status}`
    );

    const strong = await isoFetch('/api/auth/bootstrap', {
      method: 'POST',
      body: JSON.stringify({
        email: 'bootstrap-admin@example.com',
        password: 'BootstrapAdmin!2026',
        confirmPassword: 'BootstrapAdmin!2026',
      }),
    });
    record(
      'Strong bootstrap password accepted (one-time)',
      strong.res.status === 201 && strong.data.ok === true,
      `status=${strong.res.status}`
    );
    record(
      'Bootstrap success response has no plaintext password',
      !('password' in strong.data),
      `keys=${Object.keys(strong.data).join(',')}`
    );

    const again = await isoFetch('/api/auth/bootstrap', {
      method: 'POST',
      body: JSON.stringify({
        email: 'other@example.com',
        password: 'AnotherStrong!2026',
        confirmPassword: 'AnotherStrong!2026',
      }),
    });
    record(
      'Second bootstrap rejected after setup',
      again.res.status === 409,
      `status=${again.res.status}`
    );

    const loginOk = await isoFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'bootstrap-admin@example.com',
        password: 'BootstrapAdmin!2026',
      }),
    });
    record(
      'Login works after bootstrap',
      loginOk.res.ok,
      `status=${loginOk.res.status}`
    );

    // Cleanup isolated auth.json created during test
    if (fs.existsSync(AUTH_FILE)) fs.unlinkSync(AUTH_FILE);
  }

  try {
    child.kill('SIGTERM');
  } catch {
    /* ignore */
  }
  await sleep(400);
  if (child.exitCode == null) {
    try {
      child.kill('SIGKILL');
    } catch {
      /* ignore */
    }
  }

  // Restore original auth.json
  if (fs.existsSync(AUTH_BAK)) {
    if (fs.existsSync(AUTH_FILE)) fs.unlinkSync(AUTH_FILE);
    fs.renameSync(AUTH_BAK, AUTH_FILE);
  }

  // Confirm original admin still works on primary server
  {
    const { res } = await jsonFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    record(
      'Original administrator access restored after bootstrap isolation test',
      res.ok,
      `status=${res.status}`
    );
  }

  // /api/auth/me must not leak hashes
  {
    const login = await jsonFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    const cookie =
      typeof login.res.headers.getSetCookie === 'function'
        ? login.res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
        : (login.res.headers.get('set-cookie') || '').split(';')[0];
    const me = await fetch(`${BASE}/api/auth/me`, {
      headers: { Cookie: cookie },
    });
    const meData = await me.json().catch(() => ({}));
    const leak =
      JSON.stringify(meData).includes('passwordHash') ||
      JSON.stringify(meData).includes('passwordSalt');
    record('auth/me does not expose password hashes', me.ok && !leak, `keys=${Object.keys(meData).join(',')}`);
  }

  const failed = results.filter((r) => !r.pass).length;
  const out = {
    phase: 4,
    base: BASE,
    at: new Date().toISOString(),
    passed: results.length - failed,
    failed,
    total: results.length,
    results,
  };
  fs.writeFileSync(
    path.join(ROOT, 'PHASE4_ADMIN_BOOTSTRAP_TEST_RESULTS.json'),
    JSON.stringify(out, null, 2),
    'utf-8'
  );
  console.log(`\n${out.passed}/${out.total} passed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  // Always try to restore auth backup if present
  const AUTH_BAK = `${AUTH_FILE}.phase4test.bak`;
  try {
    if (fs.existsSync(AUTH_BAK)) {
      if (fs.existsSync(AUTH_FILE)) fs.unlinkSync(AUTH_FILE);
      fs.renameSync(AUTH_BAK, AUTH_FILE);
    }
  } catch {
    /* ignore */
  }
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
