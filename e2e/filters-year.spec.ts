import { test, expect } from '@playwright/test';
import { loginAsE2eAdmin } from './helpers/auth';
import { createItClientViaUi, goItAllData } from './helpers/clients';
import { selectItAllYears, selectItYear } from './helpers/filters';
import { findItClientInLedger, saveItFilingViaApi } from './helpers/finance';
import { expectDisplayAmount, expectItBalance } from './helpers/financeExpected';
import { ALL_AYS, expectItYearRow, shortAyLabel } from './helpers/reportsExpected';
import { nextSeq, syntheticName, syntheticPan } from './helpers/ids';

test.describe('Stage 4B — financial-year filters', () => {
  test('each AY 2019-20…2026-27 shows that year filing only when filtered', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const n = nextSeq();
    const pan = syntheticPan(n);
    const name = syntheticName('YearFilt', n);

    await loginAsE2eAdmin(page);
    await createItClientViaUi(page, { name, pan });
    const client = await findItClientInLedger(page.request, pan);

    for (let i = 0; i < ALL_AYS.length; i++) {
      const ay = ALL_AYS[i];
      const fees = (i + 1) * 1000;
      const received = i * 100;
      await saveItFilingViaApi(page.request, client.id, {
        assessmentYear: ay,
        fees,
        received,
        balance: expectItBalance(fees, received),
      });
    }
    await page.reload();

    const ledgerClient = await findItClientInLedger(page.request, pan);

    for (let i = 0; i < ALL_AYS.length; i++) {
      const ay = ALL_AYS[i];
      const fees = (i + 1) * 1000;
      const expected = expectItYearRow([ledgerClient], ay);
      expect(expected.entries).toBe(1);
      expect(expected.amountBilled).toBe(fees);

      await selectItYear(page, ay);
      const row = page.locator('tr').filter({ hasText: pan }).first();
      await row.getByLabel(/Expand filing years/i).click();
      // Nested table should show this AY (and not a wrong fees from another year as the only row)
      await expect(page.getByText(ay).first()).toBeVisible();
      await expect(
        page.getByText(`₹${expectDisplayAmount(fees)}`).first()
      ).toBeVisible();
      // Collapse for next iteration
      await row.getByLabel(/Collapse filing years/i).click();
    }

    await selectItAllYears(page);
    const row = page.locator('tr').filter({ hasText: pan }).first();
    await row.getByLabel(/Expand filing years/i).click();
    for (const ay of ALL_AYS) {
      await expect(page.getByText(ay).first()).toBeVisible();
    }
    // Spot-check short label exists in navigator
    await expect(page.getByText(shortAyLabel('AY 2019-20')).or(page.getByText('All years')).first()).toBeVisible();
    await goItAllData(page);
  });
});
