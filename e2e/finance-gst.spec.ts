import { test, expect } from '@playwright/test';
import { loginAsE2eAdmin } from './helpers/auth';
import { createGstCompanyViaUi, goGstAllData } from './helpers/clients';
import {
  createGstCompanyWithFilingViaUi,
  deleteGstPaymentViaApi,
  findGstCompanyInLedger,
  openGstFilingEditor,
  recordGstPaymentViaApi,
  saveGstFilingViaApi,
  seedGstLegacyTotalReceivedViaApi,
  selectGstAllMonths,
  updateGstPaymentViaApi,
} from './helpers/finance';import {
  coerceMoneyInput,
  expectDisplayAmount,
  expectGstMonthTotal,
} from './helpers/financeExpected';
import { nextSeq, syntheticName } from './helpers/ids';

const MONTH = 'Apr 2026';
const MONTH2 = 'May 2026';

function monthReceived(filing?: {
  payments?: Array<{ amount: number }>;
  received?: number;
}): number {
  if (!filing) return 0;
  if (Array.isArray(filing.payments)) {
    return filing.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  }
  return Math.max(0, Number(filing.received) || 0);
}

function monthOutstanding(filing?: {
  total?: number;
  payments?: Array<{ amount: number }>;
  received?: number;
}): number {
  if (!filing) return 0;
  return Math.max(0, (Number(filing.total) || 0) - monthReceived(filing));
}

test.describe('Stage 3 — GST financial calculations', () => {
  test('B/C/D/E — fees, interest, tax → total payable (no registration field)', async ({
    page,
  }) => {
    const n = nextSeq();
    const userId = `e2e.fin.gst.${n}@example.test`;
    const companyName = syntheticName('FinGST', n);
    const fees = 2000;
    const interest = 150;
    const tax = 360;
    const expectedTotal = expectGstMonthTotal(fees, interest, tax);

    await loginAsE2eAdmin(page);
    await createGstCompanyWithFilingViaUi(page, {
      companyName,
      userId,
      fees,
      interest,
      tax,
      month: MONTH,
    });

    const company = await findGstCompanyInLedger(page.request, userId);
    const months = Object.keys(company.filings);
    expect(months.length).toBeGreaterThan(0);
    const m = months[0];
    const f = company.filings[m];
    expect(f.fees).toBe(fees);
    expect(f.interest).toBe(interest);
    expect(f.tax).toBe(tax);
    expect(f.total).toBe(expectedTotal);

    // Registration charges: not present on GstMonthlyFiling — assert schema absence
    expect((f as { registration?: number }).registration).toBeUndefined();
  });

  test('F/G/H/I/J — per-month payments, outstanding, edit/delete', async ({
    page,
  }) => {
    const n = nextSeq();
    const userId = `e2e.fin.pay.${n}@example.test`;
    const companyName = syntheticName('GstPay', n);

    await loginAsE2eAdmin(page);
    await createGstCompanyViaUi(page, { companyName, userId });
    let company = await findGstCompanyInLedger(page.request, userId);

    const t1 = expectGstMonthTotal(5000, 200, 900);
    const t2 = expectGstMonthTotal(3000, 0, 540);
    await saveGstFilingViaApi(page.request, company.id, {
      month: MONTH,
      fees: 5000,
      interest: 200,
      tax: 900,
      total: t1,
    });
    await saveGstFilingViaApi(page.request, company.id, {
      month: MONTH2,
      fees: 3000,
      interest: 0,
      tax: 540,
      total: t2,
    });

    // Partial payment for MONTH only
    await recordGstPaymentViaApi(page.request, company.id, MONTH, {
      amount: 4000,
    });
    company = await findGstCompanyInLedger(page.request, userId);
    expect(monthReceived(company.filings[MONTH])).toBe(4000);
    expect(monthOutstanding(company.filings[MONTH])).toBe(t1 - 4000);
    expect(monthReceived(company.filings[MONTH2])).toBe(0);
    expect(monthOutstanding(company.filings[MONTH2])).toBe(t2);
    expect(company.totalReceived).toBe(4000);
    expect(
      monthOutstanding(company.filings[MONTH]) +
        monthOutstanding(company.filings[MONTH2])
    ).toBe(t1 - 4000 + t2);

    // Remaining for MONTH
    await recordGstPaymentViaApi(page.request, company.id, MONTH, {
      amount: t1 - 4000,
    });
    company = await findGstCompanyInLedger(page.request, userId);
    expect(monthOutstanding(company.filings[MONTH])).toBe(0);

    // Payment for older month while newer exists
    await recordGstPaymentViaApi(page.request, company.id, MONTH2, {
      amount: 1000,
    });
    company = await findGstCompanyInLedger(page.request, userId);
    expect(monthReceived(company.filings[MONTH2])).toBe(1000);
    expect(monthOutstanding(company.filings[MONTH])).toBe(0);
    expect(company.totalReceived).toBe(t1 + 1000);

    // Edit a payment on MONTH2
    const pay = company.filings[MONTH2].payments![0];
    await updateGstPaymentViaApi(page.request, company.id, MONTH2, pay.id, {
      amount: 800,
      paymentDate: pay.paymentDate,
      paymentMode: pay.paymentMode,
    });
    company = await findGstCompanyInLedger(page.request, userId);
    expect(monthReceived(company.filings[MONTH2])).toBe(800);
    expect(company.totalReceived).toBe(t1 + 800);

    // Delete that payment
    await deleteGstPaymentViaApi(page.request, company.id, MONTH2, pay.id);
    company = await findGstCompanyInLedger(page.request, userId);
    expect(monthReceived(company.filings[MONTH2])).toBe(0);
    expect(monthOutstanding(company.filings[MONTH2])).toBe(t2);

    // Edit month amounts → total recomputed on server
    await saveGstFilingViaApi(page.request, company.id, {
      month: MONTH,
      fees: 1000,
      interest: 50,
      tax: 100,
      total: 999999,
    });
    company = await findGstCompanyInLedger(page.request, userId);
    expect(company.filings[MONTH].total).toBe(expectGstMonthTotal(1000, 50, 100));
    // Payments on MONTH preserved
    expect(monthReceived(company.filings[MONTH])).toBe(t1);

    await page.reload();
    await goGstAllData(page);
    await expect(page.getByText(companyName).first()).toBeVisible();
    await expect(
      page.getByText(`₹${expectDisplayAmount(company.totalReceived)}`).first()
    ).toBeVisible();
  });

  test('L/M/N/O — zero, negative clamp, decimals, large GST amounts', async ({ page }) => {
    const n = nextSeq();
    const userId = `e2e.fin.edge.${n}@example.test`;
    await loginAsE2eAdmin(page);
    await createGstCompanyViaUi(page, {
      companyName: syntheticName('GstEdge', n),
      userId,
    });
    const company = await findGstCompanyInLedger(page.request, userId);

    await saveGstFilingViaApi(page.request, company.id, {
      month: MONTH,
      fees: 0,
      interest: 0,
      tax: 0,
      total: 0,
    });
    let c = await findGstCompanyInLedger(page.request, userId);
    expect(c.filings[MONTH].total).toBe(0);

    const neg = await page.request.post(`/api/gst/clients/${company.id}/filings`, {
      data: { month: MONTH2, fees: -10, interest: -5, tax: -1, total: -100 },
    });
    expect(neg.ok()).toBeTruthy();
    c = await findGstCompanyInLedger(page.request, userId);
    expect(c.filings[MONTH2].fees).toBe(coerceMoneyInput(-10));
    expect(c.filings[MONTH2].interest).toBe(0);
    expect(c.filings[MONTH2].tax).toBe(0);
    expect(c.filings[MONTH2].total).toBe(0);

    const fees = 12.75;
    const interest = 1.25;
    const tax = 2.1;
    await saveGstFilingViaApi(page.request, company.id, {
      month: 'Jun 2026',
      fees,
      interest,
      tax,
      total: expectGstMonthTotal(fees, interest, tax),
    });
    c = await findGstCompanyInLedger(page.request, userId);
    expect(c.filings['Jun 2026'].total).toBeCloseTo(
      expectGstMonthTotal(fees, interest, tax),
      10
    );

    const large = 50_000_000;
    await saveGstFilingViaApi(page.request, company.id, {
      month: 'Jul 2026',
      fees: large,
      interest: 0,
      tax: 0,
      total: large,
    });
    c = await findGstCompanyInLedger(page.request, userId);
    expect(c.filings['Jul 2026'].total).toBe(large);
  });
});

test.describe('Phase 8D.3 — GST payment safety', () => {
  test('legacy ₹50,000 preserved after April ₹1,000 payment, edit, delete', async ({
    page,
  }) => {
    const n = nextSeq();
    const userId = `e2e.gst.legacy.${n}@example.test`;
    const companyName = syntheticName('GstLegacy', n);

    await loginAsE2eAdmin(page);
    await createGstCompanyViaUi(page, { companyName, userId });
    let company = await findGstCompanyInLedger(page.request, userId);

    await saveGstFilingViaApi(page.request, company.id, {
      month: MONTH,
      fees: 5000,
      interest: 0,
      tax: 0,
      total: 5000,
    });
    company = await findGstCompanyInLedger(page.request, userId);
    await seedGstLegacyTotalReceivedViaApi(page.request, company, 50_000);
    company = await findGstCompanyInLedger(page.request, userId);
    expect(company.totalReceived).toBe(50_000);

    await recordGstPaymentViaApi(page.request, company.id, MONTH, {
      amount: 1000,
      idempotencyKey: `legacy-first-${n}`,
    });
    company = await findGstCompanyInLedger(page.request, userId);
    expect(company.unallocatedReceived).toBe(50_000);
    expect(monthReceived(company.filings[MONTH])).toBe(1000);
    expect(company.totalReceived).toBe(51_000);

    const pay = company.filings[MONTH].payments![0];
    await updateGstPaymentViaApi(page.request, company.id, MONTH, pay.id, {
      amount: 800,
      paymentDate: pay.paymentDate,
      paymentMode: pay.paymentMode,
    });
    company = await findGstCompanyInLedger(page.request, userId);
    expect(company.unallocatedReceived).toBe(50_000);
    expect(monthReceived(company.filings[MONTH])).toBe(800);
    expect(company.totalReceived).toBe(50_800);

    await deleteGstPaymentViaApi(page.request, company.id, MONTH, pay.id);
    company = await findGstCompanyInLedger(page.request, userId);
    expect(company.unallocatedReceived).toBe(50_000);
    expect(monthReceived(company.filings[MONTH])).toBe(0);
    expect(company.totalReceived).toBe(50_000);
  });

  test('idempotent retry vs two genuine identical payments', async ({ page }) => {
    const n = nextSeq();
    const userId = `e2e.gst.idem.${n}@example.test`;
    await loginAsE2eAdmin(page);
    await createGstCompanyViaUi(page, {
      companyName: syntheticName('GstIdem', n),
      userId,
    });
    let company = await findGstCompanyInLedger(page.request, userId);
    await saveGstFilingViaApi(page.request, company.id, {
      month: MONTH,
      fees: 5000,
      interest: 0,
      tax: 0,
      total: 5000,
    });

    const key = `idem-retry-${n}`;
    await recordGstPaymentViaApi(page.request, company.id, MONTH, {
      amount: 500,
      paymentDate: '2026-04-15',
      idempotencyKey: key,
    });
    await recordGstPaymentViaApi(page.request, company.id, MONTH, {
      amount: 500,
      paymentDate: '2026-04-15',
      idempotencyKey: key,
    });
    company = await findGstCompanyInLedger(page.request, userId);
    expect(company.filings[MONTH].payments?.length).toBe(1);

    await recordGstPaymentViaApi(page.request, company.id, MONTH, {
      amount: 500,
      paymentDate: '2026-04-15',
      idempotencyKey: `idem-other-${n}`,
    });
    company = await findGstCompanyInLedger(page.request, userId);
    expect(company.filings[MONTH].payments?.length).toBe(2);
    expect(monthReceived(company.filings[MONTH])).toBe(1000);
  });

  test('rejects invalid dates and unsupported modes; over-receipt keeps payments', async ({
    page,
  }) => {
    const n = nextSeq();
    const userId = `e2e.gst.safe.${n}@example.test`;
    await loginAsE2eAdmin(page);
    await createGstCompanyViaUi(page, {
      companyName: syntheticName('GstSafe', n),
      userId,
    });
    let company = await findGstCompanyInLedger(page.request, userId);
    await saveGstFilingViaApi(page.request, company.id, {
      month: MONTH,
      fees: 2000,
      interest: 0,
      tax: 0,
      total: 2000,
    });

    const badDate = await page.request.post(
      `/api/gst/clients/${company.id}/filings/${encodeURIComponent(MONTH)}/payments`,
      { data: { amount: 100, paymentDate: 'not-a-date', paymentMode: 'GPay' } }
    );
    expect(badDate.status()).toBe(400);

    const badMode = await page.request.post(
      `/api/gst/clients/${company.id}/filings/${encodeURIComponent(MONTH)}/payments`,
      { data: { amount: 100, paymentDate: '2026-04-15', paymentMode: 'Bitcoin' } }
    );
    expect(badMode.status()).toBe(400);

    await recordGstPaymentViaApi(page.request, company.id, MONTH, {
      amount: 1500,
      idempotencyKey: `over-${n}`,
    });
    await saveGstFilingViaApi(page.request, company.id, {
      month: MONTH,
      fees: 500,
      interest: 0,
      tax: 0,
      total: 500,
    });
    company = await findGstCompanyInLedger(page.request, userId);
    expect(monthReceived(company.filings[MONTH])).toBe(1500);
    expect(company.filings[MONTH].total).toBe(500);
    expect(monthOutstanding(company.filings[MONTH])).toBe(0);
  });
});

test.describe('Phase 8D.5 — GST usability and payment-history safety', () => {
  test('unallocated received visible on All Data with Outstanding explanation', async ({
    page,
  }) => {
    const n = nextSeq();
    const userId = `e2e.gst.unalloc.ui.${n}@example.test`;
    const companyName = syntheticName('GstUnallocUi', n);

    await loginAsE2eAdmin(page);
    await createGstCompanyViaUi(page, { companyName, userId });
    let company = await findGstCompanyInLedger(page.request, userId);
    await saveGstFilingViaApi(page.request, company.id, {
      month: MONTH,
      fees: 5000,
      interest: 0,
      tax: 0,
      total: 5000,
    });
    company = await findGstCompanyInLedger(page.request, userId);
    await seedGstLegacyTotalReceivedViaApi(page.request, company, 50_000);
    await recordGstPaymentViaApi(page.request, company.id, MONTH, {
      amount: 1000,
      idempotencyKey: `unalloc-ui-${n}`,
    });

    await goGstAllData(page);
    await page.reload();
    await goGstAllData(page);
    await page
      .getByPlaceholder(/Search by company, User ID|Search companies by name, user ID/i)
      .fill(userId);
    const row = page.locator('tr').filter({ hasText: companyName }).first();
    await expect(row.getByText(/Unallocated Received/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(row.getByText(/50,000/)).toBeVisible();
    await expect(
      row.getByText(/Incl\. unallocated in company total/i)
    ).toBeVisible();
  });

  test('UI Record Payment sends Idempotency-Key; retry reuses key on failure path', async ({
    page,
  }) => {
    const n = nextSeq();
    const userId = `e2e.gst.idem.ui.${n}@example.test`;
    const companyName = syntheticName('GstIdemUi', n);

    await loginAsE2eAdmin(page);
    await createGstCompanyWithFilingViaUi(page, {
      companyName,
      userId,
      fees: 5000,
      interest: 0,
      tax: 0,
      month: MONTH,
    });
    const company = await findGstCompanyInLedger(page.request, userId);

    const keys: string[] = [];
    await page.route(
      `**/api/gst/clients/${company.id}/filings/**/payments`,
      async (route) => {
        if (route.request().method() === 'POST') {
          const h = route.request().headers()['idempotency-key'];
          if (h) keys.push(h);
          if (keys.length === 1) {
            await route.fulfill({
              status: 500,
              contentType: 'application/json',
              body: JSON.stringify({ error: 'Synthetic failure for retry test' }),
            });
            return;
          }
        }
        await route.continue();
      }
    );

    await openGstFilingEditor(page, companyName, MONTH);
    const dialog = page.getByRole('dialog').filter({
      hasText: /Save Filing|Record Payment|Payment Details/i,
    });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    await expect(
      dialog.getByRole('button', { name: /^Record Payment$/i })
    ).toBeVisible({ timeout: 10_000 });
    await dialog.getByLabel(/^Payment Amount \(₹\)$/i).fill('250');
    await dialog.getByRole('button', { name: /^Record Payment$/i }).click();
    await expect(
      dialog.getByText(/Synthetic failure|Unable to save/i)
    ).toBeVisible({ timeout: 10_000 });

    await dialog.getByRole('button', { name: /^Record Payment$/i }).click();
    await expect(
      dialog.getByText(/Payment History/i)
    ).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByRole('listitem').getByText('₹250')).toBeVisible();

    expect(keys.length).toBeGreaterThanOrEqual(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);

    const after = await findGstCompanyInLedger(page.request, userId);
    expect(after.filings[MONTH].payments?.length).toBe(1);
    expect(monthReceived(after.filings[MONTH])).toBe(250);
  });

  test('filing delete warning mentions payments; Keep cancels and preserves history', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const n = nextSeq();
    const userId = `e2e.gst.delwarn.${n}@example.test`;
    const companyName = syntheticName('GstDelWarn', n);

    await loginAsE2eAdmin(page);
    await createGstCompanyWithFilingViaUi(page, {
      companyName,
      userId,
      fees: 3000,
      interest: 0,
      tax: 0,
      month: MONTH,
    });
    let company = await findGstCompanyInLedger(page.request, userId);
    await recordGstPaymentViaApi(page.request, company.id, MONTH, {
      amount: 400,
      idempotencyKey: `delwarn-${n}`,
    });
    company = await findGstCompanyInLedger(page.request, userId);
    expect(company.filings[MONTH].payments?.length).toBe(1);

    // Reload so the filing modal receives payment history from ledger
    await page.reload();
    await openGstFilingEditor(page, companyName, MONTH);
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/Payment History/i)).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      dialog.getByRole('listitem').getByText('₹400')
    ).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: /Remove filing/i })
    ).toBeVisible({ timeout: 10_000 });
    await dialog.getByRole('button', { name: /Remove filing/i }).click();
    await expect(
      dialog.getByText(/permanently deletes this month's filing/i)
    ).toBeVisible();
    await expect(dialog.getByText(/1 payment/)).toBeVisible();
    await expect(
      dialog.getByText(/Unallocated company receipts are not removed/i)
    ).toBeVisible();

    await dialog.getByRole('button', { name: /^Keep$/i }).click();
    await expect(
      dialog.getByRole('button', { name: /Remove filing/i })
    ).toBeVisible();

    company = await findGstCompanyInLedger(page.request, userId);
    expect(company.filings[MONTH]).toBeTruthy();
    expect(company.filings[MONTH].payments?.length).toBe(1);
    expect(monthReceived(company.filings[MONTH])).toBe(400);
  });
});

test.describe('Phase 8D.8 / 8D.13 — GST visible payment entry', () => {
  test('Received is read-only; Save Filing preserves payments; Record Payment updates totals', async ({
    page,
  }) => {
    const n = nextSeq();
    const userId = `e2e.gst.unified.${n}@example.test`;
    const companyName = syntheticName('GstUnified', n);

    await loginAsE2eAdmin(page);
    await createGstCompanyWithFilingViaUi(page, {
      companyName,
      userId,
      fees: 5000,
      interest: 0,
      tax: 0,
      month: MONTH,
    });
    let company = await findGstCompanyInLedger(page.request, userId);
    await recordGstPaymentViaApi(page.request, company.id, MONTH, {
      amount: 1200,
      idempotencyKey: `unified-seed-${n}`,
    });

    await page.reload();
    await openGstFilingEditor(page, companyName, MONTH);
    const dialog = page.getByRole('dialog');

    await expect(dialog.getByRole('button', { name: /Save Filing/i })).toBeVisible();
    await expect(dialog.getByText(/Filing Charges/i)).toBeVisible();
    await expect(dialog.getByText(/Payment Details/i)).toBeVisible();
    await expect(
      dialog.getByText(/Sum of saved payments for this month/i)
    ).toBeVisible();
    // Received must not be an editable number input
    await expect(dialog.locator('input[id*="received"]')).toHaveCount(0);
    await expect(dialog.getByTestId('gst-month-received')).toContainText('1,200');
    await expect(
      dialog.getByRole('button', { name: /^Record Payment$/i })
    ).toBeVisible();
    await expect(dialog.getByText(/Payment History \(1\)/i)).toBeVisible();

    // Save Filing with same charges — payments preserved
    await dialog.getByLabel(/^Fees \(₹\)$/i).fill('4800');
    await dialog.getByRole('button', { name: /Save Filing/i }).click();
    await expect(dialog.getByText(/Filing saved/i)).toBeVisible({
      timeout: 10_000,
    });
    await expect(dialog).toBeVisible();

    company = await findGstCompanyInLedger(page.request, userId);
    expect(company.filings[MONTH].fees).toBe(4800);
    expect(company.filings[MONTH].payments?.length).toBe(1);
    expect(monthReceived(company.filings[MONTH])).toBe(1200);

    await dialog.getByLabel(/^Payment Amount \(₹\)$/i).fill('300');
    await dialog.getByRole('button', { name: /^Record Payment$/i }).click();
    await expect(dialog.getByRole('listitem').getByText('₹300')).toBeVisible({
      timeout: 15_000,
    });

    company = await findGstCompanyInLedger(page.request, userId);
    expect(company.filings[MONTH].payments?.length).toBe(2);
    expect(monthReceived(company.filings[MONTH])).toBe(1500);
    await expect(dialog.getByTestId('gst-month-received')).toContainText('1,500');
    await expect(dialog.getByTestId('gst-month-outstanding')).toContainText(
      '3,300'
    );
  });

  test('new month Save Filing keeps modal open for first payment', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    // Sheet View is lg+ only
    await page.setViewportSize({ width: 1400, height: 900 });
    const n = nextSeq();
    const userId = `e2e.gst.newmonth.${n}@example.test`;
    const companyName = syntheticName('GstNewMonth', n);

    await loginAsE2eAdmin(page);
    // Creates company with default Apr 2026 month — open Add for a different empty month column
    await createGstCompanyViaUi(page, { companyName, userId });
    await goGstAllData(page);
    await page.getByRole('tab', { name: /Sheet View/i }).click();
    await selectGstAllMonths(page);
    await page
      .getByPlaceholder(/Search by company, User ID|Search companies by name, user ID/i)
      .fill(userId);

    const row = page.locator('tr').filter({ hasText: companyName }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    // Click first empty-month Add in this company row
    await row.getByRole('button', { name: /^Add$/i }).first().click();

    const dialog = page.getByRole('dialog').filter({ hasText: companyName });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByRole('button', { name: /Save Filing/i })).toBeVisible();
    await expect(
      dialog.getByText(/Save the filing to enable payment entry/i)
    ).toBeVisible();
    await dialog.getByLabel(/^Fees \(₹\)$/i).fill('2000');
    await dialog.getByRole('button', { name: /Save Filing/i }).click();
    await expect(dialog.getByText(/Filing saved/i)).toBeVisible({
      timeout: 10_000,
    });
    await expect(dialog).toBeVisible();

    // After first save, payment form is visible without reopen
    await expect(
      dialog.getByLabel(/^Payment Amount \(₹\)$/i)
    ).toBeVisible({ timeout: 10_000 });
    await dialog.getByLabel(/^Payment Amount \(₹\)$/i).fill('500');
    await dialog.getByRole('button', { name: /^Record Payment$/i }).click();
    await expect(dialog.getByRole('listitem').getByText('₹500')).toBeVisible({
      timeout: 15_000,
    });
    await expect(dialog.getByTestId('gst-month-received')).toContainText('500');

    const after = await findGstCompanyInLedger(page.request, userId);
    const months = Object.keys(after.filings);
    expect(months.length).toBeGreaterThanOrEqual(2);
    const paidMonth = months.find(
      (m) => (after.filings[m].payments?.length || 0) > 0
    );
    expect(paidMonth).toBeTruthy();
    expect(monthReceived(after.filings[paidMonth!])).toBe(500);
    expect(after.filings[paidMonth!].total).toBe(2000);
  });
});

test.describe('Phase 8D.11 — payment delete confirmation', () => {
  test('Keep cancels payment delete and leaves the payment', async ({ page }) => {
    const n = nextSeq();
    const userId = `e2e.gst.paydel.${n}@example.test`;
    const companyName = syntheticName('GstPayDel', n);

    await loginAsE2eAdmin(page);
    await createGstCompanyWithFilingViaUi(page, {
      companyName,
      userId,
      fees: 5000,
      interest: 0,
      tax: 0,
      month: MONTH,
    });
    let company = await findGstCompanyInLedger(page.request, userId);
    await recordGstPaymentViaApi(page.request, company.id, MONTH, {
      amount: 750,
      paymentDate: '2026-04-12',
      idempotencyKey: `paydel-${n}`,
    });

    await page.reload();
    await openGstFilingEditor(page, companyName, MONTH);
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/Payment History \(1\)/i)).toBeVisible({
      timeout: 10_000,
    });
    await expect(dialog.getByRole('listitem').getByText('₹750')).toBeVisible();
    await dialog.getByRole('button', { name: /Delete payment/i }).click();
    await expect(
      dialog.getByText(/Remove this payment of ₹750 dated 2026-04-12/i)
    ).toBeVisible();
    await dialog.getByRole('button', { name: /^Keep$/i }).click();
    await expect(dialog.getByRole('listitem').getByText('₹750')).toBeVisible();

    company = await findGstCompanyInLedger(page.request, userId);
    expect(company.filings[MONTH].payments?.length).toBe(1);
    expect(monthReceived(company.filings[MONTH])).toBe(750);
  });
});

test.describe('Phase 8D.14 — GST FY dashboard consistency', () => {
  test('FY selector scopes top-card Received across financial years', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1400, height: 900 });
    const n = nextSeq();
    const userId = `e2e.gst.fy.${n}@example.test`;
    const companyName = syntheticName('GstFyDash', n);
    const priorMonth = 'Apr 2025';

    await loginAsE2eAdmin(page);
    await createGstCompanyWithFilingViaUi(page, {
      companyName,
      userId,
      fees: 5000,
      interest: 0,
      tax: 0,
      month: MONTH,
    });
    let company = await findGstCompanyInLedger(page.request, userId);
    await recordGstPaymentViaApi(page.request, company.id, MONTH, {
      amount: 1000,
      idempotencyKey: `fy-cur-${n}`,
    });
    await saveGstFilingViaApi(page.request, company.id, {
      month: priorMonth,
      fees: 3000,
      interest: 0,
      tax: 0,
      total: 3000,
    });
    company = await findGstCompanyInLedger(page.request, userId);
    await recordGstPaymentViaApi(page.request, company.id, priorMonth, {
      amount: 2000,
      idempotencyKey: `fy-prior-${n}`,
    });

    await page.reload();
    await goGstAllData(page);
    await expect(
      page.getByText(/Financial Year/i).first()
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/FY 2026-27/i).first()).toBeVisible();
    await expect(
      page.getByText(/Selected financial year/i).first()
    ).toBeVisible();

    const cards = page.getByRole('region', { name: /Key ledger totals/i });
    await expect(cards.getByText(/Total Received/i)).toBeVisible();

    // Expected FY totals from full ledger (shared e2e DB may contain other companies)
    const ledger = await page.request.get('/api/ledger').then((r) => r.json());
    const monthsCur = [
      'Apr 2026', 'May 2026', 'Jun 2026', 'Jul 2026', 'Aug 2026', 'Sep 2026',
      'Oct 2026', 'Nov 2026', 'Dec 2026', 'Jan 2027', 'Feb 2027', 'Mar 2027',
    ];
    const monthsPrior = [
      'Apr 2025', 'May 2025', 'Jun 2025', 'Jul 2025', 'Aug 2025', 'Sep 2025',
      'Oct 2025', 'Nov 2025', 'Dec 2025', 'Jan 2026', 'Feb 2026', 'Mar 2026',
    ];
    const monthsEmpty = [
      'Apr 2024', 'May 2024', 'Jun 2024', 'Jul 2024', 'Aug 2024', 'Sep 2024',
      'Oct 2024', 'Nov 2024', 'Dec 2024', 'Jan 2025', 'Feb 2025', 'Mar 2025',
    ];
    const fyRecd = (months: string[]) => {
      let sum = 0;
      for (const c of ledger.gstClients as Array<{
        filings?: Record<string, { payments?: Array<{ amount: number }>; received?: number }>;
      }>) {
        for (const m of months) {
          const f = c.filings?.[m];
          if (!f) continue;
          sum += monthReceived(f);
        }
      }
      return sum;
    };
    const curRecd = fyRecd(monthsCur);
    const priorRecd = fyRecd(monthsPrior);
    const emptyRecd = fyRecd(monthsEmpty);

    await expect(
      cards.getByText(`₹${expectDisplayAmount(curRecd)}`).first()
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /Previous financial year/i }).click();
    await expect(page.getByText(/FY 2025-26/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      cards.getByText(`₹${expectDisplayAmount(priorRecd)}`).first()
    ).toBeVisible({ timeout: 10_000 });
    expect(priorRecd).toBeGreaterThanOrEqual(2000);

    await page.getByRole('button', { name: /Previous financial year/i }).click();
    await expect(page.getByText(/FY 2024-25/i).first()).toBeVisible();
    await expect(
      cards.getByText(`₹${expectDisplayAmount(emptyRecd)}`).first()
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Phase 8D.13 — visible payment entry safety', () => {
  test('payment form visible without expand; Save Filing does not create payment', async ({
    page,
  }) => {
    const n = nextSeq();
    const userId = `e2e.gst.visible.${n}@example.test`;
    const companyName = syntheticName('GstVisible', n);

    await loginAsE2eAdmin(page);
    await createGstCompanyWithFilingViaUi(page, {
      companyName,
      userId,
      fees: 4000,
      interest: 100,
      tax: 50,
      month: MONTH,
    });

    await openGstFilingEditor(page, companyName, MONTH);
    const dialog = page.getByRole('dialog');

    await expect(dialog.getByText(/^Filing Charges$/i)).toBeVisible();
    await expect(dialog.getByText(/^Payment Details$/i)).toBeVisible();
    await expect(dialog.getByText(/Payment History \(0\)/i)).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: /^Record Payment$/i })
    ).toBeVisible();
    await expect(dialog.getByTestId('gst-month-received')).toContainText('0');
    await expect(dialog.getByTestId('gst-month-outstanding')).toContainText(
      '4,150'
    );

    // Fill payment amount but only Save Filing — must not create a payment
    await dialog.getByLabel(/^Payment Amount \(₹\)$/i).fill('999');
    await dialog.getByLabel(/^Fees \(₹\)$/i).fill('4100');
    await dialog.getByRole('button', { name: /Save Filing/i }).click();
    await expect(dialog.getByText(/Filing saved/i)).toBeVisible({
      timeout: 10_000,
    });

    const company = await findGstCompanyInLedger(page.request, userId);
    expect(company.filings[MONTH].fees).toBe(4100);
    expect(company.filings[MONTH].payments?.length || 0).toBe(0);
    expect(monthReceived(company.filings[MONTH])).toBe(0);
    await expect(dialog.getByTestId('gst-month-received')).toContainText('0');
  });
});
