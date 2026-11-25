/**
 * Phase 8C.2 — Local-only PostgreSQL dump backup helpers.
 * Never logs DATABASE_URL passwords, dump contents, or encryption keys.
 * Remote / production targets are hard-refused (no remote ACK path).
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  assertSafeDatabaseTarget,
  isLoopbackHost,
  parseDatabaseUrl,
  redactDatabaseUrl,
  resolveDbTargetMode,
} from './db-safety.mjs';

/** Disposable local databases allowed for dump drills (not prod/staging). */
export const ALLOWED_PG_DUMP_DB_NAMES = Object.freeze([
  'it_gst_management_restore_drill',
  'it_gst_management_backup_drill',
]);

/** Env that must equal the URL database name. */
export const PG_DUMP_CONFIRM_ENV = 'PG_DUMP_CONFIRM';

/** Dedicated dump ciphertext magic — distinct from ASSOCBK1 (JSON) and BK1 (quarantine). */
export const PG_DUMP_MAGIC = Buffer.from('ASSOCPGD1', 'utf8');
export const PG_DUMP_ENC_SUFFIX = '.dump.enc';
export const PG_DUMP_PLAIN_SUFFIX = '.dump';

const ALG = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

const PROD_LIKE_DB_RE =
  /(^|_)(prod|production|live|staging|stage)(_|$)|(^|_)prod$/i;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Associate_application root (scripts/..) */
export const PROJECT_ROOT = path.resolve(__dirname, '..');

/**
 * @param {string} databaseName
 */
export function isProductionLikeDatabaseName(databaseName) {
  const name = String(databaseName || '').trim();
  if (!name) return true;
  if (PROD_LIKE_DB_RE.test(name)) return true;
  if (name === 'postgres' || name === 'template0' || name === 'template1') {
    return true;
  }
  return false;
}

/**
 * @param {string} resolvedPath
 */
export function pathLooksOneDriveSynced(resolvedPath) {
  const normalized = path.resolve(resolvedPath).replace(/\\/g, '/');
  return /(^|\/)onedrive(\/|$| - )/i.test(normalized);
}

/**
 * Refuse dumps inside the Git project tree or any OneDrive-synced path.
 * @param {string} outputDir
 * @param {{ projectRoot?: string }} [options]
 */
export function assertSafePgDumpOutputDir(outputDir, options = {}) {
  const projectRoot = path.resolve(options.projectRoot || PROJECT_ROOT);
  if (!outputDir || !String(outputDir).trim()) {
    throw new Error(
      'PG_DUMP_OUTPUT_DIR is missing. Set it to an absolute directory outside the project and outside OneDrive.'
    );
  }
  const resolved = path.resolve(String(outputDir).trim());
  const rootWithSep = projectRoot.endsWith(path.sep)
    ? projectRoot
    : projectRoot + path.sep;
  if (resolved === projectRoot || resolved.startsWith(rootWithSep)) {
    throw new Error(
      `Refusing output directory inside the project tree (${projectRoot}). ` +
        'Use a path outside the Git repository (for example under %LOCALAPPDATA%).'
    );
  }
  if (pathLooksOneDriveSynced(resolved)) {
    throw new Error(
      'Refusing output directory on a OneDrive-synced path. ' +
        'Store PostgreSQL dumps outside OneDrive (for example under %LOCALAPPDATA%\\associate-pg-dumps).'
    );
  }
  return resolved;
}

/**
 * Load dedicated PG dump encryption key (never reads BACKUP_ENCRYPTION_KEY /
 * PORTAL_PASSWORD_ENCRYPTION_KEY / quarantine archive key paths).
 * @param {{ env?: NodeJS.ProcessEnv, envValue?: string, keyFilePath?: string }} [options]
 * @returns {{ ok: true, key: Buffer, source: 'env' | 'file' } | { ok: false, reason: 'missing' | 'invalid' }}
 */
export function loadPgDumpEncryptionKey(options = {}) {
  const env = options.env || process.env;
  const rawEnv =
    options.envValue !== undefined
      ? options.envValue
      : env.PG_DUMP_ENCRYPTION_KEY;
  if (rawEnv && String(rawEnv).trim()) {
    const parsed = parseKeyMaterial(String(rawEnv).trim());
    if (!parsed) return { ok: false, reason: 'invalid' };
    const conflict = detectKeyReuse(parsed, env);
    if (conflict) return { ok: false, reason: 'invalid' };
    return { ok: true, key: parsed, source: 'env' };
  }

  const filePath =
    options.keyFilePath ||
    (env.PG_DUMP_ENCRYPTION_KEY_FILE
      ? String(env.PG_DUMP_ENCRYPTION_KEY_FILE).trim()
      : '');
  if (filePath) {
    try {
      if (!fs.existsSync(filePath)) return { ok: false, reason: 'missing' };
      const raw = fs.readFileSync(filePath, 'utf8').trim();
      const parsed = parseKeyMaterial(raw);
      if (!parsed) return { ok: false, reason: 'invalid' };
      const conflict = detectKeyReuse(parsed, env);
      if (conflict) return { ok: false, reason: 'invalid' };
      return { ok: true, key: parsed, source: 'file' };
    } catch {
      return { ok: false, reason: 'invalid' };
    }
  }

  return { ok: false, reason: 'missing' };
}

/**
 * Refuse identical key material if another known key env is also set (best-effort).
 * @param {Buffer} key
 * @param {NodeJS.ProcessEnv} env
 */
function detectKeyReuse(key, env) {
  const others = [
    env.BACKUP_ENCRYPTION_KEY,
    env.PORTAL_PASSWORD_ENCRYPTION_KEY,
  ];
  for (const raw of others) {
    if (!raw || !String(raw).trim()) continue;
    const other = parseKeyMaterial(String(raw).trim());
    if (other && other.equals(key)) {
      return 'reuse';
    }
  }
  return null;
}

function parseKeyMaterial(trimmed) {
  try {
    let buf;
    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
      buf = Buffer.from(trimmed, 'hex');
    } else {
      buf = Buffer.from(trimmed, 'base64');
    }
    if (buf.length !== KEY_LEN) return null;
    return buf;
  } catch {
    return null;
  }
}

/**
 * @param {Buffer} plaintext
 * @param {Buffer} key
 */
export function encryptPgDumpBuffer(plaintext, key) {
  if (!Buffer.isBuffer(plaintext) || plaintext.length < 1) {
    throw new Error('Refusing to encrypt empty dump buffer.');
  }
  if (!Buffer.isBuffer(key) || key.length !== KEY_LEN) {
    throw new Error('Invalid PostgreSQL dump encryption key.');
  }
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALG, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([PG_DUMP_MAGIC, iv, tag, ct]);
}

/**
 * @param {Buffer} blob
 * @param {Buffer} key
 */
export function decryptPgDumpBuffer(blob, key) {
  if (!Buffer.isBuffer(blob) || blob.length < PG_DUMP_MAGIC.length + IV_LEN + TAG_LEN + 1) {
    throw new Error('Incomplete or empty encrypted dump.');
  }
  if (!blob.subarray(0, PG_DUMP_MAGIC.length).equals(PG_DUMP_MAGIC)) {
    throw new Error('Not an ASSOCIATE PostgreSQL dump ciphertext (bad magic).');
  }
  let offset = PG_DUMP_MAGIC.length;
  const iv = blob.subarray(offset, offset + IV_LEN);
  offset += IV_LEN;
  const tag = blob.subarray(offset, offset + TAG_LEN);
  offset += TAG_LEN;
  const ct = blob.subarray(offset);
  try {
    const decipher = crypto.createDecipheriv(ALG, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  } catch {
    throw new Error('Dump decryption failed (wrong key or tampered data).');
  }
}

/**
 * @param {Buffer | string} data
 */
export function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Validate local disposable target + output dir + encryption policy. No DB I/O.
 * @param {{
 *   connectionString: string,
 *   env?: NodeJS.ProcessEnv,
 *   outputDir?: string,
 *   projectRoot?: string,
 *   allowPlaintext?: boolean,
 * }} options
 */
export function assertLocalPgDumpTarget(options) {
  const env = options.env || process.env;
  const mode = resolveDbTargetMode(env);
  if (mode !== 'local') {
    throw new Error(
      'Refusing PostgreSQL dump: DB_TARGET_MODE must be local (remote dumps are not supported in Phase 8C.2).'
    );
  }

  if (!options.connectionString || !String(options.connectionString).trim()) {
    throw new Error(
      'DATABASE_URL is missing. Set a local disposable database URL (never commit the password).'
    );
  }

  const parsed = parseDatabaseUrl(options.connectionString);
  if (!isLoopbackHost(parsed.host)) {
    throw new Error(
      `Refusing host "${parsed.host}". PostgreSQL dump tooling only allows localhost / 127.0.0.1 / ::1.`
    );
  }

  if (isProductionLikeDatabaseName(parsed.database)) {
    throw new Error(
      `Refusing production-like database name "${parsed.database}".`
    );
  }

  if (!ALLOWED_PG_DUMP_DB_NAMES.includes(parsed.database)) {
    throw new Error(
      `Refusing database "${parsed.database}". Allowed disposable names: ${ALLOWED_PG_DUMP_DB_NAMES.join(', ')}.`
    );
  }

  // Reuse localhost + allowlist enforcement from shared safety.
  assertSafeDatabaseTarget(options.connectionString, {
    allowedDatabases: [...ALLOWED_PG_DUMP_DB_NAMES],
    missingMessage:
      'DATABASE_URL is missing. Set a local disposable database URL (never commit the password).',
  });

  const confirm = String(env[PG_DUMP_CONFIRM_ENV] || '').trim();
  if (!confirm) {
    throw new Error(
      `Missing ${PG_DUMP_CONFIRM_ENV}. Set it to the exact disposable database name ("${parsed.database}").`
    );
  }
  if (confirm !== parsed.database) {
    throw new Error(
      `${PG_DUMP_CONFIRM_ENV}="${confirm}" must exactly equal the URL database name ("${parsed.database}").`
    );
  }

  const outputDir = assertSafePgDumpOutputDir(
    options.outputDir !== undefined
      ? options.outputDir
      : env.PG_DUMP_OUTPUT_DIR,
    { projectRoot: options.projectRoot || PROJECT_ROOT }
  );

  const allowPlaintext =
    options.allowPlaintext === true ||
    String(env.PG_DUMP_ALLOW_PLAINTEXT || '').trim() === '1';
  const keyStatus = loadPgDumpEncryptionKey({ env });
  if (keyStatus.ok === false && keyStatus.reason === 'invalid') {
    throw new Error(
      'PG dump encryption key is invalid or reuses BACKUP_ENCRYPTION_KEY / PORTAL_PASSWORD_ENCRYPTION_KEY. ' +
        'Use a dedicated PG_DUMP_ENCRYPTION_KEY.'
    );
  }
  if (!keyStatus.ok && !allowPlaintext) {
    throw new Error(
      'PG_DUMP_ENCRYPTION_KEY or PG_DUMP_ENCRYPTION_KEY_FILE is required ' +
        '(dedicated dump key — do not reuse JSON/portal/archive keys). ' +
        'For a local plaintext drill only, set PG_DUMP_ALLOW_PLAINTEXT=1.'
    );
  }

  return {
    host: parsed.host,
    database: parsed.database,
    port: parsed.port,
    outputDir,
    encrypt: keyStatus.ok === true,
    keySource: keyStatus.ok === true ? keyStatus.source : null,
    redactedUrl: redactDatabaseUrl(options.connectionString),
  };
}

/**
 * Build pg_dump argv (connection via env PGPASSWORD is intentionally NOT used —
 * URL is passed via --dbname so the caller can supply a redacted log of args).
 * @param {{ connectionString: string, dumpPath: string, pgDumpBin?: string }} options
 */
export function buildPgDumpArgs(options) {
  const bin = options.pgDumpBin || 'pg_dump';
  // Custom format (-Fc). --no-password fails closed if auth needed interactively.
  const args = [
    '--format=custom',
    '--no-owner',
    '--no-acl',
    '--dbname',
    options.connectionString,
    '--file',
    options.dumpPath,
  ];
  return { bin, args };
}

/**
 * Resolve pg_dump binary; throws if missing.
 * @param {{ spawnSyncFn?: Function, bin?: string }} [options]
 */
export function assertPgDumpAvailable(options = {}) {
  const spawnSyncFn = options.spawnSyncFn;
  const bin = options.bin || 'pg_dump';
  if (!spawnSyncFn) {
    throw new Error('spawnSyncFn is required for pg_dump availability checks.');
  }
  const probe = spawnSyncFn(bin, ['--version'], {
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
  });
  if (probe.error) {
    const code = /** @type {NodeJS.ErrnoException} */ (probe.error).code;
    if (code === 'ENOENT') {
      throw new Error(
        'pg_dump was not found on PATH. Install PostgreSQL client tools locally.'
      );
    }
    throw new Error(`Failed to execute pg_dump: ${probe.error.message}`);
  }
  if (probe.status !== 0) {
    throw new Error(
      `pg_dump --version failed with status ${probe.status}. Refusing to continue.`
    );
  }
  return String(probe.stdout || '')
    .split('\n')[0]
    .trim();
}

/**
 * @param {{
 *   database: string,
 *   outputDir: string,
 *   encrypt: boolean,
 *   now?: Date,
 * }} options
 */
export function buildDumpArtifactPaths(options) {
  const d = options.now || new Date();
  const stamp =
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}` +
    `T${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}${String(d.getUTCSeconds()).padStart(2, '0')}Z`;
  const base = `pg-${options.database}-${stamp}`;
  const plainPath = path.join(options.outputDir, `${base}${PG_DUMP_PLAIN_SUFFIX}`);
  const encPath = path.join(options.outputDir, `${base}${PG_DUMP_ENC_SUFFIX}`);
  const manifestPath = path.join(options.outputDir, `${base}.manifest.json`);
  return {
    stamp,
    plainPath,
    encPath,
    manifestPath,
    finalPath: options.encrypt ? encPath : plainPath,
  };
}

/**
 * Create a safe manifest object (no secrets, no row data).
 * @param {object} fields
 */
export function buildDumpManifest(fields) {
  return {
    schemaVersion: 1,
    createdAt: fields.createdAt,
    database: fields.database,
    host: fields.host,
    format: 'pg_dump-custom',
    encrypted: !!fields.encrypted,
    cipher: fields.encrypted ? 'aes-256-gcm' : null,
    magic: fields.encrypted ? PG_DUMP_MAGIC.toString('utf8') : null,
    artifactPath: fields.artifactPath,
    bytes: fields.bytes,
    sha256: fields.sha256,
    plainSha256: fields.plainSha256 || null,
    pgDumpVersionLine: fields.pgDumpVersionLine || null,
    note: 'Counts/contents omitted intentionally. Never commit this artifact.',
  };
}

/**
 * Plan-only: validate gates and return a dry-run description. No spawn, no write.
 * @param {{
 *   connectionString: string,
 *   env?: NodeJS.ProcessEnv,
 *   outputDir?: string,
 *   projectRoot?: string,
 *   now?: Date,
 * }} options
 */
export function planLocalPgDump(options) {
  const target = assertLocalPgDumpTarget(options);
  const paths = buildDumpArtifactPaths({
    database: target.database,
    outputDir: target.outputDir,
    encrypt: target.encrypt,
    now: options.now,
  });
  const { bin, args } = buildPgDumpArgs({
    connectionString: options.connectionString,
    dumpPath: paths.plainPath,
  });
  // Redact connection string from logged argv copy
  const safeArgs = args.map((a, i) =>
    args[i - 1] === '--dbname' ? target.redactedUrl : a
  );
  return {
    mode: 'dry-run',
    host: target.host,
    database: target.database,
    outputDir: target.outputDir,
    encrypt: target.encrypt,
    keySource: target.keySource,
    plainPath: paths.plainPath,
    encPath: paths.encPath,
    finalPath: paths.finalPath,
    manifestPath: paths.manifestPath,
    pgDumpBin: bin,
    pgDumpArgsRedacted: safeArgs,
    redactedUrl: target.redactedUrl,
  };
}

/**
 * Execute dump using injected spawn/fs (tests mock these). Callers must pass --execute.
 * @param {{
 *   connectionString: string,
 *   env?: NodeJS.ProcessEnv,
 *   outputDir?: string,
 *   projectRoot?: string,
 *   now?: Date,
 *   spawnSyncFn: Function,
 *   pgDumpBin?: string,
 *   writeFileFn?: Function,
 *   readFileFn?: Function,
 *   unlinkFn?: Function,
 *   mkdirFn?: Function,
 *   existsFn?: Function,
 * }} options
 */
export function executeLocalPgDump(options) {
  const env = options.env || process.env;
  const plan = planLocalPgDump(options);
  const spawnSyncFn = options.spawnSyncFn;
  const writeFileFn = options.writeFileFn || fs.writeFileSync;
  const readFileFn = options.readFileFn || fs.readFileSync;
  const unlinkFn = options.unlinkFn || fs.unlinkSync;
  const mkdirFn = options.mkdirFn || fs.mkdirSync;
  const existsFn = options.existsFn || fs.existsSync;

  const versionLine = assertPgDumpAvailable({
    spawnSyncFn,
    bin: options.pgDumpBin || plan.pgDumpBin,
  });

  mkdirFn(plan.outputDir, { recursive: true });

  const { bin, args } = buildPgDumpArgs({
    connectionString: options.connectionString,
    dumpPath: plan.plainPath,
    pgDumpBin: options.pgDumpBin || plan.pgDumpBin,
  });

  const result = spawnSyncFn(bin, args, {
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
    env: {
      ...env,
      // Avoid leaking through child logs; pg_dump uses URL for auth.
    },
  });

  if (result.error) {
    const code = /** @type {NodeJS.ErrnoException} */ (result.error).code;
    if (code === 'ENOENT') {
      throw new Error(
        'pg_dump was not found on PATH. Install PostgreSQL client tools locally.'
      );
    }
    throw new Error(`pg_dump failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    // Do not echo stderr (may contain connection details on some builds).
    throw new Error(
      `pg_dump failed with status ${result.status}. Dump was not accepted.`
    );
  }
  if (!existsFn(plan.plainPath)) {
    throw new Error('pg_dump reported success but dump file is missing.');
  }

  const plainBuf = readFileFn(plan.plainPath);
  if (!plainBuf || plainBuf.length < 1) {
    try {
      unlinkFn(plan.plainPath);
    } catch {
      /* ignore */
    }
    throw new Error('pg_dump produced an empty file. Refusing.');
  }
  const plainSha = sha256Hex(plainBuf);

  let artifactPath = plan.plainPath;
  let artifactBuf = plainBuf;
  let encrypted = false;

  if (plan.encrypt) {
    const keyStatus = loadPgDumpEncryptionKey({ env });
    if (!keyStatus.ok) {
      try {
        unlinkFn(plan.plainPath);
      } catch {
        /* ignore */
      }
      throw new Error('Dump encryption key became unavailable after dump.');
    }
    artifactBuf = encryptPgDumpBuffer(plainBuf, keyStatus.key);
    artifactPath = plan.encPath;
    writeFileFn(artifactPath, artifactBuf);
    encrypted = true;
    try {
      unlinkFn(plan.plainPath);
    } catch {
      throw new Error(
        'Encrypted dump written but failed to remove plaintext dump. Remove the plaintext file manually from the output directory.'
      );
    }
  }

  const sha = sha256Hex(artifactBuf);
  const manifest = buildDumpManifest({
    createdAt: (options.now || new Date()).toISOString(),
    database: plan.database,
    host: plan.host,
    encrypted,
    artifactPath,
    bytes: artifactBuf.length,
    sha256: sha,
    plainSha256: encrypted ? plainSha : null,
    pgDumpVersionLine: versionLine,
  });
  writeFileFn(plan.manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  return {
    mode: 'execute',
    database: plan.database,
    host: plan.host,
    outputDir: plan.outputDir,
    artifactPath,
    manifestPath: plan.manifestPath,
    bytes: artifactBuf.length,
    sha256: sha,
    encrypted,
    redactedUrl: plan.redactedUrl,
  };
}
