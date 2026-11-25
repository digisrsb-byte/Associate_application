import { test, expect } from '@playwright/test';
import { loginAsE2eAdmin } from './helpers/auth';
import {
  createGstCompanyViaUi,
  createItClientViaUi,
  ensureItClientListed,
  fetchLedger,
  goGstAllData,
} from './helpers/clients';
import { nextSeq, syntheticName, syntheticPan, syntheticPhone } from './helpers/ids';

test.describe('Stage 2A — client creation', () => {
  test('creates dummy IT client and shows saved fields', async ({ page }) => {
    const n = nextSeq();
    const name = syntheticName('IT Client', n);
    const pan = syntheticPan(n);
    const phone = syntheticPhone(n);
    const referenceNumber = `REF-IT-${n}`;
    const remark = `Synthetic IT remark ${n}`;

    await loginAsE2eAdmin(page);
    await createItClientViaUi(page, { name, pan, phone, referenceNumber, remark });
    await ensureItClientListed(page, name, pan);
    await expect(page.getByText(phone).first()).toBeVisible();
    await expect(page.getByText(referenceNumber).first()).toBeVisible();

    const ledger = await fetchLedger(page.request);
    const saved = ledger.clients.find((c) => c.pan === pan);
    expect(saved).toBeTruthy();
    expect(saved?.name).toBe(name);
    expect(saved?.phone).toBe(phone);
    expect(saved?.referenceNumber).toBe(referenceNumber);
    expect(saved?.remark).toBe(remark);
  });

  test('creates dummy GST company and shows saved fields', async ({ page }) => {
    const n = nextSeq();
    const companyName = syntheticName('GST Co', n);
    const userId = `e2e.user.${n}@example.test`;
    const phone = syntheticPhone(n);
    const referenceNumber = `REF-GST-${n}`;
    const remark = `Synthetic GST remark ${n}`;

    await loginAsE2eAdmin(page);
    await createGstCompanyViaUi(page, {
      companyName,
      userId,
      phone,
      referenceNumber,
      remark,
    });
    await goGstAllData(page);
    await expect(page.getByText(companyName).first()).toBeVisible();
    await expect(page.getByText(userId).first()).toBeVisible();
    await expect(page.getByText(phone).first()).toBeVisible();

    const ledger = await fetchLedger(page.request);
    const saved = ledger.gstClients.find((c) => c.userId === userId);
    expect(saved).toBeTruthy();
    expect(saved?.companyName).toBe(companyName);
    expect(saved?.phone).toBe(phone);
    expect(saved?.referenceNumber).toBe(referenceNumber);
    expect(saved?.remark).toBe(remark);
  });
});
