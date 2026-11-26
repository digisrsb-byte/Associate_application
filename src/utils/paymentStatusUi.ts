/**
 * Display-only payment status labels for IT/GST UX.
 * Uses existing fees/received/balance (IT) and total/received/outstanding (GST)
 * amounts — does not change financial formulas.
 */

export type PaymentStatusKind =
  | 'paid'
  | 'partial'
  | 'pending'
  | 'no-billing';

export type PaymentStatusFilter = 'all' | PaymentStatusKind;

export function classifyPaymentStatus(input: {
  billed: number;
  received: number;
  outstanding: number;
}): PaymentStatusKind {
  const billed = Math.max(0, Number(input.billed) || 0);
  const received = Math.max(0, Number(input.received) || 0);
  const outstanding = Math.max(0, Number(input.outstanding) || 0);

  if (billed <= 0) {
    return received > 0 ? 'paid' : 'no-billing';
  }
  if (outstanding <= 0) return 'paid';
  if (received > 0) return 'partial';
  return 'pending';
}

export function paymentStatusLabel(kind: PaymentStatusKind): string {
  switch (kind) {
    case 'paid':
      return 'Paid';
    case 'partial':
      return 'Partially Paid';
    case 'pending':
      return 'Pending';
    case 'no-billing':
      return 'No Billing';
  }
}

/** Tailwind classes using existing design tokens (navy/teal/success/warning). */
export function paymentStatusClassName(kind: PaymentStatusKind): string {
  switch (kind) {
    case 'paid':
      return 'bg-[var(--success-15)] text-[var(--success)] border-[var(--success)]/30';
    case 'partial':
      return 'bg-[var(--warning-15)] text-[var(--warning)] border-[var(--warning)]/35';
    case 'pending':
      return 'bg-[var(--navy-900)] text-white border-[var(--navy-900)]';
    case 'no-billing':
      return 'bg-[var(--frost-100)] text-[var(--muted)] border-[var(--line)]';
  }
}

/** Aggregate IT filing amounts already stored on the record (fees / received / balance). */
export function classifyItFilingsStatus(
  filings: Array<{ fees?: number; received?: number; balance?: number }>
): PaymentStatusKind {
  if (filings.length === 0) return 'no-billing';
  let billed = 0;
  let received = 0;
  let outstanding = 0;
  for (const f of filings) {
    const fees = Math.max(0, Number(f.fees) || 0);
    const recd = Math.max(0, Number(f.received) || 0);
    const bal =
      typeof f.balance === 'number' && Number.isFinite(f.balance)
        ? Math.max(0, f.balance)
        : Math.max(0, fees - recd);
    billed += fees;
    received += recd;
    outstanding += bal;
  }
  return classifyPaymentStatus({ billed, received, outstanding });
}

/** Aggregate GST month amounts using existing total / received / outstanding figures. */
export function classifyGstFilingsStatus(
  filings: Array<{ billed: number; received: number; outstanding: number }>
): PaymentStatusKind {
  if (filings.length === 0) return 'no-billing';
  let billed = 0;
  let received = 0;
  let outstanding = 0;
  for (const f of filings) {
    billed += Math.max(0, Number(f.billed) || 0);
    received += Math.max(0, Number(f.received) || 0);
    outstanding += Math.max(0, Number(f.outstanding) || 0);
  }
  return classifyPaymentStatus({ billed, received, outstanding });
}
