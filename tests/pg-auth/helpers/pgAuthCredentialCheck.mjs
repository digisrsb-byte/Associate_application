/**
 * One-shot credential shape + admin auth check.
 * Never prints URLs, usernames, passwords, or connection strings.
 */
import 'dotenv/config';
import pg from 'pg';

function inspectUrl(raw, expectedDb) {
  if (!raw || !String(raw).trim()) {
    return { ok: false, reason: 'missing' };
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'unparseable' };
  }
  const user = decodeURIComponent(url.username || '');
  const host = (url.hostname || '').toLowerCase();
  const port = url.port || (url.protocol.startsWith('postgres') ? '5432' : '');
  const db = decodeURIComponent((url.pathname || '').replace(/^\//, ''));
  const checks = {
    username_is_postgres: user === 'postgres',
    host_is_127: host === '127.0.0.1',
    port_is_5432: port === '5432' || (port === '' && host === '127.0.0.1'),
    db_matches: db === expectedDb,
  };
  const ok = Object.values(checks).every(Boolean);
  return { ok, checks, reason: ok ? 'ok' : 'shape_mismatch' };
}

async function main() {
  const adminRaw = process.env.PG_AUTH_TEST_ADMIN_URL;
  const testRaw = process.env.PG_AUTH_TEST_DATABASE_URL;

  const adminShape = inspectUrl(adminRaw, 'postgres');
  const testShape = inspectUrl(testRaw, 'it_gst_management_test');

  console.log('PG_AUTH_TEST_ADMIN_URL_SHAPE=' + (adminShape.ok ? 'PASS' : 'FAIL'));
  if (!adminShape.ok && adminShape.checks) {
    console.log(
      '  admin_checks=' +
        JSON.stringify(adminShape.checks)
    );
  } else if (!adminShape.ok) {
    console.log('  reason=' + adminShape.reason);
  }

  console.log('PG_AUTH_TEST_DATABASE_URL_SHAPE=' + (testShape.ok ? 'PASS' : 'FAIL'));
  if (!testShape.ok && testShape.checks) {
    console.log(
      '  test_checks=' +
        JSON.stringify(testShape.checks)
    );
  } else if (!testShape.ok) {
    console.log('  reason=' + testShape.reason);
  }

  if (!adminShape.ok || !testShape.ok) {
    console.log('ADMIN_AUTH=SKIPPED');
    process.exitCode = 1;
    return;
  }

  const client = new pg.Client({ connectionString: adminRaw });
  try {
    await client.connect();
    const db = (await client.query('SELECT current_database() AS db')).rows[0].db;
    if (db !== 'postgres') {
      console.log('ADMIN_AUTH=FAIL');
      console.log('  reason=unexpected_connected_database');
      process.exitCode = 1;
      return;
    }
    console.log('ADMIN_AUTH=SUCCESS');
  } catch {
    console.log('ADMIN_AUTH=FAIL');
    console.log('  reason=authentication_or_connection_error');
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

main();
