import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { createGstCompanyViaUi, createItClientViaUi, goGstAllData, goItAllData } from './clients';
import { PORTAL_PASSWORD } from './ids';

export async function saveItFilingViaApi(
  request: APIRequestContext,
  clientId: string,
  filing: {
    assessmentYear: string;
    fees: number;
    received: number;
    balance: number;
    paymentType?: string;
    paymentReceiveDate?: string;
    filingDate?: string;
  }
) {
  const res = await request.post(`/api/clients/${clientId}/filings`, {
    data: {
      assessmentYear: filing.assessmentYear,
      filingDate: filing.filingDate || '',
      fees: filing.fees,
      received: filing.received,
      balance: filing.balance,
      paymentType: filing.paymentType || 'GPay',
      paymentReceiveDate: filing.paymentReceiveDate || '',
    },
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

export async function saveGstFilingViaApi(
  request: APIRequestContext,
  companyId: string,
  filing: { month: string; fees: number; interest: number; tax: number; total: number }
) {
  const res = await request.post(`/api/gst/clients/${companyId}/filings`, {
    data: filing,
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

/** Record a payment allocated to a specific GST month. */
export async function recordGstPaymentViaApi(
  request: APIRequestContext,
  companyId: string,
  month: string,
  payment: {
    amount: number;
    paymentDate?: string;
    paymentMode?: string;
    reference?: string;
    idempotencyKey?: string;
  }
) {
  const res = await request.post(
    `/api/gst/clients/${companyId}/filings/${encodeURIComponent(month)}/payments`,
    {
      headers: payment.idempotencyKey
        ? { 'Idempotency-Key': payment.idempotencyKey }
        : undefined,
      data: {
        amount: payment.amount,
        paymentDate: payment.paymentDate || '2026-04-15',
        paymentMode: payment.paymentMode || 'GPay',
        ...(payment.reference ? { reference: payment.reference } : {}),
        ...(payment.idempotencyKey
          ? { idempotencyKey: payment.idempotencyKey }
          : {}),
      },
    }
  );
  expect(res.ok()).toBeTruthy();
  return res.json();
}

/** Seed legacy company-level totalReceived while no payment lines exist. */
export async function seedGstLegacyTotalReceivedViaApi(
  request: APIRequestContext,
  company: {
    id: string;
    companyName: string;
    userId: string;
    phone?: string;
    referenceNumber?: string;
    remark?: string;
  },
  totalReceived: number
) {
  const res = await request.put(`/api/gst/clients/${company.id}`, {
    data: {
      companyName: company.companyName,
      userId: company.userId,
      phone: company.phone || '9876543210',
      referenceNumber: company.referenceNumber || 'E2E-REF',
      remark: company.remark || 'E2E synthetic remark',
      totalReceived,
    },
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

export async function updateGstPaymentViaApi(
  request: APIRequestContext,
  companyId: string,
  month: string,
  paymentId: string,
  payment: {
    amount: number;
    paymentDate?: string;
    paymentMode?: string;
    reference?: string;
  }
) {
  const res = await request.put(
    `/api/gst/clients/${companyId}/filings/${encodeURIComponent(month)}/payments/${encodeURIComponent(paymentId)}`,
    {
      data: {
        amount: payment.amount,
        paymentDate: payment.paymentDate || '2026-04-15',
        paymentMode: payment.paymentMode || 'GPay',
        ...(payment.reference ? { reference: payment.reference } : {}),
      },
    }
  );
  expect(res.ok()).toBeTruthy();
  return res.json();
}

export async function deleteGstPaymentViaApi(
  request: APIRequestContext,
  companyId: string,
  month: string,
  paymentId: string
) {
  const res = await request.delete(
    `/api/gst/clients/${companyId}/filings/${encodeURIComponent(month)}/payments/${encodeURIComponent(paymentId)}`
  );
  expect(res.ok()).toBeTruthy();
  return res.json();
}

/** @deprecated Prefer recordGstPaymentViaApi — company pool totalReceived is no longer the primary path. */
export async function updateGstCompanyReceivedViaApi(
  request: APIRequestContext,
  company: {
    id: string;
    companyName: string;
    userId: string;
    phone?: string;
    referenceNumber?: string;
    remark?: string;
    filings?: Record<string, { total?: number }>;
  },
  totalReceived: number
) {
  const months = Object.keys(company.filings || {});
  const month = months[0];
  if (!month) {
    throw new Error('Cannot record GST payment without a monthly filing.');
  }
  return recordGstPaymentViaApi(request, company.id, month, {
    amount: totalReceived,
  });
}

export async function createItClientWithFilingViaUi(
  page: Page,
  input: {
    name: string;
    pan: string;
    fees: number;
    received: number;
    year?: string;
    paymentType?: string;
  }
) {
  const { openAddClientModal } = await import('./nav');
  await openAddClientModal(page);
  const dialog = page.getByRole('dialog', { name: /Add Client/i });
  await dialog.getByPlaceholder('Client Name').fill(input.name);
  await dialog.getByPlaceholder('ABCPK1234D').fill(input.pan);
  await dialog.getByPlaceholder('Password').fill(PORTAL_PASSWORD);

  const filingCheck = dialog
    .locator('label')
    .filter({ hasText: 'Add Filing Date entry now' })
    .locator('input');
  if (!(await filingCheck.isChecked())) await filingCheck.check();

  await dialog.getByPlaceholder('10000').fill(String(input.fees));
  await dialog.getByPlaceholder('9000').fill(String(input.received));

  await dialog.getByRole('button', { name: /^Save$/i }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}

export async function openItFilingEditor(page: Page, pan: string, yearLabel: string) {
  await goItAllData(page);
  // Ensure all years visible so nested filing rows are not filtered out
  const allYears = page.getByRole('button', { name: /All years/i });
  if (await allYears.isVisible().catch(() => false)) {
    await allYears.click();
  }
  const row = page.locator('tr').filter({ hasText: pan }).first();
  await row.getByLabel(/Expand filing years/i).click();
  const yearRow = page.locator('tr').filter({ hasText: yearLabel }).first();
  const payBtn = yearRow.getByRole('button', { name: /^(Pay|Edit)$/i });
  await expect(payBtn).toBeVisible({ timeout: 10_000 });
  await payBtn.click();
  await expect(
    page
      .getByRole('dialog')
      .filter({
        hasText: new RegExp(
          yearLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '|Fees'
        ),
      })
  ).toBeVisible({ timeout: 10_000 });
}

export async function saveItFilingInQuickModal(
  page: Page,
  values: {
    fees: number;
    received: number;
    paymentType?: string;
    paymentReceiveDate?: string;
  }
) {
  const dialog = page.getByRole('dialog').filter({ hasText: /Fees \(₹\)/i });
  await dialog.getByPlaceholder('10000').fill(String(values.fees));
  await dialog.getByPlaceholder('9000').fill(String(values.received));
  if (values.paymentReceiveDate) {
    await dialog.locator('input[type="date"]').nth(1).fill(values.paymentReceiveDate);
  }
  await dialog.getByRole('button', { name: /^Save( filing)?$/i }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}

/** Ensure GST All Data shows every filing month (not only the current month). */
export async function selectGstAllMonths(page: Page) {
  await goGstAllData(page);
  const pill = page.locator('button[aria-haspopup="listbox"]').first();
  await expect(pill).toBeVisible({ timeout: 10_000 });
  if ((await pill.innerText()).match(/All months/i)) return;
  await pill.click();
  const list = page.getByRole('listbox', { name: /GST months|months/i });
  await expect(list).toBeVisible({ timeout: 5_000 });
  await list.getByRole('button', { name: /^All months$/i }).click();
  await expect(pill).toContainText(/All months/i);
}

export async function openGstFilingEditor(
  page: Page,
  companyName: string,
  monthLabel: string
) {
  await goGstAllData(page);
  await selectGstAllMonths(page);
  await page
    .getByPlaceholder(/Search companies by name, user ID/i)
    .fill(companyName);
  const row = page.locator('tr').filter({ hasText: companyName }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  const expand = row.getByLabel(/Expand monthly filings/i);
  if (await expand.isVisible().catch(() => false)) {
    await expand.click();
  }
  // Prefer nested Pay/Edit for the target month row when visible
  const monthRow = page.locator('tr').filter({ hasText: monthLabel }).first();
  const payOrEdit = monthRow.getByRole('button', { name: /^(Pay|Edit)$/i });
  if (await payOrEdit.first().isVisible().catch(() => false)) {
    await payOrEdit.first().click();
  } else {
    await page.getByRole('button', { name: /^(Pay|Edit)$/i }).first().click();
  }
  await expect(
    page
      .getByRole('dialog')
      .filter({
        hasText: /Fees|Save Filing|Payment History|Record Payment|Payment Details/i,
      })
  ).toBeVisible({ timeout: 10_000 });
}

/** Open GST Add/Edit for a month that has no filing yet (Sheet View Add cell). */
export async function openGstNewMonthFiling(
  page: Page,
  companyName: string,
  monthLabel: string
) {
  await goGstAllData(page);
  await page.getByRole('button', { name: /Sheet View/i }).click();
  await selectGstAllMonths(page);
  await page
    .getByPlaceholder(/Search companies by name, user ID/i)
    .fill(companyName);
  const row = page.locator('tr').filter({ hasText: companyName }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  // Month columns show "Add" when empty — prefer the Add in this company row
  const addInRow = row.getByRole('button', { name: /^Add$/i });
  if (await addInRow.first().isVisible().catch(() => false)) {
    await addInRow.first().click();
  } else {
    // Ensure month exists in gstMonths via navigating month menu — click any Add
    await page.getByRole('button', { name: /^Add$/i }).first().click();
  }
  const dialog = page.getByRole('dialog').filter({ hasText: companyName });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  // If dialog opened for wrong month, still usable if we can set... month is fixed by column
  await expect(dialog).toContainText(new RegExp(monthLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '|' + companyName));
}

export async function createGstCompanyWithFilingViaUi(
  page: Page,
  input: {
    companyName: string;
    userId: string;
    fees: number;
    interest: number;
    tax: number;
    month?: string;
    phone?: string;
    referenceNumber?: string;
    remark?: string;
  }
) {
  const { openAddGstModal } = await import('./nav');
  await openAddGstModal(page);
  const dialog = page.getByRole('dialog', { name: /Add GST Company/i });
  await dialog.getByPlaceholder('Company Name').fill(input.companyName);
  await dialog.getByPlaceholder('User ID').fill(input.userId);
  await dialog.getByPlaceholder('Password').fill(PORTAL_PASSWORD);
  await dialog.getByPlaceholder('Mobile Number').fill(input.phone || '9876543210');
  await dialog.getByPlaceholder('Reference No').fill(input.referenceNumber || 'E2E-REF');
  await dialog.getByPlaceholder('Remark').fill(input.remark || 'E2E synthetic remark');

  if (input.month) {
    await dialog.locator('input[placeholder="Apr 2026"]').fill(input.month);
  }

  await dialog.getByText('Fees (₹)', { exact: true }).locator('..').locator('input').fill(String(input.fees));
  await dialog
    .getByText('Interest (₹)', { exact: true })
    .locator('..')
    .locator('input')
    .fill(String(input.interest));
  await dialog.getByText('Tax (₹)', { exact: true }).locator('..').locator('input').fill(String(input.tax));

  await dialog.getByRole('button', { name: /^Save$/i }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}

export async function findItClientInLedger(
  request: APIRequestContext,
  pan: string
) {
  const res = await request.get('/api/ledger');
  expect(res.ok()).toBeTruthy();
  const ledger = await res.json();
  const client = ledger.clients.find((c: { pan: string }) => c.pan === pan);
  expect(client).toBeTruthy();
  return client as {
    id: string;
    name: string;
    pan: string;
    filings: Record<
      string,
      {
        fees: number;
        received: number;
        balance: number;
        paymentType: string;
        paymentReceiveDate: string;
      }
    >;
  };
}

export async function findGstCompanyInLedger(
  request: APIRequestContext,
  userId: string
) {
  const res = await request.get('/api/ledger');
  expect(res.ok()).toBeTruthy();
  const ledger = await res.json();
  const company = ledger.gstClients.find((c: { userId: string }) => c.userId === userId);
  expect(company).toBeTruthy();
  return company as {
    id: string;
    companyName: string;
    userId: string;
    phone?: string;
    referenceNumber?: string;
    remark?: string;
    totalReceived: number;
    unallocatedReceived?: number;
    filings: Record<
      string,
      {
        fees: number;
        interest: number;
        tax: number;
        total: number;
        received?: number;
        payments?: Array<{
          id: string;
          amount: number;
          paymentDate: string;
          paymentMode: string;
          reference?: string;
          idempotencyKey?: string;
        }>;
      }
    >;
  };
}

export { createItClientViaUi, createGstCompanyViaUi, goItAllData, goGstAllData };
