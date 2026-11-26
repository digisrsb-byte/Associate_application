import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  buildBillingHoverTipLines,
  buildGstHoverTipLines,
  DashboardHoverTip,
} from '../../src/components/shared/DashboardHoverTip.tsx';

const XSS_PAYLOAD = '<img src=x onerror=alert(1)>';

describe('dashboard hover tip (M2 — no HTML sink)', () => {
  it('keeps malicious assessment-year labels as plain text in tip lines', () => {
    const lines = buildBillingHoverTipLines({
      assessmentYear: XSS_PAYLOAD,
      received: 100,
      outstanding: 50,
      billed: 150,
      collectionPct: 66.666,
    });
    expect(lines[0]?.text).toContain(XSS_PAYLOAD);
    expect(lines.some((l) => l.text.includes('<b>'))).toBe(false);
  });

  it('keeps malicious month labels as plain text in tip lines', () => {
    const lines = buildGstHoverTipLines({
      month: XSS_PAYLOAD,
      tax: 10,
      fees: 20,
      interest: 5,
      total: 35,
      feesInterestPct: 71.4,
    });
    expect(lines[0]).toEqual({ text: XSS_PAYLOAD, bold: true });
  });

  it('renders XSS month/year as escaped text — no executable <img>', () => {
    const billingHtml = renderToStaticMarkup(
      createElement(DashboardHoverTip, {
        tip: {
          x: 10,
          y: 20,
          lines: buildBillingHoverTipLines({
            assessmentYear: XSS_PAYLOAD,
            received: 1,
            outstanding: 2,
            billed: 3,
            collectionPct: 10,
          }),
        },
      })
    );
    const gstHtml = renderToStaticMarkup(
      createElement(DashboardHoverTip, {
        tip: {
          x: 10,
          y: 20,
          lines: buildGstHoverTipLines({
            month: XSS_PAYLOAD,
            tax: 1,
            fees: 2,
            interest: 3,
            total: 6,
            feesInterestPct: 50,
          }),
        },
      })
    );

    for (const html of [billingHtml, gstHtml]) {
      // React escapes < > so the payload is text, not a real element attribute.
      expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
      expect(html).not.toMatch(/<img\b/i);
      expect(html).not.toMatch(/<img\b[^>]*\bonerror\b/i);
      expect(html).not.toContain('dangerouslySetInnerHTML');
    }
  });

  it('preserves expected tip copy structure for normal labels', () => {
    const billing = buildBillingHoverTipLines({
      assessmentYear: 'AY 2024-25',
      received: 1000,
      outstanding: 0,
      billed: 1000,
      collectionPct: 100,
    });
    expect(billing[0]).toEqual({
      text: 'Assessment year 24-25',
      bold: true,
    });
    expect(billing.map((l) => l.text).join('\n')).toMatch(/Received/);
    expect(billing.map((l) => l.text).join('\n')).toMatch(/Collection 100\.0%/);

    const gst = buildGstHoverTipLines({
      month: 'Apr 2025',
      tax: 100,
      fees: 10,
      interest: 1,
      total: 111,
      feesInterestPct: 9.9,
    });
    expect(gst[0]).toEqual({ text: 'Apr 2025', bold: true });
    expect(gst.some((l) => l.bold && l.text.startsWith('Total'))).toBe(true);
  });
});
