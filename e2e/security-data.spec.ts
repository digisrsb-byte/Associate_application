import { test, expect } from '@playwright/test';
import { apiLogin } from './helpers/security';
import { E2E_EMAIL } from './helpers/auth';
import { nextSeq, syntheticName, syntheticPan, PORTAL_PASSWORD } from './helpers/ids';

test.describe('Stage 5D — data security / validation / leakage', () => {
  test('single-admin model: no multi-role endpoints; unauthorized blocked', async ({
    page,
  }) => {
    // No owner/admin role switch APIs exist — assert 404/401 on invented paths
    const invented = await page.request.get('/api/admin/users');
    expect([401, 404, 403]).toContain(invented.status());

    const ledger = await page.request.get('/api/ledger');
    expect(ledger.status()).toBe(401);
  });

  test('API rejects invalid PAN; duplicate; does not leak stack traces', async ({
    page,
  }) => {
    const { res } = await apiLogin(page.request);
    expect(res.ok()).toBeTruthy();

    const badPan = await page.request.post('/api/clients', {
      data: {
        name: syntheticName('BadPan', nextSeq()),
        pan: 'INVALIDPAN',
        password: PORTAL_PASSWORD,
        phone: '',
        referenceNumber: '',
        remark: '',
      },
    });
    expect(badPan.status()).toBe(400);
    const badBody = await badPan.json();
    expect(String(badBody.error || '')).toMatch(/PAN|format/i);
    expect(JSON.stringify(badBody)).not.toMatch(/at Object\.|stack|node_modules/i);

    const pan = syntheticPan(nextSeq());
    const name = syntheticName('DupSec', nextSeq());
    const ok = await page.request.post('/api/clients', {
      data: {
        name,
        pan,
        password: PORTAL_PASSWORD,
        phone: '',
        referenceNumber: '',
        remark: '',
      },
    });
    expect(ok.status()).toBe(201);
    const created = await ok.json();
    expect(created.client?.password).toBeUndefined();
    expect(created.client?.passwordEnc).toBeUndefined();

    const dup = await page.request.post('/api/clients', {
      data: {
        name: syntheticName('DupSec2', nextSeq()),
        pan,
        password: PORTAL_PASSWORD,
        phone: '',
        referenceNumber: '',
        remark: '',
      },
    });
    expect(dup.status()).toBe(409);

    // Forgot with wrong email — generic success (no enumeration of existence beyond message)
    const forgot = await page.request.post('/api/auth/forgot-password', {
      data: { email: 'nobody-not-real@example.invalid' },
    });
    expect(forgot.ok()).toBeTruthy();
    const msg = await forgot.json();
    expect(String(msg.message || '')).toMatch(/reset token has been issued/i);
    expect(JSON.stringify(msg)).not.toContain(E2E_EMAIL);
  });

  test('error responses do not include portal passwords or env secrets', async ({
    page,
  }) => {
    const boom = await page.request.post('/api/clients', {
      data: { name: '', pan: '', password: '' },
    });
    // May be 401 without auth or 400 with auth — either way
    const text = await boom.text();
    expect(text).not.toContain(PORTAL_PASSWORD);
    expect(text).not.toMatch(/PORTAL_PASSWORD_ENCRYPTION_KEY\s*=/);
    expect(text).not.toMatch(/passwordSalt|passwordHash/);
  });
});
