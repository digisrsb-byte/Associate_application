/**
 * Authentication backend selection (Phase 3).
 * Default remains JSON. Postgres requires explicit configuration and fails closed.
 * Never logs secrets or connection strings.
 */

export type AuthBackendKind = 'json' | 'postgres';

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
export const RESET_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ResolvedAuthBackend = {
  kind: AuthBackendKind;
  /** Required when kind === 'postgres' */
  organizationId: string | null;
};

/**
 * Resolve AUTH_BACKEND from env. Does not open a database connection.
 * Throws if postgres is selected without required config.
 */
export function resolveAuthBackend(
  env: NodeJS.ProcessEnv = process.env
): ResolvedAuthBackend {
  const raw = String(env.AUTH_BACKEND || 'json')
    .trim()
    .toLowerCase();

  if (!raw || raw === 'json') {
    return { kind: 'json', organizationId: null };
  }

  if (raw !== 'postgres' && raw !== 'postgresql') {
    throw new Error(
      `Invalid AUTH_BACKEND="${raw}". Use "json" or "postgres".`
    );
  }

  const databaseUrl = String(env.DATABASE_URL || '').trim();
  if (!databaseUrl) {
    throw new Error(
      'AUTH_BACKEND=postgres requires DATABASE_URL. Refusing to start.'
    );
  }

  const organizationId = String(env.AUTH_ORGANIZATION_ID || '').trim();
  if (!organizationId) {
    throw new Error(
      'AUTH_BACKEND=postgres requires AUTH_ORGANIZATION_ID (shared organization UUID). Refusing to start.'
    );
  }
  if (!UUID_RE.test(organizationId)) {
    throw new Error(
      'AUTH_ORGANIZATION_ID must be a valid UUID. Refusing to start.'
    );
  }

  return { kind: 'postgres', organizationId };
}

export function isPostgresAuthBackend(
  backend: ResolvedAuthBackend
): backend is ResolvedAuthBackend & { kind: 'postgres'; organizationId: string } {
  return backend.kind === 'postgres' && !!backend.organizationId;
}
