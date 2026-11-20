import ExcelJS from 'exceljs';
import type { GstClientRecord, GstMonthlyFiling } from '../types/ledger.ts';
import { computeGstFilingTotal, sortGstMonths } from './ledgerUtils.ts';

export type GstDetectedSheets = {
  name: string;
  rows: number;
}[];

export type GstImportIssue = {
  sheet: string;
  row?: number;
  message: string;
};

export type GstImportPreview = {
  companies: {
    userId: string;
    companyName: string;
    password: string;
    phone: string;
    referenceNumber: string;
    remark: string;
    totalReceived: number;
    filings: Record<string, GstMonthlyFiling>;
  }[];
  issues: GstImportIssue[];
  months: string[];
};

function unwrapCell(value: ExcelJS.CellValue): unknown {
  if (value && typeof value === 'object' && 'result' in value) {
    return unwrapCell((value as { result: ExcelJS.CellValue }).result);
  }
  if (value && typeof value === 'object' && 'text' in value) {
    return (value as { text: string }).text;
  }
  if (value && typeof value === 'object' && 'richText' in value) {
    return ((value as { richText: { text: string }[] }).richText || [])
      .map((t) => t.text)
      .join('');
  }
  return value;
}

function cellText(value: ExcelJS.CellValue): string {
  const v = unwrapCell(value);
  if (v == null) return '';
  return String(v).trim();
}

function cellNumber(value: ExcelJS.CellValue): number {
  const v = unwrapCell(value);
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, v);
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function findSheet(
  wb: ExcelJS.Workbook,
  name: string
): ExcelJS.Worksheet | undefined {
  return wb.worksheets.find(
    (s) => s.name.trim().toLowerCase() === name.trim().toLowerCase()
  );
}

function headerMap(row: ExcelJS.Row): Map<string, number> {
  const map = new Map<string, number>();
  row.eachCell({ includeEmpty: true }, (cell, col) => {
    const key = cellText(cell.value).toLowerCase();
    if (key) map.set(key, col);
  });
  return map;
}

function col(
  map: Map<string, number>,
  ...names: string[]
): number | undefined {
  for (const n of names) {
    const c = map.get(n.toLowerCase());
    if (c) return c;
  }
  return undefined;
}

async function loadWorkbook(file: File): Promise<ExcelJS.Workbook> {
  const buf = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb;
}

function countDataRows(sheet: ExcelJS.Worksheet): number {
  let n = 0;
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const first = cellText(row.getCell(1).value);
    const third = cellText(row.getCell(3).value);
    if (first || third) n += 1;
  });
  return n;
}

export async function detectGstSheets(
  file: File
): Promise<{ sheets: GstDetectedSheets; workbook: ExcelJS.Workbook }> {
  const workbook = await loadWorkbook(file);
  const names = ['Month Summary', 'All Data', 'Company Summary', 'Notes'];
  const sheets: GstDetectedSheets = [];
  for (const name of names) {
    const ws = findSheet(workbook, name);
    if (ws) sheets.push({ name, rows: countDataRows(ws) });
  }
  if (sheets.length === 0) {
    throw new Error(
      'No recognised GST sheet found (All Data, Company Summary, Month Summary).'
    );
  }
  return { sheets, workbook };
}

export function parseGstAllData(
  workbook: ExcelJS.Workbook
): GstImportPreview {
  const sheet = findSheet(workbook, 'All Data');
  const issues: GstImportIssue[] = [];
  if (!sheet) {
    return { companies: [], issues: [{ sheet: 'All Data', message: 'Sheet missing' }], months: [] };
  }

  const headers = headerMap(sheet.getRow(1));
  const cMonth = col(headers, 'month');
  const cName = col(headers, 'company name');
  const cUser = col(headers, 'user id');
  const cPassword = col(headers, 'password');
  const cPhone = col(headers, 'phone', 'mobile');
  const cRef = col(headers, 'ref no', 'reference no', 'reference number');
  const cRemark = col(headers, 'remark');
  const cFees = col(headers, 'fees');
  const cInterest = col(headers, 'interest');
  const cTax = col(headers, 'tax');
  const cTotal = col(headers, 'total');
  const cRecd = col(
    headers,
    'total recd',
    'company total recd',
    'total received'
  );

  if (!cName || !cUser) {
    issues.push({
      sheet: 'All Data',
      message: 'Required columns Company Name and User ID not found',
    });
    return { companies: [], issues, months: [] };
  }

  type Acc = GstImportPreview['companies'][number];
  const byUser = new Map<string, Acc>();
  const monthsSet = new Set<string>();

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const userId = cellText(row.getCell(cUser).value);
    const companyName = cellText(row.getCell(cName).value);
    if (!userId && !companyName) return;
    if (!userId) {
      issues.push({
        sheet: 'All Data',
        row: rowNumber,
        message: 'Missing User ID — row skipped',
      });
      return;
    }

    const key = userId.toLowerCase();
    let acc = byUser.get(key);
    if (!acc) {
      acc = {
        userId,
        companyName: companyName || userId,
        password: cPassword ? cellText(row.getCell(cPassword).value) : '',
        phone: cPhone ? cellText(row.getCell(cPhone).value) : '',
        referenceNumber: cRef ? cellText(row.getCell(cRef).value) : '',
        remark: cRemark ? cellText(row.getCell(cRemark).value) : '',
        totalReceived: cRecd ? cellNumber(row.getCell(cRecd).value) : 0,
        filings: {},
      };
      byUser.set(key, acc);
    } else {
      if (companyName) acc.companyName = companyName;
      if (cPassword) {
        const p = cellText(row.getCell(cPassword).value);
        if (p) acc.password = p;
      }
      if (cPhone) {
        const p = cellText(row.getCell(cPhone).value);
        if (p) acc.phone = p;
      }
      if (cRef) {
        const r = cellText(row.getCell(cRef).value);
        if (r) acc.referenceNumber = r;
      }
      if (cRemark) {
        const r = cellText(row.getCell(cRemark).value);
        if (r) acc.remark = r;
      }
      if (cRecd) {
        const recd = cellNumber(row.getCell(cRecd).value);
        if (recd > acc.totalReceived) acc.totalReceived = recd;
      }
    }

    const month = cMonth ? cellText(row.getCell(cMonth).value) : '';
    if (!month) return;
    monthsSet.add(month);

    const fees = cFees ? cellNumber(row.getCell(cFees).value) : 0;
    const interest = cInterest ? cellNumber(row.getCell(cInterest).value) : 0;
    const tax = cTax ? cellNumber(row.getCell(cTax).value) : 0;
    const totalRaw = cTotal ? cellNumber(row.getCell(cTotal).value) : 0;
    const total =
      totalRaw > 0 ? totalRaw : computeGstFilingTotal(fees, interest, tax);

    acc.filings[month] = {
      month,
      fees,
      interest,
      tax,
      total,
    };
  });

  return {
    companies: [...byUser.values()],
    issues,
    months: sortGstMonths([...monthsSet]),
  };
}

export function gstPreviewToRecords(
  preview: GstImportPreview
): Omit<GstClientRecord, 'id' | 'createdAt' | 'updatedAt'>[] {
  return preview.companies.map((c) => ({
    companyName: c.companyName,
    userId: c.userId,
    password: c.password || 'NOT SET',
    phone: c.phone,
    referenceNumber: c.referenceNumber,
    remark: c.remark,
    totalReceived: c.totalReceived,
    filings: c.filings,
  }));
}
