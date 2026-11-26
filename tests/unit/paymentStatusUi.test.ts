import { describe, expect, it } from 'vitest';
import {
  classifyGstFilingsStatus,
  classifyItFilingsStatus,
  classifyPaymentStatus,
  paymentStatusLabel,
} from '../../src/utils/paymentStatusUi.ts';

describe('paymentStatusUi', () => {
  it('classifies paid / partial / pending / no-billing from existing amounts', () => {
    expect(
      classifyPaymentStatus({ billed: 0, received: 0, outstanding: 0 })
    ).toBe('no-billing');
    expect(
      classifyPaymentStatus({ billed: 1000, received: 1000, outstanding: 0 })
    ).toBe('paid');
    expect(
      classifyPaymentStatus({ billed: 1000, received: 400, outstanding: 600 })
    ).toBe('partial');
    expect(
      classifyPaymentStatus({ billed: 1000, received: 0, outstanding: 1000 })
    ).toBe('pending');
  });

  it('labels match owner-facing copy', () => {
    expect(paymentStatusLabel('paid')).toBe('Paid');
    expect(paymentStatusLabel('partial')).toBe('Partially Paid');
    expect(paymentStatusLabel('pending')).toBe('Pending');
    expect(paymentStatusLabel('no-billing')).toBe('No Billing');
  });

  it('aggregates IT filings without changing fee/received math', () => {
    expect(classifyItFilingsStatus([])).toBe('no-billing');
    expect(
      classifyItFilingsStatus([
        { fees: 5000, received: 2000, balance: 3000 },
        { fees: 1000, received: 1000, balance: 0 },
      ])
    ).toBe('partial');
  });

  it('aggregates GST filings from billed/received/outstanding', () => {
    expect(
      classifyGstFilingsStatus([
        { billed: 2000, received: 2000, outstanding: 0 },
      ])
    ).toBe('paid');
    expect(
      classifyGstFilingsStatus([
        { billed: 2000, received: 0, outstanding: 2000 },
      ])
    ).toBe('pending');
  });
});
