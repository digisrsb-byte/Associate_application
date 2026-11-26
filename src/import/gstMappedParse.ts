import type ExcelJS from 'exceljs';
import { cellText, parseAmount, unwrapCell } from './excelCells.ts';
import type { ColumnMapping } from './columnMapping.ts';
import { findHeaderRow } from './workbookInspect.ts';
import {
  computeGstFilingTotal,
  normalizeGstMonthLabel,
} from '../utils/ledgerUtils.ts';

export type ParsedGstFiling = {
  month: string;
  fees: number;
  interest: number;
  tax: number;
  total: number;
  totalImported: number | null;
  sourceRow: number;
};

export type ParsedGstCompany = {
  userId: string;
  companyName: string;
  phone: string;
  referenceNumber: string;
  remark: string;
  /** Present only in memory during import — never returned in API preview. */
  password: string;
  totalReceived: number;
  gstin: string;
  filings: Record<string, ParsedGstFiling>;
};

export type GstParseIssue = {
  level: 'error' | 'warn';
  row?: number;
  code: string;
  message: string;
};

export type GstParseResult = {
  companies: ParsedGstCompany[];
  issues: GstParseIssue[];
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

export function parseGstSheetWithMapping(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  mapping: ColumnMapping
): GstParseResult {
  const sheet = workbook.worksheets.find(
    (s) => s.name.trim().toLowerCase() === sheetName.trim().toLowerCase()
  );
  if (!sheet) {
    return {
      companies: [],
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
  const cols = {
    userId: colIndex(sheet, headerRow, mapping.userId),
    companyName: colIndex(sheet, headerRow, mapping.companyName),
    month: colIndex(sheet, headerRow, mapping.month),
    phone: colIndex(sheet, headerRow, mapping.phone),
    referenceNumber: colIndex(sheet, headerRow, mapping.referenceNumber),
    remark: colIndex(sheet, headerRow, mapping.remark),
    password: colIndex(sheet, headerRow, mapping.password),
    fees: colIndex(sheet, headerRow, mapping.fees),
    interest: colIndex(sheet, headerRow, mapping.interest),
    tax: colIndex(sheet, headerRow, mapping.tax),
    total: colIndex(sheet, headerRow, mapping.total),
    totalReceived: colIndex(sheet, headerRow, mapping.totalReceived),
    gstin: colIndex(sheet, headerRow, mapping.gstin),
  };

  const byUser = new Map<string, ParsedGstCompany>();
  const issues: GstParseIssue[] = [];
  let rowsRead = 0;
  let rowsSkipped = 0;
  let duplicateFilingRows = 0;

  sheet.eachRow({ includeEmpty: false }, (row, rn) => {
    if (rn <= headerRow) return;
    rowsRead++;

    const userId = cols.userId
      ? cellText(row.getCell(cols.userId).value)
      : '';
    const companyName = cols.companyName
      ? cellText(row.getCell(cols.companyName).value)
      : '';
    const monthRaw = cols.month
      ? cellText(row.getCell(cols.month).value)
      : '';

    if (!userId && !companyName && !monthRaw) {
      rowsSkipped++;
      return;
    }

    if (!userId) {
      issues.push({
        level: 'error',
        row: rn,
        code: 'missing_user_id',
        message: 'Missing User ID — row skipped.',
      });
      rowsSkipped++;
      return;
    }

    const month = monthRaw ? normalizeGstMonthLabel(monthRaw) : '';
    if (!month) {
      issues.push({
        level: 'error',
        row: rn,
        code: 'invalid_month',
        message: 'Missing or invalid GST month — row skipped.',
      });
      rowsSkipped++;
      return;
    }

    const key = userId.toLowerCase();
    let company = byUser.get(key);
    if (!company) {
      company = {
        userId,
        companyName: companyName || userId,
        phone: cols.phone ? cellText(row.getCell(cols.phone).value) : '',
        referenceNumber: cols.referenceNumber
          ? cellText(row.getCell(cols.referenceNumber).value)
          : '',
        remark: cols.remark ? cellText(row.getCell(cols.remark).value) : '',
        password: cols.password
          ? cellText(row.getCell(cols.password).value)
          : '',
        totalReceived: cols.totalReceived
          ? parseAmount(unwrapCell(row.getCell(cols.totalReceived).value))
          : 0,
        gstin: cols.gstin ? cellText(row.getCell(cols.gstin).value) : '',
        filings: {},
      };
      byUser.set(key, company);
    } else {
      if (companyName) company.companyName = companyName;
      if (cols.password) {
        const p = cellText(row.getCell(cols.password).value);
        if (p) company.password = p;
      }
      if (cols.phone) {
        const p = cellText(row.getCell(cols.phone).value);
        if (p) company.phone = p;
      }
      if (cols.referenceNumber) {
        const r = cellText(row.getCell(cols.referenceNumber).value);
        if (r) company.referenceNumber = r;
      }
      if (cols.remark) {
        const r = cellText(row.getCell(cols.remark).value);
        if (r) company.remark = r;
      }
      if (cols.totalReceived) {
        const recd = parseAmount(
          unwrapCell(row.getCell(cols.totalReceived).value)
        );
        if (recd > company.totalReceived) company.totalReceived = recd;
      }
      if (cols.gstin) {
        const g = cellText(row.getCell(cols.gstin).value);
        if (g) company.gstin = g;
      }
    }

    const fees = cols.fees
      ? parseAmount(unwrapCell(row.getCell(cols.fees).value))
      : 0;
    const interest = cols.interest
      ? parseAmount(unwrapCell(row.getCell(cols.interest).value))
      : 0;
    const tax = cols.tax
      ? parseAmount(unwrapCell(row.getCell(cols.tax).value))
      : 0;
    let totalImported: number | null = null;
    if (cols.total) {
      const raw = unwrapCell(row.getCell(cols.total).value);
      if (raw !== '' && raw != null) totalImported = parseAmount(raw);
    }
    const calculated = computeGstFilingTotal(fees, interest, tax);
    const total =
      totalImported != null && totalImported > 0 ? totalImported : calculated;

    if (company.filings[month]) {
      duplicateFilingRows++;
      issues.push({
        level: 'warn',
        row: rn,
        code: 'duplicate_filing',
        message: 'Duplicate company+month row — later row wins.',
      });
    }

    company.filings[month] = {
      month,
      fees,
      interest,
      tax,
      total,
      totalImported,
      sourceRow: rn,
    };
  });

  return {
    companies: [...byUser.values()],
    issues,
    rowsRead,
    rowsSkipped,
    duplicateFilingRows,
  };
}
