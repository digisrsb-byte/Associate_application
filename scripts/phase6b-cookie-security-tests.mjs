/**
 * Phase 6B — session cookie Secure flag tests.
 * Does not print secrets. Requires running server on 127.0.0.1:3000 with COOKIE_SECURE=auto (default).
 * Also probes COOKIE_SECURE via a second expectation: production-like header check uses a child note —
 * for true Secure emission we restart is out of band; this script tests the live process env.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const BASE = process.env.QA_BASE || 'http://127.0.0.1:3000';
const EMAIL = process.env.QA_EMAIL || '';
const PASSWORD = process.env.QA_PASSWORD || '';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'PHASE6B_COOKIE_SECURITY_TEST_RESULTS.json');

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? `: ${detail}` : ''}`);
}

function parseSetCookie(headers) {
  const raw = headers.getSetCookie?.() || [];
  if (raw.length) return raw;
  const single = headers.get('set-cookie');
  return single ? [single] : [];
}

function cookieFlags(setCookieLine) {
  const parts = setCookieLine.split(';').map((p) => p.trim());
  const nameValue = parts[0] || '';
  const flags = new Set(
    parts.slice(1).map((p) => p.split('=')[0].trim().toLowerCase())
  );
  return {
    nameValue,
    httpOnly: flags.has('httponly'),
    sameSiteLax: [...flags].some((f) => f === 'samesite') && /samesite=lax/i.test(setCookieLine),
    secure: flags.has('secure'),
    maxAge: (setCookieLine.match(/Max-Age=(\d+)/i) || [])[1] || null,
  };
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    record('QA credentials present', false, 'Set QA_EMAIL and QA_PASSWORD in env (not printed)');
    fs.writeFileSync(OUT, JSON.stringify({ ok: false, results }, null, 2));
    process.exit(1);
  }

  // Unauthenticated health
  const health = await fetch(`${BASE}/api/health`);
  record('Health reachable', health.ok, `status=${health.status}`);

  // Login
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const loginCookies = parseSetCookie(loginRes.headers);
  const loginJson = await loginRes.json().catch(() => ({}));
  const sessionLine = loginCookies.find((c) => c.startsWith('tl_session=')) || '';
  const flags = cookieFlags(sessionLine);
  record('Login succeeds', loginRes.ok && loginJson.ok === true, `status=${loginRes.status}`);
  record('Set-Cookie HttpOnly', flags.httpOnly);
  record('Set-Cookie SameSite=Lax', flags.sameSiteLax);
  // Local HTTP UAT (auto/false): Secure must be absent
  const expectSecure = process.env.EXPECT_COOKIE_SECURE === '1';
  if (expectSecure) {
    record('Set-Cookie Secure present (production-like)', flags.secure);
  } else {
    record('Set-Cookie Secure absent (local HTTP UAT)', !flags.secure);
  }

  const cookieHeader = sessionLine.split(';')[0];
  // Session persistence via /me
  const meRes = await fetch(`${BASE}/api/auth/me`, {
    headers: { Cookie: cookieHeader },
  });
  const meJson = await meRes.json().catch(() => ({}));
  record('Session persistence (/api/auth/me)', meRes.ok && meJson.authenticated === true);

  // Spoofed forwarded proto must not break local cookie mode when TRUST_PROXY unset
  const spoofLogin = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-Proto': 'https',
    },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const spoofCookies = parseSetCookie(spoofLogin.headers);
  const spoofLine = spoofCookies.find((c) => c.startsWith('tl_session=')) || '';
  const spoofFlags = cookieFlags(spoofLine);
  if (!expectSecure) {
    record(
      'Spoofed X-Forwarded-Proto does not force Secure (TRUST_PROXY off)',
      !spoofFlags.secure
    );
  } else {
    record('Production-like Secure still set', spoofFlags.secure);
  }

  // Logout clears cookie
  const logoutRes = await fetch(`${BASE}/api/auth/logout`, {
    method: 'POST',
    headers: { Cookie: cookieHeader },
  });
  const logoutCookies = parseSetCookie(logoutRes.headers);
  const clearLine = logoutCookies.find((c) => c.startsWith('tl_session=')) || '';
  const clearFlags = cookieFlags(clearLine);
  record('Logout ok', logoutRes.ok);
  record('Logout clears Max-Age=0', clearFlags.maxAge === '0');
  if (expectSecure) {
    record('Logout clear cookie keeps Secure', clearFlags.secure);
  } else {
    record('Logout clear cookie Secure absent (local)', !clearFlags.secure);
  }

  // Session invalid after logout
  const meAfter = await fetch(`${BASE}/api/auth/me`, {
    headers: { Cookie: cookieHeader },
  });
  record('Session invalid after logout', meAfter.status === 401);

  // Password reset flow smoke (forgot → read token file → reset with strong temp → restore)
  const forgot = await fetch(`${BASE}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL }),
  });
  const forgotJson = await forgot.json().catch(() => ({}));
  record('Forgot-password ok (no token in body)', forgot.ok && !('token' in forgotJson));

  const tokenFile = path.join(ROOT, 'data', 'PASSWORD_RESET_TOKEN.txt');
  let resetToken = '';
  if (fs.existsSync(tokenFile)) {
    const text = fs.readFileSync(tokenFile, 'utf8');
    const m = text.match(/Token:\s*(\S+)/i) || text.match(/([A-Za-z0-9_-]{20,})/);
    resetToken = m ? m[1] : '';
  }
  record('Local reset token file readable', !!resetToken, resetToken ? 'present' : 'missing');

  const tempPassword = 'Phase6bTemp!Reset9x';
  const resetRes = await fetch(`${BASE}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: EMAIL,
      token: resetToken,
      newPassword: tempPassword,
      confirmPassword: tempPassword,
    }),
  });
  record('Password reset with token', resetRes.ok, `status=${resetRes.status}`);

  // Restore original password via another reset if first succeeded
  if (resetRes.ok) {
    const forgot2 = await fetch(`${BASE}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL }),
    });
    record('Forgot for restore', forgot2.ok);
    let token2 = '';
    if (fs.existsSync(tokenFile)) {
      const text = fs.readFileSync(tokenFile, 'utf8');
      const m = text.match(/Token:\s*(\S+)/i) || text.match(/([A-Za-z0-9_-]{20,})/);
      token2 = m ? m[1] : '';
    }
    const restore = await fetch(`${BASE}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: EMAIL,
        token: token2,
        newPassword: PASSWORD,
        confirmPassword: PASSWORD,
      }),
    });
    record('Restore original admin password', restore.ok, `status=${restore.status}`);

    const relogin = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    record('Re-login with restored password', relogin.ok);
  }

  const ok = results.every((r) => r.ok);
  const report = {
    ok,
    base: BASE,
    expectSecure,
    cookieSecureMode: process.env.COOKIE_SECURE || 'auto (server env)',
    results,
    at: new Date().toISOString(),
  };
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(ok ? 'ALL PASS' : 'SOME FAILURES');
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('phase6b failed:', err.message);
  process.exit(1);
});
