/**
 * AES-256-GCM helpers for client / GST portal passwords at rest.
 * Never log plaintext, ciphertext blobs, or the encryption key.
 */
import crypto from 'crypto';

const ALG = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;
const PREFIX = 'enc:v1:';

const UNSET = new Set(['', 'not set', 'n/a', 'na', 'none', '-']);

export function isUnsetPortalPassword(value: string | undefined | null): boolean {
  if (value == null) return true;
  return UNSET.has(String(value).trim().toLowerCase());
}

export function isEncryptedPortalPassword(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

export type PortalKeyStatus =
  | { ok: true; key: Buffer }
  | { ok: false; reason: 'missing' | 'invalid' };

export function loadPortalEncryptionKey(
  raw: string | undefined = process.env.PORTAL_PASSWORD_ENCRYPTION_KEY
): PortalKeyStatus {
  if (!raw || !String(raw).trim()) {
    return { ok: false, reason: 'missing' };
  }
  const trimmed = String(raw).trim();
  let buf: Buffer | null = null;
  try {
    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
      buf = Buffer.from(trimmed, 'hex');
    } else {
      buf = Buffer.from(trimmed, 'base64');
    }
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (!buf || buf.length !== KEY_LEN) {
    return { ok: false, reason: 'invalid' };
  }
  return { ok: true, key: buf };
}

export function encryptPortalPassword(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALG, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return (
    PREFIX +
    [
      iv.toString('base64url'),
      tag.toString('base64url'),
      ct.toString('base64url'),
    ].join('.')
  );
}

export function decryptPortalPassword(blob: string, key: Buffer): string {
  if (!isEncryptedPortalPassword(blob)) {
    throw new Error('Not an encrypted portal password.');
  }
  const parts = blob.slice(PREFIX.length).split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted portal password.');
  }
  const [ivB64, tagB64, ctB64] = parts;
  const iv = Buffer.from(ivB64, 'base64url');
  const tag = Buffer.from(tagB64, 'base64url');
  const ct = Buffer.from(ctB64, 'base64url');
  if (iv.length !== IV_LEN || tag.length !== TAG_LEN) {
    throw new Error('Malformed encrypted portal password.');
  }
  const decipher = crypto.createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

/** True if a stored record has a retrievable portal password (enc or legacy plaintext). */
export function recordHasPortalPassword(record: {
  password?: string;
  passwordEnc?: string;
}): boolean {
  if (record.passwordEnc && isEncryptedPortalPassword(record.passwordEnc)) {
    return true;
  }
  const p = record.password;
  if (!p || isUnsetPortalPassword(p)) return false;
  if (isEncryptedPortalPassword(p)) return true;
  return true; // legacy plaintext
}
