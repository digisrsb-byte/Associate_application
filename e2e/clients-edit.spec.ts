import { test, expect } from '@playwright/test';
import { loginAsE2eAdmin } from './helpers/auth';
import {
  createItClientViaUi,
  editItClientDetails,
  ensureItClientListed,
  fetchLedger,
  goItAllData,
} from './helpers/clients';
import { nextSeq, syntheticName, syntheticPan, syntheticPhone } from './helpers/ids';

test.describe('Stage 2B — client editing', () => {
  test('edits name and contact details; persists after refresh', async ({ page }) => {
    test.setTimeout(90_000);
    const n = nextSeq();
    const pan = syntheticPan(n);
    const originalName = syntheticName('EditOrig', n);
    const updatedName = syntheticName('EditNew', n);
    const originalPhone = syntheticPhone(n);
    const updatedPhone = syntheticPhone(n + 7);
    const updatedRemark = `Updated remark ${n}`;

    await loginAsE2eAdmin(page);
    await createItClientViaUi(page, {
      name: originalName,
      pan,
      phone: originalPhone,
      remark: 'before edit',
    });
    await ensureItClientListed(page, originalName, pan);

    await editItClientDetails(page, pan, {
      name: updatedName,
      phone: updatedPhone,
      remark: updatedRemark,
    });

    await goItAllData(page);
    await expect(page.getByText(updatedName).first()).toBeVisible();
    await expect(page.getByText(updatedPhone).first()).toBeVisible();
    await expect(page.getByText(originalName)).toHaveCount(0);

    const beforeReload = await fetchLedger(page.request);
    const mid = beforeReload.clients.find((c) => c.pan === pan);
    expect(mid?.name).toBe(updatedName);
    expect(mid?.phone).toBe(updatedPhone);
    expect(mid?.remark).toBe(updatedRemark);

    await page.reload();
    await goItAllData(page);
    await expect(page.getByText(updatedName).first()).toBeVisible();
    await expect(page.getByText(pan).first()).toBeVisible();
    await expect(page.getByText(updatedPhone).first()).toBeVisible();

    const afterReload = await fetchLedger(page.request);
    const saved = afterReload.clients.find((c) => c.pan === pan);
    expect(saved?.name).toBe(updatedName);
    expect(saved?.phone).toBe(updatedPhone);
    expect(saved?.remark).toBe(updatedRemark);
  });
});
