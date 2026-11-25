/**
 * Phase 8C.3 — read-only check: do disposable drill DBs already exist?
 * Never prints passwords.
 */
import 'dotenv/config';
import pg from 'pg';
import {
  isLoopbackHost,
  parseDatabaseUrl,
  redactDatabaseUrl,
} from './db-safety.mjs';

const DRILLS = [
  'it_gst_management_restore_drill',
  'it_gst_management_backup_drill',
];

const url = process.env.DATABASE_URL || process.env.PG_AUTH_TEST_DATABASE_URL;
if (!url) {
  console.log(
    JSON.stringify({ ok: false, reason: 'NO_LOCAL_URL_CONFIGURED' })
  );
  process.exit(0);
}

const parsed = parseDatabaseUrl(url);
if (!isLoopbackHost(parsed.host)) {
  console.log(
    JSON.stringify({
      ok: false,
      reason: 'NON_LOOPBACK_HOST',
      host: parsed.host,
    })
  );
  process.exit(0);
}

const u = new URL(url);
u.pathname = '/postgres';
const client = new pg.Client({ connectionString: u.toString() });
await client.connect();
const r = await client.query(
  'SELECT datname FROM pg_database WHERE datname = ANY($1::text[]) ORDER BY 1',
  [DRILLS]
);
const existing = r.rows.map((x) => x.datname);
await client.end();
console.log(
  JSON.stringify(
    {
      ok: true,
      redactedAdminTarget: redactDatabaseUrl(u.toString()),
      existingDrillDatabases: existing,
      bothAbsent: existing.length === 0,
    },
    null,
    2
  )
);
