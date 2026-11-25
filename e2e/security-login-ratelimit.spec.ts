import { test, expect, type APIRequestContext } from '@playwright/test';
import { E2E_EMAIL, E2E_PASSWORD, loginAsE2eAdmin, logout } from './helpers/auth';
import { apiLogin } from './helpers/security';

/** E2E server uses LOGIN_RATE_*_MAX=5 and LOGIN_RATE_WINDOW_MS=3000. */
const E2E_LOGIN_MAX = 5;
const E2E_LOGIN_WINDOW_MS = 3000;

/** TEST-NET addresses — keep login bursts off the default loopback bucket. */
const IP_BAD_PW = '198.51.100.10';
const IP_EXHAUST = '198.51.100.50';
const IP_WINDOW = '198.51.100.60';
const IP_FORGOT = '198.51.100.70';
const IP_ENUM = '198.51.100.80';

async function loginAttempt(
  request: APIRequestContext,
  opts: {
    email: string;
    password: string;
    forwardedFor: string;
  }
) {
  return request.post('/api/auth/login', {
    data: { email: opts.email, password: opts.password },
    headers: { 'X-Forwarded-For': opts.forwardedFor },
  });
}

test.describe('Stage 7B — login rate limiting', () => {
  test.describe.configure({ mode: 'serial' });

  test('1 — normal successful login unaffected', async ({ page }) => {
    const { res, data } = await apiLogin(page.request);
    expect(res.ok()).toBeTruthy();
    expect(data.ok).toBeTruthy();
    expect(data.email).toBe(E2E_EMAIL);
    await page.request.post('/api/auth/logout');
  });

  test('2 — incorrect password returns generic 401', async ({ page }) => {
    const res = await loginAttempt(page.request, {
      email: E2E_EMAIL,
      password: 'WrongPassword@NotValid99',
      forwardedFor: IP_BAD_PW,
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(String(body.error)).toBe('Invalid email or password.');
    expect(JSON.stringify(body)).not.toMatch(/WrongPassword/i);
  });

  test('3/4 — rate limit reached; further requests are 429 with retry hint', async ({
    page,
  }) => {
    const email = 'ratelimit-victim@example.invalid';
    let saw429 = false;
    let last429: { error?: string; retryAfterSec?: number } | null = null;

    for (let i = 0; i < E2E_LOGIN_MAX + 3; i++) {
      const res = await loginAttempt(page.request, {
        email,
        password: `Wrong${i}!`,
        forwardedFor: IP_EXHAUST,
      });
      if (res.status() === 429) {
        saw429 = true;
        last429 = await res.json();
        const retryHeader = res.headers()['retry-after'];
        expect(retryHeader).toBeTruthy();
        expect(Number(last429.retryAfterSec)).toBeGreaterThan(0);
        expect(String(last429.error || '')).toMatch(/too many login attempts/i);
        break;
      }
      expect(res.status()).toBe(401);
    }

    expect(saw429).toBeTruthy();

    // 4 — requests after the limit
    const after = await loginAttempt(page.request, {
      email,
      password: 'StillWrong!',
      forwardedFor: IP_EXHAUST,
    });
    expect(after.status()).toBe(429);
  });

  test('5 — retry succeeds after the limit window expires', async ({ page }) => {
    const email = 'window-expire@example.invalid';
    for (let i = 0; i < E2E_LOGIN_MAX; i++) {
      const res = await loginAttempt(page.request, {
        email,
        password: `Bad${i}`,
        forwardedFor: IP_WINDOW,
      });
      expect([401, 429]).toContain(res.status());
    }
    const blocked = await loginAttempt(page.request, {
      email,
      password: 'BadX',
      forwardedFor: IP_WINDOW,
    });
    expect(blocked.status()).toBe(429);

    await page.waitForTimeout(E2E_LOGIN_WINDOW_MS + 800);

    const afterWindow = await loginAttempt(page.request, {
      email,
      password: 'BadAfterWindow',
      forwardedFor: IP_WINDOW,
    });
    // Window expired → failed auth is 401 again (not stuck at 429)
    expect(afterWindow.status()).toBe(401);
  });

  test('6 — different IP addresses have independent IP budgets', async ({ page }) => {
    const ipLeft = '198.51.100.12';
    const ipRight = '198.51.100.13';
    const emailLeft = 'ip-left@example.invalid';
    const emailRight = 'ip-right@example.invalid';

    for (let i = 0; i < E2E_LOGIN_MAX; i++) {
      const res = await loginAttempt(page.request, {
        email: emailLeft,
        password: `A${i}`,
        forwardedFor: ipLeft,
      });
      expect(res.status()).toBe(401);
    }
    const aBlocked = await loginAttempt(page.request, {
      email: emailLeft,
      password: 'Ablock',
      forwardedFor: ipLeft,
    });
    expect(aBlocked.status()).toBe(429);

    // Different IP + different account → still 401 (independent budgets)
    const bOk = await loginAttempt(page.request, {
      email: emailRight,
      password: 'Whatever1',
      forwardedFor: ipRight,
    });
    expect(bOk.status()).toBe(401);
  });

  test('7 — different account identifiers have independent account budgets', async ({
    page,
  }) => {
    const email1 = 'acct-one@example.invalid';
    const email2 = 'acct-two@example.invalid';

    for (let i = 0; i < E2E_LOGIN_MAX; i++) {
      const res = await loginAttempt(page.request, {
        email: email1,
        password: `x${i}`,
        // Unique IP per attempt so only the account key exhausts
        forwardedFor: `198.51.100.${100 + i}`,
      });
      expect(res.status()).toBe(401);
    }
    const blocked = await loginAttempt(page.request, {
      email: email1,
      password: 'more',
      forwardedFor: '198.51.100.120',
    });
    expect(blocked.status()).toBe(429);

    // Different account still allowed from a fresh IP
    const res2 = await loginAttempt(page.request, {
      email: email2,
      password: 'fresh',
      forwardedFor: '198.51.100.121',
    });
    expect(res2.status()).toBe(401);
  });

  test('8 — generic errors; no account enumeration', async ({ page }) => {
    const unknown = await loginAttempt(page.request, {
      email: 'nobody-not-real@example.invalid',
      password: 'AnyPassword1!',
      forwardedFor: IP_ENUM,
    });
    expect(unknown.status()).toBe(401);
    const unknownBody = await unknown.json();

    const knownBad = await loginAttempt(page.request, {
      email: E2E_EMAIL,
      password: 'DefinitelyWrongPass99!',
      forwardedFor: IP_ENUM,
    });
    expect(knownBad.status()).toBe(401);
    const knownBody = await knownBad.json();

    expect(String(unknownBody.error)).toBe('Invalid email or password.');
    expect(String(knownBody.error)).toBe(String(unknownBody.error));
    expect(JSON.stringify(unknownBody)).not.toMatch(/not found|no such|exist/i);
  });

  test('9 — existing forgot-password rate limit remains functional', async ({ page }) => {
    let saw429 = false;
    for (let i = 0; i < 8; i++) {
      const res = await page.request.post('/api/auth/forgot-password', {
        data: { email: E2E_EMAIL },
        headers: { 'X-Forwarded-For': IP_FORGOT },
      });
      if (res.status() === 429) {
        saw429 = true;
        const body = await res.json();
        expect(String(body.error || '')).toMatch(/too many/i);
        break;
      }
      expect(res.ok()).toBeTruthy();
    }
    expect(saw429).toBeTruthy();
  });

  test('10 — auth/session regression after rate-limit tests', async ({ page }) => {
    // Use clean loopback path (no exhausted TEST-NET IP)
    const { res, data } = await apiLogin(page.request);
    expect(res.ok()).toBeTruthy();
    expect(data.expiresInMs).toBe(12 * 60 * 60 * 1000);

    const me = await page.request.get('/api/auth/me');
    expect(me.ok()).toBeTruthy();

    await page.request.post('/api/auth/logout');
    const meAfter = await page.request.get('/api/auth/me');
    expect(meAfter.status()).toBe(401);

    await loginAsE2eAdmin(page);
    await logout(page);
  });
});
