import crypto from 'crypto';
import type {
  ValidatedGstPayload,
  ValidatedItPayload,
} from './validateImport.ts';

function fp(value: string): string {
  return crypto
    .createHash('sha256')
    .update(String(value).trim().toUpperCase())
    .digest('hex')
    .slice(0, 12);
}

function maskName(name: string): string {
  const t = name.trim();
  if (!t) return '—';
  if (t.length <= 2) return '*'.repeat(t.length);
  return `${t[0]}${'*'.repeat(Math.min(6, t.length - 2))}${t[t.length - 1]}`;
}

export type AnonymizedItSample = {
  panFingerprint: string;
  nameMasked: string;
  filingCount: number;
  assessmentYears: string[];
};

export type AnonymizedGstSample = {
  userIdFingerprint: string;
  companyNameMasked: string;
  filingCount: number;
  months: string[];
  hasPassword: boolean;
};

export function anonymizeItPreview(
  payload: ValidatedItPayload,
  sampleLimit = 5
): {
  samples: AnonymizedItSample[];
  issueCounts: { error: number; warn: number };
  unknownColumns: string[];
  finance: ValidatedItPayload['finance'];
  diff: ValidatedItPayload['diff'];
  validClientCount: number;
  validFilingCount: number;
} {
  const samples = payload.clients.slice(0, sampleLimit).map((c) => ({
    panFingerprint: fp(c.pan),
    nameMasked: maskName(c.name),
    filingCount: Object.keys(c.filings).length,
    assessmentYears: Object.keys(c.filings).slice(0, 8),
  }));
  return {
    samples,
    issueCounts: {
      error: payload.issues.filter((i) => i.level === 'error').length,
      warn: payload.issues.filter((i) => i.level === 'warn').length,
    },
    unknownColumns: payload.unknownColumns,
    finance: payload.finance,
    diff: payload.diff,
    validClientCount: payload.validClientCount,
    validFilingCount: payload.validFilingCount,
  };
}

export function anonymizeGstPreview(
  payload: ValidatedGstPayload,
  sampleLimit = 5
): {
  samples: AnonymizedGstSample[];
  issueCounts: { error: number; warn: number };
  unknownColumns: string[];
  finance: ValidatedGstPayload['finance'];
  diff: ValidatedGstPayload['diff'];
  validCompanyCount: number;
  validFilingCount: number;
} {
  const samples = payload.companies.slice(0, sampleLimit).map((c) => ({
    userIdFingerprint: fp(c.userId),
    companyNameMasked: maskName(c.companyName),
    filingCount: Object.keys(c.filings).length,
    months: Object.keys(c.filings).slice(0, 8),
    hasPassword: c.hasPassword,
  }));
  return {
    samples,
    issueCounts: {
      error: payload.issues.filter((i) => i.level === 'error').length,
      warn: payload.issues.filter((i) => i.level === 'warn').length,
    },
    unknownColumns: payload.unknownColumns,
    finance: payload.finance,
    diff: payload.diff,
    validCompanyCount: payload.validCompanyCount,
    validFilingCount: payload.validFilingCount,
  };
}

/** Safe issue list for API — no PAN/names/passwords. */
export function publicIssues(
  issues: Array<{ level: string; code: string; row?: number; message: string }>,
  limit = 100
) {
  return issues.slice(0, limit).map((i) => ({
    level: i.level,
    code: i.code,
    row: i.row,
    message: i.message,
  }));
}
