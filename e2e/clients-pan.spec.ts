import { test, expect } from '@playwright/test';
import { loginAsE2eAdmin } from './helpers/auth';
import { createItClientViaUi, fetchLedger, openAddClientModal } from './helpers/clients';
import { PORTAL_PASSWORD, nextSeq, syntheticName, syntheticPan } from './helpers/ids';

test.describe('Stage 2C — PAN validation', () => {
  test('accepts valid-format synthetic PAN', async ({ page }) => {
    const n = nextSeq();
    const pan = syntheticPan(n);
    const name = syntheticName('PanOk', n);
    await loginAsE2eAdmin(page);
    await createItClientViaUi(page, { name, pan });
    const ledger = await fetchLedger(page.request);
    expect(ledger.clients.some((c) => c.pan === pan && c.name === name)).toBeTruthy();
  });

  test('rejects invalid PAN format with message', async ({ page }) => {
    await loginAsE2eAdmin(page);
    await openAddClientModal(page);
    const dialog = page.getByRole('dialog', { name: /Add Client/i });
    await dialog.getByPlaceholder('Client Name').fill(syntheticName('PanBad', nextSeq()));
    // 4th char D is not a valid entity type → invalid structure
    await dialog.getByPlaceholder('ABCPK1234D').fill('ABCDD1234F');
    await dialog.getByPlaceholder('Password').fill(PORTAL_PASSWORD);
    const filingCheck = dialog
      .locator('label')
      .filter({ hasText: 'Add Filing Date entry now' })
      .locator('input');
    if (await filingCheck.isChecked()) await filingCheck.uncheck();
    await dialog.getByRole('button', { name: /^Save$/i }).click();
    await expect(dialog.locator('.text-red-800, [class*="danger"]').first()).toContainText(
      /Invalid PAN/i
    );
    await expect(dialog).toBeVisible();
  });

  test('rejects missing PAN via required field', async ({ page }) => {
    await loginAsE2eAdmin(page);
    await openAddClientModal(page);
    const dialog = page.getByRole('dialog', { name: /Add Client/i });
    await dialog.getByPlaceholder('Client Name').fill(syntheticName('PanMiss', nextSeq()));
    await dialog.getByPlaceholder('Password').fill(PORTAL_PASSWORD);
    const filingCheck = dialog
      .locator('label')
      .filter({ hasText: 'Add Filing Date entry now' })
      .locator('input');
    if (await filingCheck.isChecked()) await filingCheck.uncheck();
    await dialog.getByRole('button', { name: /^Save$/i }).click();
    // HTML5 required on PAN — dialog stays open, no new ledger row for blank PAN
    await expect(dialog).toBeVisible();
    const panInput = dialog.getByPlaceholder('ABCPK1234D');
    const valid = await panInput.evaluate((el: HTMLInputElement) => el.validity.valueMissing);
    expect(valid).toBeTruthy();
  });

  test('prevents duplicate PAN', async ({ page }) => {
    const n = nextSeq();
    const pan = syntheticPan(n);
    const name1 = syntheticName('DupA', n);
    const name2 = syntheticName('DupB', n);

    await loginAsE2eAdmin(page);
    await createItClientViaUi(page, { name: name1, pan });

    await openAddClientModal(page);
    const dialog = page.getByRole('dialog', { name: /Add Client/i });
    await dialog.getByPlaceholder('Client Name').fill(name2);
    await dialog.getByPlaceholder('ABCPK1234D').fill(pan);
    await dialog.getByPlaceholder('Password').fill(PORTAL_PASSWORD);
    const filingCheck = dialog
      .locator('label')
      .filter({ hasText: 'Add Filing Date entry now' })
      .locator('input');
    if (await filingCheck.isChecked()) await filingCheck.uncheck();
    await dialog.getByRole('button', { name: /^Save$/i }).click();
    await expect(dialog.locator('.text-red-800').first()).toContainText(
      new RegExp(`PAN ${pan} already exists`, 'i')
    );

    const ledger = await fetchLedger(page.request);
    expect(ledger.clients.filter((c) => c.pan === pan)).toHaveLength(1);
  });
});
