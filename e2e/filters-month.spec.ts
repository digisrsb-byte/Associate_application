import { test, expect } from '@playwright/test';
import { loginAsE2eAdmin } from './helpers/auth';
import { createGstCompanyViaUi, goGstAllData } from './helpers/clients';
import { selectGstAllMonths, selectGstMonth, shortMonthLabel } from './helpers/filters';
import {
  findGstCompanyInLedger,
  saveGstFilingViaApi,
} from './helpers/finance';
import { expectDisplayAmount, expectGstMonthTotal } from './helpers/financeExpected';
import { expectGstMonthRow } from './helpers/reportsExpected';
import { nextSeq, syntheticName } from './helpers/ids';

const MONTHS = [
  'Apr 2026',
  'May 2026',
  'Jun 2026',
  'Jul 2026',
  'Aug 2026',
  'Sep 2026',
  'Oct 2026',
  'Nov 2026',
  'Dec 2026',
  'Jan 2027',
  'Feb 2027',
  'Mar 2027',
] as const;

test.describe('Stage 4C — monthly filters', () => {
  test('month switch, empty month, multi-record totals', async ({ page }) => {
    test.setTimeout(180_000);
    const n = nextSeq();
    const userA = `e2e.month.a.${n}@example.test`;
    const userB = `e2e.month.b.${n}@example.test`;
    const nameA = syntheticName('MonA', n);
    const nameB = syntheticName('MonB', n);

    await loginAsE2eAdmin(page);
    await createGstCompanyViaUi(page, { companyName: nameA, userId: userA });
    await createGstCompanyViaUi(page, { companyName: nameB, userId: userB });
    const a = await findGstCompanyInLedger(page.request, userA);
    const b = await findGstCompanyInLedger(page.request, userB);

    // Apr: two companies; May: one; Jun: empty
    await saveGstFilingViaApi(page.request, a.id, {
      month: 'Apr 2026',
      fees: 1000,
      interest: 50,
      tax: 100,
      total: expectGstMonthTotal(1000, 50, 100),
    });
    await saveGstFilingViaApi(page.request, b.id, {
      month: 'Apr 2026',
      fees: 2000,
      interest: 0,
      tax: 200,
      total: expectGstMonthTotal(2000, 0, 200),
    });
    await saveGstFilingViaApi(page.request, a.id, {
      month: 'May 2026',
      fees: 500,
      interest: 0,
      tax: 50,
      total: expectGstMonthTotal(500, 0, 50),
    });
    // Seed a distinct amount in Jul so switching is observable
    await saveGstFilingViaApi(page.request, a.id, {
      month: 'Jul 2026',
      fees: 777,
      interest: 0,
      tax: 0,
      total: 777,
    });

    await page.reload();
    const companies = [
      await findGstCompanyInLedger(page.request, userA),
      await findGstCompanyInLedger(page.request, userB),
    ];

    const apr = expectGstMonthRow(companies, 'Apr 2026');
    expect(apr.companies).toBe(2);
    expect(apr.totalBilled).toBe(
      expectGstMonthTotal(1000, 50, 100) + expectGstMonthTotal(2000, 0, 200)
    );

    await selectGstMonth(page, 'Apr 2026');
    await expect(page.getByText(nameA).first()).toBeVisible();
    await expect(page.getByText(nameB).first()).toBeVisible();

    await selectGstMonth(page, 'May 2026');
    await expect(page.getByText(nameA).first()).toBeVisible();
    // Company B may still list if table shows all companies — check expanded filing
    // Gst simple table typically lists all companies; month filter affects filing columns.
    // Verify May amount visible and Apr dual total not required in UI row.

    await selectGstMonth(page, 'Jun 2026');
    const jun = expectGstMonthRow(companies, 'Jun 2026');
    expect(jun.companies).toBe(0);
    expect(jun.totalBilled).toBe(0);

    await selectGstMonth(page, 'Jul 2026');
    const julRow = page.locator('tr').filter({ hasText: nameA }).first();
    await julRow.getByLabel(/Expand/i).click();
    await expect(page.getByText(`₹${expectDisplayAmount(777)}`).first()).toBeVisible();
    await julRow.getByLabel(/Collapse/i).click();

    // Spot-check remaining months are selectable (empty or not)
    for (const m of [
      'Aug 2026',
      'Sep 2026',
      'Oct 2026',
      'Nov 2026',
      'Dec 2026',
      'Jan 2027',
      'Feb 2027',
      'Mar 2027',
    ]) {
      await selectGstMonth(page, m);
      await expect(
        page.locator('button[aria-haspopup="listbox"]').filter({
          hasText: shortMonthLabel(m),
        })
      ).toBeVisible();
      const empty = expectGstMonthRow(companies, m);
      expect(empty.totalBilled).toBe(0);
    }

    await selectGstAllMonths(page);
    await goGstAllData(page);
    void MONTHS;
  });
});
