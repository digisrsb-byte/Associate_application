import { expect, type Page } from '@playwright/test';

export const E2E_EMAIL = process.env.E2E_EMAIL || 'e2e.tester@example.com';
export const E2E_PASSWORD = process.env.E2E_PASSWORD || 'E2eTest@Pass123!';

/** Mobile CTA: "Sign In". Desktop CTA: "Sign in →". */
const SIGN_IN_BUTTON = /^Sign in( →)?$/i;

export async function expectLoginPage(page: Page) {
  // Compact (<1024): centered "Welcome back" + Sign In.
  // Desktop (>=1024): two-column hero + form "Sign in" heading + Sign in →.
  // Desktop hero "Welcome back." + form "Sign in" both match — use .first().
  await expect(
    page
      .getByRole('heading', {
        name: /Welcome back|Sign in|Forgot password|First-time setup|Reset password/i,
      })
      .first()
  ).toBeVisible();
  await expect(page.locator('#login-email')).toBeVisible();
  await expect(page.locator('#login-password')).toBeVisible();
  await expect(page.getByRole('button', { name: SIGN_IN_BUTTON })).toBeVisible();
  await expect(page.getByText(/^Associate$/i).first()).toBeVisible();
}

export async function expectAuthenticatedShell(page: Page) {
  // Desktop dashboard still uses "money picture"; compact uses "Business snapshot".
  await expect(
    page
      .getByText(/money picture/i)
      .or(page.getByText(/Business snapshot/i))
      .or(page.getByText('TaxLedger Dashboard'))
  ).toBeVisible({ timeout: 20_000 });

  // Desktop: sidebar logout + email. Compact: bottom nav (logout lives under More).
  const desktopChrome = page.getByRole('button', { name: /Log out/i });
  const mobileChrome = page.getByRole('navigation', { name: 'Primary' });
  await expect(desktopChrome.or(mobileChrome)).toBeVisible({ timeout: 20_000 });

  if (await desktopChrome.isVisible().catch(() => false)) {
    await expect(page.getByText(E2E_EMAIL)).toBeVisible();
  }
}

export async function loginAsE2eAdmin(page: Page) {
  await page.goto('/');
  await expectLoginPage(page);
  await page.locator('#login-email').fill(E2E_EMAIL);
  await page.locator('#login-password').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: SIGN_IN_BUTTON }).click();
  await expectAuthenticatedShell(page);
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: /Log out/i }).click();
  await expectLoginPage(page);
}
