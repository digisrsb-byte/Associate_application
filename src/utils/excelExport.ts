import ExcelJS from 'exceljs';
import type { ClientRecord, LedgerState } from '../types/ledger.ts';
import { sortAssessmentYears } from './ledgerUtils.ts';
import {
  computeClientSummaries,
  computeMobileSummaries,
  computeYearSummary,
} from './summaryUtils.ts';

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
const DATE_FMT = 'dd\\-mmm\\-yyyy';
const MOBILE_FMT = '0';
const FLAG_FMT = '0;\\-0;"-"';
const PCT_FMT = '0.0%';

export type ExportSheetFlags = {
  yearSummary: boolean;
  allData: boolean;
  clientSummary: boolean;
  mobileSummary: boolean;
  reviewNeeded: boolean;
};

function colLetter(n: number): string {
  let s = '';
  let x = n;
  while (x > 0) {
    const m = (x - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

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
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      if (!cell.font?.bold || cell.font?.color?.argb !== 'FFFFFFFF') {
        cell.font = { ...BODY_FONT, ...(cell.font || {}) };
      }
    });
  });
}

function parseIsoDate(iso: string): Date | null {
  if (!iso || !iso.trim()) return null;
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function setDateCell(cell: ExcelJS.Cell, iso: string) {
  const d = parseIsoDate(iso);
  if (d) {
    cell.value = d;
    cell.numFmt = DATE_FMT;
  } else {
    cell.value = '';
  }
}

function setAmount(cell: ExcelJS.Cell, n: number) {
  cell.value = Math.max(0, Math.round(n));
  cell.numFmt = AMOUNT_FMT;
}

function setMobile(cell: ExcelJS.Cell, phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    cell.value = Number(digits);
    cell.numFmt = MOBILE_FMT;
  } else if (digits) {
    cell.value = digits;
  } else {
    cell.value = '';
  }
}

function formula(cell: ExcelJS.Cell, f: string, result: number | string) {
  cell.value = { formula: f, result };
  cell.font = BODY_FONT;
}

function ayStartYear(ay: string): number {
  const m = ay.match(/(\d{4})/);
  return m ? Number(m[1]) : 0;
}

function isValidPan(pan: string): boolean {
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan.trim().toUpperCase());
}

function isValidMobile(phone: string): boolean {
  const d = phone.replace(/\D/g, '');
  return /^[6-9]\d{9}$/.test(d);
}

type AllDataRow = {
  ay: string;
  sl: number;
  name: string;
  pan: string;
  phone: string;
  otherMobiles: string;
  filingDate: string;
  fees: number;
  received: number;
  paymentType: string;
  paymentReceiveDate: string;
};

function buildAllDataRows(clients: ClientRecord[], years: string[]): AllDataRow[] {
  const sortedYears = sortAssessmentYears(years);
  const rows: AllDataRow[] = [];
  for (const ay of sortedYears) {
    let sl = 0;
    for (const c of clients) {
      const f = c.filings?.[ay];
      if (!f) continue;
      sl += 1;
      rows.push({
        ay,
        sl,
        name: c.name || '',
        pan: (c.pan || '').toUpperCase(),
        phone: c.phone || '',
        otherMobiles: c.otherMobiles || '',
        filingDate: f.filingDate || '',
        fees: Number(f.fees) || 0,
        received: Number(f.received) || 0,
        paymentType: f.paymentType || '',
        paymentReceiveDate: f.paymentReceiveDate || '',
      });
    }
  }
  return rows;
}

function writeAllData(
  wb: ExcelJS.Workbook,
  clients: ClientRecord[],
  years: string[]
): number {
  const sheet = wb.addWorksheet('All Data');
  const headers = [
    'Assessment Year',
    'Sl No',
    'Name',
    'PAN',
    'Mobile (primary)',
    'Other Mobile(s)',
    'Filing Date',
    'Filing Note',
    'Amount Billed',
    'Received',
    'Outstanding',
    'Payment Mode',
    'Payment Date',
    'Client ID',
    'Amount Note',
    'First Mobile+Client (helper)',
  ];
  const widths = [13, 8, 32, 13, 14, 20, 12, 14, 13, 13, 13, 14, 12, 18, 40, 14];
  sheet.addRow(headers);
  styleHeaderRow(sheet.getRow(1), 32);
  widths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  const data = buildAllDataRows(clients, years);
  data.forEach((r, idx) => {
    const rowNum = idx + 2;
    const row = sheet.addRow([]);
    row.getCell(1).value = r.ay;
    row.getCell(2).value = r.sl;
    row.getCell(3).value = r.name;
    row.getCell(4).value = r.pan;
    setMobile(row.getCell(5), r.phone);
    row.getCell(6).value = r.otherMobiles;
    setDateCell(row.getCell(7), r.filingDate);
    row.getCell(8).value = '';
    setAmount(row.getCell(9), r.fees);
    setAmount(row.getCell(10), r.received);
    formula(row.getCell(11), `I${rowNum}-J${rowNum}`, r.fees - r.received);
    row.getCell(11).numFmt = AMOUNT_FMT;
    row.getCell(12).value = r.paymentType;
    setDateCell(row.getCell(13), r.paymentReceiveDate);
    row.getCell(14).value = r.pan;
    row.getCell(15).value = '';
    // First Mobile+Client helper
    const firstFlag =
      r.phone &&
      data
        .slice(0, idx + 1)
        .filter((x) => x.phone === r.phone && x.pan === r.pan).length === 1
        ? 1
        : 0;
    formula(
      row.getCell(16),
      `IF(AND(E${rowNum}<>"",COUNTIFS($E$2:E${rowNum},E${rowNum},$N$2:N${rowNum},N${rowNum})=1),1,0)`,
      firstFlag
    );
    row.font = BODY_FONT;
  });

  const lastRow = Math.max(2, data.length + 1);
  sheet.autoFilter = { from: 'A1', to: `P${lastRow}` };
  sheet.views = [{ state: 'frozen', xSplit: 3, ySplit: 1 }];
  applyBodyFont(sheet);
  return data.length;
}

function writeClientSummary(
  wb: ExcelJS.Workbook,
  clients: ClientRecord[],
  years: string[],
  allDataLastRow: number
) {
  const sheet = wb.addWorksheet('Client Summary');
  const sortedYears = sortAssessmentYears(years);
  const summaries = computeClientSummaries(clients, sortedYears).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  );
  const byId = new Map(clients.map((c) => [c.id, c]));

  const headers = [
    'Client ID (PAN)',
    'Client Name (latest)',
    'Mobile (latest)',
    'Other Mobile(s)',
    ...sortedYears,
    'Years Filed',
    'First AY',
    'Last AY',
    'Total Entries',
    'Total Billed',
    'Total Received',
    'Outstanding',
    'Name Variants (if differ)',
  ];
  sheet.addRow(headers);
  styleHeaderRow(sheet.getRow(1), 32);

  const widths = [15.7, 32, 14, 12, ...sortedYears.map(() => 10), 9, 11, 11, 9, 14, 14, 14, 45];
  widths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  const ayStartCol = 5; // E
  const ayEndCol = 4 + sortedYears.length;
  const yearsFiledCol = ayEndCol + 1;
  const firstAyCol = yearsFiledCol + 1;
  const lastAyCol = firstAyCol + 1;
  const entriesCol = lastAyCol + 1;
  const billedCol = entriesCol + 1;
  const receivedCol = billedCol + 1;
  const outstandingCol = receivedCol + 1;
  const variantsCol = outstandingCol + 1;

  const ayStartL = colLetter(ayStartCol);
  const ayEndL = colLetter(ayEndCol);
  const n = Math.max(2, allDataLastRow);

  summaries.forEach((s, idx) => {
    const r = idx + 2;
    const client = byId.get(s.id);
    const row = sheet.addRow([]);
    row.getCell(1).value = s.pan;
    row.getCell(2).value = s.name;
    setMobile(row.getCell(3), s.mobile);
    row.getCell(4).value = client?.otherMobiles || '';

    sortedYears.forEach((yr, yi) => {
      const c = ayStartCol + yi;
      const filed = s.yearBilled[yr] != null ? 1 : 0;
      formula(
        row.getCell(c),
        `IF(COUNTIFS('All Data'!$N$2:$N$${n},$A${r},'All Data'!$A$2:$A$${n},${colLetter(c)}$1)>0,1,0)`,
        filed
      );
      row.getCell(c).numFmt = FLAG_FMT;
    });

    formula(
      row.getCell(yearsFiledCol),
      `SUM(${ayStartL}${r}:${ayEndL}${r})`,
      s.yearsFiled
    );
    formula(
      row.getCell(firstAyCol),
      `IFERROR(INDEX($${ayStartL}$1:$${ayEndL}$1,MATCH(1,${ayStartL}${r}:${ayEndL}${r},0)),"")`,
      s.firstAy === '—' ? '' : s.firstAy
    );
    formula(
      row.getCell(lastAyCol),
      `IF(${colLetter(yearsFiledCol)}${r}=0,"",INDEX($${ayStartL}$1:$${ayEndL}$1,SUMPRODUCT(MAX(${ayStartL}${r}:${ayEndL}${r}*(COLUMN(${ayStartL}${r}:${ayEndL}${r})-COLUMN($${ayStartL}${r})+1)))))`,
      s.lastAy === '—' ? '' : s.lastAy
    );
    formula(
      row.getCell(entriesCol),
      `COUNTIFS('All Data'!$N$2:$N$${n},$A${r})`,
      s.totalEntries
    );
    formula(
      row.getCell(billedCol),
      `SUMIFS('All Data'!$I$2:$I$${n},'All Data'!$N$2:$N$${n},$A${r})`,
      s.totalBilled
    );
    row.getCell(billedCol).numFmt = AMOUNT_FMT;
    formula(
      row.getCell(receivedCol),
      `SUMIFS('All Data'!$J$2:$J$${n},'All Data'!$N$2:$N$${n},$A${r})`,
      s.totalReceived
    );
    row.getCell(receivedCol).numFmt = AMOUNT_FMT;
    formula(
      row.getCell(outstandingCol),
      `${colLetter(billedCol)}${r}-${colLetter(receivedCol)}${r}`,
      s.outstanding
    );
    row.getCell(outstandingCol).numFmt = AMOUNT_FMT;
    row.getCell(variantsCol).value = client?.nameVariants || '';
    row.font = BODY_FONT;
  });

  const lastRow = Math.max(2, summaries.length + 1);
  sheet.autoFilter = {
    from: 'A1',
    to: `${colLetter(variantsCol)}${lastRow}`,
  };
  sheet.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }];
  return { lastRow, ayStartCol, ayEndCol, yearsFiledCol, summaries };
}

function writeMobileSummary(
  wb: ExcelJS.Workbook,
  clients: ClientRecord[],
  years: string[],
  allDataLastRow: number
) {
  const sheet = wb.addWorksheet('Mobile Summary');
  const sortedYears = sortAssessmentYears(years);
  const summaries = computeMobileSummaries(clients, sortedYears)
    .filter((r) => r.mobile && r.mobile !== 'No Mobile')
    .sort((a, b) => a.mobile.localeCompare(b.mobile, undefined, { numeric: true }));

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
  sheet.addRow(headers);
  styleHeaderRow(sheet.getRow(1), 32);
  const widths = [14, 11, 45, ...sortedYears.map(() => 10), 9, 11, 11, 9, 14, 14, 14, 38];
  widths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  const ayStartCol = 4;
  const ayEndCol = 3 + sortedYears.length;
  const yearsFiledCol = ayEndCol + 1;
  const firstAyCol = yearsFiledCol + 1;
  const lastAyCol = firstAyCol + 1;
  const entriesCol = lastAyCol + 1;
  const billedCol = entriesCol + 1;
  const receivedCol = billedCol + 1;
  const outstandingCol = receivedCol + 1;
  const noteCol = outstandingCol + 1;
  const ayStartL = colLetter(ayStartCol);
  const ayEndL = colLetter(ayEndCol);
  const n = Math.max(2, allDataLastRow);

  summaries.forEach((s, idx) => {
    const r = idx + 2;
    const row = sheet.addRow([]);
    setMobile(row.getCell(1), s.mobile);
    row.getCell(2).value = s.clientsCount;
    row.getCell(3).value = s.namesLinked.join(' | ');

    sortedYears.forEach((yr, yi) => {
      const c = ayStartCol + yi;
      const filed = s.yearBilled[yr] != null ? 1 : 0;
      formula(
        row.getCell(c),
        `IF(COUNTIFS('All Data'!$E$2:$E$${n},$A${r},'All Data'!$A$2:$A$${n},${colLetter(c)}$1)>0,1,0)`,
        filed
      );
      row.getCell(c).numFmt = FLAG_FMT;
    });

    formula(
      row.getCell(yearsFiledCol),
      `SUM(${ayStartL}${r}:${ayEndL}${r})`,
      s.yearsFiled
    );
    formula(
      row.getCell(firstAyCol),
      `IFERROR(INDEX($${ayStartL}$1:$${ayEndL}$1,MATCH(1,${ayStartL}${r}:${ayEndL}${r},0)),"")`,
      s.firstAy === '—' ? '' : s.firstAy
    );
    formula(
      row.getCell(lastAyCol),
      `IF(${colLetter(yearsFiledCol)}${r}=0,"",INDEX($${ayStartL}$1:$${ayEndL}$1,SUMPRODUCT(MAX(${ayStartL}${r}:${ayEndL}${r}*(COLUMN(${ayStartL}${r}:${ayEndL}${r})-COLUMN($${ayStartL}${r})+1)))))`,
      s.lastAy === '—' ? '' : s.lastAy
    );
    formula(
      row.getCell(entriesCol),
      `COUNTIFS('All Data'!$E$2:$E$${n},$A${r})`,
      s.totalEntries
    );
    formula(
      row.getCell(billedCol),
      `SUMIFS('All Data'!$I$2:$I$${n},'All Data'!$E$2:$E$${n},$A${r})`,
      s.totalBilled
    );
    row.getCell(billedCol).numFmt = AMOUNT_FMT;
    formula(
      row.getCell(receivedCol),
      `SUMIFS('All Data'!$J$2:$J$${n},'All Data'!$E$2:$E$${n},$A${r})`,
      s.totalReceived
    );
    row.getCell(receivedCol).numFmt = AMOUNT_FMT;
    formula(
      row.getCell(outstandingCol),
      `${colLetter(billedCol)}${r}-${colLetter(receivedCol)}${r}`,
      s.outstanding
    );
    row.getCell(outstandingCol).numFmt = AMOUNT_FMT;
    const note =
      s.clientsCount > 1
        ? `Shared by ${s.clientsCount} different PANs - check`
        : '';
    formula(
      row.getCell(noteCol),
      `IF(B${r}>1,"Shared by "&B${r}&" different PANs - check","")`,
      note
    );
    row.font = BODY_FONT;
  });

  const lastRow = Math.max(2, summaries.length + 1);
  sheet.autoFilter = {
    from: 'A1',
    to: `${colLetter(noteCol)}${lastRow}`,
  };
  sheet.views = [{ state: 'frozen', xSplit: 3, ySplit: 1 }];
}

function writeYearSummary(
  wb: ExcelJS.Workbook,
  clients: ClientRecord[],
  years: string[],
  allDataLastRow: number,
  clientSummaryMeta: {
    lastRow: number;
    ayStartCol: number;
    ayEndCol: number;
    yearsFiledCol: number;
  }
) {
  const sheet = wb.addWorksheet('Year Summary', { properties: { tabColor: undefined } });
  // Move to first position later via workbook order when creating sheets
  const sortedYears = sortAssessmentYears(years);
  const summary = computeYearSummary(clients, sortedYears);
  const n = Math.max(2, allDataLastRow);
  const m = Math.max(2, clientSummaryMeta.lastRow);
  const ayStartL = colLetter(clientSummaryMeta.ayStartCol);
  const ayEndL = colLetter(clientSummaryMeta.ayEndCol);
  const yearsFiledL = colLetter(clientSummaryMeta.yearsFiledCol);

  const first = sortedYears[0] || '';
  const last = sortedYears[sortedYears.length - 1] || '';
  sheet.getCell('A1').value =
    `Salary / ITR Filing - Year-wise Summary (${first} to ${last})`;
  sheet.getCell('A1').font = { name: 'Arial', size: 13, bold: true };
  sheet.getCell('A2').value =
    'All figures are live formulas on the "All Data" and "Client Summary" sheets. Amounts in Rs.';
  sheet.getCell('A2').font = BODY_FONT;
  sheet.getCell('I3').value = 'Clients by number of years filed';
  sheet.getCell('I3').font = { name: 'Arial', size: 10, bold: true };

  const headerRow = sheet.getRow(4);
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
  ].forEach((h, i) => {
    headerRow.getCell(i + 1).value = h;
  });
  styleHeaderRow(headerRow, 16.5);
  [18, 11, 14, 16, 16, 16, 13, 3, 18, 14].forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  sortedYears.forEach((ay, idx) => {
    const r = 5 + idx;
    const yr = summary.rows[idx];
    const row = sheet.getRow(r);
    row.getCell(1).value = ay;
    formula(
      row.getCell(2),
      `COUNTIFS('All Data'!$A$2:$A$${n},$A${r})`,
      yr?.entries ?? 0
    );
    formula(
      row.getCell(3),
      `SUMPRODUCT(('Client Summary'!$${ayStartL}$1:$${ayEndL}$1=$A${r})*'Client Summary'!$${ayStartL}$2:$${ayEndL}$${m})`,
      yr?.uniqueClients ?? 0
    );
    formula(
      row.getCell(4),
      `SUMIFS('All Data'!$I$2:$I$${n},'All Data'!$A$2:$A$${n},$A${r})`,
      yr?.amountBilled ?? 0
    );
    row.getCell(4).numFmt = AMOUNT_FMT;
    formula(
      row.getCell(5),
      `SUMIFS('All Data'!$J$2:$J$${n},'All Data'!$A$2:$A$${n},$A${r})`,
      yr?.received ?? 0
    );
    row.getCell(5).numFmt = AMOUNT_FMT;
    formula(row.getCell(6), `D${r}-E${r}`, yr?.outstanding ?? 0);
    row.getCell(6).numFmt = AMOUNT_FMT;
    formula(
      row.getCell(7),
      `IF(D${r}=0,0,E${r}/D${r})`,
      yr && yr.amountBilled > 0 ? yr.received / yr.amountBilled : 0
    );
    row.getCell(7).numFmt = PCT_FMT;

    row.getCell(9).value = idx + 1;
    formula(
      row.getCell(10),
      `COUNTIF('Client Summary'!$${yearsFiledL}$2:$${yearsFiledL}$${m},I${r})`,
      summary.buckets.find((b) => b.yearsCount === idx + 1)?.clientCount ?? 0
    );
    row.font = BODY_FONT;
  });

  const totalRowNum = 5 + sortedYears.length;
  const totalRow = sheet.getRow(totalRowNum);
  const firstStart = ayStartYear(first);
  const lastStart = ayStartYear(last);
  totalRow.getCell(1).value = `TOTAL (${firstStart}-${lastStart})`;
  formula(
    totalRow.getCell(2),
    `SUM(B5:B${totalRowNum - 1})`,
    summary.totalEntries
  );
  formula(
    totalRow.getCell(3),
    `COUNTIF('Client Summary'!$${yearsFiledL}$2:$${yearsFiledL}$${m},">0")`,
    summary.totalUniqueClients
  );
  formula(
    totalRow.getCell(4),
    `SUM(D5:D${totalRowNum - 1})`,
    summary.totalBilled
  );
  totalRow.getCell(4).numFmt = AMOUNT_FMT;
  formula(
    totalRow.getCell(5),
    `SUM(E5:E${totalRowNum - 1})`,
    summary.totalReceived
  );
  totalRow.getCell(5).numFmt = AMOUNT_FMT;
  formula(
    totalRow.getCell(6),
    `SUM(F5:F${totalRowNum - 1})`,
    summary.totalOutstanding
  );
  totalRow.getCell(6).numFmt = AMOUNT_FMT;
  formula(
    totalRow.getCell(7),
    `IF(D${totalRowNum}=0,0,E${totalRowNum}/D${totalRowNum})`,
    summary.totalBilled > 0
      ? summary.totalReceived / summary.totalBilled
      : 0
  );
  totalRow.getCell(7).numFmt = PCT_FMT;
  totalRow.getCell(9).value = 'Total';
  formula(
    totalRow.getCell(10),
    `SUM(J5:J${totalRowNum - 1})`,
    summary.totalBucketClients
  );
  totalRow.font = { name: 'Arial', size: 10, bold: true };
  totalRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFDDEBF7' },
    };
  });

  sheet.getCell(`A${totalRowNum + 1}`).value =
    '"Unique Clients" in the total row counts each client once across all years.';
  sheet.getCell(`A${totalRowNum + 1}`).font = BODY_FONT;
}

function writeReviewNeeded(
  wb: ExcelJS.Workbook,
  clients: ClientRecord[],
  years: string[]
) {
  const sheet = wb.addWorksheet('Review Needed');
  sheet.getColumn(1).width = 22;
  sheet.getColumn(2).width = 40;
  sheet.getColumn(3).width = 45;
  sheet.getColumn(4).width = 22;

  sheet.getCell('A1').value =
    'Items to check - data quality notes from merging the sheets';
  sheet.getCell('A1').font = { name: 'Arial', size: 13, bold: true };

  let row = 3;
  const addSection = (
    title: string,
    headers: string[],
    dataRows: (string | number)[][]
  ) => {
    sheet.getCell(`A${row}`).value = title;
    sheet.getCell(`A${row}`).font = { name: 'Arial', size: 11, bold: true };
    row += 1;
    const headerRow = sheet.getRow(row);
    headers.forEach((h, i) => {
      headerRow.getCell(i + 1).value = h;
    });
    styleHeaderRow(headerRow, 16.5);
    row += 1;
    if (dataRows.length === 0) {
      sheet.getCell(`A${row}`).value = 'None';
      sheet.getCell(`A${row}`).font = BODY_FONT;
      row += 1;
    } else {
      for (const dr of dataRows) {
        const r = sheet.getRow(row);
        dr.forEach((v, i) => {
          r.getCell(i + 1).value = v;
        });
        r.font = BODY_FONT;
        row += 1;
      }
    }
    row += 1;
  };

  // 1. Invalid mobiles
  const invalidMobile: (string | number)[][] = [];
  for (const c of clients) {
    const phone = (c.phone || '').trim();
    if (phone && !isValidMobile(phone)) {
      const yearsFiled = sortAssessmentYears(Object.keys(c.filings || {}));
      for (const ay of yearsFiled) {
        invalidMobile.push([ay, c.name, c.pan, phone]);
      }
      if (yearsFiled.length === 0) {
        invalidMobile.push(['', c.name, c.pan, phone]);
      }
    }
  }
  addSection(
    '1. Mobile column holds something that is not a valid 10-digit number (mobile left blank for these entries)',
    ['AY', 'Name', 'PAN', 'Value in Mobile column'],
    invalidMobile
  );

  // 2. Shared mobiles top 25
  const byPhone = new Map<string, ClientRecord[]>();
  for (const c of clients) {
    const p = (c.phone || '').trim();
    if (!p || !isValidMobile(p)) continue;
    const list = byPhone.get(p) || [];
    list.push(c);
    byPhone.set(p, list);
  }
  const shared = [...byPhone.entries()]
    .filter(([, list]) => list.length > 1)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 25)
    .map(([mobile, list]) => [
      mobile,
      list.length,
      list.map((c) => c.name).join(' | '),
    ]);
  addSection(
    `2. Mobile numbers shared by more than one PAN (${
      [...byPhone.values()].filter((l) => l.length > 1).length
    } numbers) - top 25 shown; see "Mobile Summary" note column for all`,
    ['Mobile', 'No. of PANs', 'Names'],
    shared
  );

  // 3. Name variants
  const variantRows = clients
    .filter((c) => (c.nameVariants || '').trim())
    .map((c) => {
      const names = [c.name, ...(c.nameVariants || '').split('|').map((x) => x.trim())]
        .filter(Boolean);
      const unique = [...new Set(names.map((n) => n.toLowerCase()))];
      return [
        c.pan,
        unique.length,
        [...new Set(names)].join(' | '),
      ] as (string | number)[];
    })
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 25);
  addSection(
    `3. Same PAN appears with different names (${
      clients.filter((c) => (c.nameVariants || '').trim()).length
    } PANs) - possible typo in PAN or name; top 25 shown, all listed in Client Summary last column`,
    ['PAN', 'Name variants (count incl. main name)', 'Names'],
    variantRows
  );

  // 4. Same AY multiple entries — app stores one per year
  addSection(
    '4. Same client has more than one entry in the same assessment year (0 cases) - counted as ONE year filed but all amounts are added',
    ['Client ID', 'AY', 'Entries'],
    [['None', '', '']]
  );

  // 5. No valid PAN
  const noPan: (string | number)[][] = [];
  for (const c of clients) {
    if (isValidPan(c.pan)) continue;
    const yrs = sortAssessmentYears(Object.keys(c.filings || {}));
    if (yrs.length === 0) {
      noPan.push(['', c.name, c.phone || '', 0]);
    } else {
      for (const ay of yrs) {
        const f = c.filings[ay];
        noPan.push([ay, c.name, c.phone || '', Number(f?.received) || 0]);
      }
    }
  }
  addSection(
    '5. Entries with no valid PAN (kept; grouped by mobile or name)',
    ['AY', 'Name', 'Mobile', 'Received'],
    noPan
  );
}

function writeNotes(wb: ExcelJS.Workbook) {
  const sheet = wb.addWorksheet('Notes');
  sheet.getColumn(1).width = 130;
  const today = new Date();
  const dd = String(today.getUTCDate()).padStart(2, '0');
  const months = [
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
  ];
  const mon = months[today.getUTCMonth()];
  const yyyy = today.getUTCFullYear();

  const lines = [
    'How this workbook was built',
    `Source: exported from TaxLedger on ${dd}-${mon}-${yyyy}.`,
    'Client = one PAN. PAN is used as the unique ID because mobile is blank for most 2019-22 entries and the same mobile is shared by different people.',
    '"Mobile Summary" gives the same totals grouped by mobile number, as requested. Where one mobile is linked to several PANs, totals are the sum of all of them (flagged in the Note column).',
    'Times filed = number of different assessment years in which the client appears. "Total Entries" counts every row (a client can have 2 entries in one year).',
    'Passwords from the source sheets were deliberately NOT copied into this report.',
    'AY 2019-20 and AY 2020-21 only have a Received figure (no Amount column). Amount Billed is assumed equal to Received for those years, so they show no outstanding. See "Amount Note" in All Data.',
    'Outstanding = Amount Billed - Received (recalculated; the old Balance column was not used). A negative figure means the client paid more than billed.',
    'A blank Received cell is treated as 0 received.',
    'Amounts are in Rs. Filters are on every sheet; the summary sheets can be re-sorted.',
  ];
  lines.forEach((line, i) => {
    const cell = sheet.getCell(`A${i + 1}`);
    cell.value = line;
    cell.alignment = { wrapText: true };
    cell.font =
      i === 0
        ? { name: 'Arial', size: 10, bold: true }
        : BODY_FONT;
  });
}

function resolveSheetFlags(flags: ExportSheetFlags): ExportSheetFlags {
  const out = { ...flags };
  if (out.yearSummary) {
    out.allData = true;
    out.clientSummary = true;
  }
  if (out.clientSummary || out.mobileSummary) {
    out.allData = true;
  }
  return out;
}

export async function buildWorkbookBlob(
  ledger: LedgerState,
  sheets: ExportSheetFlags
): Promise<{ blob: Blob; forcedSheets: string[] }> {
  const flags = resolveSheetFlags(sheets);
  const forcedSheets: string[] = [];
  if (flags.allData && !sheets.allData) forcedSheets.push('All Data');
  if (flags.clientSummary && !sheets.clientSummary)
    forcedSheets.push('Client Summary');

  const years = sortAssessmentYears(ledger.assessmentYears);
  const clients = ledger.clients;

  const needAllData =
    flags.allData ||
    flags.clientSummary ||
    flags.mobileSummary ||
    flags.yearSummary;
  const needClient = flags.clientSummary || flags.yearSummary;

  const content = new ExcelJS.Workbook();
  content.calcProperties.fullCalcOnLoad = true;

  let adCount = 0;
  let cMeta = {
    lastRow: 2,
    ayStartCol: 5,
    ayEndCol: 12,
    yearsFiledCol: 13,
  };

  if (needAllData) {
    adCount = writeAllData(content, clients, years);
  }
  if (needClient) {
    cMeta = writeClientSummary(content, clients, years, adCount + 1);
  }
  if (flags.mobileSummary) {
    writeMobileSummary(content, clients, years, adCount + 1);
  }
  if (flags.reviewNeeded) {
    writeReviewNeeded(content, clients, years);
  }
  if (flags.yearSummary) {
    writeYearSummary(content, clients, years, adCount + 1, cMeta);
  }
  writeNotes(content);

  const desired = [
    'Year Summary',
    'All Data',
    'Client Summary',
    'Mobile Summary',
    'Review Needed',
    'Notes',
  ].filter((n) => !!content.getWorksheet(n));

  const orderedWb = new ExcelJS.Workbook();
  orderedWb.calcProperties.fullCalcOnLoad = true;
  orderedWb.creator = 'TaxLedger';

  for (const name of desired) {
    const src = content.getWorksheet(name);
    if (!src) continue;
    const dest = orderedWb.addWorksheet(name);
    src.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const newRow = dest.getRow(rowNumber);
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const newCell = newRow.getCell(colNumber);
        newCell.value = cell.value as ExcelJS.CellValue;
        if (cell.numFmt) newCell.numFmt = cell.numFmt;
        if (cell.font) newCell.font = { ...cell.font };
        if (cell.fill) newCell.fill = cell.fill;
        if (cell.alignment) newCell.alignment = { ...cell.alignment };
      });
      if (row.height) newRow.height = row.height;
    });
    src.columns.forEach((col, i) => {
      if (col.width) dest.getColumn(i + 1).width = col.width;
    });
    if (src.autoFilter) dest.autoFilter = src.autoFilter;
    if (src.views?.length) dest.views = [...src.views];
  }

  const buf = await orderedWb.xlsx.writeBuffer();
  return {
    blob: new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    forcedSheets,
  };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportFilename(ledger: LedgerState): string {
  const years = sortAssessmentYears(ledger.assessmentYears);
  const first = ayStartYear(years[0] || 'AY 2019-20');
  const last = ayStartYear(years[years.length - 1] || 'AY 2026-27');
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `Filing_Master_Report_${first}-${last}_${yyyy}-${mm}-${dd}.xlsx`;
}

export async function buildImportTemplateBlob(
  years: string[]
): Promise<Blob> {
  const sorted = sortAssessmentYears(
    years.length
      ? years
      : [
          'AY 2019-20',
          'AY 2020-21',
          'AY 2021-22',
          'AY 2022-23',
          'AY 2023-24',
          'AY 2024-25',
          'AY 2025-26',
          'AY 2026-27',
        ]
  );
  const demo: LedgerState = {
    assessmentYears: sorted,
    clients: [
      {
        id: 'tpl-1',
        name: 'Sample Client',
        pan: 'ABCDE1234F',
        password: 'NOT SET',
        phone: '9876543210',
        referenceNumber: '',
        otherMobiles: '',
        nameVariants: '',
        filings: {
          [sorted[sorted.length - 1]]: {
            assessmentYear: sorted[sorted.length - 1],
            filingDate: '2026-01-15',
            fees: 10000,
            received: 5000,
            balance: 5000,
            paymentType: 'GPay',
            paymentReceiveDate: '2026-01-16',
          },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    gstMonths: [],
    gstClients: [],
  };
  const { blob } = await buildWorkbookBlob(demo, {
    yearSummary: true,
    allData: true,
    clientSummary: true,
    mobileSummary: true,
    reviewNeeded: true,
  });
  return blob;
}
