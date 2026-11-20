/**
 * Phase 6A — Copy sensitive backups outside the git repo, encrypt, verify.
 * Does NOT delete originals. Does NOT print secret values.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const PARENT = path.resolve(REPO_ROOT, '..');
const STAMP = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const QUARANTINE_ROOT = path.join(PARENT, '_SECURE_BACKUPS_OUTSIDE_GIT');
const RAW_DIR = path.join(QUARANTINE_ROOT, `raw-${STAMP}`);
const ENC_DIR = path.join(QUARANTINE_ROOT, `encrypted-${STAMP}`);
const KEY_DIR = path.join(PARENT, '_SECURE_BACKUP_KEY');
const KEY_FILE = path.join(KEY_DIR, 'backup-archive.key');
const MANIFEST = path.join(QUARANTINE_ROOT, `manifest-${STAMP}.json`);

const PLACEHOLDERS = new Set(['', 'NOT SET', 'N/A', 'na', 'null', '-']);

const WT_SOURCES = [
  'data/backups/ledger-20261119-175659.json',
  'data/backups/ledger-20261120-103329.json',
  'data/backups/ledger-20261120-111418.json',
  'data/backups/ledger-20261120-125141.json',
  'data/backups/ledger-20261120-125229.json',
  'data/backups/ledger-20261120-125255.json',
  'data/backups/ledger-20261120-143655.json',
  'data/backups/ledger-20261120-150021-pre-portal-encrypt.json',
  'data/backups/ledger-20261120-153455.json',
  'data/backups/ledger-20261120-153603.json',
  'data/backups/auth-20261120-152201-pre-phase4.json',
  'data/ledger.pre-auto-test-backup.json',
];

const GIT_BLOB_ONLY = [
  'data/backups/ledger-20261119-175552.json',
  'data/backups/ledger-20261119-175639.json',
];

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}

function loadOrCreateKey() {
  ensureDir(KEY_DIR);
  if (fs.existsSync(KEY_FILE)) {
    const buf = Buffer.from(fs.readFileSync(KEY_FILE, 'utf8').trim(), 'base64');
    if (buf.length !== 32) throw new Error('backup-archive.key must be 32-byte base64');
    return buf;
  }
  const key = crypto.randomBytes(32);
  fs.writeFileSync(KEY_FILE, key.toString('base64') + '\n', { mode: 0o600 });
  return key;
}

function encryptFile(key, plaintext, destPath) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([
    Buffer.from('BK1'),
    iv,
    tag,
    enc,
  ]);
  fs.writeFileSync(destPath, payload);
}

function decryptFile(key, encPath) {
  const buf = fs.readFileSync(encPath);
  if (buf.subarray(0, 3).toString('utf8') !== 'BK1') throw new Error('bad magic');
  const iv = buf.subarray(3, 15);
  const tag = buf.subarray(15, 31);
  const data = buf.subarray(31);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

function analyzeJson(buf) {
  const j = JSON.parse(buf.toString('utf8'));
  if (j.passwordHash || j.passwordSalt) {
    return {
      kind: 'auth',
      byteLength: buf.length,
      hasPasswordHash: !!j.passwordHash,
      clientCount: null,
      gstCount: null,
      plaintextNonEmpty: null,
      encCount: null,
    };
  }
  const clients = [...(j.clients || []), ...(j.gstCompanies || []), ...(j.gstClients || [])];
  let plaintextNonEmpty = 0;
  let encCount = 0;
  for (const c of clients) {
    if (c.passwordEnc) encCount++;
    if (typeof c.password === 'string') {
      if (!PLACEHOLDERS.has(c.password.trim()) && !c.password.startsWith('enc:v1:')) {
        plaintextNonEmpty++;
      }
    }
  }
  return {
    kind: 'ledger',
    byteLength: buf.length,
    hasPasswordHash: false,
    clientCount: (j.clients || []).length,
    gstCount: (j.gstCompanies || j.gstClients || []).length,
    plaintextNonEmpty,
    encCount,
  };
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function copyFromWorkingTree(rel) {
  const src = path.join(REPO_ROOT, rel);
  if (!fs.existsSync(src)) return null;
  return { buf: fs.readFileSync(src), source: 'working-tree' };
}

function copyFromGit(rel) {
  try {
    const buf = Buffer.from(execSync(`git show HEAD:${rel}`, { cwd: REPO_ROOT, maxBuffer: 20e6 }));
    return { buf, source: 'git-HEAD' };
  } catch {
    return null;
  }
}

ensureDir(RAW_DIR);
ensureDir(ENC_DIR);
const key = loadOrCreateKey();

const entries = [];
const allRels = [...new Set([...WT_SOURCES, ...GIT_BLOB_ONLY])];

for (const rel of allRels) {
  const safeName = rel.replace(/[\\/]/g, '__');
  let got = copyFromWorkingTree(rel);
  if (!got && GIT_BLOB_ONLY.includes(rel)) {
    got = copyFromGit(rel);
  }
  // Also pull git copy for tracked WT files so quarantine has both if needed
  if (!got) {
    got = copyFromGit(rel);
  }
  if (!got) {
    entries.push({
      rel,
      status: 'MISSING',
      note: 'Not in working tree or git HEAD',
    });
    continue;
  }

  const rawPath = path.join(RAW_DIR, safeName);
  const encPath = path.join(ENC_DIR, `${safeName}.aes`);
  fs.writeFileSync(rawPath, got.buf);
  encryptFile(key, got.buf, encPath);

  const decrypted = decryptFile(key, encPath);
  const hashMatch = sha256(got.buf) === sha256(decrypted);
  let stats = null;
  let parseOk = false;
  try {
    stats = analyzeJson(decrypted);
    parseOk = true;
  } catch {
    parseOk = false;
  }

  // Round-trip restore to temp and delete temp (no secrets printed)
  const tempRestore = path.join(ENC_DIR, `_temp_restore_${safeName}`);
  fs.writeFileSync(tempRestore, decrypted);
  const restoreStat = fs.statSync(tempRestore);
  fs.unlinkSync(tempRestore);

  entries.push({
    rel,
    status: hashMatch && parseOk ? 'OK' : 'FAIL',
    source: got.source,
    rawBytes: got.buf.length,
    encBytes: fs.statSync(encPath).size,
    sha256: sha256(got.buf),
    decryptRoundTrip: hashMatch,
    jsonParseOk: parseOk,
    restoreTempBytes: restoreStat.size,
    stats,
    rawPath: path.relative(PARENT, rawPath),
    encPath: path.relative(PARENT, encPath),
  });
}

const summary = {
  createdAt: new Date().toISOString(),
  quarantineRoot: QUARANTINE_ROOT,
  rawDir: RAW_DIR,
  encryptedDir: ENC_DIR,
  keyFile: KEY_FILE,
  keyStoredSeparately: !KEY_FILE.startsWith(QUARANTINE_ROOT),
  liveLedgerModified: false,
  originalsDeleted: false,
  entryCount: entries.length,
  okCount: entries.filter((e) => e.status === 'OK').length,
  failCount: entries.filter((e) => e.status === 'FAIL' || e.status === 'MISSING').length,
  entries,
};

fs.writeFileSync(MANIFEST, JSON.stringify(summary, null, 2), 'utf8');

console.log(
  JSON.stringify(
    {
      quarantineRoot: QUARANTINE_ROOT,
      keyDir: KEY_DIR,
      manifest: MANIFEST,
      okCount: summary.okCount,
      failCount: summary.failCount,
      entryCount: summary.entryCount,
      originalsDeleted: false,
      liveLedgerModified: false,
      perFile: entries.map((e) => ({
        rel: e.rel,
        status: e.status,
        source: e.source,
        rawBytes: e.rawBytes,
        decryptRoundTrip: e.decryptRoundTrip,
        jsonParseOk: e.jsonParseOk,
        kind: e.stats?.kind,
        clientCount: e.stats?.clientCount,
        gstCount: e.stats?.gstCount,
        plaintextNonEmpty: e.stats?.plaintextNonEmpty,
        encCount: e.stats?.encCount,
      })),
    },
    null,
    2
  )
);
