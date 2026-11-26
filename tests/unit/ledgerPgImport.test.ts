import { describe, expect, it } from 'vitest';
import {
  assertGstCompanyTotalReceivedReconciles,
  buildImportRows,
  diffGstFilingReceivedModeRows,
  diffGstPaymentRows,
  gstFilingReceivedModeFingerprint,
  gstPaymentFingerprint,
  summarizeLedger,
} from '../../scripts/ledger-pg-shared.mjs';
import { sanitizeGstFilingCharges } from '../../src/utils/gstFilingSanitize.ts';

/** Deterministic 32-byte key for portal encrypt paths (unused when no plaintext passwords). */
const KEY = Buffer.alloc(32, 9);

function baseLedger(overrides: Record<string, unknown> = {}) {
  return {
    assessmentYears: ['AY 2024-25'],
    gstMonths: ['Apr 2024'],
    clients: [
      {
        id: 'it-1',
        name: 'IT Client',
        pan: 'ABCDE1234F',
        phone: '',
        referenceNumber: '',
        filings: {
          'AY 2024-25': {
            assessmentYear: 'AY 2024-25',
            filingDate: '2024-07-01',
            fees: 1000,
            received: 400,
            balance: 600,
            paymentType: 'UPI',
            paymentReceiveDate: '2024-07-15',
          },
        },
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
      },
    ],
    gstClients: [
      {
        id: 'gst-1',
        companyName: 'GST Co',
        userId: 'portal-1',
        phone: '',
        referenceNumber: '',
        totalReceived: 0,
        filings: {
          'Apr 2024': {
            month: 'Apr 2024',
            fees: 100,
            interest: 10,
            tax: 5,
            total: 115,
          },
        },
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

describe('ledger-pg-shared GST payment import mapping', () => {
  it('imports multiple partial payment lines with mode and reference', () => {
    const state = baseLedger({
      gstClients: [
        {
          id: 'gst-1',
          companyName: 'GST Co',
          userId: 'portal-1',
          phone: '',
          referenceNumber: '',
          totalReceived: 75,
          filings: {
            'Apr 2024': {
              month: 'Apr 2024',
              fees: 100,
              interest: 10,
              tax: 5,
              total: 115,
              received: 75,
              payments: [
                {
                  id: 'pay-1',
                  amount: 50,
                  paymentDate: '2024-04-10',
                  paymentMode: 'UPI',
                  reference: 'UTR-1',
                  idempotencyKey: 'idem-1',
                  createdAt: '2024-04-10T10:00:00.000Z',
                },
                {
                  id: 'pay-2',
                  amount: 25,
                  paymentDate: '2024-04-20',
                  paymentMode: 'Cash',
                  reference: 'RCPT-2',
                  idempotencyKey: 'idem-2',
                  createdAt: '2024-04-20T11:00:00.000Z',
                  updatedAt: '2024-04-20T12:00:00.000Z',
                },
              ],
            },
          },
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z',
        },
      ],
    });

    const summary = summarizeLedger(state);
    expect(summary.counts.gstPayments).toBe(2);
    expect(summary.finance.gstPaymentAmountSum).toBe(75);
    expect(summary.perCompany['gst-1'].paymentCount).toBe(2);

    const rows = buildImportRows(state, KEY, 'Test Org');
    expect(rows.gstPayments).toHaveLength(2);
    expect(rows.gstPayments[0]).toMatchObject({
      id: 'pay-1',
      gst_company_id: 'gst-1',
      month: 'Apr 2024',
      amount: 50,
      payment_mode: 'UPI',
      reference: 'UTR-1',
      idempotency_key: 'idem-1',
    });
    expect(rows.gstPayments[1].amount).toBe(25);
    expect(rows.gstCompanies[0].unallocated_received).toBe(0);
    // IT received stays on filing rows — not converted to gst_payments.
    expect(rows.itFilings[0].received).toBe(400);
    expect(rows.gstPayments.every((p) => p.gst_company_id !== 'it-1')).toBe(true);
  });

  it('imports unallocatedReceived onto gst_companies', () => {
    const state = baseLedger({
      gstClients: [
        {
          id: 'gst-1',
          companyName: 'GST Co',
          userId: 'portal-1',
          phone: '',
          referenceNumber: '',
          totalReceived: 40,
          unallocatedReceived: 40,
          filings: {
            'Apr 2024': {
              month: 'Apr 2024',
              fees: 100,
              interest: 0,
              tax: 0,
              total: 100,
            },
          },
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z',
        },
      ],
    });

    const summary = summarizeLedger(state);
    expect(summary.finance.gstUnallocated).toBe(40);
    expect(summary.counts.gstPayments).toBe(0);

    const rows = buildImportRows(state, KEY, 'Test Org');
    expect(rows.gstCompanies[0].unallocated_received).toBe(40);
    expect(rows.gstPayments).toHaveLength(0);
  });

  it('allows legacy filings without payments arrays', () => {
    const state = baseLedger();
    const summary = summarizeLedger(state);
    expect(summary.counts.gstPayments).toBe(0);
    expect(summary.counts.gstPaymentsPresentTrue).toBe(0);

    const rows = buildImportRows(state, KEY, 'Test Org');
    expect(rows.gstFilings).toHaveLength(1);
    expect(rows.gstFilings[0].payments_present).toBe(false);
    expect(rows.gstFilings[0].legacy_received).toBeNull();
    expect(rows.gstPayments).toHaveLength(0);
  });

  it('allows empty payment arrays without inventing rows (payments_present true)', () => {
    const state = baseLedger({
      gstClients: [
        {
          id: 'gst-1',
          companyName: 'GST Co',
          userId: 'portal-1',
          phone: '',
          referenceNumber: '',
          totalReceived: 0,
          filings: {
            'Apr 2024': {
              month: 'Apr 2024',
              fees: 100,
              interest: 0,
              tax: 0,
              total: 100,
              payments: [],
              received: 0,
            },
          },
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z',
        },
      ],
    });

    const rows = buildImportRows(state, KEY, 'Test Org');
    expect(rows.gstPayments).toHaveLength(0);
    expect(rows.gstFilings[0].payments_present).toBe(true);
    expect(rows.gstFilings[0].legacy_received).toBeNull();
    expect(summarizeLedger(state).counts.gstPayments).toBe(0);
    expect(summarizeLedger(state).counts.gstPaymentsPresentTrue).toBe(1);
  });

  it('persists explicit zero vs missing legacy_received', () => {
    const state = baseLedger({
      gstMonths: ['Apr 2024', 'May 2024'],
      gstClients: [
        {
          id: 'gst-1',
          companyName: 'GST Co',
          userId: 'portal-1',
          phone: '',
          referenceNumber: '',
          totalReceived: 0,
          filings: {
            'Apr 2024': {
              month: 'Apr 2024',
              fees: 100,
              interest: 0,
              tax: 0,
              total: 100,
              received: 0,
            },
            'May 2024': {
              month: 'May 2024',
              fees: 50,
              interest: 0,
              tax: 0,
              total: 50,
            },
          },
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z',
        },
      ],
    });
    const rows = buildImportRows(state, KEY, 'Test Org');
    const apr = rows.gstFilings.find((f) => f.month === 'Apr 2024')!;
    const may = rows.gstFilings.find((f) => f.month === 'May 2024')!;
    expect(apr.payments_present).toBe(false);
    expect(apr.legacy_received).toBe(0);
    expect(may.payments_present).toBe(false);
    expect(may.legacy_received).toBeNull();

    const summary = summarizeLedger(state);
    expect(summary.counts.gstLegacyReceivedPresent).toBe(1);
    expect(summary.finance.gstLegacyReceivedSum).toBe(0);
  });

  it('detects missing or altered legacy_received and payments_present', () => {
    const expected = [
      {
        gst_company_id: 'gst-1',
        month: 'Apr 2024',
        payments_present: false,
        legacy_received: 40,
      },
      {
        gst_company_id: 'gst-2',
        month: 'May 2024',
        payments_present: true,
        legacy_received: null,
      },
    ];
    expect(
      diffGstFilingReceivedModeRows(expected, [
        { ...expected[0], legacy_received: 41 },
        expected[1],
      ]).some((f) => f.includes('altered') && f.includes('gst-1'))
    ).toBe(true);
    expect(
      diffGstFilingReceivedModeRows(expected, [expected[0]]).some((f) =>
        f.includes('missing')
      )
    ).toBe(true);
    expect(
      diffGstFilingReceivedModeRows(expected, [
        expected[0],
        { ...expected[1], payments_present: false },
      ]).some((f) => f.includes('altered') && f.includes('gst-2'))
    ).toBe(true);

    const fpA = gstFilingReceivedModeFingerprint(expected[0]);
    const fpB = gstFilingReceivedModeFingerprint({
      ...expected[0],
      legacy_received: 41,
    });
    expect(fpA).not.toBe(fpB);
  });

  it('IT import mapping remains unchanged (fees/received/balance on it_filings)', () => {
    const state = baseLedger();
    const rows = buildImportRows(state, KEY, 'Test Org');
    expect(rows.itFilings).toHaveLength(1);
    expect(rows.itFilings[0]).toMatchObject({
      it_client_id: 'it-1',
      assessment_year: 'AY 2024-25',
      fees: 1000,
      received: 400,
      balance: 600,
      payment_type: 'UPI',
    });
    expect(rows.itFilings[0]).not.toHaveProperty('payments_present');
    expect(rows.itFilings[0]).not.toHaveProperty('legacy_received');
  });

  it('sanitizer parity: legacy / empty / payment-line shapes match import markers', () => {
    const legacy = sanitizeGstFilingCharges(
      'Apr 2024',
      { fees: 100, interest: 0, tax: 0 },
      {
        month: 'Apr 2024',
        fees: 100,
        interest: 0,
        tax: 0,
        total: 100,
        received: 25,
      }
    );
    const emptyPay = sanitizeGstFilingCharges(
      'May 2024',
      { fees: 80, interest: 0, tax: 0 },
      {
        month: 'May 2024',
        fees: 80,
        interest: 0,
        tax: 0,
        total: 80,
        payments: [],
        received: 0,
      }
    );
    const withPay = sanitizeGstFilingCharges(
      'Jun 2024',
      { fees: 200, interest: 0, tax: 0 },
      {
        month: 'Jun 2024',
        fees: 200,
        interest: 0,
        tax: 0,
        total: 200,
        payments: [
          {
            id: 'pay-s',
            amount: 60,
            paymentDate: '2024-06-01',
            paymentMode: 'UPI',
            createdAt: '2024-06-01T00:00:00.000Z',
          },
        ],
        received: 999,
      }
    );

    const state = baseLedger({
      gstMonths: ['Apr 2024', 'May 2024', 'Jun 2024'],
      gstClients: [
        {
          id: 'gst-1',
          companyName: 'GST Co',
          userId: 'portal-1',
          phone: '',
          referenceNumber: '',
          totalReceived: 60,
          unallocatedReceived: 0,
          filings: {
            'Apr 2024': legacy,
            'May 2024': emptyPay,
            'Jun 2024': withPay,
          },
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z',
        },
      ],
    });
    // May is payment-mode with [] — company uses payment accounting; Apr legacy
    // on same company still maps per-filing. totalReceived must reconcile to
    // allocated (60) + unallocated (0); empty May contributes 0.
    const rows = buildImportRows(state, KEY, 'Test Org');
    const byMonth = Object.fromEntries(
      rows.gstFilings.map((f) => [f.month, f])
    );
    expect(byMonth['Apr 2024'].payments_present).toBe(false);
    expect(byMonth['Apr 2024'].legacy_received).toBe(25);
    expect(byMonth['May 2024'].payments_present).toBe(true);
    expect(byMonth['May 2024'].legacy_received).toBeNull();
    expect(byMonth['Jun 2024'].payments_present).toBe(true);
    expect(byMonth['Jun 2024'].legacy_received).toBeNull();
    expect(rows.gstPayments).toHaveLength(1);
  });

  it('fails closed on duplicate payment ids', () => {
    const state = baseLedger({
      gstClients: [
        {
          id: 'gst-1',
          companyName: 'GST Co',
          userId: 'portal-1',
          phone: '',
          referenceNumber: '',
          totalReceived: 20,
          filings: {
            'Apr 2024': {
              month: 'Apr 2024',
              fees: 100,
              interest: 0,
              tax: 0,
              total: 100,
              payments: [
                {
                  id: 'dup',
                  amount: 10,
                  paymentDate: '2024-04-01',
                  paymentMode: 'UPI',
                  createdAt: '2024-04-01T00:00:00.000Z',
                },
                {
                  id: 'dup',
                  amount: 10,
                  paymentDate: '2024-04-02',
                  paymentMode: 'Cash',
                  createdAt: '2024-04-02T00:00:00.000Z',
                },
              ],
            },
          },
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z',
        },
      ],
    });

    expect(() => summarizeLedger(state)).toThrow(/Duplicate GST payment ids/);
    expect(() => buildImportRows(state, KEY, 'Test Org')).toThrow(
      /Duplicate GST payment id/
    );
  });

  it('fails closed on duplicate idempotency keys within a company', () => {
    const state = baseLedger({
      gstClients: [
        {
          id: 'gst-1',
          companyName: 'GST Co',
          userId: 'portal-1',
          phone: '',
          referenceNumber: '',
          totalReceived: 20,
          filings: {
            'Apr 2024': {
              month: 'Apr 2024',
              fees: 100,
              interest: 0,
              tax: 0,
              total: 100,
              payments: [
                {
                  id: 'pay-a',
                  amount: 10,
                  paymentDate: '2024-04-01',
                  paymentMode: 'UPI',
                  idempotencyKey: 'same-key',
                  createdAt: '2024-04-01T00:00:00.000Z',
                },
                {
                  id: 'pay-b',
                  amount: 10,
                  paymentDate: '2024-04-02',
                  paymentMode: 'Cash',
                  idempotencyKey: 'same-key',
                  createdAt: '2024-04-02T00:00:00.000Z',
                },
              ],
            },
          },
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z',
        },
      ],
    });

    expect(() => buildImportRows(state, KEY, 'Test Org')).toThrow(
      /Duplicate GST payment idempotency key/
    );
  });

  it('keeps IT import shape unchanged (scalar received on filings)', () => {
    const state = baseLedger();
    const rows = buildImportRows(state, KEY, 'Test Org');
    expect(rows.itClients).toHaveLength(1);
    expect(rows.itFilings).toHaveLength(1);
    expect(rows.itFilings[0]).toMatchObject({
      it_client_id: 'it-1',
      fees: 1000,
      received: 400,
      balance: 600,
      payment_type: 'UPI',
    });
    expect(rows.gstPayments).toHaveLength(0);
  });

  it('diffGstPaymentRows detects missing and altered payment lines', () => {
    const expected = [
      {
        id: 'pay-1',
        gst_company_id: 'gst-1',
        month: 'Apr 2024',
        amount: 50,
        payment_date: '2024-04-10',
        payment_mode: 'UPI',
        reference: 'UTR-1',
        idempotency_key: 'idem-1',
      },
      {
        id: 'pay-2',
        gst_company_id: 'gst-1',
        month: 'Apr 2024',
        amount: 25,
        payment_date: '2024-04-20',
        payment_mode: 'Cash',
        reference: null,
        idempotency_key: null,
      },
    ];

    expect(diffGstPaymentRows(expected, expected)).toEqual([]);

    const missing = diffGstPaymentRows(expected, [expected[0]]);
    expect(missing.some((f) => f.includes('missing id=pay-2'))).toBe(true);
    expect(missing.some((f) => f.includes('count'))).toBe(true);

    const altered = diffGstPaymentRows(expected, [
      expected[0],
      { ...expected[1], amount: 99 },
    ]);
    expect(altered.some((f) => f.includes('altered id=pay-2'))).toBe(true);

    const extra = diffGstPaymentRows([expected[0]], expected);
    expect(extra.some((f) => f.includes('unexpected id=pay-2'))).toBe(true);
  });

  it('rejects GST total that does not equal fees+interest+tax', () => {
    const state = baseLedger({
      gstClients: [
        {
          id: 'gst-1',
          companyName: 'GST Co',
          userId: 'portal-1',
          phone: '',
          referenceNumber: '',
          totalReceived: 0,
          filings: {
            'Apr 2024': {
              month: 'Apr 2024',
              fees: 100,
              interest: 0,
              tax: 0,
              total: 999,
            },
          },
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z',
        },
      ],
    });
    expect(() => summarizeLedger(state)).toThrow(/fees\+interest\+tax/);
  });

  it('rejects payment-accounting totalReceived that ignores allocated+unallocated', () => {
    const state = baseLedger({
      gstClients: [
        {
          id: 'gst-1',
          companyName: 'GST Co',
          userId: 'portal-1',
          phone: '',
          referenceNumber: '',
          totalReceived: 999,
          unallocatedReceived: 10,
          filings: {
            'Apr 2024': {
              month: 'Apr 2024',
              fees: 100,
              interest: 0,
              tax: 0,
              total: 100,
              payments: [
                {
                  id: 'pay-1',
                  amount: 40,
                  paymentDate: '2024-04-01',
                  paymentMode: 'UPI',
                  createdAt: '2024-04-01T00:00:00.000Z',
                },
              ],
            },
          },
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z',
        },
      ],
    });
    expect(() => summarizeLedger(state)).toThrow(/totalReceived/);
    expect(() => buildImportRows(state, KEY, 'Test Org')).toThrow(/totalReceived/);
  });

  it('accepts payment-accounting when totalReceived equals allocated+unallocated', () => {
    expect(() =>
      assertGstCompanyTotalReceivedReconciles('gst-1', 50, 40, 10, true)
    ).not.toThrow();
    expect(() =>
      assertGstCompanyTotalReceivedReconciles('gst-1', 999, 40, 10, true)
    ).toThrow(/totalReceived/);
    // Legacy: no payment accounting — do not force the formula.
    expect(() =>
      assertGstCompanyTotalReceivedReconciles('gst-1', 999, 0, 0, false)
    ).not.toThrow();
  });

  it('legacy pool accounting leaves totalReceived unconstrained by payment sums', () => {
    const state = baseLedger({
      gstClients: [
        {
          id: 'gst-1',
          companyName: 'GST Co',
          userId: 'portal-1',
          phone: '',
          referenceNumber: '',
          totalReceived: 250,
          filings: {
            'Apr 2024': {
              month: 'Apr 2024',
              fees: 100,
              interest: 10,
              tax: 5,
              total: 115,
              received: 80,
              // no payments property — legacy pool
            },
          },
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z',
        },
      ],
    });
    const summary = summarizeLedger(state);
    expect(summary.perCompany['gst-1'].usesPaymentAccounting).toBe(false);
    expect(summary.finance.gstRecv).toBe(250);
    expect(summary.finance.gstLegacyReceivedSum).toBe(80);
    const rows = buildImportRows(state, KEY, 'Test Org');
    expect(rows.gstPayments).toHaveLength(0);
    expect(rows.gstFilings[0].payments_present).toBe(false);
    expect(rows.gstFilings[0].legacy_received).toBe(80);
  });

  it('payment-mode company totalReceived ignores legacy filing received', () => {
    const state = baseLedger({
      gstClients: [
        {
          id: 'gst-1',
          companyName: 'GST Co',
          userId: 'portal-1',
          phone: '',
          referenceNumber: '',
          totalReceived: 70,
          unallocatedReceived: 20,
          filings: {
            'Apr 2024': {
              month: 'Apr 2024',
              fees: 100,
              interest: 0,
              tax: 0,
              total: 100,
              payments: [
                {
                  id: 'pay-1',
                  amount: 50,
                  paymentDate: '2024-04-01',
                  paymentMode: 'UPI',
                  createdAt: '2024-04-01T00:00:00.000Z',
                },
              ],
              received: 50,
            },
          },
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z',
        },
      ],
    });
    const summary = summarizeLedger(state);
    expect(summary.perCompany['gst-1'].usesPaymentAccounting).toBe(true);
    expect(summary.finance.gstLegacyReceivedSum).toBe(0);
    const rows = buildImportRows(state, KEY, 'Test Org');
    expect(rows.gstCompanies[0].total_received).toBe(70);
    expect(rows.gstFilings[0].legacy_received).toBeNull();
    expect(rows.gstFilings[0].payments_present).toBe(true);
  });

  it('detects payment fingerprint changes when timestamps change', () => {
    const base = {
      id: 'pay-1',
      gst_company_id: 'gst-1',
      month: 'Apr 2024',
      amount: 50,
      payment_date: '2024-04-10',
      payment_mode: 'UPI',
      reference: 'UTR-1',
      idempotency_key: 'idem-1',
      created_at: '2024-04-10T10:00:00.000Z',
      updated_at: null,
    };
    const same = gstPaymentFingerprint(base);
    const createdChanged = gstPaymentFingerprint({
      ...base,
      created_at: '2024-04-10T11:00:00.000Z',
    });
    const updatedChanged = gstPaymentFingerprint({
      ...base,
      updated_at: '2024-04-11T00:00:00.000Z',
    });
    expect(createdChanged).not.toBe(same);
    expect(updatedChanged).not.toBe(same);

    const failures = diffGstPaymentRows(
      [base],
      [{ ...base, created_at: '2024-04-10T11:00:00.000Z' }]
    );
    expect(failures.some((f) => f.includes('altered id=pay-1'))).toBe(true);
  });
});
