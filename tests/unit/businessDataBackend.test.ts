import { describe, expect, it } from 'vitest';
import { resolveBusinessDataBackend } from '../../src/business/businessDataBackend.ts';
import type { ResolvedAuthBackend } from '../../src/auth/authBackend.ts';

const ORG = '11111111-1111-4111-8111-111111111111';
const authJson: ResolvedAuthBackend = { kind: 'json', organizationId: null };
const authPg: ResolvedAuthBackend = { kind: 'postgres', organizationId: ORG };

describe('resolveBusinessDataBackend', () => {
  it('defaults to json when unset (JSON behaviour unchanged)', () => {
    expect(resolveBusinessDataBackend({}, authJson).kind).toBe('json');
    expect(resolveBusinessDataBackend({ BUSINESS_DATA_BACKEND: '' }, authJson).kind).toBe(
      'json'
    );
    expect(
      resolveBusinessDataBackend({ BUSINESS_DATA_BACKEND: 'json' }, authJson).kind
    ).toBe('json');
  });

  it('rejects unknown backends', () => {
    expect(() =>
      resolveBusinessDataBackend({ BUSINESS_DATA_BACKEND: 'mysql' }, authJson)
    ).toThrow(/Invalid BUSINESS_DATA_BACKEND/);
  });

  it('fail-closed: postgres requires AUTH_BACKEND=postgres and org', () => {
    expect(() =>
      resolveBusinessDataBackend(
        {
          BUSINESS_DATA_BACKEND: 'postgres',
          DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/it_gst_management_dev',
        },
        authJson
      )
    ).toThrow(/AUTH_BACKEND=postgres/);
  });

  it('fail-closed: postgres requires DATABASE_URL', () => {
    expect(() =>
      resolveBusinessDataBackend({ BUSINESS_DATA_BACKEND: 'postgres' }, authPg)
    ).toThrow(/DATABASE_URL/);
  });

  it('accepts postgres with auth + org + DATABASE_URL', () => {
    const resolved = resolveBusinessDataBackend(
      {
        BUSINESS_DATA_BACKEND: 'postgres',
        DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/it_gst_management_dev',
      },
      authPg
    );
    expect(resolved.kind).toBe('postgres');
    expect(resolved.organizationId).toBe(ORG);
  });

  it('does not fall back to json when postgres is misconfigured', () => {
    expect(() =>
      resolveBusinessDataBackend({ BUSINESS_DATA_BACKEND: 'postgres' }, authJson)
    ).toThrow();
    // Explicit json still works beside a postgres auth config
    expect(
      resolveBusinessDataBackend({ BUSINESS_DATA_BACKEND: 'json' }, authPg).kind
    ).toBe('json');
  });
});
