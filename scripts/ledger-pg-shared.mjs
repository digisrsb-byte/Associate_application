/**
 * Shared Phase 2 ledger parse / portal-password / reconcile helpers.
 * Never log PAN, phone, passwords, ciphertext, or keys.
 *
 * ## GST accounting models (import/verify) — Option D
 *
 * Per filing (migration 004):
 *   payments_present = Array.isArray(filing.payments)
 *   legacy_received  = filing.received when payments_present is false (NULL if absent)
 *
 * **Payment-line accounting** (company-level) — any filing has a `payments`
 * array (including empty `[]`). Then:
 *   totalReceived MUST equal sum(all allocated payment lines) + unallocatedReceived.
 * Do NOT include legacy filing-level received in this company formula.
 * Filing received is derived from payment line sums on load.
 *
 * **Legacy pool accounting** — no filing has a `payments` property.
 * Company `totalReceived` is the pool SoR; each filing's scalar `received`
 * is stored in `gst_filings.legacy_received` (NULL when omitted). Values
 * are not rewritten into synthetic payment lines.
 *
 * **Empty `payments: []`** — payments_present=true, legacy_received=NULL,
 * no `gst_payments` rows. Repository load returns `payments: []`.
 *
 * Distinctions preserved: missing payments | empty [] | non-empty array.
 */
import fs from 'fs';
import path from 'path';
import {
  encryptPortalPassword,
  isEncryptedPortalPassword,
  isUnsetPortalPassword,
  recordHasPortalPassword,
} from '../portalCrypto.ts';
import { projectRoot } from './db-safety.mjs';

/** Live app ledger — import/verify must use a separate frozen copy via LEDGER_IMPORT_PATH. */
export function liveLedgerPath() {
  return path.resolve(projectRoot(), 'data', 'ledger.json');
}

const LIVE_LEDGER_REFUSED =
  'LEDGER_IMPORT_PATH must not point at the live data/ledger.json (including via symlink, junction, or hard link). Provide a separate frozen copy.';

/**
 * True when both paths refer to the same inode (hard link), where the platform reports usable ino values.
 * On some Windows volumes ino is 0 and this check is skipped (realpath still covers junctions/symlinks).
 */
function sameFilesystemIdentity(pathA, pathB) {
  try {
    const a = fs.statSync(pathA);
    const b = fs.statSync(pathB);
    if (!a.ino || !b.ino) return false;
    return a.dev === b.dev && a.ino === b.ino;
  } catch {
    return false;
  }
}

/**
 * Require an explicit frozen ledger path. Never defaults to live data/ledger.json.
 * Resolves symlinks/junctions via realpath and rejects hard links to the live ledger when ino is available.
 */
export function resolveLedgerSourcePath() {
  const raw = (process.env.LEDGER_IMPORT_PATH || '').trim();
  if (!raw) {
    throw new Error(
      'LEDGER_IMPORT_PATH is required. Set it to an explicit frozen copy of the ledger JSON. ' +
        'This tool never writes that file and never copies it to the OS temp directory.'
    );
  }

  const resolvedSource = path.resolve(raw);
  const resolvedLive = liveLedgerPath();

  if (!fs.existsSync(resolvedSource)) {
    throw new Error(`Ledger file not found: ${resolvedSource}`);
  }

  let realSource;
  try {
    realSource = fs.realpathSync(resolvedSource);
  } catch {
    throw new Error(
      'LEDGER_IMPORT_PATH could not be resolved with realpath. Provide a readable frozen copy.'
    );
  }

  // Lexical resolve equality (relative paths, .. segments, etc.)
  if (resolvedSource === resolvedLive || realSource === resolvedLive) {
    throw new Error(LIVE_LEDGER_REFUSED);
  }

  if (fs.existsSync(resolvedLive)) {
    let realLive;
    try {
      realLive = fs.realpathSync(resolvedLive);
    } catch {
      realLive = null;
    }
    if (realLive && realSource === realLive) {
      throw new Error(LIVE_LEDGER_REFUSED);
    }
    const liveForStat = realLive || resolvedLive;
    if (sameFilesystemIdentity(realSource, liveForStat)) {
      throw new Error(LIVE_LEDGER_REFUSED);
    }
  }

  return realSource;
}

/**
 * Read and parse the operator-supplied frozen ledger JSON in memory only.
 * Never writes to the source path, never creates OS temp duplicates.
 */
export function loadFrozenLedger() {
  const sourcePath = resolveLedgerSourcePath();
  const raw = fs.readFileSync(sourcePath, 'utf8');
  let state;
  try {
    state = JSON.parse(raw);
  } catch {
    throw new Error('Ledger JSON could not be parsed.');
  }
  if (!state || typeof state !== 'object') {
    throw new Error('Ledger JSON root must be an object.');
  }

  return {
    state,
    sourcePath,
    byteLength: Buffer.byteLength(raw, 'utf8'),
  };
}

function assertStringOrAbsent(value, field) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string when present (got ${typeof value}).`);
  }
  return value;
}

function parseTimestamp(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} is required as a non-empty ISO timestamp string.`);
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    throw new Error(`${field} is not a parseable timestamp.`);
  }
  return new Date(ms);
}

function money(value, field) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`${field} must be a finite number.`);
  }
  return n;
}

function moneyNonNegative(value, field) {
  const n = money(value, field);
  if (n < 0) {
    throw new Error(`${field} must be >= 0.`);
  }
  return n;
}

/** Allowed keys on a GST filing object in frozen JSON. */
const GST_FILING_ALLOWED_KEYS = new Set([
  'month',
  'fees',
  'interest',
  'tax',
  'total',
  'payments',
  'received',
]);

/** Allowed keys on a GST payment-line object. */
const GST_PAYMENT_ALLOWED_KEYS = new Set([
  'id',
  'amount',
  'paymentDate',
  'paymentMode',
  'reference',
  'idempotencyKey',
  'createdAt',
  'updatedAt',
]);

/**
 * Normalize one GST payment line for insert / verify.
 * Preserves original id and metadata; never invents IT payment lines.
 */
export function mapGstPaymentLine(payment, contextLabel) {
  if (!payment || typeof payment !== 'object') {
    throw new Error(`${contextLabel}: payment entry must be an object.`);
  }
  const unexpected = Object.keys(payment).filter(
    (k) => !GST_PAYMENT_ALLOWED_KEYS.has(k)
  );
  if (unexpected.length) {
    throw new Error(
      `${contextLabel}: payment has unexpected fields (${unexpected.join(', ')}).`
    );
  }

  const id = typeof payment.id === 'string' ? payment.id.trim() : '';
  if (!id) {
    throw new Error(`${contextLabel}: payment id is required.`);
  }

  const amount = moneyNonNegative(payment.amount, `${contextLabel}.amount`);
  const payment_date =
    typeof payment.paymentDate === 'string'
      ? payment.paymentDate
      : String(payment.paymentDate || '');
  const payment_mode =
    typeof payment.paymentMode === 'string'
      ? payment.paymentMode
      : String(payment.paymentMode || '');

  const referenceRaw = assertStringOrAbsent(
    payment.reference,
    `${contextLabel}.reference`
  );
  const idempotencyRaw = assertStringOrAbsent(
    payment.idempotencyKey,
    `${contextLabel}.idempotencyKey`
  );

  const created_at = parseTimestamp(
    payment.createdAt,
    `${contextLabel}.createdAt`
  );
  let updated_at = null;
  if (payment.updatedAt != null && payment.updatedAt !== '') {
    updated_at = parseTimestamp(payment.updatedAt, `${contextLabel}.updatedAt`);
  }

  return {
    id,
    amount,
    payment_date,
    payment_mode,
    reference:
      referenceRaw != null && referenceRaw.trim() ? referenceRaw.trim() : null,
    idempotency_key:
      idempotencyRaw != null && idempotencyRaw.trim()
        ? idempotencyRaw.trim()
        : null,
    created_at,
    updated_at,
  };
}

/**
 * Normalize timestamps for fingerprints (Date, ISO string, or PG timestamptz).
 */
export function fingerprintTimestamp(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return value.toISOString();
  }
  const ms = Date.parse(String(value));
  if (Number.isNaN(ms)) return String(value);
  return new Date(ms).toISOString();
}

/**
 * Stable fingerprint for verify comparisons (includes created/updated timestamps).
 */
export function gstPaymentFingerprint(row) {
  return [
    row.id,
    row.gst_company_id,
    row.month,
    Number(row.amount).toFixed(2),
    row.payment_date || '',
    row.payment_mode || '',
    row.reference || '',
    row.idempotency_key || '',
    fingerprintTimestamp(row.created_at ?? row.createdAt),
    fingerprintTimestamp(row.updated_at ?? row.updatedAt),
  ].join('|');
}

/**
 * True when any filing declares a `payments` array (including empty).
 * Matches app `gstClientUsesPaymentAccounting` semantics.
 */
export function gstCompanyUsesPaymentAccounting(company) {
  return Object.values(company?.filings || {}).some((f) =>
    Array.isArray(f?.payments)
  );
}

/**
 * Fail closed when payment-line accounting applies but company totalReceived
 * does not equal allocated payment sum + unallocatedReceived.
 */
export function assertGstCompanyTotalReceivedReconciles(
  companyId,
  totalReceived,
  allocatedPaymentSum,
  unallocatedReceived,
  usesPaymentAccounting
) {
  if (!usesPaymentAccounting) return;
  const expected = Number(allocatedPaymentSum) + Number(unallocatedReceived);
  if (!nearlyEqual(totalReceived, expected)) {
    throw new Error(
      `GST company ${companyId}: totalReceived (${totalReceived}) must equal ` +
        `allocated payments (${allocatedPaymentSum}) + unallocatedReceived (${unallocatedReceived}) ` +
        `when payment-line accounting applies.`
    );
  }
}

/**
 * Stable fingerprint for gst_filings Option D received-mode columns.
 */
export function gstFilingReceivedModeFingerprint(row) {
  const legacy =
    row.legacy_received == null || row.legacy_received === ''
      ? ''
      : Number(row.legacy_received).toFixed(2);
  return [
    row.gst_company_id,
    row.month,
    row.payments_present === true || row.payments_present === 't' ? '1' : '0',
    legacy,
  ].join('|');
}

/**
 * Compare expected vs actual filing received-mode markers (pure).
 * Detects missing/altered payments_present and legacy_received.
 */
export function diffGstFilingReceivedModeRows(expectedRows, actualRows) {
  const failures = [];
  const expected = [...(expectedRows || [])]
    .map((r) => ({
      ...r,
      fingerprint: gstFilingReceivedModeFingerprint(r),
      key: `${r.gst_company_id}\0${r.month}`,
    }))
    .sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));
  const actual = [...(actualRows || [])]
    .map((r) => ({
      ...r,
      fingerprint: gstFilingReceivedModeFingerprint(r),
      key: `${r.gst_company_id}\0${r.month}`,
    }))
    .sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));

  if (expected.length !== actual.length) {
    failures.push(
      `gst_filings received-mode count: got ${actual.length}, expected ${expected.length}`
    );
  }

  const actualByKey = new Map(actual.map((r) => [r.key, r]));
  const expectedByKey = new Map(expected.map((r) => [r.key, r]));

  for (const exp of expected) {
    const got = actualByKey.get(exp.key);
    if (!got) {
      failures.push(
        `gst_filings received-mode missing company=${exp.gst_company_id} month=${exp.month}`
      );
      continue;
    }
    if (got.fingerprint !== exp.fingerprint) {
      failures.push(
        `gst_filings received-mode altered company=${exp.gst_company_id} month=${exp.month}`
      );
    }
  }
  for (const act of actual) {
    if (!expectedByKey.has(act.key)) {
      failures.push(
        `gst_filings received-mode unexpected company=${act.gst_company_id} month=${act.month}`
      );
    }
  }

  return failures;
}

/**
 * Compare expected vs actual payment rows (pure; used by verify + unit tests).
 * Fail-closed on missing, extra, or altered lines.
 */
export function diffGstPaymentRows(expectedRows, actualRows) {
  const failures = [];
  const expected = [...(expectedRows || [])]
    .map((r) => ({
      ...r,
      fingerprint: gstPaymentFingerprint(r),
    }))
    .sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));
  const actual = [...(actualRows || [])]
    .map((r) => ({
      ...r,
      fingerprint: gstPaymentFingerprint(r),
    }))
    .sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));

  if (expected.length !== actual.length) {
    failures.push(
      `gst_payments count: got ${actual.length}, expected ${expected.length}`
    );
  }

  const actualById = new Map(actual.map((r) => [r.id, r]));
  const expectedById = new Map(expected.map((r) => [r.id, r]));

  for (const exp of expected) {
    const got = actualById.get(exp.id);
    if (!got) {
      failures.push(`gst_payments missing id=${exp.id}`);
      continue;
    }
    if (got.fingerprint !== exp.fingerprint) {
      failures.push(`gst_payments altered id=${exp.id}`);
    }
  }
  for (const act of actual) {
    if (!expectedById.has(act.id)) {
      failures.push(`gst_payments unexpected id=${act.id}`);
    }
  }

  return failures;
}

/**
 * Approved portal-password → password_enc rules (portalCrypto.ts).
 */
export function nearlyEqual(a, b, eps = 1e-6) {
  return Math.abs(Number(a) - Number(b)) <= eps;
}

export function toPasswordEnc(record, key) {
  if (record.passwordEnc && isEncryptedPortalPassword(record.passwordEnc)) {
    return record.passwordEnc;
  }
  if (record.password && isEncryptedPortalPassword(record.password)) {
    return record.password;
  }
  if (!record.password || isUnsetPortalPassword(record.password)) {
    return null;
  }
  return encryptPortalPassword(String(record.password), key);
}

export function summarizeLedger(state) {
  const assessmentYears = Array.isArray(state.assessmentYears)
    ? state.assessmentYears.map((y) => String(y))
    : null;
  const gstMonths = Array.isArray(state.gstMonths)
    ? state.gstMonths.map((m) => String(m))
    : null;
  const clients = Array.isArray(state.clients) ? state.clients : null;
  const gstClients = Array.isArray(state.gstClients) ? state.gstClients : null;

  if (!assessmentYears || !gstMonths || !clients || !gstClients) {
    throw new Error(
      'Ledger must include assessmentYears, gstMonths, clients, and gstClients arrays.'
    );
  }

  const filingYears = new Set();
  const filingMonths = new Set();
  let itFilings = 0;
  let gstFilings = 0;
  let itFees = 0;
  let itRecv = 0;
  let itBal = 0;
  let gstFees = 0;
  let gstInt = 0;
  let gstTax = 0;
  let gstTotal = 0;
  let gstRecv = 0;
  let gstUnallocated = 0;
  let gstPayments = 0;
  let gstPaymentAmountSum = 0;
  let gstPaymentsPresentTrue = 0;
  let gstLegacyReceivedPresent = 0;
  let gstLegacyReceivedSum = 0;
  let passwordEncExpected = 0;
  const itIds = [];
  const gstIds = [];
  const paymentIds = [];
  /** @type {Record<string, { paymentCount: number, paymentAmountSum: number, unallocated: number, totalReceived: number }>} */
  const perCompany = {};

  for (const c of clients) {
    if (!c || typeof c !== 'object') throw new Error('Invalid IT client record.');
    if (!c.id || typeof c.id !== 'string' || !c.id.trim()) {
      throw new Error('IT client missing id.');
    }
    itIds.push(c.id);
    if (recordHasPortalPassword(c)) passwordEncExpected += 1;
    for (const [k, f] of Object.entries(c.filings || {})) {
      itFilings += 1;
      filingYears.add(String(k).trim());
      if (!f || typeof f !== 'object') throw new Error('Invalid IT filing.');
      if (String(f.assessmentYear || '').trim() !== String(k).trim()) {
        throw new Error('IT filing map key does not match assessmentYear.');
      }
      itFees += money(f.fees, 'it.fees');
      itRecv += money(f.received, 'it.received');
      itBal += money(f.balance, 'it.balance');
    }
  }

  for (const c of gstClients) {
    if (!c || typeof c !== 'object') throw new Error('Invalid GST company record.');
    if (!c.id || typeof c.id !== 'string' || !c.id.trim()) {
      throw new Error('GST company missing id.');
    }
    gstIds.push(c.id);
    if (recordHasPortalPassword(c)) passwordEncExpected += 1;
    const totalReceived = money(c.totalReceived, 'gst.totalReceived');
    gstRecv += totalReceived;
    const unallocated =
      c.unallocatedReceived == null
        ? 0
        : moneyNonNegative(c.unallocatedReceived, 'gst.unallocatedReceived');
    gstUnallocated += unallocated;

    let companyPaymentCount = 0;
    let companyPaymentSum = 0;
    const usesPaymentAccounting = gstCompanyUsesPaymentAccounting(c);

    for (const [k, f] of Object.entries(c.filings || {})) {
      gstFilings += 1;
      filingMonths.add(String(k).trim());
      if (!f || typeof f !== 'object') throw new Error('Invalid GST filing.');
      if (String(f.month || '').trim() !== String(k).trim()) {
        throw new Error('GST filing map key does not match month.');
      }
      const fees = money(f.fees, 'gst.fees');
      const interest = money(f.interest, 'gst.interest');
      const tax = money(f.tax, 'gst.tax');
      const total = money(f.total, 'gst.total');
      if (!nearlyEqual(total, fees + interest + tax)) {
        throw new Error(
          `GST filing total must equal fees+interest+tax (company=${c.id} month=${k}).`
        );
      }
      gstFees += fees;
      gstInt += interest;
      gstTax += tax;
      gstTotal += total;

      if (Array.isArray(f.payments)) {
        gstPaymentsPresentTrue += 1;
        for (const p of f.payments) {
          const mapped = mapGstPaymentLine(p, `gst payment ${c.id}/${k}`);
          gstPayments += 1;
          gstPaymentAmountSum += mapped.amount;
          companyPaymentCount += 1;
          companyPaymentSum += mapped.amount;
          paymentIds.push(mapped.id);
        }
      } else if (f.received != null && f.received !== '') {
        gstLegacyReceivedPresent += 1;
        gstLegacyReceivedSum += moneyNonNegative(f.received, 'gst.received');
      }
    }

    assertGstCompanyTotalReceivedReconciles(
      c.id,
      totalReceived,
      companyPaymentSum,
      unallocated,
      usesPaymentAccounting
    );

    perCompany[c.id] = {
      paymentCount: companyPaymentCount,
      paymentAmountSum: companyPaymentSum,
      unallocated,
      totalReceived,
      usesPaymentAccounting,
    };
  }

  if (new Set(itIds).size !== itIds.length) {
    throw new Error('Duplicate IT client ids in ledger.');
  }
  if (new Set(gstIds).size !== gstIds.length) {
    throw new Error('Duplicate GST company ids in ledger.');
  }
  if (new Set(paymentIds).size !== paymentIds.length) {
    throw new Error('Duplicate GST payment ids in ledger.');
  }

  const yearLabels = new Set([
    ...assessmentYears.map((y) => String(y).trim()).filter(Boolean),
    ...filingYears,
  ]);
  const monthLabels = new Set([
    ...gstMonths.map((m) => String(m).trim()).filter(Boolean),
    ...filingMonths,
  ]);

  return {
    counts: {
      assessmentYearsInArray: assessmentYears.length,
      assessmentYearsToInsert: yearLabels.size,
      clients: clients.length,
      itFilings,
      gstMonthsInArray: gstMonths.length,
      gstMonthsToInsert: monthLabels.size,
      gstClients: gstClients.length,
      gstFilings,
      gstPayments,
      gstPaymentsPresentTrue,
      gstLegacyReceivedPresent,
      passwordEncExpected,
    },
    finance: {
      itFees,
      itRecv,
      itBal,
      gstFees,
      gstInt,
      gstTax,
      gstTotal,
      gstRecv,
      gstUnallocated,
      gstPaymentAmountSum,
      gstLegacyReceivedSum,
    },
    perCompany,
    paymentIdsSorted: [...paymentIds].sort(),
    itIdsSorted: [...itIds].sort(),
    gstIdsSorted: [...gstIds].sort(),
    yearLabelsSorted: [...yearLabels].sort(),
    monthLabelsSorted: [...monthLabels].sort(),
  };
}

/**
 * Normalize ledger into insertable rows (still no DB I/O).
 */
export function buildImportRows(state, key, organizationName) {
  const clients = state.clients || [];
  const gstClients = state.gstClients || [];
  const assessmentYears = state.assessmentYears || [];
  const gstMonths = state.gstMonths || [];

  const yearLabels = new Set();
  for (const y of assessmentYears) {
    const label = String(y).trim();
    if (!label) throw new Error('Empty assessment year label in array.');
    yearLabels.add(label);
  }
  for (const c of clients) {
    for (const k of Object.keys(c.filings || {})) {
      const label = String(k).trim();
      if (!label) throw new Error('Empty IT filing year key.');
      yearLabels.add(label);
    }
  }

  const monthLabels = new Set();
  for (const m of gstMonths) {
    const label = String(m).trim();
    if (!label) throw new Error('Empty GST month label in array.');
    monthLabels.add(label);
  }
  for (const c of gstClients) {
    for (const k of Object.keys(c.filings || {})) {
      const label = String(k).trim();
      if (!label) throw new Error('Empty GST filing month key.');
      monthLabels.add(label);
    }
  }

  const itClients = [];
  const itFilings = [];
  for (const c of clients) {
    if (typeof c.name !== 'string' || !c.name.trim()) {
      throw new Error('IT client name is required.');
    }
    if (typeof c.pan !== 'string' || !c.pan.trim()) {
      throw new Error('IT client pan is required.');
    }
    const otherMobiles = assertStringOrAbsent(c.otherMobiles, 'otherMobiles');
    const nameVariants = assertStringOrAbsent(c.nameVariants, 'nameVariants');
    const remark = assertStringOrAbsent(c.remark, 'remark');

    itClients.push({
      id: c.id,
      name: c.name,
      pan: c.pan,
      phone: typeof c.phone === 'string' ? c.phone : String(c.phone || ''),
      reference_number:
        typeof c.referenceNumber === 'string'
          ? c.referenceNumber
          : String(c.referenceNumber || ''),
      remark,
      other_mobiles: otherMobiles,
      name_variants: nameVariants,
      password_enc: toPasswordEnc(c, key),
      created_at: parseTimestamp(c.createdAt, 'clients.createdAt'),
      updated_at: parseTimestamp(c.updatedAt, 'clients.updatedAt'),
    });

    for (const [yearKey, f] of Object.entries(c.filings || {})) {
      const assessment_year = String(yearKey).trim();
      if (String(f.assessmentYear || '').trim() !== assessment_year) {
        throw new Error('IT filing assessmentYear mismatch.');
      }
      itFilings.push({
        it_client_id: c.id,
        assessment_year,
        filing_date: typeof f.filingDate === 'string' ? f.filingDate : String(f.filingDate || ''),
        fees: money(f.fees, 'fees'),
        received: money(f.received, 'received'),
        balance: money(f.balance, 'balance'),
        payment_type:
          typeof f.paymentType === 'string' ? f.paymentType : String(f.paymentType || ''),
        payment_receive_date:
          typeof f.paymentReceiveDate === 'string'
            ? f.paymentReceiveDate
            : String(f.paymentReceiveDate || ''),
      });
    }
  }

  const gstCompanies = [];
  const gstFilings = [];
  const gstPayments = [];
  const seenPaymentIds = new Set();
  /** companyId -> Set of non-empty idempotency keys */
  const idempotencyByCompany = new Map();

  for (const c of gstClients) {
    if (typeof c.companyName !== 'string' || !c.companyName.trim()) {
      throw new Error('GST companyName is required.');
    }
    if (!c.id || typeof c.id !== 'string' || !c.id.trim()) {
      throw new Error('GST company missing id.');
    }
    const remark = assertStringOrAbsent(c.remark, 'gst.remark');
    const unallocated_received =
      c.unallocatedReceived == null
        ? 0
        : moneyNonNegative(c.unallocatedReceived, 'unallocatedReceived');

    gstCompanies.push({
      id: c.id,
      company_name: c.companyName,
      portal_user_id: typeof c.userId === 'string' ? c.userId : String(c.userId || ''),
      phone: typeof c.phone === 'string' ? c.phone : String(c.phone || ''),
      reference_number:
        typeof c.referenceNumber === 'string'
          ? c.referenceNumber
          : String(c.referenceNumber || ''),
      remark,
      total_received: money(c.totalReceived, 'totalReceived'),
      unallocated_received,
      password_enc: toPasswordEnc(c, key),
      created_at: parseTimestamp(c.createdAt, 'gstClients.createdAt'),
      updated_at: parseTimestamp(c.updatedAt, 'gstClients.updatedAt'),
    });

    if (!idempotencyByCompany.has(c.id)) {
      idempotencyByCompany.set(c.id, new Set());
    }
    const companyIdem = idempotencyByCompany.get(c.id);
    const usesPaymentAccounting = gstCompanyUsesPaymentAccounting(c);
    let companyAllocatedSum = 0;

    for (const [monthKey, f] of Object.entries(c.filings || {})) {
      const month = String(monthKey).trim();
      if (String(f.month || '').trim() !== month) {
        throw new Error('GST filing month mismatch.');
      }
      const unexpected = Object.keys(f).filter(
        (k) => !GST_FILING_ALLOWED_KEYS.has(k)
      );
      if (unexpected.length) {
        throw new Error(
          `GST filing has unexpected fields (${unexpected.join(', ')}).`
        );
      }

      const fees = money(f.fees, 'gst.fees');
      const interest = money(f.interest, 'gst.interest');
      const tax = money(f.tax, 'gst.tax');
      const total = money(f.total, 'gst.total');
      if (!nearlyEqual(total, fees + interest + tax)) {
        throw new Error(
          `GST filing total must equal fees+interest+tax (company=${c.id} month=${month}).`
        );
      }

      const paymentsPresent = Array.isArray(f.payments);
      if (
        Object.prototype.hasOwnProperty.call(f, 'payments') &&
        !paymentsPresent
      ) {
        throw new Error(
          `GST filing payments must be an array when present (company=${c.id} month=${month}).`
        );
      }

      let legacy_received = null;
      if (!paymentsPresent && f.received != null && f.received !== '') {
        legacy_received = moneyNonNegative(f.received, 'gst.received');
      }

      gstFilings.push({
        gst_company_id: c.id,
        month,
        fees,
        interest,
        tax,
        total,
        payments_present: paymentsPresent,
        legacy_received,
      });

      if (!paymentsPresent) {
        continue;
      }

      let paymentSum = 0;
      for (const p of f.payments) {
        const mapped = mapGstPaymentLine(p, `gst payment ${c.id}/${month}`);
        if (seenPaymentIds.has(mapped.id)) {
          throw new Error(
            `Duplicate GST payment id "${mapped.id}" (fail closed).`
          );
        }
        seenPaymentIds.add(mapped.id);

        if (mapped.idempotency_key) {
          if (companyIdem.has(mapped.idempotency_key)) {
            throw new Error(
              `Duplicate GST payment idempotency key "${mapped.idempotency_key}" for company ${c.id} (fail closed).`
            );
          }
          companyIdem.add(mapped.idempotency_key);
        }

        paymentSum += mapped.amount;
        companyAllocatedSum += mapped.amount;
        gstPayments.push({
          ...mapped,
          gst_company_id: c.id,
          month,
        });
      }

      // Payment-mode filings: declared received (if any) must match line sum.
      // Never persist it as legacy_received.
      if (f.received != null && f.received !== '') {
        const declared = money(f.received, 'gst.received');
        if (!nearlyEqual(declared, paymentSum)) {
          throw new Error(
            `GST filing received must equal sum of payment lines (company=${c.id} month=${month}).`
          );
        }
      }
    }

    assertGstCompanyTotalReceivedReconciles(
      c.id,
      money(c.totalReceived, 'totalReceived'),
      companyAllocatedSum,
      unallocated_received,
      usesPaymentAccounting
    );
  }

  const passwordEncNonNull =
    itClients.filter((r) => r.password_enc != null).length +
    gstCompanies.filter((r) => r.password_enc != null).length;

  for (const row of [...itClients, ...gstCompanies]) {
    if (row.password_enc != null && !isEncryptedPortalPassword(row.password_enc)) {
      throw new Error('Internal error: password_enc is not enc:v1:.');
    }
  }

  return {
    organizationName,
    yearLabels: [...yearLabels],
    monthLabels: [...monthLabels],
    itClients,
    itFilings,
    gstCompanies,
    gstFilings,
    gstPayments,
    passwordEncNonNull,
  };
}
