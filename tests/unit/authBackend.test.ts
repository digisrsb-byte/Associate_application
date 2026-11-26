import { describe, expect, it } from 'vitest';
import { resolveAuthBackend } from '../../src/auth/authBackend.ts';

describe('resolveAuthBackend', () => {
  it('defaults to json when unset', () => {
    expect(resolveAuthBackend({}).kind).toBe('json');
    expect(resolveAuthBackend({ AUTH_BACKEND: '' }).kind).toBe('json');
    expect(resolveAuthBackend({ AUTH_BACKEND: 'json' }).kind).toBe('json');
  });

  it('rejects unknown backends', () => {
    expect(() => resolveAuthBackend({ AUTH_BACKEND: 'ldap' })).toThrow(
      /Invalid AUTH_BACKEND/
    );
  });

  it('requires DATABASE_URL and AUTH_ORGANIZATION_ID for postgres', () => {
    expect(() =>
      resolveAuthBackend({ AUTH_BACKEND: 'postgres' })
    ).toThrow(/DATABASE_URL/);
    expect(() =>
      resolveAuthBackend({
        AUTH_BACKEND: 'postgres',
        DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/it_gst_management_dev',
      })
    ).toThrow(/AUTH_ORGANIZATION_ID/);
    expect(() =>
      resolveAuthBackend({
        AUTH_BACKEND: 'postgres',
        DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/it_gst_management_dev',
        AUTH_ORGANIZATION_ID: 'not-a-uuid',
      })
    ).toThrow(/UUID/);
  });

  it('accepts postgres with valid organization UUID', () => {
    const orgId = '11111111-1111-4111-8111-111111111111';
    const resolved = resolveAuthBackend({
      AUTH_BACKEND: 'postgres',
      DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/it_gst_management_dev',
      AUTH_ORGANIZATION_ID: orgId,
    });
    expect(resolved.kind).toBe('postgres');
    expect(resolved.organizationId).toBe(orgId);
  });
});
