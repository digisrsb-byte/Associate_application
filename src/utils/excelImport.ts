import ExcelJS from 'exceljs';
import type { LedgerState } from '../types/ledger.ts';
import { sortAssessmentYears } from './ledgerUtils.ts';
import {
  computeClientSummaries,
  computeMobileSummaries,
  computeYearSummary,
} from './summaryUtils.ts';

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const SHEET_NAMES = [
  'All Data',
  'Client Summary',
  'Mobile Summary',
  'Year Summary',
  'Review Needed',
] as const;

export type ImportIssue = {
  level: 'warn' | 'skip';
  row?: number;
  pan?: string;
  ay?: string;
  message: string;
};

export type ImportFiling = {
  filingDate: string;
  fees: number;
  received: number;
  paymentType: string;
  paymentReceiveDate: string;
};

export type ImportClient = {
  pan: string;
  name: string;
  phone: string;
  otherMobiles: string;
  nameVariants: string;
  filings: Record<string, ImportFiling>;
};

export type ImportPreview = {
  clients: ImportClient[];
  stats: {
    rowsRead: number;
    rowsSkipped: number;
    uniqueClients: number;
    years: string[];
    duplicateClientYearRows: number;
  };
  issues: ImportIssue[];
};

export type DetectedSheet = {
  name: string;
  present: boolean;
  rowCount: number;
};

export type DetectedSheets = DetectedSheet[];

function unwrapCell(value: ExcelJS.CellValue): unknown {
  if (value == null) return '';
  if (typeof value === 'object') {
    if (value instanceof Date) return value;
    if ('result' in value && (value as { result?: unknown }).result !== undefined) {
      return unwrapCell((value as { result: ExcelJS.CellValue }).result);
    }
    if ('richText' in value && Array.isArray((value as { richText: { text: string }[] }).richText)) {
      return (value as { richText: { text: string }[] }).richText.map((t) => t.text).join('');
    }
    if ('text' in value && typeof (value as { text: unknown }).text === 'string') {
      return (value as { text: string }).text;
    }
    if ('formula' in value) return '';
  }
  return value;
}

function cellText(value: ExcelJS.CellValue): string {
  const v = unwrapCell(value);
  if (v == null) return '';
  if (v instanceof Date) return '';
  return String(v).trim();
}

function findSheet(wb: ExcelJS.Workbook, name: string): ExcelJS.Worksheet | undefined {
  const lower = name.toLowerCase();
  return wb.worksheets.find((s) => s.name.trim().toLowerCase() === lower);
}

function headerMap(row: ExcelJS.Row): Map<string, number> {
  const map = new Map<string, number>();
  row.eachCell({ includeEmpty: false }, (cell, col) => {
    const key = cellText(cell.value).toLowerCase();
    if (key) map.set(key, col);
  });
  return map;
}

function colBy(headers: Map<string, number>, ...names: string[]): number | undefined {
  for (const n of names) {
    const c = headers.get(n.toLowerCase());
    if (c != null) return c;
  }
  return undefined;
}

function normalizeAy(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  let m = s.match(/^AY\s*(\d{4})\s*[-–]\s*(\d{2}|\d{4})$/i);
  if (m) {
    const start = m[1];
    const end = m[2].length === 2 ? m[2] : m[2].slice(-2);
    return `AY ${start}-${end}`;
  }
  m = s.match(/^(\d{4})\s*[-–]\s*(\d{2}|\d{4})$/);
  if (m) {
    const start = m[1];
    const end = m[2].length === 2 ? m[2] : m[2].slice(-2);
    return `AY ${start}-${end}`;
  }
  return null;
}

function aySortKey(ay: string): number {
  const m = ay.match(/(\d{4})/);
  return m ? Number(m[1]) : 0;
}

function normalizeMobileDigits(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
}

function isValidMobile(digits: string): boolean {
  return /^[6-9]\d{9}$/.test(digits);
}

function parseAmount(raw: unknown): number {
  if (raw == null || raw === '') return 0;
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(0, Math.round(raw));
  const s = String(raw).replace(/[₹,\s]/g, '').trim();
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

function toIsoDate(value: unknown): { iso: string; ok: boolean; wasDate: boolean } {
  if (value == null || value === '') return { iso: '', ok: true, wasDate: false };
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return { iso: `${y}-${m}-${d}`, ok: true, wasDate: true };
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Excel serial date (days since 1899-12-30)
    const epoch = Date.UTC(1899, 11, 30);
    const ms = epoch + Math.round(value) * 86400000;
    const dt = new Date(ms);
    if (!Number.isNaN(dt.getTime()) && value > 20000 && value < 80000) {
      const y = dt.getUTCFullYear();
      const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
      const d = String(dt.getUTCDate()).padStart(2, '0');
      return { iso: `${y}-${m}-${d}`, ok: true, wasDate: true };
    }
  }
  const s = String(value).trim();
  if (!s) return { iso: '', ok: true, wasDate: false };

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { iso: `${m[1]}-${m[2]}-${m[3]}`, ok: true, wasDate: false };

  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    return { iso: `${m[3]}-${mm}-${dd}`, ok: true, wasDate: false };
  }

  m = s.match(/^(\d{1,2})[-\/\s]([A-Za-z]{3})[-\/\s](\d{4})$/);
  if (m) {
    const mon = MONTHS[m[2].toLowerCase().slice(0, 3)];
    if (mon != null) {
      const dd = m[1].padStart(2, '0');
      const mm = String(mon + 1).padStart(2, '0');
      return { iso: `${m[3]}-${mm}-${dd}`, ok: true, wasDate: false };
    }
  }

  // datetime like 2025-07-11 00:00:00
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+\d/);
  if (m) return { iso: `${m[1]}-${m[2]}-${m[3]}`, ok: true, wasDate: true };

  return { iso: '', ok: false, wasDate: false };
}

function normalizePaymentMode(
  raw: unknown,
  received: number
): { mode: string; paymentDateFromMode?: string; unrecognised?: boolean } {
  const unwrapped = unwrapCell(raw as ExcelJS.CellValue);
  if (unwrapped instanceof Date) {
    const { iso } = toIsoDate(unwrapped);
    return {
      mode: received === 0 ? 'Pending' : '',
      paymentDateFromMode: iso || undefined,
    };
  }
  if (typeof unwrapped === 'number' && unwrapped > 20000 && unwrapped < 80000) {
    const { iso, wasDate } = toIsoDate(unwrapped);
    if (wasDate) {
      return {
        mode: received === 0 ? 'Pending' : '',
        paymentDateFromMode: iso || undefined,
      };
    }
  }

  const text = String(unwrapped ?? '').trim();
  if (!text) {
    return { mode: received === 0 ? 'Pending' : '' };
  }

  // date-looking text in payment mode
  const asDate = toIsoDate(text);
  if (
    asDate.ok &&
    asDate.iso &&
    (/^\d{4}-\d{2}-\d{2}/.test(text) || asDate.wasDate)
  ) {
    return {
      mode: received === 0 ? 'Pending' : '',
      paymentDateFromMode: asDate.iso,
    };
  }

  const key = text.toLowerCase().replace(/[\s.\-]/g, '');
  const map: Record<string, string> = {
    gpay: 'GPay',
    googlepay: 'GPay',
    phonepe: 'PhonePe',
    phonepay: 'PhonePe',
    ppay: 'P-Pay',
    bob: 'BOB',
    cash: 'Cash',
    upi: 'UPI',
    bank: 'Bank Transfer',
    banktransfer: 'Bank Transfer',
    account: 'Bank Transfer',
    neft: 'Bank Transfer',
    imps: 'Bank Transfer',
    pending: 'Pending',
  };
  if (map[key]) return { mode: map[key] };
  return { mode: text, unrecognised: true };
}

function splitMobiles(raw: string): string[] {
  return raw
    .split(/[,;/]|\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitVariants(raw: string): string[] {
  return raw
    .split(/[|;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function assertFileSize(file: File) {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('File is larger than 15 MB.');
  }
}

async function loadWorkbook(file: File): Promise<ExcelJS.Workbook> {
  assertFileSize(file);
  const buf = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb;
}

function countDataRows(sheet: ExcelJS.Worksheet): number {
  let count = 0;
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    let has = false;
    row.eachCell({ includeEmpty: false }, () => {
      has = true;
    });
    if (has) count += 1;
  });
  return count;
}

export async function detectSheets(
  file: File
): Promise<{ sheets: DetectedSheets; workbook: ExcelJS.Workbook }> {
  const workbook = await loadWorkbook(file);
  const sheets: DetectedSheets = SHEET_NAMES.map((name) => {
    const ws = findSheet(workbook, name);
    return {
      name,
      present: !!ws,
      rowCount: ws ? countDataRows(ws) : 0,
    };
  });
  if (!sheets.some((s) => s.present)) {
    throw new Error('No recognised sheet found (All Data, Client Summary, Mobile Summary, Year Summary, Review Needed).');
  }
  return { sheets, workbook };
}

type RawAllDataRow = {
  row: number;
  pan: string;
  ay: string;
  sl: number;
  name: string;
  phoneRaw: string;
  otherRaw: string;
  filingDate: string;
  fees: number;
  received: number;
  paymentType: string;
  paymentReceiveDate: string;
  feesAssumedFromReceived: boolean;
};

function parseAllDataSheet(
  sheet: ExcelJS.Worksheet,
  issues: ImportIssue[]
): { rows: RawAllDataRow[]; rowsRead: number; rowsSkipped: number; feesAssumedCount: number } {
  const headers = headerMap(sheet.getRow(1));
  const ayCol = colBy(headers, 'Assessment Year');
  const panCol = colBy(headers, 'Client ID', 'PAN');
  if (ayCol == null || panCol == null) {
    throw new Error(
      'All Data sheet is missing required headers "Assessment Year" and "Client ID" or "PAN".'
    );
  }
  const nameCol = colBy(headers, 'Name');
  const mobileCol = colBy(headers, 'Mobile (primary)', 'Mobile');
  const otherCol = colBy(headers, 'Other Mobile(s)');
  const filingDateCol = colBy(headers, 'Filing Date');
  const billedCol = colBy(headers, 'Amount Billed');
  const receivedCol = colBy(headers, 'Received');
  const payModeCol = colBy(headers, 'Payment Mode');
  const payDateCol = colBy(headers, 'Payment Date');
  const slCol = colBy(headers, 'Sl No');

  const rows: RawAllDataRow[] = [];
  let rowsRead = 0;
  let rowsSkipped = 0;
  let feesAssumedCount = 0;

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const panRaw = cellText(row.getCell(panCol).value);
    const ayRaw = cellText(row.getCell(ayCol).value);
    if (!panRaw && !ayRaw && !cellText(nameCol ? row.getCell(nameCol).value : '')) {
      return;
    }
    rowsRead += 1;

    const pan = panRaw.toUpperCase();
    if (!pan) {
      rowsSkipped += 1;
      issues.push({
        level: 'skip',
        row: rowNumber,
        message: 'Blank PAN / Client ID — row skipped',
      });
      return;
    }
    if (!PAN_RE.test(pan)) {
      issues.push({
        level: 'warn',
        row: rowNumber,
        pan,
        message: 'Non-standard PAN format — imported anyway',
      });
    }

    const ay = normalizeAy(ayRaw);
    if (!ay) {
      rowsSkipped += 1;
      issues.push({
        level: 'skip',
        row: rowNumber,
        pan,
        message: `Unrecognised Assessment Year "${ayRaw}"`,
      });
      return;
    }

    const name = nameCol ? cellText(row.getCell(nameCol).value) : '';
    const phoneRaw = mobileCol ? cellText(row.getCell(mobileCol).value) : '';
    // also accept numeric mobile
    const mobileUnwrapped = mobileCol
      ? unwrapCell(row.getCell(mobileCol).value)
      : '';
    const phoneFromNum =
      typeof mobileUnwrapped === 'number'
        ? String(Math.trunc(mobileUnwrapped))
        : phoneRaw;

    const otherRaw = otherCol ? cellText(row.getCell(otherCol).value) : '';

    const filingRaw = filingDateCol
      ? unwrapCell(row.getCell(filingDateCol).value)
      : '';
    const filingParsed = toIsoDate(filingRaw);
    if (filingRaw !== '' && filingRaw != null && !filingParsed.ok) {
      issues.push({
        level: 'warn',
        row: rowNumber,
        pan,
        ay,
        message: 'Unparseable filing date',
      });
    }

    const billedCell = billedCol ? unwrapCell(row.getCell(billedCol).value) : '';
    const receivedCell = receivedCol
      ? unwrapCell(row.getCell(receivedCol).value)
      : '';
    const billedBlank =
      billedCell === '' || billedCell == null || String(billedCell).trim() === '';
    let fees = parseAmount(billedCell);
    const received = parseAmount(receivedCell);
    let feesAssumedFromReceived = false;
    if (billedBlank && received > 0) {
      fees = received;
      feesAssumedFromReceived = true;
      feesAssumedCount += 1;
    }

    const payModeRaw = payModeCol
      ? unwrapCell(row.getCell(payModeCol).value)
      : '';
    const payNorm = normalizePaymentMode(payModeRaw, received);
    if (payNorm.unrecognised) {
      issues.push({
        level: 'warn',
        row: rowNumber,
        pan,
        ay,
        message: `Unrecognised payment mode: "${payNorm.mode}"`,
      });
    }

    const payDateRaw = payDateCol
      ? unwrapCell(row.getCell(payDateCol).value)
      : '';
    let payDateParsed = toIsoDate(payDateRaw);
    if (payDateRaw !== '' && payDateRaw != null && !payDateParsed.ok) {
      issues.push({
        level: 'warn',
        row: rowNumber,
        pan,
        ay,
        message: 'Unparseable payment date',
      });
    }
    if (!payDateParsed.iso && payNorm.paymentDateFromMode) {
      payDateParsed = { iso: payNorm.paymentDateFromMode, ok: true, wasDate: true };
    }

    const sl = slCol
      ? Number(unwrapCell(row.getCell(slCol).value)) || 0
      : 0;

    if (phoneFromNum) {
      const digits = normalizeMobileDigits(phoneFromNum);
      if (digits && !isValidMobile(digits)) {
        issues.push({
          level: 'warn',
          row: rowNumber,
          pan,
          ay,
          message: `Invalid mobile ignored: "${phoneFromNum}"`,
        });
      }
    }

    rows.push({
      row: rowNumber,
      pan,
      ay,
      sl,
      name,
      phoneRaw: phoneFromNum,
      otherRaw,
      filingDate: filingParsed.iso,
      fees,
      received,
      paymentType: payNorm.mode,
      paymentReceiveDate: payDateParsed.iso,
      feesAssumedFromReceived,
    });
  });

  return { rows, rowsRead, rowsSkipped, feesAssumedCount };
}

function parseClientSummarySheet(
  sheet: ExcelJS.Worksheet,
  issues: ImportIssue[]
): Map<
  string,
  { name: string; phone: string; otherMobiles: string; nameVariants: string }
> {
  const headers = headerMap(sheet.getRow(1));
  const panCol = colBy(headers, 'Client ID (PAN)');
  if (panCol == null) {
    throw new Error('Client Summary sheet is missing required header "Client ID (PAN)".');
  }
  const nameCol = colBy(headers, 'Client Name (latest)');
  const mobileCol = colBy(headers, 'Mobile (latest)');
  const otherCol = colBy(headers, 'Other Mobile(s)');
  const variantsCol = colBy(headers, 'Name Variants (if differ)');

  const map = new Map<
    string,
    { name: string; phone: string; otherMobiles: string; nameVariants: string }
  >();

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const pan = cellText(row.getCell(panCol).value).toUpperCase();
    if (!pan) {
      issues.push({
        level: 'skip',
        row: rowNumber,
        message: 'Client Summary row with blank PAN skipped',
      });
      return;
    }
    if (!PAN_RE.test(pan)) {
      issues.push({
        level: 'warn',
        row: rowNumber,
        pan,
        message: 'Non-standard PAN in Client Summary — imported anyway',
      });
    }

    const name = nameCol ? cellText(row.getCell(nameCol).value) : '';
    const mobileUnwrapped = mobileCol
      ? unwrapCell(row.getCell(mobileCol).value)
      : '';
    const phoneRaw =
      typeof mobileUnwrapped === 'number'
        ? String(Math.trunc(mobileUnwrapped))
        : cellText(mobileCol ? row.getCell(mobileCol).value : '');
    const digits = normalizeMobileDigits(phoneRaw);
    const phone = isValidMobile(digits) ? digits : '';
    if (phoneRaw && !phone) {
      issues.push({
        level: 'warn',
        row: rowNumber,
        pan,
        message: `Invalid mobile in Client Summary ignored: "${phoneRaw}"`,
      });
    }

    const otherRaw = otherCol ? cellText(row.getCell(otherCol).value) : '';
    const otherParts: string[] = [];
    for (const part of splitMobiles(otherRaw)) {
      const d = normalizeMobileDigits(part);
      if (isValidMobile(d) && d !== phone && !otherParts.includes(d)) otherParts.push(d);
      else if (part && !isValidMobile(d)) {
        issues.push({
          level: 'warn',
          row: rowNumber,
          pan,
          message: `Invalid other mobile ignored: "${part}"`,
        });
      }
    }

    const variantsRaw = variantsCol
      ? cellText(row.getCell(variantsCol).value)
      : '';
    const variants = splitVariants(variantsRaw).join(' | ');

    map.set(pan, {
      name,
      phone,
      otherMobiles: otherParts.join(', '),
      nameVariants: variants,
    });
  });

  return map;
}

function buildClientsFromAllData(
  rawRows: RawAllDataRow[],
  issues: ImportIssue[]
): {
  clients: Map<string, ImportClient>;
  duplicateClientYearRows: number;
} {
  // Group by pan
  type Acc = {
    names: { name: string; ay: string; sl: number }[];
    phones: { phone: string; ay: string; sl: number }[];
    others: Set<string>;
    filings: Map<
      string,
      {
        fees: number;
        received: number;
        filingDate: string;
        paymentReceiveDate: string;
        paymentType: string;
        payDateKey: string;
        rows: number;
      }
    >;
  };
  const byPan = new Map<string, Acc>();
  let duplicateClientYearRows = 0;

  for (const r of rawRows) {
    let acc = byPan.get(r.pan);
    if (!acc) {
      acc = {
        names: [],
        phones: [],
        others: new Set(),
        filings: new Map(),
      };
      byPan.set(r.pan, acc);
    }
    if (r.name) acc.names.push({ name: r.name, ay: r.ay, sl: r.sl });

    const dig = normalizeMobileDigits(r.phoneRaw);
    if (isValidMobile(dig)) {
      acc.phones.push({ phone: dig, ay: r.ay, sl: r.sl });
    }
    for (const part of splitMobiles(r.otherRaw)) {
      const d = normalizeMobileDigits(part);
      if (isValidMobile(d)) acc.others.add(d);
    }

    const existing = acc.filings.get(r.ay);
    if (!existing) {
      acc.filings.set(r.ay, {
        fees: r.fees,
        received: r.received,
        filingDate: r.filingDate,
        paymentReceiveDate: r.paymentReceiveDate,
        paymentType: r.paymentType,
        payDateKey: r.paymentReceiveDate,
        rows: 1,
      });
    } else {
      duplicateClientYearRows += 1;
      issues.push({
        level: 'warn',
        row: r.row,
        pan: r.pan,
        ay: r.ay,
        message: 'Duplicate client+AY row merged',
      });
      existing.fees += r.fees;
      existing.received += r.received;
      existing.rows += 1;
      if (r.filingDate && (!existing.filingDate || r.filingDate > existing.filingDate)) {
        existing.filingDate = r.filingDate;
      }
      if (
        r.paymentReceiveDate &&
        (!existing.paymentReceiveDate ||
          r.paymentReceiveDate > existing.paymentReceiveDate)
      ) {
        existing.paymentReceiveDate = r.paymentReceiveDate;
        existing.paymentType = r.paymentType;
        existing.payDateKey = r.paymentReceiveDate;
      } else if (!existing.paymentReceiveDate) {
        existing.paymentType = r.paymentType;
      }
    }
  }

  const clients = new Map<string, ImportClient>();
  for (const [pan, acc] of byPan) {
    const sortedNames = [...acc.names].sort(
      (a, b) => aySortKey(b.ay) - aySortKey(a.ay) || b.sl - a.sl
    );
    let name = sortedNames[0]?.name || '';
    const variants = [
      ...new Set(
        sortedNames
          .map((n) => n.name)
          .filter((n) => n && n.toLowerCase() !== name.toLowerCase())
      ),
    ];
    if (!name) {
      name = pan;
      issues.push({
        level: 'warn',
        pan,
        message: 'No name on All Data rows — using PAN',
      });
    }

    const sortedPhones = [...acc.phones].sort(
      (a, b) => aySortKey(b.ay) - aySortKey(a.ay) || b.sl - a.sl
    );
    const phone = sortedPhones[0]?.phone || '';
    for (const p of acc.phones) {
      if (p.phone !== phone) acc.others.add(p.phone);
    }
    acc.others.delete(phone);

    const filings: Record<string, ImportFiling> = {};
    for (const [ay, f] of acc.filings) {
      filings[ay] = {
        filingDate: f.filingDate,
        fees: f.fees,
        received: f.received,
        paymentType: f.paymentType,
        paymentReceiveDate: f.paymentReceiveDate,
      };
    }

    clients.set(pan, {
      pan,
      name,
      phone,
      otherMobiles: [...acc.others].join(', '),
      nameVariants: variants.join(' | '),
      filings,
    });
  }

  return { clients, duplicateClientYearRows };
}

export async function parseImport(
  file: File,
  options: { allData: boolean; clientSummary: boolean },
  workbook?: ExcelJS.Workbook
): Promise<ImportPreview> {
  const wb = workbook ?? (await loadWorkbook(file));
  const issues: ImportIssue[] = [];
  let rowsRead = 0;
  let rowsSkipped = 0;
  let duplicateClientYearRows = 0;
  let clients = new Map<string, ImportClient>();

  if (options.allData) {
    const sheet = findSheet(wb, 'All Data');
    if (!sheet) throw new Error('All Data sheet not found.');
    const parsed = parseAllDataSheet(sheet, issues);
    rowsRead += parsed.rowsRead;
    rowsSkipped += parsed.rowsSkipped;
    if (parsed.feesAssumedCount > 0) {
      issues.push({
        level: 'warn',
        message: `Amount Billed was blank with Received > 0 on ${parsed.feesAssumedCount} row(s) — fees set equal to received`,
      });
    }
    const built = buildClientsFromAllData(parsed.rows, issues);
    clients = built.clients;
    duplicateClientYearRows = built.duplicateClientYearRows;
  }

  if (options.clientSummary) {
    const sheet = findSheet(wb, 'Client Summary');
    if (!sheet) throw new Error('Client Summary sheet not found.');
    const details = parseClientSummarySheet(sheet, issues);
    for (const [pan, d] of details) {
      const existing = clients.get(pan);
      if (existing) {
        if (d.name) existing.name = d.name;
        if (d.phone) existing.phone = d.phone;
        if (d.otherMobiles) existing.otherMobiles = d.otherMobiles;
        if (d.nameVariants) existing.nameVariants = d.nameVariants;
      } else {
        clients.set(pan, {
          pan,
          name: d.name || pan,
          phone: d.phone,
          otherMobiles: d.otherMobiles,
          nameVariants: d.nameVariants,
          filings: {},
        });
        if (!d.name) {
          issues.push({
            level: 'warn',
            pan,
            message: 'Client Summary client has blank name — using PAN',
          });
        }
      }
    }
  }

  // If All Data names were blank and Client Summary provided name, already handled above.
  // Fix All Data "using PAN" when Client Summary later supplied name — already overwritten.

  const years = new Set<string>();
  for (const c of clients.values()) {
    for (const ay of Object.keys(c.filings)) years.add(ay);
  }

  return {
    clients: [...clients.values()],
    stats: {
      rowsRead,
      rowsSkipped,
      uniqueClients: clients.size,
      years: sortAssessmentYears([...years]),
      duplicateClientYearRows,
    },
    issues,
  };
}

function numClose(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.51;
}

export function checkMobileSummary(
  workbook: ExcelJS.Workbook,
  ledger: LedgerState
): {
  mismatches: Array<{
    mobile: string;
    field: string;
    file: string | number;
    app: string | number;
  }>;
  missingInApp: string[];
  missingInFile: string[];
  error?: string;
} {
  const sheet = findSheet(workbook, 'Mobile Summary');
  if (!sheet) {
    return {
      mismatches: [],
      missingInApp: [],
      missingInFile: [],
      error: 'Mobile Summary sheet not found.',
    };
  }
  const headers = headerMap(sheet.getRow(1));
  const mobileCol = colBy(headers, 'Mobile Number');
  const pansCol = colBy(headers, 'Clients (PANs) Linked');
  const billedCol = colBy(headers, 'Total Billed');
  const receivedCol = colBy(headers, 'Total Received');
  const outstandingCol = colBy(headers, 'Outstanding');
  if (mobileCol == null) {
    return {
      mismatches: [],
      missingInApp: [],
      missingInFile: [],
      error: 'Mobile Summary missing Mobile Number column.',
    };
  }

  const appRows = computeMobileSummaries(
    ledger.clients,
    ledger.assessmentYears
  ).filter((r) => r.mobile && r.mobile !== 'No Mobile');
  const appByMobile = new Map(appRows.map((r) => [r.mobile, r]));

  const fileMobiles = new Set<string>();
  const mismatches: Array<{
    mobile: string;
    field: string;
    file: string | number;
    app: string | number;
  }> = [];

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const raw = unwrapCell(row.getCell(mobileCol).value);
    const digits = normalizeMobileDigits(
      typeof raw === 'number' ? String(Math.trunc(raw)) : String(raw ?? '')
    );
    if (!digits) return;
    fileMobiles.add(digits);
    const app = appByMobile.get(digits);
    if (!app) return;

    const filePans = pansCol
      ? Number(unwrapCell(row.getCell(pansCol).value)) || 0
      : 0;
    const fileBilled = billedCol
      ? parseAmount(unwrapCell(row.getCell(billedCol).value))
      : 0;
    const fileReceived = receivedCol
      ? parseAmount(unwrapCell(row.getCell(receivedCol).value))
      : 0;
    const fileOut = outstandingCol
      ? Number(unwrapCell(row.getCell(outstandingCol).value)) || 0
      : 0;

    if (pansCol != null && filePans !== app.clientsCount) {
      mismatches.push({
        mobile: digits,
        field: 'PAN count',
        file: filePans,
        app: app.clientsCount,
      });
    }
    if (billedCol != null && !numClose(fileBilled, app.totalBilled)) {
      mismatches.push({
        mobile: digits,
        field: 'Total Billed',
        file: fileBilled,
        app: app.totalBilled,
      });
    }
    if (receivedCol != null && !numClose(fileReceived, app.totalReceived)) {
      mismatches.push({
        mobile: digits,
        field: 'Total Received',
        file: fileReceived,
        app: app.totalReceived,
      });
    }
    if (outstandingCol != null && !numClose(fileOut, app.outstanding)) {
      mismatches.push({
        mobile: digits,
        field: 'Outstanding',
        file: fileOut,
        app: app.outstanding,
      });
    }
  });

  const missingInApp = [...fileMobiles].filter((m) => !appByMobile.has(m));
  const missingInFile = appRows
    .map((r) => r.mobile)
    .filter((m) => !fileMobiles.has(m));

  return { mismatches, missingInApp, missingInFile };
}

export function checkYearSummary(
  workbook: ExcelJS.Workbook,
  ledger: LedgerState
): {
  mismatches: Array<{
    ay: string;
    field: string;
    file: string | number;
    app: string | number;
  }>;
  error?: string;
} {
  const sheet = findSheet(workbook, 'Year Summary');
  if (!sheet) {
    return { mismatches: [], error: 'Year Summary sheet not found.' };
  }

  const summary = computeYearSummary(ledger.clients, ledger.assessmentYears);
  const mismatches: Array<{
    ay: string;
    field: string;
    file: string | number;
    app: string | number;
  }> = [];

  let sawCalculated = false;
  const appByAy = new Map(summary.rows.map((r) => [r.year, r]));

  // Data starts at row 5; find AY in col A
  for (let r = 5; r <= sheet.rowCount; r++) {
    const ayRaw = cellText(sheet.getRow(r).getCell(1).value);
    if (!ayRaw || ayRaw.toUpperCase().startsWith('TOTAL')) break;
    const ay = normalizeAy(ayRaw) || ayRaw;
    const app = appByAy.get(ay);
    if (!app) continue;

    const entriesVal = unwrapCell(sheet.getRow(r).getCell(2).value);
    const uniqueVal = unwrapCell(sheet.getRow(r).getCell(3).value);
    const billedVal = unwrapCell(sheet.getRow(r).getCell(4).value);
    const receivedVal = unwrapCell(sheet.getRow(r).getCell(5).value);
    const outVal = unwrapCell(sheet.getRow(r).getCell(6).value);

    const vals = [entriesVal, uniqueVal, billedVal, receivedVal, outVal];
    if (vals.some((v) => v !== '' && v != null && Number.isFinite(Number(v)))) {
      sawCalculated = true;
    }

    const fileEntries = Number(entriesVal) || 0;
    const fileUnique = Number(uniqueVal) || 0;
    const fileBilled = parseAmount(billedVal);
    const fileReceived = parseAmount(receivedVal);
    const fileOut = Number(outVal) || 0;

    if (!numClose(fileEntries, app.entries)) {
      mismatches.push({
        ay,
        field: 'Entries',
        file: fileEntries,
        app: app.entries,
      });
    }
    if (!numClose(fileUnique, app.uniqueClients)) {
      mismatches.push({
        ay,
        field: 'Unique Clients',
        file: fileUnique,
        app: app.uniqueClients,
      });
    }
    if (!numClose(fileBilled, app.amountBilled)) {
      mismatches.push({
        ay,
        field: 'Amount Billed',
        file: fileBilled,
        app: app.amountBilled,
      });
    }
    if (!numClose(fileReceived, app.received)) {
      mismatches.push({
        ay,
        field: 'Received',
        file: fileReceived,
        app: app.received,
      });
    }
    if (!numClose(fileOut, app.outstanding)) {
      mismatches.push({
        ay,
        field: 'Outstanding',
        file: fileOut,
        app: app.outstanding,
      });
    }
  }

  if (!sawCalculated) {
    return {
      mismatches: [],
      error:
        'This file has no calculated values in Year Summary — open it in Excel, save, and try again.',
    };
  }

  return { mismatches };
}

export function parseReviewNeeded(
  workbook: ExcelJS.Workbook
): { title: string; headers: string[]; rows: string[][] }[] {
  const sheet = findSheet(workbook, 'Review Needed');
  if (!sheet) return [];

  const sections: { title: string; headers: string[]; rows: string[][] }[] = [];
  let current: { title: string; headers: string[]; rows: string[][] } | null =
    null;
  let expectHeader = false;

  sheet.eachRow({ includeEmpty: true }, (row) => {
    const texts: string[] = [];
    let maxCol = 0;
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      maxCol = Math.max(maxCol, col);
      texts[col - 1] = cellText(cell.value);
    });
    const first = (texts[0] || '').trim();
    const nonEmpty = texts.filter((t) => t && t.trim());
    if (!first && nonEmpty.length === 0) {
      if (current && current.rows.length >= 0) {
        // blank row ends section
        sections.push(current);
        current = null;
        expectHeader = false;
      }
      return;
    }

    const isHeading =
      /^\d+\./.test(first) ||
      (row.getCell(1).font?.bold && first.length > 20 && !expectHeader);

    if (isHeading && !expectHeader) {
      if (current) sections.push(current);
      current = { title: first, headers: [], rows: [] };
      expectHeader = true;
      return;
    }

    if (current && expectHeader) {
      current.headers = texts.map((t) => t || '').filter((_, i) => i < 4 || texts[i]);
      // keep first 4 cols typically
      current.headers = [0, 1, 2, 3].map((i) => texts[i] || '');
      expectHeader = false;
      return;
    }

    if (current) {
      const rowVals = [0, 1, 2, 3].map((i) => texts[i] || '');
      if (rowVals.some((v) => v)) current.rows.push(rowVals);
    }
  });
  if (current) sections.push(current);
  return sections;
}

function triggerCsvDownload(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(v: string | number): string {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadIssuesCsv(issues: ImportIssue[]): void {
  const lines = ['level,row,pan,ay,message'];
  for (const i of issues) {
    lines.push(
      [i.level, i.row ?? '', i.pan ?? '', i.ay ?? '', i.message]
        .map(csvEscape)
        .join(',')
    );
  }
  triggerCsvDownload(lines.join('\n'), 'import-issues.csv');
}

export function downloadCheckCsv(
  rows: Record<string, string | number>[],
  filename: string
): void {
  if (!rows.length) {
    triggerCsvDownload('message\nNo differences', filename);
    return;
  }
  const keys = Object.keys(rows[0]);
  const lines = [keys.join(',')];
  for (const r of rows) {
    lines.push(keys.map((k) => csvEscape(r[k] ?? '')).join(','));
  }
  triggerCsvDownload(lines.join('\n'), filename);
}
