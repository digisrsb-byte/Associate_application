/**
 * Shared safety checks for Phase 1 migrate/rollback and Phase 2 import/verify.
 * Phase 8B.2 — optional explicitly authorized remote migrate/preflight.
 * Never log DATABASE_URL or passwords.
 */
import { fileURLToPath } from 'url';
import path from 'path';

export const ALLOWED_DB_NAME = 'it_gst_management_dev';
/**
 * Disposable local-only databases for Phase 8C backup/restore drills.
 * Never permitted as remote migrate/provision targets.
 */
export const ALLOWED_DISPOSABLE_DRILL_DB_NAMES = Object.freeze([
  'it_gst_management_restore_drill',
  'it_gst_management_backup_drill',
]);
/** Databases permitted for local db:migrate (each requires matching DB_MIGRATE_CONFIRM). */
export const ALLOWED_MIGRATE_DB_NAMES = Object.freeze([
  'it_gst_management_dev',
  'it_gst_management_test',
  ...ALLOWED_DISPOSABLE_DRILL_DB_NAMES,
]);
/** Names that must never be used as a remote/production migrate target. */
export const FORBIDDEN_REMOTE_DATABASE_NAMES = Object.freeze([
  'it_gst_management_dev',
  'it_gst_management_test',
  ...ALLOWED_DISPOSABLE_DRILL_DB_NAMES,
  'postgres',
  'template0',
  'template1',
]);

/**
 * Return a copy of a PostgreSQL URL with the database path replaced.
 * Never logs the result (caller must redact before printing).
 * @param {string} connectionString
 * @param {string} databaseName
 */
export function rewriteDatabaseUrl(connectionString, databaseName) {
  const parsed = parseDatabaseUrl(connectionString);
  const u = new URL(connectionString);
  if (!isLoopbackHost(parsed.host)) {
    throw new Error(
      `Refusing to rewrite database URL for non-loopback host "${parsed.host}".`
    );
  }
  const name = String(databaseName || '').trim();
  if (!name) {
    throw new Error('rewriteDatabaseUrl requires a database name.');
  }
  u.pathname = `/${encodeURIComponent(name)}`;
  return u.toString();
}
export const FOUNDATION_MIGRATION_ID = '001_foundation';
/** Default organization display name when JSON has no org entity. */
export const DEFAULT_IMPORT_ORG_NAME = 'IT GST Management';
/**
 * Fixed PostgreSQL advisory-lock key pair for Phase 2 ledger import.
 * Used with pg_advisory_xact_lock so concurrent imports serialize; released on COMMIT/ROLLBACK.
 */
export const IMPORT_ADVISORY_LOCK_KEY1 = 87201431;
export const IMPORT_ADVISORY_LOCK_KEY2 = 2;

/** Exact phrase required before any remote schema-changing migrate. */
export const REMOTE_MIGRATE_ACK_PHRASE =
  'I_UNDERSTAND_THIS_MODIFIES_REMOTE_SCHEMA';
/** Exact phrase required before remote two-owner provisioning. */
export const REMOTE_PROVISION_ACK_PHRASE =
  'I_UNDERSTAND_THIS_PROVISIONS_OWNERS';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

const BUSINESS_TABLES = [
  'organizations',
  'users',
  'organization_members',
  'sessions',
  'assessment_years',
  'gst_months',
  'it_clients',
  'it_filings',
  'gst_companies',
  'gst_filings',
];

export function redactDatabaseUrl(raw) {
  if (!raw) return '(missing)';
  try {
    const u = new URL(raw);
    if (u.password) u.password = '***';
    return `${u.protocol}//${u.username ? u.username + ':***@' : ''}${u.host}${u.pathname}`;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

/**
 * @param {string} connectionString
 * @returns {{ url: URL, host: string, port: string, database: string, sslMode: string }}
 */
export function parseDatabaseUrl(connectionString) {
  if (!connectionString || !String(connectionString).trim()) {
    throw new Error(
      'DATABASE_URL is missing. Set it in the local .env file (never commit the password).'
    );
  }

  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('Database URL is not a valid URL.');
  }

  const protocol = url.protocol.replace(/:$/, '');
  if (protocol !== 'postgresql' && protocol !== 'postgres') {
    throw new Error(
      `Refusing database protocol "${protocol}". Only postgresql is allowed.`
    );
  }

  const host = (url.hostname || '').toLowerCase();
  if (!host) {
    throw new Error('Database URL is missing a host.');
  }

  const database = decodeURIComponent((url.pathname || '').replace(/^\//, ''));
  if (!database) {
    throw new Error('Database URL is missing a database name in the path.');
  }

  const sslMode = (
    url.searchParams.get('sslmode') ||
    url.searchParams.get('ssl-mode') ||
    ''
  )
    .trim()
    .toLowerCase();

  return {
    url,
    host,
    port: url.port || '5432',
    database,
    sslMode,
  };
}

export function isLoopbackHost(host) {
  return LOOPBACK_HOSTS.has(String(host || '').toLowerCase());
}

/**
 * Resolve TLS mode from URL query and/or env (never logs secrets).
 * @param {string} urlSslMode
 * @param {NodeJS.ProcessEnv} [env]
 */
export function resolveSslMode(urlSslMode, env = process.env) {
  const fromUrl = String(urlSslMode || '')
    .trim()
    .toLowerCase();
  if (fromUrl) return fromUrl;
  const fromRemote = String(env.DB_REMOTE_SSL_MODE || '')
    .trim()
    .toLowerCase();
  if (fromRemote) return fromRemote;
  const fromPg = String(env.PGSSLMODE || '')
    .trim()
    .toLowerCase();
  return fromPg;
}

const SSL_REQUIRED_MODES = new Set(['require', 'verify-ca', 'verify-full']);

/**
 * Build node-pg Client/Pool options. Never includes password in thrown messages.
 * @param {string} connectionString
 * @param {{ requireSsl?: boolean, env?: NodeJS.ProcessEnv }} [options]
 */
export function buildPgClientConfig(connectionString, options = {}) {
  const env = options.env || process.env;
  const requireSsl = !!options.requireSsl;
  const parsed = parseDatabaseUrl(connectionString);
  const sslMode = resolveSslMode(parsed.sslMode, env);

  /** @type {{ connectionString: string, ssl?: boolean | { rejectUnauthorized: boolean } }} */
  const config = { connectionString };

  if (requireSsl) {
    if (!SSL_REQUIRED_MODES.has(sslMode)) {
      throw new Error(
        'Remote PostgreSQL requires TLS. Set sslmode=require|verify-ca|verify-full on DATABASE_URL ' +
          'or set DB_REMOTE_SSL_MODE to one of those values. Refusing plaintext remote connections.'
      );
    }
  }

  if (SSL_REQUIRED_MODES.has(sslMode)) {
    // Prefer certificate verification. Managed providers that need custom CAs should
    // use verify-ca/verify-full with NODE_EXTRA_CA_CERTS — never log cert material here.
    config.ssl = { rejectUnauthorized: true };
  } else if (sslMode === 'disable') {
    if (requireSsl) {
      throw new Error('Refusing sslmode=disable for a remote authorized target.');
    }
  }

  return {
    ...config,
    host: parsed.host,
    database: parsed.database,
    sslMode: sslMode || '(none)',
  };
}

/**
 * Parse a PostgreSQL URL and enforce localhost + an allowlisted database name.
 * Default path for local development / tests — unchanged Phase 1 behaviour.
 * @param {string} connectionString
 * @param {{ allowedDatabases?: string[], missingMessage?: string }} [options]
 * @returns {{ connectionString: string, host: string, database: string, sslMode: string, clientConfig: object }}
 */
export function assertSafeDatabaseTarget(connectionString, options = {}) {
  const allowedDatabases = options.allowedDatabases || [ALLOWED_DB_NAME];
  const missingMessage =
    options.missingMessage ||
    'DATABASE_URL is missing. Set it in the local .env file (never commit the password).';

  if (!connectionString || !String(connectionString).trim()) {
    throw new Error(missingMessage);
  }

  const parsed = parseDatabaseUrl(connectionString);
  if (!isLoopbackHost(parsed.host)) {
    throw new Error(
      `Refusing host "${parsed.host}". Local scripts only allow localhost or 127.0.0.1. ` +
        `For an explicitly authorized remote migrate/preflight, set DB_TARGET_MODE=remote ` +
        `with DB_APPROVED_REMOTE_HOST / DB_APPROVED_REMOTE_DATABASE and the remote ACK envs.`
    );
  }

  if (!allowedDatabases.includes(parsed.database)) {
    throw new Error(
      `Refusing database "${parsed.database || '(empty)'}". Allowed: ${allowedDatabases.join(', ')}.`
    );
  }

  const built = buildPgClientConfig(connectionString, { requireSsl: false });
  return {
    connectionString,
    host: parsed.host,
    database: parsed.database,
    sslMode: built.sslMode,
    clientConfig: {
      connectionString: built.connectionString,
      ...(built.ssl ? { ssl: built.ssl } : {}),
    },
  };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {'local' | 'remote'}
 */
export function resolveDbTargetMode(env = process.env) {
  const raw = String(env.DB_TARGET_MODE || 'local')
    .trim()
    .toLowerCase();
  if (!raw || raw === 'local') return 'local';
  if (raw === 'remote') return 'remote';
  throw new Error(
    `Invalid DB_TARGET_MODE="${raw}". Use "local" (default) or "remote".`
  );
}

/**
 * Multi-gate authorization for remote managed PostgreSQL (migrate or preflight).
 * Does not open a connection. Never logs secrets.
 *
 * Required independent confirmations:
 * - DB_TARGET_MODE=remote
 * - DB_APPROVED_REMOTE_HOST (exact hostname match)
 * - DB_APPROVED_REMOTE_DATABASE (exact database name match)
 * - confirmEnvName = exact database name (e.g. DB_MIGRATE_CONFIRM / DB_PREFLIGHT_CONFIRM)
 * - TLS require|verify-ca|verify-full
 * - For schema-changing migrate: DB_REMOTE_MIGRATE_ACK + DB_REMOTE_MIGRATE_TOKEN
 * - For owner provisioning: DB_REMOTE_PROVISION_ACK + DB_REMOTE_PROVISION_TOKEN
 *
 * @param {string} connectionString
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   confirmEnvName: string,
 *   operation: 'migrate' | 'preflight' | 'provision',
 * }} options
 */
export function assertRemoteDatabaseTarget(connectionString, options) {
  const env = options.env || process.env;
  const mode = resolveDbTargetMode(env);
  if (mode !== 'remote') {
    throw new Error(
      'assertRemoteDatabaseTarget requires DB_TARGET_MODE=remote.'
    );
  }

  if (!connectionString || !String(connectionString).trim()) {
    throw new Error(
      'DATABASE_URL is missing. Remote operations never fall back to PG_AUTH_TEST_DATABASE_URL.'
    );
  }

  // Hard separation from test URL — never silently use test credentials for remote.
  const testUrl = String(env.PG_AUTH_TEST_DATABASE_URL || '').trim();
  if (
    testUrl &&
    String(connectionString).trim() === testUrl
  ) {
    throw new Error(
      'Refusing: DATABASE_URL must not equal PG_AUTH_TEST_DATABASE_URL for remote operations.'
    );
  }

  const parsed = parseDatabaseUrl(connectionString);
  if (isLoopbackHost(parsed.host)) {
    throw new Error(
      `Refusing remote mode for loopback host "${parsed.host}". Use DB_TARGET_MODE=local for localhost.`
    );
  }

  const approvedHost = String(env.DB_APPROVED_REMOTE_HOST || '')
    .trim()
    .toLowerCase();
  if (!approvedHost) {
    throw new Error(
      'Refusing remote target: set DB_APPROVED_REMOTE_HOST to the exact hostname.'
    );
  }
  if (approvedHost !== parsed.host) {
    throw new Error(
      `Refusing host "${parsed.host}". Does not match DB_APPROVED_REMOTE_HOST.`
    );
  }

  const approvedDb = String(env.DB_APPROVED_REMOTE_DATABASE || '').trim();
  if (!approvedDb) {
    throw new Error(
      'Refusing remote target: set DB_APPROVED_REMOTE_DATABASE to the exact database name.'
    );
  }
  if (FORBIDDEN_REMOTE_DATABASE_NAMES.includes(approvedDb)) {
    throw new Error(
      `Refusing approved database "${approvedDb}". Dev/test/system names cannot be remote targets.`
    );
  }
  if (FORBIDDEN_REMOTE_DATABASE_NAMES.includes(parsed.database)) {
    throw new Error(
      `Refusing database "${parsed.database}". Dev/test/system names cannot be remote targets.`
    );
  }
  if (parsed.database !== approvedDb) {
    throw new Error(
      `Refusing database "${parsed.database}". Does not match DB_APPROVED_REMOTE_DATABASE.`
    );
  }

  const confirmName = options.confirmEnvName;
  const confirmVal = String(env[confirmName] || '').trim();
  if (!confirmVal) {
    throw new Error(
      `Refusing remote ${options.operation}: set ${confirmName} to the exact approved database name.`
    );
  }
  if (confirmVal !== approvedDb || confirmVal !== parsed.database) {
    throw new Error(
      `Refusing: ${confirmName}="${confirmVal}" must exactly equal DB_APPROVED_REMOTE_DATABASE and the URL database name.`
    );
  }

  if (options.operation === 'migrate') {
    const ack = String(env.DB_REMOTE_MIGRATE_ACK || '').trim();
    if (ack !== REMOTE_MIGRATE_ACK_PHRASE) {
      throw new Error(
        `Refusing remote migrate: set DB_REMOTE_MIGRATE_ACK=${REMOTE_MIGRATE_ACK_PHRASE}`
      );
    }
    const expectedToken = `MIGRATE_REMOTE_${approvedDb}`;
    const token = String(env.DB_REMOTE_MIGRATE_TOKEN || '').trim();
    if (token !== expectedToken) {
      throw new Error(
        `Refusing remote migrate: set DB_REMOTE_MIGRATE_TOKEN=${expectedToken}`
      );
    }
  }

  if (options.operation === 'provision') {
    const ack = String(env.DB_REMOTE_PROVISION_ACK || '').trim();
    if (ack !== REMOTE_PROVISION_ACK_PHRASE) {
      throw new Error(
        `Refusing remote provision: set DB_REMOTE_PROVISION_ACK=${REMOTE_PROVISION_ACK_PHRASE}`
      );
    }
    const expectedToken = `PROVISION_REMOTE_${approvedDb}`;
    const token = String(env.DB_REMOTE_PROVISION_TOKEN || '').trim();
    if (token !== expectedToken) {
      throw new Error(
        `Refusing remote provision: set DB_REMOTE_PROVISION_TOKEN=${expectedToken}`
      );
    }
  }

  const built = buildPgClientConfig(connectionString, {
    requireSsl: true,
    env,
  });

  return {
    connectionString,
    host: parsed.host,
    database: parsed.database,
    sslMode: built.sslMode,
    mode: 'remote',
    operation: options.operation,
    clientConfig: {
      connectionString: built.connectionString,
      ssl: built.ssl,
    },
  };
}

export function assertConfirmEnv(envName, expectedValue) {
  const actual = String(process.env[envName] || '').trim();
  if (actual !== expectedValue) {
    throw new Error(
      `Refusing to proceed: set ${envName}=${expectedValue} in the environment for this command.`
    );
  }
}

export function migrationsDir() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', 'db', 'migrations');
}

export function projectRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

export async function tableExists(client, tableName) {
  const res = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  return res.rowCount > 0;
}

/**
 * Refuse if any business table is missing (schema not migrated) or has rows.
 * Never truncates or deletes.
 */
export async function assertBusinessTablesEmpty(client) {
  const nonEmpty = [];
  const missing = [];
  for (const table of BUSINESS_TABLES) {
    if (!(await tableExists(client, table))) {
      missing.push(table);
      continue;
    }
    const countRes = await client.query(
      `SELECT COUNT(*)::bigint AS n FROM ${table}`
    );
    const n = Number(countRes.rows[0].n);
    if (n > 0) nonEmpty.push({ table, n });
  }
  if (missing.length > 0) {
    throw new Error(
      `Refusing: business table(s) missing [${missing.join(', ')}]. Run db:migrate first.`
    );
  }
  if (nonEmpty.length > 0) {
    const detail = nonEmpty.map((x) => `${x.table}=${x.n}`).join(', ');
    throw new Error(
      `Refusing import: business table(s) already contain rows (${detail}). ` +
        `Importer never truncates or deletes. Empty the development tables manually if appropriate, then retry.`
    );
  }
}

export { BUSINESS_TABLES };
