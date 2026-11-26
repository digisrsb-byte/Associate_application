import type { ClientRecord, GstClientRecord } from '../types/ledger.ts';

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase();
}

/** Compact form for PAN / User ID style identifiers. */
function compact(s: string): string {
  return s.toLowerCase().replace(/[\s\-_/]/g, '');
}

function haystackMatch(haystack: string, q: string, qCompact: string): boolean {
  const h = haystack.toLowerCase();
  if (!h) return false;
  if (h.includes(q)) return true;
  if (qCompact.length >= 3 && compact(haystack).includes(qCompact)) return true;
  return false;
}

/**
 * Search IT clients by existing fields: name, PAN, phone, ref, remark,
 * and filing period keys / filing dates.
 */
export function matchesItClientSearch(client: ClientRecord, rawQuery: string): boolean {
  const q = normalizeQuery(rawQuery);
  if (!q) return true;
  const qCompact = compact(q);

  if (
    haystackMatch(client.name || '', q, qCompact) ||
    haystackMatch(client.pan || '', q, qCompact) ||
    haystackMatch(client.phone || '', q, qCompact) ||
    haystackMatch(client.referenceNumber || '', q, qCompact) ||
    haystackMatch(client.remark || '', q, qCompact) ||
    haystackMatch(client.otherMobiles || '', q, qCompact) ||
    haystackMatch(client.nameVariants || '', q, qCompact)
  ) {
    return true;
  }

  for (const [year, filing] of Object.entries(client.filings || {})) {
    if (haystackMatch(year, q, qCompact)) return true;
    if (haystackMatch(filing.assessmentYear || '', q, qCompact)) return true;
    if (haystackMatch(filing.filingDate || '', q, qCompact)) return true;
    if (haystackMatch(filing.paymentReceiveDate || '', q, qCompact)) return true;
    if (haystackMatch(filing.paymentType || '', q, qCompact)) return true;
  }
  return false;
}

/**
 * Search GST companies by existing fields: company name, User ID (portal / GSTIN-style id),
 * phone, ref, remark, and monthly filing period keys.
 */
export function matchesGstCompanySearch(
  company: GstClientRecord,
  rawQuery: string
): boolean {
  const q = normalizeQuery(rawQuery);
  if (!q) return true;
  const qCompact = compact(q);

  if (
    haystackMatch(company.companyName || '', q, qCompact) ||
    haystackMatch(company.userId || '', q, qCompact) ||
    haystackMatch(company.phone || '', q, qCompact) ||
    haystackMatch(company.referenceNumber || '', q, qCompact) ||
    haystackMatch(company.remark || '', q, qCompact)
  ) {
    return true;
  }

  for (const [month, filing] of Object.entries(company.filings || {})) {
    if (haystackMatch(month, q, qCompact)) return true;
    if (haystackMatch(filing.month || '', q, qCompact)) return true;
  }
  return false;
}
