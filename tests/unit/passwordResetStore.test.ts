import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { hashSecret, verifySecret } from '../../authCrypto.ts';
import {
  createPasswordResetChallenge,
  consumePasswordResetChallenge,
  PasswordResetStoreError,
  PASSWORD_RESET_TTL_MS,
  type DbPool,
} from '../../src/db/passwordResetStore.ts';

type QueryCall = { text: string; values?: unknown[] };

function createMockPool(handler: (call: QueryCall) => {
  rowCount: number;
  rows: Record<string, unknown>[];
}): {
  pool: DbPool;
  calls: QueryCall[];
  release: ReturnType<typeof vi.fn>;
  failNextQueryMatching: (predicate: (text: string) => boolean) => void;
} {
  const calls: QueryCall[] = [];
  let failPredicate: ((text: string) => boolean) | null = null;

  const release = vi.fn();
  const client = {
    query: vi.fn(async (text: string, values?: unknown[]) => {
      const call = { text, values };
      calls.push(call);
      if (failPredicate && failPredicate(text)) {
        failPredicate = null;
        throw new Error('simulated query failure');
      }
      if (/^\s*BEGIN\s*$/i.test(text) || /^\s*COMMIT\s*$/i.test(text) || /^\s*ROLLBACK\s*$/i.test(text)) {
        return { rowCount: 0, rows: [] };
      }
      return handler(call);
    }),
    release,
  };

  const pool: DbPool = {
    connect: async () => client,
  };

  return {
    pool,
    calls,
    release,
    failNextQueryMatching(predicate) {
      failPredicate = predicate;
    },
  };
}

const USER_A = '11111111-1111-1111-1111-111111111111';
const USER_B = '22222222-2222-2222-2222-222222222222';
const CHALLENGE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('passwordResetStore', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('createPasswordResetChallenge stores only salt and hash (never raw token)', async () => {
    const rawToken = 'unit-test-raw-reset-token-value';
    const { pool, calls } = createMockPool((call) => {
      if (call.text.includes('FROM users')) {
        return { rowCount: 1, rows: [{ id: USER_A }] };
      }
      if (call.text.includes('UPDATE password_reset_challenges')) {
        return { rowCount: 1, rows: [] };
      }
      if (call.text.includes('INSERT INTO password_reset_challenges')) {
        return {
          rowCount: 1,
          rows: [{ id: CHALLENGE_ID, expires_at: new Date().toISOString() }],
        };
      }
      return { rowCount: 0, rows: [] };
    });

    const result = await createPasswordResetChallenge(pool, USER_A, rawToken);
    expect(result.challengeId).toBe(CHALLENGE_ID);

    const insert = calls.find((c) =>
      c.text.includes('INSERT INTO password_reset_challenges')
    );
    expect(insert).toBeTruthy();
    const values = insert!.values || [];
    // $1 userId, $2 salt, $3 hash, $4 expires
    expect(values[0]).toBe(USER_A);
    expect(typeof values[1]).toBe('string');
    expect(typeof values[2]).toBe('string');
    expect(values).not.toContain(rawToken);
    expect(JSON.stringify(values)).not.toContain(rawToken);
    expect(verifySecret(rawToken, String(values[1]), String(values[2]))).toBe(
      true
    );

    const began = calls.some((c) => /^\s*BEGIN\s*$/i.test(c.text));
    const committed = calls.some((c) => /^\s*COMMIT\s*$/i.test(c.text));
    expect(began).toBe(true);
    expect(committed).toBe(true);
  });

  it('createPasswordResetChallenge supersedes previous unconsumed challenges for that user', async () => {
    const { pool, calls } = createMockPool((call) => {
      if (call.text.includes('FROM users')) {
        return { rowCount: 1, rows: [{ id: USER_A }] };
      }
      if (
        call.text.includes('UPDATE password_reset_challenges') &&
        call.text.includes('consumed_at IS NULL')
      ) {
        return { rowCount: 1, rows: [] };
      }
      if (call.text.includes('INSERT INTO password_reset_challenges')) {
        return {
          rowCount: 1,
          rows: [{ id: CHALLENGE_ID, expires_at: new Date().toISOString() }],
        };
      }
      return { rowCount: 0, rows: [] };
    });

    await createPasswordResetChallenge(pool, USER_A, 'another-raw-token-aaa');

    const supersede = calls.find(
      (c) =>
        c.text.includes('UPDATE password_reset_challenges') &&
        c.text.includes('consumed_at IS NULL') &&
        !c.text.includes('WHERE id')
    );
    expect(supersede).toBeTruthy();
    expect(supersede!.values?.[0]).toBe(USER_A);
  });

  it('consumePasswordResetChallenge rejects an invalid token without updating password', async () => {
    const good = hashSecret('correct-token-value');
    const { pool, calls } = createMockPool((call) => {
      if (call.text.includes('FROM users')) {
        return { rowCount: 1, rows: [{ id: USER_A }] };
      }
      if (call.text.includes('FROM password_reset_challenges')) {
        return {
          rowCount: 1,
          rows: [
            {
              id: CHALLENGE_ID,
              token_salt: good.salt,
              token_hash: good.hash,
              expires_at: new Date(Date.now() + 60_000).toISOString(),
              consumed_at: null,
            },
          ],
        };
      }
      return { rowCount: 0, rows: [] };
    });

    await expect(
      consumePasswordResetChallenge(pool, {
        userId: USER_A,
        rawToken: 'wrong-token-value',
        newPassword: 'BrandNew-Password!99',
      })
    ).rejects.toMatchObject({ code: 'invalid_challenge' });

    expect(
      calls.some((c) => c.text.includes('UPDATE users') && c.text.includes('password_'))
    ).toBe(false);
    expect(calls.some((c) => /^\s*ROLLBACK\s*$/i.test(c.text))).toBe(true);
  });

  it('consumePasswordResetChallenge rejects an expired challenge', async () => {
    const hashed = hashSecret('expired-token-value');
    const { pool, calls } = createMockPool((call) => {
      if (call.text.includes('FROM users')) {
        return { rowCount: 1, rows: [{ id: USER_A }] };
      }
      if (call.text.includes('FROM password_reset_challenges')) {
        return {
          rowCount: 1,
          rows: [
            {
              id: CHALLENGE_ID,
              token_salt: hashed.salt,
              token_hash: hashed.hash,
              expires_at: new Date(Date.now() - 60_000).toISOString(),
              consumed_at: null,
            },
          ],
        };
      }
      return { rowCount: 0, rows: [] };
    });

    await expect(
      consumePasswordResetChallenge(pool, {
        userId: USER_A,
        rawToken: 'expired-token-value',
        newPassword: 'BrandNew-Password!99',
      })
    ).rejects.toBeInstanceOf(PasswordResetStoreError);

    expect(
      calls.some((c) => c.text.includes('UPDATE users') && c.text.includes('password_'))
    ).toBe(false);
    expect(calls.some((c) => c.text.includes('UPDATE sessions'))).toBe(false);
  });

  it('consumePasswordResetChallenge rejects a missing/replayed (already consumed) challenge', async () => {
    const { pool, calls } = createMockPool((call) => {
      if (call.text.includes('FROM users')) {
        return { rowCount: 1, rows: [{ id: USER_A }] };
      }
      if (call.text.includes('FROM password_reset_challenges')) {
        // Unconsumed lookup returns nothing (already consumed / replay).
        return { rowCount: 0, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    });

    await expect(
      consumePasswordResetChallenge(pool, {
        userId: USER_A,
        rawToken: 'already-used-token',
        newPassword: 'BrandNew-Password!99',
      })
    ).rejects.toMatchObject({ code: 'invalid_challenge' });

    expect(calls.some((c) => c.text.includes('UPDATE sessions'))).toBe(false);
  });

  it('successful consume updates password, marks challenge consumed, revokes only target user sessions', async () => {
    const token = 'valid-consume-token-xyz';
    const hashed = hashSecret(token);
    const { pool, calls } = createMockPool((call) => {
      if (call.text.includes('FROM users') && call.text.includes('FOR UPDATE')) {
        return { rowCount: 1, rows: [{ id: USER_A }] };
      }
      if (call.text.includes('FROM password_reset_challenges')) {
        return {
          rowCount: 1,
          rows: [
            {
              id: CHALLENGE_ID,
              token_salt: hashed.salt,
              token_hash: hashed.hash,
              expires_at: new Date(Date.now() + 120_000).toISOString(),
              consumed_at: null,
            },
          ],
        };
      }
      if (call.text.includes('UPDATE users') && call.text.includes('password_salt')) {
        return { rowCount: 1, rows: [] };
      }
      if (
        call.text.includes('UPDATE password_reset_challenges') &&
        call.text.includes('WHERE id')
      ) {
        return { rowCount: 1, rows: [] };
      }
      if (call.text.includes('UPDATE sessions')) {
        return { rowCount: 2, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    });

    await consumePasswordResetChallenge(pool, {
      userId: USER_A,
      rawToken: token,
      newPassword: 'BrandNew-Password!99',
    });

    const pwdUpdate = calls.find(
      (c) => c.text.includes('UPDATE users') && c.text.includes('password_salt')
    );
    expect(pwdUpdate).toBeTruthy();
    expect(pwdUpdate!.values?.[2]).toBe(USER_A);
    // Stored values are salt/hash strings — not the plaintext password.
    expect(pwdUpdate!.values).not.toContain('BrandNew-Password!99');
    expect(verifySecret(
      'BrandNew-Password!99',
      String(pwdUpdate!.values?.[0]),
      String(pwdUpdate!.values?.[1])
    )).toBe(true);

    const consumeUpdate = calls.find(
      (c) =>
        c.text.includes('UPDATE password_reset_challenges') &&
        c.text.includes('WHERE id')
    );
    expect(consumeUpdate).toBeTruthy();
    expect(consumeUpdate!.values?.[0]).toBe(CHALLENGE_ID);

    const sessionRevoke = calls.find((c) => c.text.includes('UPDATE sessions'));
    expect(sessionRevoke).toBeTruthy();
    expect(sessionRevoke!.text).toMatch(/revoked_at/i);
    expect(sessionRevoke!.text).toMatch(/revoked_at IS NULL/i);
    expect(sessionRevoke!.values?.[0]).toBe(USER_A);
    expect(sessionRevoke!.values).not.toContain(USER_B);

    expect(calls.some((c) => /^\s*COMMIT\s*$/i.test(c.text))).toBe(true);
  });

  it('rolls back the transaction when a mid-consume operation fails', async () => {
    const token = 'rollback-token-value';
    const hashed = hashSecret(token);
    const mock = createMockPool((call) => {
      if (call.text.includes('FROM users')) {
        return { rowCount: 1, rows: [{ id: USER_A }] };
      }
      if (call.text.includes('FROM password_reset_challenges')) {
        return {
          rowCount: 1,
          rows: [
            {
              id: CHALLENGE_ID,
              token_salt: hashed.salt,
              token_hash: hashed.hash,
              expires_at: new Date(Date.now() + 120_000).toISOString(),
              consumed_at: null,
            },
          ],
        };
      }
      if (call.text.includes('UPDATE users') && call.text.includes('password_salt')) {
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    });

    mock.failNextQueryMatching(
      (text) =>
        text.includes('UPDATE password_reset_challenges') && text.includes('WHERE id')
    );

    await expect(
      consumePasswordResetChallenge(mock.pool, {
        userId: USER_A,
        rawToken: token,
        newPassword: 'BrandNew-Password!99',
      })
    ).rejects.toThrow(/simulated query failure/);

    expect(mock.calls.some((c) => /^\s*ROLLBACK\s*$/i.test(c.text))).toBe(true);
    expect(mock.calls.some((c) => /^\s*COMMIT\s*$/i.test(c.text))).toBe(false);
  });

  it('releases the client after a successful transaction', async () => {
    const { pool, release } = createMockPool((call) => {
      if (call.text.includes('FROM users')) {
        return { rowCount: 1, rows: [{ id: USER_A }] };
      }
      if (call.text.includes('UPDATE password_reset_challenges')) {
        return { rowCount: 0, rows: [] };
      }
      if (call.text.includes('INSERT INTO password_reset_challenges')) {
        return {
          rowCount: 1,
          rows: [{ id: CHALLENGE_ID, expires_at: new Date().toISOString() }],
        };
      }
      return { rowCount: 0, rows: [] };
    });

    await createPasswordResetChallenge(pool, USER_A, 'release-success-token');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('releases the client after a transaction rollback', async () => {
    const good = hashSecret('correct-token-for-release');
    const { pool, release, calls } = createMockPool((call) => {
      if (call.text.includes('FROM users')) {
        return { rowCount: 1, rows: [{ id: USER_A }] };
      }
      if (call.text.includes('FROM password_reset_challenges')) {
        return {
          rowCount: 1,
          rows: [
            {
              id: CHALLENGE_ID,
              token_salt: good.salt,
              token_hash: good.hash,
              expires_at: new Date(Date.now() + 60_000).toISOString(),
              consumed_at: null,
            },
          ],
        };
      }
      return { rowCount: 0, rows: [] };
    });

    await expect(
      consumePasswordResetChallenge(pool, {
        userId: USER_A,
        rawToken: 'wrong-token-for-release',
        newPassword: 'BrandNew-Password!99',
      })
    ).rejects.toMatchObject({ code: 'invalid_challenge' });

    expect(calls.some((c) => /^\s*ROLLBACK\s*$/i.test(c.text))).toBe(true);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('createPasswordResetChallenge returns user_not_found for a nonexistent user and rolls back', async () => {
    const { pool, calls, release } = createMockPool((call) => {
      if (call.text.includes('FROM users')) {
        return { rowCount: 0, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    });

    await expect(
      createPasswordResetChallenge(pool, USER_A, 'token-for-missing-user')
    ).rejects.toMatchObject({ code: 'user_not_found' });

    expect(
      calls.some((c) => c.text.includes('INSERT INTO password_reset_challenges'))
    ).toBe(false);
    expect(calls.some((c) => /^\s*ROLLBACK\s*$/i.test(c.text))).toBe(true);
    expect(calls.some((c) => /^\s*COMMIT\s*$/i.test(c.text))).toBe(false);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('create-path SQL failure triggers ROLLBACK, does not COMMIT, and releases the client', async () => {
    const mock = createMockPool((call) => {
      if (call.text.includes('FROM users')) {
        return { rowCount: 1, rows: [{ id: USER_A }] };
      }
      if (call.text.includes('UPDATE password_reset_challenges')) {
        return { rowCount: 0, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    });

    mock.failNextQueryMatching((text) =>
      text.includes('INSERT INTO password_reset_challenges')
    );

    await expect(
      createPasswordResetChallenge(mock.pool, USER_A, 'token-create-fail')
    ).rejects.toThrow(/simulated query failure/);

    expect(mock.calls.some((c) => /^\s*ROLLBACK\s*$/i.test(c.text))).toBe(true);
    expect(mock.calls.some((c) => /^\s*COMMIT\s*$/i.test(c.text))).toBe(false);
    expect(mock.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back and skips session revoke when challenge consume updates zero rows', async () => {
    const token = 'zero-row-consume-token';
    const hashed = hashSecret(token);
    const { pool, calls, release } = createMockPool((call) => {
      if (call.text.includes('FROM users')) {
        return { rowCount: 1, rows: [{ id: USER_A }] };
      }
      if (call.text.includes('FROM password_reset_challenges')) {
        return {
          rowCount: 1,
          rows: [
            {
              id: CHALLENGE_ID,
              token_salt: hashed.salt,
              token_hash: hashed.hash,
              expires_at: new Date(Date.now() + 120_000).toISOString(),
              consumed_at: null,
            },
          ],
        };
      }
      if (call.text.includes('UPDATE users') && call.text.includes('password_salt')) {
        return { rowCount: 1, rows: [] };
      }
      if (
        call.text.includes('UPDATE password_reset_challenges') &&
        call.text.includes('WHERE id')
      ) {
        return { rowCount: 0, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    });

    await expect(
      consumePasswordResetChallenge(pool, {
        userId: USER_A,
        rawToken: token,
        newPassword: 'BrandNew-Password!99',
      })
    ).rejects.toMatchObject({ code: 'invalid_challenge' });

    expect(calls.some((c) => c.text.includes('UPDATE sessions'))).toBe(false);
    expect(calls.some((c) => /^\s*ROLLBACK\s*$/i.test(c.text))).toBe(true);
    expect(calls.some((c) => /^\s*COMMIT\s*$/i.test(c.text))).toBe(false);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('expired challenge does not update password or revoke sessions', async () => {
    const hashed = hashSecret('expired-no-side-effects');
    const { pool, calls, release } = createMockPool((call) => {
      if (call.text.includes('FROM users')) {
        return { rowCount: 1, rows: [{ id: USER_A }] };
      }
      if (call.text.includes('FROM password_reset_challenges')) {
        return {
          rowCount: 1,
          rows: [
            {
              id: CHALLENGE_ID,
              token_salt: hashed.salt,
              token_hash: hashed.hash,
              expires_at: new Date(Date.now() - 1).toISOString(),
              consumed_at: null,
            },
          ],
        };
      }
      return { rowCount: 0, rows: [] };
    });

    await expect(
      consumePasswordResetChallenge(pool, {
        userId: USER_A,
        rawToken: 'expired-no-side-effects',
        newPassword: 'BrandNew-Password!99',
      })
    ).rejects.toMatchObject({ code: 'invalid_challenge' });

    expect(
      calls.some((c) => c.text.includes('UPDATE users') && c.text.includes('password_'))
    ).toBe(false);
    expect(calls.some((c) => c.text.includes('UPDATE sessions'))).toBe(false);
    expect(calls.some((c) => /^\s*ROLLBACK\s*$/i.test(c.text))).toBe(true);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('challenge expiry uses PASSWORD_RESET_TTL_MS (15 minutes)', async () => {
    expect(PASSWORD_RESET_TTL_MS).toBe(15 * 60 * 1000);

    const fixedNow = new Date('2026-01-15T12:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);

    const { pool, calls } = createMockPool((call) => {
      if (call.text.includes('FROM users')) {
        return { rowCount: 1, rows: [{ id: USER_A }] };
      }
      if (call.text.includes('UPDATE password_reset_challenges')) {
        return { rowCount: 0, rows: [] };
      }
      if (call.text.includes('INSERT INTO password_reset_challenges')) {
        const expiresIso = String(call.values?.[3] || '');
        return {
          rowCount: 1,
          rows: [{ id: CHALLENGE_ID, expires_at: expiresIso }],
        };
      }
      return { rowCount: 0, rows: [] };
    });

    const result = await createPasswordResetChallenge(
      pool,
      USER_A,
      'ttl-check-token'
    );

    const insert = calls.find((c) =>
      c.text.includes('INSERT INTO password_reset_challenges')
    );
    expect(insert).toBeTruthy();
    const expiresParam = String(insert!.values?.[3]);
    const expected = new Date(fixedNow.getTime() + PASSWORD_RESET_TTL_MS);
    expect(expiresParam).toBe(expected.toISOString());
    expect(result.expiresAt.toISOString()).toBe(expected.toISOString());
  });
});
