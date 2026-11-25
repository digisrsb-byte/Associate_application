import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { E2E_EMAIL, E2E_PASSWORD } from './auth';

/** Extract Set-Cookie lines from a Playwright APIResponse. */
export function setCookiesFromResponse(res: {
  headersArray?: () => { name: string; value: string }[];
  headers: () => Record<string, string>;
}): string[] {
  if (typeof res.headersArray === 'function') {
    return res
      .headersArray()
      .filter((h) => h.name.toLowerCase() === 'set-cookie')
      .map((h) => h.value);
  }
  const h = res.headers();
  const sc = h['set-cookie'] || h['Set-Cookie'];
  return sc ? [sc] : [];
}

export function cookieFlags(setCookieLine: string) {
  const parts = setCookieLine.split(';').map((p) => p.trim());
  const flags = new Set(
    parts.slice(1).map((p) => p.split('=')[0].trim().toLowerCase())
  );
  return {
    nameValue: parts[0] || '',
    httpOnly: flags.has('httponly'),
    sameSiteLax:
      [...flags].some((f) => f === 'samesite') && /samesite=lax/i.test(setCookieLine),
    secure: flags.has('secure'),
    maxAge: (setCookieLine.match(/Max-Age=(\d+)/i) || [])[1] || null,
  };
}

export async function apiLogin(
  request: APIRequestContext,
  email = E2E_EMAIL,
  password = E2E_PASSWORD
) {
  const res = await request.post('/api/auth/login', {
    data: { email, password },
  });
  const data = await res.json();
  return { res, data };
}

export async function loginAndGetCookieHeader(page: Page) {
  const res = await page.request.post('/api/auth/login', {
    data: { email: E2E_EMAIL, password: E2E_PASSWORD },
  });
  expect(res.ok()).toBeTruthy();
  const cookies = setCookiesFromResponse(res);
  const line = cookies.find((c) => c.startsWith('tl_session=')) || '';
  expect(line).toBeTruthy();
  return line.split(';')[0];
}

export function e2eDataPaths() {
  // Resolved relative to Playwright cwd (app root)
  return {
    dataDir: 'data-e2e',
    ledger: 'data-e2e/ledger.json',
    auth: 'data-e2e/auth.json',
    backups: 'data-e2e/backups',
    resetToken: 'data-e2e/PASSWORD_RESET_TOKEN.txt',
  };
}
