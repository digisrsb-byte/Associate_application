import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  createPgSession,
  getPgSessionByRawToken,
  revokePgSessionByRawToken,
} from '../../src/db/sessionStore.ts';
import type { DbPool } from '../../src/db/passwordResetStore.ts';

describe('sessionStore', () => {
  const org = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  let release: ReturnType<typeof vi.fn>;
  let query: ReturnType<typeof vi.fn>;
  let pool: DbPool;

  beforeEach(() => {
    release = vi.fn();
    query = vi.fn();
    pool = {
      connect: vi.fn(async () => ({ query, release })),
    } as unknown as DbPool;
  });

  it('createPgSession inserts hashed token and returns raw token once', async () => {
    const expires = new Date('2030-01-01T00:00:00.000Z');
    query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ id: 'sess-1', expires_at: expires.toISOString() }],
    });
    const created = await createPgSession(pool, 'user-1', 'a@b.com', 60_000);
    expect(created.sessionId).toBe('sess-1');
    expect(created.userId).toBe('user-1');
    expect(created.email).toBe('a@b.com');
    expect(created.rawToken.length).toBeGreaterThan(20);
    expect(query.mock.calls[0][1][1]).not.toBe(created.rawToken);
    expect(release).toHaveBeenCalled();
  });

  it('getPgSessionByRawToken returns null for empty token', async () => {
    await expect(getPgSessionByRawToken(pool, org, '')).resolves.toBeNull();
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('getPgSessionByRawToken maps an active session row', async () => {
    query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: 'sess-2',
          user_id: 'user-2',
          email: 'Owner@X.COM',
          expires_at: '2030-06-01T00:00:00.000Z',
        },
      ],
    });
    const session = await getPgSessionByRawToken(pool, org, 'raw-token-value');
    expect(session).toEqual({
      sessionId: 'sess-2',
      userId: 'user-2',
      email: 'owner@x.com',
      expiresAt: new Date('2030-06-01T00:00:00.000Z'),
    });
    expect(release).toHaveBeenCalled();
  });

  it('getPgSessionByRawToken returns null when no row', async () => {
    query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await expect(
      getPgSessionByRawToken(pool, org, 'missing')
    ).resolves.toBeNull();
  });

  it('revokePgSessionByRawToken no-ops on empty and updates otherwise', async () => {
    await revokePgSessionByRawToken(pool, null);
    expect(pool.connect).not.toHaveBeenCalled();
    query.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    await revokePgSessionByRawToken(pool, 'tok');
    expect(query).toHaveBeenCalled();
    expect(release).toHaveBeenCalled();
  });
});
