import { test, expect } from '@playwright/test';
import { loginAsE2eAdmin } from './helpers/auth';
import {
  createItClientViaUi,
  deleteItClientViaUi,
  ensureItClientListed,
  fetchLedger,
  goItAllData,
  openRowMenuForText,
} from './helpers/clients';
import { nextSeq, syntheticName, syntheticPan } from './helpers/ids';

/**
 * Existing behaviour: hard DELETE via row menu + in-menu confirmation
 * ("Delete this client?"). No deactivate/soft-delete path in the UI.
 * Operates only on data-e2e dummy records.
 */
test.describe('Stage 2F — delete behaviour', () => {
  test('shows confirmation then deletes dummy IT client only', async ({ page }) => {
    test.setTimeout(90_000);
    const n = nextSeq();
    const name = syntheticName('DeleteMe', n);
    const pan = syntheticPan(n);
    const keepName = syntheticName('KeepMe', n + 1);
    const keepPan = syntheticPan(n + 1);

    await loginAsE2eAdmin(page);
    await createItClientViaUi(page, { name, pan });
    await createItClientViaUi(page, { name: keepName, pan: keepPan });
    await ensureItClientListed(page, name, pan);

    await goItAllData(page);
    await openRowMenuForText(page, pan);
    await page.getByRole('menuitem', { name: /Delete Client/i }).click();
    await expect(page.getByText(/Delete this client\?/i)).toBeVisible();
    await page.getByRole('button', { name: /^Cancel$/i }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByText(name).first()).toBeVisible();

    await deleteItClientViaUi(page, pan);

    await goItAllData(page);
    await expect(page.getByText(pan)).toHaveCount(0);
    await expect(page.getByText(keepName).first()).toBeVisible();
    await expect(page.getByText(keepPan).first()).toBeVisible();

    const ledger = await fetchLedger(page.request);
    expect(ledger.clients.some((c) => c.pan === pan)).toBeFalsy();
    expect(ledger.clients.some((c) => c.pan === keepPan)).toBeTruthy();
  });
});
