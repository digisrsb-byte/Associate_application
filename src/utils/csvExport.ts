import type {
  ClientRecord,
  FilingRecord,
  GstClientRecord,
  GstMonthlyFiling,
} from '../types/ledger.ts';
import {
  computeClientTotals,
  computeGstClientTotals,
  sortAssessmentYears,
  sortGstMonths,
} from './ledgerUtils.ts';
import {
  computeClientSummaries,
  computeGstClientSummaries,
  computeGstMonthSummary,
  computeMobileSummaries,
  computeYearSummary,
} from './summaryUtils.ts';

function escapeCsvCell(value: string | number | undefined | null): string {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsvLines(rows: (string | number | undefined | null)[][]): string {
  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
}

function formatExcelDate(dateStr: string | undefined): string {
  if (!dateStr || !dateStr.trim()) return '';
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return dateStr.trim();
  const day = String(parsed.getDate()).padStart(2, '0');
  const month = parsed.toLocaleString('en-US', { month: 'short' });
  const year = parsed.getFullYear();
  return `${day}-${month}-${year}`;
}

/**
 * Matches the user's "All Data" Excel sheet (row per filing entry):
 * Assessment Year | Sl No | Name | PAN | Password | Mobile (primary) | Reference No | Filing Date | Amount Billed | Received | Outstanding | Payment Mode | Payment Date | Amount Note
 */
export function exportAllDataExcelCsv(
  clients: ClientRecord[],
  years: string[]
): string {
  const sortedYears = sortAssessmentYears(years);
  const headers = [
    'Assessment Year',
    'Sl No',
    'Name',
    'PAN',
    'Password',
    'Mobile (primary)',
    'Reference No',
    'Filing Date',
    'Amount Billed',
    'Received',
    'Outstanding',
    'Payment Mode',
    'Payment Date',
    'Amount Note',
  ];

  const rows: (string | number)[][] = [headers];
  let slNo = 1;

  for (const yr of sortedYears) {
    for (const client of clients) {
      const f: FilingRecord | undefined = client.filings?.[yr];
      if (!f) continue;
      rows.push([
        yr,
        slNo++,
        client.name,
        client.pan,
        "",
        client.phone || '',
        client.referenceNumber || '',
        formatExcelDate(f.filingDate),
        f.fees ?? 0,
        f.received ?? 0,
        f.balance ?? 0,
        f.paymentType || '',
        formatExcelDate(f.paymentReceiveDate),
        client.remark || '',
      ]);
    }
  }

  for (const client of clients) {
    const hasFilings = Object.keys(client.filings || {}).length > 0;
    if (!hasFilings) {
      rows.push([
        '',
        slNo++,
        client.name,
        client.pan,
        "",
        client.phone || '',
        client.referenceNumber || '',
        '',
        0,
        0,
        0,
        '',
        '',
        client.remark || '',
      ]);
    }
  }

  return toCsvLines(rows);
}

/**
 * Matches the user's continuous stacked multi-year Excel layout.
 */
export function exportContinuousSheetExcelCsv(
  clients: ClientRecord[],
  years: string[]
): string {
  const sortedYears = sortAssessmentYears(years);
  const rows: (string | number)[][] = [];

  rows.push(['', '', '', '', '', '', 'Filing Date']);
  rows.push([
    'Name',
    'PAN',
    'Password',
    'Phone',
    'Reference Number',
    'Remark',
    ...sortedYears,
    'Total Received',
    'Outstanding Total',
  ]);

  for (const client of clients) {
    const totals = computeClientTotals(client);
    const filings = client.filings || {};

    rows.push([
      client.name,
      client.pan,
      "",
      client.phone || '',
      client.referenceNumber || '',
      client.remark || '',
      ...sortedYears.map((yr) =>
        filings[yr] ? formatExcelDate(filings[yr].filingDate) : ''
      ),
      totals.totalReceived,
      totals.outstandingTotal,
    ]);

    rows.push([
      '',
      '',
      '',
      '',
      '',
      '',
      ...sortedYears.map((yr) =>
        filings[yr] ? `Fees ${filings[yr].fees ?? 0}` : ''
      ),
      '',
      '',
    ]);

    rows.push([
      '',
      '',
      '',
      '',
      '',
      '',
      ...sortedYears.map((yr) =>
        filings[yr] ? `RE ${filings[yr].received ?? 0}` : ''
      ),
      '',
      '',
    ]);

    rows.push([
      '',
      '',
      '',
      '',
      '',
      '',
      ...sortedYears.map((yr) =>
        filings[yr] ? `Bal ${filings[yr].balance ?? 0}` : ''
      ),
      '',
      '',
    ]);

    rows.push([
      '',
      '',
      '',
      '',
      '',
      '',
      ...sortedYears.map((yr) =>
        filings[yr] ? formatExcelDate(filings[yr].paymentReceiveDate) : ''
      ),
      '',
      '',
    ]);

    rows.push([
      '',
      '',
      '',
      '',
      '',
      '',
      ...sortedYears.map((yr) =>
        filings[yr] ? filings[yr].paymentType || '' : ''
      ),
      '',
      '',
    ]);
  }

  return toCsvLines(rows);
}

/**
 * Matches the user's "Year Summary" Excel sheet.
 */
export function exportYearSummaryExcelCsv(
  clients: ClientRecord[],
  years: string[]
): string {
  const summary = computeYearSummary(clients, years);
  const firstYear = summary.rows[0]?.year || 'AY 2019-20';
  const lastYear = summary.rows[summary.rows.length - 1]?.year || 'AY 2026-27';
  const firstStart = firstYear.match(/\d{4}/)?.[0] || '2019';
  const lastStart = lastYear.match(/\d{4}/)?.[0] || '2026';

  const rows: (string | number)[][] = [
    [`Salary / ITR Filing - Year-wise Summary (${firstYear} to ${lastYear})`],
    ['All figures are live formulas from "All Data" and "Client Summary". Amounts in Rs.'],
    ['', '', '', '', '', '', '', '', 'Clients by number of years filed', ''],
    [
      'Assessment Year',
      'Entries',
      'Unique Clients',
      'Amount Billed',
      'Received',
      'Outstanding',
      'Collection %',
      '',
      'Times Filed (years)',
      'Clients',
    ],
  ];

  const maxRows = Math.max(summary.rows.length, summary.buckets.length);
  for (let i = 0; i < maxRows; i++) {
    const r = summary.rows[i];
    const b = summary.buckets[i];
    rows.push([
      r ? r.year : '',
      r ? r.entries : '',
      r ? r.uniqueClients : '',
      r ? r.amountBilled : '',
      r ? r.received : '',
      r ? r.outstanding : '',
      r ? `${r.collectionPct.toFixed(1)}%` : '',
      '',
      b ? `${b.yearsCount} ${b.yearsCount === 1 ? 'year' : 'years'}` : '',
      b ? b.clientCount : '',
    ]);
  }

  rows.push([
    `TOTAL (${firstStart}-${lastStart})`,
    summary.totalEntries,
    summary.totalUniqueClients,
    summary.totalBilled,
    summary.totalReceived,
    summary.totalOutstanding,
    `${summary.totalCollectionPct.toFixed(1)}%`,
    '',
    'Total',
    summary.totalBucketClients,
  ]);
  rows.push([
    '"Unique Clients" in the total row counts each client PAN once across all years.',
  ]);

  return toCsvLines(rows);
}

/**
 * Matches the user's "Client Summary" Excel sheet.
 */
export function exportClientSummaryExcelCsv(
  clients: ClientRecord[],
  years: string[]
): string {
  const sortedYears = sortAssessmentYears(years);
  const summaryRows = computeClientSummaries(clients, sortedYears);

  const headers = [
    'Client ID (PAN)',
    'Client Name (latest)',
    'Mobile (latest)',
    ...sortedYears,
    'Years Filed',
    'First AY',
    'Last AY',
    'Total Entries',
    'Total Billed',
    'Total Received',
    'Outstanding',
  ];

  const rows: (string | number)[][] = [headers];
  for (const r of summaryRows) {
    rows.push([
      r.pan,
      r.name,
      r.mobile,
      ...sortedYears.map((yr) => (r.yearBilled[yr] !== null ? r.yearBilled[yr]! : '-')),
      r.yearsFiled,
      r.firstAy === '—' ? '' : r.firstAy,
      r.lastAy === '—' ? '' : r.lastAy,
      r.totalEntries,
      r.totalBilled,
      r.totalReceived,
      r.outstanding,
    ]);
  }

  const totalEntries = summaryRows.reduce((s, r) => s + r.totalEntries, 0);
  const totalBilled = summaryRows.reduce((s, r) => s + r.totalBilled, 0);
  const totalReceived = summaryRows.reduce((s, r) => s + r.totalReceived, 0);
  const totalOutstanding = summaryRows.reduce((s, r) => s + r.outstanding, 0);

  rows.push([
    `Total (${summaryRows.length})`,
    '',
    '',
    ...sortedYears.map(() => ''),
    '',
    '',
    '',
    totalEntries,
    totalBilled,
    totalReceived,
    totalOutstanding,
  ]);

  return toCsvLines(rows);
}

/**
 * Matches the user's "Mobile Summary" Excel sheet.
 */
export function exportMobileSummaryExcelCsv(
  clients: ClientRecord[],
  years: string[]
): string {
  const sortedYears = sortAssessmentYears(years);
  const summaryRows = computeMobileSummaries(clients, sortedYears);

  const headers = [
    'Mobile Number',
    'Clients (PANs) Linked',
    'Names Linked',
    ...sortedYears,
    'Years Filed',
    'First AY',
    'Last AY',
    'Total Entries',
    'Total Billed',
    'Total Received',
    'Outstanding',
    'Note',
  ];

  const rows: (string | number)[][] = [headers];
  for (const r of summaryRows) {
    rows.push([
      r.mobile,
      r.clientsCount,
      r.namesLinked.join(', '),
      ...sortedYears.map((yr) => (r.yearBilled[yr] !== null ? r.yearBilled[yr]! : '-')),
      r.yearsFiled,
      r.firstAy === '—' ? '' : r.firstAy,
      r.lastAy === '—' ? '' : r.lastAy,
      r.totalEntries,
      r.totalBilled,
      r.totalReceived,
      r.outstanding,
      r.remark,
    ]);
  }

  const totalClients = summaryRows.reduce((s, r) => s + r.clientsCount, 0);
  const totalEntries = summaryRows.reduce((s, r) => s + r.totalEntries, 0);
  const totalBilled = summaryRows.reduce((s, r) => s + r.totalBilled, 0);
  const totalReceived = summaryRows.reduce((s, r) => s + r.totalReceived, 0);
  const totalOutstanding = summaryRows.reduce((s, r) => s + r.outstanding, 0);

  rows.push([
    `Total (${summaryRows.length})`,
    totalClients,
    '',
    ...sortedYears.map(() => ''),
    '',
    '',
    '',
    totalEntries,
    totalBilled,
    totalReceived,
    totalOutstanding,
    '',
  ]);

  return toCsvLines(rows);
}

// ---------- GST Excel CSV Exports ----------

export function exportGstAllDataExcelCsv(
  clients: GstClientRecord[],
  months: string[]
): string {
  const sortedMonths = sortGstMonths(months);
  const headers = [
    'Month',
    'Sl No',
    'Company Name',
    'User ID',
    'Password',
    'Phone',
    'Ref No',
    'Remark',
    'Fees',
    'Interest',
    'Tax',
    'Total',
    'Total Recd',
    'Outstanding',
  ];

  const rows: (string | number)[][] = [headers];
  let slNo = 1;

  for (const m of sortedMonths) {
    for (const client of clients) {
      const f: GstMonthlyFiling | undefined = client.filings?.[m];
      if (!f) continue;
      const totals = computeGstClientTotals(client);
      rows.push([
        m,
        slNo++,
        client.companyName,
        client.userId,
        "",
        client.phone || '',
        client.referenceNumber || '',
        client.remark || '',
        f.fees ?? 0,
        f.interest ?? 0,
        f.tax ?? 0,
        f.total ?? 0,
        totals.totalReceived,
        totals.outstandingTotal,
      ]);
    }
  }

  for (const client of clients) {
    if (Object.keys(client.filings || {}).length === 0) {
      const totals = computeGstClientTotals(client);
      rows.push([
        '',
        slNo++,
        client.companyName,
        client.userId,
        "",
        client.phone || '',
        client.referenceNumber || '',
        client.remark || '',
        0,
        0,
        0,
        0,
        totals.totalReceived,
        totals.outstandingTotal,
      ]);
    }
  }

  return toCsvLines(rows);
}

export function exportGstContinuousSheetExcelCsv(
  clients: GstClientRecord[],
  months: string[]
): string {
  const sortedMonths = sortGstMonths(months);
  const rows: (string | number)[][] = [];

  rows.push(['', '', '', '', '', '', 'Monthly Filing']);
  rows.push([
    'Company Name',
    'User ID',
    'Password',
    'Phone',
    'Ref No',
    'Remark',
    ...sortedMonths,
    'Total Recd',
    'Outstanding',
  ]);

  for (const client of clients) {
    const totals = computeGstClientTotals(client);
    const filings = client.filings || {};

    rows.push([
      client.companyName,
      client.userId,
      "",
      client.phone || '',
      client.referenceNumber || '',
      client.remark || '',
      ...sortedMonths.map((m) => (filings[m] ? `Fees ${filings[m].fees ?? 0}` : '')),
      totals.totalReceived,
      totals.outstandingTotal,
    ]);

    rows.push([
      '',
      '',
      '',
      '',
      '',
      '',
      ...sortedMonths.map((m) => (filings[m] ? `Inter ${filings[m].interest ?? 0}` : '')),
      '',
      '',
    ]);

    rows.push([
      '',
      '',
      '',
      '',
      '',
      '',
      ...sortedMonths.map((m) => (filings[m] ? `Tax ${filings[m].tax ?? 0}` : '')),
      '',
      '',
    ]);

    rows.push([
      '',
      '',
      '',
      '',
      '',
      '',
      ...sortedMonths.map((m) => (filings[m] ? `Total ${filings[m].total ?? 0}` : '')),
      '',
      '',
    ]);
  }

  return toCsvLines(rows);
}

export function exportGstMonthSummaryExcelCsv(
  clients: GstClientRecord[],
  months: string[]
): string {
  const summary = computeGstMonthSummary(clients, months);
  const firstM = summary.rows[0]?.month || 'Apr 2026';
  const lastM = summary.rows[summary.rows.length - 1]?.month || 'Mar 2027';

  const rows: (string | number)[][] = [
    [`GST Monthly Filing Summary (${firstM} to ${lastM})`],
    ['Month', 'Companies', 'Fees', 'Interest', 'Tax', 'Total'],
  ];

  for (const r of summary.rows) {
    rows.push([
      r.month,
      r.companies,
      r.fees,
      r.interest,
      r.tax,
      r.totalBilled,
    ]);
  }

  rows.push([
    'TOTAL',
    summary.totalUniqueCompanies,
    summary.totalFees,
    summary.totalInterest,
    summary.totalTax,
    summary.totalBilled,
  ]);
  rows.push(['Total Recd', summary.totalReceived, '', 'Outstanding', summary.totalOutstanding]);

  return toCsvLines(rows);
}

export function exportGstClientSummaryExcelCsv(
  clients: GstClientRecord[],
  months: string[]
): string {
  const sortedMonths = sortGstMonths(months);
  const summaryRows = computeGstClientSummaries(clients, sortedMonths);

  const headers = [
    'Company Name',
    'User ID',
    'Phone',
    'Ref No',
    'Remark',
    ...sortedMonths,
    'Total Fees',
    'Total Interest',
    'Total Tax',
    'Total',
    'Total Recd',
    'Outstanding',
  ];

  const rows: (string | number)[][] = [headers];
  for (const r of summaryRows) {
    rows.push([
      r.companyName,
      r.userId,
      r.phone,
      r.referenceNumber,
      r.remark,
      ...sortedMonths.map((m) => (r.monthTotals[m] !== null ? r.monthTotals[m]! : '-')),
      r.totalFees,
      r.totalInterest,
      r.totalTax,
      r.totalBilled,
      r.totalReceived,
      r.outstanding,
    ]);
  }

  return toCsvLines(rows);
}
