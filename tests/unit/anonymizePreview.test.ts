import { describe, expect, it } from 'vitest';
import {
  anonymizeGstPreview,
  anonymizeItPreview,
  publicIssues,
} from '../../src/import/anonymizePreview.ts';
import type {
  ValidatedGstPayload,
  ValidatedItPayload,
} from '../../src/import/validateImport.ts';

describe('anonymizePreview', () => {
  it('masks IT names and fingerprints PAN without exposing raw values', () => {
    const payload = {
      clients: [
        {
          pan: 'ABCDE1234F',
          name: 'Acme Corp',
          filings: { 'AY 2024-25': { fees: 1, received: 0, balance: 1 } },
        },
      ],
      issues: [
        { level: 'error', code: 'E1', message: 'bad' },
        { level: 'warn', code: 'W1', message: 'careful' },
      ],
      unknownColumns: ['X'],
      finance: { totalFees: 1, totalReceived: 0, totalBalance: 1 },
      diff: { clientsAdded: 1 },
      validClientCount: 1,
      validFilingCount: 1,
    } as unknown as ValidatedItPayload;

    const out = anonymizeItPreview(payload, 5);
    expect(out.samples).toHaveLength(1);
    expect(out.samples[0].nameMasked).toMatch(/^A\*+p$/);
    expect(out.samples[0].panFingerprint).toHaveLength(12);
    expect(out.samples[0].panFingerprint).not.toContain('ABCDE');
    expect(out.issueCounts).toEqual({ error: 1, warn: 1 });
    expect(out.validClientCount).toBe(1);
  });

  it('masks GST company names and never returns passwords', () => {
    const payload = {
      companies: [
        {
          userId: 'user@example.test',
          companyName: 'Beta Ltd',
          filings: { 'Apr 2026': { fees: 2, interest: 0, tax: 0, total: 2 } },
          hasPassword: true,
        },
      ],
      issues: [],
      unknownColumns: [],
      finance: {},
      diff: {},
      validCompanyCount: 1,
      validFilingCount: 1,
    } as unknown as ValidatedGstPayload;

    const out = anonymizeGstPreview(payload);
    expect(out.samples[0].companyNameMasked).toMatch(/^B\*+d$/);
    expect(out.samples[0].hasPassword).toBe(true);
    expect(out.samples[0].userIdFingerprint).toHaveLength(12);
    expect(JSON.stringify(out)).not.toMatch(/secret-pass|plaintext/i);
  });

  it('publicIssues truncates and strips to safe fields', () => {
    const issues = Array.from({ length: 3 }, (_, i) => ({
      level: 'error',
      code: `C${i}`,
      row: i + 1,
      message: `m${i}`,
      pan: 'SECRET',
    }));
    const out = publicIssues(issues as never, 2);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      level: 'error',
      code: 'C0',
      row: 1,
      message: 'm0',
    });
    expect(out[0]).not.toHaveProperty('pan');
  });
});
