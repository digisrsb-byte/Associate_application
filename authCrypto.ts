/**
 * Authentication secret hashing (password + reset-token).
 * Contract must stay identical to the former server.ts helpers:
 * - crypto.scryptSync with Node defaults (N/r/p/maxmem)
 * - 64-byte derived key
 * - 16-byte random salt, hex-encoded
 * - hash hex-encoded
 * - verify via crypto.timingSafeEqual
 */
import crypto from 'crypto';

function scryptHash(secret: string, salt: Buffer): string {
  return crypto.scryptSync(secret, salt, 64).toString('hex');
}

export function hashSecret(secret: string): { salt: string; hash: string } {
  const salt = crypto.randomBytes(16);
  return { salt: salt.toString('hex'), hash: scryptHash(secret, salt) };
}

export function verifySecret(
  secret: string,
  saltHex: string,
  hashHex: string
): boolean {
  try {
    const salt = Buffer.from(saltHex, 'hex');
    const actual = Buffer.from(scryptHash(secret, salt), 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    if (actual.length !== expected.length) return false;
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
