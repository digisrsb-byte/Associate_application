export type MainSection = 'it' | 'gst';

export interface FilingRecord {
  assessmentYear: string;
  filingDate: string;
  fees: number;
  received: number;
  balance: number;
  paymentType: string;
  paymentReceiveDate: string;
}

export interface ClientRecord {
  id: string;
  name: string;
  pan: string;
  password: string;
  phone: string;
  referenceNumber: string;
  remark?: string;
  /** "Other Mobile(s)" from Client Summary Excel sheet */
  otherMobiles?: string;
  /** "Name Variants (if differ)" from Client Summary Excel sheet */
  nameVariants?: string;
  filings: Record<string, FilingRecord>;
  createdAt: string;
  updatedAt: string;
}

export interface GstMonthlyFiling {
  month: string;
  fees: number;
  interest: number;
  tax: number;
  total: number;
}

export interface GstClientRecord {
  id: string;
  companyName: string;
  userId: string;
  password: string;
  phone: string;
  referenceNumber: string;
  remark?: string;
  totalReceived: number;
  filings: Record<string, GstMonthlyFiling>;
  createdAt: string;
  updatedAt: string;
}

export interface LedgerState {
  assessmentYears: string[];
  clients: ClientRecord[];
  gstMonths: string[];
  gstClients: GstClientRecord[];
}

export interface ClientTotals {
  totalReceived: number;
  outstandingTotal: number;
}

export interface GstClientTotals {
  totalFees: number;
  totalInterest: number;
  totalTax: number;
  totalBilled: number;
  totalReceived: number;
  outstandingTotal: number;
}

export const PAYMENT_TYPES = [
  'GPay',
  'PhonePe',
  'P-Pay',
  'BOB',
  'Cash',
  'UPI',
  'Bank Transfer',
  'Pending',
] as const;
