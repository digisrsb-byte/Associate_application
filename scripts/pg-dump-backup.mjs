/**
 * Phase 8C.2 — Local disposable PostgreSQL dump CLI.
 *
 * Default: dry-run (validate gates, print plan). Does not run pg_dump.
 * Execute: pass --execute (still local disposable DBs only).
 *
 * Never prints passwords, keys, or database contents.
 */
import 'dotenv/config';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { redactDatabaseUrl } from './db-safety.mjs';
import {
  PG_DUMP_CONFIRM_ENV,
  executeLocalPgDump,
  planLocalPgDump,
} from './pg-dump-backup-lib.mjs';

function printUsage() {
  console.log(`Usage: node scripts/pg-dump-backup.mjs [--dry-run|--execute]

Local disposable PostgreSQL dump tooling (Phase 8C.2).

Required env:
  DATABASE_URL              local URL whose database is an allowlisted drill name
  ${PG_DUMP_CONFIRM_ENV}             must exactly equal that database name
  PG_DUMP_OUTPUT_DIR        absolute dir outside the repo and outside OneDrive

Encryption (recommended):
  PG_DUMP_ENCRYPTION_KEY or PG_DUMP_ENCRYPTION_KEY_FILE
  (dedicated key — do not reuse JSON/portal/archive keys)

Plaintext local drill only:
  PG_DUMP_ALLOW_PLAINTEXT=1

Default mode is --dry-run (no pg_dump).
Pass --execute to run pg_dump after all gates pass.
`);
}

/** Strip accidental password substrings from error messages. */
export function redactSafeMessage(msg, connectionString) {
  let out = String(msg || '');
  if (connectionString) {
    try {
      const u = new URL(connectionString);
      if (u.password) {
        out = out.split(u.password).join('***');
      }
    } catch {
      /* ignore */
    }
  }
  return out;
}

export function main(argv = process.argv.slice(2), env = process.env) {
  if (argv.includes('-h') || argv.includes('--help')) {
    printUsage();
    return 0;
  }

  const execute = argv.includes('--execute');
  const forceDryRun = argv.includes('--dry-run');
  const mode = execute && !forceDryRun ? 'execute' : 'dry-run';
  const connectionString = env.DATABASE_URL || '';

  try {
    if (mode === 'dry-run') {
      const plan = planLocalPgDump({
        connectionString,
        env,
      });
      console.log('[db:backup-pg-local] mode=dry-run (no pg_dump executed)');
      console.log(`[db:backup-pg-local] target=${plan.redactedUrl}`);
      console.log(
        `[db:backup-pg-local] database=${plan.database} host=${plan.host}`
      );
      console.log(`[db:backup-pg-local] outputDir=${plan.outputDir}`);
      console.log(
        `[db:backup-pg-local] encrypt=${plan.encrypt} keySource=${plan.keySource || '(none)'}`
      );
      console.log(`[db:backup-pg-local] wouldWrite=${plan.finalPath}`);
      console.log(
        `[db:backup-pg-local] pg_dump args=${JSON.stringify(plan.pgDumpArgsRedacted)}`
      );
      console.log(
        '[db:backup-pg-local] Re-run with --execute to create a dump after gates pass.'
      );
      return 0;
    }

    const result = executeLocalPgDump({
      connectionString,
      env,
      spawnSyncFn: spawnSync,
    });
    console.log('[db:backup-pg-local] mode=execute');
    console.log(`[db:backup-pg-local] target=${result.redactedUrl}`);
    console.log(
      `[db:backup-pg-local] database=${result.database} host=${result.host}`
    );
    console.log(`[db:backup-pg-local] artifact=${result.artifactPath}`);
    console.log(`[db:backup-pg-local] bytes=${result.bytes}`);
    console.log(`[db:backup-pg-local] sha256=${result.sha256}`);
    console.log(`[db:backup-pg-local] encrypted=${result.encrypted}`);
    console.log(`[db:backup-pg-local] manifest=${result.manifestPath}`);
    return 0;
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    console.error(
      `[db:backup-pg-local] ERROR: ${redactSafeMessage(raw, connectionString)}`
    );
    if (connectionString) {
      console.error(
        `[db:backup-pg-local] url=${redactDatabaseUrl(connectionString)}`
      );
    }
    return 1;
  }
}

function invokedDirectly() {
  try {
    const self = path.resolve(fileURLToPath(import.meta.url));
    const argv1 = path.resolve(process.argv[1] || '');
    return self === argv1;
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  process.exitCode = main();
}
