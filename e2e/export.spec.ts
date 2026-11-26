import { test, expect } from '@playwright/test';
import ExcelJS from 'exceljs';
import { loginAsE2eAdmin } from './helpers/auth';
import {
  createGstCompanyViaUi,
  createItClientViaUi,
  goGstAllData,
  goItAllData,
} from './helpers/clients';
import {
  findGstCompanyInLedger,
  findItClientInLedger,
  recordGstPaymentViaApi,
  saveGstFilingViaApi,
  saveItFilingViaApi,
  seedGstLegacyTotalReceivedViaApi,
} from './helpers/finance';
import { expectItBalance } from './helpers/financeExpected';
import { nextSeq, syntheticName, syntheticPan, PORTAL_PASSWORD } from './helpers/ids';

function parseCsv(text: string): string[][] {
  return text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.length > 0)
    .map((line) => {
      const cells: string[] = [];
      let cur = '';
      let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQ && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else inQ = !inQ;
        } else if (ch === ',' && !inQ) {
          cells.push(cur);
          cur = '';
        } else cur += ch;
      }
      cells.push(cur);
      return cells;
    });
}

test.describe('Stage 4E — export', () => {
  test('CSV all-data export has correct fields and blank password column', async ({
    page,
  }) => {
    const n = nextSeq();
    const pan = syntheticPan(n);
    const name = syntheticName('ExpCSV', n);
    const fees = 5500;
    const received = 1500;
    const ay = 'AY 2026-27';

    await loginAsE2eAdmin(page);
    await createItClientViaUi(page, { name, pan });
    const client = await findItClientInLedger(page.request, pan);
    await saveItFilingViaApi(page.request, client.id, {
      assessmentYear: ay,
      fees,
      received,
      balance: expectItBalance(fees, received),
      paymentType: 'UPI',
      paymentReceiveDate: '2026-05-01',
    });
    await page.reload();
    await goItAllData(page);
    await page.getByRole('button', { name: /^All years$/i }).click();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Export CSV/i }).first().click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/all-data\.csv/i);
    const path = await download.path();
    expect(path).toBeTruthy();
    const text = await download.createReadStream().then(async (stream) => {
      const chunks: Buffer[] = [];
      for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks).toString('utf8');
    });

    const rows = parseCsv(text);
    const header = rows[0];
    expect(header).toContain('PAN');
    expect(header).toContain('Password');
    expect(header).toContain('Assessment Year');
    expect(header).toContain('Amount Billed');
    const pwdIdx = header.indexOf('Password');
    const panIdx = header.indexOf('PAN');
    const nameIdx = header.indexOf('Name');
    const ayIdx = header.indexOf('Assessment Year');
    const billedIdx = header.indexOf('Amount Billed');
    const recIdx = header.indexOf('Received');
    const outIdx = header.indexOf('Outstanding');

    const dataRow = rows.find((r) => r[panIdx] === pan && r[ayIdx] === ay);
    expect(dataRow).toBeTruthy();
    expect(dataRow![nameIdx]).toBe(name);
    expect(dataRow![billedIdx]).toBe(String(fees));
    expect(dataRow![recIdx]).toBe(String(received));
    expect(dataRow![outIdx]).toBe(String(expectItBalance(fees, received)));
    expect(dataRow![pwdIdx]).toBe('');
    // Must not leak portal password or auth email secrets
    expect(text).not.toContain(PORTAL_PASSWORD);
    expect(text.toLowerCase()).not.toContain('e2etest@pass');
  });

  test('Excel .xlsx export omits portal passwords; PDF unsupported', async ({ page }) => {
    const n = nextSeq();
    const pan = syntheticPan(n);
    const name = syntheticName('ExpXLS', n);

    await loginAsE2eAdmin(page);
    await createItClientViaUi(page, { name, pan });
    const client = await findItClientInLedger(page.request, pan);
    await saveItFilingViaApi(page.request, client.id, {
      assessmentYear: 'AY 2026-27',
      fees: 9000,
      received: 1000,
      balance: expectItBalance(9000, 1000),
    });
    await page.reload();

    await page.getByRole('button', { name: /Import \/ Export/i }).click();
    await expect(page.getByText(/Download Excel/i)).toBeVisible();

    // PDF not offered
    await expect(page.getByRole('button', { name: /PDF/i })).toHaveCount(0);
    await expect(page.getByText(/PDF/i)).toHaveCount(0);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Download Excel \(\.xlsx\)/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/i);

    const buf = await download.createReadStream().then(async (stream) => {
      const chunks: Buffer[] = [];
      for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks);
    });

    const wb = new ExcelJS.Workbook();
    // exceljs accepts Buffer
    await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
    const sheetNames = wb.worksheets.map((s) => s.name);
    expect(sheetNames).toContain('All Data');

    const allData = wb.getWorksheet('All Data');
    expect(allData).toBeTruthy();
    const header: string[] = [];
    allData!.getRow(1).eachCell((cell, col) => {
      header[col] = String(cell.value ?? '');
    });
    expect(header.join('|').toLowerCase()).not.toContain('password');

    let found = false;
    allData!.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const values = row.values as (string | number | null)[];
      const joined = values.map((v) => String(v ?? '')).join('|');
      if (joined.includes(pan)) {
        found = true;
        expect(joined).toContain(name);
        expect(joined).toContain('AY 2026-27');
        expect(joined).not.toContain(PORTAL_PASSWORD);
      }
    });
    expect(found).toBeTruthy();
  });

  test('GST Excel export includes Unallocated Recd column and value', async ({
    page,
  }) => {
    const n = nextSeq();
    const userId = `e2e.exp.gst.unalloc.${n}@example.test`;
    const companyName = syntheticName('ExpGstUnalloc', n);

    await loginAsE2eAdmin(page);
    await createGstCompanyViaUi(page, { companyName, userId });
    let company = await findGstCompanyInLedger(page.request, userId);
    await saveGstFilingViaApi(page.request, company.id, {
      month: 'Apr 2026',
      fees: 5000,
      interest: 0,
      tax: 0,
      total: 5000,
    });
    company = await findGstCompanyInLedger(page.request, userId);
    await seedGstLegacyTotalReceivedViaApi(page.request, company, 50_000);
    await recordGstPaymentViaApi(page.request, company.id, 'Apr 2026', {
      amount: 1000,
      idempotencyKey: `exp-unalloc-${n}`,
    });
    await page.reload();
    await goGstAllData(page);

    await page.getByRole('button', { name: /Import \/ Export/i }).click();
    const transfer = page.getByRole('dialog').filter({ hasText: /Download Excel/i });
    await expect(transfer).toBeVisible();
    // Ensure GST domain is selected inside the transfer modal
    await transfer.getByRole('button', { name: /^GST$/i }).click();
    await expect(transfer.getByText(/GST months|Month Summary|Company Summary/i).first()).toBeVisible({
      timeout: 5_000,
    });

    const downloadPromise = page.waitForEvent('download');
    await transfer.getByRole('button', { name: /Download Excel \(\.xlsx\)/i }).click();
    const download = await downloadPromise;
    const buf = await download.createReadStream().then(async (stream) => {
      const chunks: Buffer[] = [];
      for await (const chunk of stream as AsyncIterable<Buffer>)
        chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks);
    });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
    const allData = wb.getWorksheet('All Data');
    expect(allData).toBeTruthy();
    const header: string[] = [];
    allData!.getRow(1).eachCell((cell, col) => {
      header[col] = String(cell.value ?? '');
    });
    expect(header).toContain('Month Recd');
    expect(header).toContain('Company Unallocated Recd');
    expect(header).toContain('Month Outstanding');

    const monthRecdCol = header.findIndex((v) => v === 'Month Recd');
    const unallocCol = header.findIndex(
      (v) => v === 'Company Unallocated Recd'
    );
    const passwordCol = header.findIndex((v) => v === 'Password');
    let found = false;
    allData!.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const values = row.values as (string | number | null)[];
      const joined = values.map((v) => String(v ?? '')).join('|');
      if (joined.includes(userId) || joined.includes(companyName)) {
        found = true;
        expect(Number(row.getCell(monthRecdCol).value)).toBe(1000);
        expect(Number(row.getCell(unallocCol).value)).toBe(50_000);
        expect(joined).not.toContain(PORTAL_PASSWORD);
        if (passwordCol > 0) {
          expect(String(row.getCell(passwordCol).value ?? '')).toBe('');
        }
      }
    });
    expect(found).toBeTruthy();
  });
});
