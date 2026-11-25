/**
 * Roll back Phase 1 foundation only on it_gst_management_dev.
 * Refuses if later migrations exist, if business tables have rows,
 * or if target is not localhost / it_gst_management_dev.
 * Never DROP DATABASE or DROP SCHEMA public.
 * Never logs DATABASE_URL or passwords.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import {
  ALLOWED_DB_NAME,
  BUSINESS_TABLES,
  FOUNDATION_MIGRATION_ID,
  assertConfirmEnv,
  assertSafeDatabaseTarget,
  migrationsDir,
  redactDatabaseUrl,
} from './db-safety.mjs';

async function tableExists(client, tableName) {
  const res = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  return res.rowCount > 0;
}

async function main() {
  assertConfirmEnv('DB_ROLLBACK_CONFIRM', ALLOWED_DB_NAME);

  // Rollback remains localhost-only (no remote authorization path in 8B.2).
  const { connectionString, host, database, clientConfig } =
    assertSafeDatabaseTarget(process.env.DATABASE_URL);

  console.info(`[db:rollback] target host=${host} database=${database}`);
  console.info(`[db:rollback] DATABASE_URL=${redactDatabaseUrl(connectionString)}`);

  const sqlPath = path.join(migrationsDir(), '001_foundation_down.sql');
  if (!fs.existsSync(sqlPath)) {
    throw new Error(`Rollback file not found: ${sqlPath}`);
  }
  const downSql = fs.readFileSync(sqlPath, 'utf8');

  if (/drop\s+database/i.test(downSql) || /drop\s+schema\s+public/i.test(downSql)) {
    throw new Error('Rollback SQL contains forbidden DROP DATABASE / DROP SCHEMA public.');
  }

  const client = new pg.Client(clientConfig);
  try {
    await client.connect();

    const connectedDb = (await client.query('SELECT current_database() AS db')).rows[0].db;
    if (connectedDb !== ALLOWED_DB_NAME) {
      throw new Error(
        `Connected database is "${connectedDb}", expected "${ALLOWED_DB_NAME}". Aborting.`
      );
    }

    if (!(await tableExists(client, 'schema_migrations'))) {
      console.info('[db:rollback] schema_migrations missing — nothing to roll back.');
      return;
    }

    const applied = await client.query('SELECT id FROM schema_migrations ORDER BY id');
    const ids = applied.rows.map((r) => r.id);

    if (ids.length === 0) {
      console.info('[db:rollback] No migrations recorded — nothing to roll back.');
      return;
    }

    const later = ids.filter((id) => id !== FOUNDATION_MIGRATION_ID);
    if (later.length > 0) {
      throw new Error(
        `Refusing rollback: migrations after foundation are present [${later.join(', ')}].`
      );
    }

    if (!ids.includes(FOUNDATION_MIGRATION_ID)) {
      throw new Error(
        `Refusing rollback: expected only "${FOUNDATION_MIGRATION_ID}", found [${ids.join(', ')}].`
      );
    }

    for (const table of BUSINESS_TABLES) {
      if (!(await tableExists(client, table))) continue;
      const countRes = await client.query(`SELECT COUNT(*)::bigint AS n FROM ${table}`);
      const n = Number(countRes.rows[0].n);
      if (n > 0) {
        throw new Error(
          `Refusing rollback: business table "${table}" contains ${n} row(s). Empty the Phase 1 schema only via approved procedures.`
        );
      }
    }

    await client.query('BEGIN');
    try {
      await client.query(downSql);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }

    console.info(`[db:rollback] Rolled back ${FOUNDATION_MIGRATION_ID} successfully.`);
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error(`[db:rollback] FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
