/**
 * Shared Phase 2 ledger parse / portal-password / reconcile helpers.
 * Never log PAN, phone, passwords, ciphertext, or keys.
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

/**
 * Approved portal-password → password_enc rules (portalCrypto.ts).
 */
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
  let passwordEncExpected = 0;
  const itIds = [];
  const gstIds = [];

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
    gstRecv += money(c.totalReceived, 'gst.totalReceived');
    for (const [k, f] of Object.entries(c.filings || {})) {
      gstFilings += 1;
      filingMonths.add(String(k).trim());
      if (!f || typeof f !== 'object') throw new Error('Invalid GST filing.');
      if (String(f.month || '').trim() !== String(k).trim()) {
        throw new Error('GST filing map key does not match month.');
      }
      gstFees += money(f.fees, 'gst.fees');
      gstInt += money(f.interest, 'gst.interest');
      gstTax += money(f.tax, 'gst.tax');
      gstTotal += money(f.total, 'gst.total');
    }
  }

  if (new Set(itIds).size !== itIds.length) {
    throw new Error('Duplicate IT client ids in ledger.');
  }
  if (new Set(gstIds).size !== gstIds.length) {
    throw new Error('Duplicate GST company ids in ledger.');
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
    },
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
  for (const c of gstClients) {
    if (typeof c.companyName !== 'string' || !c.companyName.trim()) {
      throw new Error('GST companyName is required.');
    }
    const remark = assertStringOrAbsent(c.remark, 'gst.remark');
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
      password_enc: toPasswordEnc(c, key),
      created_at: parseTimestamp(c.createdAt, 'gstClients.createdAt'),
      updated_at: parseTimestamp(c.updatedAt, 'gstClients.updatedAt'),
    });

    for (const [monthKey, f] of Object.entries(c.filings || {})) {
      const month = String(monthKey).trim();
      if (String(f.month || '').trim() !== month) {
        throw new Error('GST filing month mismatch.');
      }
      const unexpected = Object.keys(f).filter(
        (k) => !['month', 'fees', 'interest', 'tax', 'total'].includes(k)
      );
      if (unexpected.length) {
        throw new Error('GST filing has unexpected fields.');
      }
      gstFilings.push({
        gst_company_id: c.id,
        month,
        fees: money(f.fees, 'gst.fees'),
        interest: money(f.interest, 'gst.interest'),
        tax: money(f.tax, 'gst.tax'),
        total: money(f.total, 'gst.total'),
      });
    }
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
    passwordEncNonNull,
  };
}

export function nearlyEqual(a, b, eps = 1e-6) {
  return Math.abs(Number(a) - Number(b)) <= eps;
}
