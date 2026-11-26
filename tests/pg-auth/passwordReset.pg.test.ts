/**
 * PostgreSQL integration tests for password-reset store + dual-owner isolation.
 *
 * Requires:
 *   PG_AUTH_TEST_CONFIRM=it_gst_management_test
 *   PG_AUTH_TEST_DATABASE_URL → it_gst_management_test (loopback)
 *   Migrations 001 + 002 applied.
 * Never uses DATABASE_URL.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { verifySecret } from '../../authCrypto.ts';
import {
  createPasswordResetChallenge,
  consumePasswordResetChallenge,
  PasswordResetStoreError,
} from '../../src/db/passwordResetStore.ts';
import {
  createPgSession,
  getPgSessionByRawToken,
} from '../../src/db/sessionStore.ts';
import { assertPgAuthTestTarget } from './helpers/pgAuthSafety.ts';
import {
  closePgAuthTestPool,
  createPgAuthTestPool,
} from './helpers/pgAuthClient.ts';
import {
  cleanupTwoOwnerOrganization,
  seedTwoOwnerOrganization,
  type PgAuthTwoOwnerFixture,
} from './helpers/pgAuthFixtures.ts';
import type pg from 'pg';

const canRun = (() => {
  try {
    assertPgAuthTestTarget(process.env);
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!canRun)('pg-auth password reset (real test DB)', () => {
  let pool: pg.Pool;
  let fixture: PgAuthTwoOwnerFixture;

  beforeAll(async () => {
    pool = createPgAuthTestPool();
    fixture = await seedTwoOwnerOrganization(pool);
  });

  afterAll(async () => {
    if (fixture && pool) {
      await cleanupTwoOwnerOrganization(pool, fixture);
    }
    if (pool) await closePgAuthTestPool(pool);
  });

  it('stores only token salt/hash — never the raw token', async () => {
    const rawToken = 'pg-auth-hash-only-token-001';
    await createPasswordResetChallenge(pool, fixture.ownerA.id, rawToken);

    const client = await pool.connect();
    try {
      const res = await client.query(
        `SELECT token_salt, token_hash, expires_at, consumed_at
         FROM password_reset_challenges
         WHERE user_id = $1::uuid AND consumed_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1`,
        [fixture.ownerA.id]
      );
      expect(res.rowCount).toBe(1);
      const row = res.rows[0];
      expect(String(row.token_salt).length).toBeGreaterThan(0);
      expect(String(row.token_hash).length).toBeGreaterThan(0);
      expect(JSON.stringify(row)).not.toContain(rawToken);
      expect(
        verifySecret(rawToken, String(row.token_salt), String(row.token_hash))
      ).toBe(true);
    } finally {
      client.release();
    }
  });

  it('supersedes previous unconsumed challenges for the same user', async () => {
    const first = 'pg-auth-supersede-token-old';
    const second = 'pg-auth-supersede-token-new';
    await createPasswordResetChallenge(pool, fixture.ownerA.id, first);
    await createPasswordResetChallenge(pool, fixture.ownerA.id, second);

    const client = await pool.connect();
    try {
      const active = await client.query(
        `SELECT token_salt, token_hash
         FROM password_reset_challenges
         WHERE user_id = $1::uuid AND consumed_at IS NULL`,
        [fixture.ownerA.id]
      );
      expect(active.rowCount).toBe(1);
      expect(
        verifySecret(
          second,
          String(active.rows[0].token_salt),
          String(active.rows[0].token_hash)
        )
      ).toBe(true);
      expect(
        verifySecret(
          first,
          String(active.rows[0].token_salt),
          String(active.rows[0].token_hash)
        )
      ).toBe(false);

      const consumed = await client.query(
        `SELECT COUNT(*)::int AS n
         FROM password_reset_challenges
         WHERE user_id = $1::uuid AND consumed_at IS NOT NULL`,
        [fixture.ownerA.id]
      );
      expect(Number(consumed.rows[0].n)).toBeGreaterThanOrEqual(1);
    } finally {
      client.release();
    }
  });

  it('rejects an expired challenge without changing password or sessions', async () => {
    const rawToken = 'pg-auth-expired-token-001';
    await createPasswordResetChallenge(pool, fixture.ownerB.id, rawToken);

    const sessionB = await createPgSession(
      pool,
      fixture.ownerB.id,
      fixture.ownerB.email
    );

    const client = await pool.connect();
    try {
      await client.query(
        `UPDATE password_reset_challenges
         SET expires_at = NOW() - INTERVAL '1 minute'
         WHERE user_id = $1::uuid AND consumed_at IS NULL`,
        [fixture.ownerB.id]
      );
      const before = await client.query(
        `SELECT password_hash FROM users WHERE id = $1::uuid`,
        [fixture.ownerB.id]
      );
      const hashBefore = String(before.rows[0].password_hash);

      await expect(
        consumePasswordResetChallenge(pool, {
          userId: fixture.ownerB.id,
          rawToken,
          newPassword: 'PgAuth-Should-Not-Apply!99',
        })
      ).rejects.toBeInstanceOf(PasswordResetStoreError);

      const after = await client.query(
        `SELECT password_hash FROM users WHERE id = $1::uuid`,
        [fixture.ownerB.id]
      );
      expect(String(after.rows[0].password_hash)).toBe(hashBefore);
    } finally {
      client.release();
    }

    const stillB = await getPgSessionByRawToken(
      pool,
      fixture.organizationId,
      sessionB.rawToken
    );
    expect(stillB).not.toBeNull();
  });

  it('resets owner A password and revokes only A sessions (B remains)', async () => {
    const sessionA = await createPgSession(
      pool,
      fixture.ownerA.id,
      fixture.ownerA.email
    );
    const sessionB = await createPgSession(
      pool,
      fixture.ownerB.id,
      fixture.ownerB.email
    );

    const rawToken = 'pg-auth-isolation-reset-token-aaa';
    await createPasswordResetChallenge(pool, fixture.ownerA.id, rawToken);
    await consumePasswordResetChallenge(pool, {
      userId: fixture.ownerA.id,
      rawToken,
      newPassword: 'PgAuth-OwnerA-NewPass!99',
    });

    const stillA = await getPgSessionByRawToken(
      pool,
      fixture.organizationId,
      sessionA.rawToken
    );
    const stillB = await getPgSessionByRawToken(
      pool,
      fixture.organizationId,
      sessionB.rawToken
    );
    expect(stillA).toBeNull();
    expect(stillB).not.toBeNull();
    expect(stillB?.email).toBe(fixture.ownerB.email);
  });

  it('rejects replayed reset tokens', async () => {
    const rawToken = 'pg-auth-replay-token-bbb';
    await createPasswordResetChallenge(pool, fixture.ownerB.id, rawToken);
    await consumePasswordResetChallenge(pool, {
      userId: fixture.ownerB.id,
      rawToken,
      newPassword: 'PgAuth-OwnerB-NewPass!99',
    });
    await expect(
      consumePasswordResetChallenge(pool, {
        userId: fixture.ownerB.id,
        rawToken,
        newPassword: 'PgAuth-OwnerB-Replay!99',
      })
    ).rejects.toBeInstanceOf(PasswordResetStoreError);
  });

  it('serializes concurrent challenge creation for one user', async () => {
    const results = await Promise.all([
      createPasswordResetChallenge(
        pool,
        fixture.ownerA.id,
        'concurrent-create-token-1'
      ),
      createPasswordResetChallenge(
        pool,
        fixture.ownerA.id,
        'concurrent-create-token-2'
      ),
    ]);
    expect(results).toHaveLength(2);
    const client = await pool.connect();
    try {
      const active = await client.query(
        `SELECT COUNT(*)::int AS n
         FROM password_reset_challenges
         WHERE user_id = $1::uuid AND consumed_at IS NULL`,
        [fixture.ownerA.id]
      );
      expect(Number(active.rows[0].n)).toBe(1);
    } finally {
      client.release();
    }
  });

  it('allows only one winner for concurrent consumption of the same token', async () => {
    const rawToken = 'pg-auth-concurrent-consume-token';
    await createPasswordResetChallenge(pool, fixture.ownerA.id, rawToken);

    const outcomes = await Promise.allSettled([
      consumePasswordResetChallenge(pool, {
        userId: fixture.ownerA.id,
        rawToken,
        newPassword: 'PgAuth-Concurrent-Win-A!99',
      }),
      consumePasswordResetChallenge(pool, {
        userId: fixture.ownerA.id,
        rawToken,
        newPassword: 'PgAuth-Concurrent-Win-B!99',
      }),
    ]);

    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
    const rejected = outcomes.filter((o) => o.status === 'rejected');
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect(rejected[0].status).toBe('rejected');
    if (rejected[0].status === 'rejected') {
      expect(rejected[0].reason).toBeInstanceOf(PasswordResetStoreError);
    }

    const client = await pool.connect();
    try {
      const active = await client.query(
        `SELECT COUNT(*)::int AS n
         FROM password_reset_challenges
         WHERE user_id = $1::uuid AND consumed_at IS NULL`,
        [fixture.ownerA.id]
      );
      expect(Number(active.rows[0].n)).toBe(0);
    } finally {
      client.release();
    }
  });

  it('does not change password when consume fails (missing challenge / no partial update)', async () => {
    const rawToken = 'pg-auth-atomic-rollback-token';
    await createPasswordResetChallenge(pool, fixture.ownerB.id, rawToken);

    const client = await pool.connect();
    let hashBefore = '';
    try {
      const before = await client.query(
        `SELECT password_hash FROM users WHERE id = $1::uuid`,
        [fixture.ownerB.id]
      );
      hashBefore = String(before.rows[0].password_hash);

      // Remove challenge before consume — failed consume must not alter password.
      await client.query(
        `DELETE FROM password_reset_challenges
         WHERE user_id = $1::uuid AND consumed_at IS NULL`,
        [fixture.ownerB.id]
      );
    } finally {
      client.release();
    }

    await expect(
      consumePasswordResetChallenge(pool, {
        userId: fixture.ownerB.id,
        rawToken,
        newPassword: 'PgAuth-Atomic-Should-Rollback!99',
      })
    ).rejects.toBeInstanceOf(PasswordResetStoreError);

    const client2 = await pool.connect();
    try {
      const after = await client2.query(
        `SELECT password_hash FROM users WHERE id = $1::uuid`,
        [fixture.ownerB.id]
      );
      expect(String(after.rows[0].password_hash)).toBe(hashBefore);
    } finally {
      client2.release();
    }
  });
});
