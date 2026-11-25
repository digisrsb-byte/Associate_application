import type { ClientRecord, GstClientRecord } from '../types/ledger.ts';
import {
  computeBalance,
  computeGstClientTotals,
  computeGstFilingOutstanding,
  computeGstFilingReceived,
  computeGstFilingTotal,
  getGstFilingCollectibleTotal,
  getGstUnallocatedReceived,
  sortAssessmentYears,
  sortGstMonths,
} from './ledgerUtils.ts';

export interface YearSummaryRow {
  year: string;
  entries: number;
  uniqueClients: number;
  amountBilled: number;
  received: number;
  outstanding: number;
  collectionPct: number;
}

export interface YearsFiledBucket {
  yearsCount: number;
  clientCount: number;
}

export interface YearSummaryResult {
  rows: YearSummaryRow[];
  totalEntries: number;
  totalUniqueClients: number;
  totalBilled: number;
  totalReceived: number;
  totalOutstanding: number;
  totalCollectionPct: number;
  buckets: YearsFiledBucket[];
  totalBucketClients: number;
}

export interface ClientSummaryRow {
  id: string;
  pan: string;
  name: string;
  mobile: string;
  yearBilled: Record<string, number | null>;
  yearsFiled: number;
  firstAy: string;
  lastAy: string;
  totalEntries: number;
  totalBilled: number;
  totalReceived: number;
  outstanding: number;
}

export interface MobileSummaryRow {
  mobile: string;
  clientsCount: number;
  namesLinked: string[];
  pansLinked: string[];
  yearBilled: Record<string, number | null>;
  yearsFiled: number;
  firstAy: string;
  lastAy: string;
  totalEntries: number;
  totalBilled: number;
  totalReceived: number;
  outstanding: number;
  remark: string;
}

export function computeYearSummary(
  clients: ClientRecord[],
  years: string[]
): YearSummaryResult {
  const sortedYears = sortAssessmentYears(years);
  const rows: YearSummaryRow[] = [];
  const overallUniqueClients = new Set<string>();
  const bucketMap = new Map<number, number>();

  let totalEntries = 0;
  let totalBilled = 0;
  let totalReceived = 0;
  let totalOutstanding = 0;

  for (const year of sortedYears) {
    let entries = 0;
    const uniqueInYear = new Set<string>();
    let amountBilled = 0;
    let received = 0;
    let outstanding = 0;

    for (const client of clients) {
      const f = client.filings?.[year];
      if (!f) continue;

      entries += 1;
      uniqueInYear.add(client.pan);
      overallUniqueClients.add(client.pan);

      const billed = Number(f.fees) || 0;
      const recd = Number(f.received) || 0;
      const bal =
        typeof f.balance === 'number' && !Number.isNaN(f.balance)
          ? Math.max(0, f.balance)
          : computeBalance(billed, recd);

      amountBilled += billed;
      received += recd;
      outstanding += bal;
    }

    const collectionPct = amountBilled > 0 ? (received / amountBilled) * 100 : 0;
    rows.push({
      year,
      entries,
      uniqueClients: uniqueInYear.size,
      amountBilled,
      received,
      outstanding,
      collectionPct,
    });

    totalEntries += entries;
    totalBilled += amountBilled;
    totalReceived += received;
    totalOutstanding += outstanding;
  }

  for (const client of clients) {
    const count = Object.keys(client.filings || {}).length;
    if (count > 0) {
      bucketMap.set(count, (bucketMap.get(count) || 0) + 1);
    }
  }

  const buckets: YearsFiledBucket[] = [...bucketMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([yearsCount, clientCount]) => ({ yearsCount, clientCount }));

  const totalBucketClients = buckets.reduce((sum, b) => sum + b.clientCount, 0);
  const totalCollectionPct = totalBilled > 0 ? (totalReceived / totalBilled) * 100 : 0;

  return {
    rows,
    totalEntries,
    totalUniqueClients: overallUniqueClients.size,
    totalBilled,
    totalReceived,
    totalOutstanding,
    totalCollectionPct,
    buckets,
    totalBucketClients,
  };
}

export function computeClientSummaries(
  clients: ClientRecord[],
  years: string[]
): ClientSummaryRow[] {
  const sortedYears = sortAssessmentYears(years);

  return clients.map((client) => {
    const clientYears = sortAssessmentYears(Object.keys(client.filings || {}));
    const yearBilled: Record<string, number | null> = {};

    let totalBilled = 0;
    let totalReceived = 0;
    let outstanding = 0;

    for (const yr of sortedYears) {
      const f = client.filings?.[yr];
      if (f) {
        const fees = Number(f.fees) || 0;
        const recd = Number(f.received) || 0;
        const bal =
          typeof f.balance === 'number' && !Number.isNaN(f.balance)
            ? Math.max(0, f.balance)
            : computeBalance(fees, recd);
        yearBilled[yr] = fees;
        totalBilled += fees;
        totalReceived += recd;
        outstanding += bal;
      } else {
        yearBilled[yr] = null;
      }
    }

    return {
      id: client.id,
      pan: client.pan,
      name: client.name,
      mobile: client.phone || '',
      yearBilled,
      yearsFiled: clientYears.length,
      firstAy: clientYears[0] || '—',
      lastAy: clientYears[clientYears.length - 1] || '—',
      totalEntries: clientYears.length,
      totalBilled,
      totalReceived,
      outstanding,
    };
  });
}

export function computeMobileSummaries(
  clients: ClientRecord[],
  years: string[]
): MobileSummaryRow[] {
  const sortedYears = sortAssessmentYears(years);
  const groups = new Map<string, ClientRecord[]>();

  for (const client of clients) {
    const key = (client.phone || '').trim() || 'No Mobile';
    const list = groups.get(key) || [];
    list.push(client);
    groups.set(key, list);
  }

  const rows: MobileSummaryRow[] = [];

  for (const [mobile, groupClients] of groups.entries()) {
    const namesLinked = [...new Set(groupClients.map((c) => c.name))];
    const pansLinked = [...new Set(groupClients.map((c) => c.pan))];
    const allYearsSet = new Set<string>();
    const yearBilled: Record<string, number | null> = {};

    let totalEntries = 0;
    let totalBilled = 0;
    let totalReceived = 0;
    let outstanding = 0;

    for (const yr of sortedYears) {
      let yrSum = 0;
      let yrCount = 0;
      for (const c of groupClients) {
        const f = c.filings?.[yr];
        if (!f) continue;
        allYearsSet.add(yr);
        yrCount += 1;
        totalEntries += 1;

        const fees = Number(f.fees) || 0;
        const recd = Number(f.received) || 0;
        const bal =
          typeof f.balance === 'number' && !Number.isNaN(f.balance)
            ? Math.max(0, f.balance)
            : computeBalance(fees, recd);

        yrSum += fees;
        totalBilled += fees;
        totalReceived += recd;
        outstanding += bal;
      }
      yearBilled[yr] = yrCount > 0 ? yrSum : null;
    }

    const sortedGroupYears = sortAssessmentYears([...allYearsSet]);
    const remarks = [...new Set(groupClients.map((c) => (c.remark || '').trim()).filter(Boolean))];

    rows.push({
      mobile,
      clientsCount: pansLinked.length,
      namesLinked,
      pansLinked,
      yearBilled,
      yearsFiled: sortedGroupYears.length,
      firstAy: sortedGroupYears[0] || '—',
      lastAy: sortedGroupYears[sortedGroupYears.length - 1] || '—',
      totalEntries,
      totalBilled,
      totalReceived,
      outstanding,
      remark: remarks.join(' · '),
    });
  }

  return rows.sort((a, b) => {
    if (a.mobile === 'No Mobile') return 1;
    if (b.mobile === 'No Mobile') return -1;
    return b.totalBilled - a.totalBilled || a.mobile.localeCompare(b.mobile);
  });
}

// ---------- GST Summary Computations ----------

export interface GstMonthSummaryRow {
  month: string;
  companies: number;
  fees: number;
  interest: number;
  tax: number;
  totalBilled: number;
}

export interface GstMonthSummaryResult {
  rows: GstMonthSummaryRow[];
  totalEntries: number;
  totalUniqueCompanies: number;
  totalFees: number;
  totalInterest: number;
  totalTax: number;
  totalBilled: number;
  /** Payments on filings in `months` only (not company unallocated). */
  totalReceived: number;
  /** Σ per-filing outstanding for filings in `months`. */
  totalOutstanding: number;
  /** Company-level unallocated — not included in totalReceived. */
  unallocatedReceived: number;
}

export interface GstFyDashboardTotals {
  totalBilled: number;
  /** Sum of computeGstFilingReceived for filings in `months` (filing month FY, not paymentDate). */
  totalReceived: number;
  /** Sum of computeGstFilingOutstanding — overpayment does not cross months. */
  totalOutstanding: number;
  totalEntries: number;
  /** Company unallocated receipts; never folded into totalReceived. */
  unallocatedReceived: number;
}

/**
 * Option A GST FY / month-set dashboard totals.
 * Received = payments (or legacy month scalar) on filings whose month ∈ `months`.
 * Outstanding = Σ month outstanding for those filings.
 * Unallocated is returned separately and is never assigned to an FY.
 */
export function computeGstFyDashboardTotals(
  clients: GstClientRecord[],
  months: string[]
): GstFyDashboardTotals {
  const monthSet = new Set(months);
  let totalBilled = 0;
  let totalReceived = 0;
  let totalOutstanding = 0;
  let totalEntries = 0;
  let unallocatedReceived = 0;

  for (const client of clients) {
    unallocatedReceived += getGstUnallocatedReceived(client);
    for (const [month, filing] of Object.entries(client.filings || {})) {
      if (!monthSet.has(month)) continue;
      totalEntries += 1;
      totalBilled += getGstFilingCollectibleTotal(filing);
      totalReceived += computeGstFilingReceived(filing);
      totalOutstanding += computeGstFilingOutstanding(filing);
    }
  }

  return {
    totalBilled,
    totalReceived,
    totalOutstanding,
    totalEntries,
    unallocatedReceived,
  };
}

export interface GstClientSummaryRow {
  id: string;
  companyName: string;
  userId: string;
  phone: string;
  referenceNumber: string;
  remark: string;
  monthTotals: Record<string, number | null>;
  monthsFiled: number;
  totalFees: number;
  totalInterest: number;
  totalTax: number;
  totalBilled: number;
  totalReceived: number;
  /** Company-level unallocated legacy receipts (not assigned to a month). */
  unallocatedReceived: number;
  outstanding: number;
}

export function computeGstMonthSummary(
  clients: GstClientRecord[],
  months: string[]
): GstMonthSummaryResult {
  const sortedMonths = sortGstMonths(months);
  const rows: GstMonthSummaryRow[] = [];
  const overallUniqueCompanies = new Set<string>();

  let totalEntries = 0;
  let totalFees = 0;
  let totalInterest = 0;
  let totalTax = 0;
  let totalBilled = 0;

  for (const month of sortedMonths) {
    const uniqueInMonth = new Set<string>();
    let feesSum = 0;
    let interestSum = 0;
    let taxSum = 0;
    let billedSum = 0;

    for (const client of clients) {
      const f = client.filings?.[month];
      if (!f) continue;

      totalEntries += 1;
      uniqueInMonth.add(client.id);
      overallUniqueCompanies.add(client.id);

      const fees = Math.max(0, Number(f.fees) || 0);
      const interest = Math.max(0, Number(f.interest) || 0);
      const tax = Math.max(0, Number(f.tax) || 0);
      const total =
        typeof f.total === 'number' && Number.isFinite(f.total)
          ? Math.max(0, f.total)
          : computeGstFilingTotal(fees, interest, tax);

      feesSum += fees;
      interestSum += interest;
      taxSum += tax;
      billedSum += total;
    }

    rows.push({
      month,
      companies: uniqueInMonth.size,
      fees: feesSum,
      interest: interestSum,
      tax: taxSum,
      totalBilled: billedSum,
    });

    totalFees += feesSum;
    totalInterest += interestSum;
    totalTax += taxSum;
    totalBilled += billedSum;
  }

  const scoped = computeGstFyDashboardTotals(clients, sortedMonths);

  return {
    rows,
    totalEntries,
    totalUniqueCompanies: overallUniqueCompanies.size,
    totalFees,
    totalInterest,
    totalTax,
    totalBilled,
    totalReceived: scoped.totalReceived,
    totalOutstanding: scoped.totalOutstanding,
    unallocatedReceived: scoped.unallocatedReceived,
  };
}

export function computeGstClientSummaries(
  clients: GstClientRecord[],
  months: string[]
): GstClientSummaryRow[] {
  const sortedMonths = sortGstMonths(months);

  return clients.map((client) => {
    const clientMonths = sortGstMonths(Object.keys(client.filings || {}));
    const monthTotals: Record<string, number | null> = {};

    let totalFees = 0;
    let totalInterest = 0;
    let totalTax = 0;
    let totalBilled = 0;

    for (const m of sortedMonths) {
      const f = client.filings?.[m];
      if (f) {
        const fees = Math.max(0, Number(f.fees) || 0);
        const interest = Math.max(0, Number(f.interest) || 0);
        const tax = Math.max(0, Number(f.tax) || 0);
        const total =
          typeof f.total === 'number' && Number.isFinite(f.total)
            ? Math.max(0, f.total)
            : computeGstFilingTotal(fees, interest, tax);

        monthTotals[m] = total;
        totalFees += fees;
        totalInterest += interest;
        totalTax += tax;
        totalBilled += total;
      } else {
        monthTotals[m] = null;
      }
    }

    const derived = computeGstClientTotals(client);

    return {
      id: client.id,
      companyName: client.companyName,
      userId: client.userId,
      phone: client.phone || '',
      referenceNumber: client.referenceNumber || '',
      remark: client.remark || '',
      monthTotals,
      monthsFiled: clientMonths.length,
      totalFees,
      totalInterest,
      totalTax,
      totalBilled,
      totalReceived: derived.totalReceived,
      unallocatedReceived: derived.unallocatedReceived,
      outstanding: derived.outstandingTotal,
    };
  });
}
