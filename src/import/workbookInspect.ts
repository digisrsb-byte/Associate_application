import ExcelJS from 'exceljs';
import { cellText, looksLikeXlsxBuffer } from './excelCells.ts';
import type { ImportDomain } from './fieldCatalog.ts';

export type SheetRole =
  | 'all_data'
  | 'client_summary'
  | 'company_summary'
  | 'year_summary'
  | 'month_summary'
  | 'mobile_summary'
  | 'review_needed'
  | 'notes'
  | 'unknown';

export type InspectedSheet = {
  name: string;
  role: SheetRole;
  headerRow: number;
  headings: string[];
  dataRowCount: number;
};

export type WorkbookInspection = {
  sheets: InspectedSheet[];
  suggestedSheetName: string | null;
};

function inferRole(name: string): SheetRole {
  const n = name.trim().toLowerCase();
  if (n === 'all data' || n.includes('all data') || n === 'filing data') {
    return 'all_data';
  }
  if (n.includes('client summary')) return 'client_summary';
  if (n.includes('company summary')) return 'company_summary';
  if (n.includes('year summary')) return 'year_summary';
  if (n.includes('month summary')) return 'month_summary';
  if (n.includes('mobile summary')) return 'mobile_summary';
  if (n.includes('review')) return 'review_needed';
  if (n.includes('note')) return 'notes';
  return 'unknown';
}

export function findHeaderRow(sheet: ExcelJS.Worksheet, maxScan = 15): number {
  for (let r = 1; r <= Math.min(maxScan, sheet.rowCount || maxScan); r++) {
    let texts = 0;
    sheet.getRow(r).eachCell({ includeEmpty: false }, (c) => {
      if (cellText(c.value)) texts++;
    });
    if (texts >= 3) return r;
  }
  return 1;
}

export function headingsAt(
  sheet: ExcelJS.Worksheet,
  headerRow: number
): string[] {
  const headings: string[] = [];
  sheet.getRow(headerRow).eachCell({ includeEmpty: false }, (c) => {
    const t = cellText(c.value);
    if (t) headings.push(t);
  });
  return headings;
}

export async function loadWorkbookFromBuffer(
  buf: Buffer
): Promise<ExcelJS.Workbook> {
  if (!looksLikeXlsxBuffer(buf)) {
    throw new Error('File is not a valid .xlsx workbook (OOXML ZIP).');
  }
  const wb = new ExcelJS.Workbook();
  // ExcelJS typings expect Buffer; runtime accepts Uint8Array/Buffer alike.
  await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
  return wb;
}

export async function inspectWorkbookBuffer(
  buf: Buffer,
  domain: ImportDomain
): Promise<{ workbook: ExcelJS.Workbook; inspection: WorkbookInspection }> {
  const workbook = await loadWorkbookFromBuffer(buf);
  const sheets: InspectedSheet[] = [];

  for (const sheet of workbook.worksheets) {
    const headerRow = findHeaderRow(sheet);
    const headings = headingsAt(sheet, headerRow);
    let dataRowCount = 0;
    sheet.eachRow({ includeEmpty: false }, (_row, rn) => {
      if (rn > headerRow) dataRowCount++;
    });
    sheets.push({
      name: sheet.name,
      role: inferRole(sheet.name),
      headerRow,
      headings,
      dataRowCount,
    });
  }

  const preferredRole = 'all_data';
  let suggested =
    sheets.find((s) => s.role === preferredRole && s.dataRowCount > 0) ||
    sheets.find((s) => s.role === preferredRole) ||
    null;

  if (!suggested) {
    suggested =
      sheets
        .filter((s) => s.dataRowCount > 0 && s.headings.length >= 3)
        .sort((a, b) => b.dataRowCount - a.dataRowCount)[0] || null;
  }

  // Domain hint: prefer company_summary only if no all_data for GST
  if (domain === 'gst' && !sheets.some((s) => s.role === 'all_data')) {
    const cs = sheets.find((s) => s.role === 'company_summary');
    if (cs) suggested = cs;
  }

  return {
    workbook,
    inspection: {
      sheets,
      suggestedSheetName: suggested?.name ?? null,
    },
  };
}
