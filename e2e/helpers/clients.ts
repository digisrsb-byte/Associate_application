import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { PORTAL_PASSWORD } from './ids';
import { goGstAllData, goItAllData, openAddClientModal, openAddGstModal } from './nav';

export type ItClientInput = {
  name: string;
  pan: string;
  phone?: string;
  referenceNumber?: string;
  remark?: string;
  password?: string;
};

export type GstCompanyInput = {
  companyName: string;
  userId: string;
  phone?: string;
  referenceNumber?: string;
  remark?: string;
  password?: string;
  /** When true, skip filling monthly filing amounts (month still required). */
  skipFilingAmounts?: boolean;
};

/** Create IT client via Add Client modal. */
export async function createItClientViaUi(page: Page, input: ItClientInput) {
  await openAddClientModal(page);
  const dialog = page.getByRole('dialog', { name: /Add Client/i });
  await dialog.getByPlaceholder('Client Name').fill(input.name);
  await dialog.getByPlaceholder('ABCPK1234D').fill(input.pan);
  await dialog.getByPlaceholder('Password').fill(input.password || PORTAL_PASSWORD);
  if (input.phone) await dialog.getByPlaceholder('Mobile Number').fill(input.phone);
  if (input.referenceNumber)
    await dialog.getByPlaceholder('Reference Number').fill(input.referenceNumber);
  if (input.remark) await dialog.getByPlaceholder('Optional remark').fill(input.remark);

  const filingCheck = dialog
    .locator('label')
    .filter({ hasText: 'Add Filing Date entry now' })
    .locator('input');
  if (await filingCheck.isChecked()) await filingCheck.uncheck();

  await dialog.getByRole('button', { name: /^Save$/i }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}

export async function createGstCompanyViaUi(page: Page, input: GstCompanyInput) {
  await openAddGstModal(page);
  const dialog = page.getByRole('dialog', { name: /Add GST Company/i });
  await dialog.getByPlaceholder('Company Name').fill(input.companyName);
  await dialog.getByPlaceholder('User ID').fill(input.userId);
  await dialog.getByPlaceholder('Password').fill(input.password || PORTAL_PASSWORD);
  await dialog.getByPlaceholder('Mobile Number').fill(input.phone || '9876543210');
  await dialog.getByPlaceholder('Reference No').fill(input.referenceNumber || 'E2E-REF');
  await dialog.getByPlaceholder('Remark').fill(input.remark || 'E2E synthetic remark');

  // Monthly Filing is mandatory — leave default month; amounts may stay 0.
  await expect(dialog.getByText(/Monthly Filing/i).first()).toBeVisible();

  await dialog.getByRole('button', { name: /^Save$/i }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}

export async function fetchLedger(request: APIRequestContext) {
  const res = await request.get('/api/ledger');
  expect(res.ok()).toBeTruthy();
  return res.json() as Promise<{
    clients: Array<{
      id: string;
      name: string;
      pan: string;
      phone?: string;
      referenceNumber?: string;
      remark?: string;
    }>;
    gstClients: Array<{
      id: string;
      companyName: string;
      userId: string;
      phone?: string;
      referenceNumber?: string;
      remark?: string;
    }>;
  }>;
}

export async function openRowMenuForText(page: Page, text: string) {
  const row = page.locator('tr').filter({ hasText: text }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByTitle('Company actions').click();
  await expect(page.getByRole('menu')).toBeVisible();
}

export async function editItClientDetails(
  page: Page,
  identifyBy: string,
  updates: { name?: string; phone?: string; remark?: string; pan?: string }
) {
  await goItAllData(page);
  await openRowMenuForText(page, identifyBy);
  await page.getByRole('menuitem', { name: /Edit Details/i }).click();
  const drawer = page.getByRole('dialog').filter({
    has: page.getByText(/Edit client/i),
  });
  await expect(drawer).toBeVisible();

  // Labels are not htmlFor-linked — use field order in #it-client-edit-form.
  const form = drawer.locator('#it-client-edit-form');
  const inputs = form.locator('input:not([type="checkbox"])');
  // 0 name, 1 pan, 2 password, 3 phone, 4 reference
  if (updates.name !== undefined) await inputs.nth(0).fill(updates.name);
  if (updates.pan !== undefined) await inputs.nth(1).fill(updates.pan);
  if (updates.phone !== undefined) await inputs.nth(3).fill(updates.phone);
  if (updates.remark !== undefined) await form.locator('textarea').fill(updates.remark);

  await drawer.getByRole('button', { name: /Save Changes/i }).click();
  await expect(drawer).toBeHidden({ timeout: 15_000 });
}

export async function deleteItClientViaUi(page: Page, identifyBy: string) {
  await goItAllData(page);
  await openRowMenuForText(page, identifyBy);
  await page.getByRole('menuitem', { name: /Delete Client/i }).click();
  await expect(page.getByText(/Delete this client\?/i)).toBeVisible();
  await page.getByRole('menuitem', { name: /^Delete$/i }).click();
  await expect(page.getByRole('menu')).toBeHidden({ timeout: 15_000 });
}

export async function ensureItClientListed(page: Page, name: string, pan: string) {
  await goItAllData(page);
  await expect(page.getByText(name).first()).toBeVisible();
  await expect(page.getByText(pan).first()).toBeVisible();
}

export { goItAllData, goGstAllData, openAddClientModal, openAddGstModal };
