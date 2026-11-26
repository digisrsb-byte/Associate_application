import { describe, expect, it } from 'vitest';
import {
  matchesGstCompanySearch,
  matchesItClientSearch,
} from '../../src/utils/recordSearch.ts';
import type { ClientRecord, GstClientRecord } from '../../src/types/ledger.ts';

const itClient = {
  id: '1',
  name: 'Acme Traders',
  pan: 'ABCDE1234F',
  phone: '9876543210',
  referenceNumber: 'REF-9',
  remark: 'priority',
  filings: {
    'AY 2026-27': {
      assessmentYear: 'AY 2026-27',
      filingDate: '2026-07-01',
      fees: 1000,
      received: 0,
      balance: 1000,
      paymentType: 'GPay',
      paymentReceiveDate: '',
    },
  },
  createdAt: '',
  updatedAt: '',
} as ClientRecord;

const gstCompany = {
  id: 'g1',
  companyName: 'Nova GST Pvt',
  userId: '27AAAAA0000A1Z5',
  phone: '9000000000',
  referenceNumber: 'G-1',
  remark: '',
  totalReceived: 0,
  filings: {
    'Apr 2026': {
      month: 'Apr 2026',
      fees: 100,
      interest: 0,
      tax: 0,
      total: 100,
      payments: [],
    },
  },
  createdAt: '',
  updatedAt: '',
} as GstClientRecord;

describe('recordSearch', () => {
  it('matches IT by name, PAN, and filing year', () => {
    expect(matchesItClientSearch(itClient, 'acme')).toBe(true);
    expect(matchesItClientSearch(itClient, 'ABCDE1234F')).toBe(true);
    expect(matchesItClientSearch(itClient, '2026-27')).toBe(true);
    expect(matchesItClientSearch(itClient, 'zzz')).toBe(false);
  });

  it('matches GST by company, userId/GSTIN-style id, and month', () => {
    expect(matchesGstCompanySearch(gstCompany, 'nova')).toBe(true);
    expect(matchesGstCompanySearch(gstCompany, '27AAAAA0000A1Z5')).toBe(true);
    expect(matchesGstCompanySearch(gstCompany, 'Apr 2026')).toBe(true);
    expect(matchesGstCompanySearch(gstCompany, 'zzz')).toBe(false);
  });
});
