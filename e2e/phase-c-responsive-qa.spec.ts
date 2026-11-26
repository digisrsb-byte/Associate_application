import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect, type Page } from '@playwright/test';
import { expectLoginPage, loginAsE2eAdmin } from './helpers/auth';
import { goItAllData } from './helpers/nav';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = path.resolve(__dirname, '..', 'docs', 'phase-c-screenshots');

const PHONE_WIDTHS = [360, 375, 390, 412, 430] as const;
const TABLET_DESKTOP = [768, 1024, 1280, 1440] as const;

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(SHOT_DIR, `${name}.png`),
    fullPage: true,
  });
}

async function pageOverflowX(page: Page): Promise<number> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return Math.max(0, doc.scrollWidth - doc.clientWidth);
  });
}

async function setViewport(page: Page, width: number, height = 800) {
  await page.setViewportSize({ width, height });
}

test.describe.configure({ mode: 'serial' });

test.describe('Phase C responsive QA (actual browser)', () => {
  test('login composition across phone widths', async ({ page }) => {
    await setViewport(page, 390);
    await page.goto('/');
    await expectLoginPage(page);
    await expect(page.locator('img[alt="SRSB Associate"]')).toBeVisible();
    await expect(page.getByText(/^Associate$/i).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /Welcome back/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Sign In$/i })).toBeVisible();

    for (const w of PHONE_WIDTHS) {
      await setViewport(page, w);
      await expectLoginPage(page);
      await expect(page.locator('img[alt="SRSB Associate"]')).toBeVisible();
      const overflow = await pageOverflowX(page);
      expect(overflow, `login overflow at ${w}px`).toBeLessThanOrEqual(1);
      await shot(page, `login-${w}`);
    }
  });

  test('login composition at tablet/desktop widths', async ({ page }) => {
    await page.goto('/');
    for (const w of TABLET_DESKTOP) {
      await setViewport(page, w);
      await expectLoginPage(page);
      await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0);

      if (w < 1024) {
        // Tablet still uses approved centered mobile login.
        await expect(page.locator('img[alt="SRSB Associate"]')).toBeVisible();
        await expect(
          page.getByRole('button', { name: /^Sign In$/i })
        ).toBeVisible();
      } else {
        // Desktop restores two-column Welcome hero + Sign in → form.
        await expect(page.locator('img[alt="SRSB"]')).toBeVisible();
        await expect(
          page.getByRole('heading', { name: /Welcome\s*back/i })
        ).toBeVisible();
        await expect(
          page.getByRole('button', { name: /^Sign in →$/i })
        ).toBeVisible();
      }

      const overflow = await pageOverflowX(page);
      expect(overflow, `login overflow at ${w}px`).toBeLessThanOrEqual(1);
      await shot(page, `login-${w}`);
    }
  });

  test('password visibility and invalid login still work', async ({ page }) => {
    await setViewport(page, 390);
    await page.goto('/');
    await expectLoginPage(page);
    await page.locator('#login-password').fill('secret');
    await page.getByRole('button', { name: /^Show$/i }).click();
    await expect(page.locator('#login-password')).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: /^Hide$/i }).click();
    await expect(page.locator('#login-password')).toHaveAttribute('type', 'password');

    await page.locator('#login-email').fill('e2e.tester@example.com');
    await page.locator('#login-password').fill('WrongPassword@NotValid1');
    await page.getByRole('button', { name: /^Sign In$/i }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await shot(page, 'login-390-invalid');
  });

  test('mobile shell: bottom nav, dashboard, more sheet', async ({ page }) => {
    test.setTimeout(60_000);
    await setViewport(page, 390);
    await loginAsE2eAdmin(page);
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
    await expect(page.getByText(/Business snapshot/i)).toBeVisible();
    await shot(page, 'dashboard-390');

    const overflowDash = await pageOverflowX(page);
    expect(overflowDash, 'dashboard overflow 390').toBeLessThanOrEqual(1);

    const bottomNav = page.getByRole('navigation', { name: 'Primary' });
    await bottomNav.getByRole('button', { name: 'IT Clients', exact: true }).click();
    await expect(page.getByPlaceholder(/Search clients/i)).toBeVisible({
      timeout: 15_000,
    });
    await shot(page, 'it-all-data-390');
    expect(await pageOverflowX(page), 'IT all-data overflow').toBeLessThanOrEqual(1);

    await bottomNav.getByRole('button', { name: 'GST', exact: true }).click();
    await expect(page.getByPlaceholder(/Search companies/i)).toBeVisible({
      timeout: 15_000,
    });
    await shot(page, 'gst-all-data-390');
    expect(await pageOverflowX(page), 'GST all-data overflow').toBeLessThanOrEqual(1);

    await bottomNav.getByRole('button', { name: 'More', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'More' })).toBeVisible();
    await shot(page, 'more-sheet-390');
    await page.getByRole('button', { name: 'Client Summary' }).click();
    await expect(
      page.locator('main').getByRole('heading', { name: 'Client Summary', exact: true })
    ).toBeVisible({ timeout: 15_000 });
    await shot(page, 'client-summary-390');
    expect(await pageOverflowX(page), 'client summary overflow').toBeLessThanOrEqual(
      1
    );

    await bottomNav.getByRole('button', { name: 'More', exact: true }).click();
    await page.getByRole('button', { name: 'Import / Export' }).click();
    const transfer = page.getByRole('dialog', { name: 'Import / Export' });
    await expect(transfer).toBeVisible({ timeout: 10_000 });
    await shot(page, 'import-export-390');
    await transfer.getByRole('button', { name: 'Close' }).click();
    await expect(transfer).toBeHidden({ timeout: 10_000 });
  });

  test('desktop shell: sidebar, no bottom nav, dashboard charts', async ({
    page,
  }) => {
    await setViewport(page, 1280, 900);
    await loginAsE2eAdmin(page);
    await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0);
    await expect(page.getByText(/money picture/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Log out/i })).toBeVisible();
    await shot(page, 'dashboard-1280');
    expect(await pageOverflowX(page), 'desktop dashboard overflow').toBeLessThanOrEqual(
      1
    );

    await goItAllData(page);
    await expect(page.getByRole('tab', { name: /Sheet View/i })).toBeVisible();
    await shot(page, 'it-all-data-1280');

    await page.getByRole('tab', { name: /Sheet View/i }).click();
    await expect(
      page.getByText(/spreadsheet layout is for desktop|Sheet View needs a desktop/i)
    ).toHaveCount(0);
    await shot(page, 'it-sheet-1280');

    await setViewport(page, 1440, 900);
    await shot(page, 'dashboard-1440');
    expect(await pageOverflowX(page), '1440 overflow').toBeLessThanOrEqual(1);
  });

  test('768 and 1024 breakpoints smoke', async ({ page }) => {
    await loginAsE2eAdmin(page);

    await setViewport(page, 768);
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
    await shot(page, 'dashboard-768');
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1);

    await setViewport(page, 1024, 900);
    // Tailwind lg = 1024px min-width → desktop shell
    await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0);
    await expect(page.getByText(/money picture/i)).toBeVisible();
    await shot(page, 'dashboard-1024');
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1);
  });
});
