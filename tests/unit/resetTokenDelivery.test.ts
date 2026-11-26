import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearLocalResetTokenFile,
  jsonResetTokenPath,
  postgresResetTokenPath,
  sanitizeEmailForFilename,
  writeLocalResetTokenFile,
} from '../../src/auth/resetTokenDelivery.ts';

describe('resetTokenDelivery', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  it('keeps distinct per-email postgres token paths', () => {
    const dir = '/tmp/data';
    const a = postgresResetTokenPath(dir, 'owner.a@example.com');
    const b = postgresResetTokenPath(dir, 'owner.b@example.com');
    expect(a).not.toBe(b);
    expect(a).not.toBe(jsonResetTokenPath(dir));
    expect(sanitizeEmailForFilename('Owner.A@Example.com')).toBe(
      'owner.a_example.com'
    );
  });

  it('writes and clears a local token file without embedding secrets in the path API', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reset-token-'));
    tmpDirs.push(dir);
    const filePath = postgresResetTokenPath(dir, 'owner.a@example.com');
    const token = 'synthetic-reset-token-value';
    writeLocalResetTokenFile(filePath, token, new Date('2026-01-01T00:15:00Z'));
    expect(fs.existsSync(filePath)).toBe(true);
    const body = fs.readFileSync(filePath, 'utf8');
    expect(body).toContain(token);
    clearLocalResetTokenFile(filePath);
    expect(fs.existsSync(filePath)).toBe(false);
  });
});
