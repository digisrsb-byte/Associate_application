import { describe, expect, it } from 'vitest';
import { sanitizeGstFilingCharges } from '../../src/utils/gstFilingSanitize.ts';

describe('sanitizeGstFilingCharges (Phase 8D.11)', () => {
  it('preserves legacy scalar received when payments array is absent', () => {
    const next = sanitizeGstFilingCharges(
      'Apr 2026',
      { fees: 4000, interest: 100, tax: 50 },
      {
        month: 'Apr 2026',
        fees: 5000,
        interest: 0,
        tax: 0,
        total: 5000,
        received: 3200,
      }
    );
    expect(next.fees).toBe(4000);
    expect(next.interest).toBe(100);
    expect(next.tax).toBe(50);
    expect(next.total).toBe(4150);
    expect(next.received).toBe(3200);
    expect(next.payments).toBeUndefined();
  });

  it('preserves zero legacy received without inventing payments[]', () => {
    const next = sanitizeGstFilingCharges(
      'May 2026',
      { fees: 100, interest: 0, tax: 0 },
      {
        month: 'May 2026',
        fees: 100,
        interest: 0,
        tax: 0,
        total: 100,
        received: 0,
      }
    );
    expect(next.received).toBe(0);
    expect(next.payments).toBeUndefined();
  });

  it('preserves payment array and derives received from payments', () => {
    const payments = [
      {
        id: 'p1',
        amount: 500,
        paymentDate: '2026-04-10',
        paymentMode: 'GPay',
        createdAt: '2026-04-10T00:00:00.000Z',
      },
      {
        id: 'p2',
        amount: 250,
        paymentDate: '2026-04-20',
        paymentMode: 'Cash',
        createdAt: '2026-04-20T00:00:00.000Z',
      },
    ];
    const next = sanitizeGstFilingCharges(
      'Apr 2026',
      { fees: 900, interest: 0, tax: 0 },
      {
        month: 'Apr 2026',
        fees: 1000,
        interest: 0,
        tax: 0,
        total: 1000,
        payments,
        received: 999,
      }
    );
    expect(next.payments).toHaveLength(2);
    expect(next.payments![0].amount).toBe(500);
    expect(next.received).toBe(750);
    expect(next.total).toBe(900);
  });

  it('empty payments array stays payment-accounting (received 0)', () => {
    const next = sanitizeGstFilingCharges(
      'Apr 2026',
      { fees: 2000, interest: 0, tax: 0 },
      {
        month: 'Apr 2026',
        fees: 2000,
        interest: 0,
        tax: 0,
        total: 2000,
        payments: [],
        received: 0,
      }
    );
    expect(next.payments).toEqual([]);
    expect(next.received).toBe(0);
  });

  it('new filing without existing has no received field', () => {
    const next = sanitizeGstFilingCharges('Jun 2026', {
      fees: 100,
      interest: 0,
      tax: 0,
    });
    expect(next.received).toBeUndefined();
    expect(next.payments).toBeUndefined();
    expect(next.total).toBe(100);
  });
});
