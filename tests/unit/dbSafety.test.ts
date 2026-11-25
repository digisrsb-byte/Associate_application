/**
 * Phase 8B.2 — unit tests for local + remote database safety gates.
 * No live production connections. Uses mocked URLs only.
 */
import { describe, expect, it } from 'vitest';
import {
  ALLOWED_MIGRATE_DB_NAMES,
  REMOTE_MIGRATE_ACK_PHRASE,
  assertRemoteDatabaseTarget,
  assertSafeDatabaseTarget,
  buildPgClientConfig,
  parseDatabaseUrl,
  redactDatabaseUrl,
  resolveDbTargetMode,
  resolveSslMode,
} from '../../scripts/db-safety.mjs';

const LOCAL_DEV =
  'postgresql://appuser:s3cret@127.0.0.1:5432/it_gst_management_dev';
const LOCAL_TEST =
  'postgresql://appuser:s3cret@127.0.0.1:5432/it_gst_management_test';
const REMOTE_URL =
  'postgresql://appuser:s3cret@db.example-managed.example:5432/it_gst_management_prod?sslmode=require';

describe('db-safety redact + parse', () => {
  it('redacts passwords from URLs', () => {
    const out = redactDatabaseUrl(LOCAL_DEV);
    expect(out).toContain('appuser:***@');
    expect(out).not.toContain('s3cret');
  });

  it('parses host and database without exposing password in fields', () => {
    const parsed = parseDatabaseUrl(REMOTE_URL);
    expect(parsed.host).toBe('db.example-managed.example');
    expect(parsed.database).toBe('it_gst_management_prod');
    expect(parsed.sslMode).toBe('require');
  });

  it('rejects non-postgres protocols', () => {
    expect(() => parseDatabaseUrl('mysql://localhost/db')).toThrow(/postgresql/i);
  });
});

describe('assertSafeDatabaseTarget (local default)', () => {
  it('allows localhost + allowlisted database', () => {
    const t = assertSafeDatabaseTarget(LOCAL_DEV);
    expect(t.host).toBe('127.0.0.1');
    expect(t.database).toBe('it_gst_management_dev');
    expect(
      (t.clientConfig as { connectionString: string }).connectionString
    ).toBe(LOCAL_DEV);
  });

  it('refuses remote hosts without remote mode', () => {
    expect(() => assertSafeDatabaseTarget(REMOTE_URL)).toThrow(/localhost|127\.0\.0\.1|DB_TARGET_MODE=remote/i);
  });

  it('refuses unexpected local database names', () => {
    expect(() =>
      assertSafeDatabaseTarget(
        'postgresql://u:p@127.0.0.1:5432/it_gst_management_prod'
      )
    ).toThrow(/Refusing database/);
  });

  it('allows test DB when allowlisted', () => {
    const t = assertSafeDatabaseTarget(LOCAL_TEST, {
      allowedDatabases: ['it_gst_management_test'],
    });
    expect(t.database).toBe('it_gst_management_test');
  });
});

describe('remote authorization gates', () => {
  const baseRemoteEnv = {
    DB_TARGET_MODE: 'remote',
    DB_APPROVED_REMOTE_HOST: 'db.example-managed.example',
    DB_APPROVED_REMOTE_DATABASE: 'it_gst_management_prod',
    DB_MIGRATE_CONFIRM: 'it_gst_management_prod',
    DB_REMOTE_MIGRATE_ACK: REMOTE_MIGRATE_ACK_PHRASE,
    DB_REMOTE_MIGRATE_TOKEN: 'MIGRATE_REMOTE_it_gst_management_prod',
    DB_REMOTE_SSL_MODE: '',
  };

  it('resolveDbTargetMode defaults to local', () => {
    expect(resolveDbTargetMode({})).toBe('local');
    expect(resolveDbTargetMode({ DB_TARGET_MODE: 'remote' })).toBe('remote');
    expect(() => resolveDbTargetMode({ DB_TARGET_MODE: 'cloud' })).toThrow(
      /Invalid DB_TARGET_MODE/
    );
  });

  it('authorizes a fully confirmed remote migrate target', () => {
    const t = assertRemoteDatabaseTarget(REMOTE_URL, {
      env: baseRemoteEnv,
      confirmEnvName: 'DB_MIGRATE_CONFIRM',
      operation: 'migrate',
    });
    expect(t.mode).toBe('remote');
    expect(t.database).toBe('it_gst_management_prod');
    expect(t.sslMode).toBe('require');
    expect(t.clientConfig.ssl).toEqual({ rejectUnauthorized: true });
  });

  it('refuses remote migrate without ACK', () => {
    expect(() =>
      assertRemoteDatabaseTarget(REMOTE_URL, {
        env: { ...baseRemoteEnv, DB_REMOTE_MIGRATE_ACK: '' },
        confirmEnvName: 'DB_MIGRATE_CONFIRM',
        operation: 'migrate',
      })
    ).toThrow(/DB_REMOTE_MIGRATE_ACK/);
  });

  it('refuses remote migrate with wrong token', () => {
    expect(() =>
      assertRemoteDatabaseTarget(REMOTE_URL, {
        env: { ...baseRemoteEnv, DB_REMOTE_MIGRATE_TOKEN: 'NOPE' },
        confirmEnvName: 'DB_MIGRATE_CONFIRM',
        operation: 'migrate',
      })
    ).toThrow(/DB_REMOTE_MIGRATE_TOKEN/);
  });

  it('refuses host mismatch', () => {
    expect(() =>
      assertRemoteDatabaseTarget(REMOTE_URL, {
        env: {
          ...baseRemoteEnv,
          DB_APPROVED_REMOTE_HOST: 'other.example.com',
        },
        confirmEnvName: 'DB_MIGRATE_CONFIRM',
        operation: 'migrate',
      })
    ).toThrow(/DB_APPROVED_REMOTE_HOST/);
  });

  it('refuses database identity mismatch', () => {
    expect(() =>
      assertRemoteDatabaseTarget(REMOTE_URL, {
        env: {
          ...baseRemoteEnv,
          DB_APPROVED_REMOTE_DATABASE: 'wrong_db',
          DB_MIGRATE_CONFIRM: 'wrong_db',
          DB_REMOTE_MIGRATE_TOKEN: 'MIGRATE_REMOTE_wrong_db',
        },
        confirmEnvName: 'DB_MIGRATE_CONFIRM',
        operation: 'migrate',
      })
    ).toThrow(/DB_APPROVED_REMOTE_DATABASE/);
  });

  it('refuses forbidden remote names (dev/test)', () => {
    const url =
      'postgresql://u:p@db.example-managed.example:5432/it_gst_management_dev?sslmode=require';
    expect(() =>
      assertRemoteDatabaseTarget(url, {
        env: {
          ...baseRemoteEnv,
          DB_APPROVED_REMOTE_DATABASE: 'it_gst_management_dev',
          DB_MIGRATE_CONFIRM: 'it_gst_management_dev',
          DB_REMOTE_MIGRATE_TOKEN: 'MIGRATE_REMOTE_it_gst_management_dev',
        },
        confirmEnvName: 'DB_MIGRATE_CONFIRM',
        operation: 'migrate',
      })
    ).toThrow(/cannot be remote targets/i);
  });

  it('refuses loopback host in remote mode', () => {
    expect(() =>
      assertRemoteDatabaseTarget(LOCAL_DEV, {
        env: {
          ...baseRemoteEnv,
          DB_APPROVED_REMOTE_HOST: '127.0.0.1',
          DB_APPROVED_REMOTE_DATABASE: 'it_gst_management_prod',
        },
        confirmEnvName: 'DB_MIGRATE_CONFIRM',
        operation: 'migrate',
      })
    ).toThrow(/loopback/i);
  });

  it('refuses when DATABASE_URL equals PG_AUTH_TEST_DATABASE_URL', () => {
    expect(() =>
      assertRemoteDatabaseTarget(REMOTE_URL, {
        env: {
          ...baseRemoteEnv,
          PG_AUTH_TEST_DATABASE_URL: REMOTE_URL,
        },
        confirmEnvName: 'DB_MIGRATE_CONFIRM',
        operation: 'migrate',
      })
    ).toThrow(/PG_AUTH_TEST_DATABASE_URL/);
  });

  it('preflight does not require migrate ACK/token', () => {
    const t = assertRemoteDatabaseTarget(REMOTE_URL, {
      env: {
        DB_TARGET_MODE: 'remote',
        DB_APPROVED_REMOTE_HOST: 'db.example-managed.example',
        DB_APPROVED_REMOTE_DATABASE: 'it_gst_management_prod',
        DB_PREFLIGHT_CONFIRM: 'it_gst_management_prod',
      },
      confirmEnvName: 'DB_PREFLIGHT_CONFIRM',
      operation: 'preflight',
    });
    expect(t.operation).toBe('preflight');
  });

  it('refuses missing SSL for remote', () => {
    const noSsl =
      'postgresql://appuser:s3cret@db.example-managed.example:5432/it_gst_management_prod';
    expect(() =>
      assertRemoteDatabaseTarget(noSsl, {
        env: {
          ...baseRemoteEnv,
          DB_REMOTE_SSL_MODE: '',
        },
        confirmEnvName: 'DB_MIGRATE_CONFIRM',
        operation: 'migrate',
      })
    ).toThrow(/TLS|sslmode/i);
  });

  it('accepts DB_REMOTE_SSL_MODE when URL has no sslmode', () => {
    const noSsl =
      'postgresql://appuser:s3cret@db.example-managed.example:5432/it_gst_management_prod';
    const t = assertRemoteDatabaseTarget(noSsl, {
      env: {
        ...baseRemoteEnv,
        DB_REMOTE_SSL_MODE: 'require',
      },
      confirmEnvName: 'DB_MIGRATE_CONFIRM',
      operation: 'migrate',
    });
    expect(t.sslMode).toBe('require');
  });
});

describe('SSL helpers', () => {
  it('resolveSslMode prefers URL then DB_REMOTE_SSL_MODE then PGSSLMODE', () => {
    expect(
      resolveSslMode('require', { DB_REMOTE_SSL_MODE: 'verify-full' })
    ).toBe('require');
    expect(
      resolveSslMode('', { DB_REMOTE_SSL_MODE: 'verify-ca' })
    ).toBe('verify-ca');
    expect(resolveSslMode('', { PGSSLMODE: 'require' })).toBe('require');
  });

  it('buildPgClientConfig does not require SSL for local by default', () => {
    const cfg = buildPgClientConfig(LOCAL_DEV, { requireSsl: false });
    expect(cfg.ssl).toBeUndefined();
  });

  it('local allowlist constant still includes only known local DBs', () => {
    expect(ALLOWED_MIGRATE_DB_NAMES).toContain('it_gst_management_dev');
    expect(ALLOWED_MIGRATE_DB_NAMES).toContain('it_gst_management_test');
    expect(ALLOWED_MIGRATE_DB_NAMES).not.toContain('it_gst_management_prod');
  });
});
