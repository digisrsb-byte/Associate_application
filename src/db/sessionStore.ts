/**
 * PostgreSQL session persistence (Phase 3).
 * Stores only SHA-256 token hashes — never raw session tokens.
 * Never log tokens or hashes.
 */
import type { DbPool } from './passwordResetStore.ts';
import { SESSION_TTL_MS } from '../auth/authBackend.ts';
import {
  generateSessionToken,
  hashSessionToken,
} from './sessionToken.ts';

export type PgSession = {
  sessionId: string;
  userId: string;
  email: string;
  expiresAt: Date;
};

export type CreatedSession = {
  rawToken: string;
  expiresAt: Date;
  sessionId: string;
  userId: string;
  email: string;
};

/**
 * Create a session for an authenticated owner. Returns the raw token once
 * (for Set-Cookie only) — it is never stored.
 */
export async function createPgSession(
  pool: DbPool,
  userId: string,
  email: string,
  ttlMs: number = SESSION_TTL_MS
): Promise<CreatedSession> {
  const rawToken = generateSessionToken();
  const tokenHash = hashSessionToken(rawToken);
  const expiresAt = new Date(Date.now() + ttlMs);

  const client = await pool.connect();
  try {
    const res = await client.query(
      `INSERT INTO sessions (user_id, token_hash, expires_at)
       VALUES ($1::uuid, $2, $3::timestamptz)
       RETURNING id, expires_at`,
      [userId, tokenHash, expiresAt.toISOString()]
    );
    const row = res.rows[0];
    return {
      rawToken,
      expiresAt: new Date(String(row.expires_at)),
      sessionId: String(row.id),
      userId,
      email: String(email).trim().toLowerCase(),
    };
  } finally {
    client.release();
  }
}

/**
 * Resolve a presented raw session token to an active, non-revoked session
 * whose user is still an owner of the organization.
 */
export async function getPgSessionByRawToken(
  pool: DbPool,
  organizationId: string,
  rawToken: string
): Promise<PgSession | null> {
  if (!rawToken) return null;
  const tokenHash = hashSessionToken(rawToken);
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT s.id, s.user_id, s.expires_at, u.email
       FROM sessions s
       INNER JOIN users u ON u.id = s.user_id
       INNER JOIN organization_members m
         ON m.user_id = s.user_id
        AND m.organization_id = $1::uuid
        AND m.role = 'owner'
       WHERE s.token_hash = $2
         AND s.revoked_at IS NULL
         AND s.expires_at > NOW()
       LIMIT 1`,
      [organizationId, tokenHash]
    );
    if (!res.rowCount) return null;
    const row = res.rows[0];
    return {
      sessionId: String(row.id),
      userId: String(row.user_id),
      email: String(row.email).trim().toLowerCase(),
      expiresAt: new Date(String(row.expires_at)),
    };
  } finally {
    client.release();
  }
}

/** Revoke a single session by raw token (logout). Other users unaffected. */
export async function revokePgSessionByRawToken(
  pool: DbPool,
  rawToken: string | null | undefined
): Promise<void> {
  if (!rawToken) return;
  const tokenHash = hashSessionToken(rawToken);
  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE sessions
       SET revoked_at = NOW()
       WHERE token_hash = $1
         AND revoked_at IS NULL`,
      [tokenHash]
    );
  } finally {
    client.release();
  }
}
