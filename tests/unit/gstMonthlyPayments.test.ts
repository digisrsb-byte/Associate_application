import { describe, expect, it } from 'vitest';
import type { GstClientRecord } from '../../src/types/ledger.ts';
import {
  computeGstClientTotals,
  computeGstFilingOutstanding,
  computeGstFilingReceived,
  computeGstFilingTotal,
} from '../../src/utils/ledgerUtils.ts';
import { validateRequiredPhone, validateRequiredText } from '../../src/utils/fieldValidation.ts';

describe('GST monthly payment flow (synthetic)', () => {
  it('requires Phone, Ref No, and Remark', () => {
    expect(validateRequiredPhone('').ok).toBe(false);
    expect(validateRequiredPhone('9876543210').ok).toBe(true);
    expect(validateRequiredText('', 'Ref No', 'referenceNumber').ok).toBe(false);
    expect(validateRequiredText('R-1', 'Ref No', 'referenceNumber').ok).toBe(true);
    expect(validateRequiredText('', 'Remark', 'remark').ok).toBe(false);
    expect(validateRequiredText('ok', 'Remark', 'remark').ok).toBe(true);
  });

  it('Total remains fees + interest + tax', () => {
    expect(computeGstFilingTotal(1000, 200, 800)).toBe(2000);
  });

  it('partial then remaining payment clears month outstanding', () => {
    const filing = {
      month: 'Apr 2026',
      fees: 1000,
      interest: 200,
      tax: 800,
      total: 2000,
      payments: [
        {
          id: 'p1',
          amount: 1200,
          paymentDate: '2026-04-01',
          paymentMode: 'UPI',
          createdAt: '2026-04-01T00:00:00.000Z',
        },
      ],
    };
    expect(computeGstFilingReceived(filing)).toBe(1200);
    expect(computeGstFilingOutstanding(filing)).toBe(800);

    filing.payments.push({
      id: 'p2',
      amount: 800,
      paymentDate: '2026-04-20',
      paymentMode: 'Cash',
      createdAt: '2026-04-20T00:00:00.000Z',
    });
    expect(computeGstFilingOutstanding(filing)).toBe(0);
  });

  it('older-month payment does not reduce newer month outstanding', () => {
    const client = {
      id: 'gst-syn',
      companyName: 'Synthetic Co',
      userId: 'syn.user',
      phone: '9876543210',
      referenceNumber: 'SYN-1',
      remark: 'test',
      totalReceived: 0,
      filings: {
        'Mar 2026': {
          month: 'Mar 2026',
          fees: 2000,
          interest: 0,
          tax: 0,
          total: 2000,
          payments: [
            {
              id: 'old',
              amount: 500,
              paymentDate: '2026-03-15',
              paymentMode: 'GPay',
              createdAt: '2026-03-15T00:00:00.000Z',
            },
          ],
        },
        'Apr 2026': {
          month: 'Apr 2026',
          fees: 3000,
          interest: 0,
          tax: 0,
          total: 3000,
          payments: [],
        },
      },
      createdAt: '',
      updatedAt: '',
    } as GstClientRecord;

    expect(computeGstFilingOutstanding(client.filings['Mar 2026'])).toBe(1500);
    expect(computeGstFilingOutstanding(client.filings['Apr 2026'])).toBe(3000);
    const totals = computeGstClientTotals(client);
    expect(totals.totalReceived).toBe(500);
    expect(totals.outstandingTotal).toBe(4500);
  });
});
