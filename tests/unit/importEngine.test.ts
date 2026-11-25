import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { suggestColumnMapping, validateMapping } from '../../src/import/columnMapping.ts';
import { parseItSheetWithMapping } from '../../src/import/itMappedParse.ts';
import { parseGstSheetWithMapping } from '../../src/import/gstMappedParse.ts';
import {
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
});
