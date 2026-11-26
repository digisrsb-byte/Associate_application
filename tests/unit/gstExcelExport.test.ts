import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import type { GstClientRecord, LedgerState } from '../../src/types/ledger.ts';
import {
  buildGstImportTemplateBlob,
  buildGstWorkbookBlob,
  gstExportFilename,
} from '../../src/utils/gstExcelExport.ts';

const gst: GstClientRecord = {
  id: 'g1',
  companyName: 'GST Co',
  userId: 'gstuser1',
  phone: '9876543211',
  referenceNumber: 'GREF',
  remark: '',
  totalReceived: 51000,
  unallocatedReceived: 50000,
  filings: {
    'Apr 2026': {
      month: 'Apr 2026',
      fees: 200,
      interest: 20,
      tax: 10,
      total: 230,
      payments: [
        {
          id: 'p1',
          amount: 1000,
          paymentDate: '2026-04-10',
          paymentMode: 'GPay',
          createdAt: '2026-04-10T00:00:00.000Z',
        },
      ],
    },
  },
  createdAt: '',
  updatedAt: '',
};

const ledger: LedgerState = {
  assessmentYears: [],
  clients: [],
  gstMonths: ['Apr 2026', 'May 2026'],
  gstClients: [gst],
};

describe('gstExcelExport', () => {
  it('buildGstWorkbookBlob emits xlsx for month/company/sheet flags', async () => {
    const blob = await buildGstWorkbookBlob(ledger, {
      monthSummary: true,
      companySummary: true,
      sheetView: true,
      allData: false,
    });
    expect(blob.size).toBeGreaterThan(500);
  });

  it('buildGstWorkbookBlob with allData only', async () => {
    const blob = await buildGstWorkbookBlob(ledger, {
      monthSummary: false,
      companySummary: false,
      sheetView: false,
      allData: true,
    });
    expect(blob.size).toBeGreaterThan(200);
  });

  it('gstExportFilename embeds month range', () => {
    const name = gstExportFilename(ledger);
    expect(name).toMatch(
      /^GST_Filing_Master_Report_Apr2026-May2026_\d{4}-\d{2}-\d{2}\.xlsx$/
    );
  });

  it('buildGstImportTemplateBlob works with and without months', async () => {
    const withMonths = await buildGstImportTemplateBlob(['Apr 2026']);
    expect(withMonths.size).toBeGreaterThan(200);
    const defaults = await buildGstImportTemplateBlob([]);
    expect(defaults.size).toBeGreaterThan(200);
  });

  it('All Data month row uses Month Recd (payment sum), not company Total Recd', async () => {
    const multi: LedgerState = {
      ...ledger,
      gstMonths: ['Apr 2026', 'May 2026'],
      gstClients: [
        {
          ...gst,
          filings: {
            'Apr 2026': {
              month: 'Apr 2026',
              fees: 5000,
              interest: 0,
              tax: 0,
              total: 5000,
              payments: [
                {
                  id: 'p1',
                  amount: 1000,
                  paymentDate: '2026-04-10',
                  paymentMode: 'GPay',
                  createdAt: '2026-04-10T00:00:00.000Z',
                },
              ],
            },
            'May 2026': {
              month: 'May 2026',
              fees: 3000,
              interest: 0,
              tax: 0,
              total: 3000,
              payments: [
                {
                  id: 'p2',
                  amount: 800,
                  paymentDate: '2026-05-10',
                  paymentMode: 'Cash',
                  createdAt: '2026-05-10T00:00:00.000Z',
                },
              ],
            },
          },
          totalReceived: 51800,
          unallocatedReceived: 50000,
        },
      ],
    };

    const blob = await buildGstWorkbookBlob(multi, {
      monthSummary: false,
      companySummary: true,
      sheetView: true,
      allData: true,
    });
    const buf = Buffer.from(await blob.arrayBuffer());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);

    const allData = wb.getWorksheet('All Data');
    expect(allData).toBeTruthy();
    const header = allData!.getRow(1).values as Array<string | number | undefined>;
    expect(header).toContain('Month Recd');
    expect(header).toContain('Company Unallocated Recd');
    expect(header).toContain('Month Outstanding');
    expect(header).not.toContain('Total Recd');

    const monthRecdCol = header.findIndex((v) => v === 'Month Recd');
    const unallocCol = header.findIndex(
      (v) => v === 'Company Unallocated Recd'
    );
    const monthOutCol = header.findIndex((v) => v === 'Month Outstanding');

    const apr = allData!.getRow(2);
    const may = allData!.getRow(3);
    expect(Number(apr.getCell(monthRecdCol).value)).toBe(1000);
    expect(Number(may.getCell(monthRecdCol).value)).toBe(800);
    expect(Number(apr.getCell(unallocCol).value)).toBe(50000);
    expect(Number(may.getCell(unallocCol).value)).toBe(50000);
    // Month outstanding = total − month recd
    expect(Number(apr.getCell(monthOutCol).value)).toBe(4000);
    expect(Number(may.getCell(monthOutCol).value)).toBe(2200);
    // Must not repeat company Total Recd (51800) on month rows
    expect(Number(apr.getCell(monthRecdCol).value)).not.toBe(51800);

    const company = wb.getWorksheet('Company Summary');
    expect(company).toBeTruthy();
    const cHeader = company!.getRow(1).values as Array<
      string | number | undefined
    >;
    expect(cHeader).toContain('Unallocated Recd');
    expect(cHeader).toContain('Total Recd');

    const sheetView = wb.getWorksheet('Sheet View');
    expect(sheetView).toBeTruthy();
    const sheetText: string[] = [];
    sheetView!.eachRow((row) => {
      row.eachCell((cell) => {
        if (cell.value != null) sheetText.push(String(cell.value));
      });
    });
    expect(sheetText.some((t) => t.startsWith('Recd '))).toBe(true);
    expect(sheetText.some((t) => t.startsWith('Out '))).toBe(true);
  });
});
