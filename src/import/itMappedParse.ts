import type ExcelJS from 'exceljs';
import {
  cellText,
  normalizeAy,
  parseAmount,
  toIsoDate,
  unwrapCell,
} from './excelCells.ts';
import type { ColumnMapping } from './columnMapping.ts';
import { findHeaderRow, headingsAt } from './workbookInspect.ts';

export type ParsedItFiling = {
  assessmentYear: string;
  filingDate: string;
  fees: number;
  received: number;
  outstanding: number | null;
  paymentType: string;
  paymentReceiveDate: string;
  sourceRow: number;
};

export type ParsedItClient = {
  pan: string;
  name: string;
  phone: string;
  otherMobiles: string;
  nameVariants: string;
  filings: Record<string, ParsedItFiling>;
};

export type ItParseIssue = {
  level: 'error' | 'warn';
  row?: number;
  code: string;
  message: string;
};

export type ItParseResult = {
  clients: ParsedItClient[];
  issues: ItParseIssue[];
  rowsRead: number;
  rowsSkipped: number;
  duplicateFilingRows: number;
};

function colIndex(
  sheet: ExcelJS.Worksheet,
  headerRow: number,
  heading: string | null | undefined
): number | null {
  if (!heading) return null;
  let found: number | null = null;
  sheet.getRow(headerRow).eachCell({ includeEmpty: false }, (c, col) => {
    if (cellText(c.value) === heading) found = col;
  });
  return found;
}

export function parseItSheetWithMapping(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  mapping: ColumnMapping
): ItParseResult {
  const sheet = workbook.worksheets.find(
    (s) => s.name.trim().toLowerCase() === sheetName.trim().toLowerCase()
  );
  if (!sheet) {
    return {
      clients: [],
      issues: [
        {
          level: 'error',
          code: 'sheet_missing',
          message: `Worksheet "${sheetName}" not found.`,
        },
      ],
      rowsRead: 0,
      rowsSkipped: 0,
      duplicateFilingRows: 0,
    };
  }

  const headerRow = findHeaderRow(sheet);
  const headings = headingsAt(sheet, headerRow);
  void headings;

  const cols = {
    pan: colIndex(sheet, headerRow, mapping.pan),
    name: colIndex(sheet, headerRow, mapping.name),
    ay: colIndex(sheet, headerRow, mapping.assessmentYear),
    phone: colIndex(sheet, headerRow, mapping.phone),
    otherMobiles: colIndex(sheet, headerRow, mapping.otherMobiles),
    nameVariants: colIndex(sheet, headerRow, mapping.nameVariants),
    filingDate: colIndex(sheet, headerRow, mapping.filingDate),
    fees: colIndex(sheet, headerRow, mapping.fees),
    received: colIndex(sheet, headerRow, mapping.received),
    outstanding: colIndex(sheet, headerRow, mapping.outstanding),
    paymentType: colIndex(sheet, headerRow, mapping.paymentType),
    paymentReceiveDate: colIndex(sheet, headerRow, mapping.paymentReceiveDate),
  };

  const byPan = new Map<string, ParsedItClient>();
  const issues: ItParseIssue[] = [];
  let rowsRead = 0;
  let rowsSkipped = 0;
  let duplicateFilingRows = 0;

  sheet.eachRow({ includeEmpty: false }, (row, rn) => {
    if (rn <= headerRow) return;
    rowsRead++;

    const panRaw = cols.pan ? cellText(row.getCell(cols.pan).value) : '';
    const name = cols.name ? cellText(row.getCell(cols.name).value) : '';
    const ayRaw = cols.ay ? cellText(row.getCell(cols.ay).value) : '';

    if (!panRaw && !name && !ayRaw) {
      rowsSkipped++;
      return;
    }

    const pan = panRaw.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!pan) {
      issues.push({
        level: 'error',
        row: rn,
        code: 'missing_pan',
        message: 'Missing PAN / Client ID — row skipped.',
      });
      rowsSkipped++;
      return;
    }

    const ay = normalizeAy(ayRaw);
    if (!ay) {
      issues.push({
        level: 'error',
        row: rn,
        code: 'invalid_ay',
        message: 'Missing or invalid Assessment Year — row skipped.',
      });
      rowsSkipped++;
      return;
    }

    let client = byPan.get(pan);
    if (!client) {
      client = {
        pan,
        name: name || pan,
        phone: cols.phone ? cellText(row.getCell(cols.phone).value) : '',
        otherMobiles: cols.otherMobiles
          ? cellText(row.getCell(cols.otherMobiles).value)
          : '',
        nameVariants: cols.nameVariants
          ? cellText(row.getCell(cols.nameVariants).value)
          : '',
        filings: {},
      };
      byPan.set(pan, client);
    } else {
      if (name) client.name = name;
      if (cols.phone) {
        const p = cellText(row.getCell(cols.phone).value);
        if (p) client.phone = p;
      }
      if (cols.otherMobiles) {
        const p = cellText(row.getCell(cols.otherMobiles).value);
        if (p) client.otherMobiles = p;
      }
      if (cols.nameVariants) {
        const p = cellText(row.getCell(cols.nameVariants).value);
        if (p) client.nameVariants = p;
      }
    }

    const fees = cols.fees
      ? parseAmount(unwrapCell(row.getCell(cols.fees).value))
      : 0;
    const received = cols.received
      ? parseAmount(unwrapCell(row.getCell(cols.received).value))
      : 0;
    let outstanding: number | null = null;
    if (cols.outstanding) {
      const raw = unwrapCell(row.getCell(cols.outstanding).value);
      if (raw !== '' && raw != null) {
        outstanding = parseAmount(raw);
      }
    }

    const filingDateRaw = cols.filingDate
      ? unwrapCell(row.getCell(cols.filingDate).value)
      : '';
    const filingDateParsed = toIsoDate(filingDateRaw);
    if (filingDateRaw !== '' && filingDateRaw != null && !filingDateParsed.ok) {
      issues.push({
        level: 'warn',
        row: rn,
        code: 'invalid_filing_date',
        message: 'Filing date could not be parsed; left blank.',
      });
    }

    const payDateRaw = cols.paymentReceiveDate
      ? unwrapCell(row.getCell(cols.paymentReceiveDate).value)
      : '';
    const payDateParsed = toIsoDate(payDateRaw);

    if (client.filings[ay]) {
      duplicateFilingRows++;
      issues.push({
        level: 'warn',
        row: rn,
        code: 'duplicate_filing',
        message: 'Duplicate client+AY row — later row wins.',
      });
    }

    client.filings[ay] = {
      assessmentYear: ay,
      filingDate: filingDateParsed.ok ? filingDateParsed.iso : '',
      fees,
      received,
      outstanding,
      paymentType: cols.paymentType
        ? cellText(row.getCell(cols.paymentType).value)
        : '',
      paymentReceiveDate: payDateParsed.ok ? payDateParsed.iso : '',
      sourceRow: rn,
    };
  });

  return {
    clients: [...byPan.values()],
    issues,
    rowsRead,
    rowsSkipped,
    duplicateFilingRows,
  };
}
