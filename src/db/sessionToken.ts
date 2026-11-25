/**
 * Session token hashing for PostgreSQL sessions.token_hash.
 * Deterministic SHA-256 (hex) so a presented cookie can be looked up.
 * Schema has no token_salt column — scrypt+random-salt cannot be used for lookup.
 * Never log raw tokens or hashes.
 */
import crypto from 'crypto';

export function hashSessionToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}
