/**
 * Phase 8C.2 — unit tests for local PostgreSQL dump backup gates.
 * No live database connections. pg_dump is mocked.
 */
import { describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';
import os from 'os';
import path from 'path';
import {
  ALLOWED_PG_DUMP_DB_NAMES,
  PG_DUMP_MAGIC,
  assertLocalPgDumpTarget,
  assertPgDumpAvailable,
  assertSafePgDumpOutputDir,
  buildDumpManifest,
  decryptPgDumpBuffer,
  encryptPgDumpBuffer,
  executeLocalPgDump,
  isProductionLikeDatabaseName,
  loadPgDumpEncryptionKey,
  pathLooksOneDriveSynced,
  planLocalPgDump,
  sha256Hex,
} from '../../scripts/pg-dump-backup-lib.mjs';
import { redactSafeMessage } from '../../scripts/pg-dump-backup.mjs';
import { PROJECT_ROOT } from '../../scripts/pg-dump-backup-lib.mjs';

const DUMP_KEY_HEX = crypto.randomBytes(32).toString('hex');
const OTHER_KEY_HEX = crypto.randomBytes(32).toString('hex');

const LOCAL_DRILL =
  'postgresql://appuser:s3cret-drill@127.0.0.1:5432/it_gst_management_restore_drill';
const LOCAL_BACKUP_DRILL =
  'postgresql://appuser:s3cret@localhost:5432/it_gst_management_backup_drill';
const REMOTE_URL =
  'postgresql://appuser:s3cret@db.example-managed.example:5432/it_gst_management_prod?sslmode=require';
const LOCAL_PROD_NAME =
  'postgresql://appuser:s3cret@127.0.0.1:5432/it_gst_management_prod';
const LOCAL_DEV =
  'postgresql://appuser:s3cret@127.0.0.1:5432/it_gst_management_dev';

function safeOutputDir(): string {
  return path.join(os.tmpdir(), 'associate-pg-dump-test-out');
}

function baseEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    DB_TARGET_MODE: 'local',
    PG_DUMP_CONFIRM: 'it_gst_management_restore_drill',
    PG_DUMP_OUTPUT_DIR: safeOutputDir(),
    PG_DUMP_ENCRYPTION_KEY: DUMP_KEY_HEX,
    ...overrides,
  };
}

describe('pg-dump-backup naming / path helpers', () => {
  it('allowlists only disposable drill database names', () => {
    expect(ALLOWED_PG_DUMP_DB_NAMES).toContain('it_gst_management_restore_drill');
    expect(ALLOWED_PG_DUMP_DB_NAMES).toContain('it_gst_management_backup_drill');
    expect(ALLOWED_PG_DUMP_DB_NAMES).not.toContain('it_gst_management_dev');
    expect(ALLOWED_PG_DUMP_DB_NAMES).not.toContain('it_gst_management_prod');
  });

  it('detects production-like database names', () => {
    expect(isProductionLikeDatabaseName('it_gst_management_prod')).toBe(true);
    expect(isProductionLikeDatabaseName('my_production_db')).toBe(true);
    expect(isProductionLikeDatabaseName('app_live')).toBe(true);
    expect(isProductionLikeDatabaseName('client_staging')).toBe(true);
    expect(isProductionLikeDatabaseName('it_gst_management_restore_drill')).toBe(
      false
    );
  });

  it('detects OneDrive-synced path segments', () => {
    expect(
      pathLooksOneDriveSynced(
        'C:\\Users\\x\\OneDrive\\Desktop\\associate\\out'
      )
    ).toBe(true);
    expect(pathLooksOneDriveSynced(path.join(os.tmpdir(), 'pg-out'))).toBe(
      false
    );
  });

  it('refuses output directories inside the project tree', () => {
    expect(() =>
      assertSafePgDumpOutputDir(path.join(PROJECT_ROOT, 'tmp-dumps'))
    ).toThrow(/project tree/i);
  });

  it('refuses OneDrive output directories', () => {
    expect(() =>
      assertSafePgDumpOutputDir(
        'C:\\Users\\example\\OneDrive\\Desktop\\pg-dumps'
      )
    ).toThrow(/OneDrive/i);
  });

  it('accepts a temp directory outside the project', () => {
    const out = assertSafePgDumpOutputDir(safeOutputDir());
    expect(path.isAbsolute(out)).toBe(true);
  });
});

describe('pg-dump-backup target gates', () => {
  it('refuses remote hosts', () => {
    expect(() =>
      assertLocalPgDumpTarget({
        connectionString: REMOTE_URL,
        env: baseEnv(),
      })
    ).toThrow(/localhost|127\.0\.0\.1/i);
  });

  it('refuses DB_TARGET_MODE=remote even for loopback URLs', () => {
    expect(() =>
      assertLocalPgDumpTarget({
        connectionString: LOCAL_DRILL,
        env: baseEnv({ DB_TARGET_MODE: 'remote' }),
      })
    ).toThrow(/DB_TARGET_MODE must be local/i);
  });

  it('refuses production-like local database names', () => {
    expect(() =>
      assertLocalPgDumpTarget({
        connectionString: LOCAL_PROD_NAME,
        env: baseEnv({ PG_DUMP_CONFIRM: 'it_gst_management_prod' }),
      })
    ).toThrow(/production-like|Refusing database/i);
  });

  it('refuses non-disposable local names (dev)', () => {
    expect(() =>
      assertLocalPgDumpTarget({
        connectionString: LOCAL_DEV,
        env: baseEnv({ PG_DUMP_CONFIRM: 'it_gst_management_dev' }),
      })
    ).toThrow(/Allowed disposable names/i);
  });

  it('refuses missing confirmation', () => {
    expect(() =>
      assertLocalPgDumpTarget({
        connectionString: LOCAL_DRILL,
        env: baseEnv({ PG_DUMP_CONFIRM: '' }),
      })
    ).toThrow(/PG_DUMP_CONFIRM/i);
  });

  it('refuses mismatched confirmation', () => {
    expect(() =>
      assertLocalPgDumpTarget({
        connectionString: LOCAL_DRILL,
        env: baseEnv({ PG_DUMP_CONFIRM: 'it_gst_management_backup_drill' }),
      })
    ).toThrow(/must exactly equal/i);
  });

  it('refuses missing encryption key without plaintext override', () => {
    expect(() =>
      assertLocalPgDumpTarget({
        connectionString: LOCAL_DRILL,
        env: baseEnv({ PG_DUMP_ENCRYPTION_KEY: '' }),
      })
    ).toThrow(/PG_DUMP_ENCRYPTION_KEY/i);
  });

  it('allows plaintext when PG_DUMP_ALLOW_PLAINTEXT=1', () => {
    const t = assertLocalPgDumpTarget({
      connectionString: LOCAL_BACKUP_DRILL,
      env: baseEnv({
        PG_DUMP_CONFIRM: 'it_gst_management_backup_drill',
        PG_DUMP_ENCRYPTION_KEY: '',
        PG_DUMP_ALLOW_PLAINTEXT: '1',
      }),
    });
    expect(t.encrypt).toBe(false);
    expect(t.database).toBe('it_gst_management_backup_drill');
  });

  it('accepts a valid local drill + encrypt key', () => {
    const t = assertLocalPgDumpTarget({
      connectionString: LOCAL_DRILL,
      env: baseEnv(),
    });
    expect(t.database).toBe('it_gst_management_restore_drill');
    expect(t.encrypt).toBe(true);
    expect(t.redactedUrl).not.toContain('s3cret-drill');
  });
});

describe('pg-dump encryption key isolation', () => {
  it('loads dedicated hex key from env', () => {
    const loaded = loadPgDumpEncryptionKey({ envValue: DUMP_KEY_HEX });
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.source).toBe('env');
  });

  it('refuses reusing BACKUP_ENCRYPTION_KEY material', () => {
    const loaded = loadPgDumpEncryptionKey({
      env: {
        PG_DUMP_ENCRYPTION_KEY: DUMP_KEY_HEX,
        BACKUP_ENCRYPTION_KEY: DUMP_KEY_HEX,
      },
    });
    expect(loaded.ok).toBe(false);
  });

  it('refuses reusing PORTAL_PASSWORD_ENCRYPTION_KEY material', () => {
    const loaded = loadPgDumpEncryptionKey({
      env: {
        PG_DUMP_ENCRYPTION_KEY: DUMP_KEY_HEX,
        PORTAL_PASSWORD_ENCRYPTION_KEY: DUMP_KEY_HEX,
      },
    });
    expect(loaded.ok).toBe(false);
  });

  it('encrypts and decrypts dump buffers with ASSOCPGD1 magic', () => {
    const key = Buffer.from(DUMP_KEY_HEX, 'hex');
    const plain = Buffer.from('PGDUMP\0FAKE-CUSTOM-FORMAT-BYTES');
    const enc = encryptPgDumpBuffer(plain, key);
    expect(enc.subarray(0, PG_DUMP_MAGIC.length).equals(PG_DUMP_MAGIC)).toBe(
      true
    );
    expect(decryptPgDumpBuffer(enc, key).equals(plain)).toBe(true);
  });

  it('rejects wrong key on decrypt', () => {
    const key = Buffer.from(DUMP_KEY_HEX, 'hex');
    const other = Buffer.from(OTHER_KEY_HEX, 'hex');
    const enc = encryptPgDumpBuffer(Buffer.from('abc'), key);
    expect(() => decryptPgDumpBuffer(enc, other)).toThrow(/decryption failed/i);
  });
});

describe('pg_dump availability and execute (mocked)', () => {
  it('reports missing pg_dump (ENOENT)', () => {
    const spawnSyncFn = vi.fn(() => ({
      error: Object.assign(new Error('not found'), { code: 'ENOENT' }),
      status: null,
      stdout: '',
      stderr: '',
    }));
    expect(() => assertPgDumpAvailable({ spawnSyncFn })).toThrow(
      /pg_dump was not found/i
    );
  });

  it('plans a dry-run without spawning pg_dump', () => {
    const plan = planLocalPgDump({
      connectionString: LOCAL_DRILL,
      env: baseEnv(),
      now: new Date('2026-11-25T06:30:00.000Z'),
    });
    expect(plan.mode).toBe('dry-run');
    expect(plan.pgDumpArgsRedacted.join(' ')).toContain('--format=custom');
    expect(plan.pgDumpArgsRedacted.join(' ')).not.toContain('s3cret-drill');
    expect(plan.finalPath.endsWith('.dump.enc')).toBe(true);
  });

  it('fails when mocked pg_dump returns non-zero', () => {
    const files = new Map<string, Buffer>();
    const spawnSyncFn = vi.fn((bin: string, args: string[]) => {
      if (args[0] === '--version') {
        return { status: 0, stdout: 'pg_dump (PostgreSQL) 16.0\n', error: null };
      }
      return { status: 2, stdout: '', stderr: 'boom', error: null };
    });
    expect(() =>
      executeLocalPgDump({
        connectionString: LOCAL_DRILL,
        env: baseEnv(),
        spawnSyncFn,
        mkdirFn: () => undefined,
        existsFn: (p: string) => files.has(p),
        writeFileFn: (p: string, data: Buffer | string) => {
          files.set(p, Buffer.isBuffer(data) ? data : Buffer.from(data));
        },
        readFileFn: (p: string) => files.get(p) || Buffer.alloc(0),
        unlinkFn: (p: string) => {
          files.delete(p);
        },
      })
    ).toThrow(/pg_dump failed with status 2/i);
  });

  it('executes a mocked successful encrypted dump and verifies hash', () => {
    const files = new Map<string, Buffer>();
    const plainPayload = Buffer.from('FAKE-PG-CUSTOM-DUMP-CONTENT');
    const spawnSyncFn = vi.fn((bin: string, args: string[]) => {
      if (args[0] === '--version') {
        return {
          status: 0,
          stdout: 'pg_dump (PostgreSQL) 16.4\n',
          error: null,
          stderr: '',
        };
      }
      const fileIdx = args.indexOf('--file');
      const dumpPath = args[fileIdx + 1];
      files.set(dumpPath, plainPayload);
      return { status: 0, stdout: '', stderr: '', error: null };
    });

    const result = executeLocalPgDump({
      connectionString: LOCAL_DRILL,
      env: baseEnv(),
      spawnSyncFn,
      now: new Date('2026-11-25T06:30:00.000Z'),
      mkdirFn: () => undefined,
      existsFn: (p: string) => files.has(p),
      writeFileFn: (p: string, data: Buffer | string) => {
        files.set(
          String(p),
          Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8')
        );
      },
      readFileFn: (p: string) => {
        const b = files.get(String(p));
        if (!b) throw new Error('missing ' + p);
        return b;
      },
      unlinkFn: (p: string) => {
        files.delete(String(p));
      },
    });

    expect(result.encrypted).toBe(true);
    expect(result.bytes).toBeGreaterThan(0);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.artifactPath.endsWith('.dump.enc')).toBe(true);
    const encArtifact = files.get(result.artifactPath);
    expect(encArtifact).toBeInstanceOf(Buffer);
    expect(sha256Hex(encArtifact as Buffer)).toBe(result.sha256);
    // plaintext dump removed after encrypt
    expect([...files.keys()].some((k) => k.endsWith('.dump'))).toBe(false);
    const manifestRaw = files.get(result.manifestPath);
    expect(manifestRaw).toBeInstanceOf(Buffer);
    const manifest = JSON.parse((manifestRaw as Buffer).toString('utf8'));
    expect(manifest.sha256).toBe(result.sha256);
    expect(manifest.database).toBe('it_gst_management_restore_drill');
    expect(manifest.plainSha256).toBe(sha256Hex(plainPayload));
  });

  it('buildDumpManifest never includes connection secrets', () => {
    const m = buildDumpManifest({
      createdAt: '2026-11-25T00:00:00.000Z',
      database: 'it_gst_management_restore_drill',
      host: '127.0.0.1',
      encrypted: true,
      artifactPath: '/tmp/x.dump.enc',
      bytes: 10,
      sha256: 'ab'.repeat(32),
    });
    const json = JSON.stringify(m);
    expect(json).not.toMatch(/password|postgresql:\/\//i);
  });
});

describe('secret redaction helpers', () => {
  it('redacts password substrings from error text', () => {
    const msg = redactSafeMessage(
      'failed for user with s3cret-drill in message',
      LOCAL_DRILL
    );
    expect(msg).not.toContain('s3cret-drill');
    expect(msg).toContain('***');
  });
});
