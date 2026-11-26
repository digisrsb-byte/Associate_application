import { describe, expect, it } from 'vitest';
import { hashSecret, verifySecret } from '../../authCrypto.ts';

describe('authCrypto', () => {
  it('hashes a secret and verifies the same secret successfully', () => {
    const secret = 'UnitTest-Secret-Value-01!';
    const { salt, hash } = hashSecret(secret);

    expect(typeof salt).toBe('string');
    expect(typeof hash).toBe('string');
    expect(salt.length).toBe(32); // 16 bytes as hex
    expect(hash.length).toBe(128); // 64 bytes as hex
    expect(/^[0-9a-f]+$/i.test(salt)).toBe(true);
    expect(/^[0-9a-f]+$/i.test(hash)).toBe(true);
    expect(verifySecret(secret, salt, hash)).toBe(true);
  });

  it('rejects a wrong secret against a valid salt/hash pair', () => {
    const { salt, hash } = hashSecret('Correct-Secret-Value-99!');
    expect(verifySecret('Wrong-Secret-Value-99!', salt, hash)).toBe(false);
  });

  it('fails safely on malformed or incompatible salt/hash inputs', () => {
    const { salt, hash } = hashSecret('Valid-Secret-For-Shape-Check!');

    expect(verifySecret('Valid-Secret-For-Shape-Check!', 'zz', hash)).toBe(
      false
    );
    expect(verifySecret('Valid-Secret-For-Shape-Check!', salt, 'not-hex')).toBe(
      false
    );
    expect(verifySecret('Valid-Secret-For-Shape-Check!', salt, 'ab')).toBe(
      false
    );
    expect(verifySecret('Valid-Secret-For-Shape-Check!', '', hash)).toBe(false);
    expect(verifySecret('Valid-Secret-For-Shape-Check!', salt, '')).toBe(false);
  });

  it('produces distinct salts across calls (no fixed salt)', () => {
    const a = hashSecret('Same-Input-Secret-AA!');
    const b = hashSecret('Same-Input-Secret-AA!');
    expect(a.salt === b.salt).toBe(false);
    expect(a.hash === b.hash).toBe(false);
  });
});
