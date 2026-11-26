import { expect, type Page } from '@playwright/test';

async function openSectionAndAllData(
  page: Page,
  section: 'IT' | 'GST',
  searchPlaceholder: RegExp
) {
  // Already on the target all-data view
  if (await page.getByPlaceholder(searchPlaceholder).isVisible().catch(() => false)) {
    return;
  }

  const sectionBtn = page.getByRole('button', { name: new RegExp(`^${section}$`, 'i') });
  await sectionBtn.click();

  const allData = page.getByRole('button', { name: /^ALL DATA$/i });
  // If toggle closed the section, open again
  if (!(await allData.first().isVisible().catch(() => false))) {
    await sectionBtn.click();
  }
  await expect(allData.first()).toBeVisible({ timeout: 10_000 });
  await allData.first().click();
  await expect(page.getByPlaceholder(searchPlaceholder)).toBeVisible({
    timeout: 15_000,
  });
}

export async function goItAllData(page: Page) {
  await openSectionAndAllData(
    page,
    'IT',
    /Search by name, PAN|Search clients by name, PAN/i
  );
}

export async function goGstAllData(page: Page) {
  await openSectionAndAllData(
    page,
    'GST',
    /Search by company, User ID|Search companies by name, user ID/i
  );
}

export async function openAddClientModal(page: Page) {
  await page.getByRole('button', { name: /Add Client/i }).first().click();
  await expect(page.getByRole('heading', { name: 'Add Client' })).toBeVisible();
}

export async function openAddGstModal(page: Page) {
  // Prefer explicit dashboard/header control; fall back to sidebar gold button when on GST.
  const explicit = page.getByRole('button', { name: /Add GST Company/i });
  if (await explicit.first().isVisible().catch(() => false)) {
    await explicit.first().click();
  } else {
    await page.getByRole('button', { name: /Add Client|Add GST/i }).first().click();
  }
  await expect(
    page.getByRole('heading', { name: 'Add GST Company' })
  ).toBeVisible();
}
