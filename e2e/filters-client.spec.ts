import { test, expect } from '@playwright/test';
import { loginAsE2eAdmin } from './helpers/auth';
import { createItClientViaUi, goItAllData } from './helpers/clients';
import { openClientHistory } from './helpers/filters';
import { saveItFilingViaApi, findItClientInLedger } from './helpers/finance';
import { expectItBalance } from './helpers/financeExpected';
import { nextSeq, syntheticName, syntheticPan } from './helpers/ids';

test.describe('Stage 4A — client-specific filters', () => {
  test('PAN search isolates client; switching clears previous match', async ({ page }) => {
    const n = nextSeq();
    const a = {
      name: syntheticName('FiltA', n),
      pan: syntheticPan(n),
    };
    const b = {
      name: syntheticName('FiltB', n + 1),
      pan: syntheticPan(n + 1),
    };

    await loginAsE2eAdmin(page);
    await createItClientViaUi(page, a);
    await createItClientViaUi(page, b);
    await goItAllData(page);

    const search = page.getByPlaceholder(/Search clients by name, PAN/i);
    await search.fill(a.pan);
    await expect(page.getByText(a.name).first()).toBeVisible();
    await expect(page.getByText(b.name)).toHaveCount(0);
    await expect(page.getByText(a.pan).first()).toBeVisible();

    await search.fill(b.pan);
    await expect(page.getByText(b.name).first()).toBeVisible();
    await expect(page.getByText(a.name)).toHaveCount(0);
    await expect(page.getByText(b.pan).first()).toBeVisible();

    await search.fill('');
    await expect(page.getByText(a.name).first()).toBeVisible();
    await expect(page.getByText(b.name).first()).toBeVisible();
  });

  test('View History shows only selected client; switch clients', async ({ page }) => {
    const n = nextSeq();
    const aPan = syntheticPan(n);
    const bPan = syntheticPan(n + 1);
    const aName = syntheticName('HistA', n);
    const bName = syntheticName('HistB', n + 1);

    await loginAsE2eAdmin(page);
    await createItClientViaUi(page, { name: aName, pan: aPan });
    await createItClientViaUi(page, { name: bName, pan: bPan });
    const a = await findItClientInLedger(page.request, aPan);
    const b = await findItClientInLedger(page.request, bPan);
    await saveItFilingViaApi(page.request, a.id, {
      assessmentYear: 'AY 2026-27',
      fees: 1111,
      received: 100,
      balance: expectItBalance(1111, 100),
    });
    await saveItFilingViaApi(page.request, b.id, {
      assessmentYear: 'AY 2026-27',
      fees: 2222,
      received: 200,
      balance: expectItBalance(2222, 200),
    });
    await page.reload();

    await openClientHistory(page, aPan);
    await expect(page.getByRole('dialog').getByText(aName)).toBeVisible();
    await expect(page.getByRole('dialog').getByText(bName)).toHaveCount(0);
    await page.getByRole('dialog').getByLabel('Close', { exact: true }).click();

    await openClientHistory(page, bPan);
    await expect(page.getByRole('dialog').getByText(bName)).toBeVisible();
    await expect(page.getByRole('dialog').getByText(aName)).toHaveCount(0);
  });
});
