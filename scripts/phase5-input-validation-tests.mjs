/**
 * Phase 5 – PAN / field validation tests.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BASE = process.env.TEST_BASE || 'http://127.0.0.1:3000';
const ADMIN_EMAIL = process.env.QA_EMAIL || 'admin@srsbassociate.com';
const PASSWORDS = [
  process.env.QA_PASSWORD,
  process.env.QA_PASSWORD_STRONG,
  'SecureUat!Ledger2026',
  'Phase1Test@2026Xx',
  'Admin@123',
].filter(Boolean);

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
  const data = await res.json().catch(() => ({}));
  return { res, data, headers: res.headers };
}

function cookieFrom(res) {
  if (typeof res.headers.getSetCookie === 'function') {
    return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  }
  const single = res.headers.get('set-cookie');
  return single ? single.split(';')[0] : '';
}

async function main() {
  console.log(`Phase 5 validation tests → ${BASE}\n`);

  const health = await jsonFetch('/api/health');
  record('Server health', health.res.ok, `status=${health.res.status}`);
  if (!health.res.ok) process.exit(1);

  let cookie = '';
  let loginOk = false;
  for (const password of PASSWORDS) {
    const login = await jsonFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: ADMIN_EMAIL, password }),
    });
    cookie = cookieFrom(login.res);
    if (login.res.ok && cookie) {
      loginOk = true;
      break;
    }
  }
  record('Admin login', loginOk, loginOk ? 'ok' : 'failed');
  if (!loginOk) process.exit(1);

  const authed = (p, opts = {}) =>
    jsonFetch(p, {
      ...opts,
      headers: { ...(opts.headers || {}), Cookie: cookie },
    });

  const before = await authed('/api/ledger');
  const beforeCount = (before.data.clients || []).length;

  // Historical invalid report (must not modify)
  {
    const { res, data } = await authed('/api/clients/pan-validation-report');
    record(
      'PAN validation report available',
      res.ok && typeof data.invalidCount === 'number',
      `invalid=${data.invalidCount} total=${data.totalClients}`
    );
    const after = await authed('/api/ledger');
    record(
      'PAN report does not modify ledger',
      (after.data.clients || []).length === beforeCount,
      `clients=${(after.data.clients || []).length}`
    );
  }

  // Valid PAN: 5 letters (4th = entity type) + 4 digits + 1 letter (10 chars)
  const validPan = `AAAPA${String(Date.now()).slice(-4)}Z`;

  // Valid create
  {
    const { res, data } = await authed('/api/clients', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Phase5 Valid Client',
        pan: validPan.toLowerCase(),
        password: 'PortalSecret!99',
        phone: '9876543210',
      }),
    });
    record(
      'Valid PAN create (lowercase normalized)',
      res.status === 201 && data.client?.pan === validPan.toUpperCase(),
      `status=${res.status} pan=${data.client?.pan}`
    );
  }

  // Spaces trimmed
  {
    const pan2 = `BBB PB${String(Date.now()).slice(-3)}1Y`.replace(/\s/g, '');
    // ensure format: BBBPB####Y — craft carefully
    const crafted = `BBBPB${String(Date.now()).slice(-4)}Y`;
    const { res, data } = await authed('/api/clients', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Phase5 Spaced Pan',
        pan: `  ${crafted.toLowerCase()}  `,
        password: 'PortalSecret!99',
      }),
    });
    record(
      'PAN with spaces trimmed/uppercased',
      res.status === 201 && data.client?.pan === crafted,
      `status=${res.status} pan=${data.client?.pan}`
    );
    if (data.client?.id) {
      await authed(`/api/clients/${data.client.id}`, { method: 'DELETE' });
    }
  }

  // Invalid formats
  for (const [label, pan] of [
    ['bad chars', '!!!'],
    ['wrong length', 'ABCPE123'],
    ['bad 4th char', 'ABCVX1234A'],
    ['empty', ''],
  ]) {
    const { res } = await authed('/api/clients', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Should Fail',
        pan,
        password: 'PortalSecret!99',
      }),
    });
    record(`Reject invalid PAN (${label})`, res.status === 400, `status=${res.status}`);
  }

  // Duplicate
  {
    const { res } = await authed('/api/clients', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Dup',
        pan: validPan,
        password: 'PortalSecret!99',
      }),
    });
    record('Duplicate PAN rejected', res.status === 409, `status=${res.status}`);
  }

  // Long name
  {
    const { res } = await authed('/api/clients', {
      method: 'POST',
      body: JSON.stringify({
        name: 'N'.repeat(200),
        pan: `CCCPC${String(Date.now()).slice(-4)}Q`,
        password: 'PortalSecret!99',
      }),
    });
    record('Excessively long name rejected', res.status === 400, `status=${res.status}`);
  }

  // Bad phone
  {
    const { res } = await authed('/api/clients', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Phone Bad',
        pan: `DDDPD${String(Date.now()).slice(-4)}R`,
        password: 'PortalSecret!99',
        phone: 'abc-not-a-phone',
      }),
    });
    record('Invalid phone rejected', res.status === 400, `status=${res.status}`);
  }

  // Import invalid PAN skipped + reported
  {
    const goodPan = `EEEPE${String(Date.now()).slice(-4)}S`;
    const { res, data } = await authed('/api/import/it', {
      method: 'POST',
      body: JSON.stringify({
        mode: 'merge',
        onConflict: 'update',
        clients: [
          { pan: '!!!', name: 'Bad Import', filings: {} },
          { pan: goodPan, name: 'Good Import', filings: {} },
        ],
      }),
    });
    const report = data.report || {};
    record(
      'Import skips invalid PAN and reports it',
      res.ok &&
        report.invalidPanCount >= 1 &&
        report.clientsCreated >= 1 &&
        Array.isArray(report.invalidPanRows),
      `status=${res.status} invalid=${report.invalidPanCount} created=${report.clientsCreated}`
    );
    // cleanup good import if created
    const ledger = await authed('/api/ledger');
    const created = (ledger.data.clients || []).find((c) => c.pan === goodPan);
    if (created) {
      await authed(`/api/clients/${created.id}`, { method: 'DELETE' });
    }
  }

  // Cleanup validPan client
  {
    const ledger = await authed('/api/ledger');
    const row = (ledger.data.clients || []).find((c) => c.pan === validPan.toUpperCase());
    if (row) await authed(`/api/clients/${row.id}`, { method: 'DELETE' });
  }

  // Historical bad pan still present
  {
    const ledger = await authed('/api/ledger');
    const bad = (ledger.data.clients || []).find((c) => c.pan === '!!!');
    record(
      'Historical invalid PAN record preserved',
      !!bad,
      bad ? `id=${bad.id}` : 'missing'
    );
  }

  const after = await authed('/api/ledger');
  record(
    'Client count restored after Phase 5 probes',
    (after.data.clients || []).length === beforeCount,
    `${beforeCount}->${(after.data.clients || []).length}`
  );

  const failed = results.filter((r) => !r.pass).length;
  const out = {
    phase: 5,
    at: new Date().toISOString(),
    passed: results.length - failed,
    failed,
    total: results.length,
    results,
  };
  fs.writeFileSync(
    path.join(ROOT, 'PHASE5_INPUT_VALIDATION_TEST_RESULTS.json'),
    JSON.stringify(out, null, 2),
    'utf-8'
  );
  console.log(`\n${out.passed}/${out.total} passed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
