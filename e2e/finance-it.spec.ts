import { test, expect } from '@playwright/test';
import { loginAsE2eAdmin } from './helpers/auth';
import { createItClientViaUi, goItAllData } from './helpers/clients';
import {
  createItClientWithFilingViaUi,
  findItClientInLedger,
  openItFilingEditor,
  saveItFilingInQuickModal,
  saveItFilingViaApi,
} from './helpers/finance';
import {
  coerceMoneyInput,
  expectDisplayAmount,
  expectItBalance,
} from './helpers/financeExpected';
import { nextSeq, syntheticName, syntheticPan } from './helpers/ids';

const AY = 'AY 2026-27';

test.describe('Stage 3 — IT financial calculations', () => {
  test('A/F/G/I — create filing, full pay, partial pay, outstanding', async ({
    page,
  }) => {
    const n = nextSeq();
    const pan = syntheticPan(n);
    const name = syntheticName('FinIT', n);
    const fees = 10000;
    const partial = 4000;
    const expectedPartialBal = expectItBalance(fees, partial);
    const expectedFullBal = expectItBalance(fees, fees);

    await loginAsE2eAdmin(page);
    await createItClientWithFilingViaUi(page, {
      name,
      pan,
      fees,
      received: partial,
    });

    let client = await findItClientInLedger(page.request, pan);
    // Find any filing year created (modal uses last available year)
    const years = Object.keys(client.filings);
    expect(years.length).toBeGreaterThan(0);
    const year = years[years.length - 1];
    const filing = client.filings[year];
    expect(filing.fees).toBe(fees);
    expect(filing.received).toBe(partial);
    expect(filing.balance).toBe(expectedPartialBal);

    await goItAllData(page);
    await expect(page.getByText(`₹${expectDisplayAmount(partial)}`).first()).toBeVisible();
    await expect(
      page.getByText(`₹${expectDisplayAmount(expectedPartialBal)}`).first()
    ).toBeVisible();

    // Full payment via inline Received (or More… modal fallback)
    await page
      .locator('tr')
      .filter({ hasText: pan })
      .getByLabel(/Expand filing years/i)
      .click();
    const yearRow = page.locator('tr').filter({ hasText: year }).first();
    const recdInput = yearRow.getByLabel(new RegExp(`${year} received`, 'i'));
    if (await recdInput.isVisible().catch(() => false)) {
      await yearRow.getByLabel(new RegExp(`${year} fees`, 'i')).fill(String(fees));
      await recdInput.fill(String(fees));
      await yearRow.getByRole('button', { name: /^Save$/i }).click();
      await expect(yearRow.getByRole('button', { name: /^Save$/i })).toHaveCount(0, {
        timeout: 15_000,
      });
    } else {
      await yearRow.getByRole('button', { name: /^(Pay|Edit)$/i }).click();
      await saveItFilingInQuickModal(page, {
        fees,
        received: fees,
        paymentType: 'UPI',
        paymentReceiveDate: '2026-04-15',
      });
    }

    client = await findItClientInLedger(page.request, pan);
    expect(client.filings[year].received).toBe(fees);
    expect(client.filings[year].balance).toBe(expectedFullBal);
  });

  test('H/J/K/P — cumulative multiple payments, edit recalc, payment meta, refresh', async ({
    page,
  }) => {
    const n = nextSeq();
    const pan = syntheticPan(n);
    const name = syntheticName('FinPay', n);
    const fees = 15000;

    await loginAsE2eAdmin(page);
    await createItClientViaUi(page, { name, pan });
    let client = await findItClientInLedger(page.request, pan);

    // Payment 1 (partial)
    await saveItFilingViaApi(page.request, client.id, {
      assessmentYear: AY,
      fees,
      received: 2000,
      balance: expectItBalance(fees, 2000),
      paymentType: 'GPay',
      paymentReceiveDate: '2026-01-10',
    });

    // Payment 2 — cumulative overwrite (no payment ledger exists)
    await saveItFilingViaApi(page.request, client.id, {
      assessmentYear: AY,
      fees,
      received: 7500,
      balance: expectItBalance(fees, 7500),
      paymentType: 'PhonePe',
      paymentReceiveDate: '2026-02-20',
    });

    client = await findItClientInLedger(page.request, pan);
    expect(client.filings[AY].received).toBe(7500);
    expect(client.filings[AY].balance).toBe(expectItBalance(fees, 7500));
    expect(client.filings[AY].paymentType).toBe('PhonePe');
    expect(client.filings[AY].paymentReceiveDate).toBe('2026-02-20');

    // Edit fees upward → outstanding recalculates
    const newFees = 20000;
    await saveItFilingViaApi(page.request, client.id, {
      assessmentYear: AY,
      fees: newFees,
      received: 7500,
      balance: expectItBalance(newFees, 7500),
      paymentType: 'PhonePe',
      paymentReceiveDate: '2026-02-20',
    });

    client = await findItClientInLedger(page.request, pan);
    expect(client.filings[AY].balance).toBe(expectItBalance(newFees, 7500));

    await page.reload();
    await goItAllData(page);
    const row = page.locator('tr').filter({ hasText: pan });
    await expect(row.getByText(`₹${expectDisplayAmount(7500)}`).first()).toBeVisible();
    await expect(
      row.getByText(`₹${expectDisplayAmount(expectItBalance(newFees, 7500))}`).first()
    ).toBeVisible();
  });

  test('L/M/N/O/Q — zero, negative clamp, decimals, large amounts, invalid balance trust', async ({
    page,
  }) => {
    const n = nextSeq();
    const pan = syntheticPan(n);
    await loginAsE2eAdmin(page);
    await createItClientViaUi(page, {
      name: syntheticName('FinEdge', n),
      pan,
    });
    const client = await findItClientInLedger(page.request, pan);

    // Zero amounts
    await saveItFilingViaApi(page.request, client.id, {
      assessmentYear: 'AY 2025-26',
      fees: 0,
      received: 0,
      balance: expectItBalance(0, 0),
    });
    let c = await findItClientInLedger(page.request, pan);
    expect(c.filings['AY 2025-26'].fees).toBe(0);
    expect(c.filings['AY 2025-26'].balance).toBe(0);

    // Negatives coerced to 0 (not rejected with 4xx)
    const negRes = await page.request.post(`/api/clients/${client.id}/filings`, {
      data: {
        assessmentYear: 'AY 2024-25',
        fees: -500,
        received: -100,
        balance: -50,
        paymentType: 'Cash',
        paymentReceiveDate: '',
        filingDate: '',
      },
    });
    expect(negRes.ok()).toBeTruthy();
    c = await findItClientInLedger(page.request, pan);
    expect(c.filings['AY 2024-25'].fees).toBe(coerceMoneyInput(-500));
    expect(c.filings['AY 2024-25'].received).toBe(0);
    expect(c.filings['AY 2024-25'].balance).toBe(0);

    // Decimals stored; display uses 0 fraction digits
    const fees = 100.6;
    const received = 10.4;
    const bal = expectItBalance(fees, received);
    await saveItFilingViaApi(page.request, client.id, {
      assessmentYear: AY,
      fees,
      received,
      balance: bal,
    });
    c = await findItClientInLedger(page.request, pan);
    expect(c.filings[AY].fees).toBe(fees);
    expect(c.filings[AY].received).toBe(received);
    expect(c.filings[AY].balance).toBeCloseTo(bal, 10);
    expect(expectDisplayAmount(bal)).toBe(
      new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(bal)
    );

    // Large amount within Number range
    const large = 99_999_999;
    await saveItFilingViaApi(page.request, client.id, {
      assessmentYear: 'AY 2023-24',
      fees: large,
      received: 1,
      balance: expectItBalance(large, 1),
    });
    c = await findItClientInLedger(page.request, pan);
    expect(c.filings['AY 2023-24'].fees).toBe(large);
    expect(c.filings['AY 2023-24'].balance).toBe(expectItBalance(large, 1));

    // Server ignores client-supplied balance; always max(0, fees - received)
    await saveItFilingViaApi(page.request, client.id, {
      assessmentYear: 'AY 2022-23',
      fees: 1000,
      received: 0,
      balance: 9999,
    });
    c = await findItClientInLedger(page.request, pan);
    expect(c.filings['AY 2022-23'].balance).toBe(expectItBalance(1000, 0));
  });

  test('UI quick modal live balance matches independent expectation', async ({ page }) => {
    const n = nextSeq();
    const pan = syntheticPan(n);
    const fees = 8000;
    const received = 2500;
    await loginAsE2eAdmin(page);
    await createItClientViaUi(page, { name: syntheticName('FinUi', n), pan });
    const client = await findItClientInLedger(page.request, pan);
    await saveItFilingViaApi(page.request, client.id, {
      assessmentYear: AY,
      fees: 1,
      received: 0,
      balance: 1,
    });
    // API writes bypass React state — reload before UI edit
    await page.reload();

    await openItFilingEditor(page, pan, AY);
    const dialog = page.getByRole('dialog').filter({ hasText: /Fees \(₹\)/i });
    await dialog.getByPlaceholder('10000').fill(String(fees));
    await dialog.getByPlaceholder('9000').fill(String(received));
    await expect(
      dialog.getByText(`₹${expectDisplayAmount(expectItBalance(fees, received))}`)
    ).toBeVisible();
    await dialog.getByRole('button', { name: /^Save$/i }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    const saved = await findItClientInLedger(page.request, pan);
    expect(saved.filings[AY].balance).toBe(expectItBalance(fees, received));
  });
});
