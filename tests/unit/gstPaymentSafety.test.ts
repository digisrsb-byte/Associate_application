import { describe, expect, it } from 'vitest';
import type { GstClientRecord } from '../../src/types/ledger.ts';
import { PAYMENT_TYPES } from '../../src/types/ledger.ts';
import {
  isValidPaymentCalendarDate,
  validatePaymentDate,
  validateRequiredPhone,
  validateRequiredText,
} from '../../src/utils/fieldValidation.ts';
import {
  computeGstClientTotals,
  computeGstFilingOutstanding,
  computeGstFilingReceived,
  gstFilingHasOverReceipt,
} from '../../src/utils/ledgerUtils.ts';

describe('GST payment safety (Phase 8D.3)', () => {
  it('validates calendar payment dates as YYYY-MM-DD', () => {
    expect(isValidPaymentCalendarDate('2026-04-15')).toBe(true);
    expect(isValidPaymentCalendarDate('2026-02-29')).toBe(false);
    expect(isValidPaymentCalendarDate('2024-02-29')).toBe(true);
    expect(isValidPaymentCalendarDate('not-a-date')).toBe(false);
    expect(isValidPaymentCalendarDate('99/99/99')).toBe(false);
    expect(isValidPaymentCalendarDate('2026-13-01')).toBe(false);
    expect(validatePaymentDate('').ok).toBe(false);
    expect(validatePaymentDate('2026-04-01').ok).toBe(true);
  });

  it('PAYMENT_TYPES covers supported modes', () => {
    expect(PAYMENT_TYPES).toContain('GPay');
    expect(PAYMENT_TYPES).toContain('UPI');
    expect(PAYMENT_TYPES).toContain('Cash');
    expect((PAYMENT_TYPES as readonly string[]).includes('Bitcoin')).toBe(false);
  });

  it('over-receipt when Received exceeds Total; Outstanding floors at 0', () => {
    const filing = {
      month: 'Apr 2026',
      fees: 500,
      interest: 0,
      tax: 0,
      total: 500,
      payments: [
        {
          id: 'p1',
          amount: 800,
          paymentDate: '2026-04-01',
          paymentMode: 'Cash',
          createdAt: '2026-04-01T00:00:00.000Z',
        },
      ],
    };
    expect(computeGstFilingReceived(filing)).toBe(800);
    expect(computeGstFilingOutstanding(filing)).toBe(0);
    expect(gstFilingHasOverReceipt(filing)).toBe(true);
  });

  it('legacy ₹50,000 + ₹1,000 April: no double-count; month Received is ₹1,000', () => {
    const client = {
      id: 'gst-legacy',
      companyName: 'Legacy Preserve Co',
      userId: 'legacy.user',
      phone: '9876543210',
      referenceNumber: 'LEG-1',
      remark: 'synthetic',
      totalReceived: 51000,
      unallocatedReceived: 50000,
      filings: {
        'Apr 2026': {
          month: 'Apr 2026',
          fees: 5000,
          interest: 0,
          tax: 0,
          total: 5000,
          payments: [
            {
              id: 'apr-1',
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

    expect(computeGstFilingReceived(client.filings['Apr 2026'])).toBe(1000);
    const totals = computeGstClientTotals(client);
    expect(totals.unallocatedReceived).toBe(50000);
    expect(totals.allocatedReceived).toBe(1000);
    expect(totals.totalReceived).toBe(51000);
    expect(totals.outstandingTotal).toBe(0);

    // After deleting structured payment, legacy remains
    client.filings['Apr 2026'].payments = [];
    client.totalReceived = 50000;
    const afterDelete = computeGstClientTotals(client);
    expect(afterDelete.unallocatedReceived).toBe(50000);
    expect(afterDelete.allocatedReceived).toBe(0);
    expect(afterDelete.totalReceived).toBe(50000);
  });

  it('requires seven create-field validators for phone/ref/remark', () => {
    expect(validateRequiredPhone('').ok).toBe(false);
    expect(validateRequiredText('', 'Ref No', 'referenceNumber').ok).toBe(false);
    expect(validateRequiredText('', 'Remark', 'remark').ok).toBe(false);
  });
});
