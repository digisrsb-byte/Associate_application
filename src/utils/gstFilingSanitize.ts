import type { GstMonthlyFiling } from '../types/ledger.ts';
import { computeGstFilingReceived, computeGstFilingTotal } from './ledgerUtils.ts';

/**
 * Charge-line sanitizer for GST monthly filings.
 * Total is always fees + interest + tax.
 * Existing month-allocated payments are preserved (never accepted from charge upsert body).
 * Does not invent an empty payments array on legacy filings.
 * Preserves legacy scalar `received` when there is no payments array (8D.11).
 */
export function sanitizeGstFilingCharges(
  month: string,
  input: Partial<GstMonthlyFiling>,
  existing?: GstMonthlyFiling
): GstMonthlyFiling {
  const fees = Math.max(0, Number(input.fees) || 0);
  const interest = Math.max(0, Number(input.interest) || 0);
  const tax = Math.max(0, Number(input.tax) || 0);
  const total = computeGstFilingTotal(fees, interest, tax);
  const base: GstMonthlyFiling = {
    month: month.trim(),
    fees,
    interest,
    tax,
    total,
  };

  if (Array.isArray(existing?.payments)) {
    const payments = [...existing!.payments!];
    return {
      ...base,
      payments,
      received: computeGstFilingReceived({ payments }),
    };
  }

  // Legacy month with scalar received and no payments[] — never silently discard.
  if (
    existing != null &&
    existing.received != null &&
    Number.isFinite(Number(existing.received))
  ) {
    return {
      ...base,
      received: Math.max(0, Number(existing.received) || 0),
    };
  }

  return base;
}
