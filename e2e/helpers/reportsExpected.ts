/**
 * Independent report/summary expectations for Stage 4.
 * Reimplemented from observed summary rules — NOT imported from summaryUtils.
 */
import { coerceMoneyInput, expectItBalance, expectGstMonthTotal } from './financeExpected';

export const ALL_AYS = [
  'AY 2019-20',
  'AY 2020-21',
  'AY 2021-22',
  'AY 2022-23',
  'AY 2023-24',
  'AY 2024-25',
  'AY 2025-26',
  'AY 2026-27',
] as const;

export function shortAyLabel(ay: string): string {
  const m = ay.match(/(\d{4})-(\d{2})/);
  if (m) return `${m[1].slice(2)}-${m[2]}`;
  return ay.replace(/^AY\s*/i, '');
}

export type ItFilingLike = {
  fees?: number;
  received?: number;
  balance?: number;
};

export type ItClientLike = {
  pan: string;
  filings?: Record<string, ItFilingLike>;
};

export function expectItYearRow(
  clients: ItClientLike[],
  year: string
): {
  entries: number;
  amountBilled: number;
  received: number;
  outstanding: number;
} {
  let entries = 0;
  let amountBilled = 0;
  let received = 0;
  let outstanding = 0;
  for (const c of clients) {
    const f = c.filings?.[year];
    if (!f) continue;
    entries += 1;
    const fees = coerceMoneyInput(f.fees);
    const recd = coerceMoneyInput(f.received);
    const bal =
      typeof f.balance === 'number' && Number.isFinite(f.balance)
        ? Math.max(0, f.balance)
        : expectItBalance(fees, recd);
    amountBilled += fees;
    received += recd;
    outstanding += bal;
  }
  return { entries, amountBilled, received, outstanding };
}

export function expectItOverallTotals(clients: ItClientLike[], years: string[]) {
  let totalBilled = 0;
  let totalReceived = 0;
  let totalOutstanding = 0;
  let totalEntries = 0;
  const pans = new Set<string>();
  for (const y of years) {
    const row = expectItYearRow(clients, y);
    totalBilled += row.amountBilled;
    totalReceived += row.received;
    totalOutstanding += row.outstanding;
    totalEntries += row.entries;
  }
  for (const c of clients) {
    if (Object.keys(c.filings || {}).length > 0) pans.add(c.pan);
  }
  return {
    totalClients: clients.length,
    totalUniqueClientsWithFilings: pans.size,
    totalBilled,
    totalReceived,
    totalOutstanding,
    totalEntries,
  };
}

export type GstFilingLike = {
  fees?: number;
  interest?: number;
  tax?: number;
  total?: number;
};

export type GstClientLike = {
  id?: string;
  userId: string;
  totalReceived?: number;
  filings?: Record<string, GstFilingLike>;
};

export function expectGstMonthRow(clients: GstClientLike[], month: string) {
  let companies = 0;
  let fees = 0;
  let interest = 0;
  let tax = 0;
  let totalBilled = 0;
  for (const c of clients) {
    const f = c.filings?.[month];
    if (!f) continue;
    companies += 1;
    const ff = coerceMoneyInput(f.fees);
    const ii = coerceMoneyInput(f.interest);
    const tt = coerceMoneyInput(f.tax);
    const total =
      typeof f.total === 'number' && Number.isFinite(f.total)
        ? Math.max(0, f.total)
        : expectGstMonthTotal(ff, ii, tt);
    fees += ff;
    interest += ii;
    tax += tt;
    totalBilled += total;
  }
  return { companies, fees, interest, tax, totalBilled };
}

export function expectClientItTotals(client: ItClientLike) {
  let totalReceived = 0;
  let outstandingTotal = 0;
  let totalBilled = 0;
  for (const f of Object.values(client.filings || {})) {
    const fees = coerceMoneyInput(f.fees);
    const recd = coerceMoneyInput(f.received);
    const bal =
      typeof f.balance === 'number' && Number.isFinite(f.balance)
        ? Math.max(0, f.balance)
        : expectItBalance(fees, recd);
    totalBilled += fees;
    totalReceived += recd;
    outstandingTotal += bal;
  }
  return { totalBilled, totalReceived, outstandingTotal };
}
