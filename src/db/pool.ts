/**
 * PostgreSQL connection pool.
 * Never log DATABASE_URL or passwords.
 * TLS: when DATABASE_URL / PGSSLMODE / DB_REMOTE_SSL_MODE requests require|verify-*,
 * the pool enables SSL with rejectUnauthorized=true.
 */
import 'dotenv/config';
import pg from 'pg';
import { buildPgClientConfig, redactDatabaseUrl } from '../../scripts/db-safety.mjs';

const { Pool } = pg;

let pool: pg.Pool | null = null;

/**
 * Lazy singleton pool. Callers must not print connectionString.
 */
export function getPool(): pg.Pool {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || !String(connectionString).trim()) {
    throw new Error(
      'DATABASE_URL is missing. Set it in the local .env file (never commit the password).'
    );
  }
  const built = buildPgClientConfig(connectionString, { requireSsl: false });
  pool = new Pool({
    connectionString: built.connectionString,
    ...(built.ssl ? { ssl: built.ssl } : {}),
  });
  pool.on('error', (err) => {
    console.error('[db:pool] unexpected error on idle client:', err.message);
  });
  return pool;
}

/** Safe summary for diagnostics — never includes password. */
export function getPoolTargetSummary(): string {
  return redactDatabaseUrl(process.env.DATABASE_URL);
}

export async function closePool(): Promise<void> {
  if (!pool) return;
  const p = pool;
  pool = null;
  await p.end();
}
