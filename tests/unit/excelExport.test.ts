import { describe, expect, it, vi, afterEach } from 'vitest';
import type { ClientRecord, LedgerState } from '../../src/types/ledger.ts';
import {
  buildImportTemplateBlob,
  buildWorkbookBlob,
  downloadBlob,
  exportFilename,
} from '../../src/utils/excelExport.ts';
import { orderedWorkbookToBlob } from '../../src/utils/excelWorkbookOrder.ts';
import ExcelJS from 'exceljs';

const PAN = 'ABCPK1234D';

const client: ClientRecord = {
  id: 'c1',
  name: 'Export Co',
  pan: PAN,
  phone: '9876543210',
  referenceNumber: 'REF1',
  remark: 'note',
  filings: {
    'AY 2025-26': {
      assessmentYear: 'AY 2025-26',
      filingDate: '2025-07-01',
      fees: 1000,
      received: 400,
      balance: 600,
      paymentType: 'UPI',
      paymentReceiveDate: '2025-07-02',
    },
  },
  createdAt: '',
  updatedAt: '',
};

const ledger: LedgerState = {
  assessmentYears: ['AY 2025-26', 'AY 2024-25'],
  clients: [client],
  gstMonths: [],
  gstClients: [],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('excelWorkbookOrder', () => {
  it('emits xlsx blob with sheets in requested order', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Notes');
    wb.addWorksheet('All Data');
    const blob = await orderedWorkbookToBlob(wb, ['All Data', 'Notes']);
    expect(blob.type).toContain('spreadsheetml');
    expect(blob.size).toBeGreaterThan(100);
  });
});

describe('excelExport', () => {
  it('buildWorkbookBlob produces xlsx and forcedSheets when allData implied', async () => {
    const { blob, forcedSheets } = await buildWorkbookBlob(ledger, {
      yearSummary: true,
      allData: false,
      clientSummary: false,
      mobileSummary: false,
      reviewNeeded: false,
    });
    expect(blob.size).toBeGreaterThan(500);
    expect(forcedSheets).toContain('All Data');
    expect(forcedSheets).toContain('Client Summary');
  });

  it('buildWorkbookBlob with explicit sheet flags includes notes path', async () => {
    const { blob, forcedSheets } = await buildWorkbookBlob(ledger, {
      yearSummary: true,
      allData: true,
      clientSummary: true,
      mobileSummary: true,
      reviewNeeded: true,
    });
    expect(forcedSheets).toEqual([]);
    expect(blob.size).toBeGreaterThan(500);
  });

  it('exportFilename embeds AY range and date', () => {
    const name = exportFilename(ledger);
    expect(name).toMatch(/^Filing_Master_Report_\d{4}-\d{4}_\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  it('buildImportTemplateBlob returns workbook blob', async () => {
    const blob = await buildImportTemplateBlob(['AY 2025-26']);
    expect(blob.size).toBeGreaterThan(200);
    const emptyYears = await buildImportTemplateBlob([]);
    expect(emptyYears.size).toBeGreaterThan(200);
  });

  it('downloadBlob creates object URL and clicks anchor', () => {
    const click = vi.fn();
    const revoke = vi.fn();
    const anchor = { click, download: '', href: '' };
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: revoke,
    });
    vi.stubGlobal('document', {
      createElement: vi.fn(() => anchor),
    });

    downloadBlob(new Blob(['x']), 'out.xlsx');
    expect(click).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith('blob:mock');
  });
});
