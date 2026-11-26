/**
 * Presence-only preflight for PG auth test env.
 * Never prints URL credentials or raw connection strings.
 */
import 'dotenv/config';

function summarizeUrl(raw) {
  try {
    const u = new URL(raw);
    const host = (u.hostname || '').toLowerCase();
    const db = decodeURIComponent((u.pathname || '').replace(/^\//, ''));
    const loopback = host === 'localhost' || host === '127.0.0.1';
    return {
      host_loopback: loopback,
      db_name: db || '(empty)',
      is_dev_db: db === 'it_gst_management_dev',
      is_test_db: db === 'it_gst_management_test',
      is_maintenance_db: db === 'postgres' || db === 'template1',
    };
  } catch {
    return { parse: 'FAIL' };
  }
}

const keys = [
  'PG_AUTH_TEST_ADMIN_URL',
  'PG_AUTH_TEST_DATABASE_URL',
  'PG_AUTH_TEST_CONFIRM',
];

let ok = true;
for (const k of keys) {
  const v = process.env[k];
  const present = !!(v && String(v).trim());
  if (!present) {
    console.log(`${k}: MISSING`);
    ok = false;
    continue;
  }
  if (k === 'PG_AUTH_TEST_CONFIRM') {
    const match = String(v).trim() === 'it_gst_management_test';
    console.log(
      `${k}: PRESENT match_expected=${match}`
    );
    if (!match) ok = false;
    continue;
  }
  const s = summarizeUrl(v);
  console.log(`${k}: PRESENT ${JSON.stringify(s)}`);
  if (s.parse === 'FAIL' || s.host_loopback === false) ok = false;
  if (k === 'PG_AUTH_TEST_DATABASE_URL' && !s.is_test_db) ok = false;
  if (k === 'PG_AUTH_TEST_ADMIN_URL' && s.is_dev_db) ok = false;
  if (k === 'PG_AUTH_TEST_ADMIN_URL' && s.is_test_db) {
    // Admin URL should target maintenance DB, not the test DB itself
    console.log(
      `${k}: WARNING admin URL points at test DB name (prefer database "postgres")`
    );
  }
}

console.log(`PREFLIGHT_OK=${ok}`);
process.exitCode = ok ? 0 : 1;
