/**
 * Apply numbered SQL migrations in order.
 *
 * Local (default — DB_TARGET_MODE unset or local):
 *   - it_gst_management_dev  → DATABASE_URL on localhost
 *   - it_gst_management_test → PG_AUTH_TEST_DATABASE_URL on localhost (never DATABASE_URL)
 *
 * Remote (DB_TARGET_MODE=remote) — Phase 8B.2:
 *   Requires DB_APPROVED_REMOTE_HOST, DB_APPROVED_REMOTE_DATABASE,
 *   DB_MIGRATE_CONFIRM, DB_REMOTE_MIGRATE_ACK, DB_REMOTE_MIGRATE_TOKEN, and TLS.
 *   Uses DATABASE_URL only (never PG_AUTH_TEST_DATABASE_URL).
 *
 * Never logs passwords (redacted summary only).
 * Never auto-invoked from application startup — run explicitly with confirm env.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import {
  ALLOWED_DISPOSABLE_DRILL_DB_NAMES,
  ALLOWED_MIGRATE_DB_NAMES,
  assertRemoteDatabaseTarget,
  assertSafeDatabaseTarget,
  migrationsDir,
  redactDatabaseUrl,
  resolveDbTargetMode,
  rewriteDatabaseUrl,
} from './db-safety.mjs';

/** Strict up-migration names: NNN_snake_name.sql (excludes *_down.sql). */
const MIGRATION_FILE_RE = /^(\d{3})_([a-z][a-z0-9_]*)\.sql$/;

/**
 * Discover migration files, reject invalid/duplicate numbers, sort numerically.
 * @returns {{ num: number, id: string, fileName: string, filePath: string }[]}
 */
function listOrderedMigrations(dir) {
  if (!fs.existsSync(dir)) {
    throw new Error(`Migrations directory not found: ${dir}`);
  }

  const entries = fs.readdirSync(dir);
  /** @type {Map<number, { num: number, id: string, fileName: string, filePath: string }>} */
  const byNum = new Map();

  for (const fileName of entries) {
    if (!fileName.endsWith('.sql')) continue;
    if (fileName.endsWith('_down.sql')) continue;

    const match = MIGRATION_FILE_RE.exec(fileName);
    if (!match) {
      throw new Error(
        `Invalid migration filename "${fileName}". Expected NNN_snake_name.sql (e.g. 001_foundation.sql).`
      );
    }

    const num = Number(match[1]);
    if (!Number.isInteger(num) || num < 0) {
      throw new Error(`Invalid migration number in "${fileName}".`);
    }

    if (byNum.has(num)) {
      const prior = byNum.get(num);
      throw new Error(
        `Duplicate migration number ${match[1]}: "${prior.fileName}" and "${fileName}". Aborting.`
      );
    }

    const id = fileName.slice(0, -'.sql'.length);
    byNum.set(num, {
      num,
      id,
      fileName,
      filePath: path.join(dir, fileName),
    });
  }

  return [...byNum.values()].sort((a, b) => a.num - b.num);
}

function resolveLocalMigrateConnection(confirm) {
  if (confirm === 'it_gst_management_test') {
    return assertSafeDatabaseTarget(process.env.PG_AUTH_TEST_DATABASE_URL, {
      allowedDatabases: ['it_gst_management_test'],
      missingMessage:
        'PG_AUTH_TEST_DATABASE_URL is missing. Test migrations never fall back to DATABASE_URL.',
    });
  }
  if (ALLOWED_DISPOSABLE_DRILL_DB_NAMES.includes(confirm)) {
    const base = process.env.DATABASE_URL || '';
    return assertSafeDatabaseTarget(rewriteDatabaseUrl(base, confirm), {
      allowedDatabases: [...ALLOWED_DISPOSABLE_DRILL_DB_NAMES],
      missingMessage:
        'DATABASE_URL is missing. Disposable drill migrate rewrites the local URL database name.',
    });
  }
  return assertSafeDatabaseTarget(process.env.DATABASE_URL, {
    allowedDatabases: ['it_gst_management_dev'],
  });
}

function resolveTarget() {
  const mode = resolveDbTargetMode();
  const confirm = String(process.env.DB_MIGRATE_CONFIRM || '').trim();

  if (mode === 'remote') {
    if (!confirm) {
      throw new Error(
        'Refusing remote migrate: set DB_MIGRATE_CONFIRM to the exact approved database name.'
      );
    }
    if (ALLOWED_MIGRATE_DB_NAMES.includes(confirm)) {
      throw new Error(
        `Refusing remote migrate: "${confirm}" is a local-only database name.`
      );
    }
    const remote = assertRemoteDatabaseTarget(process.env.DATABASE_URL, {
      confirmEnvName: 'DB_MIGRATE_CONFIRM',
      operation: 'migrate',
    });
    return {
      mode: 'remote',
      confirm,
      connectionString: remote.connectionString,
      host: remote.host,
      database: remote.database,
      sslMode: remote.sslMode,
      clientConfig: remote.clientConfig,
    };
  }

  if (!ALLOWED_MIGRATE_DB_NAMES.includes(confirm)) {
    throw new Error(
      `Refusing to proceed: set DB_MIGRATE_CONFIRM to one of [${ALLOWED_MIGRATE_DB_NAMES.join(', ')}] ` +
        `(or use DB_TARGET_MODE=remote with full remote authorization).`
    );
  }

  const local = resolveLocalMigrateConnection(confirm);
  if (local.database !== confirm) {
    throw new Error(
      `Refusing: connection database "${local.database}" does not match DB_MIGRATE_CONFIRM="${confirm}".`
    );
  }
  return {
    mode: 'local',
    confirm,
    connectionString: local.connectionString,
    host: local.host,
    database: local.database,
    sslMode: local.sslMode,
    clientConfig: local.clientConfig,
  };
}

async function main() {
  const target = resolveTarget();

  const migrations = listOrderedMigrations(migrationsDir());
  if (migrations.length === 0) {
    throw new Error('No migration files found in db/migrations.');
  }

  console.info(
    `[db:migrate] mode=${target.mode} host=${target.host} database=${target.database} ssl=${target.sslMode}`
  );
  console.info(`[db:migrate] url=${redactDatabaseUrl(target.connectionString)}`);
  console.info(
    `[db:migrate] discovered ${migrations.length} migration(s): ${migrations.map((m) => m.id).join(', ')}`
  );

  const client = new pg.Client(target.clientConfig);
  try {
    await client.connect();

    const connectedDb = (await client.query('SELECT current_database() AS db'))
      .rows[0].db;
    if (connectedDb !== target.confirm) {
      throw new Error(
        `Connected database is "${connectedDb}", expected "${target.confirm}". Aborting.`
      );
    }

    const trackingExists = await client.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'schema_migrations'`
    );

    /** @type {Set<string>} */
    const applied = new Set();
    if (trackingExists.rowCount > 0) {
      const rows = await client.query(
        'SELECT id FROM schema_migrations ORDER BY id'
      );
      for (const row of rows.rows) {
        applied.add(String(row.id));
      }
    }

    const knownIds = new Set(migrations.map((m) => m.id));
    for (const id of applied) {
      if (!knownIds.has(id)) {
        throw new Error(
          `schema_migrations contains unknown id "${id}" with no matching file. Aborting.`
        );
      }
    }

    for (const m of migrations) {
      if (!applied.has(m.id)) continue;
      for (const earlier of migrations) {
        if (earlier.num >= m.num) break;
        if (!applied.has(earlier.id)) {
          throw new Error(
            `schema_migrations has "${m.id}" but missing earlier "${earlier.id}". Aborting.`
          );
        }
      }
    }

    const pending = migrations.filter((m) => !applied.has(m.id));
    if (pending.length === 0) {
      console.info(
        '[db:migrate] All discovered migrations already applied. Nothing to do.'
      );
      return;
    }

    for (const migration of pending) {
      for (const earlier of migrations) {
        if (earlier.num >= migration.num) break;
        if (!applied.has(earlier.id)) {
          throw new Error(
            `Refusing "${migration.fileName}": prerequisite "${earlier.fileName}" is not applied.`
          );
        }
      }

      const sql = fs.readFileSync(migration.filePath, 'utf8');
      console.info(`[db:migrate] Applying ${migration.fileName} ...`);

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [
          migration.id,
        ]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(`Migration failed: ${migration.fileName}. ${detail}`);
      }

      applied.add(migration.id);
      console.info(`[db:migrate] Applied ${migration.id} successfully.`);
    }

    console.info('[db:migrate] Done.');
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error(
    `[db:migrate] FAILED: ${err instanceof Error ? err.message : String(err)}`
  );
  process.exitCode = 1;
});
