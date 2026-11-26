import { describe, expect, it } from 'vitest';
import type { ClientRecord, GstClientRecord } from '../../src/types/ledger.ts';
import {
  computeClientSummaries,
  computeGstClientSummaries,
  computeGstMonthSummary,
  computeMobileSummaries,
  computeYearSummary,
} from '../../src/utils/summaryUtils.ts';

/** Synthetic structure-valid PAN — not government-verified. */
const PAN_A = 'ZZAPA0001A';
const PAN_B = 'ZZAPA0002B';

function itClient(
  partial: Partial<ClientRecord> & Pick<ClientRecord, 'id' | 'name' | 'pan'>
): ClientRecord {
  return {
    phone: '',
    referenceNumber: '',
    filings: {},
    createdAt: '',
    updatedAt: '',
    ...partial,
  };
}

function gstCompany(
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

describe('computeYearSummary', () => {
  it('aggregates billed/received/outstanding and unique PANs per year', () => {
    const clients = [
      itClient({
        id: 'c1',
        name: 'E2E Alpha',
        pan: PAN_A,
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
      }),
      itClient({
        id: 'c2',
        name: 'E2E Beta',
        pan: PAN_B,
        filings: {
          'AY 2025-26': {
            assessmentYear: 'AY 2025-26',
            filingDate: '',
            fees: 200,
            received: 0,
            balance: 200,
            paymentType: '',
            paymentReceiveDate: '',
          },
        },
      }),
    ];

    const summary = computeYearSummary(clients, ['AY 2025-26', 'AY 2024-25']);
    expect(summary.rows).toHaveLength(2);
    expect(summary.rows[0].year).toBe('AY 2024-25');
    expect(summary.rows[0]).toMatchObject({
      entries: 1,
      uniqueClients: 1,
      amountBilled: 1000,
      received: 400,
      outstanding: 600,
    });
    expect(summary.rows[1]).toMatchObject({
      year: 'AY 2025-26',
      entries: 2,
      uniqueClients: 2,
      amountBilled: 700,
      received: 500,
      outstanding: 200,
    });
    expect(summary.totalUniqueClients).toBe(2);
    expect(summary.totalBilled).toBe(1700);
    expect(summary.totalReceived).toBe(900);
    expect(summary.totalOutstanding).toBe(800);
    expect(summary.buckets.some((b) => b.yearsCount === 2 && b.clientCount === 1)).toBe(
      true
    );
  });

  it('returns zero collection when billed is zero', () => {
    const summary = computeYearSummary([], ['AY 2024-25']);
    expect(summary.rows[0].collectionPct).toBe(0);
    expect(summary.totalCollectionPct).toBe(0);
  });
});

describe('computeClientSummaries', () => {
  it('builds per-client year billed map and outstanding', () => {
    const clients = [
      itClient({
        id: 'c1',
        name: 'E2E Alpha',
        pan: PAN_A,
        phone: '9876543210',
        filings: {
          'AY 2024-25': {
            assessmentYear: 'AY 2024-25',
            filingDate: '',
            fees: 1000,
            received: 250,
            balance: 750,
            paymentType: '',
            paymentReceiveDate: '',
          },
        },
      }),
    ];
    const rows = computeClientSummaries(clients, ['AY 2024-25', 'AY 2025-26']);
    expect(rows).toHaveLength(1);
    expect(rows[0].pan).toBe(PAN_A);
    expect(rows[0].yearBilled['AY 2024-25']).toBe(1000);
    expect(rows[0].yearBilled['AY 2025-26']).toBeNull();
    expect(rows[0].outstanding).toBe(750);
    expect(rows[0].yearsFiled).toBe(1);
  });
});

describe('computeMobileSummaries', () => {
  it('groups clients by phone and sorts No Mobile last', () => {
    const clients = [
      itClient({
        id: 'c1',
        name: 'A',
        pan: PAN_A,
        phone: '9000000001',
        filings: {
          'AY 2024-25': {
            assessmentYear: 'AY 2024-25',
            filingDate: '',
            fees: 100,
            received: 0,
            balance: 100,
            paymentType: '',
            paymentReceiveDate: '',
          },
        },
      }),
      itClient({
        id: 'c2',
        name: 'B',
        pan: PAN_B,
        phone: '',
        filings: {},
      }),
    ];
    const rows = computeMobileSummaries(clients, ['AY 2024-25']);
    expect(rows[0].mobile).toBe('9000000001');
    expect(rows[0].pansLinked).toEqual([PAN_A]);
    expect(rows[rows.length - 1].mobile).toBe('No Mobile');
  });
});

describe('computeGstMonthSummary / computeGstClientSummaries', () => {
  const months = ['Apr 2026', 'May 2026'];
  const companies = [
    gstCompany({
      id: 'g1',
      companyName: 'E2E Co',
      userId: 'user1',
      totalReceived: 50,
      filings: {
        'Apr 2026': {
          month: 'Apr 2026',
          fees: 100,
          interest: 10,
          tax: 5,
          total: 115,
        },
      },
    }),
  ];

  it('sums GST month totals and company uniqueness', () => {
    const summary = computeGstMonthSummary(companies, months);
    expect(summary.rows[0]).toMatchObject({
      month: 'Apr 2026',
      companies: 1,
      fees: 100,
      interest: 10,
      tax: 5,
      totalBilled: 115,
    });
    expect(summary.totalUniqueCompanies).toBe(1);
    // Month-scoped Recd: filing has no payments/received — company pool is not FY Recd
    expect(summary.totalReceived).toBe(0);
    expect(summary.totalOutstanding).toBe(115);
    expect(summary.unallocatedReceived).toBe(0);
  });

  it('builds GST client month totals map', () => {
    const rows = computeGstClientSummaries(companies, months);
    expect(rows[0].monthTotals['Apr 2026']).toBe(115);
    expect(rows[0].monthTotals['May 2026']).toBeNull();
    expect(rows[0].totalFees).toBe(100);
    expect(rows[0].outstanding).toBe(65);
    expect(rows[0].unallocatedReceived).toBe(0);
  });

  it('exposes company unallocatedReceived on GST client summary rows', () => {
    const withUnalloc = [
      gstCompany({
        id: 'g2',
        companyName: 'Unalloc Co',
        userId: 'user2',
        totalReceived: 50_000,
        unallocatedReceived: 50_000,
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
                paymentDate: '2026-04-15',
                paymentMode: 'GPay',
              },
            ],
          },
        },
      }),
    ];
    const rows = computeGstClientSummaries(withUnalloc, months);
    expect(rows[0].unallocatedReceived).toBe(50_000);
    expect(rows[0].totalReceived).toBe(51_000);
    // Company outstanding uses billed − (allocated + unallocated)
    expect(rows[0].outstanding).toBe(0);
  });
});
