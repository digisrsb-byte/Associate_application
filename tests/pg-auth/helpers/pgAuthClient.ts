/**
 * Dedicated pool for PostgreSQL auth integration tests.
 * Does not import or mutate the production getPool() singleton.
 * Does not connect at import time — call createPgAuthTestPool() explicitly.
 * Never log connection strings or credentials.
 */
import pg from 'pg';
import { assertPgAuthTestTarget } from './pgAuthSafety.ts';

const { Pool } = pg;

/**
 * Create a pool after safety validation. The Pool constructor does not run queries;
 * callers must not query unless intentionally running a PG integration test.
 */
export function createPgAuthTestPool(
  env: NodeJS.ProcessEnv = process.env
): pg.Pool {
  const { connectionString } = assertPgAuthTestTarget(env);
  return new Pool({ connectionString });
}

/** End the pool and release idle clients. */
export async function closePgAuthTestPool(pool: pg.Pool): Promise<void> {
  await pool.end();
}
