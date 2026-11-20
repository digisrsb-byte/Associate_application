/**
 * Phase 2 – Portal password encryption / API hygiene tests.
 * Does not print passwords, ciphertext, or encryption keys.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BASE = process.env.TEST_BASE || 'http://127.0.0.1:3000';
const ADMIN_EMAIL = process.env.QA_EMAIL || 'admin@srsbassociate.com';
const ADMIN_PASSWORD_CANDIDATES = [
  process.env.QA_PASSWORD,
  process.env.QA_PASSWORD_STRONG,
  'SecureUat!Ledger2026',
  'SecureUat!Admin2026',
  'Phase1Test@2026Xx',
  'Admin@123',
].filter(Boolean);
const LEDGER_FILE = path.join(ROOT, 'data', 'ledger.json');

const results = [];

function record(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
}

function hasSecretFields(obj) {
  if (!obj || typeof obj !== 'object') return false;
  const json = JSON.stringify(obj);
  if (/"password"\s*:/.test(json)) return true;
  if (/"passwordEnc"\s*:/.test(json)) return true;
  if (/enc:v1:/.test(json)) return true;
  return false;
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
  return { res, data, headers: res.headers };
}

function cookieFrom(res) {
  // Node fetch may expose set-cookie differently; use getSetCookie if available
  const anyHeaders = res.headers;
  if (typeof anyHeaders.getSetCookie === 'function') {
    return anyHeaders.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  }
  const single = anyHeaders.get('set-cookie');
  return single ? single.split(';')[0] : '';
}

async function main() {
  console.log(`Phase 2 portal-password tests → ${BASE}\n`);

  const health = await jsonFetch('/api/health');
  record('Server health', health.res.ok, `status=${health.res.status}`);
  if (!health.res.ok) process.exit(1);

  // Unauthenticated ledger must not expose secrets (and should 401 with auth middleware)
  {
    const { res, data } = await jsonFetch('/api/ledger');
    const blocked = res.status === 401 || !hasSecretFields(data);
    record(
      'Unauthenticated ledger does not expose portal secrets',
      blocked,
      `status=${res.status} hasSecrets=${hasSecretFields(data)}`
    );
  }

  // Login (try known UAT password candidates; never print them)
  let login = { res: { ok: false, status: 0 }, data: {} };
  let cookie = '';
  for (const password of ADMIN_PASSWORD_CANDIDATES) {
    login = await jsonFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: ADMIN_EMAIL, password }),
    });
    cookie = cookieFrom(login.res);
    if (login.res.ok && cookie) break;
  }
  record('Admin login', login.res.ok && !!cookie, `status=${login.res.status}`);
  if (!login.res.ok) process.exit(1);

  const authed = (p, opts = {}) =>
    jsonFetch(p, {
      ...opts,
      headers: { ...(opts.headers || {}), Cookie: cookie },
    });

  // Authenticated ledger triggers migration + sanitization
  {
    const { res, data } = await authed('/api/ledger');
    const clients = data.clients || [];
    const gst = data.gstClients || [];
    const dirty = hasSecretFields(data);
    record(
      'Authenticated ledger strips password and passwordEnc',
      res.ok && !dirty,
      `status=${res.status} clients=${clients.length} gst=${gst.length}`
    );
  }

  // Snapshot counts after migration warmup
  const beforeDisk = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf-8'));
  const beforeClients = (beforeDisk.clients || []).length;
  const beforeGst = (beforeDisk.gstClients || []).length;

  // Disk should not keep plaintext password fields after migration
  const plaintextLeft = [...(beforeDisk.clients || []), ...(beforeDisk.gstClients || [])].filter(
    (c) =>
      typeof c.password === 'string' &&
      c.password.length > 0 &&
      !String(c.password).startsWith('enc:v1:')
  );
  record(
    'Disk migrated: no legacy plaintext password fields',
    plaintextLeft.length === 0,
    `plaintextLeft=${plaintextLeft.length}`
  );

  // Create IT client with portal password
  const pan = `ZZZPZ${String(Date.now()).slice(-4)}A`.slice(0, 10).toUpperCase();
  const create = await authed('/api/clients', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Phase2 Portal Test',
      pan,
      password: 'PortalSecret!99',
      phone: '9000000001',
      referenceNumber: 'P2',
      remark: 'phase2',
      filings: {},
    }),
  });
  const createdId = create.data?.client?.id;
  record(
    'Create client encrypts; response has no secrets',
    create.res.status === 201 &&
      createdId &&
      !hasSecretFields(create.data) &&
      create.data.client?.hasPortalPassword === true,
    `status=${create.res.status}`
  );

  // Disk has ciphertext for new client
  {
    const disk = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf-8'));
    const row = (disk.clients || []).find((c) => c.id === createdId);
    record(
      'New client stored as passwordEnc only',
      !!row &&
        typeof row.passwordEnc === 'string' &&
        row.passwordEnc.startsWith('enc:v1:') &&
        row.password === undefined,
      row ? `hasEnc=${!!row.passwordEnc}` : 'missing'
    );
  }

  // Unauthorized reveal (no cookie)
  {
    const { res } = await jsonFetch(
      `/api/clients/${encodeURIComponent(createdId)}/reveal-portal-password`,
      { method: 'POST', body: '{}' }
    );
    record('Reveal without session rejected', res.status === 401, `status=${res.status}`);
  }

  // Authorized reveal
  {
    const { res, data } = await authed(
      `/api/clients/${encodeURIComponent(createdId)}/reveal-portal-password`,
      { method: 'POST', body: '{}' }
    );
    record(
      'Authenticated reveal returns plaintext once',
      res.ok && data.password === 'PortalSecret!99',
      `status=${res.status}`
    );
  }

  // Update without password keeps stored secret
  {
    const { res, data } = await authed(`/api/clients/${encodeURIComponent(createdId)}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: 'Phase2 Portal Test Updated',
        pan,
        phone: '9000000002',
      }),
    });
    const reveal = await authed(
      `/api/clients/${encodeURIComponent(createdId)}/reveal-portal-password`,
      { method: 'POST', body: '{}' }
    );
    record(
      'Update without password keeps encrypted credential',
      res.ok &&
        !hasSecretFields(data) &&
        reveal.data.password === 'PortalSecret!99',
      `status=${res.status}`
    );
  }

  // Cleanup test client
  {
    const { res } = await authed(`/api/clients/${encodeURIComponent(createdId)}`, {
      method: 'DELETE',
    });
    record('Cleanup test client', res.ok, `status=${res.status}`);
  }

  // Record integrity: counts restored (approx — may equal before if cleanup worked)
  {
    const after = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf-8'));
    const afterClients = (after.clients || []).length;
    const afterGst = (after.gstClients || []).length;
    record(
      'Client/GST record counts preserved after test cycle',
      afterClients === beforeClients && afterGst === beforeGst,
      `clients ${beforeClients}->${afterClients}, gst ${beforeGst}->${afterGst}`
    );
  }

  // Backup exists from migration or prior
  {
    const backupDir = path.join(ROOT, 'data', 'backups');
    const files = fs.existsSync(backupDir)
      ? fs.readdirSync(backupDir).filter((f) => f.startsWith('ledger-') && f.endsWith('.json'))
      : [];
    record('Ledger backup directory has at least one backup', files.length > 0, `count=${files.length}`);
  }

  const failed = results.filter((r) => !r.pass).length;
  const out = {
    phase: 2,
    base: BASE,
    at: new Date().toISOString(),
    passed: results.length - failed,
    failed,
    total: results.length,
    results,
  };
  fs.writeFileSync(
    path.join(ROOT, 'PHASE2_PORTAL_PASSWORD_TEST_RESULTS.json'),
    JSON.stringify(out, null, 2),
    'utf-8'
  );
  console.log(`\n${out.passed}/${out.total} passed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('Test runner error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
