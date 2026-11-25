import type {
  ClientRecord,
  FilingRecord,
  GstClientRecord,
  GstMonthlyFiling,
  LedgerState,
} from '../types/ledger.ts';
import { computeBalance, computeGstFilingTotal, sortGstMonths } from '../utils/ledgerUtils.ts';
import type { ImportPolicies } from './validateImport.ts';
import type { ParsedItClient } from './itMappedParse.ts';

export type ImportApplyReport = {
  clientsCreated: number;
  clientsUpdated: number;
  filingsAdded: number;
  filingsUpdated: number;
  filingsSkipped: number;
};

export type IncomingGstCompany = {
  userId: string;
  companyName: string;
  phone: string;
  referenceNumber: string;
  remark: string;
  totalReceived: number;
  filings: Record<
    string,
    { fees: number; interest: number; tax: number; total?: number }
  >;
  /** Already encrypted ciphertext, or omit. */
  passwordEnc?: string;
};

function sanitizeFiling(
  year: string,
  input: {
    filingDate?: string;
    fees?: number;
    received?: number;
    paymentType?: string;
    paymentReceiveDate?: string;
  }
): FilingRecord {
  const fees = Math.max(0, Number(input.fees) || 0);
  const received = Math.max(0, Number(input.received) || 0);
  return {
    assessmentYear: year.trim(),
    filingDate: String(input.filingDate || '').trim(),
    fees,
    received,
    balance: computeBalance(fees, received),
    paymentType: String(input.paymentType || '').trim(),
    paymentReceiveDate: String(input.paymentReceiveDate || '').trim(),
  };
}

function sanitizeGstFiling(
  month: string,
  input: { fees?: number; interest?: number; tax?: number; total?: number }
): GstMonthlyFiling {
  const fees = Math.max(0, Number(input.fees) || 0);
  const interest = Math.max(0, Number(input.interest) || 0);
  const tax = Math.max(0, Number(input.tax) || 0);
  return {
    month: month.trim(),
    fees,
    interest,
    tax,
    total: computeGstFilingTotal(fees, interest, tax),
  };
}

export function applyItImportToLedger(
  state: LedgerState,
  clients: ParsedItClient[],
  policies: ImportPolicies,
  options?: { now?: string; newId?: () => string }
): ImportApplyReport {
  const now = options?.now || new Date().toISOString();
  const newId =
    options?.newId ||
    (() => `cli-${Math.random().toString(36).slice(2, 10)}`);

  const byPan = new Map(
    state.clients.map((c) => [c.pan.toUpperCase(), c] as const)
  );
  const filePans = new Set(clients.map((c) => c.pan.toUpperCase()));

  let clientsCreated = 0;
  let clientsUpdated = 0;
  let filingsAdded = 0;
  let filingsUpdated = 0;
  let filingsSkipped = 0;

  for (const inc of clients) {
    const pan = inc.pan.toUpperCase();
    const existing = byPan.get(pan);
    if (!existing) {
      const filings: Record<string, FilingRecord> = {};
      for (const [ay, f] of Object.entries(inc.filings)) {
        filings[ay] = sanitizeFiling(ay, f);
        filingsAdded++;
      }
      const created: ClientRecord = {
        id: newId(),
        name: inc.name || pan,
        pan,
        phone: inc.phone || '',
        referenceNumber: '',
        remark: '',
        otherMobiles: inc.otherMobiles || undefined,
        nameVariants: inc.nameVariants || undefined,
        filings,
        createdAt: now,
        updatedAt: now,
      };
      state.clients.push(created);
      byPan.set(pan, created);
      clientsCreated++;
      continue;
    }

    let changed = false;
    if (inc.name) {
      existing.name = inc.name;
      changed = true;
    }
    if (inc.phone) {
      existing.phone = inc.phone;
      changed = true;
    }
    if (inc.otherMobiles) {
      existing.otherMobiles = inc.otherMobiles;
      changed = true;
    }
    if (inc.nameVariants) {
      existing.nameVariants = inc.nameVariants;
      changed = true;
    }

    for (const [ay, f] of Object.entries(inc.filings)) {
      if (existing.filings?.[ay]) {
        if (policies.onConflict === 'skip') {
          filingsSkipped++;
        } else {
          existing.filings[ay] = sanitizeFiling(ay, f);
          filingsUpdated++;
          changed = true;
        }
      } else {
        existing.filings = existing.filings || {};
        existing.filings[ay] = sanitizeFiling(ay, f);
        filingsAdded++;
        changed = true;
      }
    }

    if (changed) {
      existing.updatedAt = now;
      clientsUpdated++;
    }
  }

  if (policies.mode === 'replace') {
    state.clients = state.clients.filter((c) =>
      filePans.has(c.pan.toUpperCase())
    );
  }

  return {
    clientsCreated,
    clientsUpdated,
    filingsAdded,
    filingsUpdated,
    filingsSkipped,
  };
}

export function applyGstImportToLedger(
  state: LedgerState,
  companies: IncomingGstCompany[],
  policies: ImportPolicies,
  options?: { now?: string; newId?: () => string }
): ImportApplyReport {
  const now = options?.now || new Date().toISOString();
  const newId =
    options?.newId ||
    (() => `gst-${Math.random().toString(36).slice(2, 10)}`);

  const byUser = new Map(
    state.gstClients.map((c) => [c.userId.toLowerCase(), c] as const)
  );
  const fileUsers = new Set(companies.map((c) => c.userId.toLowerCase()));

  let clientsCreated = 0;
  let clientsUpdated = 0;
  let filingsAdded = 0;
  let filingsUpdated = 0;
  let filingsSkipped = 0;
  const monthsSet = new Set(state.gstMonths);

  for (const inc of companies) {
    const key = inc.userId.toLowerCase();
    const existing = byUser.get(key);
    Object.keys(inc.filings).forEach((m) => monthsSet.add(m));

    if (!existing) {
      const filings: Record<string, GstMonthlyFiling> = {};
      for (const [m, f] of Object.entries(inc.filings)) {
        filings[m] = sanitizeGstFiling(m, f);
        filingsAdded++;
      }
      const created: GstClientRecord = {
        id: newId(),
        companyName: inc.companyName,
        userId: inc.userId,
        phone: inc.phone || '',
        referenceNumber: inc.referenceNumber || '',
        remark: inc.remark || '',
        totalReceived: inc.totalReceived,
        filings,
        createdAt: now,
        updatedAt: now,
      };
      if (inc.passwordEnc) created.passwordEnc = inc.passwordEnc;
      state.gstClients.push(created);
      byUser.set(key, created);
      clientsCreated++;
      continue;
    }

    let changed = false;
    if (inc.companyName && inc.companyName !== existing.companyName) {
      existing.companyName = inc.companyName;
      changed = true;
    }
    if (inc.passwordEnc && inc.passwordEnc !== existing.passwordEnc) {
      existing.passwordEnc = inc.passwordEnc;
      delete existing.password;
      changed = true;
    }
    if (inc.phone && inc.phone !== existing.phone) {
      existing.phone = inc.phone;
      changed = true;
    }
    if (
      inc.referenceNumber &&
      inc.referenceNumber !== existing.referenceNumber
    ) {
      existing.referenceNumber = inc.referenceNumber;
      changed = true;
    }
    if (inc.remark && inc.remark !== (existing.remark || '')) {
      existing.remark = inc.remark;
      changed = true;
    }
    if (
      Number.isFinite(inc.totalReceived) &&
      inc.totalReceived !== existing.totalReceived
    ) {
      existing.totalReceived = inc.totalReceived;
      changed = true;
    }

    for (const [m, f] of Object.entries(inc.filings)) {
      if (existing.filings?.[m]) {
        if (policies.onConflict === 'skip') {
          filingsSkipped++;
        } else {
          existing.filings[m] = sanitizeGstFiling(m, f);
          filingsUpdated++;
          changed = true;
        }
      } else {
        existing.filings = existing.filings || {};
        existing.filings[m] = sanitizeGstFiling(m, f);
        filingsAdded++;
        changed = true;
      }
    }

    if (changed) {
      existing.updatedAt = now;
      clientsUpdated++;
    }
  }

  if (policies.mode === 'replace') {
    state.gstClients = state.gstClients.filter((c) =>
      fileUsers.has(c.userId.toLowerCase())
    );
  }

  state.gstMonths = sortGstMonths([...monthsSet]);

  return {
    clientsCreated,
    clientsUpdated,
    filingsAdded,
    filingsUpdated,
    filingsSkipped,
  };
}
