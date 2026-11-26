/**
 * Phase 8B.2 — unit tests for local + remote database safety gates.
 * No live production connections. Uses mocked URLs only.
 */
import { describe, expect, it } from 'vitest';
import {
  ALLOWED_IMPORT_VERIFY_DB_NAMES,
  ALLOWED_MIGRATE_DB_NAMES,
  ALLOWED_REAL_REHEARSAL_DB_NAME,
  ALLOWED_TEST_DB_NAME,
  BUSINESS_TABLES,
  FORBIDDEN_REMOTE_DATABASE_NAMES,
  REMOTE_MIGRATE_ACK_PHRASE,
  assertBusinessTablesEmpty,
  assertConfirmEnvOneOf,
  assertRemoteDatabaseTarget,
  assertSafeDatabaseTarget,
  buildPgClientConfig,
  parseDatabaseUrl,
  redactDatabaseUrl,
  resolveDbTargetMode,
  resolveImportVerifyTarget,
  resolveSslMode,
  usesPgAuthTestDatabaseUrl,
} from '../../scripts/db-safety.mjs';
import {
  liveLedgerPath,
  resolveLedgerSourcePath,
} from '../../scripts/ledger-pg-shared.mjs';

const LOCAL_DEV =
  'postgresql://appuser:s3cret@127.0.0.1:5432/it_gst_management_dev';
const LOCAL_TEST =
  'postgresql://appuser:s3cret@127.0.0.1:5432/it_gst_management_test';
const LOCAL_REAL_REHEARSAL =
  'postgresql://appuser:s3cret@127.0.0.1:5432/it_gst_management_real_rehearsal';
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

describe('import/verify database isolation (Phase 2D / 2J)', () => {
  it('allowlists dev, test, and real_rehearsal for import/verify', () => {
    expect([...ALLOWED_IMPORT_VERIFY_DB_NAMES]).toEqual([
      'it_gst_management_dev',
      'it_gst_management_test',
      'it_gst_management_real_rehearsal',
    ]);
    expect(ALLOWED_MIGRATE_DB_NAMES).toContain(ALLOWED_TEST_DB_NAME);
    expect(ALLOWED_MIGRATE_DB_NAMES).toContain(ALLOWED_REAL_REHEARSAL_DB_NAME);
    expect(FORBIDDEN_REMOTE_DATABASE_NAMES).toContain(
      ALLOWED_REAL_REHEARSAL_DB_NAME
    );
    expect(usesPgAuthTestDatabaseUrl(ALLOWED_TEST_DB_NAME)).toBe(true);
    expect(usesPgAuthTestDatabaseUrl(ALLOWED_REAL_REHEARSAL_DB_NAME)).toBe(
      true
    );
    expect(usesPgAuthTestDatabaseUrl('it_gst_management_dev')).toBe(false);
  });

  it('assertConfirmEnvOneOf accepts allowlisted names and refuses others', () => {
    const prev = process.env.DB_IMPORT_CONFIRM;
    try {
      process.env.DB_IMPORT_CONFIRM = 'it_gst_management_test';
      expect(
        assertConfirmEnvOneOf('DB_IMPORT_CONFIRM', ALLOWED_IMPORT_VERIFY_DB_NAMES)
      ).toBe('it_gst_management_test');
      process.env.DB_IMPORT_CONFIRM = ALLOWED_REAL_REHEARSAL_DB_NAME;
      expect(
        assertConfirmEnvOneOf('DB_IMPORT_CONFIRM', ALLOWED_IMPORT_VERIFY_DB_NAMES)
      ).toBe(ALLOWED_REAL_REHEARSAL_DB_NAME);
      process.env.DB_IMPORT_CONFIRM = 'it_gst_management_prod';
      expect(() =>
        assertConfirmEnvOneOf('DB_IMPORT_CONFIRM', ALLOWED_IMPORT_VERIFY_DB_NAMES)
      ).toThrow(/one of/);
      process.env.DB_IMPORT_CONFIRM = 'unknown_db';
      expect(() =>
        assertConfirmEnvOneOf('DB_IMPORT_CONFIRM', ALLOWED_IMPORT_VERIFY_DB_NAMES)
      ).toThrow(/one of/);
    } finally {
      if (prev === undefined) delete process.env.DB_IMPORT_CONFIRM;
      else process.env.DB_IMPORT_CONFIRM = prev;
    }
  });

  it('resolveImportVerifyTarget allows test via PG_AUTH_TEST_DATABASE_URL', () => {
    const t = resolveImportVerifyTarget('DB_IMPORT_CONFIRM', {
      DB_IMPORT_CONFIRM: 'it_gst_management_test',
      PG_AUTH_TEST_DATABASE_URL: LOCAL_TEST,
    } as NodeJS.ProcessEnv);
    expect(t.database).toBe('it_gst_management_test');
    expect(t.confirm).toBe('it_gst_management_test');
    expect(t.mode).toBe('test');
  });

  it('resolveImportVerifyTarget allows real_rehearsal via PG_AUTH_TEST_DATABASE_URL', () => {
    const t = resolveImportVerifyTarget('DB_IMPORT_CONFIRM', {
      DB_IMPORT_CONFIRM: ALLOWED_REAL_REHEARSAL_DB_NAME,
      PG_AUTH_TEST_DATABASE_URL: LOCAL_REAL_REHEARSAL,
      DATABASE_URL: LOCAL_DEV,
    } as NodeJS.ProcessEnv);
    expect(t.database).toBe(ALLOWED_REAL_REHEARSAL_DB_NAME);
    expect(t.confirm).toBe(ALLOWED_REAL_REHEARSAL_DB_NAME);
    expect(t.mode).toBe('real_rehearsal');
  });

  it('resolveImportVerifyTarget allows dev via DATABASE_URL', () => {
    const t = resolveImportVerifyTarget('DB_VERIFY_CONFIRM', {
      DB_VERIFY_CONFIRM: 'it_gst_management_dev',
      DATABASE_URL: LOCAL_DEV,
    } as NodeJS.ProcessEnv);
    expect(t.database).toBe('it_gst_management_dev');
    expect(t.mode).toBe('dev');
  });

  it('dev confirm is not accepted as a test/rehearsal PG_AUTH_TEST target', () => {
    expect(() =>
      resolveImportVerifyTarget('DB_IMPORT_CONFIRM', {
        DB_IMPORT_CONFIRM: ALLOWED_REAL_REHEARSAL_DB_NAME,
        PG_AUTH_TEST_DATABASE_URL: LOCAL_DEV,
      } as NodeJS.ProcessEnv)
    ).toThrow(/Refusing database/);
    expect(() =>
      resolveImportVerifyTarget('DB_IMPORT_CONFIRM', {
        DB_IMPORT_CONFIRM: 'it_gst_management_test',
        PG_AUTH_TEST_DATABASE_URL: LOCAL_DEV,
      } as NodeJS.ProcessEnv)
    ).toThrow(/Refusing database/);
  });

  it('refuses production-like and unknown database names for import/verify', () => {
    expect(() =>
      resolveImportVerifyTarget('DB_IMPORT_CONFIRM', {
        DB_IMPORT_CONFIRM: 'it_gst_management_prod',
        DATABASE_URL: REMOTE_URL,
      } as NodeJS.ProcessEnv)
    ).toThrow(/one of/);

    expect(() =>
      resolveImportVerifyTarget('DB_IMPORT_CONFIRM', {
        DB_IMPORT_CONFIRM: 'it_gst_management_staging',
        DATABASE_URL: LOCAL_DEV,
      } as NodeJS.ProcessEnv)
    ).toThrow(/one of/);

    expect(() =>
      resolveImportVerifyTarget('DB_IMPORT_CONFIRM', {
        DB_IMPORT_CONFIRM: 'it_gst_management_test',
        PG_AUTH_TEST_DATABASE_URL:
          'postgresql://u:p@127.0.0.1:5432/it_gst_management_prod',
      } as NodeJS.ProcessEnv)
    ).toThrow(/Refusing database/);
  });

  it('wrong confirmation vs URL database is refused', () => {
    expect(() =>
      resolveImportVerifyTarget('DB_IMPORT_CONFIRM', {
        DB_IMPORT_CONFIRM: ALLOWED_REAL_REHEARSAL_DB_NAME,
        PG_AUTH_TEST_DATABASE_URL: LOCAL_TEST,
      } as NodeJS.ProcessEnv)
    ).toThrow(/Refusing database|does not match/);
  });

  it('test and rehearsal confirms never fall back to DATABASE_URL', () => {
    expect(() =>
      resolveImportVerifyTarget('DB_IMPORT_CONFIRM', {
        DB_IMPORT_CONFIRM: 'it_gst_management_test',
        DATABASE_URL: LOCAL_DEV,
        PG_AUTH_TEST_DATABASE_URL: '',
      } as NodeJS.ProcessEnv)
    ).toThrow(/PG_AUTH_TEST_DATABASE_URL/);

    expect(() =>
      resolveImportVerifyTarget('DB_IMPORT_CONFIRM', {
        DB_IMPORT_CONFIRM: ALLOWED_REAL_REHEARSAL_DB_NAME,
        DATABASE_URL: LOCAL_REAL_REHEARSAL,
        PG_AUTH_TEST_DATABASE_URL: '',
      } as NodeJS.ProcessEnv)
    ).toThrow(/PG_AUTH_TEST_DATABASE_URL/);
  });

  it('refuses non-loopback hosts for test/rehearsal targets', () => {
    expect(() =>
      resolveImportVerifyTarget('DB_IMPORT_CONFIRM', {
        DB_IMPORT_CONFIRM: ALLOWED_REAL_REHEARSAL_DB_NAME,
        PG_AUTH_TEST_DATABASE_URL:
          'postgresql://u:p@db.example.com:5432/it_gst_management_real_rehearsal',
      } as NodeJS.ProcessEnv)
    ).toThrow(/localhost|127\.0\.0\.1/i);
  });

  it('assertBusinessTablesEmpty refuses non-empty business tables', async () => {
    const client = {
      query: async (sql: string, params?: unknown[]) => {
        if (/information_schema\.tables/i.test(sql)) {
          return { rowCount: 1, rows: [{ '?column?': 1 }] };
        }
        if (/COUNT\(\*\)/i.test(sql)) {
          const table = String(sql);
          // Simulate organizations already populated.
          if (/FROM organizations\b/i.test(table)) {
            return { rows: [{ n: '3' }] };
          }
          return { rows: [{ n: '0' }] };
        }
        return { rows: [] };
      },
    };
    await expect(assertBusinessTablesEmpty(client)).rejects.toThrow(
      /already contain rows|organizations/
    );
  });

  it('empty-check table list includes password_reset_challenges', () => {
    expect(BUSINESS_TABLES).toContain('password_reset_challenges');
    expect(BUSINESS_TABLES).toContain('gst_payments');
  });

  it('live data/ledger.json remains prohibited as LEDGER_IMPORT_PATH', () => {
    const prev = process.env.LEDGER_IMPORT_PATH;
    try {
      process.env.LEDGER_IMPORT_PATH = liveLedgerPath();
      expect(() => resolveLedgerSourcePath()).toThrow(/live data\/ledger\.json/i);
    } finally {
      if (prev === undefined) delete process.env.LEDGER_IMPORT_PATH;
      else process.env.LEDGER_IMPORT_PATH = prev;
    }
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
    expect(ALLOWED_MIGRATE_DB_NAMES).toContain(
      'it_gst_management_real_rehearsal'
    );
    expect(ALLOWED_MIGRATE_DB_NAMES).not.toContain('it_gst_management_prod');
  });
});
