import { describe, expect, it } from 'vitest';
import {
  PAN_FORMAT_EXAMPLE,
  normalizePanInput,
  validatePanValue,
} from '../../src/utils/fieldValidation.ts';

/**
 * Excel import now calls validatePanValue (same as create/update API).
 * These cases lock the shared contract used by excelImport.ts.
 */
describe('Excel import PAN contract (shared with API)', () => {
  it('accepts trimmed lowercase structure-valid PAN', () => {
    expect(validatePanValue(` ${PAN_FORMAT_EXAMPLE.toLowerCase()} `)).toEqual({
      ok: true,
      pan: PAN_FORMAT_EXAMPLE,
    });
  });

  it('rejects invalid entity-type 4th character (no longer imported anyway)', () => {
    const res = validatePanValue('ABCDE1234F');
    expect(res.ok).toBe(false);
    expect(normalizePanInput('ABCDE1234F')).toBe('ABCDE1234F');
  });

  it('rejects malformed length and character positions', () => {
    expect(validatePanValue('ABCPK123').ok).toBe(false);
    expect(validatePanValue('ABC1K1234D').ok).toBe(false);
    expect(validatePanValue('').ok).toBe(false);
  });

  it('normalizes the same way create/update does before format check', () => {
    expect(normalizePanInput('ab-cpk-1234-d')).toBe('ABCPK1234D');
    expect(validatePanValue('ab-cpk-1234-d')).toEqual({
      ok: true,
      pan: 'ABCPK1234D',
    });
  });
});
