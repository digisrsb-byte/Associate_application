import { test, expect } from '@playwright/test';
import { loginAsE2eAdmin } from './helpers/auth';
import { createGstCompanyViaUi, createItClientViaUi, goItAllData } from './helpers/clients';
import { goItClientSummary } from './helpers/filters';
import {
  findGstCompanyInLedger,
  findItClientInLedger,
  recordGstPaymentViaApi,
  saveGstFilingViaApi,
  saveItFilingViaApi,
} from './helpers/finance';
import {
  expectDisplayAmount,
  expectGstMonthTotal,
  expectItBalance,
} from './helpers/financeExpected';
import {
  ALL_AYS,
  expectClientItTotals,
  expectItOverallTotals,
  expectItYearRow,
} from './helpers/reportsExpected';
import { nextSeq, syntheticName, syntheticPan } from './helpers/ids';

test.describe('Stage 4D — dashboard and report calculations', () => {
  test('independent IT/GST/client totals match ledger and UI', async ({ page }) => {
    test.setTimeout(90_000);
    const n = nextSeq();
    const pan1 = syntheticPan(n);
    const pan2 = syntheticPan(n + 1);
    const name1 = syntheticName('RepIT1', n);
    const name2 = syntheticName('RepIT2', n);
    const gstUser = `e2e.rep.gst.${n}@example.test`;
    const gstName = syntheticName('RepGST', n);

    await loginAsE2eAdmin(page);
    await createItClientViaUi(page, { name: name1, pan: pan1 });
    await createItClientViaUi(page, { name: name2, pan: pan2 });
    await createGstCompanyViaUi(page, { companyName: gstName, userId: gstUser });

    const c1 = await findItClientInLedger(page.request, pan1);
    const c2 = await findItClientInLedger(page.request, pan2);
    const g = await findGstCompanyInLedger(page.request, gstUser);

    await saveItFilingViaApi(page.request, c1.id, {
      assessmentYear: 'AY 2025-26',
      fees: 5000,
      received: 2000,
      balance: expectItBalance(5000, 2000),
    });
    await saveItFilingViaApi(page.request, c1.id, {
      assessmentYear: 'AY 2026-27',
      fees: 3000,
      received: 3000,
      balance: expectItBalance(3000, 3000),
    });
    await saveItFilingViaApi(page.request, c2.id, {
      assessmentYear: 'AY 2026-27',
      fees: 4000,
      received: 1000,
      balance: expectItBalance(4000, 1000),
    });

    const gstTotal = expectGstMonthTotal(2500, 100, 450);
    await saveGstFilingViaApi(page.request, g.id, {
      month: 'Apr 2026',
      fees: 2500,
      interest: 100,
      tax: 450,
      total: gstTotal,
    });
    await recordGstPaymentViaApi(page.request, g.id, 'Apr 2026', { amount: 1000 });

    await page.reload();

    const ledger = await page.request.get('/api/ledger').then((r) => r.json());
    const itClients = ledger.clients.filter((c: { pan: string }) =>
      [pan1, pan2].includes(c.pan)
    );
    const overall = expectItOverallTotals(itClients, [...ALL_AYS]);
    expect(overall.totalBilled).toBe(5000 + 3000 + 4000);
    expect(overall.totalReceived).toBe(2000 + 3000 + 1000);
    expect(overall.totalOutstanding).toBe(
      expectItBalance(5000, 2000) + expectItBalance(3000, 3000) + expectItBalance(4000, 1000)
    );

    const y26 = expectItYearRow(itClients, 'AY 2026-27');
    expect(y26.entries).toBe(2);
    expect(y26.amountBilled).toBe(7000);

    const client1 = itClients.find((c: { pan: string }) => c.pan === pan1);
    const clientTotals = expectClientItTotals(client1);
    expect(clientTotals.totalBilled).toBe(8000);
    expect(clientTotals.outstandingTotal).toBe(expectItBalance(5000, 2000));

    // Dashboard shell — money picture is combined IT+GST across the whole ledger (shared e2e DB),
    // so do not assert an isolated IT-only ₹6,000 here. Ledger math above remains the source of truth.
    await page.getByRole('button', { name: /DASHBOARD/i }).click();
    await expect(page.getByText(/money picture/i)).toBeVisible();
    await expect(page.getByText(/₹/).first()).toBeVisible();

    // All-data row outstanding for client 1
    await goItAllData(page);
    const row1 = page.locator('tr').filter({ hasText: pan1 }).first();
    await expect(
      row1.getByText(`₹${expectDisplayAmount(clientTotals.outstandingTotal)}`)
    ).toBeVisible();
    await expect(
      row1.getByText(`₹${expectDisplayAmount(clientTotals.totalReceived)}`)
    ).toBeVisible();

    // Client summary — default sort is "Most outstanding" with page size 25 on a
    // shared e2e ledger, so low-outstanding RepIT clients are off page 1. Search
    // by PAN (exact) rather than bumping timeouts or scanning all pages.
    await goItClientSummary(page);
    await page.getByRole('searchbox', { name: /Search name, PAN, mobile/i }).fill(pan1);
    const summaryRow = page.locator('tr, [role="button"]').filter({ hasText: pan1 }).first();
    await expect(summaryRow).toBeVisible();
    await expect(summaryRow.getByText(name1)).toBeVisible();
    await expect(summaryRow.getByText(pan1)).toBeVisible();

    // GST outstanding independent check via ledger
    const gst = await findGstCompanyInLedger(page.request, gstUser);
    const billed = Object.values(gst.filings).reduce(
      (s, f) => s + (Number(f.total) || 0),
      0
    );
    expect(Math.max(0, billed - gst.totalReceived)).toBe(gstTotal - 1000);
  });
});
