/**
 * Business-data backend selection (Phase 4).
 * Default remains JSON ledger. Postgres requires explicit config and AUTH_BACKEND=postgres.
 * Never logs secrets or connection strings.
 */
import type { ResolvedAuthBackend } from '../auth/authBackend.ts';

export type BusinessDataBackendKind = 'json' | 'postgres';

export type ResolvedBusinessDataBackend = {
  kind: BusinessDataBackendKind;
  organizationId: string | null;
};

/**
 * Resolve BUSINESS_DATA_BACKEND. Does not open a database connection.
 * Fail closed when postgres is selected without auth/org/database config.
 */
export function resolveBusinessDataBackend(
  env: NodeJS.ProcessEnv = process.env,
  authBackend?: ResolvedAuthBackend
): ResolvedBusinessDataBackend {
  const auth = authBackend ?? { kind: 'json' as const, organizationId: null };
  const raw = String(env.BUSINESS_DATA_BACKEND || 'json')
    .trim()
    .toLowerCase();

  if (!raw || raw === 'json') {
    return { kind: 'json', organizationId: null };
  }

  if (raw !== 'postgres' && raw !== 'postgresql') {
    throw new Error(
      `Invalid BUSINESS_DATA_BACKEND="${raw}". Use "json" or "postgres".`
    );
  }

  if (auth.kind !== 'postgres' || !auth.organizationId) {
    throw new Error(
      'BUSINESS_DATA_BACKEND=postgres requires AUTH_BACKEND=postgres and AUTH_ORGANIZATION_ID. Refusing to start.'
    );
  }

  const databaseUrl = String(env.DATABASE_URL || '').trim();
  if (!databaseUrl) {
    throw new Error(
      'BUSINESS_DATA_BACKEND=postgres requires DATABASE_URL. Refusing to start.'
    );
  }

  return {
    kind: 'postgres',
    organizationId: auth.organizationId,
  };
}
