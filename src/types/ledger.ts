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
  /**
   * Legacy plaintext portal password (migrated off disk).
   * Ordinary API responses never include this field.
   */
  password?: string;
  /** AES-256-GCM ciphertext at rest only — never returned to ordinary API clients. */
  passwordEnc?: string;
  /** Present on sanitized API payloads: whether a portal password is stored. */
  hasPortalPassword?: boolean;
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

/** One payment allocated to a specific GST monthly filing. */
export interface GstPaymentEntry {
  id: string;
  amount: number;
  /** Calendar date as YYYY-MM-DD. */
  paymentDate: string;
  paymentMode: string;
  /** Optional payment reference / UTR when provided. */
  reference?: string;
  /**
   * Client-supplied key so retries of the same submit do not create duplicates.
   * Distinct user actions must use distinct keys even if amount/date match.
   */
  idempotencyKey?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface GstMonthlyFiling {
  month: string;
  fees: number;
  interest: number;
  tax: number;
  /** Collectible month total = fees + interest + tax (server-enforced). */
  total: number;
  /** Payments allocated to this month only. */
  payments?: GstPaymentEntry[];
  /** Derived mirror: sum of payments for this month. */
  received?: number;
}

export interface GstClientRecord {
  id: string;
  companyName: string;
  userId: string;
  /** Legacy plaintext — migrated off disk; never in ordinary API responses. */
  password?: string;
  /** AES-256-GCM ciphertext at rest only — never returned to ordinary API clients. */
  passwordEnc?: string;
  /** Present on sanitized API payloads: whether a portal password is stored. */
  hasPortalPassword?: boolean;
  phone: string;
  referenceNumber: string;
  remark?: string;
  /**
   * Company Total Recd (derived when payment-line accounting is active):
   * sum(month-allocated payments) + unallocatedReceived.
   * Pure legacy companies (no payments arrays) may store only this pool value.
   */
  totalReceived: number;
  /**
   * Preserved company-level receipts that have not been allocated to any month.
   * Set when transitioning from a legacy pool onto structured payments; never
   * auto-distributed across months. Not erased by payment edit/delete.
   */
  unallocatedReceived?: number;
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
  /** Sum of payments allocated to months only. */
  allocatedReceived: number;
  /** Unallocated legacy company receipts (not assigned to a month). */
  unallocatedReceived: number;
  /** allocatedReceived + unallocatedReceived (or legacy pool when no payment lines). */
  totalReceived: number;
  /**
   * Company outstanding = max(0, totalBilled − totalReceived).
   * Does not assign unallocated receipts to any month.
   */
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
