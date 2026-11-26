import { describe, expect, it } from 'vitest';
import {
  cellText,
  looksLikeXlsxBuffer,
  normalizeAy,
  parseAmount,
  toIsoDate,
  unwrapCell,
} from '../../src/import/excelCells.ts';

describe('excelCells', () => {
  it('unwrapCell handles primitives, rich text, formula result, and nested result', () => {
    expect(unwrapCell(null)).toBe('');
    expect(unwrapCell('  hi ')).toBe('  hi ');
    expect(unwrapCell({ richText: [{ text: 'A' }, { text: 'B' }] } as never)).toBe(
      'AB'
    );
    expect(unwrapCell({ text: 'plain' } as never)).toBe('plain');
    expect(unwrapCell({ formula: '1+1', result: 2 } as never)).toBe(2);
    expect(unwrapCell({ sharedFormula: 'A1', result: undefined } as never)).toBe(
      ''
    );
    expect(unwrapCell({ result: { text: 'nested' } } as never)).toBe('nested');
    const d = new Date('2026-04-01T00:00:00.000Z');
    expect(unwrapCell(d)).toBe(d);
  });

  it('cellText trims and drops dates', () => {
    expect(cellText('  x  ')).toBe('x');
    expect(cellText(new Date('2026-04-01T00:00:00.000Z') as never)).toBe('');
    expect(cellText(null)).toBe('');
  });

  it('parseAmount clamps and parses currency strings', () => {
    expect(parseAmount(null)).toBe(0);
    expect(parseAmount(12.345)).toBe(12.35);
    expect(parseAmount(-5)).toBe(0);
    expect(parseAmount('₹1,250.5')).toBe(1250.5);
    expect(parseAmount('nope')).toBe(0);
  });

  it('toIsoDate accepts Date and common text forms', () => {
    expect(toIsoDate('')).toEqual({ iso: '', ok: true, wasDate: false });
    expect(toIsoDate(new Date('2026-04-15T12:00:00.000Z')).iso).toBe(
      '2026-04-15'
    );
    expect(toIsoDate('2026-04-15').ok).toBe(true);
    expect(toIsoDate('15/04/2026')).toEqual({
      iso: '2026-04-15',
      ok: true,
      wasDate: false,
    });
    expect(toIsoDate('15-Apr-2026')).toEqual({
      iso: '2026-04-15',
      ok: true,
      wasDate: false,
    });
    expect(toIsoDate('2026-04-15 10:00').iso).toBe('2026-04-15');
    expect(toIsoDate('not-a-date').ok).toBe(false);
    expect(toIsoDate(45000).ok).toBe(true);
  });

  it('normalizeAy and looksLikeXlsxBuffer cover import guards', () => {
    expect(normalizeAy('AY 2024-25')).toBe('AY 2024-25');
    expect(normalizeAy('2024-2025')).toBe('AY 2024-25');
    expect(normalizeAy('')).toBeNull();
    expect(looksLikeXlsxBuffer(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0]))).toBe(
      true
    );
    expect(looksLikeXlsxBuffer(Buffer.from([0, 1, 2]))).toBe(false);
  });
});
