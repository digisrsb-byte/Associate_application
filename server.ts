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
  GstPaymentEntry,
  LedgerState,
} from './src/types/ledger.ts';
import { PAYMENT_TYPES } from './src/types/ledger.ts';
import {
  computeGstFilingOutstanding,
  computeGstFilingReceived,
  getGstUnallocatedReceived,
  gstClientUsesPaymentAccounting,
  sumGstClientPaymentLines,
} from './src/utils/ledgerUtils.ts';
import { sanitizeGstFilingCharges } from './src/utils/gstFilingSanitize.ts';
import {
  decryptPortalPassword,
  encryptPortalPassword,
  isEncryptedPortalPassword,
  isUnsetPortalPassword,
  loadPortalEncryptionKey,
  recordHasPortalPassword,
} from './portalCrypto.ts';
import {
  BACKUP_FILE_SUFFIX,
  encryptLedgerBackup,
  ensureBackupKeyFile,
  isRegularBackupFile,
  loadBackupEncryptionKey,
  parseAndValidateLedgerJson,
  replaceFileWithValidatedLedgerJson,
  restrictKeyFileAccess,
  verifyEncryptedBackupFile,
} from './backupCrypto.ts';
import { hashSecret, verifySecret } from './authCrypto.ts';
import { validatePasswordPolicy } from './passwordPolicy.ts';
import { createSecurityHeadersMiddleware } from './securityHeaders.ts';
import {
  resolveAuthBackend,
  SESSION_TTL_MS,
  type ResolvedAuthBackend,
} from './src/auth/authBackend.ts';
import {
  clearLocalResetTokenFile,
  jsonResetTokenPath,
  postgresResetTokenPath,
  writeLocalResetTokenFile,
} from './src/auth/resetTokenDelivery.ts';
import { findOwnerByEmail } from './src/db/authUsers.ts';
import { getPool } from './src/db/pool.ts';
import {
  createPasswordResetChallenge,
  consumePasswordResetChallenge,
  PasswordResetStoreError,
} from './src/db/passwordResetStore.ts';
import {
  createPgSession,
  getPgSessionByRawToken,
  revokePgSessionByRawToken,
} from './src/db/sessionStore.ts';
import {
  resolveBusinessDataBackend,
  type ResolvedBusinessDataBackend,
} from './src/business/businessDataBackend.ts';
import {
  LedgerConflictError,
  loadLedgerForOrganization,
  loadLedgerSnapshot,
  mutateLedgerForOrganization,
  saveLedgerForOrganization,
} from './src/business/pgLedgerRepository.ts';
import {
  clipField,
  FIELD_LIMITS,
  isValidPanFormat,
  normalizePanInput,
  validateOptionalPhone,
  validateOptionalText,
  validatePanValue,
  validatePaymentDate,
  validateRequiredPhone,
  validateRequiredText,
} from './src/utils/fieldValidation.ts';
import {
  applyGstImportToLedger,
  applyItImportToLedger,
} from './src/import/applyImportToLedger.ts';
import {
  anonymizeGstPreview,
  anonymizeItPreview,
  publicIssues,
} from './src/import/anonymizePreview.ts';
import {
  mappingFingerprint,
  suggestColumnMapping,
  validateMapping,
  type ColumnMapping,
} from './src/import/columnMapping.ts';
import { MAX_IMPORT_FILE_BYTES } from './src/import/excelCells.ts';
import { fieldsForDomain, type ImportDomain } from './src/import/fieldCatalog.ts';
import { parseGstSheetWithMapping } from './src/import/gstMappedParse.ts';
import {
  createImportSession,
  deleteImportSession,
  getImportSession,
  markSessionCommitted,
  readSessionBuffer,
  updateImportSession,
  withOrgImportLock,
} from './src/import/importSessionStore.ts';
import { parseItSheetWithMapping } from './src/import/itMappedParse.ts';
import {
  canCommit,
  validateGstImport,
  validateItImport,
  type ImportPolicies,
} from './src/import/validateImport.ts';
import { inspectWorkbookBuffer } from './src/import/workbookInspect.ts';
import {
  sortAssessmentYears,
  sortGstMonths,
} from './src/utils/ledgerUtils.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Default live application data directory (unchanged behaviour when DATA_DIR unset). */
const DEFAULT_DATA_DIR = path.resolve(__dirname, 'data');

/**
 * Resolve storage directory.
 * - Unset DATA_DIR → DEFAULT_DATA_DIR (./data next to server)
 * - DATA_DIR set → path.resolve(DATA_DIR) (absolute, or relative to process cwd)
 * When E2E_ISOLATION=1, DATA_DIR must resolve to a .../data-e2e directory and must not
 * equal the live default data directory (fail closed — no silent fallback to ./data).
 */
function resolveDataDir(): string {
  const raw = (process.env.DATA_DIR || '').trim();
  const e2eIsolation =
    process.env.E2E_ISOLATION === '1' ||
    String(process.env.E2E_ISOLATION || '').toLowerCase() === 'true';

  if (e2eIsolation) {
    if (!raw) {
      console.error(
        '[security] E2E_ISOLATION=1 requires DATA_DIR to point at an isolated data-e2e directory. Refusing to start.'
      );
      process.exit(1);
    }
    const resolved = path.resolve(raw);
    const base = path.basename(resolved).toLowerCase();
    if (base !== 'data-e2e') {
      console.error(
        `[security] E2E_ISOLATION=1 requires DATA_DIR basename data-e2e (got ${base}). Refusing to start.`
      );
      process.exit(1);
    }
    if (path.resolve(resolved) === path.resolve(DEFAULT_DATA_DIR)) {
      console.error(
        '[security] E2E_ISOLATION=1 refuses to use the live application data directory. Refusing to start.'
      );
      process.exit(1);
    }
    return resolved;
  }

  if (!raw) return DEFAULT_DATA_DIR;
  return path.resolve(raw);
}

const DATA_DIR = resolveDataDir();
const DATA_FILE = path.join(DATA_DIR, 'ledger.json');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');
/** Local out-of-band delivery for JSON-auth reset tokens (no SMTP). Never commit. */
const RESET_TOKEN_FILE = jsonResetTokenPath(DATA_DIR);
const PORT = Number(process.env.PORT) || 3000;
/** Local UAT default: loopback only. Override with HOST (never silently defaults to 0.0.0.0). */
const HOST = (process.env.HOST || '127.0.0.1').trim() || '127.0.0.1';

const SESSION_COOKIE = 'tl_session';
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes (JSON path; PG store has its own TTL)
const sessions = new Map<string, { email: string; expiresAt: number }>();
/** Set when auth.json exists but cannot be parsed — never auto-overwrite with defaults. */
let authFileCorrupt = false;

/** Resolved at process start — fail closed for invalid postgres config. */
let AUTH_BACKEND: ResolvedAuthBackend;
try {
  AUTH_BACKEND = resolveAuthBackend();
} catch (err) {
  console.error(
    `[security] ${err instanceof Error ? err.message : String(err)}`
  );
  process.exit(1);
}

/** Business data backend — default JSON; postgres fail-closed (Phase 4). */
let BUSINESS_DATA_BACKEND: ResolvedBusinessDataBackend;
try {
  BUSINESS_DATA_BACKEND = resolveBusinessDataBackend(process.env, AUTH_BACKEND);
} catch (err) {
  console.error(
    `[security] ${err instanceof Error ? err.message : String(err)}`
  );
  process.exit(1);
}

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

/**
 * Client IP for rate limiting.
 * Honour X-Forwarded-For only when TRUST_PROXY=1 (explicit opt-in).
 * Otherwise use the direct socket address — never blind header trust.
 */
function requestClientIp(req: express.Request): string {
  if (TRUST_PROXY) {
    const forwarded = String(req.headers['x-forwarded-for'] || '')
      .split(',')[0]
      .trim();
    if (forwarded) return forwarded;
    if (req.ip) return req.ip;
  }
  return req.socket.remoteAddress || 'unknown';
}

function clientKey(req: express.Request, action: string): string {
  return `${action}:${requestClientIp(req)}`;
}

/** Login rate limits (env-overridable for isolated E2E window tests). */
const LOGIN_IP_MAX = Math.max(1, Number(process.env.LOGIN_RATE_IP_MAX) || 20);
const LOGIN_ACCOUNT_MAX = Math.max(
  1,
  Number(process.env.LOGIN_RATE_ACCOUNT_MAX) || 10
);
const LOGIN_RATE_WINDOW_MS = Math.max(
  1000,
  Number(process.env.LOGIN_RATE_WINDOW_MS) || 15 * 60 * 1000
);

/** Returns true if allowed; false if rate limited. Records the attempt when allowed. */
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

/** Peek without recording — used by login (record only on failed auth). */
function isRateLimited(
  key: string,
  maxAttempts: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const recent = (rateLimitBuckets.get(key) || []).filter(
    (t) => now - t < windowMs
  );
  rateLimitBuckets.set(key, recent);
  return recent.length >= maxAttempts;
}

function recordRateLimitAttempt(key: string, windowMs: number): void {
  const now = Date.now();
  const recent = (rateLimitBuckets.get(key) || []).filter(
    (t) => now - t < windowMs
  );
  recent.push(now);
  rateLimitBuckets.set(key, recent);
}

function clearRateLimitKey(key: string): void {
  rateLimitBuckets.delete(key);
}

function rateLimitRetryAfterSec(key: string, windowMs: number): number {
  const now = Date.now();
  const recent = (rateLimitBuckets.get(key) || []).filter(
    (t) => now - t < windowMs
  );
  if (recent.length === 0) return Math.ceil(windowMs / 1000);
  const oldest = Math.min(...recent);
  return Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
}

function clearResetTokenFile(): void {
  clearLocalResetTokenFile(RESET_TOKEN_FILE);
}

function writeResetTokenFile(token: string, expiresAt: Date): void {
  ensureDataDir();
  writeLocalResetTokenFile(RESET_TOKEN_FILE, token, expiresAt);
}

function writePostgresResetTokenFile(
  email: string,
  token: string,
  expiresAt: Date
): void {
  ensureDataDir();
  writeLocalResetTokenFile(
    postgresResetTokenPath(DATA_DIR, email),
    token,
    expiresAt
  );
}

function clearPostgresResetTokenFile(email: string): void {
  clearLocalResetTokenFile(postgresResetTokenPath(DATA_DIR, email));
}

const GENERIC_FORGOT_MESSAGE =
  'If an account exists for that email, a password reset token has been issued. Use the Reset password screen with the token from your local out-of-band delivery channel.';
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

function getJsonSession(
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

type ResolvedSession = {
  email: string;
  token: string;
  userId?: string;
};

async function resolveSession(
  req: express.Request
): Promise<ResolvedSession | null> {
  const token = readSessionToken(req);
  if (!token) return null;

  if (AUTH_BACKEND.kind === 'postgres') {
    const orgId = AUTH_BACKEND.organizationId!;
    const pool = getPool();
    const pgSession = await getPgSessionByRawToken(pool, orgId, token);
    if (!pgSession) return null;
    return {
      email: pgSession.email,
      token,
      userId: pgSession.userId,
    };
  }

  const jsonSession = getJsonSession(req);
  return jsonSession;
}

/** Sync JSON-only helper retained for call sites that only run under json backend. */
function getSession(
  req: express.Request
): { email: string; token: string } | null {
  return getJsonSession(req);
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

async function requireAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<void> {
  try {
    const session = await resolveSession(req);
    if (!session) {
      res.status(401).json({ error: 'Unauthorized. Please log in.' });
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}

/** Shared AY / GST month ordering — single implementation in ledgerUtils. */
const sortYears = sortAssessmentYears;
const sortMonths = sortGstMonths;

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



/** Empty ledger for fresh installs — no demo clients, filings, or portal passwords. */
function createInitialLedger(): LedgerState {
  return {
    assessmentYears: [...BASELINE_ASSESSMENT_YEARS],
    clients: [],
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

/** Default key file lives beside ledger — never inside backups/. */
function defaultBackupKeyFilePath(): string {
  return path.join(DATA_DIR, 'BACKUP_ENCRYPTION_KEY');
}

function requireBackupEncryptionKey(): Buffer {
  // Prefer env / explicit file; for E2E isolation only, ensure key file under DATA_DIR.
  let status = loadBackupEncryptionKey({
    keyFilePath: process.env.BACKUP_ENCRYPTION_KEY_FILE || defaultBackupKeyFilePath(),
  });
  if (!status.ok && process.env.E2E_ISOLATION === '1') {
    ensureBackupKeyFile(defaultBackupKeyFilePath());
    status = loadBackupEncryptionKey({
      keyFilePath: defaultBackupKeyFilePath(),
    });
  }
  if (!status.ok) {
    throw new Error(
      'BACKUP_ENCRYPTION_KEY is missing or invalid. Cannot create encrypted backups (no plaintext fallback).'
    );
  }
  if (status.source === 'file') {
    restrictKeyFileAccess(
      process.env.BACKUP_ENCRYPTION_KEY_FILE || defaultBackupKeyFilePath()
    );
  }
  return status.key;
}

function isBackupArtifactName(name: string): boolean {
  return (
    name.startsWith('ledger-') &&
    (name.endsWith(BACKUP_FILE_SUFFIX) || name.endsWith('.json'))
  );
}

/**
 * Create an AES-256-GCM encrypted ledger backup under DATA_DIR/backups.
 * Never writes plaintext ledger JSON into the backups directory.
 */
/**
 * JSON-backend pre-mutation backup. Skipped for postgres business data
 * (DB transaction / revision locking is the safety net; JSON .enc backups N/A).
 */
function maybeBackupLedgerFile(label = ''): string {
  if (BUSINESS_DATA_BACKEND.kind === 'postgres') return '';
  return backupLedgerFile(label);
}

function backupLedgerFile(label = ''): string {
  const key = requireBackupEncryptionKey();
  const backupDir = path.join(DATA_DIR, 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const d = new Date();
  const stamp =
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}` +
    `-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
  const suffix = label ? `-${label}` : '';
  const backupFile = `ledger-${stamp}${suffix}${BACKUP_FILE_SUFFIX}`;
  const dest = path.join(backupDir, backupFile);

  let plaintext: string;
  if (fs.existsSync(DATA_FILE)) {
    plaintext = fs.readFileSync(DATA_FILE, 'utf-8');
  } else {
    const initial = createInitialLedger();
    migratePortalPasswordsInState(initial);
    plaintext = JSON.stringify(initial, null, 2);
  }
  // Validate source JSON before encrypting (fail closed)
  parseAndValidateLedgerJson(plaintext);
  const encrypted = encryptLedgerBackup(plaintext, key);

  // Write via temp in backup dir then rename — never leave plaintext .json backup
  const tmp = path.join(
    backupDir,
    `.tmp-${crypto.randomBytes(8).toString('hex')}${BACKUP_FILE_SUFFIX}`
  );
  try {
    fs.writeFileSync(tmp, encrypted);
    fs.renameSync(tmp, dest);
  } catch (err) {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    throw err;
  }

  const files = fs
    .readdirSync(backupDir)
    .filter((f) => isBackupArtifactName(f))
    .filter((f) => isRegularBackupFile(path.join(backupDir, f)))
    .map((f) => {
      const p = path.join(backupDir, f);
      // lstat: do not follow symlinks/junctions for retention ordering
      return { f, m: fs.lstatSync(p).mtimeMs };
    })
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

/**
 * Restore an encrypted backup into targetLedgerPath after verification.
 * Never overwrites target until decrypt + JSON shape validation succeed.
 * Creates an encrypted pre-restore backup of the current target when present.
 * Does not delete existing backup artifacts.
 */
function restoreEncryptedLedgerBackup(options: {
  backupFileName: string;
  targetLedgerPath: string;
}): { ok: true; preRestoreBackup: string | null; clients: number } {
  const key = requireBackupEncryptionKey();
  const backupDir = path.join(DATA_DIR, 'backups');
  const base = path.basename(options.backupFileName);
  if (base !== options.backupFileName || !isBackupArtifactName(base)) {
    throw new Error('Invalid backup file name.');
  }
  if (!base.endsWith(BACKUP_FILE_SUFFIX)) {
    throw new Error('Only encrypted .json.enc backups can be restored via this path.');
  }
  const backupPath = path.join(backupDir, base);
  // Resolve and ensure path stays under backupDir (before any read)
  const resolvedBackup = path.resolve(backupPath);
  if (!resolvedBackup.startsWith(path.resolve(backupDir) + path.sep)) {
    throw new Error('Backup path escapes backups directory.');
  }
  // Single path read + decrypt + shape check (lstat inside verify). Do not re-read path.
  // Windows TOCTOU between lstat and read is NOT eliminated by this refactor.
  const verified = verifyEncryptedBackupFile(resolvedBackup, key);
  const decryptedUtf8 = verified.plaintextUtf8;

  let preRestoreBackup: string | null = null;
  const target = path.resolve(options.targetLedgerPath);
  // Safety: refuse restore into live ./data when E2E isolation is on
  const liveLedger = path.resolve(path.join(DEFAULT_DATA_DIR, 'ledger.json'));
  if (process.env.E2E_ISOLATION === '1' && target === liveLedger) {
    throw new Error('Refusing to restore into live data/ under E2E isolation.');
  }

  if (fs.existsSync(target)) {
    // Preserve recoverable copy of current ledger before replace
    preRestoreBackup = backupLedgerFile('pre-restore');
  }

  // Same-dir temp write + validate + rename. Does not delete target first.
  // Does not eliminate Windows/OneDrive EPERM on rename.
  replaceFileWithValidatedLedgerJson({
    targetPath: target,
    plaintextUtf8: decryptedUtf8,
  });

  return {
    ok: true,
    preRestoreBackup,
    clients: Array.isArray(verified.ledger.clients)
      ? verified.ledger.clients.length
      : 0,
  };
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

/** Normalize ledger for persistence (JSON file or PostgreSQL). */
function normalizeLedgerForPersist(state: LedgerState): LedgerState {
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

  return {
    assessmentYears: sortYears([...allYears]),
    clients: state.clients.map(persistClient),
    gstMonths: sortMonths([...allMonths]),
    gstClients: (state.gstClients || []).map(persistGst),
  };
}

function writeLedger(state: LedgerState): LedgerState {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const normalized = normalizeLedgerForPersist(state);
  const tmpFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(normalized, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DATA_FILE);
  // Return sanitized view for API callers; disk keeps ciphertext only.
  return sanitizeLedgerForClient(normalized);
}

/**
 * Load shared business ledger for the active backend.
 * Postgres path is always scoped to AUTH_ORGANIZATION_ID (never a browser-supplied org).
 */
async function loadBusinessLedger(): Promise<LedgerState> {
  if (BUSINESS_DATA_BACKEND.kind === 'postgres') {
    const orgId = BUSINESS_DATA_BACKEND.organizationId;
    if (!orgId) {
      throw new Error('PostgreSQL business data requires AUTH_ORGANIZATION_ID.');
    }
    return loadLedgerForOrganization(getPool(), orgId);
  }
  return readLedger();
}

/**
 * Persist shared business ledger. Does not fall back to JSON on PostgreSQL errors.
 * Prefer mutateBusinessLedger for RMW routes (optimistic concurrency + retry).
 */
async function saveBusinessLedger(
  state: LedgerState,
  expectedRevision?: string
): Promise<LedgerState> {
  if (BUSINESS_DATA_BACKEND.kind === 'postgres') {
    const orgId = BUSINESS_DATA_BACKEND.organizationId;
    if (!orgId) {
      throw new Error('PostgreSQL business data requires AUTH_ORGANIZATION_ID.');
    }
    const normalized = normalizeLedgerForPersist(state);
    let revision = expectedRevision;
    if (revision === undefined) {
      const snap = await loadLedgerSnapshot(getPool(), orgId);
      revision = snap.revision;
    }
    await saveLedgerForOrganization(getPool(), orgId, normalized, {
      expectedRevision: revision,
    });
    return sanitizeLedgerForClient(normalized);
  }
  return writeLedger(state);
}

/** Early-exit control for mutateBusinessLedger callbacks (maps to HTTP status). */
class BusinessRouteError extends Error {
  status: number;
  payload: Record<string, unknown>;
  constructor(
    status: number,
    error: string,
    payload: Record<string, unknown> = {}
  ) {
    super(error);
    this.name = 'BusinessRouteError';
    this.status = status;
    this.payload = { error, ...payload };
  }
}

/**
 * Read-modify-write with conflict retry (postgres). JSON path remains a single RMW.
 * Mutator always receives a fresh clone so concurrent independent edits can both land.
 */
async function mutateBusinessLedger(
  mutator: (state: LedgerState) => LedgerState | Promise<LedgerState>
): Promise<LedgerState> {
  if (BUSINESS_DATA_BACKEND.kind === 'postgres') {
    const orgId = BUSINESS_DATA_BACKEND.organizationId;
    if (!orgId) {
      throw new Error('PostgreSQL business data requires AUTH_ORGANIZATION_ID.');
    }
    const snap = await mutateLedgerForOrganization(
      getPool(),
      orgId,
      async (draft) => normalizeLedgerForPersist(await mutator(draft))
    );
    return sanitizeLedgerForClient(snap.ledger);
  }
  const state = structuredClone(readLedger());
  const next = await mutator(state);
  return writeLedger(next);
}

function sanitizeFiling(year: string, input: Partial<FilingRecord>): FilingRecord {
  const fees = Math.max(0, Number(input.fees) || 0);
  const received = Math.max(0, Number(input.received) || 0);
  // Always recompute — never trust client-supplied balance (mirrors GST total).
  const balance = Math.max(0, fees - received);
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

const SUPPORTED_PAYMENT_MODES = PAYMENT_TYPES as readonly string[];

function sanitizeGstPaymentEntry(
  input: Partial<GstPaymentEntry> & { idempotencyKey?: string },
  existing?: GstPaymentEntry
): GstPaymentEntry {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new BusinessRouteError(400, 'Payment amount must be a positive number.');
  }
  let paymentDate: string;
  if (existing && input.paymentDate === undefined) {
    // Preserve historical date strings on amount/mode-only edits.
    paymentDate = String(existing.paymentDate || '').trim();
    if (!paymentDate) {
      throw new BusinessRouteError(400, 'Payment date is required.');
    }
  } else {
    const dateRes = validatePaymentDate(
      input.paymentDate !== undefined ? input.paymentDate : existing?.paymentDate
    );
    if (!dateRes.ok) {
      throw new BusinessRouteError(400, dateRes.error);
    }
    paymentDate = dateRes.value;
  }
  const paymentMode = String(input.paymentMode ?? existing?.paymentMode ?? '')
    .trim()
    .slice(0, FIELD_LIMITS.paymentType);
  if (!paymentMode) {
    throw new BusinessRouteError(400, 'Payment mode is required.');
  }
  const modeAllowed =
    SUPPORTED_PAYMENT_MODES.includes(paymentMode) ||
    (!!existing && paymentMode === existing.paymentMode);
  if (!modeAllowed) {
    throw new BusinessRouteError(
      400,
      `Unsupported payment mode. Use one of: ${SUPPORTED_PAYMENT_MODES.join(', ')}.`
    );
  }
  const referenceRaw = input.reference !== undefined
    ? String(input.reference || '').trim()
    : existing?.reference || '';
  const reference = referenceRaw.slice(0, FIELD_LIMITS.referenceNumber);
  const idempotencyKey = String(
    input.idempotencyKey ?? existing?.idempotencyKey ?? ''
  )
    .trim()
    .slice(0, 80);
  const now = new Date().toISOString();
  return {
    id: existing?.id || `gstpay-${crypto.randomUUID().slice(0, 8)}`,
    amount,
    paymentDate,
    paymentMode,
    ...(reference ? { reference } : {}),
    ...(idempotencyKey ? { idempotencyKey } : {}),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

function withGstFilingReceived(filing: GstMonthlyFiling): GstMonthlyFiling {
  const payments = Array.isArray(filing.payments) ? filing.payments : [];
  return {
    ...filing,
    payments,
    received: computeGstFilingReceived({ payments }),
  };
}

/**
 * Capture legacy company-level totalReceived into unallocatedReceived when first
 * entering payment-line accounting. Never auto-allocates across months.
 */
function preserveLegacyReceiptsOnPaymentTransition(
  company: GstClientRecord
): number {
  if (gstClientUsesPaymentAccounting(company)) {
    return getGstUnallocatedReceived(company);
  }
  const existingUnalloc = getGstUnallocatedReceived(company);
  if (existingUnalloc > 0) return existingUnalloc;
  return Math.max(0, Number(company.totalReceived) || 0);
}

/**
 * When payment-line accounting is active:
 * totalReceived = allocated payments + unallocatedReceived.
 * Legacy companies without a payments array keep their stored pool.
 * Never clears unallocatedReceived when payments are edited/deleted.
 */
function syncGstCompanyTotalReceived(client: GstClientRecord): void {
  if (!gstClientUsesPaymentAccounting(client)) return;
  const allocated = sumGstClientPaymentLines(client);
  const unallocated = getGstUnallocatedReceived(client);
  client.totalReceived = allocated + unallocated;
}

/** Charge-line sanitizer — shared implementation (preserves payments[] or legacy received). */
function sanitizeGstFiling(
  month: string,
  input: Partial<GstMonthlyFiling>,
  existing?: GstMonthlyFiling
): GstMonthlyFiling {
  return sanitizeGstFilingCharges(month, input, existing);
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  // Only enable proxy trust when explicitly opted in. Never use trust proxy = true (blind).
  if (TRUST_PROXY) {
    app.set('trust proxy', 'loopback');
  }
  // M1 — security headers on all responses (API, static, errors). Before body parser.
  app.use(
    createSecurityHeadersMiddleware({
      nodeEnv: process.env.NODE_ENV || 'development',
      e2eIsolation:
        process.env.E2E_ISOLATION === '1' ||
        String(process.env.E2E_ISOLATION || '').toLowerCase() === 'true',
      cookieSecureMode: COOKIE_SECURE_MODE,
      trustProxy: TRUST_PROXY,
      host: HOST,
    })
  );
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
    if (AUTH_BACKEND.kind === 'postgres') {
      res.json({
        configured: true,
        bootstrapRequired: false,
        authFileCorrupt: false,
        authBackend: 'postgres',
      });
      return;
    }
    const auth = readAuth();
    res.json({
      configured: !!auth,
      bootstrapRequired: bootstrapRequired(),
      authFileCorrupt,
      authBackend: 'json',
    });
  });

  /**
   * One-time administrator bootstrap when auth.json is missing.
   * Cannot run after successful setup. Never logs or returns the password.
   * Disabled when AUTH_BACKEND=postgres (owners are provisioned in PostgreSQL).
   */
  app.post('/api/auth/bootstrap', (req, res) => {
    if (AUTH_BACKEND.kind === 'postgres') {
      res.status(409).json({
        error:
          'PostgreSQL authentication is enabled. Administrator bootstrap via auth.json is disabled.',
        authBackend: 'postgres',
      });
      return;
    }

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

  app.post('/api/auth/login', async (req, res, next) => {
    try {
      const email = String(req.body?.email || '')
        .trim()
        .toLowerCase();
      const password = String(req.body?.password || '');

      if (!email || !password) {
        res.status(400).json({ error: 'Email and password are required.' });
        return;
      }

      // Dual-key temporary limits (failed attempts only). No permanent lockout.
      const ipKey = `login-ip:${requestClientIp(req)}`;
      const accountKey = `login-account:${email}`;
      if (
        isRateLimited(ipKey, LOGIN_IP_MAX, LOGIN_RATE_WINDOW_MS) ||
        isRateLimited(accountKey, LOGIN_ACCOUNT_MAX, LOGIN_RATE_WINDOW_MS)
      ) {
        const retryAfterSec = Math.max(
          rateLimitRetryAfterSec(ipKey, LOGIN_RATE_WINDOW_MS),
          rateLimitRetryAfterSec(accountKey, LOGIN_RATE_WINDOW_MS)
        );
        res.setHeader('Retry-After', String(retryAfterSec));
        res.status(429).json({
          error: 'Too many login attempts. Please try again later.',
          retryAfterSec,
        });
        return;
      }

      if (AUTH_BACKEND.kind === 'postgres') {
        const pool = getPool();
        const orgId = AUTH_BACKEND.organizationId!;
        const user = await findOwnerByEmail(pool, orgId, email);
        const passwordOk =
          !!user &&
          verifySecret(password, user.passwordSalt, user.passwordHash);
        if (!user || !passwordOk) {
          recordRateLimitAttempt(ipKey, LOGIN_RATE_WINDOW_MS);
          recordRateLimitAttempt(accountKey, LOGIN_RATE_WINDOW_MS);
          res.status(401).json({ error: 'Invalid email or password.' });
          return;
        }
        clearRateLimitKey(accountKey);
        const created = await createPgSession(pool, user.id, user.email);
        setSessionCookie(res, created.rawToken, req);
        res.json({
          ok: true,
          email: user.email,
          expiresInMs: SESSION_TTL_MS,
        });
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
        recordRateLimitAttempt(ipKey, LOGIN_RATE_WINDOW_MS);
        recordRateLimitAttempt(accountKey, LOGIN_RATE_WINDOW_MS);
        // Generic error — no account enumeration
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }

      // Successful login clears account failures so a typo burst cannot soft-lock the admin.
      clearRateLimitKey(accountKey);

      const token = createSession(email);
      setSessionCookie(res, token, req);
      // Session is HttpOnly cookie only — do not return raw token in JSON (XSS-resistant).
      res.json({
        ok: true,
        email,
        expiresInMs: SESSION_TTL_MS,
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Step 1: request a single-use reset token.
   * Always returns the same message (no email enumeration).
   * Token is never returned in the HTTP response (local file only).
   */
  app.post('/api/auth/forgot-password', async (req, res, next) => {
    try {
      if (!allowRateLimit(clientKey(req, 'forgot'), 5, 15 * 60 * 1000)) {
        res.status(429).json({
          error: 'Too many reset requests. Please try again later.',
        });
        return;
      }

      const email = String(req.body?.email || '')
        .trim()
        .toLowerCase();

      if (AUTH_BACKEND.kind === 'postgres') {
        if (email.length > 0) {
          const pool = getPool();
          const user = await findOwnerByEmail(
            pool,
            AUTH_BACKEND.organizationId!,
            email
          );
          if (user) {
            const rawToken = crypto.randomBytes(32).toString('base64url');
            const created = await createPasswordResetChallenge(
              pool,
              user.id,
              rawToken
            );
            writePostgresResetTokenFile(user.email, rawToken, created.expiresAt);
            // Intentionally do not log the token.
          }
        }
        res.json({
          ok: true,
          message: GENERIC_FORGOT_MESSAGE,
        });
        return;
      }

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
    } catch (err) {
      next(err);
    }
  });

  /**
   * Step 2: reset password using email + single-use token.
   * Email alone is never sufficient.
   */
  app.post('/api/auth/reset-password', async (req, res, next) => {
    try {
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

      if (AUTH_BACKEND.kind === 'postgres') {
        const pool = getPool();
        const user = await findOwnerByEmail(
          pool,
          AUTH_BACKEND.organizationId!,
          email
        );
        if (!user) {
          res.status(401).json({ error: GENERIC_RESET_ERROR });
          return;
        }
        try {
          await consumePasswordResetChallenge(pool, {
            userId: user.id,
            rawToken: token,
            newPassword,
          });
        } catch (err) {
          if (err instanceof PasswordResetStoreError) {
            res.status(401).json({ error: GENERIC_RESET_ERROR });
            return;
          }
          throw err;
        }
        clearPostgresResetTokenFile(user.email);
        clearSessionCookie(res, req);
        res.json({
          ok: true,
          message: 'Password updated. Please sign in with your new password.',
        });
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
      const hasReset = !!(
        reset?.tokenSalt &&
        reset?.tokenHash &&
        reset?.expiresAt
      );
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
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/auth/logout', async (req, res, next) => {
    try {
      const token = readSessionToken(req);
      if (AUTH_BACKEND.kind === 'postgres') {
        await revokePgSessionByRawToken(getPool(), token);
      } else {
        destroySession(token);
      }
      clearSessionCookie(res, req);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/auth/me', async (req, res, next) => {
    try {
      const session = await resolveSession(req);
      if (!session) {
        res.status(401).json({ authenticated: false });
        return;
      }
      res.json({ authenticated: true, email: session.email });
    } catch (err) {
      next(err);
    }
  });

  // Protect all ledger / mutation APIs (auth routes + health stay public)
  app.use('/api', (req, res, next) => {
    if (req.path === '/health' || req.path.startsWith('/auth/')) {
      next();
      return;
    }
    void requireAuth(req, res, next);
  });

  app.get('/api/ledger', async (_req, res, next) => {
  try {
    res.json(sanitizeLedgerForClient(await loadBusinessLedger()));
  } catch (err) { next(err); }
  });

  /** List backup artifacts under DATA_DIR/backups (names only). */
  app.get('/api/backups', async (_req, res, next) => {
  try {
    if (BUSINESS_DATA_BACKEND.kind === 'postgres') {
      res.status(409).json({
        error:
          'JSON ledger backups are unavailable while BUSINESS_DATA_BACKEND=postgres. Use database backups for PostgreSQL business data.',
        businessDataBackend: 'postgres',
      });
      return;
    }
    const backupDir = path.join(DATA_DIR, 'backups');
    if (!fs.existsSync(backupDir)) {
      res.json({ backups: [] });
      return;
    }
    const backups = fs
      .readdirSync(backupDir)
      .filter((f) => isBackupArtifactName(f))
      .filter((f) => isRegularBackupFile(path.join(backupDir, f)))
      .map((f) => {
        const p = path.join(backupDir, f);
        // lstat: never follow symlinks/junctions when listing
        const st = fs.lstatSync(p);
        return {
          file: f,
          encrypted: f.endsWith(BACKUP_FILE_SUFFIX),
          size: st.size,
          mtimeMs: st.mtimeMs,
        };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    res.json({ backups });
  } catch (err) { next(err); }
  });

  /**
   * Verify + restore an encrypted backup into the current DATA_DIR ledger.
   * Creates an encrypted pre-restore backup first. Never restores into live ./data
   * when E2E_ISOLATION=1.
   */
  app.post('/api/backups/restore', async (req, res, next) => {
  try {
    if (BUSINESS_DATA_BACKEND.kind === 'postgres') {
      res.status(409).json({
        error:
          'JSON ledger restore is disabled while BUSINESS_DATA_BACKEND=postgres. Refusing to overwrite PostgreSQL business data from a JSON backup.',
        businessDataBackend: 'postgres',
      });
      return;
    }
    const file = String(req.body?.file || '').trim();
    const confirm = req.body?.confirm === true;
    if (!file || !confirm) {
      res.status(400).json({
        error: 'Provide { file, confirm: true } to restore an encrypted backup.',
      });
      return;
    }
    try {
      const result = restoreEncryptedLedgerBackup({
        backupFileName: file,
        targetLedgerPath: DATA_FILE,
      });
      const saved = sanitizeLedgerForClient(await loadBusinessLedger());
      res.json({
        ok: true,
        preRestoreBackup: result.preRestoreBackup,
        clients: result.clients,
        ledger: saved,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Restore failed.';
      res.status(400).json({ error: message });
    }
  } catch (err) { next(err); }
  });

  /** Report historical PAN format issues without modifying records. */
  app.get('/api/clients/pan-validation-report', async (_req, res, next) => {
  try {
    const state = await loadBusinessLedger();
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
  } catch (err) { next(err); }
  });

  /** Session-authenticated single-record reveal (not included in ordinary ledger payloads). */
  app.post('/api/clients/:id/reveal-portal-password', async (req, res, next) => {
  try {
    try {
      const state = await loadBusinessLedger();
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
  } catch (err) { next(err); }
  });

  app.post('/api/gst/clients/:id/reveal-portal-password', async (req, res, next) => {
  try {
    try {
      const state = await loadBusinessLedger();
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
  } catch (err) { next(err); }
  });

  // ---------- IT Routes ----------

  app.post('/api/years', async (req, res, next) => {
  try {
    const year = String(req.body?.year || '').trim();
    if (!year) {
      res.status(400).json({ error: 'Year is required.' });
      return;
    }
    const saved = await mutateBusinessLedger((state) => {
      state.assessmentYears = sortYears([...state.assessmentYears, year]);
      return state;
    });
    res.json(saved);
  } catch (err) { next(err); }
  });

  app.post('/api/clients', async (req, res, next) => {
  try {
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

    let createdClient: ClientRecord | null = null;
    const saved = await mutateBusinessLedger((state) => {
      const dup = state.clients.find(
        (c) => c.pan.toUpperCase() === panRes.pan
      );
      if (dup) {
        throw new BusinessRouteError(
          409,
          `A client with PAN ${panRes.pan} already exists.`
        );
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
      createdClient = newClient;
      return state;
    });
    res.status(201).json({
      client: stripPublicSecrets(createdClient!),
      ledger: saved,
    });
  } catch (err) { next(err); }
  });

  app.put('/api/clients/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    let updatedClient: ClientRecord | null = null;
    const saved = await mutateBusinessLedger((state) => {
      const index = state.clients.findIndex((c) => c.id === id);
      if (index === -1) {
        throw new BusinessRouteError(404, 'Client not found.');
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
        throw new BusinessRouteError(400, nameRes.error);
      }
      if (!panRes.ok) {
        throw new BusinessRouteError(400, panRes.error);
      }
      if (
        passwordProvided &&
        !passwordRaw &&
        !recordHasPortalPassword(existing)
      ) {
        throw new BusinessRouteError(400, 'Name, PAN, and Password are mandatory.');
      }
      if (!passwordProvided && !recordHasPortalPassword(existing)) {
        throw new BusinessRouteError(400, 'Name, PAN, and Password are mandatory.');
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
        throw new BusinessRouteError(400, phoneRes.error);
      }
      if (!refRes.ok) {
        throw new BusinessRouteError(400, refRes.error);
      }
      if (!remarkRes.ok) {
        throw new BusinessRouteError(400, remarkRes.error);
      }

      const dup = state.clients.find(
        (c) => c.id !== id && c.pan.toUpperCase() === panRes.pan
      );
      if (dup) {
        throw new BusinessRouteError(
          409,
          `A client with PAN ${panRes.pan} already exists.`
        );
      }

      let passwordFields: { passwordEnc?: string };
      try {
        passwordFields = persistPasswordFields(passwordRaw, existing, {
          required: !recordHasPortalPassword(existing),
        });
      } catch (err) {
        throw new BusinessRouteError(
          503,
          err instanceof Error ? err.message : 'Unable to store portal password.'
        );
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
      updatedClient = updated;
      return state;
    });
    res.json({ client: stripPublicSecrets(updatedClient!), ledger: saved });
  } catch (err) { next(err); }
  });

  app.delete('/api/clients/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const saved = await mutateBusinessLedger((state) => {
      const nextClients = state.clients.filter((c) => c.id !== id);
      if (nextClients.length === state.clients.length) {
        throw new BusinessRouteError(404, 'Client not found.');
      }
      state.clients = nextClients;
        return state;
    });
    res.json({ ledger: saved });
  } catch (err) { next(err); }
  });

  app.post('/api/clients/:id/filings', async (req, res, next) => {
  try {
    const { id } = req.params;
    const year = String(req.body?.assessmentYear || '').trim();
    if (!year) {
      res.status(400).json({ error: 'Assessment Year is required.' });
      return;
    }

    let filingClient: ClientRecord | null = null;
    const saved = await mutateBusinessLedger((state) => {
      const index = state.clients.findIndex((c) => c.id === id);
      if (index === -1) {
        throw new BusinessRouteError(404, 'Client not found.');
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
      filingClient = state.clients[index];
      return state;
    });
    res.json({
      client: stripPublicSecrets(filingClient!),
      ledger: saved,
    });
  } catch (err) { next(err); }
  });

  app.delete('/api/clients/:id/filings/:year', async (req, res, next) => {
  try {
    const { id, year } = req.params;
    const decodedYear = decodeURIComponent(year);
    let filingClient: ClientRecord | null = null;
    const saved = await mutateBusinessLedger((state) => {
      const index = state.clients.findIndex((c) => c.id === id);
      if (index === -1) {
        throw new BusinessRouteError(404, 'Client not found.');
      }

      const nextFilings = { ...state.clients[index].filings };
      delete nextFilings[decodedYear];
      state.clients[index] = {
        ...state.clients[index],
        filings: nextFilings,
        updatedAt: new Date().toISOString(),
      };
      filingClient = state.clients[index];
      return state;
    });
    res.json({
      client: stripPublicSecrets(filingClient!),
      ledger: saved,
    });
  } catch (err) { next(err); }
  });

  async function resolveImportOwner(req: express.Request): Promise<{
    ownerKey: string;
    orgKey: string;
  } | null> {
    const session = await resolveSession(req);
    if (!session) return null;
    const ownerKey = session.userId || session.email;
    const orgKey =
      BUSINESS_DATA_BACKEND.organizationId ||
      `json:${DATA_DIR}`;
    return { ownerKey, orgKey };
  }

  /** Phase 6 — multi-step Excel import session (IT / GST). */
  app.post('/api/import/session', async (req, res, next) => {
    try {
      const owner = await resolveImportOwner(req);
      if (!owner) {
        res.status(401).json({ error: 'Unauthorized. Please log in.' });
        return;
      }
      const domain: ImportDomain =
        req.body?.domain === 'gst' ? 'gst' : 'it';
      const filename = String(req.body?.filename || '').trim();
      const contentBase64 = String(req.body?.contentBase64 || '');
      if (!filename || !/\.xlsx$/i.test(filename)) {
        res.status(400).json({
          error: 'Only .xlsx workbooks are supported. .xls files are rejected.',
        });
        return;
      }
      if (!contentBase64) {
        res.status(400).json({ error: 'contentBase64 is required.' });
        return;
      }
      let buffer: Buffer;
      try {
        buffer = Buffer.from(contentBase64, 'base64');
      } catch {
        res.status(400).json({ error: 'Invalid base64 content.' });
        return;
      }
      if (!buffer.length || buffer.length > MAX_IMPORT_FILE_BYTES) {
        res.status(400).json({
          error: `File must be between 1 byte and ${MAX_IMPORT_FILE_BYTES} bytes.`,
        });
        return;
      }

      let inspection;
      try {
        const loaded = await inspectWorkbookBuffer(buffer, domain);
        inspection = loaded.inspection;
      } catch (err) {
        res.status(400).json({
          error: err instanceof Error ? err.message : 'Invalid workbook.',
        });
        return;
      }

      const session = createImportSession({
        ownerKey: owner.ownerKey,
        orgKey: owner.orgKey,
        domain,
        filename: path.basename(filename),
        buffer,
      });

      const suggestedSheet = inspection.suggestedSheetName;
      const suggestedSheetMeta = inspection.sheets.find(
        (s) => s.name === suggestedSheet
      );
      const suggestion = suggestedSheetMeta
        ? suggestColumnMapping(domain, suggestedSheetMeta.headings)
        : null;

      res.json({
        sessionId: session.id,
        domain,
        filename: session.filename,
        sha256: session.sha256,
        expiresAt: new Date(session.expiresAt).toISOString(),
        sheets: inspection.sheets.map((s) => ({
          name: s.name,
          role: s.role,
          headerRow: s.headerRow,
          headings: s.headings,
          dataRowCount: s.dataRowCount,
        })),
        suggestedSheetName: suggestedSheet,
        suggestedMapping: suggestion?.mapping ?? null,
        unmappedHeadings: suggestion?.unmappedHeadings ?? [],
        missingRequired: suggestion?.missingRequired ?? [],
        targetFields: fieldsForDomain(domain).map((f) => ({
          key: f.key,
          label: f.label,
          required: f.required,
          sensitive: Boolean(f.sensitive),
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/import/session/:id/validate', async (req, res, next) => {
    try {
      const owner = await resolveImportOwner(req);
      if (!owner) {
        res.status(401).json({ error: 'Unauthorized. Please log in.' });
        return;
      }
      const session = getImportSession(req.params.id, owner.ownerKey);
      if (!session) {
        res.status(404).json({ error: 'Import session not found or expired.' });
        return;
      }
      if (session.committed) {
        res.status(409).json({ error: 'Import session already committed.' });
        return;
      }

      const sheetName = String(req.body?.sheetName || '').trim();
      const mapping = (req.body?.mapping || {}) as ColumnMapping;
      const policies: ImportPolicies = {
        mode: req.body?.mode === 'replace' ? 'replace' : 'merge',
        onConflict: req.body?.onConflict === 'skip' ? 'skip' : 'update',
      };
      if (!sheetName) {
        res.status(400).json({ error: 'sheetName is required.' });
        return;
      }

      const buffer = readSessionBuffer(session);
      const { workbook, inspection } = await inspectWorkbookBuffer(
        buffer,
        session.domain
      );
      const sheetMeta = inspection.sheets.find(
        (s) => s.name.trim().toLowerCase() === sheetName.trim().toLowerCase()
      );
      if (!sheetMeta) {
        res.status(400).json({ error: 'Selected worksheet not found.' });
        return;
      }
      const mapCheck = validateMapping(
        session.domain,
        mapping,
        sheetMeta.headings
      );
      if (!mapCheck.ok) {
        res.status(400).json({ error: mapCheck.errors.join(' ') });
        return;
      }

      const ledger = await loadBusinessLedger();
      const fp = mappingFingerprint(mapping);

      if (session.domain === 'it') {
        const parsed = parseItSheetWithMapping(workbook, sheetName, mapping);
        const validated = validateItImport(
          parsed,
          ledger,
          policies,
          sheetMeta.headings,
          mapping
        );
        updateImportSession(session.id, {
          sheetName,
          mapping,
          mappingFingerprint: fp,
          policies,
          validatedIt: validated,
          validatedGst: undefined,
          passwordsByUserId: undefined,
        });
        res.json({
          domain: 'it',
          canCommit: canCommit('it', validated),
          mappingFingerprint: fp,
          policies,
          preview: anonymizeItPreview(validated),
          issues: publicIssues(validated.issues),
          parseStats: {
            rowsRead: parsed.rowsRead,
            rowsSkipped: parsed.rowsSkipped,
            duplicateFilingRows: parsed.duplicateFilingRows,
          },
          policyNotes: [
            'Merge keeps clients not in the file; Replace removes IT clients absent from the file (GST untouched).',
            'On conflict: update overwrites filings; skip leaves existing filings unchanged.',
            'Outstanding balances are recalculated as fees − received on commit.',
            'Unknown Excel columns are listed and not silently discarded.',
          ],
        });
        return;
      }

      const parsed = parseGstSheetWithMapping(workbook, sheetName, mapping);
      const validated = validateGstImport(
        parsed,
        ledger,
        policies,
        sheetMeta.headings,
        mapping
      );
      updateImportSession(session.id, {
        sheetName,
        mapping,
        mappingFingerprint: fp,
        policies,
        validatedGst: validated,
        validatedIt: undefined,
        passwordsByUserId: validated.passwordsByUserId,
      });
      res.json({
        domain: 'gst',
        canCommit: canCommit('gst', validated),
        mappingFingerprint: fp,
        policies,
        preview: anonymizeGstPreview(validated),
        issues: publicIssues(validated.issues),
        parseStats: {
          rowsRead: parsed.rowsRead,
          rowsSkipped: parsed.rowsSkipped,
          duplicateFilingRows: parsed.duplicateFilingRows,
        },
        policyNotes: [
          'Merge keeps companies not in the file; Replace removes GST companies absent from the file (IT untouched).',
          'On conflict: update overwrites filings; skip leaves existing filings unchanged.',
          'GST filing totals are recalculated as fees + interest + tax on commit.',
          'Portal passwords are never shown in preview and are encrypted at rest on commit.',
          'Unknown Excel columns are listed and not silently discarded.',
        ],
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/import/session/:id/commit', async (req, res, next) => {
    try {
      const owner = await resolveImportOwner(req);
      if (!owner) {
        res.status(401).json({ error: 'Unauthorized. Please log in.' });
        return;
      }
      const session = getImportSession(req.params.id, owner.ownerKey);
      if (!session) {
        res.status(404).json({ error: 'Import session not found or expired.' });
        return;
      }
      if (req.body?.confirm !== true) {
        res.status(400).json({ error: 'Explicit confirm: true is required.' });
        return;
      }
      const fp = String(req.body?.mappingFingerprint || '');
      if (!session.mappingFingerprint || fp !== session.mappingFingerprint) {
        res.status(409).json({
          error:
            'Mapping fingerprint mismatch. Re-validate before committing.',
        });
        return;
      }
      if (!session.policies) {
        res.status(400).json({ error: 'Validate the import before committing.' });
        return;
      }

      const orgKey = owner.orgKey;
      const result = await withOrgImportLock(orgKey, async () => {
        let backupFile = '';
        let report = {
          clientsCreated: 0,
          clientsUpdated: 0,
          filingsAdded: 0,
          filingsUpdated: 0,
          filingsSkipped: 0,
        };

        if (session.domain === 'it') {
          const payload = session.validatedIt;
          if (!payload || !canCommit('it', payload)) {
            throw new BusinessRouteError(
              400,
              'No valid IT records to import. Re-validate first.'
            );
          }
          const saved = await mutateBusinessLedger((state) => {
            backupFile = maybeBackupLedgerFile('pre-excel-import-it');
            report = applyItImportToLedger(state, payload.clients, session.policies!, {
              newId: () => `cli-${crypto.randomUUID().slice(0, 8)}`,
            });
            return state;
          });
          return { saved, report, backupFile };
        }

        const payload = session.validatedGst;
        if (!payload || !canCommit('gst', payload)) {
          throw new BusinessRouteError(
            400,
            'No valid GST records to import. Re-validate first.'
          );
        }
        const passwords = session.passwordsByUserId || {};
        const saved = await mutateBusinessLedger((state) => {
          backupFile = maybeBackupLedgerFile('pre-excel-import-gst');
          const incoming = payload.companies.map((c) => {
            let passwordEnc: string | undefined;
            const plain = passwords[c.userId];
            if (plain) {
              const fields = persistPasswordFields(plain, {}, { required: false });
              passwordEnc = fields.passwordEnc;
            }
            return {
              userId: c.userId,
              companyName: c.companyName,
              phone: c.phone,
              referenceNumber: c.referenceNumber,
              remark: c.remark,
              totalReceived: c.totalReceived,
              filings: c.filings,
              passwordEnc,
            };
          });
          report = applyGstImportToLedger(state, incoming, session.policies!, {
            newId: () => `gst-${crypto.randomUUID().slice(0, 8)}`,
          });
          return state;
        });
        return { saved, report, backupFile };
      });

      markSessionCommitted(session.id);
      res.json({
        ledger: result.saved,
        report: {
          ...result.report,
          backupFile: result.backupFile,
          domain: session.domain,
          note:
            session.domain === 'it'
              ? 'IT import committed. Outstanding balances stored as fees − received.'
              : 'GST import committed. Portal passwords encrypted when provided.',
        },
      });
    } catch (err) {
      if (err instanceof BusinessRouteError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      next(err);
    }
  });

  app.delete('/api/import/session/:id', async (req, res, next) => {
    try {
      const owner = await resolveImportOwner(req);
      if (!owner) {
        res.status(401).json({ error: 'Unauthorized. Please log in.' });
        return;
      }
      const ok = deleteImportSession(req.params.id, owner.ownerKey);
      res.json({ deleted: ok });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/import/it', async (req, res, next) => {
  try {
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

      let backupFile = '';
      let clientsCreated = 0;
      let clientsUpdated = 0;
      let filingsAdded = 0;
      let filingsUpdated = 0;
      let filingsSkipped = 0;

      const saved = await mutateBusinessLedger((state) => {
        backupFile = maybeBackupLedgerFile();
        const report = applyItImportToLedger(
          state,
          incoming.map((c) => ({
            pan: c.pan,
            name: c.name,
            phone: c.phone,
            otherMobiles: c.otherMobiles,
            nameVariants: c.nameVariants,
            filings: Object.fromEntries(
              Object.entries(c.filings).map(([ay, f]) => [
                ay,
                {
                  assessmentYear: ay,
                  filingDate: f.filingDate,
                  fees: f.fees,
                  received: f.received,
                  outstanding: null,
                  paymentType: f.paymentType,
                  paymentReceiveDate: f.paymentReceiveDate,
                  sourceRow: 0,
                },
              ])
            ),
          })),
          { mode, onConflict },
          { newId: () => `cli-${crypto.randomUUID().slice(0, 8)}` }
        );
        clientsCreated = report.clientsCreated;
        clientsUpdated = report.clientsUpdated;
        filingsAdded = report.filingsAdded;
        filingsUpdated = report.filingsUpdated;
        filingsSkipped = report.filingsSkipped;
        return state;
      });
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
  } catch (err) { next(err); }
  });

  app.post('/api/import/gst', async (req, res, next) => {
  try {
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

      let backupFile = '';
      let clientsCreated = 0;
      let clientsUpdated = 0;
      let filingsAdded = 0;
      let filingsUpdated = 0;
      let filingsSkipped = 0;

      const saved = await mutateBusinessLedger((state) => {
        backupFile = maybeBackupLedgerFile();
        const prepared = incoming.map((inc) => {
          let passwordEnc: string | undefined;
          if (inc.password && !isUnsetPortalPassword(inc.password)) {
            passwordEnc = persistPasswordFields(inc.password, {}, {
              required: false,
            }).passwordEnc;
          }
          return {
            userId: inc.userId,
            companyName: inc.companyName,
            phone: inc.phone,
            referenceNumber: inc.referenceNumber,
            remark: inc.remark,
            totalReceived: inc.totalReceived,
            filings: inc.filings,
            passwordEnc,
          };
        });
        const report = applyGstImportToLedger(
          state,
          prepared,
          { mode, onConflict },
          { newId: () => `gst-${crypto.randomUUID().slice(0, 8)}` }
        );
        clientsCreated = report.clientsCreated;
        clientsUpdated = report.clientsUpdated;
        filingsAdded = report.filingsAdded;
        filingsUpdated = report.filingsUpdated;
        filingsSkipped = report.filingsSkipped;
        return state;
      });
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
  } catch (err) { next(err); }
  });

  // ---------- GST Routes ----------

  app.post('/api/gst/months', async (req, res, next) => {
  try {
    const month = String(req.body?.month || '').trim();
    if (!month) {
      res.status(400).json({ error: 'Month is required.' });
      return;
    }
    const saved = await mutateBusinessLedger((state) => {
      state.gstMonths = sortMonths([...state.gstMonths, month]);
        return state;
    });
    res.json(saved);
  } catch (err) { next(err); }
  });

  app.post('/api/gst/clients', async (req, res, next) => {
  try {
    const companyRes = validateRequiredText(
      req.body?.companyName,
      'Company Name',
      'companyName'
    );
    const userRes = validateRequiredText(req.body?.userId, 'User ID', 'userId');
    const password = String(req.body?.password || '').trim();
    const phoneRes = validateRequiredPhone(req.body?.phone);
    const refRes = validateRequiredText(
      req.body?.referenceNumber,
      'Ref No',
      'referenceNumber'
    );
    const remarkRes = validateRequiredText(req.body?.remark, 'Remark', 'remark');

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

    const filingsIn =
      req.body?.filings && typeof req.body.filings === 'object'
        ? (req.body.filings as Record<string, Partial<GstMonthlyFiling>>)
        : {};
    const filingKeys = Object.keys(filingsIn).filter((m) => m.trim());
    if (filingKeys.length === 0) {
      res.status(400).json({ error: 'Monthly Filing is required.' });
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

    let createdGst: GstClientRecord | null = null;
    const saved = await mutateBusinessLedger((state) => {
      const now = new Date().toISOString();

      const filings: Record<string, GstMonthlyFiling> = {};
      for (const [m, f] of Object.entries(filingsIn)) {
        if (m.trim()) {
          filings[m.trim()] = sanitizeGstFiling(m.trim(), f);
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
        // Company Total Recd is derived from payments; ignore manual body value for new companies.
        totalReceived: 0,
        filings,
        createdAt: now,
        updatedAt: now,
      };
      syncGstCompanyTotalReceived(newClient);

      state.gstClients.push(newClient);
      createdGst = newClient;
      return state;
    });
    res.status(201).json({
      client: stripPublicSecrets(createdGst!),
      ledger: saved,
    });
  } catch (err) { next(err); }
  });

  app.put('/api/gst/clients/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    let updatedGst: GstClientRecord | null = null;
    const saved = await mutateBusinessLedger((state) => {
      const index = state.gstClients.findIndex((c) => c.id === id);
      if (index === -1) {
        throw new BusinessRouteError(404, 'GST company not found.');
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
        throw new BusinessRouteError(400, companyRes.error);
      }
      if (!userRes.ok) {
        throw new BusinessRouteError(400, userRes.error);
      }
      if (
        (passwordProvided && !passwordRaw && !recordHasPortalPassword(existing)) ||
        (!passwordProvided && !recordHasPortalPassword(existing))
      ) {
        throw new BusinessRouteError(400, 'Company Name, User ID, and Password are mandatory.');
      }

      const phoneRes = validateRequiredPhone(
        req.body?.phone !== undefined ? req.body.phone : existing.phone
      );
      const refRes = validateRequiredText(
        req.body?.referenceNumber !== undefined
          ? req.body.referenceNumber
          : existing.referenceNumber,
        'Ref No',
        'referenceNumber'
      );
      const remarkRes = validateRequiredText(
        req.body?.remark !== undefined ? req.body.remark : existing.remark || '',
        'Remark',
        'remark'
      );
      if (!phoneRes.ok) {
        throw new BusinessRouteError(400, phoneRes.error);
      }
      if (!refRes.ok) {
        throw new BusinessRouteError(400, refRes.error);
      }
      if (!remarkRes.ok) {
        throw new BusinessRouteError(400, remarkRes.error);
      }

      let passwordFields: { passwordEnc?: string };
      try {
        passwordFields = persistPasswordFields(passwordRaw, existing, {
          required: !recordHasPortalPassword(existing),
        });
      } catch (err) {
        throw new BusinessRouteError(
          503,
          err instanceof Error ? err.message : 'Unable to store portal password.'
        );
      }

      const hasPaymentLines = Object.values(existing.filings || {}).some(
        (f) => Array.isArray(f.payments) && f.payments.length > 0
      );

      const updated: GstClientRecord = {
        ...existing,
        companyName: companyRes.value,
        userId: userRes.value,
        passwordEnc: passwordFields.passwordEnc,
        phone: phoneRes.value,
        referenceNumber: refRes.value,
        remark: remarkRes.value,
        // Manual Total Recd is only kept for legacy companies with no payment lines.
        totalReceived: hasPaymentLines
          ? sumGstClientPaymentLines(existing)
          : req.body?.totalReceived !== undefined
            ? Math.max(0, Number(req.body.totalReceived) || 0)
            : Math.max(0, Number(existing.totalReceived) || 0),
        updatedAt: new Date().toISOString(),
      };
      delete updated.password;
      syncGstCompanyTotalReceived(updated);

      state.gstClients[index] = updated;
      updatedGst = updated;
      return state;
    });
    res.json({ client: stripPublicSecrets(updatedGst!), ledger: saved });
  } catch (err) { next(err); }
  });

  app.delete('/api/gst/clients/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const saved = await mutateBusinessLedger((state) => {
      const nextClients = state.gstClients.filter((c) => c.id !== id);
      if (nextClients.length === state.gstClients.length) {
        throw new BusinessRouteError(404, 'GST company not found.');
      }
      state.gstClients = nextClients;
        return state;
    });
    res.json({ ledger: saved });
  } catch (err) { next(err); }
  });

  app.post('/api/gst/clients/:id/filings', async (req, res, next) => {
  try {
    const { id } = req.params;
    const month = String(req.body?.month || '').trim();
    if (!month) {
      res.status(400).json({ error: 'Month is required.' });
      return;
    }

    let filingGst: GstClientRecord | null = null;
    const saved = await mutateBusinessLedger((state) => {
      const index = state.gstClients.findIndex((c) => c.id === id);
      if (index === -1) {
        throw new BusinessRouteError(404, 'GST company not found.');
      }

      const existingFiling = state.gstClients[index].filings?.[month];
      const filing = sanitizeGstFiling(month, req.body, existingFiling);
      const nextClient: GstClientRecord = {
        ...state.gstClients[index],
        filings: {
          ...state.gstClients[index].filings,
          [month]: filing,
        },
        updatedAt: new Date().toISOString(),
      };
      syncGstCompanyTotalReceived(nextClient);
      state.gstClients[index] = nextClient;
      filingGst = nextClient;
      return state;
    });
    res.json({
      client: stripPublicSecrets(filingGst!),
      ledger: saved,
    });
  } catch (err) { next(err); }
  });

  app.delete('/api/gst/clients/:id/filings/:month', async (req, res, next) => {
  try {
    const { id, month } = req.params;
    const decodedMonth = decodeURIComponent(month);
    let filingGst: GstClientRecord | null = null;
    const saved = await mutateBusinessLedger((state) => {
      const index = state.gstClients.findIndex((c) => c.id === id);
      if (index === -1) {
        throw new BusinessRouteError(404, 'GST company not found.');
      }

      const nextFilings = { ...state.gstClients[index].filings };
      delete nextFilings[decodedMonth];
      const nextClient: GstClientRecord = {
        ...state.gstClients[index],
        filings: nextFilings,
        updatedAt: new Date().toISOString(),
      };
      syncGstCompanyTotalReceived(nextClient);
      state.gstClients[index] = nextClient;
      filingGst = nextClient;
      return state;
    });
    res.json({
      client: stripPublicSecrets(filingGst!),
      ledger: saved,
    });
  } catch (err) { next(err); }
  });

  app.post('/api/gst/clients/:id/filings/:month/payments', async (req, res, next) => {
  try {
    const { id, month } = req.params;
    const decodedMonth = decodeURIComponent(month);
    const idempotencyKey = String(
      req.body?.idempotencyKey ||
        req.get('Idempotency-Key') ||
        ''
    ).trim().slice(0, 80);

    let filingGst: GstClientRecord | null = null;
    let createdNew = true;
    const saved = await mutateBusinessLedger((state) => {
      const index = state.gstClients.findIndex((c) => c.id === id);
      if (index === -1) {
        throw new BusinessRouteError(404, 'GST company not found.');
      }
      const company = state.gstClients[index];
      const existingFiling = company.filings?.[decodedMonth];
      if (!existingFiling) {
        throw new BusinessRouteError(404, 'GST monthly filing not found.');
      }

      const existingPayments = [...(existingFiling.payments || [])];
      if (idempotencyKey) {
        const prior = existingPayments.find((p) => p.idempotencyKey === idempotencyKey);
        if (prior) {
          createdNew = false;
          filingGst = company;
          return state;
        }
      }

      const payment = sanitizeGstPaymentEntry({
        ...(req.body || {}),
        ...(idempotencyKey ? { idempotencyKey } : {}),
      });
      const outstanding = computeGstFilingOutstanding(existingFiling);
      // Existing business rules floor outstanding at 0 — no advance payments.
      if (payment.amount - outstanding > 0.009) {
        throw new BusinessRouteError(
          400,
          `Payment amount exceeds remaining outstanding (₹${outstanding}).`
        );
      }

      const unallocatedReceived = preserveLegacyReceiptsOnPaymentTransition(company);
      const filing = withGstFilingReceived({
        ...existingFiling,
        payments: [...existingPayments, payment],
      });
      const nextClient: GstClientRecord = {
        ...company,
        unallocatedReceived,
        filings: { ...company.filings, [decodedMonth]: filing },
        updatedAt: new Date().toISOString(),
      };
      syncGstCompanyTotalReceived(nextClient);
      state.gstClients[index] = nextClient;
      filingGst = nextClient;
      return state;
    });
    res.status(createdNew ? 201 : 200).json({
      client: stripPublicSecrets(filingGst!),
      ledger: saved,
      idempotentReplay: !createdNew,
    });
  } catch (err) { next(err); }
  });

  app.put(
    '/api/gst/clients/:id/filings/:month/payments/:paymentId',
    async (req, res, next) => {
  try {
    const { id, month, paymentId } = req.params;
    const decodedMonth = decodeURIComponent(month);
    let filingGst: GstClientRecord | null = null;
    const saved = await mutateBusinessLedger((state) => {
      const index = state.gstClients.findIndex((c) => c.id === id);
      if (index === -1) {
        throw new BusinessRouteError(404, 'GST company not found.');
      }
      const company = state.gstClients[index];
      const existingFiling = company.filings?.[decodedMonth];
      if (!existingFiling) {
        throw new BusinessRouteError(404, 'GST monthly filing not found.');
      }
      const payments = [...(existingFiling.payments || [])];
      const payIndex = payments.findIndex((p) => p.id === paymentId);
      if (payIndex === -1) {
        throw new BusinessRouteError(404, 'Payment not found.');
      }

      const updatedPayment = sanitizeGstPaymentEntry(req.body || {}, payments[payIndex]);
      const othersReceived = payments.reduce((sum, p, i) => {
        if (i === payIndex) return sum;
        return sum + Math.max(0, Number(p.amount) || 0);
      }, 0);
      const collectible = Math.max(0, Number(existingFiling.total) || 0);
      const remainingForThis = Math.max(0, collectible - othersReceived);
      if (updatedPayment.amount - remainingForThis > 0.009) {
        throw new BusinessRouteError(
          400,
          `Payment amount exceeds remaining outstanding (₹${remainingForThis}).`
        );
      }

      payments[payIndex] = updatedPayment;
      const filing = withGstFilingReceived({
        ...existingFiling,
        payments,
      });
      const nextClient: GstClientRecord = {
        ...company,
        filings: { ...company.filings, [decodedMonth]: filing },
        updatedAt: new Date().toISOString(),
      };
      syncGstCompanyTotalReceived(nextClient);
      state.gstClients[index] = nextClient;
      filingGst = nextClient;
      return state;
    });
    res.json({
      client: stripPublicSecrets(filingGst!),
      ledger: saved,
    });
  } catch (err) { next(err); }
  });

  app.delete(
    '/api/gst/clients/:id/filings/:month/payments/:paymentId',
    async (req, res, next) => {
  try {
    const { id, month, paymentId } = req.params;
    const decodedMonth = decodeURIComponent(month);
    let filingGst: GstClientRecord | null = null;
    const saved = await mutateBusinessLedger((state) => {
      const index = state.gstClients.findIndex((c) => c.id === id);
      if (index === -1) {
        throw new BusinessRouteError(404, 'GST company not found.');
      }
      const company = state.gstClients[index];
      const existingFiling = company.filings?.[decodedMonth];
      if (!existingFiling) {
        throw new BusinessRouteError(404, 'GST monthly filing not found.');
      }
      const payments = [...(existingFiling.payments || [])];
      const nextPayments = payments.filter((p) => p.id !== paymentId);
      if (nextPayments.length === payments.length) {
        throw new BusinessRouteError(404, 'Payment not found.');
      }
      const filing = withGstFilingReceived({
        ...existingFiling,
        payments: nextPayments,
      });
      const nextClient: GstClientRecord = {
        ...company,
        filings: { ...company.filings, [decodedMonth]: filing },
        updatedAt: new Date().toISOString(),
      };
      syncGstCompanyTotalReceived(nextClient);
      state.gstClients[index] = nextClient;
      filingGst = nextClient;
      return state;
    });
    res.json({
      client: stripPublicSecrets(filingGst!),
      ledger: saved,
    });
  } catch (err) { next(err); }
  });

  // Deny HTTP access to on-disk storage trees before Vite / static / SPA fallback
  // (prevents accidental exposure of reset-token or ledger files under /data*).
  app.use(['/data', '/data-e2e'], (_req, res) => {
    res.status(404).type('text/plain').send('Not found');
  });

  // PG_AUTH_HTTP_TEST=1 → API-only (no Vite) for isolated postgres HTTP integration tests.
  if (process.env.PG_AUTH_HTTP_TEST === '1') {
    app.get('*', (_req, res) => {
      res.status(404).type('text/plain').send('Not found');
    });
  } else if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production: static SPA only — never fall back to Vite middleware.
    const distDir = path.resolve(__dirname, 'dist');
    const distIndex = path.join(distDir, 'index.html');
    if (!fs.existsSync(distIndex)) {
      console.error(
        '[startup] NODE_ENV=production but dist/index.html is missing. Run `npm run build` first.'
      );
      process.exit(1);
    }
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(distIndex);
    });
  }

  // JSON API error handler for async route failures (no HTML fallback).
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      if (res.headersSent) {
        return;
      }
      if (err instanceof BusinessRouteError) {
        res.status(err.status).json(err.payload);
        return;
      }
      if (err instanceof LedgerConflictError) {
        res.status(409).json({
          error: err.message,
          code: err.code,
        });
        return;
      }
      const message =
        err instanceof Error ? err.message : 'Internal server error.';
      console.error('[api]', message);
      res.status(500).json({ error: message });
    }
  );

  if (HOST === '0.0.0.0' || HOST === '::') {
    console.warn(
      `[security] HOST=${HOST} binds all interfaces. Use only behind a hardened reverse proxy for hosted deployment. Local UAT should use HOST=127.0.0.1.`
    );
  }

  app.listen(PORT, HOST, () => {
    const displayHost = HOST === '0.0.0.0' ? '127.0.0.1' : HOST;
    console.log(`TaxLedger server listening on ${HOST}:${PORT}`);
    console.log(`Local access: http://${displayHost}:${PORT}`);
    console.log(`[storage] DATA_DIR=${DATA_DIR}`);
    console.log(`[auth] backend=${AUTH_BACKEND.kind}`);
    console.log(`[business] backend=${BUSINESS_DATA_BACKEND.kind}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
