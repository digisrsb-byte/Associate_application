import { describe, expect, it } from 'vitest';
import { escapeCsvCell, toCsvLines } from '../../src/utils/csvHelpers.ts';

describe('escapeCsvCell', () => {
  it('stringifies nullish as empty', () => {
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(undefined)).toBe('');
  });

  it('passes through plain values unchanged', () => {
    expect(escapeCsvCell('Name')).toBe('Name');
    expect(escapeCsvCell(0)).toBe('0');
    expect(escapeCsvCell(1250)).toBe('1250');
  });

  it('quotes values containing comma, quote, or line breaks', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCsvCell('line1\rline2')).toBe('"line1\rline2"');
  });

  it('doubles embedded quotes inside quoted cells', () => {
    expect(escapeCsvCell('a,"b",c')).toBe('"a,""b"",c"');
  });
});

describe('toCsvLines', () => {
  it('joins cells with commas and rows with CRLF', () => {
    expect(toCsvLines([['A', 'B'], ['1', '2']])).toBe('A,B\r\n1,2');
  });

  it('applies escaping per cell', () => {
    expect(toCsvLines([['x,y', 'ok'], ['', null]])).toBe('"x,y",ok\r\n,');
  });

  it('preserves password blank column as empty cell', () => {
    const line = toCsvLines([['Name', 'Password', 'PAN'], ['Acme', '', 'ABCPK1234D']]);
    expect(line).toBe('Name,Password,PAN\r\nAcme,,ABCPK1234D');
  });
});
