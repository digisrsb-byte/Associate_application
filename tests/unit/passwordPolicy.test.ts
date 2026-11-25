import { describe, expect, it } from 'vitest';
import { validatePasswordPolicy } from '../../passwordPolicy.ts';

describe('validatePasswordPolicy', () => {
  it('accepts a strong password', () => {
    expect(validatePasswordPolicy('Str0ng!Pass#99')).toEqual({ ok: true });
  });

  it('rejects short, long, missing classes, and common weak passwords', () => {
    expect(validatePasswordPolicy('Short1!a').ok).toBe(false);
    expect(validatePasswordPolicy('a'.repeat(129)).ok).toBe(false);
    expect(validatePasswordPolicy('alllowercase1!').ok).toBe(false);
    expect(validatePasswordPolicy('ALLUPPERCASE1!').ok).toBe(false);
    expect(validatePasswordPolicy('NoDigitsHere!').ok).toBe(false);
    expect(validatePasswordPolicy('NoSpecialChar1').ok).toBe(false);
    expect(validatePasswordPolicy('Password123!').ok).toBe(false);
  });

  it('rejects password containing email local-part when provided', () => {
    const result = validatePasswordPolicy('AdminUser!2345', {
      email: 'adminuser@example.com',
    });
    expect(result.ok).toBe(false);
  });
});
