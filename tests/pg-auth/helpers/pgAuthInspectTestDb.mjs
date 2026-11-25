/**
 * Inspect it_gst_management_test after ensure — counts only, no secrets.
 * Stops (exit 1) if unexpected tables or non-empty business data before migrate,
 * or unexpected non-schema content after migrate that isn't auth-test related.
 */
import 'dotenv/config';
import pg from 'pg';
import { assertSafeDatabaseTarget } from '../../../scripts/db-safety.mjs';

const TEST_DB = 'it_gst_management_test';

const EXPECTED_EMPTY_OR_AUTH = new Set([
  'schema_migrations',
  'organizations',
  'users',
  'organization_members',
  'sessions',
  'password_reset_challenges',
  'assessment_years',
  'gst_months',
  'it_clients',
  'it_filings',
  'gst_companies',
  'gst_filings',
]);

async function main() {
  const confirm = String(process.env.PG_AUTH_TEST_CONFIRM || '').trim();
  if (confirm !== TEST_DB) {
    throw new Error(`PG_AUTH_TEST_CONFIRM must be ${TEST_DB}`);
  }

  const { connectionString, database } = assertSafeDatabaseTarget(
    process.env.PG_AUTH_TEST_DATABASE_URL,
    {
      allowedDatabases: [TEST_DB],
      missingMessage: 'PG_AUTH_TEST_DATABASE_URL missing',
    }
  );
  if (database !== TEST_DB) {
    throw new Error(`Refusing database ${database}`);
  }

  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const connected = (await client.query('SELECT current_database() AS db')).rows[0]
      .db;
    if (connected !== TEST_DB) {
      throw new Error(`Connected to ${connected}, expected ${TEST_DB}`);
    }

    const tables = await client.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
       ORDER BY table_name`
    );
    const names = tables.rows.map((r) => r.table_name);
    console.info(`[inspect] public_tables=${names.length}`);
    console.info(`[inspect] tables=${names.join(',') || '(none)'}`);

    for (const name of names) {
      if (!EXPECTED_EMPTY_OR_AUTH.has(name)) {
        throw new Error(
          `Unexpected table "${name}" in ${TEST_DB}. Stopping without changes.`
        );
      }
    }

    const counts = {};
    for (const name of names) {
      const res = await client.query(`SELECT COUNT(*)::bigint AS n FROM ${name}`);
      counts[name] = Number(res.rows[0].n);
    }
    console.info(`[inspect] counts=${JSON.stringify(counts)}`);

    // Ledger business tables must be empty in the auth test DB.
    const ledgerTables = [
      'assessment_years',
      'gst_months',
      'it_clients',
      'it_filings',
      'gst_companies',
      'gst_filings',
    ];
    for (const t of ledgerTables) {
      if (counts[t] && counts[t] > 0) {
        throw new Error(
          `Unexpected ledger data in ${t}=${counts[t]}. Stopping.`
        );
      }
    }

    const migrations = names.includes('schema_migrations')
      ? (
          await client.query(`SELECT id FROM schema_migrations ORDER BY id`)
        ).rows.map((r) => r.id)
      : [];
    console.info(
      `[inspect] migrations=${migrations.length ? migrations.join(',') : '(none)'}`
    );
    console.info('[inspect] OK');
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error(`[inspect] FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
