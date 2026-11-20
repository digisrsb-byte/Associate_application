/**
 * Builds a demo Filing_Master_Report .xlsx using the existing export format.
 * Does not change sheet layout — only fills it with data/ledger.json.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LedgerState } from '../src/types/ledger.ts';
import {
  buildWorkbookBlob,
  exportFilename,
} from '../src/utils/excelExport.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ledgerPath = join(root, 'data', 'ledger.json');
const outPath = join(root, 'data', 'Filing_Master_Report_DEMO.xlsx');

const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8')) as LedgerState;

const { blob } = await buildWorkbookBlob(ledger, {
  yearSummary: true,
  allData: true,
  clientSummary: true,
  mobileSummary: true,
  reviewNeeded: true,
});

const buf = Buffer.from(await blob.arrayBuffer());
writeFileSync(outPath, buf);

console.log(`Wrote ${outPath}`);
console.log(`Suggested download name: ${exportFilename(ledger)}`);
console.log(
  `IT clients: ${ledger.clients.length}, GST companies: ${ledger.gstClients.length}`
);
