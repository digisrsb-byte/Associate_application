import { test, expect } from '@playwright/test';
import { loginAsE2eAdmin } from './helpers/auth';
import { createItClientViaUi } from './helpers/clients';
import { findItClientInLedger, saveItFilingViaApi } from './helpers/finance';
import { expectItBalance } from './helpers/financeExpected';
import { nextSeq, syntheticName, syntheticPan } from './helpers/ids';

/**
 * Stage 7A — IT balance must be server-computed: max(0, fees - received).
 * Client-supplied balance is never authoritative.
 */
test.describe('Stage 7A — IT balance server recomputation', () => {
  test('rejects artificially low and high client balance; server calculates correctly', async ({
    page,
  }) => {
    const n = nextSeq();
    const pan = syntheticPan(n);
    await loginAsE2eAdmin(page);
    await createItClientViaUi(page, {
      name: syntheticName('BalTrust', n),
      pan,
    });
    const client = await findItClientInLedger(page.request, pan);
    const fees = 5000;
    const received = 1200;
    const correct = expectItBalance(fees, received);

    // 1 — artificially low balance ignored
    await saveItFilingViaApi(page.request, client.id, {
      assessmentYear: 'AY 2026-27',
      fees,
      received,
      balance: 1,
    });
    let c = await findItClientInLedger(page.request, pan);
    expect(c.filings['AY 2026-27'].balance).toBe(correct);
    expect(c.filings['AY 2026-27'].balance).not.toBe(1);

    // 2 — artificially high balance ignored
    await saveItFilingViaApi(page.request, client.id, {
      assessmentYear: 'AY 2026-27',
      fees,
      received,
      balance: 999_999,
    });
    c = await findItClientInLedger(page.request, pan);
    expect(c.filings['AY 2026-27'].balance).toBe(correct);
    expect(c.filings['AY 2026-27'].balance).not.toBe(999_999);

    // 3 — server calculates correct balance (omit would-be trust)
    expect(c.filings['AY 2026-27'].fees).toBe(fees);
    expect(c.filings['AY 2026-27'].received).toBe(received);
    expect(c.filings['AY 2026-27'].balance).toBe(Math.max(0, fees - received));
  });

  test('updating fees or received recalculates balance; zero and overpayment', async ({
    page,
  }) => {
    const n = nextSeq();
    const pan = syntheticPan(n);
    await loginAsE2eAdmin(page);
    await createItClientViaUi(page, {
      name: syntheticName('BalRecalc', n),
      pan,
    });
    const client = await findItClientInLedger(page.request, pan);
    const AY = 'AY 2025-26';

    await saveItFilingViaApi(page.request, client.id, {
      assessmentYear: AY,
      fees: 10_000,
      received: 2_000,
      balance: 0, // bogus — must be ignored
    });
    let c = await findItClientInLedger(page.request, pan);
    expect(c.filings[AY].balance).toBe(expectItBalance(10_000, 2_000));

    // 4 — updating fees recalculates
    await saveItFilingViaApi(page.request, client.id, {
      assessmentYear: AY,
      fees: 8_000,
      received: 2_000,
      balance: 12345,
    });
    c = await findItClientInLedger(page.request, pan);
    expect(c.filings[AY].balance).toBe(expectItBalance(8_000, 2_000));

    // 5 — updating received recalculates
    await saveItFilingViaApi(page.request, client.id, {
      assessmentYear: AY,
      fees: 8_000,
      received: 5_500,
      balance: 0,
    });
    c = await findItClientInLedger(page.request, pan);
    expect(c.filings[AY].balance).toBe(expectItBalance(8_000, 5_500));

    // 6a — zero case
    await saveItFilingViaApi(page.request, client.id, {
      assessmentYear: 'AY 2024-25',
      fees: 0,
      received: 0,
      balance: 50,
    });
    c = await findItClientInLedger(page.request, pan);
    expect(c.filings['AY 2024-25'].balance).toBe(0);

    // 6b — overpayment → balance 0 (not negative)
    await saveItFilingViaApi(page.request, client.id, {
      assessmentYear: 'AY 2023-24',
      fees: 1000,
      received: 2500,
      balance: -100,
    });
    c = await findItClientInLedger(page.request, pan);
    expect(c.filings['AY 2023-24'].fees).toBe(1000);
    expect(c.filings['AY 2023-24'].received).toBe(2500);
    expect(c.filings['AY 2023-24'].balance).toBe(0);
  });

  test('existing IT record shape remains compatible; unrelated fields preserved', async ({
    page,
  }) => {
    const n = nextSeq();
    const pan = syntheticPan(n);
    await loginAsE2eAdmin(page);
    await createItClientViaUi(page, {
      name: syntheticName('BalCompat', n),
      pan,
    });
    const client = await findItClientInLedger(page.request, pan);

    await saveItFilingViaApi(page.request, client.id, {
      assessmentYear: 'AY 2026-27',
      fees: 3000,
      received: 500,
      balance: 1,
      paymentType: 'NEFT',
      paymentReceiveDate: '2026-04-15',
      filingDate: '2026-07-01',
    });

    const c = await findItClientInLedger(page.request, pan);
    const f = c.filings['AY 2026-27'];
    expect(f).toMatchObject({
      assessmentYear: 'AY 2026-27',
      fees: 3000,
      received: 500,
      balance: expectItBalance(3000, 500),
      paymentType: 'NEFT',
      paymentReceiveDate: '2026-04-15',
      filingDate: '2026-07-01',
    });
    // 7 — still a normal FilingRecord; client name/PAN unchanged
    expect(c.name).toContain('BalCompat');
    expect(c.pan).toBe(pan);
  });
});
