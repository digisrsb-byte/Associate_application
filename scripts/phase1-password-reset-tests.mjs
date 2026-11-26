/**
 * Phase 1 – Password reset security tests (local API).
 * Does not print reset tokens or passwords to stdout.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BASE = process.env.TEST_BASE || 'http://127.0.0.1:3000';
const ADMIN_EMAIL = process.env.QA_EMAIL || 'admin@srsbassociate.com';
/** Strong password used for reset/restore under Phase 4 policy (12+ mixed). */
const STRONG_UAT_PASS = process.env.QA_PASSWORD_STRONG || 'SecureUat!Ledger2026';
const TOKEN_FILE = path.join(ROOT, 'data', 'PASSWORD_RESET_TOKEN.txt');
const AUTH_FILE = path.join(ROOT, 'data', 'auth.json');

const results = [];

function record(name, pass, detail = '') {
  results.push({ name, pass, detail });
  const mark = pass ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
}

async function jsonFetch(urlPath, options = {}) {
  const res = await fetch(`${BASE}${urlPath}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { _raw: text.slice(0, 200) };
  }
  return { res, data };
}

function readTokenFromFile() {
  if (!fs.existsSync(TOKEN_FILE)) return null;
  const body = fs.readFileSync(TOKEN_FILE, 'utf-8');
  const lines = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  // Last non-empty line that is not a header sentence
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (
      line.length >= 20 &&
      !line.includes(' ') &&
      !line.toLowerCase().includes('token') &&
      !line.toLowerCase().includes('expire')
    ) {
      return line;
    }
  }
  // Fallback: find longest line without spaces
  const candidates = lines.filter((l) => !l.includes(' ') && l.length >= 20);
  return candidates[candidates.length - 1] || null;
}

function authHasReset() {
  if (!fs.existsSync(AUTH_FILE)) return false;
  const auth = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
  return !!(auth.passwordReset && auth.passwordReset.tokenHash);
}

async function main() {
  console.log(`Phase 1 password-reset tests → ${BASE}\n`);

  // Health
  {
    const { res } = await jsonFetch('/api/health');
    record('Server health', res.ok, `status=${res.status}`);
    if (!res.ok) {
      console.error('Server not reachable. Start the app first.');
      process.exit(1);
    }
  }

  // 1) Email-only reset must fail
  {
    const { res, data } = await jsonFetch('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        email: ADMIN_EMAIL,
        newPassword: 'ShouldNotWork1!',
        confirmPassword: 'ShouldNotWork1!',
      }),
    });
    const ok =
      res.status === 400 &&
      String(data.error || '').toLowerCase().includes('token');
    record(
      'Email-only reset rejected (requires token)',
      ok,
      `status=${res.status}`
    );
  }

  // 2) Forgot with unknown email — same generic message, no token file for unknown
  {
    if (fs.existsSync(TOKEN_FILE)) fs.unlinkSync(TOKEN_FILE);
    // Clear any pending reset by reading auth — leave as-is; unknown email should not write token
    const before = authHasReset();
    const { res, data } = await jsonFetch('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: 'nobody-does-not-exist@example.com' }),
    });
    const msg = String(data.message || '');
    const generic =
      res.ok &&
      msg.toLowerCase().includes('if an account exists') &&
      !JSON.stringify(data).toLowerCase().includes('tokenhash') &&
      !('token' in data);
    // Token file should not appear for unknown email (or may linger from prior — we deleted it)
    const noFile = !fs.existsSync(TOKEN_FILE);
    record(
      'Forgot unknown email: generic response, no enumeration',
      generic && noFile,
      `status=${res.status} file=${!noFile} resetWas=${before}`
    );
  }

  // 3) Forgot with valid email — issues token to local file only
  {
    if (fs.existsSync(TOKEN_FILE)) fs.unlinkSync(TOKEN_FILE);
    const { res, data } = await jsonFetch('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: ADMIN_EMAIL }),
    });
    const msg = String(data.message || '');
    const generic =
      res.ok && msg.toLowerCase().includes('if an account exists');
    const hasFile = fs.existsSync(TOKEN_FILE);
    const token = readTokenFromFile();
    const responseHasToken =
      'token' in data ||
      JSON.stringify(data).includes(token || '___none___');
    record(
      'Forgot known email: generic message + local token file',
      generic && hasFile && !!token && !responseHasToken,
      `status=${res.status} file=${hasFile} responseLeaksToken=${responseHasToken}`
    );
  }

  const issuedToken = readTokenFromFile();

  // 4) Wrong token rejected
  {
    const { res, data } = await jsonFetch('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        email: ADMIN_EMAIL,
        token: 'definitely-not-the-real-token-value-xxxxxx',
        newPassword: 'TempPass99!XxYy',
        confirmPassword: 'TempPass99!XxYy',
      }),
    });
    record(
      'Wrong token rejected',
      res.status === 401,
      `status=${res.status} err=${data.error ? 'yes' : 'no'}`
    );
  }

  // 5) Valid token resets password, invalidates token, clears file
  const NEW_PASS = 'Phase1Test@2026Xx';
  const PREV_PASS = process.env.QA_PASSWORD || 'Admin@123';
  {
    const { res } = await jsonFetch('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        email: ADMIN_EMAIL,
        token: issuedToken,
        newPassword: NEW_PASS,
        confirmPassword: NEW_PASS,
      }),
    });
    const cleared =
      !authHasReset() && !fs.existsSync(TOKEN_FILE);
    record(
      'Valid token resets password and invalidates token',
      res.ok && cleared,
      `status=${res.status} authResetCleared=${!authHasReset()} fileGone=${!fs.existsSync(TOKEN_FILE)}`
    );
  }

  // 6) Token reuse fails
  {
    const { res } = await jsonFetch('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        email: ADMIN_EMAIL,
        token: issuedToken,
        newPassword: 'AnotherPass99!Xx',
        confirmPassword: 'AnotherPass99!Xx',
      }),
    });
    record('Used token cannot be reused', res.status === 401, `status=${res.status}`);
  }

  // 7) Login with new password works
  {
    const { res, data } = await jsonFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: ADMIN_EMAIL, password: NEW_PASS }),
    });
    record('Login with new password', res.ok && data.ok === true, `status=${res.status}`);
  }

  // 8) Previous password fails
  {
    const { res } = await jsonFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: ADMIN_EMAIL, password: PREV_PASS }),
    });
    record('Previous password rejected', res.status === 401, `status=${res.status}`);
  }

  // 9) Restore a policy-compliant UAT password via another full reset cycle
  {
    const forgot = await jsonFetch('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: ADMIN_EMAIL }),
    });
    const restoreToken = readTokenFromFile();
    const reset = await jsonFetch('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        email: ADMIN_EMAIL,
        token: restoreToken,
        newPassword: STRONG_UAT_PASS,
        confirmPassword: STRONG_UAT_PASS,
      }),
    });
    const login = await jsonFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: ADMIN_EMAIL, password: STRONG_UAT_PASS }),
    });
    record(
      'Restore strong UAT admin password for continued testing',
      forgot.res.ok && reset.res.ok && login.res.ok,
      `forgot=${forgot.res.status} reset=${reset.res.status} login=${login.res.status}`
    );
  }

  // 10) Response bodies never include raw token field on forgot
  {
    const { data } = await jsonFetch('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: ADMIN_EMAIL }),
    });
    const keys = Object.keys(data).map((k) => k.toLowerCase());
    const leak =
      keys.includes('token') ||
      keys.includes('resettoken') ||
      keys.includes('rawtoken');
    record('Forgot response does not expose token field', !leak, `keys=${keys.join(',')}`);
    // Cleanup pending reset without logging token
    if (fs.existsSync(TOKEN_FILE)) {
      const t = readTokenFromFile();
      if (t) {
        await jsonFetch('/api/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({
            email: ADMIN_EMAIL,
            token: t,
            newPassword: STRONG_UAT_PASS,
            confirmPassword: STRONG_UAT_PASS,
          }),
        });
      }
    }
  }

  const failed = results.filter((r) => !r.pass).length;
  const out = {
    phase: 1,
    base: BASE,
    at: new Date().toISOString(),
    passed: results.length - failed,
    failed,
    total: results.length,
    results,
  };
  const outPath = path.join(ROOT, 'PHASE1_PASSWORD_RESET_TEST_RESULTS.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf-8');
  console.log(`\n${out.passed}/${out.total} passed. Wrote ${path.basename(outPath)}`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('Test runner error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
