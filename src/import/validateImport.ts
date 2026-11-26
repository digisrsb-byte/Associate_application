import type { LedgerState } from '../types/ledger.ts';
import {
  isValidPanFormat,
  normalizePanInput,
  validateOptionalGstin,
} from '../utils/fieldValidation.ts';
import {
  computeBalance,
  computeGstFilingTotal,
} from '../utils/ledgerUtils.ts';
import type { ColumnMapping } from './columnMapping.ts';
import { unmappedSourceHeadings } from './columnMapping.ts';
import type { ImportDomain } from './fieldCatalog.ts';
import type { GstParseResult, ParsedGstCompany } from './gstMappedParse.ts';
import type { ItParseResult, ParsedItClient } from './itMappedParse.ts';

export type ImportIssue = {
  level: 'error' | 'warn';
  code: string;
  row?: number;
  message: string;
};

export type ImportPolicies = {
  mode: 'merge' | 'replace';
  onConflict: 'update' | 'skip';
};

export type FinanceReconciliation = {
  itFees: number;
  itReceived: number;
  itCalculatedOutstanding: number;
  itImportedOutstanding: number | null;
  itBalanceDiscrepancies: number;
  gstFees: number;
  gstInterest: number;
  gstTax: number;
  gstCalculatedTotal: number;
  gstTotalDiscrepancies: number;
};

export type DiffCounts = {
  newClients: number;
  existingClients: number;
  filingsToAdd: number;
  filingsToUpdate: number;
  filingsToSkip: number;
  invalidRecords: number;
};

export type ValidatedItPayload = {
  domain: 'it';
  clients: ParsedItClient[];
  issues: ImportIssue[];
  unknownColumns: string[];
  finance: FinanceReconciliation;
  diff: DiffCounts;
  validClientCount: number;
  validFilingCount: number;
};

export type ValidatedGstPayload = {
  domain: 'gst';
  companies: Array<Omit<ParsedGstCompany, 'password'> & { hasPassword: boolean }>;
  /** Passwords kept server-side only for commit — not for API responses. */
  passwordsByUserId: Record<string, string>;
  issues: ImportIssue[];
  unknownColumns: string[];
  finance: FinanceReconciliation;
  diff: DiffCounts;
  validCompanyCount: number;
  validFilingCount: number;
};

function emptyFinance(): FinanceReconciliation {
  return {
    itFees: 0,
    itReceived: 0,
    itCalculatedOutstanding: 0,
    itImportedOutstanding: null,
    itBalanceDiscrepancies: 0,
    gstFees: 0,
    gstInterest: 0,
    gstTax: 0,
    gstCalculatedTotal: 0,
    gstTotalDiscrepancies: 0,
  };
}

export function validateItImport(
  parsed: ItParseResult,
  ledger: LedgerState,
  policies: ImportPolicies,
  headings: string[],
  mapping: ColumnMapping
): ValidatedItPayload {
  const issues: ImportIssue[] = [...parsed.issues];
  const validClients: ParsedItClient[] = [];
  let invalidRecords = 0;
  const finance = emptyFinance();
  let importedOutstandingSum = 0;
  let hasImportedOutstanding = false;

  const existingPans = new Set(
    ledger.clients.map((c) => c.pan.toUpperCase())
  );

  let newClients = 0;
  let existingClients = 0;
  let filingsToAdd = 0;
  let filingsToUpdate = 0;
  let filingsToSkip = 0;
  let validFilingCount = 0;

  for (const c of parsed.clients) {
    const pan = normalizePanInput(c.pan);
    if (!pan || !isValidPanFormat(pan)) {
      invalidRecords++;
      issues.push({
        level: 'error',
        code: 'invalid_pan',
        message: 'Invalid PAN format — client excluded.',
      });
      continue;
    }
    if (!c.name?.trim()) {
      invalidRecords++;
      issues.push({
        level: 'error',
        code: 'missing_name',
        message: 'Client name required — client excluded.',
      });
      continue;
    }

    const filings: ParsedItClient['filings'] = {};
    for (const [ay, f] of Object.entries(c.filings)) {
      const calculated = computeBalance(f.fees, f.received);
      finance.itFees += f.fees;
      finance.itReceived += f.received;
      finance.itCalculatedOutstanding += calculated;
      if (f.outstanding != null) {
        hasImportedOutstanding = true;
        importedOutstandingSum += f.outstanding;
        if (Math.abs(f.outstanding - calculated) > 0.009) {
          finance.itBalanceDiscrepancies++;
          issues.push({
            level: 'warn',
            row: f.sourceRow,
            code: 'balance_mismatch',
            message:
              'Imported outstanding differs from fees − received; calculated balance will be stored on commit.',
          });
        }
      }
      filings[ay] = f;
      validFilingCount++;

      const app = ledger.clients.find((x) => x.pan.toUpperCase() === pan);
      if (!app?.filings?.[ay]) filingsToAdd++;
      else if (policies.onConflict === 'update') filingsToUpdate++;
      else filingsToSkip++;
    }

    if (existingPans.has(pan)) existingClients++;
    else newClients++;

    validClients.push({
      ...c,
      pan,
      filings,
    });
  }

  if (hasImportedOutstanding) {
    finance.itImportedOutstanding = importedOutstandingSum;
  }

  return {
    domain: 'it',
    clients: validClients,
    issues,
    unknownColumns: unmappedSourceHeadings(headings, mapping),
    finance,
    diff: {
      newClients,
      existingClients,
      filingsToAdd,
      filingsToUpdate,
      filingsToSkip,
      invalidRecords,
    },
    validClientCount: validClients.length,
    validFilingCount,
  };
}

export function validateGstImport(
  parsed: GstParseResult,
  ledger: LedgerState,
  policies: ImportPolicies,
  headings: string[],
  mapping: ColumnMapping
): ValidatedGstPayload {
  const issues: ImportIssue[] = [...parsed.issues];
  const validCompanies: ValidatedGstPayload['companies'] = [];
  const passwordsByUserId: Record<string, string> = {};
  let invalidRecords = 0;
  const finance = emptyFinance();

  const existingUsers = new Set(
    ledger.gstClients.map((c) => c.userId.toLowerCase())
  );

  let newClients = 0;
  let existingClients = 0;
  let filingsToAdd = 0;
  let filingsToUpdate = 0;
  let filingsToSkip = 0;
  let validFilingCount = 0;

  for (const c of parsed.companies) {
    if (!c.userId?.trim() || !c.companyName?.trim()) {
      invalidRecords++;
      issues.push({
        level: 'error',
        code: 'missing_company_identity',
        message: 'Company name and User ID required — company excluded.',
      });
      continue;
    }

    if (c.gstin) {
      const g = validateOptionalGstin(c.gstin);
      if (!g.ok) {
        issues.push({
          level: 'warn',
          code: 'invalid_gstin',
          message: g.error,
        });
      }
    }

    const filings: ParsedGstCompany['filings'] = {};
    for (const [month, f] of Object.entries(c.filings)) {
      const calculated = computeGstFilingTotal(f.fees, f.interest, f.tax);
      finance.gstFees += f.fees;
      finance.gstInterest += f.interest;
      finance.gstTax += f.tax;
      finance.gstCalculatedTotal += calculated;
      if (f.totalImported != null && Math.abs(f.totalImported - calculated) > 0.009) {
        finance.gstTotalDiscrepancies++;
        issues.push({
          level: 'warn',
          row: f.sourceRow,
          code: 'gst_total_mismatch',
          message:
            'Imported total differs from fees+interest+tax; calculated total will be stored on commit.',
        });
      }
      filings[month] = f;
      validFilingCount++;

      const app = ledger.gstClients.find(
        (x) => x.userId.toLowerCase() === c.userId.toLowerCase()
      );
      if (!app?.filings?.[month]) filingsToAdd++;
      else if (policies.onConflict === 'update') filingsToUpdate++;
      else filingsToSkip++;
    }

    const key = c.userId.toLowerCase();
    if (existingUsers.has(key)) existingClients++;
    else newClients++;

    if (c.password) passwordsByUserId[c.userId] = c.password;

    validCompanies.push({
      userId: c.userId,
      companyName: c.companyName,
      phone: c.phone,
      referenceNumber: c.referenceNumber,
      remark: c.remark,
      totalReceived: c.totalReceived,
      gstin: c.gstin,
      filings,
      hasPassword: Boolean(c.password),
    });
  }

  return {
    domain: 'gst',
    companies: validCompanies,
    passwordsByUserId,
    issues,
    unknownColumns: unmappedSourceHeadings(headings, mapping),
    finance,
    diff: {
      newClients,
      existingClients,
      filingsToAdd,
      filingsToUpdate,
      filingsToSkip,
      invalidRecords,
    },
    validCompanyCount: validCompanies.length,
    validFilingCount,
  };
}

export function canCommit(
  domain: ImportDomain,
  payload: ValidatedItPayload | ValidatedGstPayload
): boolean {
  const errors = payload.issues.filter((i) => i.level === 'error');
  // Allow commit if we still have valid records even with some row errors
  if (domain === 'it') {
    return (payload as ValidatedItPayload).validClientCount > 0;
  }
  return (payload as ValidatedGstPayload).validCompanyCount > 0 && errors.every(
    (e) => e.code !== 'sheet_missing'
  );
}
