import { afterEach, describe, expect, it } from 'vitest';
import {
  assertPgAuthTestTarget,
  PG_AUTH_TEST_CONFIRM_ENV,
  PG_AUTH_TEST_DATABASE_URL_ENV,
  PG_AUTH_TEST_DB_NAME,
} from './pgAuthSafety.ts';

/** Synthetic URLs only — no real credentials. */
const VALID_TEST_URL =
  'postgresql://pg_auth_tester:synthetic-pass@127.0.0.1:5432/it_gst_management_test';

function envWith(
  overrides: Record<string, string | undefined>
): NodeJS.ProcessEnv {
  return { ...overrides } as NodeJS.ProcessEnv;
}

describe('assertPgAuthTestTarget', () => {
  afterEach(() => {
    // No global process.env mutation in these tests — they pass env explicitly.
  });

  it('rejects a missing test database URL', () => {
    expect(() =>
      assertPgAuthTestTarget(
        envWith({
          [PG_AUTH_TEST_CONFIRM_ENV]: PG_AUTH_TEST_DB_NAME,
          [PG_AUTH_TEST_DATABASE_URL_ENV]: undefined,
        })
      )
    ).toThrow(/PG_AUTH_TEST_DATABASE_URL is missing/i);
  });

  it('rejects a missing confirmation', () => {
    expect(() =>
      assertPgAuthTestTarget(
        envWith({
          [PG_AUTH_TEST_DATABASE_URL_ENV]: VALID_TEST_URL,
        })
      )
    ).toThrow(/PG_AUTH_TEST_CONFIRM/i);
  });

  it('rejects an incorrect confirmation value', () => {
    expect(() =>
      assertPgAuthTestTarget(
        envWith({
          [PG_AUTH_TEST_CONFIRM_ENV]: 'it_gst_management_dev',
          [PG_AUTH_TEST_DATABASE_URL_ENV]: VALID_TEST_URL,
        })
      )
    ).toThrow(/must be exactly/i);
  });

  it('rejects the development database name', () => {
    expect(() =>
      assertPgAuthTestTarget(
        envWith({
          [PG_AUTH_TEST_CONFIRM_ENV]: PG_AUTH_TEST_DB_NAME,
          [PG_AUTH_TEST_DATABASE_URL_ENV]:
            'postgresql://u:p@127.0.0.1:5432/it_gst_management_dev',
        })
      )
    ).toThrow(/development database/i);
  });

  it('rejects a wrong database name', () => {
    expect(() =>
      assertPgAuthTestTarget(
        envWith({
          [PG_AUTH_TEST_CONFIRM_ENV]: PG_AUTH_TEST_DB_NAME,
          [PG_AUTH_TEST_DATABASE_URL_ENV]:
            'postgresql://u:p@127.0.0.1:5432/some_other_db',
        })
      )
    ).toThrow(/Refusing database "some_other_db"/i);
  });

  it('rejects a remote host', () => {
    expect(() =>
      assertPgAuthTestTarget(
        envWith({
          [PG_AUTH_TEST_CONFIRM_ENV]: PG_AUTH_TEST_DB_NAME,
          [PG_AUTH_TEST_DATABASE_URL_ENV]:
            'postgresql://u:p@db.example.com:5432/it_gst_management_test',
        })
      )
    ).toThrow(/Refusing host/i);
  });

  it('rejects a non-PostgreSQL protocol', () => {
    expect(() =>
      assertPgAuthTestTarget(
        envWith({
          [PG_AUTH_TEST_CONFIRM_ENV]: PG_AUTH_TEST_DB_NAME,
          [PG_AUTH_TEST_DATABASE_URL_ENV]:
            'mysql://u:p@127.0.0.1:3306/it_gst_management_test',
        })
      )
    ).toThrow(/protocol/i);
  });

  it('accepts a correct dedicated test database URL', () => {
    const target = assertPgAuthTestTarget(
      envWith({
        [PG_AUTH_TEST_CONFIRM_ENV]: PG_AUTH_TEST_DB_NAME,
        [PG_AUTH_TEST_DATABASE_URL_ENV]: VALID_TEST_URL,
      })
    );
    expect(target.database).toBe(PG_AUTH_TEST_DB_NAME);
    expect(target.host).toBe('127.0.0.1');
    expect(target.connectionString).toBe(VALID_TEST_URL);
  });

  it('does not fall back to DATABASE_URL', () => {
    expect(() =>
      assertPgAuthTestTarget(
        envWith({
          [PG_AUTH_TEST_CONFIRM_ENV]: PG_AUTH_TEST_DB_NAME,
          DATABASE_URL: VALID_TEST_URL,
          [PG_AUTH_TEST_DATABASE_URL_ENV]: '',
        })
      )
    ).toThrow(/never used as a fallback/i);
  });
});
