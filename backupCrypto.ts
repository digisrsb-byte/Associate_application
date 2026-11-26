/**
 * AES-256-GCM encryption for ledger backups at rest.
 * Reuses the same algorithm parameters as portalCrypto; uses a SEPARATE key.
 * Never log plaintext ledger JSON, ciphertext, or the backup key.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const ALG = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;
/** Magic header for encrypted backup files (incomplete/tamper detection). */
export const BACKUP_MAGIC = Buffer.from('ASSOCBK1', 'utf8');
export const BACKUP_FILE_SUFFIX = '.json.enc';

export type BackupKeyStatus =
  | { ok: true; key: Buffer; source: 'env' | 'file' }
  | { ok: false; reason: 'missing' | 'invalid' };

export function loadBackupEncryptionKey(options?: {
  envValue?: string;
  keyFilePath?: string;
}): BackupKeyStatus {
  const rawEnv =
    options?.envValue !== undefined
      ? options.envValue
      : process.env.BACKUP_ENCRYPTION_KEY;
  if (rawEnv && String(rawEnv).trim()) {
    const parsed = parseKeyMaterial(String(rawEnv).trim());
    if (!parsed) return { ok: false, reason: 'invalid' };
    return { ok: true, key: parsed, source: 'env' };
  }

  const filePath =
    options?.keyFilePath ||
    (process.env.BACKUP_ENCRYPTION_KEY_FILE
      ? String(process.env.BACKUP_ENCRYPTION_KEY_FILE).trim()
      : '');
  if (filePath) {
    try {
      if (!fs.existsSync(filePath)) return { ok: false, reason: 'missing' };
      const raw = fs.readFileSync(filePath, 'utf8').trim();
      const parsed = parseKeyMaterial(raw);
      if (!parsed) return { ok: false, reason: 'invalid' };
      return { ok: true, key: parsed, source: 'file' };
    } catch {
      return { ok: false, reason: 'invalid' };
    }
  }

  return { ok: false, reason: 'missing' };
}

function parseKeyMaterial(trimmed: string): Buffer | null {
  try {
    let buf: Buffer;
    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
      buf = Buffer.from(trimmed, 'hex');
    } else {
      buf = Buffer.from(trimmed, 'base64');
    }
    if (buf.length !== KEY_LEN) return null;
    return buf;
  } catch {
    return null;
  }
}

/** Fixed System32 icacls — never spawn the short name from PATH (S4036). */
function windowsIcaclsPath(): string {
  const root = process.env.SystemRoot || 'C:\\Windows';
  const candidate = path.join(root, 'System32', 'icacls.exe');
  if (!fs.existsSync(candidate)) {
    throw new Error(
      `Windows icacls.exe not found at ${candidate}. Refusing to treat the backup key as ACL-protected.`
    );
  }
  return candidate;
}

function runIcacls(icaclsExe: string, args: string[]): void {
  const result = spawnSync(icaclsExe, args, {
    windowsHide: true,
    encoding: 'utf8',
    shell: false,
  });
  if (result.error) {
    throw new Error(
      `Failed to execute icacls (${icaclsExe}): ${result.error.message}. Backup key ACL was not fully applied.`
    );
  }
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim();
    throw new Error(
      `icacls exited with status ${result.status}${detail ? `: ${detail}` : ''}. Backup key ACL was not fully applied.`
    );
  }
}

/**
 * Restrict key-file ACLs: Windows icacls (current user read); Unix 0600.
 * Throws if the key cannot be confirmed as protected.
 * Callers must not use a file-sourced key after a throw (env-sourced keys skip this).
 */
export function restrictKeyFileAccess(filePath: string): void {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(
      `Cannot restrict ACL: key file does not exist: ${resolved}`
    );
  }
  if (process.platform === 'win32') {
    const user = String(process.env.USERNAME || process.env.USER || '').trim();
    if (!user) {
      throw new Error(
        'Windows username is not available (USERNAME/USER). Refusing to treat the backup key as ACL-protected.'
      );
    }
    const icacls = windowsIcaclsPath();
    runIcacls(icacls, [resolved, '/inheritance:r']);
    try {
      runIcacls(icacls, [resolved, '/grant:r', `${user}:R`]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Backup key ACL grant failed after inheritance was removed. File may be inaccessible until ACLs are repaired. ${msg}`
      );
    }
    return;
  }
  try {
    fs.chmodSync(resolved, 0o600);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to set backup key file permissions (0600). Refusing to use this key file. ${msg}`
    );
  }
  let st: fs.Stats;
  try {
    st = fs.lstatSync(resolved);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to verify backup key file permissions after chmod. Refusing to use this key file. ${msg}`
    );
  }
  if ((st.mode & 0o077) !== 0) {
    throw new Error(
      'Backup key file permissions are too open after chmod (group/other bits set). Refusing to use this key file.'
    );
  }
}

/**
 * Create a new random backup key file if missing (E2E / first-time only).
 * Never overwrites an existing key file.
 */
export function ensureBackupKeyFile(filePath: string): {
  created: boolean;
  path: string;
} {
  const resolved = path.resolve(filePath);
  if (fs.existsSync(resolved)) {
    restrictKeyFileAccess(resolved);
    return { created: false, path: resolved };
  }
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const key = crypto.randomBytes(KEY_LEN).toString('base64');
  const tmp = `${resolved}.tmp`;
  fs.writeFileSync(tmp, `${key}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, resolved);
  restrictKeyFileAccess(resolved);
  return { created: true, path: resolved };
}

export function encryptLedgerBackup(plaintextUtf8: string, key: Buffer): Buffer {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALG, key, iv);
  const ct = Buffer.concat([
    cipher.update(Buffer.from(plaintextUtf8, 'utf8')),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([BACKUP_MAGIC, iv, tag, ct]);
}

export function isEncryptedBackupBuffer(buf: Buffer): boolean {
  return (
    Buffer.isBuffer(buf) &&
    buf.length >= BACKUP_MAGIC.length + IV_LEN + TAG_LEN + 1 &&
    buf.subarray(0, BACKUP_MAGIC.length).equals(BACKUP_MAGIC)
  );
}

export function decryptLedgerBackup(blob: Buffer, key: Buffer): string {
  if (!Buffer.isBuffer(blob) || blob.length < BACKUP_MAGIC.length + IV_LEN + TAG_LEN) {
    throw new Error('Incomplete or empty backup.');
  }
  if (!blob.subarray(0, BACKUP_MAGIC.length).equals(BACKUP_MAGIC)) {
    throw new Error('Not an encrypted ASSOCIATE backup (bad magic).');
  }
  let offset = BACKUP_MAGIC.length;
  const iv = blob.subarray(offset, offset + IV_LEN);
  offset += IV_LEN;
  const tag = blob.subarray(offset, offset + TAG_LEN);
  offset += TAG_LEN;
  const ct = blob.subarray(offset);
  if (ct.length < 1) {
    throw new Error('Incomplete backup ciphertext.');
  }
  try {
    const decipher = crypto.createDecipheriv(ALG, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Backup decryption failed (wrong key or tampered data).');
  }
}

export type LedgerShape = {
  clients?: unknown;
  gstClients?: unknown;
  assessmentYears?: unknown;
  gstMonths?: unknown;
};

export function parseAndValidateLedgerJson(utf8: string): LedgerShape {
  let parsed: unknown;
  try {
    parsed = JSON.parse(utf8);
  } catch {
    throw new Error('Decrypted backup is not valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Decrypted backup has invalid ledger shape.');
  }
  const obj = parsed as LedgerShape;
  if (!Array.isArray(obj.clients)) {
    throw new Error('Decrypted backup missing clients array.');
  }
  if (obj.gstClients !== undefined && !Array.isArray(obj.gstClients)) {
    throw new Error('Decrypted backup has invalid gstClients.');
  }
  return obj;
}

/**
 * Same-directory replace: write temp → validate JSON from temp → rename over target.
 * Never deletes the existing target before replacement.
 * Does NOT eliminate Windows/OneDrive EPERM on rename; failures leave the target unchanged
 * when rename does not succeed, and attempt to remove the temp file.
 */
export function replaceFileWithValidatedLedgerJson(options: {
  targetPath: string;
  plaintextUtf8: string;
  /** Defaults to `${target}.restore-tmp` */
  tmpPath?: string;
}): void {
  const target = path.resolve(options.targetPath);
  const tmp = options.tmpPath
    ? path.resolve(options.tmpPath)
    : `${target}.restore-tmp`;
  if (options.tmpPath !== undefined) {
    const targetDir = path.dirname(target);
    const tmpDir = path.dirname(tmp);
    if (tmpDir !== targetDir) {
      throw new Error(
        'Temporary restore path must be in the same directory as the target.'
      );
    }
  }
  try {
    fs.writeFileSync(tmp, options.plaintextUtf8, 'utf-8');
    parseAndValidateLedgerJson(fs.readFileSync(tmp, 'utf-8'));
    fs.renameSync(tmp, target);
  } catch (err) {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {
      /* ignore cleanup errors */
    }
    throw err;
  }
}

/**
 * Ensure path is a regular file (not a symlink/junction/directory).
 * Uses lstat so links are not followed. Returns the resolved path.
 */
export function assertRegularBackupFile(filePath: string): string {
  const resolved = path.resolve(filePath);
  let st: fs.Stats;
  try {
    st = fs.lstatSync(resolved);
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? String((err as NodeJS.ErrnoException).code)
        : '';
    if (code === 'ENOENT') {
      throw new Error('Backup file not found.');
    }
    throw new Error('Backup file is not accessible.');
  }
  // Symlinks and most Windows junctions/reparse links report as symbolic links under lstat.
  if (st.isSymbolicLink()) {
    throw new Error('Backup path must not be a symbolic link or junction.');
  }
  // Reject directories and other non-files (covers directory junctions that appear as dirs).
  if (!st.isFile()) {
    throw new Error('Backup path must be a regular file.');
  }
  return resolved;
}

/** Non-throwing check for list/retention filters. */
export function isRegularBackupFile(filePath: string): boolean {
  try {
    assertRegularBackupFile(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read + AES-GCM decrypt + JSON-shape validate in one pass.
 * Callers (e.g. restore) must consume `plaintextUtf8` — do not re-read the path.
 * Windows: still uses lstat-then-readFileSync; that does NOT eliminate TOCTOU.
 */
export type VerifiedEncryptedBackup = {
  plaintextUtf8: string;
  ledger: LedgerShape;
};

export function verifyEncryptedBackupFile(
  filePath: string,
  key: Buffer
): VerifiedEncryptedBackup {
  const safePath = assertRegularBackupFile(filePath);
  const buf = fs.readFileSync(safePath);
  if (!isEncryptedBackupBuffer(buf)) {
    throw new Error('File is not an encrypted backup.');
  }
  const plaintextUtf8 = decryptLedgerBackup(buf, key);
  const ledger = parseAndValidateLedgerJson(plaintextUtf8);
  return { plaintextUtf8, ledger };
}
