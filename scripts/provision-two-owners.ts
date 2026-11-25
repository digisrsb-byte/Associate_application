/**
 * Phase 8B.3 — Operator CLI: provision one shared org + two owner logins.
 *
 * Passwords: interactive hidden prompts only (never CLI argv, never logged).
 * Metadata via env: PROVISION_ORG_NAME, PROVISION_OWNER_A_EMAIL, PROVISION_OWNER_B_EMAIL.
 *
 * Local (default): DB_PROVISION_CONFIRM=it_gst_management_test|it_gst_management_dev
 *   test → PG_AUTH_TEST_DATABASE_URL; dev → DATABASE_URL
 * Remote: DB_TARGET_MODE=remote + 8B.2 remote gates + provision ACK/token.
 *
 * Never auto-invoked by the application server.
 */
import 'dotenv/config';
import readline from 'readline';
import { stdin as input, stdout as output } from 'process';
import pg from 'pg';
import {
  ALLOWED_DISPOSABLE_DRILL_DB_NAMES,
  ALLOWED_MIGRATE_DB_NAMES,
  assertRemoteDatabaseTarget,
  assertSafeDatabaseTarget,
  redactDatabaseUrl,
  resolveDbTargetMode,
  rewriteDatabaseUrl,
} from './db-safety.mjs';
import {
  normalizeEmail,
  provisionTwoOwnersInTransaction,
  validateProvisionEmails,
} from './provision-two-owners-lib.ts';

function resolveTarget() {
  const mode = resolveDbTargetMode();
  const confirm = String(process.env.DB_PROVISION_CONFIRM || '').trim();

  if (mode === 'remote') {
    if (!confirm) {
      throw new Error(
        'Refusing remote provision: set DB_PROVISION_CONFIRM to the exact approved database name.'
      );
    }
    if (ALLOWED_MIGRATE_DB_NAMES.includes(confirm)) {
      throw new Error(
        `Refusing remote provision: "${confirm}" is a local-only database name.`
      );
    }
    const remote = assertRemoteDatabaseTarget(process.env.DATABASE_URL || '', {
      confirmEnvName: 'DB_PROVISION_CONFIRM',
      operation: 'provision',
    });
    return {
      mode: 'remote' as const,
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
      `Refusing provision: set DB_PROVISION_CONFIRM to one of [${ALLOWED_MIGRATE_DB_NAMES.join(', ')}] ` +
        `or use DB_TARGET_MODE=remote with full remote authorization.`
    );
  }

  if (confirm === 'it_gst_management_test') {
    const local = assertSafeDatabaseTarget(
      process.env.PG_AUTH_TEST_DATABASE_URL || '',
      {
        allowedDatabases: ['it_gst_management_test'],
        missingMessage:
          'PG_AUTH_TEST_DATABASE_URL is missing. Test provisioning never falls back to DATABASE_URL.',
      }
    );
    return {
      mode: 'local' as const,
      confirm,
      host: local.host,
      database: local.database,
      sslMode: local.sslMode,
      connectionString: local.connectionString,
      clientConfig: local.clientConfig,
    };
  }

  if (ALLOWED_DISPOSABLE_DRILL_DB_NAMES.includes(confirm)) {
    const local = assertSafeDatabaseTarget(
      rewriteDatabaseUrl(process.env.DATABASE_URL || '', confirm),
      {
        allowedDatabases: [...ALLOWED_DISPOSABLE_DRILL_DB_NAMES],
        missingMessage:
          'DATABASE_URL is missing. Disposable drill provision rewrites the local URL database name.',
      }
    );
    return {
      mode: 'local' as const,
      confirm,
      host: local.host,
      database: local.database,
      sslMode: local.sslMode,
      connectionString: local.connectionString,
      clientConfig: local.clientConfig,
    };
  }

  const local = assertSafeDatabaseTarget(process.env.DATABASE_URL || '', {
    allowedDatabases: ['it_gst_management_dev'],
  });
  return {
    mode: 'local' as const,
    confirm,
    host: local.host,
    database: local.database,
    sslMode: local.sslMode,
    connectionString: local.connectionString,
    clientConfig: local.clientConfig,
  };
}

/**
 * Hidden password prompt — never echoes. Does not accept argv passwords.
 */
export function promptHiddenPassword(label: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!input.isTTY || !output.isTTY) {
      reject(
        new Error(
          'Secure interactive password entry requires a TTY. ' +
            'Do not pass passwords on the command line.'
        )
      );
      return;
    }

    const rl = readline.createInterface({ input, output });
    const stdin = input as NodeJS.ReadStream;
    output.write(label);
    const wasRaw = stdin.isRaw;
    if (typeof stdin.setRawMode === 'function') {
      stdin.setRawMode(true);
    }

    let value = '';
    const onData = (chunk: Buffer) => {
      const s = chunk.toString('utf8');
      for (const ch of s) {
        if (ch === '\n' || ch === '\r' || ch === '\u0004') {
          cleanup();
          output.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') {
          cleanup();
          reject(new Error('Cancelled.'));
          return;
        }
        if (ch === '\u007f' || ch === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        if (ch < ' ' && ch !== '\t') {
          continue;
        }
        value += ch;
      }
    };

    function cleanup() {
      stdin.removeListener('data', onData);
      if (typeof stdin.setRawMode === 'function') {
        stdin.setRawMode(!!wasRaw);
      }
      rl.close();
    }

    stdin.on('data', onData);
  });
}

async function main() {
  const target = resolveTarget();
  const organizationName = String(process.env.PROVISION_ORG_NAME || '').trim();
  const ownerAEmailRaw = String(process.env.PROVISION_OWNER_A_EMAIL || '').trim();
  const ownerBEmailRaw = String(process.env.PROVISION_OWNER_B_EMAIL || '').trim();

  if (!organizationName) {
    throw new Error('Set PROVISION_ORG_NAME to the shared organization display name.');
  }
  const { ownerAEmail, ownerBEmail } = validateProvisionEmails(
    ownerAEmailRaw,
    ownerBEmailRaw
  );

  // Fail closed if anyone tried to pass secrets via argv.
  for (const arg of process.argv.slice(2)) {
    if (/pass(word)?=/i.test(arg) || arg.startsWith('--password')) {
      throw new Error(
        'Refusing: passwords must not be passed as command-line arguments.'
      );
    }
  }

  console.info(
    `[db:provision-owners] mode=${target.mode} host=${target.host} database=${target.database} ssl=${target.sslMode}`
  );
  console.info(
    `[db:provision-owners] url=${redactDatabaseUrl(target.connectionString)}`
  );
  console.info(
    `[db:provision-owners] org="${organizationName}" owners=${ownerAEmail} + ${ownerBEmail}`
  );
  console.info(
    '[db:provision-owners] Passwords will be requested interactively (not echoed).'
  );

  const ownerAPassword = await promptHiddenPassword(
    `Password for ${ownerAEmail}: `
  );
  const ownerAPasswordConfirm = await promptHiddenPassword(
    `Confirm password for ${ownerAEmail}: `
  );
  if (ownerAPassword !== ownerAPasswordConfirm) {
    throw new Error('Owner A passwords do not match.');
  }

  const ownerBPassword = await promptHiddenPassword(
    `Password for ${ownerBEmail}: `
  );
  const ownerBPasswordConfirm = await promptHiddenPassword(
    `Confirm password for ${ownerBEmail}: `
  );
  if (ownerBPassword !== ownerBPasswordConfirm) {
    throw new Error('Owner B passwords do not match.');
  }

  const pool = new pg.Pool(target.clientConfig);
  try {
    const connected = await pool.query('SELECT current_database() AS db');
    const dbName = String(connected.rows[0].db);
    if (dbName !== target.confirm) {
      throw new Error(
        `Connected database is "${dbName}", expected "${target.confirm}". Aborting.`
      );
    }

    const result = await provisionTwoOwnersInTransaction(
      () => pool.connect(),
      {
        organizationName,
        ownerA: { email: ownerAEmail, password: ownerAPassword },
        ownerB: { email: ownerBEmail, password: ownerBPassword },
      }
    );

    console.info(`[db:provision-owners] status=${result.status}`);
    console.info(
      `[db:provision-owners] organization_id=${result.organizationId}`
    );
    console.info(
      `[db:provision-owners] organization_name=${result.organizationName}`
    );
    console.info(
      `[db:provision-owners] owner_a_id=${result.ownerA.id} email=${result.ownerA.email}`
    );
    console.info(
      `[db:provision-owners] owner_b_id=${result.ownerB.id} email=${result.ownerB.email}`
    );
    console.info(
      '[db:provision-owners] Done. Store AUTH_ORGANIZATION_ID from organization_id above. Passwords were not printed.'
    );
  } finally {
    await pool.end().catch(() => {});
  }
}

// Exported for unit tests of argv refusal / email wiring without running main.
export { resolveTarget, normalizeEmail };

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('provision-two-owners.ts') ||
    process.argv[1].endsWith('provision-two-owners.js') ||
    process.argv[1].includes('provision-two-owners'));

if (isDirectRun) {
  main().catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    // Never include password material in error paths (policy errors are safe).
    console.error(`[db:provision-owners] FAILED: ${message}`);
    process.exitCode = 1;
  });
}
