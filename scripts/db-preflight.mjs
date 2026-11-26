/**
 * Phase 8B.2 — Read-only PostgreSQL preflight.
 * Local (default) or explicitly authorized remote. Never runs DDL/DML writes.
 * Never logs passwords.
 *
 * Local:
 *   DB_PREFLIGHT_CONFIRM=it_gst_management_dev|it_gst_management_test|it_gst_management_real_rehearsal
 *   Uses DATABASE_URL (dev) or PG_AUTH_TEST_DATABASE_URL (test/rehearsal) on localhost.
 *
 * Remote:
 *   DB_TARGET_MODE=remote + approved host/database + DB_PREFLIGHT_CONFIRM + TLS
 *   (migrate ACK/token NOT required — read-only)
 */
import 'dotenv/config';
import pg from 'pg';
import {
  ALLOWED_DB_NAME,
  ALLOWED_MIGRATE_DB_NAMES,
  assertRemoteDatabaseTarget,
  assertSafeDatabaseTarget,
  redactDatabaseUrl,
  resolveDbTargetMode,
  usesPgAuthTestDatabaseUrl,
} from './db-safety.mjs';

function resolveLocal(confirm) {
  if (usesPgAuthTestDatabaseUrl(confirm)) {
    return assertSafeDatabaseTarget(process.env.PG_AUTH_TEST_DATABASE_URL, {
      allowedDatabases: [confirm],
      missingMessage:
        'PG_AUTH_TEST_DATABASE_URL is missing. Test/rehearsal preflight never falls back to DATABASE_URL.',
    });
  }
  return assertSafeDatabaseTarget(process.env.DATABASE_URL, {
    allowedDatabases: [ALLOWED_DB_NAME],
  });
}

function resolveTarget() {
  const mode = resolveDbTargetMode();
  const confirm = String(process.env.DB_PREFLIGHT_CONFIRM || '').trim();

  if (mode === 'remote') {
    if (!confirm) {
      throw new Error(
        'Refusing remote preflight: set DB_PREFLIGHT_CONFIRM to the exact approved database name.'
      );
    }
    if (ALLOWED_MIGRATE_DB_NAMES.includes(confirm)) {
      throw new Error(
        `Refusing remote preflight: "${confirm}" is a local-only database name.`
      );
    }
    const remote = assertRemoteDatabaseTarget(process.env.DATABASE_URL, {
      confirmEnvName: 'DB_PREFLIGHT_CONFIRM',
      operation: 'preflight',
    });
    return {
      mode: 'remote',
      confirm,
      host: remote.host,
      database: remote.database,
      sslMode: remote.sslMode,
      connectionString: remote.connectionString,
      clientConfig: remote.clientConfig,
    };
  }

  if (!ALLOWED_MIGRATE_DB_NAMES.includes(confirm)) {
    throw new Error(
      `Refusing preflight: set DB_PREFLIGHT_CONFIRM to one of [${ALLOWED_MIGRATE_DB_NAMES.join(', ')}] ` +
        `or use DB_TARGET_MODE=remote with remote authorization envs.`
    );
  }

  const local = resolveLocal(confirm);
  if (local.database !== confirm) {
    throw new Error(
      `Refusing: connection database "${local.database}" does not match DB_PREFLIGHT_CONFIRM="${confirm}".`
    );
  }
  return {
    mode: 'local',
    confirm,
    host: local.host,
    database: local.database,
    sslMode: local.sslMode,
    connectionString: local.connectionString,
    clientConfig: local.clientConfig,
  };
}

async function main() {
  const target = resolveTarget();

  console.info(
    `[db:preflight] mode=${target.mode} host=${target.host} database=${target.database} ssl=${target.sslMode}`
  );
  console.info(
    `[db:preflight] url=${redactDatabaseUrl(target.connectionString)}`
  );
  console.info('[db:preflight] read-only checks only — no schema changes.');

  const client = new pg.Client(target.clientConfig);
  try {
    await client.connect();

    const meta = await client.query(
      `SELECT current_database() AS db,
              current_user AS db_user,
              inet_server_addr()::text AS server_addr,
              version() AS version`
    );
    const row = meta.rows[0];
    if (row.db !== target.confirm) {
      throw new Error(
        `Connected database is "${row.db}", expected "${target.confirm}". Aborting.`
      );
    }

    console.info(`[db:preflight] current_database=${row.db}`);
    console.info(`[db:preflight] current_user=${row.db_user}`);
    console.info(
      `[db:preflight] server_addr=${row.server_addr || '(unix/local)'}`
    );
    console.info(
      `[db:preflight] version=${String(row.version).split('\n')[0]}`
    );

    const tracking = await client.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'schema_migrations'`
    );

    if (tracking.rowCount === 0) {
      console.info(
        '[db:preflight] schema_migrations: (missing — no migrations applied yet)'
      );
    } else {
      const applied = await client.query(
        'SELECT id, applied_at FROM schema_migrations ORDER BY id'
      );
      if (applied.rowCount === 0) {
        console.info('[db:preflight] schema_migrations: (empty)');
      } else {
        console.info(
          `[db:preflight] schema_migrations (${applied.rowCount}): ${applied.rows
            .map((r) => r.id)
            .join(', ')}`
        );
      }
    }

    console.info('[db:preflight] OK — connection and identity verified.');
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error(
    `[db:preflight] FAILED: ${err instanceof Error ? err.message : String(err)}`
  );
  process.exitCode = 1;
});
