import { describe, expect, it } from 'vitest';
import {
  FIELD_LIMITS,
  PAN_FORMAT_EXAMPLE,
  clipField,
  isValidPanFormat,
  normalizePanInput,
  validateOptionalEmail,
  validateOptionalPhone,
  validateOptionalText,
  validatePanValue,
  validateRequiredText,
} from '../../src/utils/fieldValidation.ts';

describe('fieldValidation', () => {
  describe('PAN_FORMAT_EXAMPLE', () => {
    it('is structure-valid demo data (not claimed as government-verified)', () => {
      expect(PAN_FORMAT_EXAMPLE).toBe('ABCPK1234D');
      expect(isValidPanFormat(PAN_FORMAT_EXAMPLE)).toBe(true);
      expect(validatePanValue(PAN_FORMAT_EXAMPLE)).toEqual({
        ok: true,
        pan: 'ABCPK1234D',
      });
    });
  });

  describe('normalizePanInput / isValidPanFormat', () => {
    it('normalizes case, strips junk, and caps length', () => {
      expect(normalizePanInput(' abcpk1234d ')).toBe('ABCPK1234D');
      expect(normalizePanInput('ab-cpk-1234-d!!')).toBe('ABCPK1234D');
      expect(normalizePanInput('ABCPK1234DEXTRA')).toBe('ABCPK1234D');
    });

    it('accepts structural PAN and rejects bad shapes', () => {
      expect(isValidPanFormat('ABCPK1234D')).toBe(true);
      expect(isValidPanFormat('ABCPE1234F')).toBe(true);
      expect(isValidPanFormat('ABCDE1234F')).toBe(false);
      expect(isValidPanFormat('ABCPE123F')).toBe(false);
    });
  });

  describe('validatePanValue', () => {
    it('requires PAN by default and allows empty when optional', () => {
      expect(validatePanValue('')).toEqual({ ok: false, error: 'PAN is required.' });
      expect(validatePanValue('', { required: false })).toEqual({ ok: true, pan: '' });
      expect(validatePanValue('   ', { required: true }).ok).toBe(false);
    });

    it('enforces length and format with shared example in errors', () => {
      const short = validatePanValue('ABCPE123');
      expect(short.ok).toBe(false);
      if (!short.ok) {
        expect(short.error).toContain(PAN_FORMAT_EXAMPLE);
        expect(short.error).toMatch(/exactly 10 characters/i);
        expect(short.error).toMatch(/not government-verified/i);
      }

      const badEntity = validatePanValue('ABCDE1234F');
      expect(badEntity.ok).toBe(false);
      if (!badEntity.ok) {
        expect(badEntity.error).toContain(PAN_FORMAT_EXAMPLE);
        expect(badEntity.error).toMatch(/does not verify the PAN with the Income Tax Department/i);
      }

      expect(validatePanValue('abcpk1234d')).toEqual({ ok: true, pan: 'ABCPK1234D' });
      expect(validatePanValue(' abcpe1234f ')).toEqual({ ok: true, pan: 'ABCPE1234F' });
    });
  });

  describe('clipField / required / optional text', () => {
    it('clips to FIELD_LIMITS', () => {
      const long = 'x'.repeat(FIELD_LIMITS.name + 5);
      expect(clipField(long, 'name')).toHaveLength(FIELD_LIMITS.name);
    });

    it('validateRequiredText rejects blank and overlong raw input', () => {
      expect(validateRequiredText('   ', 'Name', 'name').ok).toBe(false);
      expect(validateRequiredText('Ada', 'Name', 'name')).toEqual({
        ok: true,
        value: 'Ada',
      });
      const tooLong = 'y'.repeat(FIELD_LIMITS.name + 1);
      expect(validateRequiredText(tooLong, 'Name', 'name').ok).toBe(false);
    });

    it('validateOptionalText allows empty and rejects overlong', () => {
      expect(validateOptionalText('', 'Remark', 'remark')).toEqual({
        ok: true,
        value: '',
      });
      const tooLong = 'z'.repeat(FIELD_LIMITS.remark + 1);
      expect(validateOptionalText(tooLong, 'Remark', 'remark').ok).toBe(false);
    });
  });

  describe('validateOptionalPhone', () => {
    it('allows empty and valid digit ranges', () => {
      expect(validateOptionalPhone('')).toEqual({ ok: true, value: '' });
      expect(validateOptionalPhone('+91 98765-43210').ok).toBe(true);
    });

    it('rejects illegal characters and digit count', () => {
      expect(validateOptionalPhone('98abc').ok).toBe(false);
      expect(validateOptionalPhone('1234567').ok).toBe(false);
      expect(validateOptionalPhone('1'.repeat(16)).ok).toBe(false);
    });
  });

  describe('validateOptionalEmail', () => {
    it('allows empty and accepts prior shape', () => {
      expect(validateOptionalEmail('')).toEqual({ ok: true, value: '' });
      expect(validateOptionalEmail('User+tag@Example.COM')).toEqual({
        ok: true,
        value: 'user+tag@example.com',
      });
    });

    it('rejects missing @, multiple @, spaces, and domain without dot', () => {
      expect(validateOptionalEmail('nodomain').ok).toBe(false);
      expect(validateOptionalEmail('a@b@c.com').ok).toBe(false);
      expect(validateOptionalEmail('a b@c.com').ok).toBe(false);
      expect(validateOptionalEmail('user@localhost').ok).toBe(false);
    });

    it('rejects overlong email', () => {
      const local = 'a'.repeat(FIELD_LIMITS.email);
      expect(validateOptionalEmail(`${local}@x.co`).ok).toBe(false);
    });
  });
});
