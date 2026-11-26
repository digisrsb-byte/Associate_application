import { describe, expect, it } from 'vitest';
import crypto from 'crypto';
import {
  decryptPortalPassword,
  encryptPortalPassword,
  isEncryptedPortalPassword,
  isUnsetPortalPassword,
  loadPortalEncryptionKey,
  recordHasPortalPassword,
} from '../../portalCrypto.ts';

const HEX_KEY = crypto.randomBytes(32).toString('hex');
const key = Buffer.from(HEX_KEY, 'hex');

describe('portalCrypto', () => {
  it('detects unset and encrypted portal passwords', () => {
    expect(isUnsetPortalPassword(null)).toBe(true);
    expect(isUnsetPortalPassword('')).toBe(true);
    expect(isUnsetPortalPassword('NOT SET')).toBe(true);
    expect(isUnsetPortalPassword('n/a')).toBe(true);
    expect(isUnsetPortalPassword('secret')).toBe(false);

    expect(isEncryptedPortalPassword('enc:v1:a.b.c')).toBe(true);
    expect(isEncryptedPortalPassword('plain')).toBe(false);
    expect(isEncryptedPortalPassword(null)).toBe(false);
  });

  it('loads hex and base64 keys and rejects invalid material', () => {
    expect(loadPortalEncryptionKey(HEX_KEY)).toEqual({ ok: true, key });
    const b64 = crypto.randomBytes(32).toString('base64');
    const loaded = loadPortalEncryptionKey(b64);
    expect(loaded.ok).toBe(true);
    expect(loadPortalEncryptionKey(undefined).ok).toBe(false);
    const missing = loadPortalEncryptionKey('');
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reason).toBe('missing');
    const shortKey = loadPortalEncryptionKey('short');
    expect(shortKey.ok).toBe(false);
    if (!shortKey.ok) expect(shortKey.reason).toBe('invalid');
    const wrongLen = loadPortalEncryptionKey('abcd'.repeat(8));
    expect(wrongLen.ok).toBe(false);
    if (!wrongLen.ok) expect(wrongLen.reason).toBe('invalid');
  });

  it('round-trips encrypt/decrypt and rejects malformed blobs', () => {
    const blob = encryptPortalPassword('portal-secret', key);
    expect(blob.startsWith('enc:v1:')).toBe(true);
    expect(decryptPortalPassword(blob, key)).toBe('portal-secret');

    expect(() => decryptPortalPassword('not-encrypted', key)).toThrow(
      /Not an encrypted/
    );
    expect(() => decryptPortalPassword('enc:v1:only.two', key)).toThrow(
      /Malformed/
    );
  });

  it('recordHasPortalPassword covers enc, legacy, and unset', () => {
    const enc = encryptPortalPassword('x', key);
    expect(recordHasPortalPassword({ passwordEnc: enc })).toBe(true);
    expect(recordHasPortalPassword({ password: 'legacy' })).toBe(true);
    expect(recordHasPortalPassword({ password: enc })).toBe(true);
    expect(recordHasPortalPassword({ password: 'NOT SET' })).toBe(false);
    expect(recordHasPortalPassword({})).toBe(false);
  });
});
