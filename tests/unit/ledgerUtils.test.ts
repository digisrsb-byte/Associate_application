import { describe, expect, it } from 'vitest';
import type { ClientRecord, GstClientRecord } from '../../src/types/ledger.ts';
import {
  collectGstFinancialYears,
  computeBalance,
  computeClientTotals,
  computeGstClientTotals,
  computeGstFilingOutstanding,
  computeGstFilingReceived,
  computeGstFilingTotal,
  exportContinuousCsv,
  extractMonthOrderKey,
  extractYearOrderKey,
  filterMonthsByGstFinancialYear,
  formatCurrency,
  formatDisplayDate,
  formatGstFinancialYearLabel,
  formatPlainNumber,
  getCurrentGstFinancialYearLabel,
  getGstFinancialYearLabel,
  getMonthsForGstFinancialYear,
  getNextAssessmentYear,
  getNextGstMonth,
  normalizeAssessmentYearLabel,
  normalizeGstMonthLabel,
  normalizePan,
  parseGstFinancialYearStart,
  shiftGstFinancialYear,
  sortAssessmentYears,
  sortGstFinancialYears,
  sortGstMonths,
} from '../../src/utils/ledgerUtils.ts';

describe('ledgerUtils money helpers', () => {
  it('computeBalance clamps and never goes negative', () => {
    expect(computeBalance(1000, 400)).toBe(600);
    expect(computeBalance(100, 150)).toBe(0);
    expect(computeBalance(-5, 10)).toBe(0);
    expect(computeBalance(Number.NaN, 10)).toBe(0);
  });

  it('computeGstFilingTotal sums non-negative parts', () => {
    expect(computeGstFilingTotal(100, 20, 5)).toBe(125);
    expect(computeGstFilingTotal(-1, Number.NaN, 3)).toBe(3);
  });

  it('computeClientTotals aggregates filings', () => {
    const client = {
      id: 'c1',
      name: 'Test',
      pan: 'ABCPE1234F',
      password: '',
      phone: '',
      referenceNumber: '',
      filings: {
        'AY 2024-25': {
          assessmentYear: 'AY 2024-25',
          filingDate: '',
          fees: 1000,
          received: 400,
          balance: 600,
          paymentType: '',
          paymentReceiveDate: '',
        },
        'AY 2025-26': {
          assessmentYear: 'AY 2025-26',
          filingDate: '',
          fees: 500,
          received: 500,
          balance: 0,
          paymentType: '',
          paymentReceiveDate: '',
        },
      },
      createdAt: '',
      updatedAt: '',
    } as ClientRecord;

    expect(computeClientTotals(client)).toEqual({
      totalReceived: 900,
      outstandingTotal: 600,
    });
  });

  it('computeGstClientTotals aggregates billed vs received', () => {
    const client = {
      id: 'g1',
      companyName: 'Co',
      userId: 'user1',
      password: '',
      phone: '',
      referenceNumber: '',
      totalReceived: 50,
      filings: {
        'Apr 2024': { month: 'Apr 2024', fees: 100, interest: 10, tax: 5, total: 115 },
      },
      createdAt: '',
      updatedAt: '',
    } as GstClientRecord;

    const totals = computeGstClientTotals(client);
    expect(totals.totalBilled).toBe(115);
    expect(totals.outstandingTotal).toBe(65);
    expect(totals.allocatedReceived).toBe(0);
    expect(totals.totalReceived).toBe(50);
  });

  it('GST per-month payments drive Received/Outstanding without cross-month bleed', () => {
    const client = {
      id: 'g2',
      companyName: 'Pay Co',
      userId: 'user2',
      phone: '9000000000',
      referenceNumber: 'R1',
      remark: 'synthetic',
      totalReceived: 0,
      filings: {
        'Apr 2026': {
          month: 'Apr 2026',
          fees: 1500,
          interest: 200,
          tax: 300,
          total: 2000,
          payments: [
            {
              id: 'gstpay-1',
              amount: 1200,
              paymentDate: '2026-04-10',
              paymentMode: 'GPay',
              createdAt: '2026-04-10T00:00:00.000Z',
            },
          ],
        },
        'May 2026': {
          month: 'May 2026',
          fees: 1000,
          interest: 0,
          tax: 0,
          total: 1000,
          payments: [],
        },
      },
      createdAt: '',
      updatedAt: '',
    } as GstClientRecord;

    expect(computeGstFilingTotal(1500, 200, 300)).toBe(2000);
    expect(computeGstFilingReceived(client.filings['Apr 2026'])).toBe(1200);
    expect(computeGstFilingOutstanding(client.filings['Apr 2026'])).toBe(800);
    expect(computeGstFilingReceived(client.filings['May 2026'])).toBe(0);
    expect(computeGstFilingOutstanding(client.filings['May 2026'])).toBe(1000);

    const totals = computeGstClientTotals(client);
    expect(totals.allocatedReceived).toBe(1200);
    expect(totals.unallocatedReceived).toBe(0);
    expect(totals.totalReceived).toBe(1200);
    // Company outstanding = billed − (allocated + unallocated)
    expect(totals.outstandingTotal).toBe(1800);
  });

  it('preserves unallocated legacy receipts alongside month payments', () => {
    const client = {
      id: 'g3',
      companyName: 'Legacy Co',
      userId: 'user3',
      phone: '9000000001',
      referenceNumber: 'R2',
      remark: 'synthetic',
      totalReceived: 51000,
      unallocatedReceived: 50000,
      filings: {
        'Apr 2026': {
          month: 'Apr 2026',
          fees: 2000,
          interest: 0,
          tax: 0,
          total: 2000,
          payments: [
            {
              id: 'gstpay-a',
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
    } as GstClientRecord;

    const totals = computeGstClientTotals(client);
    expect(computeGstFilingReceived(client.filings['Apr 2026'])).toBe(1000);
    expect(totals.allocatedReceived).toBe(1000);
    expect(totals.unallocatedReceived).toBe(50000);
    expect(totals.totalReceived).toBe(51000);
    expect(totals.outstandingTotal).toBe(0);
  });
});

describe('ledgerUtils formatting', () => {
  it('formats currency and plain numbers for en-IN', () => {
    expect(formatCurrency(1000)).toContain('1,000');
    expect(formatPlainNumber(2500)).toContain('2,500');
    expect(formatCurrency(Number.NaN)).toContain('0');
  });

  it('formatDisplayDate handles empty and invalid', () => {
    expect(formatDisplayDate('')).toBe('—');
    expect(formatDisplayDate('not-a-date')).toBe('not-a-date');
    expect(formatDisplayDate('2024-01-15')).toMatch(/2024/);
  });

  it('normalizePan delegates to fieldValidation', () => {
    expect(normalizePan('abcpe1234f')).toBe('ABCPE1234F');
    expect(normalizePan(' abcpk1234d ')).toBe('ABCPK1234D');
  });
});

describe('ledgerUtils assessment years', () => {
  it('extracts order keys and sorts', () => {
    expect(extractYearOrderKey('AY 2024-25')).toBe(2024);
    expect(extractYearOrderKey('25')).toBe(2025);
    expect(extractYearOrderKey('')).toBe(0);
    expect(sortAssessmentYears(['AY 2025-26', 'AY 2023-24', 'AY 2025-26'])).toEqual([
      'AY 2023-24',
      'AY 2025-26',
    ]);
  });

  it('normalizes AY labels', () => {
    expect(normalizeAssessmentYearLabel('')).toBe('');
    expect(normalizeAssessmentYearLabel('AY 2024-25')).toBe('AY 2024-25');
    expect(normalizeAssessmentYearLabel('2024-25')).toBe('AY 2024-25');
    expect(normalizeAssessmentYearLabel('2024')).toBe('AY 2024-25');
    expect(normalizeAssessmentYearLabel('custom')).toBe('custom');
  });

  it('getNextAssessmentYear advances from last sorted year', () => {
    expect(getNextAssessmentYear([])).toBe('AY 2026-27');
    expect(getNextAssessmentYear(['AY 2024-25'])).toBe('AY 2025-26');
  });
});

describe('ledgerUtils GST months and FY', () => {
  it('normalizes ISO, slash, and text month labels', () => {
    expect(normalizeGstMonthLabel('')).toBe('');
    expect(normalizeGstMonthLabel('2024-4')).toBe('Apr 2024');
    expect(normalizeGstMonthLabel('4/2024')).toBe('Apr 2024');
    expect(normalizeGstMonthLabel('Apr 24')).toBe('Apr 2024');
    expect(normalizeGstMonthLabel('Weird')).toBe('Weird');
  });

  it('orders and advances months', () => {
    expect(extractMonthOrderKey('Apr 2024')).toBeGreaterThan(0);
    expect(sortGstMonths(['Jun 2024', 'Apr 2024', 'Jun 2024'])).toEqual([
      'Apr 2024',
      'Jun 2024',
    ]);
    expect(getNextGstMonth([])).toBe('Apr 2026');
    expect(getNextGstMonth(['Apr 2024'])).toBe('May 2024');
  });

  it('FY helpers round-trip', () => {
    expect(formatGstFinancialYearLabel(2024)).toBe('FY 2024-25');
    expect(parseGstFinancialYearStart('FY 2024-25')).toBe(2024);
    expect(parseGstFinancialYearStart('nope')).toBeNull();
    expect(getGstFinancialYearLabel('Apr 2024')).toBe('FY 2024-25');
    expect(getGstFinancialYearLabel('Jan 2025')).toBe('FY 2024-25');
    expect(getMonthsForGstFinancialYear('FY 2024-25')).toHaveLength(12);
    expect(shiftGstFinancialYear('FY 2024-25', 1)).toBe('FY 2025-26');
    expect(sortGstFinancialYears(['FY 2025-26', 'FY 2024-25'])).toEqual([
      'FY 2024-25',
      'FY 2025-26',
    ]);
    expect(collectGstFinancialYears(['Apr 2024', 'Jan 2025'])).toEqual(['FY 2024-25']);
    expect(filterMonthsByGstFinancialYear(['Apr 2024', 'Apr 2025'], 'FY 2024-25')).toEqual([
      'Apr 2024',
    ]);
  });

  it('getCurrentGstFinancialYearLabel uses calendar month', () => {
    expect(getCurrentGstFinancialYearLabel(new Date('2024-05-01'))).toBe('FY 2024-25');
    expect(getCurrentGstFinancialYearLabel(new Date('2024-02-01'))).toBe('FY 2023-24');
  });
});

describe('ledgerUtils exportContinuousCsv', () => {
  it('exports headers and blank password column', () => {
    const client = {
      id: 'c1',
      name: 'Test, Inc',
      pan: 'ABCPE1234F',
      password: 'secret',
      phone: '9999999999',
      referenceNumber: 'R1',
      remark: 'note',
      filings: {},
      createdAt: '',
      updatedAt: '',
    } as ClientRecord;

    const csv = exportContinuousCsv([client], ['AY 2024-25']);
    expect(csv.split('\r\n')[0]).toContain('Password');
    expect(csv).toContain('"Test, Inc"');
    expect(csv).not.toContain('secret');
  });
});
