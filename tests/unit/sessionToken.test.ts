import { describe, expect, it } from 'vitest';
import {
  generateSessionToken,
  hashSessionToken,
} from '../../src/db/sessionToken.ts';

describe('sessionToken', () => {
  it('generates distinct high-entropy tokens', () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).not.toBe(b);
    expect(a.length).toBe(64);
    expect(/^[0-9a-f]+$/i.test(a)).toBe(true);
  });

  it('hashes deterministically for lookup without storing the raw token', () => {
    const raw = generateSessionToken();
    const h1 = hashSessionToken(raw);
    const h2 = hashSessionToken(raw);
    expect(h1).toBe(h2);
    expect(h1).not.toBe(raw);
    expect(h1.length).toBe(64);
    expect(hashSessionToken('other-token')).not.toBe(h1);
  });
});
