import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  apiLogin,
  cookieFlags,
  e2eDataPaths,
  setCookiesFromResponse,
} from './helpers/security';
import { E2E_EMAIL, E2E_PASSWORD, loginAsE2eAdmin, logout } from './helpers/auth';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function readResetToken(): string | null {
  const p = path.resolve(e2eDataPaths().resetToken);
  if (!fs.existsSync(p)) return null;
  const lines = fs
    .readFileSync(p, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const candidates = lines.filter(
    (l) => l.length >= 20 && !l.includes(' ') && !/token|expire/i.test(l)
  );
  return candidates[candidates.length - 1] || null;
}

test.describe('Stage 5A — authentication and session security', () => {
  test('invalid login rejected; protected APIs require auth', async ({ page }) => {
    const bad = await page.request.post('/api/auth/login', {
      data: { email: E2E_EMAIL, password: 'WrongPassword@NotValid99' },
    });
    expect(bad.status()).toBe(401);
    const badBody = await bad.json();
    expect(String(badBody.error || '')).toMatch(/Invalid email or password/i);
    // No password echo
    expect(JSON.stringify(badBody)).not.toMatch(/WrongPassword/i);

    const ledger = await page.request.get('/api/ledger');
    expect(ledger.status()).toBe(401);
    const me = await page.request.get('/api/auth/me');
    expect(me.status()).toBe(401);
    const reveal = await page.request.post('/api/clients/x/reveal-portal-password', {
      data: {},
    });
    expect(reveal.status()).toBe(401);
  });

  test('login cookie flags + session TTL advertised; logout invalidates', async ({
    page,
  }) => {
    const { res, data } = await apiLogin(page.request);
    expect(res.ok()).toBeTruthy();
    expect(data.expiresInMs).toBe(SESSION_TTL_MS);
    expect(data.token).toBeUndefined();

    const cookies = setCookiesFromResponse(res);
    const line = cookies.find((c) => c.startsWith('tl_session=')) || '';
    const flags = cookieFlags(line);
    expect(flags.httpOnly).toBeTruthy();
    expect(flags.sameSiteLax).toBeTruthy();
    // E2E server uses COOKIE_SECURE=false / loopback → Secure absent
    expect(flags.secure).toBeFalsy();
    expect(Number(flags.maxAge)).toBe(Math.floor(SESSION_TTL_MS / 1000));

    const meOk = await page.request.get('/api/auth/me');
    expect(meOk.ok()).toBeTruthy();

    await page.request.post('/api/auth/logout');
    const meAfter = await page.request.get('/api/auth/me');
    expect(meAfter.status()).toBe(401);
    const ledgerAfter = await page.request.get('/api/ledger');
    expect(ledgerAfter.status()).toBe(401);
  });

  test('session fixation: login issues a fresh opaque session cookie', async ({
    page,
  }) => {
    const first = await apiLogin(page.request);
    expect(first.res.ok()).toBeTruthy();
    // Login JSON must not expose the raw session token (cookie-only auth).
    expect(first.data.token).toBeUndefined();

    const cookie1 =
      setCookiesFromResponse(first.res).find((c) => c.startsWith('tl_session=')) ||
      '';
    const value1 = cookie1.split(';')[0].replace(/^tl_session=/, '');
    expect(value1.length).toBeGreaterThanOrEqual(32);

    await page.request.post('/api/auth/logout');

    const second = await apiLogin(page.request);
    expect(second.res.ok()).toBeTruthy();
    expect(second.data.token).toBeUndefined();

    const cookie2 =
      setCookiesFromResponse(second.res).find((c) =>
        c.startsWith('tl_session=')
      ) || '';
    const value2 = cookie2.split(';')[0].replace(/^tl_session=/, '');
    expect(value2.length).toBeGreaterThanOrEqual(32);
    expect(value2).not.toBe(value1);
  });

  test('UI logout clears protected UI access', async ({ page }) => {
    await loginAsE2eAdmin(page);
    await logout(page);
    const ledger = await page.request.get('/api/ledger');
    expect(ledger.status()).toBe(401);
  });

  test('password reset: token not in HTTP body; invalid/expired-style reject; single-use; email-only fails', async ({
    page,
  }) => {
    // Email-only reset insufficient
    const noToken = await page.request.post('/api/auth/reset-password', {
      data: {
        email: E2E_EMAIL,
        newPassword: 'TempReset!Pass99',
        confirmPassword: 'TempReset!Pass99',
      },
    });
    expect(noToken.status()).toBe(400);

    const forgot = await page.request.post('/api/auth/forgot-password', {
      data: { email: E2E_EMAIL },
    });
    expect(forgot.ok()).toBeTruthy();
    const forgotBody = await forgot.json();
    // Must not return the raw token value as a field (message may mention "token")
    expect(forgotBody.token).toBeUndefined();
    expect(forgotBody.resetToken).toBeUndefined();
    expect(String(forgotBody.message || '')).toMatch(/reset token has been issued/i);
    expect(JSON.stringify(forgotBody)).not.toMatch(/PASSWORD_RESET_TOKEN/);

    const token = readResetToken();
    expect(token).toBeTruthy();

    // Invalid token rejected (does not consume the real token)
    const badToken = await page.request.post('/api/auth/reset-password', {
      data: {
        email: E2E_EMAIL,
        token: 'not-a-valid-reset-token-value-000',
        newPassword: 'TempReset!Pass99x',
        confirmPassword: 'TempReset!Pass99x',
      },
    });
    expect(badToken.status()).toBe(401);

    const newPass = 'TempReset!Pass99a';
    const reset1 = await page.request.post('/api/auth/reset-password', {
      data: {
        email: E2E_EMAIL,
        token,
        newPassword: newPass,
        confirmPassword: newPass,
      },
    });
    expect(reset1.ok()).toBeTruthy();

    // Single-use: replay fails
    const reset2 = await page.request.post('/api/auth/reset-password', {
      data: {
        email: E2E_EMAIL,
        token,
        newPassword: 'TempReset!Pass99b',
        confirmPassword: 'TempReset!Pass99b',
      },
    });
    expect(reset2.status()).toBe(401);

    // Restore E2E password for remaining suite (data-e2e only)
    const forgot2 = await page.request.post('/api/auth/forgot-password', {
      data: { email: E2E_EMAIL },
    });
    expect(forgot2.ok()).toBeTruthy();
    const token2 = readResetToken();
    expect(token2).toBeTruthy();
    const restore = await page.request.post('/api/auth/reset-password', {
      data: {
        email: E2E_EMAIL,
        token: token2,
        newPassword: E2E_PASSWORD,
        confirmPassword: E2E_PASSWORD,
      },
    });
    expect(restore.ok()).toBeTruthy();

    const loginBack = await apiLogin(page.request);
    expect(loginBack.res.ok()).toBeTruthy();
  });

  test('expired reset token rejected (data-e2e auth only)', async ({ page }) => {
    const forgot = await page.request.post('/api/auth/forgot-password', {
      data: { email: E2E_EMAIL },
    });
    expect(forgot.ok()).toBeTruthy();
    const token = readResetToken();
    expect(token).toBeTruthy();

    const authPath = path.resolve(e2eDataPaths().auth);
    const auth = JSON.parse(fs.readFileSync(authPath, 'utf8'));
    expect(auth.passwordReset?.tokenHash).toBeTruthy();
    auth.passwordReset.expiresAt = new Date(Date.now() - 60_000).toISOString();
    fs.writeFileSync(authPath, JSON.stringify(auth, null, 2));

    const reset = await page.request.post('/api/auth/reset-password', {
      data: {
        email: E2E_EMAIL,
        token,
        newPassword: 'ShouldNotApply!99',
        confirmPassword: 'ShouldNotApply!99',
      },
    });
    expect(reset.status()).toBe(401);

    // Clear expired reset state without changing password
    const auth2 = JSON.parse(fs.readFileSync(authPath, 'utf8'));
    auth2.passwordReset = null;
    fs.writeFileSync(authPath, JSON.stringify(auth2, null, 2));
  });
});
