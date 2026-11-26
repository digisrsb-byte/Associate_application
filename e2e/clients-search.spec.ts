import { test, expect } from '@playwright/test';
import { loginAsE2eAdmin } from './helpers/auth';
import {
  createGstCompanyViaUi,
  createItClientViaUi,
  goGstAllData,
  goItAllData,
} from './helpers/clients';
import { nextSeq, syntheticName, syntheticPan } from './helpers/ids';

test.describe('Stage 2D — search and filtering', () => {
  test('searches IT clients by name and PAN; shows empty for no match', async ({
    page,
  }) => {
    const n = nextSeq();
    const name = syntheticName('SearchIT', n);
    const pan = syntheticPan(n);
    const otherName = syntheticName('OtherIT', n + 1);
    const otherPan = syntheticPan(n + 1);

    await loginAsE2eAdmin(page);
    await createItClientViaUi(page, { name, pan });
    await createItClientViaUi(page, { name: otherName, pan: otherPan });
    await goItAllData(page);

    const search = page.getByPlaceholder(/Search clients by name, PAN/i);
    await search.fill(name);
    await expect(page.getByText(name).first()).toBeVisible();
    await expect(page.getByText(otherName)).toHaveCount(0);

    await search.fill(pan);
    await expect(page.getByText(pan).first()).toBeVisible();
    await expect(page.getByText(name).first()).toBeVisible();
    await expect(page.getByText(otherName)).toHaveCount(0);

    await search.fill('NOMATCH-ZZZ-99999');
    await expect(page.getByText(/No client records yet/i)).toBeVisible();
  });

  test('IT and GST lists stay separate under search', async ({ page }) => {
    const n = nextSeq();
    const itName = syntheticName('IsolateIT', n);
    const itPan = syntheticPan(n);
    const gstName = syntheticName('IsolateGST', n);
    const gstUser = `e2e.isolate.${n}@example.test`;

    await loginAsE2eAdmin(page);
    await createItClientViaUi(page, { name: itName, pan: itPan });
    await createGstCompanyViaUi(page, { companyName: gstName, userId: gstUser });

    await goItAllData(page);
    const itSearch = page.getByPlaceholder(/Search clients by name, PAN/i);
    await itSearch.fill(gstName);
    // GST company name should not appear as an IT client match
    await expect(page.getByText(/No client records yet/i)).toBeVisible();
    await itSearch.fill(itName);
    await expect(page.getByText(itName).first()).toBeVisible();
    await expect(page.getByText(gstName)).toHaveCount(0);

    await goGstAllData(page);
    const gstSearch = page.getByPlaceholder(/Search companies by name, user ID/i);
    await gstSearch.fill(itPan);
    await expect(page.getByText(itName)).toHaveCount(0);
    await expect(
      page.getByText(/No GST company records yet/i).or(page.getByText(gstName))
    ).toBeVisible();
    // Clear and search GST company
    await gstSearch.fill('');
    await gstSearch.fill(gstName);
    await expect(page.getByText(gstName).first()).toBeVisible();
    await expect(page.getByText(itName)).toHaveCount(0);
  });
});
