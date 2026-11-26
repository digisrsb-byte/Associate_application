import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { suggestColumnMapping, validateMapping } from '../../src/import/columnMapping.ts';
import { parseItSheetWithMapping } from '../../src/import/itMappedParse.ts';
import { parseGstSheetWithMapping } from '../../src/import/gstMappedParse.ts';
import {
  canCommit,
  validateGstImport,
  validateItImport,
} from '../../src/import/validateImport.ts';
import {
  applyGstImportToLedger,
  applyItImportToLedger,
} from '../../src/import/applyImportToLedger.ts';
import { inspectWorkbookBuffer } from '../../src/import/workbookInspect.ts';
import { neutralizeCsvFormula } from '../../src/utils/csvHelpers.ts';
import {
  isValidGstinFormat,
  validateOptionalGstin,
} from '../../src/utils/fieldValidation.ts';
import type { LedgerState } from '../../src/types/ledger.ts';

function emptyLedger(): LedgerState {
  return {
    assessmentYears: ['AY 2024-25', 'AY 2025-26'],
    clients: [],
    gstMonths: ['Apr 2026'],
    gstClients: [],
  };
}

async function itWorkbook(opts?: {
  headings?: string[];
  rows?: unknown[][];
}): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('All Data');
  sheet.addRow(
    opts?.headings || [
      'Assessment Year',
      'Client ID',
      'Name',
      'Filing Date',
      'Amount Billed',
      'Received',
      'Outstanding',
      'Payment Mode',
      'Payment Date',
    ]
  );
  for (const row of opts?.rows || [
    [
      'AY 2024-25',
      'AAAPA1234A',
      'Synth Client One',
      '2024-07-01',
      1000,
      400,
      600,
      'UPI',
      '2024-07-15',
    ],
    [
      'AY 2025-26',
      'AAAPA1234A',
      'Synth Client One',
      '2025-07-01',
      1200,
      1200,
      0,
      'Cash',
      '2025-07-10',
    ],
  ]) {
    sheet.addRow(row);
  }
  return wb;
}

async function gstWorkbook(opts?: {
  headings?: string[];
  rows?: unknown[][];
}): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('All Data');
  sheet.addRow(
    opts?.headings || [
      'Month',
      'Company Name',
      'User ID',
      'Password',
      'Phone',
      'Fees',
      'Interest',
      'Tax',
      'Total',
      'Total Recd',
    ]
  );
  for (const row of opts?.rows || [
    [
      'Apr 2026',
      'Synth Co',
      'synthuser1',
      'secret-pass',
      '9876543210',
      500,
      10,
      5,
      515,
      100,
    ],
  ]) {
    sheet.addRow(row);
  }
  return wb;
}

async function toBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab);
}

describe('Phase 6 import engine', () => {
  it('suggests IT column mapping and lists unmapped headings', async () => {
    const wb = await itWorkbook({
      headings: [
        'Assessment Year',
        'Client ID',
        'Name',
        'Amount Billed',
        'Extra Col',
      ],
      rows: [['AY 2024-25', 'AAAPA1234A', 'Synth', 10, 'x']],
    });
    const buf = await toBuffer(wb);
    const { inspection } = await inspectWorkbookBuffer(buf, 'it');
    const sheet = inspection.sheets.find((s) => s.name === 'All Data')!;
    const sug = suggestColumnMapping('it', sheet.headings);
    expect(sug.mapping.pan).toBeTruthy();
    expect(sug.mapping.name).toBeTruthy();
    expect(sug.mapping.assessmentYear).toBeTruthy();
    expect(sug.unmappedHeadings).toContain('Extra Col');
    expect(validateMapping('it', sug.mapping, sheet.headings).ok).toBe(true);
  });

  it('parses and validates a synthetic IT workbook', async () => {
    const wb = await itWorkbook();
    const sug = suggestColumnMapping('it', [
      'Assessment Year',
      'Client ID',
      'Name',
      'Filing Date',
      'Amount Billed',
      'Received',
      'Outstanding',
      'Payment Mode',
      'Payment Date',
    ]);
    const parsed = parseItSheetWithMapping(wb, 'All Data', sug.mapping);
    expect(parsed.clients).toHaveLength(1);
    expect(Object.keys(parsed.clients[0].filings)).toHaveLength(2);
    const validated = validateItImport(
      parsed,
      emptyLedger(),
      { mode: 'merge', onConflict: 'update' },
      [
        'Assessment Year',
        'Client ID',
        'Name',
        'Filing Date',
        'Amount Billed',
        'Received',
        'Outstanding',
        'Payment Mode',
        'Payment Date',
      ],
      sug.mapping
    );
    expect(validated.validClientCount).toBe(1);
    expect(validated.validFilingCount).toBe(2);
    expect(validated.finance.itFees).toBe(2200);
  });

  it('flags invalid PAN and alternate headings still map', async () => {
    const wb = await itWorkbook({
      headings: ['Year', 'PAN', 'Client Name', 'Fees'],
      rows: [
        ['AY 2024-25', 'BADPAN', 'X', 10],
        ['AY 2024-25', 'AAAPA1234A', 'Ok', 20],
      ],
    });
    const headings = ['Year', 'PAN', 'Client Name', 'Fees'];
    const sug = suggestColumnMapping('it', headings);
    // Force aliases used
    sug.mapping.assessmentYear = 'Year';
    sug.mapping.pan = 'PAN';
    sug.mapping.name = 'Client Name';
    sug.mapping.fees = 'Fees';
    const parsed = parseItSheetWithMapping(wb, 'All Data', sug.mapping);
    const validated = validateItImport(
      parsed,
      emptyLedger(),
      { mode: 'merge', onConflict: 'update' },
      headings,
      sug.mapping
    );
    expect(validated.diff.invalidRecords).toBeGreaterThanOrEqual(1);
    expect(validated.validClientCount).toBe(1);
  });

  it('detects outstanding balance discrepancies', async () => {
    const wb = await itWorkbook({
      rows: [
        [
          'AY 2024-25',
          'AAAPA1234A',
          'Synth',
          '2024-07-01',
          1000,
          400,
          999,
          'UPI',
          '',
        ],
      ],
    });
    const headings = [
      'Assessment Year',
      'Client ID',
      'Name',
      'Filing Date',
      'Amount Billed',
      'Received',
      'Outstanding',
      'Payment Mode',
      'Payment Date',
    ];
    const sug = suggestColumnMapping('it', headings);
    const parsed = parseItSheetWithMapping(wb, 'All Data', sug.mapping);
    const validated = validateItImport(
      parsed,
      emptyLedger(),
      { mode: 'merge', onConflict: 'update' },
      headings,
      sug.mapping
    );
    expect(validated.finance.itBalanceDiscrepancies).toBe(1);
  });

  it('applies IT import idempotently with skip policy', () => {
    const ledger = emptyLedger();
    const clients = [
      {
        pan: 'AAAPA1234A',
        name: 'Synth',
        phone: '',
        otherMobiles: '',
        nameVariants: '',
        filings: {
          'AY 2024-25': {
            assessmentYear: 'AY 2024-25',
            filingDate: '2024-07-01',
            fees: 100,
            received: 50,
            outstanding: 50,
            paymentType: 'UPI',
            paymentReceiveDate: '',
            sourceRow: 2,
          },
        },
      },
    ];
    const r1 = applyItImportToLedger(ledger, clients, {
      mode: 'merge',
      onConflict: 'update',
    });
    expect(r1.clientsCreated).toBe(1);
    const r2 = applyItImportToLedger(ledger, clients, {
      mode: 'merge',
      onConflict: 'skip',
    });
    expect(r2.filingsSkipped).toBe(1);
    expect(ledger.clients).toHaveLength(1);
  });

  it('parses GST workbook without exposing password in validate payload companies', async () => {
    const wb = await gstWorkbook();
    const headings = [
      'Month',
      'Company Name',
      'User ID',
      'Password',
      'Phone',
      'Fees',
      'Interest',
      'Tax',
      'Total',
      'Total Recd',
    ];
    const sug = suggestColumnMapping('gst', headings);
    const parsed = parseGstSheetWithMapping(wb, 'All Data', sug.mapping);
    expect(parsed.companies[0].password).toBe('secret-pass');
    const validated = validateGstImport(
      parsed,
      emptyLedger(),
      { mode: 'merge', onConflict: 'update' },
      headings,
      sug.mapping
    );
    expect(validated.companies[0].hasPassword).toBe(true);
    expect(
      (validated.companies[0] as { password?: string }).password
    ).toBeUndefined();
    expect(validated.passwordsByUserId.synthuser1).toBe('secret-pass');
  });

  it('rejects missing required GST columns via mapping validation', () => {
    const headings = ['Fees', 'Interest'];
    const sug = suggestColumnMapping('gst', headings);
    const check = validateMapping('gst', sug.mapping, headings);
    expect(check.ok).toBe(false);
  });

  it('applies GST import and encrypts via passwordEnc field', () => {
    const ledger = emptyLedger();
    const report = applyGstImportToLedger(
      ledger,
      [
        {
          userId: 'synthuser1',
          companyName: 'Synth Co',
          phone: '',
          referenceNumber: '',
          remark: '',
          totalReceived: 10,
          passwordEnc: 'enc:v1:fake',
          filings: {
            'Apr 2026': { fees: 1, interest: 0, tax: 0 },
          },
        },
      ],
      { mode: 'merge', onConflict: 'update' }
    );
    expect(report.clientsCreated).toBe(1);
    expect(ledger.gstClients[0].passwordEnc).toBe('enc:v1:fake');
    expect(ledger.gstClients[0].password).toBeUndefined();
  });

  it('validates optional GSTIN format helpers', () => {
    expect(isValidGstinFormat('27AAAAA0000A1Z5')).toBe(true);
    expect(validateOptionalGstin('bad').ok).toBe(false);
    expect(validateOptionalGstin('').ok).toBe(true);
  });

  it('neutralizes CSV formula injection', () => {
    expect(neutralizeCsvFormula('=CMD()')).toBe("'=CMD()");
    expect(neutralizeCsvFormula('ok')).toBe('ok');
  });

  it('handles duplicate filing rows with warning', async () => {
    const wb = await itWorkbook({
      rows: [
        [
          'AY 2024-25',
          'AAAPA1234A',
          'Synth',
          '',
          100,
          0,
          100,
          '',
          '',
        ],
        [
          'AY 2024-25',
          'AAAPA1234A',
          'Synth',
          '',
          200,
          0,
          200,
          '',
          '',
        ],
      ],
    });
    const headings = [
      'Assessment Year',
      'Client ID',
      'Name',
      'Filing Date',
      'Amount Billed',
      'Received',
      'Outstanding',
      'Payment Mode',
      'Payment Date',
    ];
    const sug = suggestColumnMapping('it', headings);
    const parsed = parseItSheetWithMapping(wb, 'All Data', sug.mapping);
    expect(parsed.duplicateFilingRows).toBe(1);
    expect(parsed.clients[0].filings['AY 2024-25'].fees).toBe(200);
  });

  it('validates IT/GST edge cases and canCommit gates', async () => {
    const itHeadings = [
      'Assessment Year',
      'Client ID',
      'Name',
      'Filing Date',
      'Amount Billed',
      'Received',
      'Outstanding',
      'Payment Mode',
      'Payment Date',
    ];
    const itSug = suggestColumnMapping('it', itHeadings);
    const badIt = parseItSheetWithMapping(
      await itWorkbook({
        rows: [
          ['AY 2024-25', 'BADPAN', '', '', 100, 0, 100, '', ''],
          ['AY 2024-25', 'AAAPA1234A', '', '', 100, 0, 100, '', ''],
          ['AY 2024-25', 'AAAPA1234A', 'Ok Client', '', 100, 40, 99, '', ''],
        ],
      }),
      'All Data',
      itSug.mapping
    );
    const seeded = emptyLedger();
    seeded.clients.push({
      id: 'c1',
      pan: 'AAAPA1234A',
      name: 'Existing',
      phone: '',
      referenceNumber: '',
      otherMobiles: '',
      nameVariants: '',
      filings: {
        'AY 2024-25': {
          assessmentYear: 'AY 2024-25',
          filingDate: '',
          fees: 50,
          received: 0,
          balance: 50,
          paymentType: '',
          paymentReceiveDate: '',
        },
      },
      createdAt: '',
      updatedAt: '',
    });
    const itVal = validateItImport(
      badIt,
      seeded,
      { mode: 'merge', onConflict: 'skip' },
      itHeadings,
      itSug.mapping
    );
    expect(itVal.diff.invalidRecords).toBeGreaterThanOrEqual(1);
    expect(itVal.finance.itBalanceDiscrepancies).toBeGreaterThanOrEqual(1);
    expect(canCommit('it', itVal)).toBe(true);

    const gstHeadings = [
      'Month',
      'Company Name',
      'User ID',
      'Password',
      'Phone',
      'Fees',
      'Interest',
      'Tax',
      'Total',
      'Total Recd',
      'GSTIN',
    ];
    const gstWb = await gstWorkbook({
      headings: gstHeadings,
      rows: [
        ['Apr 2026', '', '', '', '', 1, 0, 0, 1, 0, ''],
        [
          'Apr 2026',
          'Exist Co',
          'existuser',
          '',
          '',
          10,
          1,
          1,
          999,
          0,
          'NOTAGSTIN',
        ],
        [
          'May 2026',
          'Exist Co',
          'existuser',
          'pw',
          '',
          5,
          0,
          0,
          5,
          0,
          '',
        ],
      ],
    });
    const gstSug2 = suggestColumnMapping('gst', gstHeadings);
    const gstMap = { ...gstSug2.mapping, gstin: 'GSTIN' };
    const gstParsed = parseGstSheetWithMapping(gstWb, 'All Data', gstMap);
    gstParsed.companies.push({
      userId: '',
      companyName: '',
      phone: '',
      referenceNumber: '',
      remark: '',
      password: '',
      totalReceived: 0,
      filings: {},
    });
    const gstLedger = emptyLedger();
    gstLedger.gstClients.push({
      id: 'g1',
      companyName: 'Exist Co',
      userId: 'existuser',
      phone: '',
      referenceNumber: '',
      remark: '',
      totalReceived: 0,
      filings: {
        'Apr 2026': { fees: 1, interest: 0, tax: 0, total: 1 },
      },
      createdAt: '',
      updatedAt: '',
    });
    const gstValUpdate = validateGstImport(
      gstParsed,
      gstLedger,
      { mode: 'merge', onConflict: 'update' },
      gstHeadings,
      gstMap
    );
    expect(gstValUpdate.diff.invalidRecords).toBeGreaterThanOrEqual(1);
    expect(gstValUpdate.finance.gstTotalDiscrepancies).toBeGreaterThanOrEqual(1);
    expect(gstValUpdate.diff.filingsToUpdate).toBeGreaterThanOrEqual(1);
    expect(gstValUpdate.diff.filingsToAdd).toBeGreaterThanOrEqual(1);
    expect(canCommit('gst', gstValUpdate)).toBe(true);

    const gstValSkip = validateGstImport(
      gstParsed,
      gstLedger,
      { mode: 'merge', onConflict: 'skip' },
      gstHeadings,
      gstMap
    );
    expect(gstValSkip.diff.filingsToSkip).toBeGreaterThanOrEqual(1);

    const emptyGst = validateGstImport(
      {
        companies: [],
        issues: [
          {
            level: 'error',
            code: 'sheet_missing',
            message: 'missing',
          },
        ],
        rowsRead: 0,
        rowsSkipped: 0,
        duplicateFilingRows: 0,
      },
      emptyLedger(),
      { mode: 'merge', onConflict: 'update' },
      gstHeadings,
      gstMap
    );
    expect(canCommit('gst', emptyGst)).toBe(false);
  });

  it('covers GST parse edge paths: missing sheet, skips, merges, duplicates', async () => {
    const headings = [
      'Month',
      'Company Name',
      'User ID',
      'Password',
      'Phone',
      'Reference',
      'Remark',
      'Fees',
      'Interest',
      'Tax',
      'Total',
      'Total Recd',
      'GSTIN',
    ];
    const sug = suggestColumnMapping('gst', headings);
    const mapping = {
      ...sug.mapping,
      referenceNumber: 'Reference',
      remark: 'Remark',
      gstin: 'GSTIN',
    };

    const missing = parseGstSheetWithMapping(
      await gstWorkbook(),
      'No Such Sheet',
      mapping
    );
    expect(missing.issues[0]?.code).toBe('sheet_missing');
    expect(missing.companies).toHaveLength(0);

    const wb = await gstWorkbook({
      headings,
      rows: [
        ['', '', '', '', '', '', '', '', '', '', '', '', ''],
        ['Apr 2026', 'No User Co', '', '', '', '', '', 1, 0, 0, 1, 0, ''],
        ['', 'Bad Month Co', 'badmonth', '', '', '', '', 1, 0, 0, 1, 0, ''],
        [
          'Apr 2026',
          'First Name',
          'mergeuser',
          'pass1',
          '111',
          'REF1',
          'r1',
          10,
          1,
          1,
          12,
          5,
          '27AAAAA0000A1Z5',
        ],
        [
          'May 2026',
          'Updated Name',
          'mergeuser',
          'pass2',
          '222',
          'REF2',
          'r2',
          20,
          0,
          0,
          20,
          50,
          '27AAAAA0000A1Z5',
        ],
        [
          'May 2026',
          'Updated Name',
          'mergeuser',
          '',
          '',
          '',
          '',
          30,
          0,
          0,
          30,
          60,
          '',
        ],
      ],
    });
    const parsed = parseGstSheetWithMapping(wb, 'All Data', mapping);
    expect(parsed.rowsSkipped).toBeGreaterThanOrEqual(2);
    expect(parsed.issues.some((i) => i.code === 'missing_user_id')).toBe(true);
    expect(parsed.issues.some((i) => i.code === 'invalid_month')).toBe(true);
    expect(parsed.duplicateFilingRows).toBe(1);
    expect(parsed.companies).toHaveLength(1);
    const c = parsed.companies[0];
    expect(c.companyName).toBe('Updated Name');
    expect(c.password).toBe('pass2');
    expect(c.phone).toBe('222');
    expect(c.referenceNumber).toBe('REF2');
    expect(c.remark).toBe('r2');
    expect(c.totalReceived).toBe(60);
    expect(c.filings['May 2026'].fees).toBe(30);
  });

  it('updates existing IT client fields, adds years, and replace-mode prunes', () => {
    const ledger = emptyLedger();
    applyItImportToLedger(
      ledger,
      [
        {
          pan: 'AAAPA1234A',
          name: 'Old',
          phone: '111',
          otherMobiles: '',
          nameVariants: '',
          filings: {
            'AY 2024-25': {
              assessmentYear: 'AY 2024-25',
              filingDate: '2024-07-01',
              fees: 100,
              received: 0,
              outstanding: 100,
              paymentType: '',
              paymentReceiveDate: '',
              sourceRow: 2,
            },
          },
        },
        {
          pan: 'BBBPB1234B',
          name: 'Other',
          phone: '',
          otherMobiles: '',
          nameVariants: '',
          filings: {
            'AY 2024-25': {
              assessmentYear: 'AY 2024-25',
              filingDate: '',
              fees: 10,
              received: 0,
              outstanding: 10,
              paymentType: '',
              paymentReceiveDate: '',
              sourceRow: 3,
            },
          },
        },
      ],
      { mode: 'merge', onConflict: 'update' }
    );

    const upd = applyItImportToLedger(
      ledger,
      [
        {
          pan: 'AAAPA1234A',
          name: 'New Name',
          phone: '999',
          otherMobiles: '888',
          nameVariants: 'Alias',
          filings: {
            'AY 2024-25': {
              assessmentYear: 'AY 2024-25',
              filingDate: '2024-08-01',
              fees: 150,
              received: 50,
              outstanding: 100,
              paymentType: 'UPI',
              paymentReceiveDate: '2024-08-02',
              sourceRow: 2,
            },
            'AY 2025-26': {
              assessmentYear: 'AY 2025-26',
              filingDate: '',
              fees: 20,
              received: 0,
              outstanding: 20,
              paymentType: '',
              paymentReceiveDate: '',
              sourceRow: 4,
            },
          },
        },
      ],
      { mode: 'replace', onConflict: 'update' }
    );
    expect(upd.clientsUpdated).toBe(1);
    expect(upd.filingsUpdated).toBe(1);
    expect(upd.filingsAdded).toBe(1);
    expect(ledger.clients).toHaveLength(1);
    expect(ledger.clients[0].name).toBe('New Name');
    expect(ledger.clients[0].phone).toBe('999');
    expect(ledger.clients[0].otherMobiles).toBe('888');
    expect(ledger.clients[0].nameVariants).toBe('Alias');
    expect(ledger.clients[0].filings['AY 2025-26'].fees).toBe(20);
  });

  it('updates existing GST company fields, skip conflicts, and replace-mode prunes', () => {
    const ledger = emptyLedger();
    applyGstImportToLedger(
      ledger,
      [
        {
          userId: 'keep-user',
          companyName: 'Keep Co',
          phone: '111',
          referenceNumber: 'R1',
          remark: 'old',
          totalReceived: 5,
          filings: { 'Apr 2026': { fees: 10, interest: 1, tax: 1 } },
        },
        {
          userId: 'drop-user',
          companyName: 'Drop Co',
          phone: '',
          referenceNumber: '',
          remark: '',
          totalReceived: 0,
          filings: { 'Apr 2026': { fees: 1, interest: 0, tax: 0 } },
        },
      ],
      { mode: 'merge', onConflict: 'update' }
    );

    const skipped = applyGstImportToLedger(
      ledger,
      [
        {
          userId: 'keep-user',
          companyName: 'Keep Co',
          phone: '111',
          referenceNumber: 'R1',
          remark: 'old',
          totalReceived: 5,
          filings: { 'Apr 2026': { fees: 99, interest: 0, tax: 0 } },
        },
      ],
      { mode: 'merge', onConflict: 'skip' }
    );
    expect(skipped.filingsSkipped).toBe(1);
    expect(ledger.gstClients.find((c) => c.userId === 'keep-user')!.filings[
      'Apr 2026'
    ].fees).toBe(10);

    const replaced = applyGstImportToLedger(
      ledger,
      [
        {
          userId: 'keep-user',
          companyName: 'Keep Co Renamed',
          phone: '222',
          referenceNumber: 'R2',
          remark: 'new',
          totalReceived: 50,
          passwordEnc: 'enc:v1:x',
          filings: {
            'Apr 2026': { fees: 20, interest: 2, tax: 2 },
            'May 2026': { fees: 3, interest: 0, tax: 0 },
          },
        },
      ],
      { mode: 'replace', onConflict: 'update' }
    );
    expect(replaced.clientsUpdated).toBe(1);
    expect(replaced.filingsUpdated).toBe(1);
    expect(replaced.filingsAdded).toBe(1);
    expect(ledger.gstClients).toHaveLength(1);
    const kept = ledger.gstClients[0];
    expect(kept.companyName).toBe('Keep Co Renamed');
    expect(kept.phone).toBe('222');
    expect(kept.referenceNumber).toBe('R2');
    expect(kept.remark).toBe('new');
    expect(kept.totalReceived).toBe(50);
    expect(kept.passwordEnc).toBe('enc:v1:x');
    expect(kept.filings['Apr 2026'].fees).toBe(20);
    expect(kept.filings['May 2026'].fees).toBe(3);
    expect(ledger.gstMonths).toContain('May 2026');
  });
});
