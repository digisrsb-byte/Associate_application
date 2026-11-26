import { describe, expect, it } from 'vitest';
import {
  GST_FY_RECD_SCOPE_NOTE,
  GST_OUTSTANDING_UNALLOCATED_EXPLAIN,
  GST_TOTAL_RECD_INCLUDES_UNALLOCATED,
  GST_UNALLOCATED_LABEL,
  gstFilingDeleteWarning,
  gstFyUnallocatedSeparateNote,
  gstPaymentDeleteWarning,
  gstUnallocatedReceivedLine,
} from '../../src/utils/gstCopy.ts';

describe('gstCopy', () => {
  it('labels unallocated received clearly', () => {
    expect(GST_UNALLOCATED_LABEL).toBe('Unallocated Received');
    expect(gstUnallocatedReceivedLine('₹50,000')).toContain('Unallocated Received');
    expect(GST_OUTSTANDING_UNALLOCATED_EXPLAIN).toMatch(/Company Outstanding/i);
    expect(GST_OUTSTANDING_UNALLOCATED_EXPLAIN).toMatch(/Monthly Outstanding/i);
  });

  it('filing delete warning mentions payments when count > 0', () => {
    const withPayments = gstFilingDeleteWarning(2);
    expect(withPayments).toMatch(/permanently deletes/i);
    expect(withPayments).toMatch(/2 payments/);
    expect(withPayments).toMatch(/Unallocated company receipts are not removed/);

    const none = gstFilingDeleteWarning(0);
    expect(none).toMatch(/permanently deletes/i);
    expect(none).not.toMatch(/\d+ payment/);
  });

  it('payment delete warning includes amount and date', () => {
    const msg = gstPaymentDeleteWarning('₹400', '2026-04-15');
    expect(msg).toContain('₹400');
    expect(msg).toContain('2026-04-15');
    expect(msg).toMatch(/cannot be undone/i);
    expect(GST_TOTAL_RECD_INCLUDES_UNALLOCATED).toMatch(/unallocated/i);
  });

  it('FY dashboard copy separates FY Received from company unallocated', () => {
    expect(GST_FY_RECD_SCOPE_NOTE).toMatch(/Selected financial year/i);
    expect(GST_FY_RECD_SCOPE_NOTE).toMatch(/FY only/i);
    const note = gstFyUnallocatedSeparateNote('₹50,000');
    expect(note).toContain(GST_UNALLOCATED_LABEL);
    expect(note).toContain('₹50,000');
    expect(note).toMatch(/not included in FY Received/i);
  });
});
