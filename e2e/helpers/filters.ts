import { expect, type Page } from '@playwright/test';
import { goGstAllData, goItAllData } from './nav';
import { shortAyLabel } from './reportsExpected';

function shortMonthLabel(month: string): string {
  const match = month.trim().match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (match) return `${match[1].slice(0, 3)} ${match[2].slice(2)}`;
  return month;
}

export async function selectItYear(page: Page, ay: string) {
  await goItAllData(page);
  await page
    .locator('button[aria-haspopup="listbox"]')
    .filter({ hasText: /All years|\d{2}-\d{2}/ })
    .first()
    .click();
  const listbox = page.getByRole('listbox', { name: /Assessment years/i });
  await expect(listbox).toBeVisible();
  const short = shortAyLabel(ay);
  await listbox.getByRole('option', { name: new RegExp(`^${short}`) }).click();
  await expect(
    page.locator('button[aria-haspopup="listbox"]').filter({ hasText: short }).first()
  ).toBeVisible();
}

export async function selectItAllYears(page: Page) {
  await goItAllData(page);
  await page.getByRole('button', { name: /^All years$/i }).click();
}

export async function selectGstMonth(page: Page, month: string) {
  await goGstAllData(page);
  await page
    .locator('button[aria-haspopup="listbox"]')
    .filter({ hasText: /All months|[A-Za-z]{3}\s+\d{2}/ })
    .first()
    .click();
  const listbox = page.getByRole('listbox', { name: /GST months/i });
  await expect(listbox).toBeVisible();
  const short = shortMonthLabel(month);
  await listbox.getByRole('option', { name: new RegExp(`^${short}`) }).click();
}

export async function selectGstAllMonths(page: Page) {
  await goGstAllData(page);
  await page.getByRole('button', { name: /^All months$/i }).click();
}

export async function openClientHistory(page: Page, identifyBy: string) {
  await goItAllData(page);
  const row = page.locator('tr').filter({ hasText: identifyBy }).first();
  await row.getByTitle('Company actions').click();
  await page.getByRole('menuitem', { name: /View History/i }).click();
  await expect(page.getByText(/Filing history/i)).toBeVisible();
}

export async function goItClientSummary(page: Page) {
  const itToggle = page.getByRole('button', { name: /^IT$/i });
  await itToggle.click();
  let item = page.getByRole('button', { name: /CLIENT SUMMARY/i });
  if (!(await item.isVisible().catch(() => false))) {
    await itToggle.click();
    item = page.getByRole('button', { name: /CLIENT SUMMARY/i });
  }
  await item.click();
  await expect(page.getByText(/Client Summary|IT · Client Summary/i).first()).toBeVisible({
    timeout: 15_000,
  });
}

export { shortMonthLabel };
