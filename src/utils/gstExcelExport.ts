import ExcelJS from 'exceljs';
import type { GstClientRecord, LedgerState } from '../types/ledger.ts';
import { orderedWorkbookToBlob } from './excelWorkbookOrder.ts';
import {
  computeGstClientTotals,
  computeGstFilingOutstanding,
  computeGstFilingReceived,
  computeGstFilingTotal,
  sortGstMonths,
} from './ledgerUtils.ts';
import {
  computeGstClientSummaries,
  computeGstMonthSummary,
} from './summaryUtils.ts';

/**
 * GST Excel format matches the sheet layouts already used in csvExport.ts
 * (All Data / Sheet View / Company Summary / Month Summary).
 */

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1F4E78' },
};
const HEADER_FONT: Partial<ExcelJS.Font> = {
  name: 'Arial',
  size: 10,
  bold: true,
  color: { argb: 'FFFFFFFF' },
};
const BODY_FONT: Partial<ExcelJS.Font> = { name: 'Arial', size: 10 };
const AMOUNT_FMT =
  '[>=10000000]##\\,##\\,##\\,##0;[>=100000]##\\,##\\,##0;##,##0';
const MOBILE_FMT = '0';

export type GstExportSheetFlags = {
  monthSummary: boolean;
  allData: boolean;
  sheetView: boolean;
  companySummary: boolean;
};

function styleHeaderRow(row: ExcelJS.Row, height = 32) {
  row.height = height;
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true,
    };
  });
}

function applyBodyFont(sheet: ExcelJS.Worksheet) {
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 1) return;
    row.eachCell((cell) => {
      if (!cell.font || !cell.font.bold) cell.font = BODY_FONT;
    });
  });
}

function setAmount(cell: ExcelJS.Cell, n: number) {
  cell.value = Math.max(0, Number(n) || 0);
  cell.numFmt = AMOUNT_FMT;
}

function setMobile(cell: ExcelJS.Cell, phone: string) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits) {
    cell.value = Number(digits);
    cell.numFmt = MOBILE_FMT;
  } else {
    cell.value = phone || '';
  }
}

function formula(cell: ExcelJS.Cell, f: string, result: number | string) {
  cell.value = { formula: f, result } as ExcelJS.CellValue;
}

/** Matches exportGstAllDataExcelCsv */
function writeGstAllData(
  wb: ExcelJS.Workbook,
  clients: GstClientRecord[],
  months: string[]
): number {
  const sheet = wb.addWorksheet('All Data');
  // Month Recd / Month Outstanding are per filing; Company Unallocated is company-level
  // (not assigned to the month). Company Total Recd lives on Company Summary.
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
    'Month Recd',
    'Company Unallocated Recd',
    'Month Outstanding',
  ];
  const widths = [12, 8, 32, 18, 14, 14, 14, 24, 12, 12, 12, 12, 14, 18, 16];
  sheet.addRow(headers);
  styleHeaderRow(sheet.getRow(1));
  widths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  const sorted = sortGstMonths(months);
  let sl = 1;
  let rowCount = 0;

  for (const month of sorted) {
    for (const client of clients) {
      const f = client.filings?.[month];
      if (!f) continue;
      const totals = computeGstClientTotals(client);
      const fees = Math.max(0, Number(f.fees) || 0);
      const interest = Math.max(0, Number(f.interest) || 0);
      const tax = Math.max(0, Number(f.tax) || 0);
      const total =
        typeof f.total === 'number' && Number.isFinite(f.total)
          ? Math.max(0, f.total)
          : computeGstFilingTotal(fees, interest, tax);
      const monthRecd = computeGstFilingReceived(f);
      const monthOutstanding = computeGstFilingOutstanding(f);
      const rowNum = rowCount + 2;
      const row = sheet.addRow([]);
      row.getCell(1).value = month;
      row.getCell(2).value = sl++;
      row.getCell(3).value = client.companyName;
      row.getCell(4).value = client.userId;
      row.getCell(5).value = '';
      setMobile(row.getCell(6), client.phone);
      row.getCell(7).value = client.referenceNumber || '';
      row.getCell(8).value = client.remark || '';
      setAmount(row.getCell(9), fees);
      setAmount(row.getCell(10), interest);
      setAmount(row.getCell(11), tax);
      formula(row.getCell(12), `I${rowNum}+J${rowNum}+K${rowNum}`, total);
      row.getCell(12).numFmt = AMOUNT_FMT;
      setAmount(row.getCell(13), monthRecd);
      setAmount(row.getCell(14), totals.unallocatedReceived);
      setAmount(row.getCell(15), monthOutstanding);
      row.font = BODY_FONT;
      rowCount += 1;
    }
  }

  for (const client of clients) {
    if (Object.keys(client.filings || {}).length > 0) continue;
    const totals = computeGstClientTotals(client);
    const row = sheet.addRow([]);
    row.getCell(1).value = '';
    row.getCell(2).value = sl++;
    row.getCell(3).value = client.companyName;
    row.getCell(4).value = client.userId;
    row.getCell(5).value = '';
    setMobile(row.getCell(6), client.phone);
    row.getCell(7).value = client.referenceNumber || '';
    row.getCell(8).value = client.remark || '';
    setAmount(row.getCell(9), 0);
    setAmount(row.getCell(10), 0);
    setAmount(row.getCell(11), 0);
    setAmount(row.getCell(12), 0);
    setAmount(row.getCell(13), 0);
    setAmount(row.getCell(14), totals.unallocatedReceived);
    setAmount(row.getCell(15), totals.outstandingTotal);
    row.font = BODY_FONT;
    rowCount += 1;
  }

  const lastRow = Math.max(2, rowCount + 1);
  sheet.autoFilter = { from: 'A1', to: `O${lastRow}` };
  sheet.views = [{ state: 'frozen', xSplit: 3, ySplit: 1 }];
  applyBodyFont(sheet);
  return rowCount;
}

/** Matches exportGstContinuousSheetExcelCsv (Sheet View) */
function writeGstSheetView(
  wb: ExcelJS.Workbook,
  clients: GstClientRecord[],
  months: string[]
) {
  const sheet = wb.addWorksheet('Sheet View');
  const sorted = sortGstMonths(months);

  // Row 1: banner
  const banner = sheet.addRow([
    '',
    '',
    '',
    '',
    '',
    '',
    'Monthly Filing',
  ]);
  banner.font = { name: 'Arial', size: 11, bold: true };

  // Row 2: headers
  const headers = [
    'Company Name',
    'User ID',
    'Password',
    'Phone',
    'Ref No',
    'Remark',
    ...sorted,
    'Total Recd',
    'Unallocated Recd',
    'Outstanding',
  ];
  const headerRow = sheet.addRow(headers);
  styleHeaderRow(headerRow);
  headers.forEach((_, i) => {
    sheet.getColumn(i + 1).width = i === 0 ? 28 : i < 6 ? 14 : 11;
  });

  for (const client of clients) {
    const totals = computeGstClientTotals(client);
    const filings = client.filings || {};

    const feesRow = sheet.addRow([
      client.companyName,
      client.userId,
      '',
      client.phone || '',
      client.referenceNumber || '',
      client.remark || '',
      ...sorted.map((m) =>
        filings[m] ? `Fees ${filings[m].fees ?? 0}` : ''
      ),
      totals.totalReceived,
      totals.unallocatedReceived,
      totals.outstandingTotal,
    ]);
    feesRow.getCell(headers.length - 2).numFmt = AMOUNT_FMT;
    feesRow.getCell(headers.length - 1).numFmt = AMOUNT_FMT;
    feesRow.getCell(headers.length).numFmt = AMOUNT_FMT;
    feesRow.font = BODY_FONT;

    const interRow = sheet.addRow([
      '',
      '',
      '',
      '',
      '',
      '',
      ...sorted.map((m) =>
        filings[m] ? `Inter ${filings[m].interest ?? 0}` : ''
      ),
      '',
      '',
      '',
    ]);
    interRow.font = BODY_FONT;

    const taxRow = sheet.addRow([
      '',
      '',
      '',
      '',
      '',
      '',
      ...sorted.map((m) => (filings[m] ? `Tax ${filings[m].tax ?? 0}` : '')),
      '',
      '',
      '',
    ]);
    taxRow.font = BODY_FONT;

    const totalRow = sheet.addRow([
      '',
      '',
      '',
      '',
      '',
      '',
      ...sorted.map((m) =>
        filings[m] ? `Total ${filings[m].total ?? 0}` : ''
      ),
      '',
      '',
      '',
    ]);
    totalRow.font = BODY_FONT;

    // Month Recd / Out parity with UI Sheet cells (company totals stay on fees row)
    const recdRow = sheet.addRow([
      '',
      '',
      '',
      '',
      '',
      '',
      ...sorted.map((m) =>
        filings[m]
          ? `Recd ${computeGstFilingReceived(filings[m])}`
          : ''
      ),
      '',
      '',
      '',
    ]);
    recdRow.font = BODY_FONT;

    const outRow = sheet.addRow([
      '',
      '',
      '',
      '',
      '',
      '',
      ...sorted.map((m) =>
        filings[m]
          ? `Out ${computeGstFilingOutstanding(filings[m])}`
          : ''
      ),
      '',
      '',
      '',
    ]);
    outRow.font = BODY_FONT;
  }

  sheet.views = [{ state: 'frozen', xSplit: 2, ySplit: 2 }];
}

/** Matches exportGstClientSummaryExcelCsv */
function writeGstCompanySummary(
  wb: ExcelJS.Workbook,
  clients: GstClientRecord[],
  months: string[]
) {
  const sheet = wb.addWorksheet('Company Summary');
  const sorted = sortGstMonths(months);
  const summaries = computeGstClientSummaries(clients, sorted);

  const headers = [
    'Company Name',
    'User ID',
    'Phone',
    'Ref No',
    'Remark',
    ...sorted,
    'Total Fees',
    'Total Interest',
    'Total Tax',
    'Total',
    'Total Recd',
    'Unallocated Recd',
    'Outstanding',
  ];
  sheet.addRow(headers);
  styleHeaderRow(sheet.getRow(1));
  headers.forEach((_, i) => {
    sheet.getColumn(i + 1).width = i < 5 ? (i === 0 ? 28 : 14) : 11;
  });

  summaries.forEach((r) => {
    const row = sheet.addRow([]);
    row.getCell(1).value = r.companyName;
    row.getCell(2).value = r.userId;
    setMobile(row.getCell(3), r.phone);
    row.getCell(4).value = r.referenceNumber || '';
    row.getCell(5).value = r.remark || '';
    sorted.forEach((m, i) => {
      const v = r.monthTotals[m];
      if (v === null || v === undefined) {
        row.getCell(6 + i).value = '-';
      } else {
        setAmount(row.getCell(6 + i), v);
      }
    });
    const base = 6 + sorted.length;
    setAmount(row.getCell(base), r.totalFees);
    setAmount(row.getCell(base + 1), r.totalInterest);
    setAmount(row.getCell(base + 2), r.totalTax);
    setAmount(row.getCell(base + 3), r.totalBilled);
    setAmount(row.getCell(base + 4), r.totalReceived);
    setAmount(row.getCell(base + 5), r.unallocatedReceived);
    setAmount(row.getCell(base + 6), r.outstanding);
    row.font = BODY_FONT;
  });

  const lastRow = Math.max(2, summaries.length + 1);
  const lastCol = 5 + sorted.length + 7;
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: lastRow, column: lastCol },
  };
  sheet.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }];
  applyBodyFont(sheet);
}

/** Matches exportGstMonthSummaryExcelCsv */
function writeGstMonthSummary(
  wb: ExcelJS.Workbook,
  clients: GstClientRecord[],
  months: string[]
) {
  const sheet = wb.addWorksheet('Month Summary');
  const summary = computeGstMonthSummary(clients, months);
  const first = summary.rows[0]?.month || '—';
  const last = summary.rows[summary.rows.length - 1]?.month || '—';

  sheet.getCell('A1').value = `GST Monthly Filing Summary (${first} to ${last})`;
  sheet.getCell('A1').font = { name: 'Arial', size: 13, bold: true };

  const headerRow = sheet.getRow(2);
  ['Month', 'Companies', 'Fees', 'Interest', 'Tax', 'Total'].forEach((h, i) => {
    headerRow.getCell(i + 1).value = h;
  });
  styleHeaderRow(headerRow, 18);
  [14, 12, 14, 14, 14, 14].forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  summary.rows.forEach((r, idx) => {
    const row = sheet.getRow(3 + idx);
    row.getCell(1).value = r.month;
    row.getCell(2).value = r.companies;
    setAmount(row.getCell(3), r.fees);
    setAmount(row.getCell(4), r.interest);
    setAmount(row.getCell(5), r.tax);
    setAmount(row.getCell(6), r.totalBilled);
    row.font = BODY_FONT;
  });

  const totalRowNum = 3 + summary.rows.length;
  const totalRow = sheet.getRow(totalRowNum);
  totalRow.getCell(1).value = 'TOTAL';
  totalRow.getCell(2).value = summary.totalUniqueCompanies;
  setAmount(totalRow.getCell(3), summary.totalFees);
  setAmount(totalRow.getCell(4), summary.totalInterest);
  setAmount(totalRow.getCell(5), summary.totalTax);
  setAmount(totalRow.getCell(6), summary.totalBilled);
  totalRow.font = { ...BODY_FONT, bold: true };

  sheet.getCell(`A${totalRowNum + 1}`).value = 'Total Recd';
  setAmount(sheet.getCell(`B${totalRowNum + 1}`), summary.totalReceived);
  sheet.getCell(`C${totalRowNum + 1}`).value = 'Outstanding';
  setAmount(sheet.getCell(`D${totalRowNum + 1}`), summary.totalOutstanding);

  sheet.views = [{ state: 'frozen', ySplit: 2 }];
}

function writeGstNotes(wb: ExcelJS.Workbook) {
  const sheet = wb.addWorksheet('Notes');
  sheet.getColumn(1).width = 120;
  const today = new Date();
  const lines = [
    'How this GST workbook was built',
    `Source: exported from TaxLedger on ${today.toISOString().slice(0, 10)}.`,
    'Company = one User ID. User ID is the unique key for GST import.',
    '"All Data" has one row per company-month filing (Fees + Interest + Tax = Total).',
    '"Sheet View" matches the in-app sheet layout (Fees / Inter / Tax / Total under each month).',
    '"Company Summary" shows month totals per company plus lifetime totals.',
    '"Month Summary" aggregates by filing month.',
    'Amounts are in Rs. Filters are on data sheets.',
  ];
  lines.forEach((line, i) => {
    const cell = sheet.getCell(`A${i + 1}`);
    cell.value = line;
    cell.font = i === 0 ? { name: 'Arial', size: 12, bold: true } : BODY_FONT;
  });
}

function resolveFlags(flags: GstExportSheetFlags): GstExportSheetFlags {
  const out = { ...flags };
  if (out.monthSummary || out.companySummary || out.sheetView) out.allData = true;
  return out;
}

export async function buildGstWorkbookBlob(
  ledger: LedgerState,
  sheets: GstExportSheetFlags
): Promise<Blob> {
  const flags = resolveFlags(sheets);
  const months = sortGstMonths(ledger.gstMonths);
  const clients = ledger.gstClients;

  const content = new ExcelJS.Workbook();
  content.calcProperties.fullCalcOnLoad = true;

  if (flags.monthSummary) writeGstMonthSummary(content, clients, months);
  if (flags.allData) writeGstAllData(content, clients, months);
  if (flags.sheetView) writeGstSheetView(content, clients, months);
  if (flags.companySummary) writeGstCompanySummary(content, clients, months);
  writeGstNotes(content);

  return orderedWorkbookToBlob(content, [
    'Month Summary',
    'All Data',
    'Sheet View',
    'Company Summary',
    'Notes',
  ]);
}

export function gstExportFilename(ledger: LedgerState): string {
  const months = sortGstMonths(ledger.gstMonths);
  const first = (months[0] || 'start').replace(/\s+/g, '');
  const last = (months[months.length - 1] || 'end').replace(/\s+/g, '');
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `GST_Filing_Master_Report_${first}-${last}_${yyyy}-${mm}-${dd}.xlsx`;
}

export async function buildGstImportTemplateBlob(
  months: string[]
): Promise<Blob> {
  const sorted = sortGstMonths(
    months.length
      ? months
      : [
          'Apr 2026',
          'May 2026',
          'Jun 2026',
          'Jul 2026',
          'Aug 2026',
          'Sep 2026',
          'Oct 2026',
          'Nov 2026',
          'Dec 2026',
          'Jan 2027',
          'Feb 2027',
          'Mar 2027',
        ]
  );
  const demo: LedgerState = {
    assessmentYears: [],
    clients: [],
    gstMonths: sorted,
    gstClients: [
      {
        id: 'gst-tpl-1',
        companyName: 'Sample GST Company',
        userId: 'sample.gst',
        password: 'NOT SET',
        phone: '9876543210',
        referenceNumber: 'GST-REF-01',
        remark: 'Demo row — replace with real data',
        totalReceived: 5000,
        filings: {
          [sorted[0]]: {
            month: sorted[0],
            fees: 2000,
            interest: 0,
            tax: 15000,
            total: 17000,
          },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  };
  return buildGstWorkbookBlob(demo, {
    monthSummary: true,
    allData: true,
    sheetView: true,
    companySummary: true,
  });
}
