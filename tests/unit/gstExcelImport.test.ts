import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import {
  detectGstSheets,
  gstPreviewToRecords,
  parseGstAllData,
} from '../../src/utils/gstExcelImport.ts';

async function workbookToFile(
  wb: ExcelJS.Workbook,
  name = 'gst.xlsx'
): Promise<File> {
  const buf = await wb.xlsx.writeBuffer();
  return new File([buf], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

describe('gstExcelImport', () => {
  it('detectGstSheets finds known sheets and rejects empty workbooks', async () => {
    const wb = new ExcelJS.Workbook();
    const all = wb.addWorksheet('All Data');
    all.addRow([
      'Month',
      'Company Name',
      'User ID',
      'Password',
      'Phone',
      'Fees',
      'Interest',
      'Tax',
      'Total',
      'Total Recd',
    ]);
    all.addRow([
      'Apr 2026',
      'Acme',
      'user1',
      '',
      '9999999999',
      100,
      10,
      5,
      115,
      50,
    ]);
    wb.addWorksheet('Notes').addRow(['n']);

    const file = await workbookToFile(wb);
    const detected = await detectGstSheets(file);
    expect(detected.sheets.some((s) => s.name === 'All Data')).toBe(true);
    expect(detected.sheets.find((s) => s.name === 'All Data')!.rows).toBe(1);

    const empty = new ExcelJS.Workbook();
    empty.addWorksheet('Random').addRow(['x']);
    await expect(detectGstSheets(await workbookToFile(empty))).rejects.toThrow(
      /No recognised GST sheet/
    );
  });

  it('parseGstAllData aggregates filings and issues', async () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('All Data');
    sheet.addRow([
      'Month',
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
    ]);
    sheet.addRow([
      'Apr 2026',
      'Acme',
      'user1',
      'p1',
      '111',
      'R1',
      'ok',
      100,
      0,
      0,
      0,
      40,
    ]);
    sheet.addRow([
      'May 2026',
      'Acme Updated',
      'user1',
      '',
      '222',
      'R2',
      'upd',
      50,
      5,
      5,
      60,
      80,
    ]);
    sheet.addRow(['Jun 2026', 'No User', '', '', '', '', '', 1, 0, 0, 1, 0]);

    const preview = parseGstAllData(wb);
    expect(preview.companies).toHaveLength(1);
    expect(preview.companies[0].companyName).toBe('Acme Updated');
    expect(preview.companies[0].totalReceived).toBe(80);
    expect(preview.companies[0].filings['Apr 2026'].total).toBe(100);
    expect(preview.companies[0].filings['May 2026'].total).toBe(60);
    expect(preview.months).toEqual(['Apr 2026', 'May 2026']);
    expect(preview.issues.some((i) => /Missing User ID/.test(i.message))).toBe(
      true
    );

    const records = gstPreviewToRecords(preview);
    expect(records[0].userId).toBe('user1');
    expect(records[0].password).toBe('p1');
  });

  it('parseGstAllData reports missing sheet and missing columns', () => {
    const missing = parseGstAllData(new ExcelJS.Workbook());
    expect(missing.issues[0].message).toMatch(/Sheet missing/);

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('All Data');
    sheet.addRow(['Foo', 'Bar']);
    sheet.addRow(['a', 'b']);
    const bad = parseGstAllData(wb);
    expect(bad.issues[0].message).toMatch(/Required columns/);
  });
});
