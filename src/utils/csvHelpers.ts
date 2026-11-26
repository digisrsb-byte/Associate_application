/**
 * Shared CSV cell escaping and row serialization.
 * Preserve Excel-compatible quoting, commas, and CRLF line endings.
 */

export type CsvCellValue = string | number | undefined | null;

/**
 * Neutralize Excel/Sheets formula injection when generating downloadable CSV.
 * Prefixes cells that start with = + - @ or tab/CR.
 */
export function neutralizeCsvFormula(value: CsvCellValue): string {
  const str = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(str)) return `'${str}`;
  return str;
}

export function escapeCsvCell(value: CsvCellValue): string {
  const str = neutralizeCsvFormula(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Join rows with commas; separate lines with CRLF (\r\n). */
export function toCsvLines(rows: CsvCellValue[][]): string {
  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
}
