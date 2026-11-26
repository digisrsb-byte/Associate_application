import { test, expect } from '@playwright/test';
import { loginAsE2eAdmin } from './helpers/auth';
import { openAddClientModal } from './helpers/clients';
import { PORTAL_PASSWORD, nextSeq, syntheticName, syntheticPan } from './helpers/ids';
const NAME_MAX = 120;

test.describe('Stage 2E — form validation', () => {
  test('blocks submit when required name is whitespace-only', async ({ page }) => {
    await loginAsE2eAdmin(page);
    await openAddClientModal(page);
    const dialog = page.getByRole('dialog', { name: /Add Client/i });
    await dialog.getByPlaceholder('Client Name').fill('   ');
    await dialog.getByPlaceholder('ABCPK1234D').fill(syntheticPan(nextSeq()));
    await dialog.getByPlaceholder('Password').fill(PORTAL_PASSWORD);
    const filingCheck = dialog
      .locator('label')
      .filter({ hasText: 'Add Filing Date entry now' })
      .locator('input');
    if (await filingCheck.isChecked()) await filingCheck.uncheck();
    await dialog.getByRole('button', { name: /^Save$/i }).click();
    // Either HTML required (trim may leave empty after submit handler) or modal error
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.text-red-800')).toContainText(/mandatory|required|Name/i);
  });

  test('rejects invalid phone characters and short digit count', async ({ page }) => {
    await loginAsE2eAdmin(page);
    await openAddClientModal(page);
    const dialog = page.getByRole('dialog', { name: /Add Client/i });
    await dialog.getByPlaceholder('Client Name').fill(syntheticName('PhoneBad', nextSeq()));
    await dialog.getByPlaceholder('ABCPK1234D').fill(syntheticPan(nextSeq()));
    await dialog.getByPlaceholder('Password').fill(PORTAL_PASSWORD);
    await dialog.getByPlaceholder('Mobile Number').fill('12ab');
    const filingCheck = dialog
      .locator('label')
      .filter({ hasText: 'Add Filing Date entry now' })
      .locator('input');
    if (await filingCheck.isChecked()) await filingCheck.uncheck();
    await dialog.getByRole('button', { name: /^Save$/i }).click();
    await expect(dialog.locator('.text-red-800').first()).toContainText(/Phone/i);
  });

  test('rejects phone with too few digits', async ({ page }) => {
    await loginAsE2eAdmin(page);
    await openAddClientModal(page);
    const dialog = page.getByRole('dialog', { name: /Add Client/i });
    await dialog.getByPlaceholder('Client Name').fill(syntheticName('PhoneShort', nextSeq()));
    await dialog.getByPlaceholder('ABCPK1234D').fill(syntheticPan(nextSeq()));
    await dialog.getByPlaceholder('Password').fill(PORTAL_PASSWORD);
    await dialog.getByPlaceholder('Mobile Number').fill('12345');
    const filingCheck = dialog
      .locator('label')
      .filter({ hasText: 'Add Filing Date entry now' })
      .locator('input');
    if (await filingCheck.isChecked()) await filingCheck.uncheck();
    await dialog.getByRole('button', { name: /^Save$/i }).click();
    await expect(dialog.locator('.text-red-800').first()).toContainText(
      /between 8 and 15 digits/i
    );
  });

  test('name input is capped at FIELD_LIMITS.name', async ({ page }) => {
    await loginAsE2eAdmin(page);
    await openAddClientModal(page);
    const dialog = page.getByRole('dialog', { name: /Add Client/i });
    const long = 'X'.repeat(NAME_MAX + 40);
    const nameInput = dialog.getByPlaceholder('Client Name');
    await nameInput.fill(long);
    const value = await nameInput.inputValue();
    expect(value.length).toBeLessThanOrEqual(NAME_MAX);
  });

  test('notes that client forms have no email field (N/A)', async ({ page }) => {
    await loginAsE2eAdmin(page);
    await openAddClientModal(page);
    const dialog = page.getByRole('dialog', { name: /Add Client/i });
    await expect(dialog.getByLabel(/^Email/i)).toHaveCount(0);
    await expect(dialog.getByPlaceholder(/email/i)).toHaveCount(0);
  });

  test('missing password blocks create', async ({ page }) => {
    await loginAsE2eAdmin(page);
    await openAddClientModal(page);
    const dialog = page.getByRole('dialog', { name: /Add Client/i });
    await dialog.getByPlaceholder('Client Name').fill(syntheticName('NoPwd', nextSeq()));
    await dialog.getByPlaceholder('ABCPK1234D').fill(syntheticPan(nextSeq()));
    const filingCheck = dialog
      .locator('label')
      .filter({ hasText: 'Add Filing Date entry now' })
      .locator('input');
    if (await filingCheck.isChecked()) await filingCheck.uncheck();
    await dialog.getByRole('button', { name: /^Save$/i }).click();
    await expect(dialog).toBeVisible();
    const pwd = dialog.getByPlaceholder('Password');
    const missing = await pwd.evaluate((el: HTMLInputElement) => el.validity.valueMissing);
    expect(missing).toBeTruthy();
  });
});
