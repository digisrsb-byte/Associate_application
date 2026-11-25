/**
 * PostgreSQL password-reset challenge storage (Phase 3A).
 * Isolated from routes and JSON auth — callers inject a pool; this module
 * never imports getPool() (avoids dotenv / accidental connections in tests).
 *
 * Never log raw tokens, passwords, salts, hashes, or connection strings.
 */
import type pg from 'pg';
import { hashSecret, verifySecret } from '../../authCrypto.ts';

/** Matches server.ts RESET_TOKEN_TTL_MS — 15 minutes. */
export const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000;

export type PasswordResetStoreErrorCode =
  | 'user_not_found'
  | 'invalid_challenge';

export class PasswordResetStoreError extends Error {
  readonly code: PasswordResetStoreErrorCode;

  constructor(code: PasswordResetStoreErrorCode, message?: string) {
    super(message || code);
    this.name = 'PasswordResetStoreError';
    this.code = code;
  }
}

/** Minimal client surface used inside a transaction. */
export type DbClient = {
  query: (
    text: string,
    values?: unknown[]
  ) => Promise<pg.QueryResult<Record<string, unknown>>>;
};

/** Pool-like object: connect → transactional client → release. */
export type DbPool = {
  connect: () => Promise<
    DbClient & {
      release: () => void;
    }
  >;
};

export type CreateChallengeResult = {
  challengeId: string;
  expiresAt: Date;
};

async function withTransaction<T>(
  pool: DbPool,
  fn: (client: DbClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    try {
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  } finally {
    client.release();
  }
}

/**
 * Create a single-use reset challenge for one user.
 * Stores only token_salt / token_hash. Supersedes any prior unconsumed challenge.
 * Serializes concurrent creates for the same user via FOR UPDATE on users.
 */
export async function createPasswordResetChallenge(
  pool: DbPool,
  userId: string,
  rawToken: string
): Promise<CreateChallengeResult> {
  if (!userId || typeof userId !== 'string') {
    throw new PasswordResetStoreError('user_not_found');
  }
  if (!rawToken || typeof rawToken !== 'string') {
    throw new PasswordResetStoreError('invalid_challenge');
  }

  const { salt, hash } = hashSecret(rawToken);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

  return withTransaction(pool, async (client) => {
    const locked = await client.query(
      `SELECT id FROM users WHERE id = $1::uuid FOR UPDATE`,
      [userId]
    );
    if (locked.rowCount === 0) {
      throw new PasswordResetStoreError('user_not_found');
    }

    // Supersede previous unconsumed challenge(s) for this user only.
    await client.query(
      `UPDATE password_reset_challenges
       SET consumed_at = NOW()
       WHERE user_id = $1::uuid
         AND consumed_at IS NULL`,
      [userId]
    );

    const inserted = await client.query(
      `INSERT INTO password_reset_challenges (
         user_id, token_salt, token_hash, expires_at
       ) VALUES ($1::uuid, $2, $3, $4::timestamptz)
       RETURNING id, expires_at`,
      [userId, salt, hash, expiresAt.toISOString()]
    );

    const row = inserted.rows[0];
    return {
      challengeId: String(row.id),
      expiresAt: new Date(String(row.expires_at)),
    };
  });
}

export type ConsumeChallengeInput = {
  userId: string;
  rawToken: string;
  newPassword: string;
};

/**
 * Verify and consume a reset challenge: update password, mark consumed,
 * revoke only that user's active sessions — all in one transaction.
 */
export async function consumePasswordResetChallenge(
  pool: DbPool,
  input: ConsumeChallengeInput
): Promise<void> {
  const { userId, rawToken, newPassword } = input;
  if (!userId || typeof userId !== 'string') {
    throw new PasswordResetStoreError('invalid_challenge');
  }
  if (!rawToken || typeof rawToken !== 'string') {
    throw new PasswordResetStoreError('invalid_challenge');
  }
  if (!newPassword || typeof newPassword !== 'string') {
    throw new PasswordResetStoreError('invalid_challenge');
  }

  // Hash before opening the transaction so scrypt work is outside the lock window.
  const nextPassword = hashSecret(newPassword);

  await withTransaction(pool, async (client) => {
    const lockedUser = await client.query(
      `SELECT id FROM users WHERE id = $1::uuid FOR UPDATE`,
      [userId]
    );
    if (lockedUser.rowCount === 0) {
      throw new PasswordResetStoreError('invalid_challenge');
    }

    const challengeRes = await client.query(
      `SELECT id, token_salt, token_hash, expires_at, consumed_at
       FROM password_reset_challenges
       WHERE user_id = $1::uuid
         AND consumed_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [userId]
    );

    if (challengeRes.rowCount === 0) {
      throw new PasswordResetStoreError('invalid_challenge');
    }

    const challenge = challengeRes.rows[0];
    const expiresAt = new Date(String(challenge.expires_at)).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      throw new PasswordResetStoreError('invalid_challenge');
    }

    const tokenOk = verifySecret(
      rawToken,
      String(challenge.token_salt),
      String(challenge.token_hash)
    );
    if (!tokenOk) {
      throw new PasswordResetStoreError('invalid_challenge');
    }

    await client.query(
      `UPDATE users
       SET password_salt = $1,
           password_hash = $2,
           updated_at = NOW()
       WHERE id = $3::uuid`,
      [nextPassword.salt, nextPassword.hash, userId]
    );

    const consumed = await client.query(
      `UPDATE password_reset_challenges
       SET consumed_at = NOW()
       WHERE id = $1::uuid
         AND consumed_at IS NULL`,
      [challenge.id]
    );
    if (consumed.rowCount === 0) {
      throw new PasswordResetStoreError('invalid_challenge');
    }

    // Revoke only this user's active sessions — never other owners.
    await client.query(
      `UPDATE sessions
       SET revoked_at = NOW()
       WHERE user_id = $1::uuid
         AND revoked_at IS NULL`,
      [userId]
    );
  });
}
