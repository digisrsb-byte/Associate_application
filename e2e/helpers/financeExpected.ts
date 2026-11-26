/**
 * Independent expected-value helpers for Stage 3.
 * Reimplemented from observed business rules in server.ts / UI — NOT imported from app utils.
 *
 * IT filing:  balance = max(0, fees - received) after non-negative clamp
 * GST month:  total = fees + interest + tax (each clamped ≥ 0)
 * GST company outstanding = max(0, sum(month totals) - totalReceived)
 */

function clampNonNeg(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n);
}

/** Same rule as sanitize / UI: Number(x) || 0 then clamp (NaN/empty → 0). */
export function coerceMoneyInput(raw: unknown): number {
  const n = Number(raw);
  return clampNonNeg(Number.isFinite(n) ? n : 0);
}

export function expectItBalance(fees: number, received: number): number {
  return Math.max(0, coerceMoneyInput(fees) - coerceMoneyInput(received));
}

export function expectGstMonthTotal(
  fees: number,
  interest: number,
  tax: number
): number {
  return coerceMoneyInput(fees) + coerceMoneyInput(interest) + coerceMoneyInput(tax);
}

export function expectGstOutstanding(
  monthTotals: number[],
  totalReceived: number
): number {
  const billed = monthTotals.reduce((s, t) => s + coerceMoneyInput(t), 0);
  return Math.max(0, billed - coerceMoneyInput(totalReceived));
}

/** Display format used by formatPlainNumber (en-IN, 0 fraction digits). */
export function expectDisplayAmount(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(safe);
}
