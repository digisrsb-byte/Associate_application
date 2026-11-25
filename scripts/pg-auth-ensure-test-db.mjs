/**
 * Create it_gst_management_test if missing (local only).
 * Uses PG_AUTH_TEST_ADMIN_URL (maintenance DB) + PG_AUTH_TEST_CONFIRM.
 * Never prints credentials. Never touches it_gst_management_dev.
 */
import 'dotenv/config';
import pg from 'pg';
import { redactDatabaseUrl } from './db-safety.mjs';

const TEST_DB = 'it_gst_management_test';
const DEV_DB = 'it_gst_management_dev';

function assertAdminUrl(raw) {
  if (!raw || !String(raw).trim()) {
    throw new Error('PG_AUTH_TEST_ADMIN_URL is missing.');
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('PG_AUTH_TEST_ADMIN_URL is not a valid URL.');
  }
  const protocol = url.protocol.replace(/:$/, '');
  if (protocol !== 'postgresql' && protocol !== 'postgres') {
    throw new Error(`Refusing admin protocol "${protocol}".`);
  }
  const host = (url.hostname || '').toLowerCase();
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(`Refusing admin host "${host}".`);
  }
  const database = decodeURIComponent((url.pathname || '').replace(/^\//, ''));
  if (database === DEV_DB) {
    throw new Error(`Refusing admin URL targeting ${DEV_DB}.`);
  }
  if (database === TEST_DB) {
    throw new Error(
      `Admin URL must target a maintenance database (e.g. postgres), not ${TEST_DB}.`
    );
  }
  if (database !== 'postgres' && database !== 'template1') {
    throw new Error(
      `Refusing admin database "${database || '(empty)'}". Use postgres or template1.`
    );
  }
  return { connectionString: raw, host, database };
}

async function main() {
  const confirm = String(process.env.PG_AUTH_TEST_CONFIRM || '').trim();
  if (confirm !== TEST_DB) {
    throw new Error(`Set PG_AUTH_TEST_CONFIRM=${TEST_DB}`);
  }

  const admin = assertAdminUrl(process.env.PG_AUTH_TEST_ADMIN_URL);
  console.info(
    `[pg-auth:ensure-db] admin host=${admin.host} database=${admin.database}`
  );
  console.info(`[pg-auth:ensure-db] url=${redactDatabaseUrl(admin.connectionString)}`);

  const client = new pg.Client({ connectionString: admin.connectionString });
  await client.connect();
  try {
    const connected = (await client.query('SELECT current_database() AS db')).rows[0]
      .db;
    if (connected === DEV_DB || connected === TEST_DB) {
      throw new Error(
        `Connected to "${connected}" via admin URL; expected maintenance DB. Aborting.`
      );
    }

    const exists = await client.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [TEST_DB]
    );

    if (exists.rowCount > 0) {
      console.info(`[pg-auth:ensure-db] "${TEST_DB}" already exists.`);
      return { created: false };
    }

    // Identifiers cannot be parameterized; name is a fixed allowlisted constant.
    await client.query(`CREATE DATABASE ${TEST_DB}`);
    console.info(`[pg-auth:ensure-db] Created "${TEST_DB}".`);
    return { created: true };
  } finally {
    await client.end().catch(() => {});
  }
}

main()
  .then((r) => {
    console.info(`[pg-auth:ensure-db] done created=${r.created}`);
  })
  .catch((err) => {
    console.error(
      `[pg-auth:ensure-db] FAILED: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exitCode = 1;
  });
