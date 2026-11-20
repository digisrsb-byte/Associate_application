/**
 * Builds a demo GST Filing Master Report .xlsx (does not change sheet layout).
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LedgerState } from '../src/types/ledger.ts';
import {
  buildGstWorkbookBlob,
  gstExportFilename,
} from '../src/utils/gstExcelExport.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'data', 'GST_Filing_Master_Report_DEMO.xlsx');

const now = new Date().toISOString();
const months = [
  'Apr 2025',
  'May 2025',
  'Jun 2025',
  'Jul 2025',
  'Aug 2025',
  'Sep 2025',
  'Oct 2025',
  'Nov 2025',
  'Dec 2025',
  'Jan 2026',
  'Feb 2026',
  'Mar 2026',
  'Apr 2026',
  'May 2026',
  'Jun 2026',
  'Jul 2026',
  'Aug 2026',
  'Sep 2026',
  'Oct 2026',
  'Nov 2026',
];

const demo: LedgerState = {
  assessmentYears: [],
  clients: [],
  gstMonths: months,
  gstClients: [
    {
      id: 'gst-demo-1',
      companyName: 'Sharma Traders Pvt Ltd',
      userId: 'sharma.traders',
      password: 'NOT SET',
      phone: '9876501122',
      referenceNumber: 'GST-REF-01',
      remark: 'Monthly GSTR-3B — regular filer',
      totalReceived: 185000,
      filings: {
        'Apr 2025': { month: 'Apr 2025', fees: 2000, interest: 0, tax: 14500, total: 16500 },
        'May 2025': { month: 'May 2025', fees: 2000, interest: 0, tax: 15200, total: 17200 },
        'Jun 2025': { month: 'Jun 2025', fees: 2000, interest: 80, tax: 16000, total: 18080 },
        'Jul 2025': { month: 'Jul 2025', fees: 2000, interest: 0, tax: 14800, total: 16800 },
        'Aug 2025': { month: 'Aug 2025', fees: 2000, interest: 0, tax: 15500, total: 17500 },
        'Sep 2025': { month: 'Sep 2025', fees: 2000, interest: 0, tax: 17000, total: 19000 },
        'Oct 2025': { month: 'Oct 2025', fees: 2200, interest: 0, tax: 16200, total: 18400 },
        'Nov 2025': { month: 'Nov 2025', fees: 2200, interest: 0, tax: 15800, total: 18000 },
        'Dec 2025': { month: 'Dec 2025', fees: 2200, interest: 100, tax: 17100, total: 19400 },
        'Jan 2026': { month: 'Jan 2026', fees: 2200, interest: 0, tax: 16500, total: 18700 },
        'Feb 2026': { month: 'Feb 2026', fees: 2200, interest: 0, tax: 14900, total: 17100 },
        'Mar 2026': { month: 'Mar 2026', fees: 2200, interest: 0, tax: 18200, total: 20400 },
        'Apr 2026': { month: 'Apr 2026', fees: 2500, interest: 0, tax: 18500, total: 21000 },
        'May 2026': { month: 'May 2026', fees: 2500, interest: 0, tax: 17200, total: 19700 },
        'Jun 2026': { month: 'Jun 2026', fees: 2500, interest: 150, tax: 20100, total: 22750 },
        'Jul 2026': { month: 'Jul 2026', fees: 2500, interest: 0, tax: 16800, total: 19300 },
        'Aug 2026': { month: 'Aug 2026', fees: 2500, interest: 0, tax: 19200, total: 21700 },
        'Sep 2026': { month: 'Sep 2026', fees: 2500, interest: 0, tax: 21000, total: 23500 },
        'Oct 2026': { month: 'Oct 2026', fees: 2500, interest: 0, tax: 19800, total: 22300 },
        'Nov 2026': { month: 'Nov 2026', fees: 2500, interest: 0, tax: 20500, total: 23000 },
      },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'gst-demo-2',
      companyName: 'Nair Electronics',
      userId: 'nair.electronics',
      password: 'NOT SET',
      phone: '9812345670',
      referenceNumber: 'GST-REF-02',
      remark: 'All dues cleared till Aug',
      totalReceived: 68500,
      filings: {
        'Nov 2025': { month: 'Nov 2025', fees: 1600, interest: 0, tax: 7800, total: 9400 },
        'Dec 2025': { month: 'Dec 2025', fees: 1600, interest: 0, tax: 8100, total: 9700 },
        'Jan 2026': { month: 'Jan 2026', fees: 1600, interest: 0, tax: 7500, total: 9100 },
        'Feb 2026': { month: 'Feb 2026', fees: 1600, interest: 50, tax: 7200, total: 8850 },
        'Mar 2026': { month: 'Mar 2026', fees: 1600, interest: 0, tax: 8400, total: 10000 },
        'Apr 2026': { month: 'Apr 2026', fees: 1800, interest: 0, tax: 9200, total: 11000 },
        'May 2026': { month: 'May 2026', fees: 1800, interest: 0, tax: 8800, total: 10600 },
        'Jun 2026': { month: 'Jun 2026', fees: 1800, interest: 0, tax: 9500, total: 11300 },
        'Jul 2026': { month: 'Jul 2026', fees: 1800, interest: 0, tax: 9100, total: 10900 },
        'Aug 2026': { month: 'Aug 2026', fees: 1800, interest: 0, tax: 8600, total: 10400 },
      },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'gst-demo-3',
      companyName: 'Verma Logistics LLP',
      userId: 'verma.logistics',
      password: 'NOT SET',
      phone: '9765012345',
      referenceNumber: 'GST-REF-03',
      remark: 'Outstanding balance — follow up',
      totalReceived: 15000,
      filings: {
        'Apr 2026': { month: 'Apr 2026', fees: 3000, interest: 200, tax: 24500, total: 27700 },
        'May 2026': { month: 'May 2026', fees: 3000, interest: 0, tax: 22800, total: 25800 },
        'Jun 2026': { month: 'Jun 2026', fees: 3000, interest: 450, tax: 26100, total: 29550 },
        'Jul 2026': { month: 'Jul 2026', fees: 3000, interest: 0, tax: 23900, total: 26900 },
        'Aug 2026': { month: 'Aug 2026', fees: 3000, interest: 0, tax: 25200, total: 28200 },
        'Sep 2026': { month: 'Sep 2026', fees: 3000, interest: 300, tax: 27000, total: 30300 },
        'Oct 2026': { month: 'Oct 2026', fees: 3000, interest: 0, tax: 24800, total: 27800 },
      },
      createdAt: now,
      updatedAt: now,
    },
  ],
};

const blob = await buildGstWorkbookBlob(demo, {
  monthSummary: true,
  allData: true,
  sheetView: true,
  companySummary: true,
});
writeFileSync(outPath, Buffer.from(await blob.arrayBuffer()));
console.log(`Wrote ${outPath}`);
console.log(`Suggested name: ${gstExportFilename(demo)}`);
console.log(`GST companies: ${demo.gstClients.length}`);
