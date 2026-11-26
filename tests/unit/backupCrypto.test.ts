import { describe, expect, it, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  BACKUP_FILE_SUFFIX,
  BACKUP_MAGIC,
  assertRegularBackupFile,
  decryptLedgerBackup,
  encryptLedgerBackup,
  ensureBackupKeyFile,
  isEncryptedBackupBuffer,
  isRegularBackupFile,
  loadBackupEncryptionKey,
  parseAndValidateLedgerJson,
  replaceFileWithValidatedLedgerJson,
  restrictKeyFileAccess,
  verifyEncryptedBackupFile,
} from '../../backupCrypto.ts';

const isWin = process.platform === 'win32';

const HEX_KEY = crypto.randomBytes(32).toString('hex');
const key = Buffer.from(HEX_KEY, 'hex');

const tmpDirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const d of tmpDirs.splice(0)) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

function tmpDir(): string {
  // OS temp — outside the project / OneDrive tree
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'assoc-bk-'));
  tmpDirs.push(d);
  return d;
}

describe('backupCrypto', () => {
  it('loads key from env hex/base64 and rejects invalid', () => {
    expect(loadBackupEncryptionKey({ envValue: HEX_KEY })).toEqual({
      ok: true,
      key,
      source: 'env',
    });
    const bad = loadBackupEncryptionKey({ envValue: 'bad' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe('invalid');
    const missing = loadBackupEncryptionKey({ envValue: '' });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reason).toBe('missing');
  });

  it('loads key from file path (ephemeral)', () => {
    const dir = tmpDir();
    const keyPath = path.join(dir, 'BACKUP_ENCRYPTION_KEY.test');
    fs.writeFileSync(keyPath, HEX_KEY + '\n', 'utf8');
    const loaded = loadBackupEncryptionKey({
      envValue: '',
      keyFilePath: keyPath,
    });
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.source).toBe('file');
    const missingFile = loadBackupEncryptionKey({
      envValue: '',
      keyFilePath: path.join(dir, 'missing.key'),
    });
    expect(missingFile.ok).toBe(false);
    if (!missingFile.ok) expect(missingFile.reason).toBe('missing');
  });

  it('encrypts/decrypts ledger backup buffers with magic header', () => {
    const plain = JSON.stringify({ clients: [], gstClients: [] });
    const blob = encryptLedgerBackup(plain, key);
    expect(isEncryptedBackupBuffer(blob)).toBe(true);
    expect(blob.subarray(0, BACKUP_MAGIC.length).equals(BACKUP_MAGIC)).toBe(
      true
    );
    expect(decryptLedgerBackup(blob, key)).toBe(plain);
    expect(isEncryptedBackupBuffer(Buffer.from('nope'))).toBe(false);
    expect(() => decryptLedgerBackup(Buffer.from('x'), key)).toThrow(
      /Incomplete|Not an encrypted/
    );
  });

  it('parseAndValidateLedgerJson enforces shape', () => {
    expect(parseAndValidateLedgerJson('{"clients":[]}')).toEqual({
      clients: [],
    });
    expect(() => parseAndValidateLedgerJson('not-json')).toThrow(/valid JSON/);
    expect(() => parseAndValidateLedgerJson('null')).toThrow(/invalid ledger/);
    expect(() => parseAndValidateLedgerJson('{"clients":1}')).toThrow(
      /clients array/
    );
    expect(() =>
      parseAndValidateLedgerJson('{"clients":[],"gstClients":1}')
    ).toThrow(/gstClients/);
  });

  it('ensureBackupKeyFile creates once and verifyEncryptedBackupFile works', () => {
    const dir = tmpDir();
    const keyPath = path.join(dir, 'key.file');
    const first = ensureBackupKeyFile(keyPath);
    expect(first.created).toBe(true);
    const second = ensureBackupKeyFile(keyPath);
    expect(second.created).toBe(false);

    const fileKey = loadBackupEncryptionKey({
      envValue: '',
      keyFilePath: keyPath,
    });
    expect(fileKey.ok).toBe(true);
    if (!fileKey.ok) return;

    const backupPath = path.join(dir, `ledger${BACKUP_FILE_SUFFIX}`);
    const utf8 = JSON.stringify({ clients: [{ id: '1' }], gstClients: [] });
    fs.writeFileSync(backupPath, encryptLedgerBackup(utf8, fileKey.key));
    const parsed = verifyEncryptedBackupFile(backupPath, fileKey.key);
    expect(Array.isArray(parsed.ledger.clients)).toBe(true);
    expect(parsed.plaintextUtf8).toBe(utf8);
  });

  it('decrypt fails on wrong key', () => {
    const blob = encryptLedgerBackup('{"clients":[]}', key);
    const other = crypto.randomBytes(32);
    expect(() => decryptLedgerBackup(blob, other)).toThrow(/decryption failed/);
  });

  describe('restrictKeyFileAccess', () => {
    it('successful permission path does not throw for a temp key file', () => {
      const dir = tmpDir();
      const keyPath = path.join(dir, 'BACKUP_ENCRYPTION_KEY');
      fs.writeFileSync(keyPath, `${HEX_KEY}\n`, { encoding: 'utf8', mode: 0o600 });
      expect(() => restrictKeyFileAccess(keyPath)).not.toThrow();
      if (!isWin) {
        const mode = fs.lstatSync(keyPath).mode;
        expect(mode & 0o077).toBe(0);
      }
    });

    it.skipIf(isWin)('throws when chmodSync fails (Linux/macOS)', () => {
      const dir = tmpDir();
      const keyPath = path.join(dir, 'BACKUP_ENCRYPTION_KEY');
      fs.writeFileSync(keyPath, `${HEX_KEY}\n`, 'utf8');
      vi.spyOn(fs, 'chmodSync').mockImplementation(() => {
        throw new Error('EPERM: chmod failed');
      });
      expect(() => restrictKeyFileAccess(keyPath)).toThrow(
        /Failed to set backup key file permissions|Refusing to use this key file/i
      );
      expect(() => ensureBackupKeyFile(keyPath)).toThrow(
        /Failed to set backup key file permissions|Refusing to use this key file/i
      );
    });

    it.skipIf(isWin)(
      'throws when group/other bits remain after chmod (Linux/macOS)',
      () => {
        const dir = tmpDir();
        const keyPath = path.join(dir, 'BACKUP_ENCRYPTION_KEY');
        fs.writeFileSync(keyPath, `${HEX_KEY}\n`, 'utf8');
        vi.spyOn(fs, 'chmodSync').mockImplementation(() => undefined);
        vi.spyOn(fs, 'lstatSync').mockReturnValue({
          mode: 0o100644,
        } as fs.Stats);
        expect(() => restrictKeyFileAccess(keyPath)).toThrow(
          /too open|group\/other|Refusing to use this key file/i
        );
      }
    );
  });

  it('verified plaintextUtf8 is the exact content restore must consume (no second path read)', () => {
    const dir = tmpDir();
    const backupPath = path.join(dir, `ledger-once${BACKUP_FILE_SUFFIX}`);
    const utf8 = JSON.stringify({
      clients: [{ id: 'restore-me', pan: 'AAAAA0000A' }],
      gstClients: [],
    });
    fs.writeFileSync(backupPath, encryptLedgerBackup(utf8, key));

    const verified = verifyEncryptedBackupFile(backupPath, key);
    // Same object: ledger parsed from the returned plaintext (not a second decrypt)
    expect(verified.plaintextUtf8).toBe(utf8);
    expect(parseAndValidateLedgerJson(verified.plaintextUtf8)).toEqual(
      verified.ledger
    );
    expect(
      (verified.ledger.clients as { id: string }[])[0]?.id
    ).toBe('restore-me');

    // Simulate restore write: consume verified.plaintextUtf8 only
    const restoreTarget = path.join(dir, 'ledger-restored.json');
    fs.writeFileSync(restoreTarget, verified.plaintextUtf8, 'utf-8');
    expect(fs.readFileSync(restoreTarget, 'utf-8')).toBe(verified.plaintextUtf8);
    expect(fs.readFileSync(restoreTarget, 'utf-8')).toBe(utf8);
  });

  describe('replaceFileWithValidatedLedgerJson', () => {
    it('successful replacement updates an existing target', () => {
      const dir = tmpDir();
      const target = path.join(dir, 'ledger.json');
      const original = JSON.stringify({ clients: [{ id: 'old' }] });
      const next = JSON.stringify({ clients: [{ id: 'new' }], gstClients: [] });
      fs.writeFileSync(target, original, 'utf-8');

      replaceFileWithValidatedLedgerJson({
        targetPath: target,
        plaintextUtf8: next,
      });

      expect(fs.readFileSync(target, 'utf-8')).toBe(next);
      expect(fs.existsSync(`${target}.restore-tmp`)).toBe(false);
    });

    it('forced rename failure leaves original target bytes unchanged and cleans tmp', () => {
      const dir = tmpDir();
      const target = path.join(dir, 'ledger.json');
      const original = JSON.stringify({ clients: [{ id: 'keep-me' }] });
      const next = JSON.stringify({ clients: [{ id: 'should-not-apply' }] });
      fs.writeFileSync(target, original, 'utf-8');

      vi.spyOn(fs, 'renameSync').mockImplementation(() => {
        const err = new Error('EPERM: operation not permitted, rename') as NodeJS.ErrnoException;
        err.code = 'EPERM';
        throw err;
      });

      expect(() =>
        replaceFileWithValidatedLedgerJson({
          targetPath: target,
          plaintextUtf8: next,
        })
      ).toThrow(/EPERM/);

      expect(fs.readFileSync(target, 'utf-8')).toBe(original);
      expect(fs.existsSync(`${target}.restore-tmp`)).toBe(false);
    });

    it('invalid replacement JSON does not change the target', () => {
      const dir = tmpDir();
      const target = path.join(dir, 'ledger.json');
      const original = JSON.stringify({ clients: [{ id: 'stable' }] });
      fs.writeFileSync(target, original, 'utf-8');

      expect(() =>
        replaceFileWithValidatedLedgerJson({
          targetPath: target,
          plaintextUtf8: '{not-valid-json',
        })
      ).toThrow(/valid JSON|clients array|invalid ledger/i);

      expect(fs.readFileSync(target, 'utf-8')).toBe(original);
      expect(fs.existsSync(`${target}.restore-tmp`)).toBe(false);
    });

    it('rejects tmpPath in a different directory and leaves target unchanged', () => {
      const dir = tmpDir();
      const otherDir = tmpDir();
      const target = path.join(dir, 'ledger.json');
      const foreignTmp = path.join(otherDir, 'ledger.json.restore-tmp');
      const original = JSON.stringify({ clients: [{ id: 'untouched' }] });
      const next = JSON.stringify({ clients: [{ id: 'must-not-apply' }] });
      fs.writeFileSync(target, original, 'utf-8');

      expect(() =>
        replaceFileWithValidatedLedgerJson({
          targetPath: target,
          plaintextUtf8: next,
          tmpPath: foreignTmp,
        })
      ).toThrow(/same directory/i);

      expect(fs.readFileSync(target, 'utf-8')).toBe(original);
      expect(fs.existsSync(foreignTmp)).toBe(false);
      expect(fs.existsSync(`${target}.restore-tmp`)).toBe(false);
    });
  });

  describe('assertRegularBackupFile', () => {
    it('accepts a regular backup file', () => {
      const dir = tmpDir();
      const file = path.join(dir, `ledger-ok${BACKUP_FILE_SUFFIX}`);
      fs.writeFileSync(file, encryptLedgerBackup('{"clients":[]}', key));
      expect(assertRegularBackupFile(file)).toBe(path.resolve(file));
      expect(isRegularBackupFile(file)).toBe(true);
    });

    it('rejects a symbolic link when the OS permits creating one', () => {
      const dir = tmpDir();
      const target = path.join(dir, `ledger-target${BACKUP_FILE_SUFFIX}`);
      const link = path.join(dir, `ledger-link${BACKUP_FILE_SUFFIX}`);
      fs.writeFileSync(target, encryptLedgerBackup('{"clients":[]}', key));
      let created = false;
      try {
        fs.symlinkSync(target, link);
        created = true;
      } catch {
        // Windows may require elevated privileges for file symlinks.
        created = false;
      }
      if (!created) {
        // Skip without failing the suite when symlink creation is unavailable.
        expect(isRegularBackupFile(target)).toBe(true);
        return;
      }
      expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
      expect(() => assertRegularBackupFile(link)).toThrow(
        /symbolic link|junction/i
      );
      expect(isRegularBackupFile(link)).toBe(false);
      // verify must refuse before reading through the link
      expect(() => verifyEncryptedBackupFile(link, key)).toThrow(
        /symbolic link|junction/i
      );
    });

    it('rejects a directory as a backup file', () => {
      const dir = tmpDir();
      const nested = path.join(dir, 'ledger-as-dir.json.enc');
      fs.mkdirSync(nested);
      expect(() => assertRegularBackupFile(nested)).toThrow(/regular file/i);
      expect(isRegularBackupFile(nested)).toBe(false);
    });

    it('rejects a missing file safely', () => {
      const dir = tmpDir();
      const missing = path.join(dir, 'ledger-missing.json.enc');
      expect(() => assertRegularBackupFile(missing)).toThrow(/not found/i);
      expect(isRegularBackupFile(missing)).toBe(false);
    });
  });
});
