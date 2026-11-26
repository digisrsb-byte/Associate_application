import { describe, expect, it, vi } from 'vitest';
import {
  findOwnerByEmail,
  userIsOrgOwner,
} from '../../src/db/authUsers.ts';
import type { DbPool } from '../../src/db/passwordResetStore.ts';

function mockPool(rows: Record<string, unknown>[], rowCount?: number): DbPool {
  const release = vi.fn();
  const query = vi.fn(async () => ({
    rowCount: rowCount ?? rows.length,
    rows,
  }));
  return {
    connect: vi.fn(async () => ({ query, release })),
  } as unknown as DbPool;
}

describe('authUsers', () => {
  const org = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  it('findOwnerByEmail returns null for empty email', async () => {
    const pool = mockPool([]);
    await expect(findOwnerByEmail(pool, org, '  ')).resolves.toBeNull();
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('findOwnerByEmail maps owner row and releases client', async () => {
    const release = vi.fn();
    const query = vi.fn(async () => ({
      rowCount: 1,
      rows: [
        {
          id: 'u1',
          email: 'Owner@Example.COM',
          password_salt: 'salt',
          password_hash: 'hash',
        },
      ],
    }));
    const pool = {
      connect: vi.fn(async () => ({ query, release })),
    } as unknown as DbPool;
    const row = await findOwnerByEmail(pool, org, 'owner@example.com');
    expect(row).toEqual({
      id: 'u1',
      email: 'owner@example.com',
      passwordSalt: 'salt',
      passwordHash: 'hash',
    });
    expect(release).toHaveBeenCalled();
  });

  it('findOwnerByEmail returns null when no row', async () => {
    const pool = mockPool([], 0);
    await expect(
      findOwnerByEmail(pool, org, 'missing@example.com')
    ).resolves.toBeNull();
  });

  it('userIsOrgOwner is true only when a membership row exists', async () => {
    const yes = mockPool([{ '?column?': 1 }], 1);
    const no = mockPool([], 0);
    await expect(userIsOrgOwner(yes, org, 'u1')).resolves.toBe(true);
    await expect(userIsOrgOwner(no, org, 'u1')).resolves.toBe(false);
  });
});
