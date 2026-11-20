import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import type {
  ClientRecord,
  FilingRecord,
  GstClientRecord,
  GstMonthlyFiling,
  LedgerState,
} from './src/types/ledger.ts';
import {
  decryptPortalPassword,
  encryptPortalPassword,
  isEncryptedPortalPassword,
  isUnsetPortalPassword,
  loadPortalEncryptionKey,
  recordHasPortalPassword,
} from './portalCrypto.ts';
import { validatePasswordPolicy } from './passwordPolicy.ts';
import {
  clipField,
  isValidPanFormat,
  normalizePanInput,
  validateOptionalPhone,
  validateOptionalText,
  validatePanValue,
  validateRequiredText,
} from './src/utils/fieldValidation.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'ledger.json');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');
/** Local out-of-band delivery for reset tokens (no SMTP). Never commit. */
const RESET_TOKEN_FILE = path.join(DATA_DIR, 'PASSWORD_RESET_TOKEN.txt');
const PORT = Number(process.env.PORT) || 3000;
/** Local UAT default: loopback only. Override with HOST (never silently defaults to 0.0.0.0). */
const HOST = (process.env.HOST || '127.0.0.1').trim() || '127.0.0.1';

const SESSION_COOKIE = 'tl_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes
const sessions = new Map<string, { email: string; expiresAt: number }>();
/** Set when auth.json exists but cannot be parsed — never auto-overwrite with defaults. */
let authFileCorrupt = false;

/**
 * Cookie Secure flag (Phase 6 / F-02).
 * COOKIE_SECURE=true|false|auto (default auto).
 * TRUST_PROXY=1 only when behind a known local/private reverse proxy — never blind header trust.
 */
const COOKIE_SECURE_MODE = (process.env.COOKIE_SECURE || 'auto').trim().toLowerCase();
const TRUST_PROXY = process.env.TRUST_PROXY === '1';

function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === '127.0.0.1' || h === 'localhost' || h === '::1';
}

/** Resolve whether Set-Cookie should include Secure for this response. */
function shouldUseSecureCookie(req?: express.Request): boolean {
  if (COOKIE_SECURE_MODE === 'true') return true;
  if (COOKIE_SECURE_MODE === 'false') return false;
  // auto
  if (process.env.NODE_ENV === 'production') {
    if (TRUST_PROXY && req) {
      // Only honour Express req.secure after trust proxy is limited to loopback/private.
      return Boolean(req.secure);
    }
    // Production without trusted proxy: prefer Secure (HTTPS expected at edge).
    return true;
  }
  // Non-production: Secure only if explicitly requested via true mode (handled above).
  // Isolated HTTP localhost UAT stays Secure=false.
  if (isLoopbackHost(HOST)) return false;
  // Non-loopback non-production: fail closed to Secure when not clearly local HTTP.
  return true;
}

function buildSessionCookieHeader(
  token: string | null,
  maxAge: number,
  secure: boolean
): string {
  const value = token === null ? '' : encodeURIComponent(token);
  let header = `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
  if (secure) header += '; Secure';
  return header;
}

/** Simple in-memory rate limiter: key → timestamps of recent attempts */
const rateLimitBuckets = new Map<string, number[]>();

type AuthResetState = {
  tokenSalt: string;
  tokenHash: string;
  expiresAt: string;
};

type AuthRecord = {
  email: string;
  passwordSalt: string;
  passwordHash: string;
  recoverySalt: string;
  recoveryHash: string;
  updatedAt: string;
  passwordReset?: AuthResetState | null;
};

function scryptHash(secret: string, salt: Buffer): string {
  return crypto.scryptSync(secret, salt, 64).toString('hex');
}

function hashSecret(secret: string): { salt: string; hash: string } {
  const salt = crypto.randomBytes(16);
  return { salt: salt.toString('hex'), hash: scryptHash(secret, salt) };
}

function verifySecret(secret: string, saltHex: string, hashHex: string): boolean {
  try {
    const salt = Buffer.from(saltHex, 'hex');
    const actual = Buffer.from(scryptHash(secret, salt), 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    if (actual.length !== expected.length) return false;
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function authFilePresent(): boolean {
  return fs.existsSync(AUTH_FILE);
}

/**
 * Read existing administrator record. Never creates default credentials.
 * Returns null when missing (bootstrap required) or unreadable/corrupt.
 */
function readAuth(): AuthRecord | null {
  ensureDataDir();
  authFileCorrupt = false;
  if (!fs.existsSync(AUTH_FILE)) {
    return null;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8')) as Partial<AuthRecord>;
    if (
      !raw.email ||
      !raw.passwordSalt ||
      !raw.passwordHash ||
      !raw.recoverySalt ||
      !raw.recoveryHash
    ) {
      authFileCorrupt = true;
      console.warn(
        '[security] auth.json is incomplete. Refusing to overwrite. Restore from data/backups/ or repair manually.'
      );
      return null;
    }
    const record: AuthRecord = {
      email: String(raw.email).trim().toLowerCase(),
      passwordSalt: String(raw.passwordSalt),
      passwordHash: String(raw.passwordHash),
      recoverySalt: String(raw.recoverySalt),
      recoveryHash: String(raw.recoveryHash),
      updatedAt: String(raw.updatedAt || new Date().toISOString()),
      passwordReset: null,
    };
    const pr = raw.passwordReset;
    if (
      pr &&
      typeof pr === 'object' &&
      typeof (pr as AuthResetState).tokenSalt === 'string' &&
      typeof (pr as AuthResetState).tokenHash === 'string' &&
      typeof (pr as AuthResetState).expiresAt === 'string'
    ) {
      record.passwordReset = {
        tokenSalt: String((pr as AuthResetState).tokenSalt),
        tokenHash: String((pr as AuthResetState).tokenHash),
        expiresAt: String((pr as AuthResetState).expiresAt),
      };
    }
    return record;
  } catch {
    authFileCorrupt = true;
    console.warn(
      '[security] auth.json could not be parsed. Refusing to overwrite. Restore from data/backups/.'
    );
    return null;
  }
}

function bootstrapRequired(): boolean {
  return !authFilePresent() && !authFileCorrupt;
}

function writeAuth(auth: AuthRecord): void {
  ensureDataDir();
  const tmp = `${AUTH_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(auth, null, 2), 'utf-8');
  fs.renameSync(tmp, AUTH_FILE);
}

function clearAllSessions(): void {
  sessions.clear();
}

function clientKey(req: express.Request, action: string): string {
  const ip =
    String(req.headers['x-forwarded-for'] || '')
      .split(',')[0]
      .trim() ||
    req.socket.remoteAddress ||
    'unknown';
  return `${action}:${ip}`;
}

/** Returns true if allowed; false if rate limited. */
function allowRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const prev = rateLimitBuckets.get(key) || [];
  const recent = prev.filter((t) => now - t < windowMs);
  if (recent.length >= maxAttempts) {
    rateLimitBuckets.set(key, recent);
    return false;
  }
  recent.push(now);
  rateLimitBuckets.set(key, recent);
  return true;
}

function clearResetTokenFile(): void {
  try {
    if (fs.existsSync(RESET_TOKEN_FILE)) fs.unlinkSync(RESET_TOKEN_FILE);
  } catch {
    // ignore cleanup errors
  }
}

function writeResetTokenFile(token: string, expiresAt: Date): void {
  ensureDataDir();
  const body = [
    'ASSOCIATE password reset token',
    'Single-use. Do not share. Expires: ' + expiresAt.toISOString(),
    'Enter this token on the Reset password screen together with your email.',
    '',
    token,
    '',
  ].join('\n');
  const tmp = `${RESET_TOKEN_FILE}.tmp`;
  fs.writeFileSync(tmp, body, 'utf-8');
  fs.renameSync(tmp, RESET_TOKEN_FILE);
}

const GENERIC_FORGOT_MESSAGE =
  'If an account exists for that email, a password reset token has been issued. On this PC, open data/PASSWORD_RESET_TOKEN.txt, then use Reset password with the token.';
const GENERIC_RESET_ERROR = 'Invalid or expired reset request.';

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

function pruneSessions(): void {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(token);
  }
}

function createSession(email: string): string {
  pruneSessions();
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { email, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

function destroySession(token: string | null | undefined): void {
  if (token) sessions.delete(token);
}

function readSessionToken(req: express.Request): string | null {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies[SESSION_COOKIE]) return cookies[SESSION_COOKIE];
  const auth = String(req.headers.authorization || '');
  if (auth.toLowerCase().startsWith('bearer ')) {
    const token = auth.slice(7).trim();
    return token || null;
  }
  return null;
}

function getSession(
  req: express.Request
): { email: string; token: string } | null {
  const token = readSessionToken(req);
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return { email: session.email, token };
}

function setSessionCookie(
  res: express.Response,
  token: string,
  req?: express.Request
): void {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  const secure = shouldUseSecureCookie(req);
  res.setHeader('Set-Cookie', buildSessionCookieHeader(token, maxAge, secure));
}

function clearSessionCookie(res: express.Response, req?: express.Request): void {
  const secure = shouldUseSecureCookie(req);
  res.setHeader('Set-Cookie', buildSessionCookieHeader(null, 0, secure));
}

function requireAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  const session = getSession(req);
  if (!session) {
    res.status(401).json({ error: 'Unauthorized. Please log in.' });
    return;
  }
  next();
}

function extractYearOrderKey(ayLabel: string): number {
  const match = ayLabel.match(/(\d{4})/);
  if (match) return parseInt(match[1], 10);
  const shortMatch = ayLabel.match(/(\d{2})/);
  if (shortMatch) return 2000 + parseInt(shortMatch[1], 10);
  return 0;
}

function sortYears(years: string[]): string[] {
  return [...new Set(years.map((y) => y.trim()).filter(Boolean))].sort(
    (a, b) => extractYearOrderKey(a) - extractYearOrderKey(b) || a.localeCompare(b)
  );
}

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

function extractMonthOrderKey(label: string): number {
  const match = label.trim().match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (match) {
    const idx = MONTH_INDEX[match[1].slice(0, 3).toLowerCase()];
    const yr = parseInt(match[2], 10);
    if (idx !== undefined) return yr * 12 + idx;
  }
  return 0;
}

function sortMonths(months: string[]): string[] {
  return [...new Set(months.map((m) => m.trim()).filter(Boolean))].sort(
    (a, b) => extractMonthOrderKey(a) - extractMonthOrderKey(b) || a.localeCompare(b)
  );
}

const BASELINE_ASSESSMENT_YEARS = [
  'AY 2019-20',
  'AY 2020-21',
  'AY 2021-22',
  'AY 2022-23',
  'AY 2023-24',
  'AY 2024-25',
  'AY 2025-26',
  'AY 2026-27',
];

const BASELINE_GST_MONTHS = [
  'Apr 2026',
  'May 2026',
  'Jun 2026',
  'Jul 2026',
  'Aug 2026',
  'Sep 2026',
  'Oct 2026',
  'Nov 2026',
  'Dec 2026',
  'Jan 2027',
  'Feb 2027',
  'Mar 2027',
];



function createInitialLedger(): LedgerState {
  const now = new Date().toISOString();
  return {
    assessmentYears: [...BASELINE_ASSESSMENT_YEARS],
    clients: [
      {
        id: 'demo-1',
        name: 'Ramesh Kumar',
        pan: 'ABCPR1234K',
        // No reusable portal credentials in production seed (F-01b).
        password: '',
        phone: '9820112233',
        referenceNumber: 'REF-01',
        remark: 'Regular yearly filing',
        filings: {
          'AY 2019-20': {
            assessmentYear: 'AY 2019-20',
            filingDate: '2020-01-15',
            fees: 10000,
            received: 9000,
            balance: 1000,
            paymentType: 'GPay',
            paymentReceiveDate: '2020-01-16',
          },
          'AY 2020-21': {
            assessmentYear: 'AY 2020-21',
            filingDate: '2021-01-10',
            fees: 10000,
            received: 9000,
            balance: 1000,
            paymentType: 'PhonePe',
            paymentReceiveDate: '2021-01-12',
          },
          'AY 2021-22': {
            assessmentYear: 'AY 2021-22',
            filingDate: '2022-07-28',
            fees: 10000,
            received: 10000,
            balance: 0,
            paymentType: 'BOB',
            paymentReceiveDate: '2022-07-29',
          },
          'AY 2026-27': {
            assessmentYear: 'AY 2026-27',
            filingDate: '2026-07-30',
            fees: 12000,
            received: 9000,
            balance: 3000,
            paymentType: 'P-Pay',
            paymentReceiveDate: '2026-10-29',
          },
        },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'demo-2',
        name: 'Priya Nair',
        pan: 'BKLPN5678M',
        password: '',
        phone: '9845022334',
        referenceNumber: 'REF-02',
        remark: 'All dues cleared',
        filings: {
          'AY 2025-26': {
            assessmentYear: 'AY 2025-26',
            filingDate: '2025-07-24',
            fees: 6000,
            received: 6000,
            balance: 0,
            paymentType: 'GPay',
            paymentReceiveDate: '2025-07-25',
          },
          'AY 2026-27': {
            assessmentYear: 'AY 2026-27',
            filingDate: '2026-07-27',
            fees: 6500,
            received: 6500,
            balance: 0,
            paymentType: 'UPI',
            paymentReceiveDate: '2026-07-28',
          },
        },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'demo-3',
        name: 'Suresh Verma',
        pan: 'AGTPV8899R',
        password: '',
        phone: '9765099887',
        referenceNumber: 'REF-03',
        remark: 'Follow up for AY 2026-27 payment',
        filings: {
          'AY 2025-26': {
            assessmentYear: 'AY 2025-26',
            filingDate: '2025-07-29',
            fees: 8000,
            received: 5000,
            balance: 3000,
            paymentType: 'Cash',
            paymentReceiveDate: '2025-08-02',
          },
          'AY 2026-27': {
            assessmentYear: 'AY 2026-27',
            filingDate: '2026-07-31',
            fees: 8500,
            received: 0,
            balance: 8500,
            paymentType: 'Pending',
            paymentReceiveDate: '',
          },
        },
        createdAt: now,
        updatedAt: now,
      },
    ],
    gstMonths: [...BASELINE_GST_MONTHS],
    gstClients: [],
  };
}

function readLedger(): LedgerState {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    const initial = createInitialLedger();
    migratePortalPasswordsInState(initial);
    writeLedger(initial);
    return initial;
  }
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<LedgerState>;
    const allYears = new Set<string>([
      ...BASELINE_ASSESSMENT_YEARS,
      ...(parsed.assessmentYears || []),
    ]);
    for (const c of parsed.clients || []) {
      for (const y of Object.keys(c.filings || {})) {
        allYears.add(y);
      }
    }

    const needsGstSeed = parsed.gstClients === undefined;
    const gstClients = Array.isArray(parsed.gstClients) ? parsed.gstClients : [];

    const allMonths = new Set<string>([
      ...BASELINE_GST_MONTHS,
      ...(parsed.gstMonths || []),
    ]);
    for (const gc of gstClients) {
      for (const m of Object.keys(gc.filings || {})) {
        allMonths.add(m);
      }
    }

    const normalizedGstClients: GstClientRecord[] = gstClients.map((gc) => ({
      ...gc,
      phone: String((gc as GstClientRecord).phone || ''),
    }));

    const state: LedgerState = {
      assessmentYears: sortYears([...allYears]),
      clients: Array.isArray(parsed.clients) ? parsed.clients : [],
      gstMonths: sortMonths([...allMonths]),
      gstClients: normalizedGstClients,
    };

    const migrateStats = migratePortalPasswordsInState(state);
    if (needsGstSeed || migrateStats.changed) {
      if (migrateStats.changed) {
        migrateStats.backupFile = backupLedgerFile('pre-portal-encrypt');
        console.info(
          `[security] Portal password migration: IT ${migrateStats.clientsMigrated}/${migrateStats.clientsTotal}, GST ${migrateStats.gstMigrated}/${migrateStats.gstTotal}, unset cleared ${migrateStats.skippedUnset}, backup=${migrateStats.backupFile}`
        );
      }
      writeLedger(state);
    }
    return state;
  } catch {
    const initial = createInitialLedger();
    migratePortalPasswordsInState(initial);
    writeLedger(initial);
    return initial;
  }
}

function backupLedgerFile(label = ''): string {
  const backupDir = path.join(DATA_DIR, 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const d = new Date();
  const stamp =
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}` +
    `-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
  const suffix = label ? `-${label}` : '';
  const backupFile = `ledger-${stamp}${suffix}.json`;
  const dest = path.join(backupDir, backupFile);
  if (fs.existsSync(DATA_FILE)) {
    fs.copyFileSync(DATA_FILE, dest);
  } else {
    const initial = createInitialLedger();
    migratePortalPasswordsInState(initial);
    fs.writeFileSync(dest, JSON.stringify(initial, null, 2), 'utf-8');
  }
  const files = fs
    .readdirSync(backupDir)
    .filter((f) => f.startsWith('ledger-') && f.endsWith('.json'))
    .map((f) => ({ f, m: fs.statSync(path.join(backupDir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  for (const extra of files.slice(10)) {
    try {
      fs.unlinkSync(path.join(backupDir, extra.f));
    } catch {
      /* ignore */
    }
  }
  return backupFile;
}

function stripPublicSecrets<T extends ClientRecord | GstClientRecord>(
  record: T
): Omit<T, 'password' | 'passwordEnc'> & { hasPortalPassword: boolean } {
  const { password: _p, passwordEnc: _e, ...rest } = record as T & {
    password?: string;
    passwordEnc?: string;
  };
  return {
    ...(rest as Omit<T, 'password' | 'passwordEnc'>),
    hasPortalPassword: recordHasPortalPassword(record),
  };
}

function sanitizeLedgerForClient(state: LedgerState): LedgerState {
  return {
    assessmentYears: state.assessmentYears,
    clients: state.clients.map((c) => stripPublicSecrets(c) as ClientRecord),
    gstMonths: state.gstMonths,
    gstClients: state.gstClients.map((c) => stripPublicSecrets(c) as GstClientRecord),
  };
}

function persistPasswordFields(
  plaintext: string | undefined,
  existing: { password?: string; passwordEnc?: string },
  opts: { required: boolean }
): { passwordEnc?: string } {
  const keyStatus = loadPortalEncryptionKey();
  const incoming =
    plaintext !== undefined ? String(plaintext).trim() : undefined;

  if (incoming !== undefined && incoming.length > 0 && !isUnsetPortalPassword(incoming)) {
    if (!keyStatus.ok) {
      throw new Error(
        'PORTAL_PASSWORD_ENCRYPTION_KEY is missing or invalid. Cannot store portal passwords.'
      );
    }
    return { passwordEnc: encryptPortalPassword(incoming, keyStatus.key) };
  }

  if (existing.passwordEnc && isEncryptedPortalPassword(existing.passwordEnc)) {
    return { passwordEnc: existing.passwordEnc };
  }

  if (existing.password && !isUnsetPortalPassword(existing.password)) {
    if (isEncryptedPortalPassword(existing.password)) {
      return { passwordEnc: existing.password };
    }
    if (!keyStatus.ok) {
      throw new Error(
        'PORTAL_PASSWORD_ENCRYPTION_KEY is missing or invalid. Cannot migrate portal passwords.'
      );
    }
    return { passwordEnc: encryptPortalPassword(existing.password, keyStatus.key) };
  }

  if (opts.required) {
    throw new Error('Portal password is required.');
  }
  return {};
}

function resolvePortalPasswordPlaintext(record: {
  password?: string;
  passwordEnc?: string;
}): string | null {
  const keyStatus = loadPortalEncryptionKey();
  if (record.passwordEnc && isEncryptedPortalPassword(record.passwordEnc)) {
    if (!keyStatus.ok) {
      throw new Error(
        'PORTAL_PASSWORD_ENCRYPTION_KEY is missing or invalid. Cannot decrypt portal passwords.'
      );
    }
    return decryptPortalPassword(record.passwordEnc, keyStatus.key);
  }
  if (record.password && isEncryptedPortalPassword(record.password)) {
    if (!keyStatus.ok) {
      throw new Error(
        'PORTAL_PASSWORD_ENCRYPTION_KEY is missing or invalid. Cannot decrypt portal passwords.'
      );
    }
    return decryptPortalPassword(record.password, keyStatus.key);
  }
  if (record.password && !isUnsetPortalPassword(record.password)) {
    return record.password;
  }
  return null;
}

type PortalMigrateStats = {
  clientsTotal: number;
  gstTotal: number;
  clientsMigrated: number;
  gstMigrated: number;
  skippedUnset: number;
  backupFile: string | null;
  changed: boolean;
};

function migratePortalPasswordsInState(state: LedgerState): PortalMigrateStats {
  const keyStatus = loadPortalEncryptionKey();
  const stats: PortalMigrateStats = {
    clientsTotal: state.clients.length,
    gstTotal: state.gstClients.length,
    clientsMigrated: 0,
    gstMigrated: 0,
    skippedUnset: 0,
    backupFile: null,
    changed: false,
  };

  if (!keyStatus.ok) {
    console.warn(
      '[security] PORTAL_PASSWORD_ENCRYPTION_KEY missing/invalid — portal password migration deferred; credentials left unchanged on disk.'
    );
    return stats;
  }

  const migrateOne = <T extends ClientRecord | GstClientRecord>(rec: T): T => {
    const next = { ...rec } as T & { password?: string; passwordEnc?: string };
    delete (next as { hasPortalPassword?: boolean }).hasPortalPassword;

    if (next.passwordEnc && isEncryptedPortalPassword(next.passwordEnc)) {
      if ('password' in next) delete next.password;
      return next;
    }

    if (next.password && isEncryptedPortalPassword(next.password)) {
      next.passwordEnc = next.password;
      delete next.password;
      stats.changed = true;
      return next;
    }

    if (!next.password || isUnsetPortalPassword(next.password)) {
      stats.skippedUnset += 1;
      if ('password' in next) delete next.password;
      if ('passwordEnc' in next) delete next.passwordEnc;
      if (rec.password && isUnsetPortalPassword(rec.password)) {
        stats.changed = true;
      }
      return next;
    }

    next.passwordEnc = encryptPortalPassword(next.password, keyStatus.key);
    delete next.password;
    stats.changed = true;
    return next;
  };

  state.clients = state.clients.map((c) => {
    const before = c.passwordEnc || c.password;
    const after = migrateOne(c);
    if (
      after.passwordEnc &&
      after.passwordEnc !== before &&
      isEncryptedPortalPassword(after.passwordEnc)
    ) {
      stats.clientsMigrated += 1;
    }
    return after;
  });

  state.gstClients = state.gstClients.map((c) => {
    const before = c.passwordEnc || c.password;
    const after = migrateOne(c);
    if (
      after.passwordEnc &&
      after.passwordEnc !== before &&
      isEncryptedPortalPassword(after.passwordEnc)
    ) {
      stats.gstMigrated += 1;
    }
    return after;
  });

  return stats;
}

function writeLedger(state: LedgerState): LedgerState {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const allYears = new Set<string>(state.assessmentYears || []);
  for (const c of state.clients) {
    for (const y of Object.keys(c.filings || {})) {
      allYears.add(y);
    }
  }

  const allMonths = new Set<string>(state.gstMonths || []);
  for (const gc of state.gstClients || []) {
    for (const m of Object.keys(gc.filings || {})) {
      allMonths.add(m);
    }
  }

  const persistClient = (c: ClientRecord): ClientRecord => {
    const next: ClientRecord = { ...c };
    delete next.hasPortalPassword;
    if (next.passwordEnc && isEncryptedPortalPassword(next.passwordEnc)) {
      delete next.password;
    }
    return next;
  };
  const persistGst = (c: GstClientRecord): GstClientRecord => {
    const next: GstClientRecord = { ...c };
    delete next.hasPortalPassword;
    if (next.passwordEnc && isEncryptedPortalPassword(next.passwordEnc)) {
      delete next.password;
    }
    return next;
  };

  const normalized: LedgerState = {
    assessmentYears: sortYears([...allYears]),
    clients: state.clients.map(persistClient),
    gstMonths: sortMonths([...allMonths]),
    gstClients: (state.gstClients || []).map(persistGst),
  };
  const tmpFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(normalized, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DATA_FILE);
  // Return sanitized view for API callers; disk keeps ciphertext only.
  return sanitizeLedgerForClient(normalized);
}

function sanitizeFiling(year: string, input: Partial<FilingRecord>): FilingRecord {
  const fees = Math.max(0, Number(input.fees) || 0);
  const received = Math.max(0, Number(input.received) || 0);
  const balance =
    typeof input.balance === 'number' && Number.isFinite(input.balance)
      ? Math.max(0, input.balance)
      : Math.max(0, fees - received);
  return {
    assessmentYear: year.trim(),
    filingDate: String(input.filingDate || '').trim(),
    fees,
    received,
    balance,
    paymentType: String(input.paymentType || '').trim(),
    paymentReceiveDate: String(input.paymentReceiveDate || '').trim(),
  };
}

function sanitizeGstFiling(month: string, input: Partial<GstMonthlyFiling>): GstMonthlyFiling {
  const fees = Math.max(0, Number(input.fees) || 0);
  const interest = Math.max(0, Number(input.interest) || 0);
  const tax = Math.max(0, Number(input.tax) || 0);
  const total = fees + interest + tax;
  return {
    month: month.trim(),
    fees,
    interest,
    tax,
    total,
  };
}

async function startServer() {
  const app = express();
  // Only enable proxy trust when explicitly opted in. Never use trust proxy = true (blind).
  if (TRUST_PROXY) {
    app.set('trust proxy', 'loopback');
  }
  app.use(express.json({ limit: '20mb' }));

  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (!err) {
        next();
        return;
      }
      const e = err as { type?: string; status?: number; message?: string };
      if (e.type === 'entity.too.large' || e.status === 413) {
        res.status(413).json({
          error: 'Import payload is too large. Try fewer sheets or a smaller file.',
        });
        return;
      }
      if (e instanceof SyntaxError || e.status === 400) {
        res.status(400).json({ error: 'Invalid JSON body.' });
        return;
      }
      next(err);
    }
  );

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  /** Public setup probe — no secrets. */
  app.get('/api/auth/setup-status', (_req, res) => {
    const auth = readAuth();
    res.json({
      configured: !!auth,
      bootstrapRequired: bootstrapRequired(),
      authFileCorrupt,
    });
  });

  /**
   * One-time administrator bootstrap when auth.json is missing.
   * Cannot run after successful setup. Never logs or returns the password.
   */
  app.post('/api/auth/bootstrap', (req, res) => {
    if (!allowRateLimit(clientKey(req, 'bootstrap'), 5, 15 * 60 * 1000)) {
      res.status(429).json({
        error: 'Too many setup attempts. Please try again later.',
      });
      return;
    }

    if (authFilePresent()) {
      // Re-validate readability without creating defaults
      readAuth();
      res.status(409).json({
        error: authFileCorrupt
          ? 'Authentication file exists but is unreadable. Restore from data/backups/ — bootstrap is disabled.'
          : 'Administrator is already configured. Bootstrap is no longer available.',
      });
      return;
    }

    const email = String(req.body?.email || '')
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || '');
    const confirmPassword = String(req.body?.confirmPassword || '');

    if (!email || !email.includes('@')) {
      res.status(400).json({ error: 'A valid administrator email is required.' });
      return;
    }
    if (!password || !confirmPassword) {
      res.status(400).json({
        error: 'Password and confirm password are required.',
      });
      return;
    }
    if (password !== confirmPassword) {
      res.status(400).json({
        error: 'Password and confirm password do not match.',
      });
      return;
    }
    const policy = validatePasswordPolicy(password, { email });
    if (!policy.ok) {
      res.status(400).json({ error: policy.error });
      return;
    }

    // Legacy recovery fields retained for auth.json shape compatibility; random, unused for reset.
    const passwordHashed = hashSecret(password);
    const recoveryHashed = hashSecret(crypto.randomBytes(32).toString('base64url'));
    const record: AuthRecord = {
      email,
      passwordSalt: passwordHashed.salt,
      passwordHash: passwordHashed.hash,
      recoverySalt: recoveryHashed.salt,
      recoveryHash: recoveryHashed.hash,
      updatedAt: new Date().toISOString(),
      passwordReset: null,
    };
    writeAuth(record);
    authFileCorrupt = false;
    // Intentionally do not log email beyond generic message / do not log password.
    console.info('[security] Administrator bootstrap completed. Bootstrap endpoint is now closed.');

    res.status(201).json({
      ok: true,
      message: 'Administrator account created. You can sign in now.',
      email,
    });
  });

  app.post('/api/auth/login', (req, res) => {
    const email = String(req.body?.email || '')
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const auth = readAuth();
    if (!auth) {
      res.status(503).json({
        error: bootstrapRequired()
          ? 'Administrator is not configured yet. Complete first-time setup.'
          : 'Authentication store is unavailable. Restore auth.json from backup.',
        bootstrapRequired: bootstrapRequired(),
      });
      return;
    }

    const emailOk = email === auth.email;
    const passwordOk = verifySecret(
      password,
      auth.passwordSalt,
      auth.passwordHash
    );
    if (!emailOk || !passwordOk) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const token = createSession(email);
    setSessionCookie(res, token, req);
    res.json({
      ok: true,
      email,
      token,
      expiresInMs: SESSION_TTL_MS,
    });
  });

  /**
   * Step 1: request a single-use reset token.
   * Always returns the same message (no email enumeration).
   * Token is never returned in the HTTP response (local file only).
   */
  app.post('/api/auth/forgot-password', (req, res) => {
    if (!allowRateLimit(clientKey(req, 'forgot'), 5, 15 * 60 * 1000)) {
      res.status(429).json({
        error: 'Too many reset requests. Please try again later.',
      });
      return;
    }

    const email = String(req.body?.email || '')
      .trim()
      .toLowerCase();

    const auth = readAuth();
    const emailMatches = !!(auth && email.length > 0 && email === auth.email);

    if (auth && emailMatches) {
      const rawToken = crypto.randomBytes(32).toString('base64url');
      const hashed = hashSecret(rawToken);
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
      writeAuth({
        ...auth,
        passwordReset: {
          tokenSalt: hashed.salt,
          tokenHash: hashed.hash,
          expiresAt: expiresAt.toISOString(),
        },
        updatedAt: new Date().toISOString(),
      });
      writeResetTokenFile(rawToken, expiresAt);
      // Intentionally do not log the token.
    }

    res.json({
      ok: true,
      message: GENERIC_FORGOT_MESSAGE,
    });
  });

  /**
   * Step 2: reset password using email + single-use token.
   * Email alone is never sufficient.
   */
  app.post('/api/auth/reset-password', (req, res) => {
    if (!allowRateLimit(clientKey(req, 'reset'), 10, 15 * 60 * 1000)) {
      res.status(429).json({
        error: 'Too many reset attempts. Please try again later.',
      });
      return;
    }

    const email = String(req.body?.email || '')
      .trim()
      .toLowerCase();
    const token = String(req.body?.token || '').trim();
    const newPassword = String(req.body?.newPassword || '');
    const confirmPassword = String(req.body?.confirmPassword || '');

    if (!email || !token || !newPassword || !confirmPassword) {
      res.status(400).json({
        error: 'Email, reset token, and new password are required.',
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      res.status(400).json({
        error: 'New password and confirm password do not match.',
      });
      return;
    }
    const policy = validatePasswordPolicy(newPassword, { email });
    if (!policy.ok) {
      res.status(400).json({ error: policy.error });
      return;
    }

    const auth = readAuth();
    if (!auth) {
      res.status(503).json({
        error: 'Authentication store is unavailable.',
        bootstrapRequired: bootstrapRequired(),
      });
      return;
    }

    const reset = auth.passwordReset;
    const emailOk = email === auth.email;
    const hasReset = !!(reset?.tokenSalt && reset?.tokenHash && reset?.expiresAt);
    const notExpired =
      hasReset && new Date(reset!.expiresAt).getTime() > Date.now();
    const tokenOk =
      hasReset &&
      notExpired &&
      verifySecret(token, reset!.tokenSalt, reset!.tokenHash);

    if (!emailOk || !tokenOk) {
      res.status(401).json({ error: GENERIC_RESET_ERROR });
      return;
    }

    const nextPassword = hashSecret(newPassword);
    writeAuth({
      ...auth,
      passwordSalt: nextPassword.salt,
      passwordHash: nextPassword.hash,
      passwordReset: null,
      updatedAt: new Date().toISOString(),
    });
    clearResetTokenFile();
    clearAllSessions();
    clearSessionCookie(res, req);

    res.json({
      ok: true,
      message: 'Password updated. Please sign in with your new password.',
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    destroySession(readSessionToken(req));
    clearSessionCookie(res, req);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (req, res) => {
    const session = getSession(req);
    if (!session) {
      res.status(401).json({ authenticated: false });
      return;
    }
    res.json({ authenticated: true, email: session.email });
  });

  // Protect all ledger / mutation APIs (auth routes + health stay public)
  app.use('/api', (req, res, next) => {
    if (req.path === '/health' || req.path.startsWith('/auth/')) {
      next();
      return;
    }
    requireAuth(req, res, next);
  });

  app.get('/api/ledger', (_req, res) => {
    res.json(sanitizeLedgerForClient(readLedger()));
  });

  /** Report historical PAN format issues without modifying records. */
  app.get('/api/clients/pan-validation-report', (_req, res) => {
    const state = readLedger();
    const invalid = state.clients
      .filter((c) => !isValidPanFormat(normalizePanInput(c.pan || '')))
      .map((c) => ({
        id: c.id,
        name: c.name,
        pan: c.pan,
        reason: !c.pan?.trim()
          ? 'Missing PAN'
          : 'PAN does not match Indian format pattern (structure check only; not verified with Income Tax Department).',
      }));
    res.json({
      totalClients: state.clients.length,
      invalidCount: invalid.length,
      invalid,
      note: 'Existing records are not modified. Correct PANs via client edit when ready.',
    });
  });

  /** Session-authenticated single-record reveal (not included in ordinary ledger payloads). */
  app.post('/api/clients/:id/reveal-portal-password', (req, res) => {
    try {
      const state = readLedger();
      const client = state.clients.find((c) => c.id === req.params.id);
      if (!client) {
        res.status(404).json({ error: 'Client not found.' });
        return;
      }
      const password = resolvePortalPasswordPlaintext(client);
      if (!password) {
        res.status(404).json({ error: 'No portal password stored for this client.' });
        return;
      }
      res.json({ ok: true, password });
    } catch (err) {
      res.status(503).json({
        error: err instanceof Error ? err.message : 'Unable to reveal portal password.',
      });
    }
  });

  app.post('/api/gst/clients/:id/reveal-portal-password', (req, res) => {
    try {
      const state = readLedger();
      const client = state.gstClients.find((c) => c.id === req.params.id);
      if (!client) {
        res.status(404).json({ error: 'GST company not found.' });
        return;
      }
      const password = resolvePortalPasswordPlaintext(client);
      if (!password) {
        res.status(404).json({ error: 'No portal password stored for this company.' });
        return;
      }
      res.json({ ok: true, password });
    } catch (err) {
      res.status(503).json({
        error: err instanceof Error ? err.message : 'Unable to reveal portal password.',
      });
    }
  });

  // ---------- IT Routes ----------

  app.post('/api/years', (req, res) => {
    const year = String(req.body?.year || '').trim();
    if (!year) {
      res.status(400).json({ error: 'Year is required.' });
      return;
    }
    const state = readLedger();
    state.assessmentYears = sortYears([...state.assessmentYears, year]);
    const saved = writeLedger(state);
    res.json(saved);
  });

  app.post('/api/clients', (req, res) => {
    const nameRes = validateRequiredText(req.body?.name, 'Name', 'name');
    const panRes = validatePanValue(String(req.body?.pan || ''), { required: true });
    const password = String(req.body?.password || '').trim();
    const phoneRes = validateOptionalPhone(req.body?.phone);
    const refRes = validateOptionalText(
      req.body?.referenceNumber,
      'Reference number',
      'referenceNumber'
    );
    const remarkRes = validateOptionalText(req.body?.remark, 'Remark', 'remark');

    if (!nameRes.ok) {
      res.status(400).json({ error: nameRes.error });
      return;
    }
    if (!panRes.ok) {
      res.status(400).json({ error: panRes.error });
      return;
    }
    if (!password) {
      res.status(400).json({ error: 'Name, PAN, and Password are mandatory.' });
      return;
    }
    if (!phoneRes.ok) {
      res.status(400).json({ error: phoneRes.error });
      return;
    }
    if (!refRes.ok) {
      res.status(400).json({ error: refRes.error });
      return;
    }
    if (!remarkRes.ok) {
      res.status(400).json({ error: remarkRes.error });
      return;
    }

    let passwordFields: { passwordEnc?: string };
    try {
      passwordFields = persistPasswordFields(password, {}, { required: true });
    } catch (err) {
      res.status(503).json({
        error: err instanceof Error ? err.message : 'Unable to store portal password.',
      });
      return;
    }

    const state = readLedger();
    const dup = state.clients.find(
      (c) => c.pan.toUpperCase() === panRes.pan
    );
    if (dup) {
      res.status(409).json({
        error: `A client with PAN ${panRes.pan} already exists.`,
      });
      return;
    }

    const now = new Date().toISOString();

    const filings: Record<string, FilingRecord> = {};
    if (req.body?.filings && typeof req.body.filings === 'object') {
      for (const [yr, f] of Object.entries(req.body.filings as Record<string, Partial<FilingRecord>>)) {
        if (yr.trim()) {
          filings[yr.trim()] = sanitizeFiling(yr.trim(), f);
        }
      }
    }

    const newClient: ClientRecord = {
      id: `cli-${crypto.randomUUID().slice(0, 8)}`,
      name: nameRes.value,
      pan: panRes.pan,
      ...passwordFields,
      phone: phoneRes.value,
      referenceNumber: refRes.value,
      remark: remarkRes.value,
      filings,
      createdAt: now,
      updatedAt: now,
    };

    state.clients.push(newClient);
    const saved = writeLedger(state);
    res.status(201).json({ client: stripPublicSecrets(newClient), ledger: saved });
  });

  app.put('/api/clients/:id', (req, res) => {
    const { id } = req.params;
    const state = readLedger();
    const index = state.clients.findIndex((c) => c.id === id);
    if (index === -1) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }

    const existing = state.clients[index];
    const nameRes = validateRequiredText(
      req.body?.name !== undefined ? req.body.name : existing.name,
      'Name',
      'name'
    );
    const panIncoming =
      req.body?.pan !== undefined ? String(req.body.pan) : existing.pan;
    const panNormalized = String(panIncoming || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    const panUnchanged =
      panNormalized ===
      String(existing.pan || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
    // Grandfather historical invalid PANs when unchanged; validate when changed.
    const panRes = panUnchanged
      ? { ok: true as const, pan: String(existing.pan || '').trim().toUpperCase() }
      : validatePanValue(panIncoming, { required: true });

    const passwordProvided = Object.prototype.hasOwnProperty.call(req.body || {}, 'password');
    const passwordRaw = passwordProvided
      ? String(req.body?.password || '').trim()
      : undefined;

    if (!nameRes.ok) {
      res.status(400).json({ error: nameRes.error });
      return;
    }
    if (!panRes.ok) {
      res.status(400).json({ error: panRes.error });
      return;
    }
    if (
      passwordProvided &&
      !passwordRaw &&
      !recordHasPortalPassword(existing)
    ) {
      res.status(400).json({ error: 'Name, PAN, and Password are mandatory.' });
      return;
    }
    if (!passwordProvided && !recordHasPortalPassword(existing)) {
      res.status(400).json({ error: 'Name, PAN, and Password are mandatory.' });
      return;
    }

    const phoneRes = validateOptionalPhone(
      req.body?.phone !== undefined ? req.body.phone : existing.phone
    );
    const refRes = validateOptionalText(
      req.body?.referenceNumber !== undefined
        ? req.body.referenceNumber
        : existing.referenceNumber,
      'Reference number',
      'referenceNumber'
    );
    const remarkRes = validateOptionalText(
      req.body?.remark !== undefined ? req.body.remark : existing.remark || '',
      'Remark',
      'remark'
    );
    if (!phoneRes.ok) {
      res.status(400).json({ error: phoneRes.error });
      return;
    }
    if (!refRes.ok) {
      res.status(400).json({ error: refRes.error });
      return;
    }
    if (!remarkRes.ok) {
      res.status(400).json({ error: remarkRes.error });
      return;
    }

    const dup = state.clients.find(
      (c) => c.id !== id && c.pan.toUpperCase() === panRes.pan
    );
    if (dup) {
      res.status(409).json({
        error: `A client with PAN ${panRes.pan} already exists.`,
      });
      return;
    }

    let passwordFields: { passwordEnc?: string };
    try {
      passwordFields = persistPasswordFields(passwordRaw, existing, {
        required: !recordHasPortalPassword(existing),
      });
    } catch (err) {
      res.status(503).json({
        error: err instanceof Error ? err.message : 'Unable to store portal password.',
      });
      return;
    }

    const updated: ClientRecord = {
      ...existing,
      name: nameRes.value,
      pan: panRes.pan,
      passwordEnc: passwordFields.passwordEnc,
      phone: phoneRes.value,
      referenceNumber: refRes.value,
      remark: remarkRes.value,
      updatedAt: new Date().toISOString(),
    };
    delete updated.password;

    state.clients[index] = updated;
    const saved = writeLedger(state);
    res.json({ client: stripPublicSecrets(updated), ledger: saved });
  });

  app.delete('/api/clients/:id', (req, res) => {
    const { id } = req.params;
    const state = readLedger();
    const nextClients = state.clients.filter((c) => c.id !== id);
    if (nextClients.length === state.clients.length) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }
    state.clients = nextClients;
    const saved = writeLedger(state);
    res.json({ ledger: saved });
  });

  app.post('/api/clients/:id/filings', (req, res) => {
    const { id } = req.params;
    const year = String(req.body?.assessmentYear || '').trim();
    if (!year) {
      res.status(400).json({ error: 'Assessment Year is required.' });
      return;
    }

    const state = readLedger();
    const index = state.clients.findIndex((c) => c.id === id);
    if (index === -1) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }

    const filing = sanitizeFiling(year, req.body);
    state.clients[index] = {
      ...state.clients[index],
      filings: {
        ...state.clients[index].filings,
        [year]: filing,
      },
      updatedAt: new Date().toISOString(),
    };

    const saved = writeLedger(state);
    res.json({
      client: stripPublicSecrets(state.clients[index]),
      ledger: saved,
    });
  });

  app.delete('/api/clients/:id/filings/:year', (req, res) => {
    const { id, year } = req.params;
    const decodedYear = decodeURIComponent(year);
    const state = readLedger();
    const index = state.clients.findIndex((c) => c.id === id);
    if (index === -1) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }

    const nextFilings = { ...state.clients[index].filings };
    delete nextFilings[decodedYear];
    state.clients[index] = {
      ...state.clients[index],
      filings: nextFilings,
      updatedAt: new Date().toISOString(),
    };

    const saved = writeLedger(state);
    res.json({
      client: stripPublicSecrets(state.clients[index]),
      ledger: saved,
    });
  });

  app.post('/api/import/it', (req, res) => {
    try {
      const mode = req.body?.mode === 'replace' ? 'replace' : 'merge';
      const onConflict = req.body?.onConflict === 'skip' ? 'skip' : 'update';
      const clientsIn = req.body?.clients;

      if (!Array.isArray(clientsIn)) {
        res.status(400).json({ error: 'clients must be an array.' });
        return;
      }
      if (clientsIn.length > 20000) {
        res.status(400).json({ error: 'Too many clients (max 20000).' });
        return;
      }

      const cap = (v: unknown, max = 200) =>
        String(v ?? '')
          .trim()
          .slice(0, max);

      type Incoming = {
        pan: string;
        name: string;
        phone: string;
        otherMobiles: string;
        nameVariants: string;
        filings: Record<
          string,
          {
            filingDate: string;
            fees: number;
            received: number;
            paymentType: string;
            paymentReceiveDate: string;
          }
        >;
      };

      const incoming: Incoming[] = [];
      const invalidPanRows: Array<{
        pan: string;
        name: string;
        reason: string;
      }> = [];
      for (const raw of clientsIn) {
        if (!raw || typeof raw !== 'object') continue;
        const panRaw = String((raw as Incoming).pan ?? '');
        const pan = normalizePanInput(panRaw);
        const name = clipField((raw as Incoming).name, 'name');
        if (!pan) {
          invalidPanRows.push({
            pan: panRaw.trim(),
            name,
            reason: 'Missing PAN — row skipped (existing ledger data unchanged).',
          });
          continue;
        }
        if (!isValidPanFormat(pan)) {
          invalidPanRows.push({
            pan,
            name,
            reason:
              'Invalid PAN format — row skipped (structure check only; not verified with Income Tax Department). Existing ledger records were not deleted.',
          });
          continue;
        }
        const filingsIn =
          (raw as Incoming).filings && typeof (raw as Incoming).filings === 'object'
            ? (raw as Incoming).filings
            : {};
        const filings: Incoming['filings'] = {};
        for (const [ay, f] of Object.entries(filingsIn || {})) {
          const year = cap(ay, 32);
          if (!year || !f || typeof f !== 'object') continue;
          filings[year] = {
            filingDate: cap((f as { filingDate?: string }).filingDate, 32),
            fees: Math.max(0, Number((f as { fees?: number }).fees) || 0),
            received: Math.max(0, Number((f as { received?: number }).received) || 0),
            paymentType: cap((f as { paymentType?: string }).paymentType, 40),
            paymentReceiveDate: cap(
              (f as { paymentReceiveDate?: string }).paymentReceiveDate,
              32
            ),
          };
        }
        incoming.push({
          pan,
          name,
          phone: clipField((raw as Incoming).phone, 'phone'),
          otherMobiles: clipField((raw as Incoming).otherMobiles, 'otherMobiles'),
          nameVariants: clipField((raw as Incoming).nameVariants, 'nameVariants'),
          filings,
        });
      }

      const state = readLedger();
      const backupFile = backupLedgerFile();

      const byPan = new Map(
        state.clients.map((c) => [c.pan.toUpperCase(), c] as const)
      );
      const filePans = new Set(incoming.map((c) => c.pan));

      let clientsCreated = 0;
      let clientsUpdated = 0;
      let filingsAdded = 0;
      let filingsUpdated = 0;
      let filingsSkipped = 0;
      const now = new Date().toISOString();

      for (const inc of incoming) {
        const existing = byPan.get(inc.pan);
        if (!existing) {
          const filings: Record<string, FilingRecord> = {};
          for (const [ay, f] of Object.entries(inc.filings)) {
            filings[ay] = sanitizeFiling(ay, f);
            filingsAdded += 1;
          }
          const created: ClientRecord = {
            id: `cli-${crypto.randomUUID().slice(0, 8)}`,
            name: inc.name || inc.pan,
            pan: inc.pan,
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
          byPan.set(inc.pan, created);
          clientsCreated += 1;
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
            if (onConflict === 'skip') {
              filingsSkipped += 1;
            } else {
              existing.filings[ay] = sanitizeFiling(ay, f);
              filingsUpdated += 1;
              changed = true;
            }
          } else {
            existing.filings = existing.filings || {};
            existing.filings[ay] = sanitizeFiling(ay, f);
            filingsAdded += 1;
            changed = true;
          }
        }

        if (changed) {
          existing.updatedAt = now;
          clientsUpdated += 1;
        }
      }

      if (mode === 'replace') {
        state.clients = state.clients.filter((c) =>
          filePans.has(c.pan.toUpperCase())
        );
      }

      // GST untouched — only rewrite clients / years via writeLedger
      const saved = writeLedger(state);
      res.json({
        ledger: saved,
        report: {
          clientsCreated,
          clientsUpdated,
          filingsAdded,
          filingsUpdated,
          filingsSkipped,
          backupFile,
          invalidPanCount: invalidPanRows.length,
          invalidPanRows,
          note:
            'Invalid PAN rows were skipped and reported. Existing ledger clients were not deleted or rewritten solely due to format failures.',
        },
      });
    } catch (err) {
      console.error('IT import failed', err);
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Import failed.',
      });
    }
  });

  app.post('/api/import/gst', (req, res) => {
    try {
      const mode = req.body?.mode === 'replace' ? 'replace' : 'merge';
      const onConflict = req.body?.onConflict === 'skip' ? 'skip' : 'update';
      const companiesIn = req.body?.companies;

      if (!Array.isArray(companiesIn)) {
        res.status(400).json({ error: 'companies must be an array.' });
        return;
      }
      if (companiesIn.length > 20000) {
        res.status(400).json({ error: 'Too many companies (max 20000).' });
        return;
      }

      const cap = (v: unknown, max = 200) =>
        String(v ?? '')
          .trim()
          .slice(0, max);

      type IncomingGst = {
        userId: string;
        companyName: string;
        password: string;
        phone: string;
        referenceNumber: string;
        remark: string;
        totalReceived: number;
        filings: Record<
          string,
          {
            fees: number;
            interest: number;
            tax: number;
            total: number;
          }
        >;
      };

      const incoming: IncomingGst[] = [];
      for (const raw of companiesIn) {
        if (!raw || typeof raw !== 'object') continue;
        const userId = cap((raw as IncomingGst).userId, 80);
        if (!userId) continue;
        const filingsIn =
          (raw as IncomingGst).filings &&
          typeof (raw as IncomingGst).filings === 'object'
            ? (raw as IncomingGst).filings
            : {};
        const filings: IncomingGst['filings'] = {};
        for (const [month, f] of Object.entries(filingsIn || {})) {
          const m = cap(month, 32);
          if (!m || !f || typeof f !== 'object') continue;
          const fees = Math.max(0, Number((f as { fees?: number }).fees) || 0);
          const interest = Math.max(
            0,
            Number((f as { interest?: number }).interest) || 0
          );
          const tax = Math.max(0, Number((f as { tax?: number }).tax) || 0);
          const total = Math.max(
            0,
            Number((f as { total?: number }).total) || fees + interest + tax
          );
          filings[m] = { fees, interest, tax, total };
        }
        incoming.push({
          userId,
          companyName: cap((raw as IncomingGst).companyName) || userId,
          password: cap((raw as IncomingGst).password, 80),
          phone: cap((raw as IncomingGst).phone, 40),
          referenceNumber: cap((raw as IncomingGst).referenceNumber),
          remark: cap((raw as IncomingGst).remark),
          totalReceived: Math.max(
            0,
            Number((raw as IncomingGst).totalReceived) || 0
          ),
          filings,
        });
      }

      const state = readLedger();
      const backupFile = backupLedgerFile();
      const byUser = new Map(
        state.gstClients.map((c) => [c.userId.toLowerCase(), c] as const)
      );
      const fileUsers = new Set(incoming.map((c) => c.userId.toLowerCase()));

      let clientsCreated = 0;
      let clientsUpdated = 0;
      let filingsAdded = 0;
      let filingsUpdated = 0;
      let filingsSkipped = 0;
      const now = new Date().toISOString();
      const monthsSet = new Set(state.gstMonths);

      for (const inc of incoming) {
        const key = inc.userId.toLowerCase();
        const existing = byUser.get(key);
        Object.keys(inc.filings).forEach((m) => monthsSet.add(m));

        if (!existing) {
          const filings: Record<string, GstMonthlyFiling> = {};
          for (const [m, f] of Object.entries(inc.filings)) {
            filings[m] = sanitizeGstFiling(m, f);
            filingsAdded += 1;
          }
          let passwordFields: { passwordEnc?: string } = {};
          if (inc.password && !isUnsetPortalPassword(inc.password)) {
            passwordFields = persistPasswordFields(inc.password, {}, {
              required: false,
            });
          }
          const created: GstClientRecord = {
            id: `gst-${crypto.randomUUID().slice(0, 8)}`,
            companyName: inc.companyName,
            userId: inc.userId,
            ...passwordFields,
            phone: inc.phone || '',
            referenceNumber: inc.referenceNumber || '',
            remark: inc.remark || '',
            totalReceived: inc.totalReceived,
            filings,
            createdAt: now,
            updatedAt: now,
          };
          state.gstClients.push(created);
          byUser.set(key, created);
          clientsCreated += 1;
          continue;
        }

        let changed = false;
        if (inc.companyName && inc.companyName !== existing.companyName) {
          existing.companyName = inc.companyName;
          changed = true;
        }
        if (inc.password && !isUnsetPortalPassword(inc.password)) {
          const passwordFields = persistPasswordFields(inc.password, existing, {
            required: false,
          });
          if (passwordFields.passwordEnc !== existing.passwordEnc) {
            existing.passwordEnc = passwordFields.passwordEnc;
            delete existing.password;
            changed = true;
          }
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
            if (onConflict === 'skip') {
              filingsSkipped += 1;
            } else {
              existing.filings[m] = sanitizeGstFiling(m, f);
              filingsUpdated += 1;
              changed = true;
            }
          } else {
            existing.filings = existing.filings || {};
            existing.filings[m] = sanitizeGstFiling(m, f);
            filingsAdded += 1;
            changed = true;
          }
        }

        if (changed) {
          existing.updatedAt = now;
          clientsUpdated += 1;
        }
      }

      if (mode === 'replace') {
        state.gstClients = state.gstClients.filter((c) =>
          fileUsers.has(c.userId.toLowerCase())
        );
      }

      state.gstMonths = sortMonths([...monthsSet]);
      const saved = writeLedger(state);
      res.json({
        ledger: saved,
        report: {
          clientsCreated,
          clientsUpdated,
          filingsAdded,
          filingsUpdated,
          filingsSkipped,
          backupFile,
        },
      });
    } catch (err) {
      console.error('GST import failed', err);
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Import failed.',
      });
    }
  });

  // ---------- GST Routes ----------

  app.post('/api/gst/months', (req, res) => {
    const month = String(req.body?.month || '').trim();
    if (!month) {
      res.status(400).json({ error: 'Month is required.' });
      return;
    }
    const state = readLedger();
    state.gstMonths = sortMonths([...state.gstMonths, month]);
    const saved = writeLedger(state);
    res.json(saved);
  });

  app.post('/api/gst/clients', (req, res) => {
    const companyRes = validateRequiredText(
      req.body?.companyName,
      'Company Name',
      'companyName'
    );
    const userRes = validateRequiredText(req.body?.userId, 'User ID', 'userId');
    const password = String(req.body?.password || '').trim();
    const phoneRes = validateOptionalPhone(req.body?.phone);
    const refRes = validateOptionalText(
      req.body?.referenceNumber,
      'Reference number',
      'referenceNumber'
    );
    const remarkRes = validateOptionalText(req.body?.remark, 'Remark', 'remark');

    if (!companyRes.ok) {
      res.status(400).json({ error: companyRes.error });
      return;
    }
    if (!userRes.ok) {
      res.status(400).json({ error: userRes.error });
      return;
    }
    if (!password) {
      res.status(400).json({ error: 'Company Name, User ID, and Password are mandatory.' });
      return;
    }
    if (!phoneRes.ok) {
      res.status(400).json({ error: phoneRes.error });
      return;
    }
    if (!refRes.ok) {
      res.status(400).json({ error: refRes.error });
      return;
    }
    if (!remarkRes.ok) {
      res.status(400).json({ error: remarkRes.error });
      return;
    }

    let passwordFields: { passwordEnc?: string };
    try {
      passwordFields = persistPasswordFields(password, {}, { required: true });
    } catch (err) {
      res.status(503).json({
        error: err instanceof Error ? err.message : 'Unable to store portal password.',
      });
      return;
    }

    const state = readLedger();
    const now = new Date().toISOString();

    const filings: Record<string, GstMonthlyFiling> = {};
    if (req.body?.filings && typeof req.body.filings === 'object') {
      for (const [m, f] of Object.entries(
        req.body.filings as Record<string, Partial<GstMonthlyFiling>>
      )) {
        if (m.trim()) {
          filings[m.trim()] = sanitizeGstFiling(m.trim(), f);
        }
      }
    }

    const newClient: GstClientRecord = {
      id: `gst-${crypto.randomUUID().slice(0, 8)}`,
      companyName: companyRes.value,
      userId: userRes.value,
      ...passwordFields,
      phone: phoneRes.value,
      referenceNumber: refRes.value,
      remark: remarkRes.value,
      totalReceived: Math.max(0, Number(req.body?.totalReceived) || 0),
      filings,
      createdAt: now,
      updatedAt: now,
    };

    state.gstClients.push(newClient);
    const saved = writeLedger(state);
    res.status(201).json({ client: stripPublicSecrets(newClient), ledger: saved });
  });

  app.put('/api/gst/clients/:id', (req, res) => {
    const { id } = req.params;
    const state = readLedger();
    const index = state.gstClients.findIndex((c) => c.id === id);
    if (index === -1) {
      res.status(404).json({ error: 'GST company not found.' });
      return;
    }

    const existing = state.gstClients[index];
    const companyRes = validateRequiredText(
      req.body?.companyName !== undefined
        ? req.body.companyName
        : existing.companyName,
      'Company Name',
      'companyName'
    );
    const userRes = validateRequiredText(
      req.body?.userId !== undefined ? req.body.userId : existing.userId,
      'User ID',
      'userId'
    );
    const passwordProvided = Object.prototype.hasOwnProperty.call(req.body || {}, 'password');
    const passwordRaw = passwordProvided
      ? String(req.body?.password || '').trim()
      : undefined;

    if (!companyRes.ok) {
      res.status(400).json({ error: companyRes.error });
      return;
    }
    if (!userRes.ok) {
      res.status(400).json({ error: userRes.error });
      return;
    }
    if (
      (passwordProvided && !passwordRaw && !recordHasPortalPassword(existing)) ||
      (!passwordProvided && !recordHasPortalPassword(existing))
    ) {
      res.status(400).json({ error: 'Company Name, User ID, and Password are mandatory.' });
      return;
    }

    const phoneRes = validateOptionalPhone(
      req.body?.phone !== undefined ? req.body.phone : existing.phone
    );
    const refRes = validateOptionalText(
      req.body?.referenceNumber !== undefined
        ? req.body.referenceNumber
        : existing.referenceNumber,
      'Reference number',
      'referenceNumber'
    );
    const remarkRes = validateOptionalText(
      req.body?.remark !== undefined ? req.body.remark : existing.remark || '',
      'Remark',
      'remark'
    );
    if (!phoneRes.ok) {
      res.status(400).json({ error: phoneRes.error });
      return;
    }
    if (!refRes.ok) {
      res.status(400).json({ error: refRes.error });
      return;
    }
    if (!remarkRes.ok) {
      res.status(400).json({ error: remarkRes.error });
      return;
    }

    let passwordFields: { passwordEnc?: string };
    try {
      passwordFields = persistPasswordFields(passwordRaw, existing, {
        required: !recordHasPortalPassword(existing),
      });
    } catch (err) {
      res.status(503).json({
        error: err instanceof Error ? err.message : 'Unable to store portal password.',
      });
      return;
    }

    const updated: GstClientRecord = {
      ...existing,
      companyName: companyRes.value,
      userId: userRes.value,
      passwordEnc: passwordFields.passwordEnc,
      phone: phoneRes.value,
      referenceNumber: refRes.value,
      remark: remarkRes.value,
      totalReceived:
        req.body?.totalReceived !== undefined
          ? Math.max(0, Number(req.body.totalReceived) || 0)
          : Math.max(0, Number(existing.totalReceived) || 0),
      updatedAt: new Date().toISOString(),
    };
    delete updated.password;

    state.gstClients[index] = updated;
    const saved = writeLedger(state);
    res.json({ client: stripPublicSecrets(updated), ledger: saved });
  });

  app.delete('/api/gst/clients/:id', (req, res) => {
    const { id } = req.params;
    const state = readLedger();
    const nextClients = state.gstClients.filter((c) => c.id !== id);
    if (nextClients.length === state.gstClients.length) {
      res.status(404).json({ error: 'GST company not found.' });
      return;
    }
    state.gstClients = nextClients;
    const saved = writeLedger(state);
    res.json({ ledger: saved });
  });

  app.post('/api/gst/clients/:id/filings', (req, res) => {
    const { id } = req.params;
    const month = String(req.body?.month || '').trim();
    if (!month) {
      res.status(400).json({ error: 'Month is required.' });
      return;
    }

    const state = readLedger();
    const index = state.gstClients.findIndex((c) => c.id === id);
    if (index === -1) {
      res.status(404).json({ error: 'GST company not found.' });
      return;
    }

    const filing = sanitizeGstFiling(month, req.body);
    state.gstClients[index] = {
      ...state.gstClients[index],
      filings: {
        ...state.gstClients[index].filings,
        [month]: filing,
      },
      updatedAt: new Date().toISOString(),
    };

    const saved = writeLedger(state);
    res.json({
      client: stripPublicSecrets(state.gstClients[index]),
      ledger: saved,
    });
  });

  app.delete('/api/gst/clients/:id/filings/:month', (req, res) => {
    const { id, month } = req.params;
    const decodedMonth = decodeURIComponent(month);
    const state = readLedger();
    const index = state.gstClients.findIndex((c) => c.id === id);
    if (index === -1) {
      res.status(404).json({ error: 'GST company not found.' });
      return;
    }

    const nextFilings = { ...state.gstClients[index].filings };
    delete nextFilings[decodedMonth];
    state.gstClients[index] = {
      ...state.gstClients[index],
      filings: nextFilings,
      updatedAt: new Date().toISOString(),
    };

    const saved = writeLedger(state);
    res.json({
      client: stripPublicSecrets(state.gstClients[index]),
      ledger: saved,
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  if (HOST === '0.0.0.0' || HOST === '::') {
    console.warn(
      `[security] HOST=${HOST} binds all interfaces. Use only behind a hardened reverse proxy for hosted deployment. Local UAT should use HOST=127.0.0.1.`
    );
  }

  app.listen(PORT, HOST, () => {
    const displayHost = HOST === '0.0.0.0' ? '127.0.0.1' : HOST;
    console.log(`TaxLedger server listening on ${HOST}:${PORT}`);
    console.log(`Local access: http://${displayHost}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
