/** Shared GST usability copy — display only; does not affect calculations. */

export const GST_UNALLOCATED_LABEL = 'Unallocated Received';

export const GST_OUTSTANDING_UNALLOCATED_EXPLAIN =
  'Company Outstanding includes unallocated receipts. Monthly Outstanding only includes payments allocated to that month.';

export function gstUnallocatedReceivedLine(amountLabel: string): string {
  return `${GST_UNALLOCATED_LABEL}: ${amountLabel}`;
}

export function gstFilingDeleteWarning(paymentCount: number): string {
  if (paymentCount > 0) {
    return `This permanently deletes this month's filing and all payment history for this month (${paymentCount} payment${paymentCount === 1 ? '' : 's'}). Unallocated company receipts are not removed.`;
  }
  return "This permanently deletes this month's filing. Unallocated company receipts are not removed.";
}

/** Confirm copy before deleting one payment line (amount + date). */
export function gstPaymentDeleteWarning(
  amountLabel: string,
  paymentDate: string
): string {
  const datePart = paymentDate.trim() ? ` dated ${paymentDate.trim()}` : '';
  return `Remove this payment of ${amountLabel}${datePart}? This cannot be undone.`;
}

/** Label when company/dashboard Total Recd includes unallocated receipts. */
export const GST_TOTAL_RECD_INCLUDES_UNALLOCATED =
  'Includes unallocated company receipts (not assigned to any month).';

/** GST FY dashboard: Received is selected-FY filings only (not unallocated). */
export const GST_FY_RECD_SCOPE_NOTE =
  'Selected financial year — payments on filings in this FY only.';

/** Company unallocated shown separately from FY Received. */
export function gstFyUnallocatedSeparateNote(amountLabel: string): string {
  return `${GST_UNALLOCATED_LABEL} (company) ${amountLabel} — not included in FY Received.`;
}
