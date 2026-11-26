/**
 * Phase 8B.3 — unit tests for two-owner provisioning (mocked DB client).
 * No production database. Never logs passwords.
 */
import { describe, expect, it, vi } from 'vitest';
import { verifySecret } from '../../authCrypto.ts';
import {
  REMOTE_PROVISION_ACK_PHRASE,
  assertRemoteDatabaseTarget,
} from '../../scripts/db-safety.mjs';
import {
  normalizeEmail,
  provisionTwoOwners,
  provisionTwoOwnersInTransaction,
  validateProvisionEmails,
  validateProvisionPasswords,
} from '../../scripts/provision-two-owners-lib.ts';

const STRONG_A = 'OwnerA-Provision-Pass!99';
const STRONG_B = 'OwnerB-Provision-Pass!99';

describe('provision input validation', () => {
  it('normalizes emails', () => {
    expect(normalizeEmail('  Owner.A@Example.COM ')).toBe('owner.a@example.com');
  });

  it('rejects identical owner emails', () => {
    expect(() =>
      validateProvisionEmails('a@example.com', 'a@example.com')
    ).toThrow(/different/i);
  });

  it('rejects invalid emails', () => {
    expect(() => validateProvisionEmails('not-an-email', 'b@example.com')).toThrow(
      /Owner A email/i
    );
  });

  it('rejects weak passwords via policy', () => {
    expect(() =>
      validateProvisionPasswords(
        { email: 'a@example.com', password: 'short' },
        { email: 'b@example.com', password: STRONG_B }
      )
    ).toThrow(/Owner A password rejected/i);
  });
});

describe('remote provision authorization', () => {
  const remoteUrl =
    'postgresql://u:p@db.example-managed.example:5432/it_gst_management_prod?sslmode=require';

  it('refuses remote provision without ACK/token', () => {
    expect(() =>
      assertRemoteDatabaseTarget(remoteUrl, {
        env: {
          DB_TARGET_MODE: 'remote',
          DB_APPROVED_REMOTE_HOST: 'db.example-managed.example',
          DB_APPROVED_REMOTE_DATABASE: 'it_gst_management_prod',
          DB_PROVISION_CONFIRM: 'it_gst_management_prod',
        },
        confirmEnvName: 'DB_PROVISION_CONFIRM',
        operation: 'provision',
      })
    ).toThrow(/DB_REMOTE_PROVISION_ACK/);
  });

  it('authorizes when provision ACK and token are set', () => {
    const t = assertRemoteDatabaseTarget(remoteUrl, {
      env: {
        DB_TARGET_MODE: 'remote',
        DB_APPROVED_REMOTE_HOST: 'db.example-managed.example',
        DB_APPROVED_REMOTE_DATABASE: 'it_gst_management_prod',
        DB_PROVISION_CONFIRM: 'it_gst_management_prod',
        DB_REMOTE_PROVISION_ACK: REMOTE_PROVISION_ACK_PHRASE,
        DB_REMOTE_PROVISION_TOKEN: 'PROVISION_REMOTE_it_gst_management_prod',
      },
      confirmEnvName: 'DB_PROVISION_CONFIRM',
      operation: 'provision',
    });
    expect(t.operation).toBe('provision');
    expect(t.sslMode).toBe('require');
  });
});

describe('provisionTwoOwners (mock client)', () => {
  it('creates org + two owners with hashed passwords and owner roles', async () => {
    const users: Record<string, unknown>[] = [];
    const members: Record<string, unknown>[] = [];
    let orgId = '';

    const client = {
      query: vi.fn(async (text: string, values?: unknown[]) => {
        if (text.includes('FROM users WHERE LOWER(email)')) {
          return { rowCount: 0, rows: [] };
        }
        if (text.includes('FROM organizations WHERE name')) {
          return { rowCount: 0, rows: [] };
        }
        if (text.startsWith('INSERT INTO organizations')) {
          orgId = '11111111-1111-1111-1111-111111111111';
          return {
            rowCount: 1,
            rows: [{ id: orgId, name: values?.[0] }],
          };
        }
        if (text.startsWith('INSERT INTO users')) {
          const id =
            users.length === 0
              ? 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
              : 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
          users.push({
            id,
            email: values?.[0],
            password_salt: values?.[1],
            password_hash: values?.[2],
          });
          return { rowCount: 1, rows: [{ id }] };
        }
        if (text.startsWith('INSERT INTO organization_members')) {
          members.push({
            organization_id: values?.[0],
            user_id: values?.[1],
            role: 'owner',
          });
          return { rowCount: 1, rows: [] };
        }
        throw new Error(`Unexpected SQL: ${text.slice(0, 80)}`);
      }),
    };

    const result = await provisionTwoOwners(client, {
      organizationName: 'Shared Practice',
      ownerA: { email: 'a@example.com', password: STRONG_A },
      ownerB: { email: 'B@Example.com', password: STRONG_B },
    });

    expect(result.status).toBe('created');
    expect(result.organizationId).toBe(orgId);
    expect(result.ownerA.email).toBe('a@example.com');
    expect(result.ownerB.email).toBe('b@example.com');
    expect(members).toHaveLength(2);
    expect(members.every((m) => m.role === 'owner')).toBe(true);
    expect(members[0].organization_id).toBe(orgId);
    expect(members[1].organization_id).toBe(orgId);

    expect(
      verifySecret(
        STRONG_A,
        String(users[0].password_salt),
        String(users[0].password_hash)
      )
    ).toBe(true);
    expect(
      verifySecret(
        STRONG_B,
        String(users[1].password_salt),
        String(users[1].password_hash)
      )
    ).toBe(true);
    expect(String(users[0].password_hash)).not.toBe(STRONG_A);
  });

  it('is idempotent when both owners already share one org', async () => {
    const client = {
      query: vi.fn(async (text: string, values?: unknown[]) => {
        if (text.includes('FROM users WHERE LOWER(email)')) {
          const email = String(values?.[0]);
          if (email === 'a@example.com') {
            return {
              rowCount: 1,
              rows: [{ id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', email }],
            };
          }
          return {
            rowCount: 1,
            rows: [{ id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', email }],
          };
        }
        if (text.includes('FROM organization_members m')) {
          return {
            rowCount: 1,
            rows: [
              {
                organization_id: '11111111-1111-1111-1111-111111111111',
                name: 'Shared Practice',
              },
            ],
          };
        }
        throw new Error(`Unexpected SQL: ${text.slice(0, 80)}`);
      }),
    };

    const result = await provisionTwoOwners(client, {
      organizationName: 'Shared Practice',
      ownerA: { email: 'a@example.com', password: STRONG_A },
      ownerB: { email: 'b@example.com', password: STRONG_B },
    });
    expect(result.status).toBe('already_provisioned');
    expect(result.organizationId).toBe('11111111-1111-1111-1111-111111111111');
    // No INSERT should have been issued.
    expect(
      client.query.mock.calls.some((c) =>
        String(c[0]).startsWith('INSERT INTO')
      )
    ).toBe(false);
  });

  it('refuses duplicate email / partial existing user', async () => {
    const client = {
      query: vi.fn(async (text: string, values?: unknown[]) => {
        if (text.includes('FROM users WHERE LOWER(email)')) {
          if (String(values?.[0]) === 'a@example.com') {
            return {
              rowCount: 1,
              rows: [
                { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', email: 'a@example.com' },
              ],
            };
          }
          return { rowCount: 0, rows: [] };
        }
        throw new Error(`Unexpected SQL: ${text.slice(0, 80)}`);
      }),
    };

    await expect(
      provisionTwoOwners(client, {
        organizationName: 'Shared Practice',
        ownerA: { email: 'a@example.com', password: STRONG_A },
        ownerB: { email: 'b@example.com', password: STRONG_B },
      })
    ).rejects.toThrow(/Partial account state/i);
  });

  it('rolls back the transaction when a mid-flight insert fails', async () => {
    const ops: string[] = [];
    const client = {
      query: vi.fn(async (text: string) => {
        if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
          ops.push(text);
          return { rowCount: 0, rows: [] };
        }
        throw new Error('boom-after-begin');
      }),
      release: vi.fn(),
    };

    await expect(
      provisionTwoOwnersInTransaction(async () => client, {
        organizationName: 'Shared Practice',
        ownerA: { email: 'a@example.com', password: STRONG_A },
        ownerB: { email: 'b@example.com', password: STRONG_B },
      })
    ).rejects.toThrow(/boom-after-begin/);

    expect(ops).toEqual(['BEGIN', 'ROLLBACK']);
    expect(client.release).toHaveBeenCalled();
  });
});
