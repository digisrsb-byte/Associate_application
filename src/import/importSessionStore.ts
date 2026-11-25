/**
 * Server-only import session store (temp files + TTL).
 * Do not import from browser bundles.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import type { ImportDomain } from './fieldCatalog.ts';
import type { ColumnMapping } from './columnMapping.ts';
import type { ImportPolicies } from './validateImport.ts';
import type {
  ValidatedGstPayload,
  ValidatedItPayload,
} from './validateImport.ts';

const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 40;

export type ImportSession = {
  id: string;
  ownerKey: string;
  orgKey: string;
  domain: ImportDomain;
  filename: string;
  tempPath: string;
  sha256: string;
  createdAt: number;
  expiresAt: number;
  committed: boolean;
  sheetName?: string;
  mapping?: ColumnMapping;
  mappingFingerprint?: string;
  policies?: ImportPolicies;
  /** Stashed after validate for commit (includes passwords server-side only). */
  validatedIt?: ValidatedItPayload;
  validatedGst?: ValidatedGstPayload;
  passwordsByUserId?: Record<string, string>;
};

const sessions = new Map<string, ImportSession>();
const orgLocks = new Map<string, Promise<void>>();

function tempDir(): string {
  const dir = path.join(os.tmpdir(), 'associate-excel-import');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function purgeExpiredSessions(): void {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (s.expiresAt <= now || s.committed) {
      cleanupSessionFiles(s);
      sessions.delete(id);
    }
  }
  while (sessions.size > MAX_SESSIONS) {
    const oldest = [...sessions.entries()].sort(
      (a, b) => a[1].createdAt - b[1].createdAt
    )[0];
    if (!oldest) break;
    cleanupSessionFiles(oldest[1]);
    sessions.delete(oldest[0]);
  }
}

function cleanupSessionFiles(s: ImportSession): void {
  try {
    if (s.tempPath && fs.existsSync(s.tempPath)) fs.unlinkSync(s.tempPath);
  } catch {
    /* ignore */
  }
}

export function createImportSession(input: {
  ownerKey: string;
  orgKey: string;
  domain: ImportDomain;
  filename: string;
  buffer: Buffer;
}): ImportSession {
  purgeExpiredSessions();
  const id = crypto.randomBytes(16).toString('hex');
  const sha256 = crypto.createHash('sha256').update(input.buffer).digest('hex');
  const tempPath = path.join(tempDir(), `${id}.xlsx`);
  fs.writeFileSync(tempPath, input.buffer);
  const now = Date.now();
  const session: ImportSession = {
    id,
    ownerKey: input.ownerKey,
    orgKey: input.orgKey,
    domain: input.domain,
    filename: input.filename,
    tempPath,
    sha256,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    committed: false,
  };
  sessions.set(id, session);
  return session;
}

export function getImportSession(
  id: string,
  ownerKey: string
): ImportSession | null {
  purgeExpiredSessions();
  const s = sessions.get(id);
  if (!s) return null;
  if (s.ownerKey !== ownerKey) return null;
  if (s.expiresAt <= Date.now()) {
    cleanupSessionFiles(s);
    sessions.delete(id);
    return null;
  }
  return s;
}

export function readSessionBuffer(session: ImportSession): Buffer {
  return fs.readFileSync(session.tempPath);
}

export function updateImportSession(
  id: string,
  patch: Partial<ImportSession>
): ImportSession | null {
  const s = sessions.get(id);
  if (!s) return null;
  Object.assign(s, patch);
  return s;
}

export function deleteImportSession(id: string, ownerKey: string): boolean {
  const s = sessions.get(id);
  if (!s || s.ownerKey !== ownerKey) return false;
  cleanupSessionFiles(s);
  sessions.delete(id);
  return true;
}

export function markSessionCommitted(id: string): void {
  const s = sessions.get(id);
  if (!s) return;
  s.committed = true;
  cleanupSessionFiles(s);
  sessions.delete(id);
}

/** Serialize import commits per org key (JSON backend safety). */
export async function withOrgImportLock<T>(
  orgKey: string,
  fn: () => Promise<T>
): Promise<T> {
  const prev = orgLocks.get(orgKey) || Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  orgLocks.set(
    orgKey,
    prev.then(() => gate)
  );
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (orgLocks.get(orgKey) === gate) orgLocks.delete(orgKey);
  }
}
