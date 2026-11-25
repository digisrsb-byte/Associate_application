import type {
  ClientRecord,
  ClientTotals,
  FilingRecord,
  GstClientRecord,
  GstClientTotals,
} from '../types/ledger.ts';
import { toCsvLines } from './csvHelpers.ts';
import { normalizePanInput } from './fieldValidation.ts';

export function formatCurrency(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(safe);
}

export function formatPlainNumber(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0,
  }).format(safe);
}

export function formatDisplayDate(dateStr: string): string {
  if (!dateStr || !dateStr.trim()) return '—';
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  return parsed.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function normalizePan(raw: string): string {
  return normalizePanInput(raw);
}

export function computeBalance(fees: number, received: number): number {
  const f = Number.isFinite(fees) ? Math.max(0, fees) : 0;
  const r = Number.isFinite(received) ? Math.max(0, received) : 0;
  return Math.max(0, f - r);
}

export function computeClientTotals(client: ClientRecord): ClientTotals {
  let totalReceived = 0;
  let outstandingTotal = 0;

  for (const filing of Object.values(client.filings || {})) {
    const fees = Number(filing.fees) || 0;
    const received = Number(filing.received) || 0;
    const balance =
      typeof filing.balance === 'number' && !Number.isNaN(filing.balance)
        ? Math.max(0, filing.balance)
        : computeBalance(fees, received);

    totalReceived += received;
    outstandingTotal += balance;
  }

  return {
    totalReceived,
    outstandingTotal,
  };
}

export function computeGstFilingTotal(fees: number, interest: number, tax: number): number {
  const f = Number.isFinite(fees) ? Math.max(0, fees) : 0;
  const i = Number.isFinite(interest) ? Math.max(0, interest) : 0;
  const t = Number.isFinite(tax) ? Math.max(0, tax) : 0;
  return f + i + t;
}

/** Sum of payment amounts allocated to one monthly filing. */
export function computeGstFilingReceived(filing: {
  payments?: Array<{ amount?: number }>;
  received?: number;
}): number {
  const payments = filing.payments;
  if (Array.isArray(payments)) {
    return payments.reduce((sum, p) => sum + Math.max(0, Number(p.amount) || 0), 0);
  }
  return Math.max(0, Number(filing.received) || 0);
}

export function getGstFilingCollectibleTotal(filing: {
  fees?: number;
  interest?: number;
  tax?: number;
  total?: number;
}): number {
  const fees = Math.max(0, Number(filing.fees) || 0);
  const interest = Math.max(0, Number(filing.interest) || 0);
  const tax = Math.max(0, Number(filing.tax) || 0);
  if (typeof filing.total === 'number' && Number.isFinite(filing.total)) {
    return Math.max(0, filing.total);
  }
  return computeGstFilingTotal(fees, interest, tax);
}

/** Outstanding for one month = collectible Total − Received (floored at 0). */
export function computeGstFilingOutstanding(filing: {
  fees?: number;
  interest?: number;
  tax?: number;
  total?: number;
  payments?: Array<{ amount?: number }>;
  received?: number;
}): number {
  const total = getGstFilingCollectibleTotal(filing);
  const received = computeGstFilingReceived(filing);
  return Math.max(0, total - received);
}

function gstClientHasPaymentLines(client: GstClientRecord): boolean {
  return Object.values(client.filings || {}).some(
    (f) => Array.isArray(f.payments) && f.payments.length > 0
  );
}

/** True when any filing has a payments array (including empty after deletes). */
export function gstClientUsesPaymentAccounting(client: GstClientRecord): boolean {
  return Object.values(client.filings || {}).some((f) => Array.isArray(f.payments));
}

/** Sum of all month-allocated payments (0 when no payment lines exist). */
export function sumGstClientPaymentLines(client: GstClientRecord): number {
  let sum = 0;
  for (const filing of Object.values(client.filings || {})) {
    sum += computeGstFilingReceived({
      payments: filing.payments,
      received: 0,
    });
  }
  return sum;
}

/** Unallocated legacy company receipts (never assigned to a month). */
export function getGstUnallocatedReceived(client: GstClientRecord): number {
  return Math.max(0, Number(client.unallocatedReceived) || 0);
}

/** True when month Received exceeds that month's collectible Total. */
export function gstFilingHasOverReceipt(filing: {
  fees?: number;
  interest?: number;
  tax?: number;
  total?: number;
  payments?: Array<{ amount?: number }>;
  received?: number;
}): boolean {
  const total = getGstFilingCollectibleTotal(filing);
  const received = computeGstFilingReceived(filing);
  return received - total > 0.009;
}

/**
 * Company Total Recd / Outstanding.
 * Payment-line mode: Total Recd = allocated payments + unallocated legacy.
 * Outstanding = max(0, billed − Total Recd) — unallocated is not assigned to a month.
 * Pure legacy (no payments arrays): pool totalReceived only.
 */
export function computeGstClientTotals(client: GstClientRecord): GstClientTotals {
  let totalFees = 0;
  let totalInterest = 0;
  let totalTax = 0;
  let totalBilled = 0;
  const usesPaymentAccounting = gstClientUsesPaymentAccounting(client);

  for (const filing of Object.values(client.filings || {})) {
    const fees = Math.max(0, Number(filing.fees) || 0);
    const interest = Math.max(0, Number(filing.interest) || 0);
    const tax = Math.max(0, Number(filing.tax) || 0);
    const total = getGstFilingCollectibleTotal(filing);

    totalFees += fees;
    totalInterest += interest;
    totalTax += tax;
    totalBilled += total;
  }

  if (usesPaymentAccounting) {
    const allocatedReceived = sumGstClientPaymentLines(client);
    const unallocatedReceived = getGstUnallocatedReceived(client);
    const totalReceived = allocatedReceived + unallocatedReceived;
    return {
      totalFees,
      totalInterest,
      totalTax,
      totalBilled,
      allocatedReceived,
      unallocatedReceived,
      totalReceived,
      outstandingTotal: Math.max(0, totalBilled - totalReceived),
    };
  }

  const pool = Math.max(0, Number(client.totalReceived) || 0);
  const unallocatedReceived = getGstUnallocatedReceived(client);
  // Pure legacy: pool is the company receipt figure (unallocated field usually unset).
  const totalReceived = unallocatedReceived > 0 ? unallocatedReceived : pool;

  return {
    totalFees,
    totalInterest,
    totalTax,
    totalBilled,
    allocatedReceived: 0,
    unallocatedReceived: unallocatedReceived > 0 ? unallocatedReceived : 0,
    totalReceived,
    outstandingTotal: Math.max(0, totalBilled - totalReceived),
  };
}

export function extractYearOrderKey(ayLabel: string): number {
  const match = ayLabel.match(/(\d{4})/);
  if (match) return Number.parseInt(match[1], 10);
  const shortMatch = ayLabel.match(/(\d{2})/);
  if (shortMatch) return 2000 + Number.parseInt(shortMatch[1], 10);
  return 0;
}

export function sortAssessmentYears(years: string[]): string[] {
  return [...new Set(years.map((y) => y.trim()).filter(Boolean))].sort(
    (a, b) => extractYearOrderKey(a) - extractYearOrderKey(b) || a.localeCompare(b)
  );
}

export function normalizeAssessmentYearLabel(input: string): string {
  const trimmed = input.trim().toUpperCase();
  if (!trimmed) return '';
  if (trimmed.startsWith('AY ')) return trimmed;
  if (/^\d{4}-\d{2}$/.test(trimmed)) return `AY ${trimmed}`;
  if (/^\d{4}$/.test(trimmed)) {
    const start = Number.parseInt(trimmed, 10);
    const endShort = String((start + 1) % 100).padStart(2, '0');
    return `AY ${start}-${endShort}`;
  }
  return input.trim();
}

export function getNextAssessmentYear(existingYears: string[]): string {
  if (existingYears.length === 0) return 'AY 2026-27';
  const sorted = sortAssessmentYears(existingYears);
  const last = sorted[sorted.length - 1];
  const lastStart = extractYearOrderKey(last);
  if (lastStart >= 2000 && lastStart < 2100) {
    const nextStart = lastStart + 1;
    const nextEnd = String((nextStart + 1) % 100).padStart(2, '0');
    return `AY ${nextStart}-${nextEnd}`;
  }
  return 'AY 2027-28';
}

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const MONTH_LOOKUP: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

export function normalizeGstMonthLabel(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';

  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})$/);
  if (isoMatch) {
    const yr = Number.parseInt(isoMatch[1], 10);
    const mIdx = Number.parseInt(isoMatch[2], 10) - 1;
    if (mIdx >= 0 && mIdx <= 11) {
      return `${MONTH_NAMES[mIdx]} ${yr}`;
    }
  }

  const slashMatch = trimmed.match(/^(\d{1,2})[/\-](\d{4})$/);
  if (slashMatch) {
    const mIdx = Number.parseInt(slashMatch[1], 10) - 1;
    const yr = Number.parseInt(slashMatch[2], 10);
    if (mIdx >= 0 && mIdx <= 11) {
      return `${MONTH_NAMES[mIdx]} ${yr}`;
    }
  }

  const textMatch = trimmed.match(/^([a-zA-Z]+)[\s\-]+(\d{2,4})$/);
  if (textMatch) {
    const mIdx = MONTH_LOOKUP[textMatch[1].toLowerCase()];
    if (mIdx !== undefined) {
      const rawYr = Number.parseInt(textMatch[2], 10);
      const yr = rawYr < 100 ? 2000 + rawYr : rawYr;
      return `${MONTH_NAMES[mIdx]} ${yr}`;
    }
  }

  return trimmed;
}

export function extractMonthOrderKey(monthLabel: string): number {
  const normalized = normalizeGstMonthLabel(monthLabel);
  const match = normalized.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (match) {
    const mIdx = MONTH_LOOKUP[match[1].toLowerCase()];
    const yr = Number.parseInt(match[2], 10);
    if (mIdx !== undefined) {
      return yr * 12 + mIdx;
    }
  }
  return 0;
}

export function sortGstMonths(months: string[]): string[] {
  return [...new Set(months.map((m) => normalizeGstMonthLabel(m)).filter(Boolean))].sort(
    (a, b) => extractMonthOrderKey(a) - extractMonthOrderKey(b) || a.localeCompare(b)
  );
}

export function getNextGstMonth(existingMonths: string[]): string {
  if (existingMonths.length === 0) return 'Apr 2026';
  const sorted = sortGstMonths(existingMonths);
  const last = sorted[sorted.length - 1];
  const key = extractMonthOrderKey(last);
  if (key > 0) {
    const nextKey = key + 1;
    const yr = Math.floor(nextKey / 12);
    const mIdx = nextKey % 12;
    return `${MONTH_NAMES[mIdx]} ${yr}`;
  }
  return 'Apr 2027';
}

/** Indian GST FY: Apr YYYY – Mar YYYY+1 → "FY YYYY-(YY+1)" */
export function formatGstFinancialYearLabel(startYear: number): string {
  const endShort = String(startYear + 1).slice(-2);
  return `FY ${startYear}-${endShort}`;
}

export function parseGstFinancialYearStart(fyLabel: string): number | null {
  const match = fyLabel.trim().match(/^FY\s*(\d{4})\s*[-/]\s*(\d{2}|\d{4})$/i);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

export function getGstFinancialYearLabel(monthLabel: string): string {
  const normalized = normalizeGstMonthLabel(monthLabel);
  const match = normalized.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return '';
  const mIdx = MONTH_LOOKUP[match[1].toLowerCase()];
  const calendarYear = Number.parseInt(match[2], 10);
  if (mIdx === undefined || !Number.isFinite(calendarYear)) return '';
  const startYear = mIdx >= 3 ? calendarYear : calendarYear - 1;
  return formatGstFinancialYearLabel(startYear);
}

export function getCurrentGstFinancialYearLabel(now: Date = new Date()): string {
  const month = now.getMonth();
  const year = now.getFullYear();
  const startYear = month >= 3 ? year : year - 1;
  return formatGstFinancialYearLabel(startYear);
}

export function getMonthsForGstFinancialYear(fyLabel: string): string[] {
  const startYear = parseGstFinancialYearStart(fyLabel);
  if (startYear === null) return [];
  return [
    `Apr ${startYear}`,
    `May ${startYear}`,
    `Jun ${startYear}`,
    `Jul ${startYear}`,
    `Aug ${startYear}`,
    `Sep ${startYear}`,
    `Oct ${startYear}`,
    `Nov ${startYear}`,
    `Dec ${startYear}`,
    `Jan ${startYear + 1}`,
    `Feb ${startYear + 1}`,
    `Mar ${startYear + 1}`,
  ];
}

export function shiftGstFinancialYear(fyLabel: string, delta: number): string {
  const startYear = parseGstFinancialYearStart(fyLabel);
  if (startYear === null) return fyLabel;
  return formatGstFinancialYearLabel(startYear + delta);
}

export function sortGstFinancialYears(years: string[]): string[] {
  return [...new Set(years.map((y) => y.trim()).filter(Boolean))].sort((a, b) => {
    const sa = parseGstFinancialYearStart(a) ?? 0;
    const sb = parseGstFinancialYearStart(b) ?? 0;
    return sa - sb || a.localeCompare(b);
  });
}

export function collectGstFinancialYears(months: string[]): string[] {
  const years = months
    .map((m) => getGstFinancialYearLabel(m))
    .filter(Boolean);
  return sortGstFinancialYears(years);
}

export function filterMonthsByGstFinancialYear(
  months: string[],
  fyLabel: string
): string[] {
  return sortGstMonths(
    months.filter((m) => getGstFinancialYearLabel(m) === fyLabel)
  );
}

export function exportContinuousCsv(clients: ClientRecord[], years: string[]): string {
  const sortedYears = sortAssessmentYears(years);
  const headers = [
    'Name',
    'PAN',
    'Password',
    'Phone',
    'Reference Number',
    'Remark',
    ...sortedYears.flatMap((ay) => [
      `${ay} Filing Date`,
      `${ay} Fees`,
      `${ay} Received`,
      `${ay} Balance Outstanding`,
      `${ay} Payment Type`,
      `${ay} Payment Receive Date`,
    ]),
    'Total Received',
    'Outstanding Total',
  ];

  const rows = clients.map((client) => {
    const totals = computeClientTotals(client);
    const yearCells = sortedYears.flatMap((ay) => {
      const f: FilingRecord | undefined = client.filings?.[ay];
      return [
        f?.filingDate ?? '',
        f?.fees ?? 0,
        f?.received ?? 0,
        f?.balance ?? 0,
        f?.paymentType ?? '',
        f?.paymentReceiveDate ?? '',
      ];
    });

    return [
      client.name,
      client.pan,
      "",
      client.phone,
      client.referenceNumber,
      client.remark ?? '',
      ...yearCells,
      totals.totalReceived,
      totals.outstandingTotal,
    ];
  });

  return toCsvLines([headers, ...rows]);
}

export function downloadTextFile(filename: string, content: string, mime = 'text/csv;charset=utf-8;') {
  const blob = new Blob(['\uFEFF', content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
