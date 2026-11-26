/**
 * Administrator password policy (Phase 4).
 * Applied when setting a new password (bootstrap / reset), not when verifying existing hashes.
 */

const COMMON_WEAK = new Set(
  [
    'password',
    'password1',
    'password123',
    'password123!',
    'admin',
    'admin123',
    'admin@123',
    'admin@1234',
    'administrator',
    'welcome',
    'welcome1',
    'qwerty',
    'qwerty123',
    'letmein',
    'changeme',
    'changeme1',
    '123456',
    '12345678',
    '123456789012',
    'iloveyou',
    'monkey',
    'dragon',
    'master',
    'login',
    'abc123',
    'passw0rd',
    'p@ssw0rd',
    'p@ssword',
    'srsb',
    'srsb@123',
    'srsbassociate',
    'taxledger',
    'taxledger123',
  ].map((s) => s.toLowerCase())
);

const SPECIAL_RE = /[^A-Za-z0-9]/;

export type PasswordPolicyResult =
  | { ok: true }
  | { ok: false; error: string };

export function validatePasswordPolicy(
  password: string,
  options?: { email?: string }
): PasswordPolicyResult {
  if (typeof password !== 'string' || password.length < 12) {
    return {
      ok: false,
      error: 'Password must be at least 12 characters.',
    };
  }
  if (password.length > 128) {
    return {
      ok: false,
      error: 'Password must be at most 128 characters.',
    };
  }
  if (!/[a-z]/.test(password)) {
    return {
      ok: false,
      error: 'Password must include at least one lowercase letter.',
    };
  }
  if (!/[A-Z]/.test(password)) {
    return {
      ok: false,
      error: 'Password must include at least one uppercase letter.',
    };
  }
  if (!/[0-9]/.test(password)) {
    return {
      ok: false,
      error: 'Password must include at least one number.',
    };
  }
  if (!SPECIAL_RE.test(password)) {
    return {
      ok: false,
      error: 'Password must include at least one special character.',
    };
  }
  const lower = password.toLowerCase();
  if (COMMON_WEAK.has(lower)) {
    return {
      ok: false,
      error: 'Password is too common or weak. Choose a stronger password.',
    };
  }
  // Reject obvious keyboard / repeated patterns
  if (/^(.)\1+$/.test(password) || /^(0123456789|abcdefghijklmnopqrstuvwxyz)$/i.test(password)) {
    return {
      ok: false,
      error: 'Password is too common or weak. Choose a stronger password.',
    };
  }
  const email = String(options?.email || '')
    .trim()
    .toLowerCase();
  if (email) {
    const local = email.split('@')[0] || '';
    if (local.length >= 3 && lower.includes(local)) {
      return {
        ok: false,
        error: 'Password must not contain your email username.',
      };
    }
    if (lower === email) {
      return {
        ok: false,
        error: 'Password must not be the same as your email.',
      };
    }
  }
  return { ok: true };
}
