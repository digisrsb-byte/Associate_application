import { test, expect } from '@playwright/test';
import {
  E2E_EMAIL,
  expectAuthenticatedShell,
  expectLoginPage,
  loginAsE2eAdmin,
  logout,
} from './helpers/auth';

test.describe.configure({ mode: 'serial' });

test.describe('Stage 1 auth smoke (data-e2e only)', () => {
  test('application opens and login page renders', async ({ page }) => {
    const health = await page.request.get('/api/health');
    expect(health.ok()).toBeTruthy();

    await page.goto('/');
    await expectLoginPage(page);
    await expect(page.getByText(/^Associate$/i).first()).toBeVisible();
    // Compact logo alt: "SRSB Associate". Desktop hero logo alt: "SRSB".
    await expect(
      page.locator('img[alt="SRSB Associate"], img[alt="SRSB"]').first()
    ).toBeVisible();
  });

  test('invalid login is rejected', async ({ page }) => {
    await page.goto('/');
    await expectLoginPage(page);
    await page.locator('#login-email').fill(E2E_EMAIL);
    await page.locator('#login-password').fill('WrongPassword@NotValid1');
    await page.getByRole('button', { name: /Sign in/i }).click();
    await expect(page.getByRole('alert')).toContainText(/Invalid email or password/i);
    await expectLoginPage(page);
    await expect(page.getByText(/money picture/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Log out/i })).toHaveCount(0);
  });

  test('E2E admin can log in and dashboard loads', async ({ page }) => {
    await loginAsE2eAdmin(page);
    await expectAuthenticatedShell(page);
    await expect(
      page.getByRole('button', { name: /Add Client|Add client/i }).first()
    ).toBeVisible();
  });

  test('logout returns to login and clears session UI', async ({ page }) => {
    await loginAsE2eAdmin(page);
    await logout(page);
    await expect(page.getByText(/money picture/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Log out/i })).toHaveCount(0);
  });

  test('unauthenticated users cannot access protected ledger API', async ({
    page,
  }) => {
    await page.goto('/');
    await expectLoginPage(page);

    const ledger = await page.request.get('/api/ledger');
    expect(ledger.status()).toBe(401);

    const me = await page.request.get('/api/auth/me');
    expect(me.status()).toBe(401);

    await expect(page.getByText(/money picture/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Log out/i })).toHaveCount(0);
  });

  test('after logout, protected API stays unauthorized', async ({ page }) => {
    await loginAsE2eAdmin(page);
    await logout(page);

    const ledger = await page.request.get('/api/ledger');
    expect(ledger.status()).toBe(401);
    await expectLoginPage(page);
  });

  test('forgot / reset password UI is available; token field stays empty', async ({
    page,
  }) => {
    await page.goto('/');
    await expectLoginPage(page);

    await page.getByRole('button', { name: /Forgot password\?/i }).click();
    await expect(
      page.getByRole('heading', { name: 'Forgot password' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Send reset token/i })
    ).toBeVisible();

    await page.locator('#login-email').fill(E2E_EMAIL);
    await page.getByRole('button', { name: /Send reset token/i }).click();

    await expect(
      page.getByRole('heading', { name: 'Reset password' })
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#reset-token')).toBeVisible();
    await expect(page.locator('#reset-token')).toHaveValue('');
    await expect(page.locator('#new-password')).toBeVisible();
    await expect(page.locator('#confirm-password')).toBeVisible();

    // Token must not appear in the HTML from the forgot response
    const html = await page.content();
    expect(html).not.toMatch(/"token"\s*:/);
    expect(html).not.toMatch(/"resetToken"\s*:/);

    // Local token file must not be reachable as a static URL (explicit 404 deny)
    const leak = await page.request.get('/data/PASSWORD_RESET_TOKEN.txt');
    expect(leak.status()).toBe(404);

    await page.getByRole('button', { name: /Back to sign in/i }).click();
    await expectLoginPage(page);
  });
});
