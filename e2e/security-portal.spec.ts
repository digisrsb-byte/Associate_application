import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { createItClientViaUi } from './helpers/clients';
import { findItClientInLedger } from './helpers/finance';
import { e2eDataPaths } from './helpers/security';
import { loginAsE2eAdmin } from './helpers/auth';
import { nextSeq, syntheticName, syntheticPan, PORTAL_PASSWORD } from './helpers/ids';

test.describe('Stage 5C — portal credential protection', () => {
  test('encrypted at rest; API strips secrets; reveal needs auth', async ({ page }) => {
    const n = nextSeq();
    const pan = syntheticPan(n);
    const name = syntheticName('SecPortal', n);

    await loginAsE2eAdmin(page);
    await createItClientViaUi(page, {
      name,
      pan,
      password: PORTAL_PASSWORD,
    });

    const apiClient = await findItClientInLedger(page.request, pan);
    expect((apiClient as { password?: string }).password).toBeUndefined();
    expect((apiClient as { passwordEnc?: string }).passwordEnc).toBeUndefined();
    expect((apiClient as { hasPortalPassword?: boolean }).hasPortalPassword).toBe(true);

    // On-disk data-e2e ledger must store ciphertext, not plaintext portal password
    const disk = JSON.parse(
      fs.readFileSync(path.resolve(e2eDataPaths().ledger), 'utf8')
    );
    const diskClient = disk.clients.find((c: { pan: string }) => c.pan === pan);
    expect(diskClient).toBeTruthy();
    expect(diskClient.passwordEnc || diskClient.password || '').toMatch(/^enc:v1:/);
    expect(JSON.stringify(diskClient)).not.toContain(PORTAL_PASSWORD);

    // Reveal without session
    await page.request.post('/api/auth/logout');
    const unauth = await page.request.post(
      `/api/clients/${apiClient.id}/reveal-portal-password`,
      { data: {} }
    );
    expect(unauth.status()).toBe(401);

    // Reveal with session
    await loginAsE2eAdmin(page);
    const reveal = await page.request.post(
      `/api/clients/${apiClient.id}/reveal-portal-password`,
      { data: {} }
    );
    expect(reveal.ok()).toBeTruthy();
    const revealed = await reveal.json();
    expect(revealed.password).toBe(PORTAL_PASSWORD);
    // Response should not include encryption key material
    expect(JSON.stringify(revealed)).not.toMatch(/PORTAL_PASSWORD_ENCRYPTION/);
  });
});
