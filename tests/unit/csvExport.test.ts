import { describe, expect, it } from 'vitest';
import type { ClientRecord, GstClientRecord } from '../../src/types/ledger.ts';
import {
  exportAllDataExcelCsv,
  exportClientSummaryExcelCsv,
  exportContinuousSheetExcelCsv,
  exportGstAllDataExcelCsv,
  exportGstClientSummaryExcelCsv,
  exportGstContinuousSheetExcelCsv,
  exportGstMonthSummaryExcelCsv,
  exportMobileSummaryExcelCsv,
  exportYearSummaryExcelCsv,
} from '../../src/utils/csvExport.ts';

const PAN = 'ZZAPA0099Z';

const client: ClientRecord = {
  id: 'c1',
  name: 'E2E Export Co',
  pan: PAN,
  phone: '9876543210',
  referenceNumber: 'REF1',
  remark: 'note',
  filings: {
    'AY 2025-26': {
      assessmentYear: 'AY 2025-26',
      filingDate: '2025-07-01',
      fees: 1000,
      received: 400,
      balance: 600,
      paymentType: 'UPI',
      paymentReceiveDate: '2025-07-02',
    },
  },
  createdAt: '',
  updatedAt: '',
};

const gst: GstClientRecord = {
  id: 'g1',
  companyName: 'E2E GST Co',
  userId: 'gstuser1',
  phone: '9876543211',
  referenceNumber: 'GREF',
  remark: '',
  totalReceived: 100,
  filings: {
    'Apr 2026': {
      month: 'Apr 2026',
      fees: 200,
      interest: 20,
      tax: 10,
      total: 230,
    },
  },
  createdAt: '',
  updatedAt: '',
};

function assertCsvBasics(csv: string, mustInclude: string[]) {
  expect(csv.includes('\r\n')).toBe(true);
  for (const s of mustInclude) {
    expect(csv).toContain(s);
  }
}

describe('IT csvExport', () => {
  it('exportAllDataExcelCsv includes PAN and blank Password column', () => {
    const csv = exportAllDataExcelCsv([client], ['AY 2025-26']);
    assertCsvBasics(csv, ['Assessment Year', 'PAN', 'Password', PAN, 'E2E Export Co']);
    const header = csv.split('\r\n')[0].split(',');
    const pwdIdx = header.indexOf('Password');
    const panIdx = header.indexOf('PAN');
    const data = csv.split('\r\n').find((l) => l.includes(PAN))!;
    const cells = data.split(',');
    expect(cells[pwdIdx]).toBe('');
    expect(cells[panIdx]).toBe(PAN);
  });

  it('exportContinuousSheetExcelCsv keeps password cell empty', () => {
    const csv = exportContinuousSheetExcelCsv([client], ['AY 2025-26']);
    expect(csv).toContain('Password');
    expect(csv).toContain(PAN);
    expect(csv).not.toMatch(/,secret,/i);
  });

  it('exportYearSummaryExcelCsv emits totals row', () => {
    const csv = exportYearSummaryExcelCsv([client], ['AY 2025-26']);
    expect(csv).toContain('Assessment Year');
    expect(csv).toContain('TOTAL');
    expect(csv).toContain('1000');
  });

  it('exportClientSummaryExcelCsv and exportMobileSummaryExcelCsv include PAN/mobile', () => {
    const clientCsv = exportClientSummaryExcelCsv([client], ['AY 2025-26']);
    expect(clientCsv).toContain(PAN);
    expect(clientCsv).toContain('Client ID (PAN)');

    const mobileCsv = exportMobileSummaryExcelCsv([client], ['AY 2025-26']);
    expect(mobileCsv).toContain('9876543210');
    expect(mobileCsv).toContain('Mobile Number');
  });
});

describe('GST csvExport', () => {
  it('exportGstAllDataExcelCsv blanks Password and includes User ID', () => {
    const csv = exportGstAllDataExcelCsv([gst], ['Apr 2026']);
    assertCsvBasics(csv, ['Month', 'Company Name', 'User ID', 'Password', 'gstuser1']);
    const header = csv.split('\r\n')[0].split(',');
    const pwdIdx = header.indexOf('Password');
    const row = csv.split('\r\n').find((l) => l.includes('gstuser1'))!;
    expect(row.split(',')[pwdIdx]).toBe('');
  });

  it('exportGstContinuousSheetExcelCsv / month / client summaries emit labels', () => {
    expect(exportGstContinuousSheetExcelCsv([gst], ['Apr 2026'])).toContain(
      'Monthly Filing'
    );
    expect(exportGstMonthSummaryExcelCsv([gst], ['Apr 2026'])).toContain('TOTAL');
    expect(exportGstClientSummaryExcelCsv([gst], ['Apr 2026'])).toContain('E2E GST Co');
  });
});
