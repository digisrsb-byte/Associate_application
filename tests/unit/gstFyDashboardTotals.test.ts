import { describe, expect, it } from 'vitest';
import type { GstClientRecord, GstMonthlyFiling } from '../../src/types/ledger.ts';
import {
  computeGstClientTotals,
  getMonthsForGstFinancialYear,
} from '../../src/utils/ledgerUtils.ts';
import {
  computeGstFyDashboardTotals,
  computeGstMonthSummary,
} from '../../src/utils/summaryUtils.ts';

function filing(
  month: string,
  partial: Partial<GstMonthlyFiling> &
    Pick<GstMonthlyFiling, 'fees' | 'interest' | 'tax' | 'total'>
): GstMonthlyFiling {
  return { month, ...partial };
}

function company(
  partial: Partial<GstClientRecord> &
    Pick<GstClientRecord, 'id' | 'companyName' | 'userId'>
): GstClientRecord {
  return {
    phone: '',
    referenceNumber: '',
    totalReceived: 0,
    filings: {},
    createdAt: '',
    updatedAt: '',
    ...partial,
  };
}

const FY_2526 = 'FY 2025-26';
const FY_2627 = 'FY 2026-27';
const months2526 = getMonthsForGstFinancialYear(FY_2526);
const months2627 = getMonthsForGstFinancialYear(FY_2627);

describe('computeGstFyDashboardTotals (Phase 8D.14 / 8D.12 §8)', () => {
  const multiFy = [
    company({
      id: 'g1',
      companyName: 'Multi FY Co',
      userId: 'u1',
      unallocatedReceived: 50_000,
      filings: {
        'Apr 2025': filing('Apr 2025', {
          fees: 10_000,
          interest: 0,
          tax: 0,
          total: 10_000,
          payments: [
            {
              id: 'p1',
              amount: 3000,
              paymentDate: '2026-05-01', // payment date in next FY — still counts in filing FY
              paymentMode: 'GPay',
            },
            {
              id: 'p2',
              amount: 2000,
              paymentDate: '2025-04-20',
              paymentMode: 'Cash',
            },
          ],
        }),
        'May 2025': filing('May 2025', {
          fees: 4000,
          interest: 0,
          tax: 0,
          total: 4000,
          // zero payments
        }),
        'Apr 2026': filing('Apr 2026', {
          fees: 8000,
          interest: 500,
          tax: 100,
          total: 8600,
          payments: [
            {
              id: 'p3',
              amount: 1500,
              paymentDate: '2026-04-10',
              paymentMode: 'GPay',
            },
          ],
        }),
        'Jun 2026': filing('Jun 2026', {
          fees: 2000,
          interest: 0,
          tax: 0,
          total: 2000,
          payments: [
            {
              id: 'p4',
              amount: 5000, // over-received
              paymentDate: '2026-06-01',
              paymentMode: 'Bank',
            },
          ],
        }),
        'Jul 2026': filing('Jul 2026', {
          fees: 3000,
          interest: 0,
          tax: 0,
          total: 3000,
          payments: [
            {
              id: 'p5',
              amount: 1000, // partial
              paymentDate: '2026-07-01',
              paymentMode: 'GPay',
            },
          ],
        }),
      },
    }),
  ];

  it('1/8 — filings across two FYs scope billed/received/outstanding/entries per FY', () => {
    const a = computeGstFyDashboardTotals(multiFy, months2526);
    const b = computeGstFyDashboardTotals(multiFy, months2627);

    expect(a.totalEntries).toBe(2);
    expect(a.totalBilled).toBe(14_000);
    expect(a.totalReceived).toBe(5000); // 3000+2000 on Apr 2025 only
    expect(a.totalOutstanding).toBe(5000 + 4000); // Apr out 5k + May out 4k

    expect(b.totalEntries).toBe(3);
    expect(b.totalBilled).toBe(8600 + 2000 + 3000);
    expect(b.totalReceived).toBe(1500 + 5000 + 1000);
  });

  it('2 — multiple payments on one filing counted once as sum', () => {
    const a = computeGstFyDashboardTotals(multiFy, months2526);
    expect(a.totalReceived).toBe(5000);
  });

  it('3 — payments follow filing month FY, not paymentDate', () => {
    const a = computeGstFyDashboardTotals(multiFy, months2526);
    // p1 dated 2026-05-01 still in FY 2025-26 via Apr 2025 filing
    expect(a.totalReceived).toBe(5000);
    const b = computeGstFyDashboardTotals(multiFy, months2627);
    expect(b.totalReceived).toBe(7500);
  });

  it('4 — unallocated separate; not in FY Received', () => {
    const a = computeGstFyDashboardTotals(multiFy, months2526);
    expect(a.unallocatedReceived).toBe(50_000);
    expect(a.totalReceived).toBe(5000);
  });

  it('5 — zero-payment filing contributes billed/entries; received 0; outstanding = collectible', () => {
    const a = computeGstFyDashboardTotals(multiFy, months2526);
    // May 2025: billed 4000, recd 0, out 4000 — included in aggregates
    expect(a.totalBilled).toBe(14_000);
    expect(a.totalOutstanding).toBe(9000);
  });

  it('6 — partially paid filing outstanding = collectible − received', () => {
    const b = computeGstFyDashboardTotals(multiFy, months2627);
    // Jul: 3000-1000=2000; Apr: 8600-1500=7100; Jun over → 0
    expect(b.totalOutstanding).toBe(7100 + 0 + 2000);
  });

  it('7 — over-received month floors at 0 and does not reduce other months', () => {
    const b = computeGstFyDashboardTotals(multiFy, months2627);
    expect(b.totalOutstanding).toBe(9100);
    // If netted: billed 13600 - recd 7500 = 6100 — must NOT equal that
    expect(b.totalOutstanding).not.toBe(13_600 - 7500);
  });

  it('8 — switching FY changes all four metrics with no cross-bleed', () => {
    const a = computeGstFyDashboardTotals(multiFy, months2526);
    const b = computeGstFyDashboardTotals(multiFy, months2627);
    expect(a.totalBilled).not.toBe(b.totalBilled);
    expect(a.totalReceived).not.toBe(b.totalReceived);
    expect(a.totalOutstanding).not.toBe(b.totalOutstanding);
    expect(a.totalEntries).not.toBe(b.totalEntries);
  });

  it('9 — computeGstClientTotals unchanged (company still includes unallocated)', () => {
    const before = computeGstClientTotals(multiFy[0]);
    computeGstFyDashboardTotals(multiFy, months2526);
    const after = computeGstClientTotals(multiFy[0]);
    expect(after).toEqual(before);
    expect(after.unallocatedReceived).toBe(50_000);
    expect(after.totalReceived).toBe(5000 + 7500 + 50_000);
  });

  it('10 — computeGstMonthSummary footer matches FY helper for same months', () => {
    const fy = computeGstFyDashboardTotals(multiFy, months2627);
    const summary = computeGstMonthSummary(multiFy, months2627);
    expect(summary.totalReceived).toBe(fy.totalReceived);
    expect(summary.totalOutstanding).toBe(fy.totalOutstanding);
    expect(summary.totalBilled).toBe(fy.totalBilled);
    expect(summary.totalEntries).toBe(fy.totalEntries);
    expect(summary.unallocatedReceived).toBe(fy.unallocatedReceived);
  });

  it('11 — empty FY shows zero FY figures; unallocated still visible', () => {
    const emptyMonths = getMonthsForGstFinancialYear('FY 2024-25');
    const empty = computeGstFyDashboardTotals(multiFy, emptyMonths);
    expect(empty.totalBilled).toBe(0);
    expect(empty.totalReceived).toBe(0);
    expect(empty.totalOutstanding).toBe(0);
    expect(empty.totalEntries).toBe(0);
    expect(empty.unallocatedReceived).toBe(50_000);
  });

  it('12 — legacy month scalar received included via computeGstFilingReceived', () => {
    const legacy = [
      company({
        id: 'g2',
        companyName: 'Legacy Co',
        userId: 'u2',
        filings: {
          'Apr 2026': filing('Apr 2026', {
            fees: 2000,
            interest: 0,
            tax: 0,
            total: 2000,
            received: 750,
          }),
        },
      }),
    ];
    const fy = computeGstFyDashboardTotals(legacy, months2627);
    expect(fy.totalReceived).toBe(750);
    expect(fy.totalOutstanding).toBe(1250);
    expect(fy.totalEntries).toBe(1);
  });
});
