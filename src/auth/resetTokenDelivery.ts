/**
 * Local out-of-band reset-token delivery (no SMTP).
 * JSON backend: single shared file (legacy).
 * Postgres backend: per-email files so two owners never share a token file.
 * Never log raw tokens.
 */
import fs from 'fs';
import path from 'path';

/** Sanitize email for use as a filename segment. */
export function sanitizeEmailForFilename(email: string): string {
  return String(email || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .slice(0, 120);
}

export function jsonResetTokenPath(dataDir: string): string {
  return path.join(dataDir, 'PASSWORD_RESET_TOKEN.txt');
}

export function postgresResetTokenPath(dataDir: string, email: string): string {
  const safe = sanitizeEmailForFilename(email);
  return path.join(dataDir, `PASSWORD_RESET_TOKEN.${safe}.txt`);
}

export function writeLocalResetTokenFile(
  filePath: string,
  token: string,
  expiresAt: Date
): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const body = [
    'ASSOCIATE password reset token',
    'Single-use. Do not share. Expires: ' + expiresAt.toISOString(),
    'Enter this token on the Reset password screen together with your email.',
    '',
    token,
    '',
  ].join('\n');
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, body, 'utf-8');
  fs.renameSync(tmp, filePath);
}

export function clearLocalResetTokenFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // ignore cleanup errors
  }
}
