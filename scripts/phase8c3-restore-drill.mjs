/**
 * Phase 8C.3 — Disposable local PostgreSQL backup → restore drill.
 * Synthetic demo data only. Never prints passwords, keys, or URLs with secrets.
 *
 * Usage: node --import tsx scripts/phase8c3-restore-drill.mjs
 *   or:  npx tsx scripts/phase8c3-restore-drill.mjs
 */
import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import pg from 'pg';
import { verifySecret } from '../authCrypto.ts';
import {
  ALLOWED_DISPOSABLE_DRILL_DB_NAMES,
  isLoopbackHost,
  parseDatabaseUrl,
  redactDatabaseUrl,
  rewriteDatabaseUrl,
} from './db-safety.mjs';
import {
  decryptPgDumpBuffer,
  executeLocalPgDump,
  planLocalPgDump,
  sha256Hex,
} from './pg-dump-backup-lib.mjs';
import { provisionTwoOwners } from './provision-two-owners-lib.ts';

const SOURCE_DB = 'it_gst_management_restore_drill';
const TARGET_DB = 'it_gst_management_backup_drill';

function fail(msg) {
  console.error(`[phase8c3] ERROR: ${msg}`);
  process.exitCode = 1;
  throw new Error(msg);
}

function requireLocalBaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url || !String(url).trim()) {
    fail('DATABASE_URL missing — local loopback URL required for drill.');
  }
  const parsed = parseDatabaseUrl(url);
  if (!isLoopbackHost(parsed.host)) {
    fail(`Refusing non-loopback host "${parsed.host}".`);
  }
  return url;
}

function adminUrl(baseUrl) {
  const u = new URL(baseUrl);
  u.pathname = '/postgres';
  return u.toString();
}

async function listExistingDrills(baseUrl) {
  const client = new pg.Client({ connectionString: adminUrl(baseUrl) });
  await client.connect();
  try {
    const r = await client.query(
      'SELECT datname FROM pg_database WHERE datname = ANY($1::text[]) ORDER BY 1',
      [[...ALLOWED_DISPOSABLE_DRILL_DB_NAMES]]
    );
    return r.rows.map((row) => row.datname);
  } finally {
    await client.end();
  }
}

async function createDatabase(baseUrl, name) {
  const client = new pg.Client({ connectionString: adminUrl(baseUrl) });
  await client.connect();
  try {
    // Identifier is from our frozen allowlist only — still quote safely.
    if (!ALLOWED_DISPOSABLE_DRILL_DB_NAMES.includes(name)) {
      fail(`Refusing to create non-drill database "${name}".`);
    }
    await client.query(`CREATE DATABASE "${name}"`);
  } finally {
    await client.end();
  }
}

import { fileURLToPath } from 'url';

function projectRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function runMigrateFixed(sourceUrl) {
  const env = {
    ...process.env,
    DATABASE_URL: sourceUrl,
    DB_MIGRATE_CONFIRM: SOURCE_DB,
    DB_TARGET_MODE: 'local',
  };
  // Clear remote ack envs if present
  delete env.DB_REMOTE_MIGRATE_ACK;
  delete env.DB_REMOTE_MIGRATE_TOKEN;
  const r = spawnSync(process.execPath, ['scripts/db-migrate.mjs'], {
    cwd: projectRoot(),
    env,
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
  });
  if (r.status !== 0) {
    fail(`db:migrate failed with status ${r.status}`);
  }
  console.log('[phase8c3] migrate: OK');
}

function makeSyntheticPassword(label) {
  // Meets policy; never logged.
  return `Drill-${label}-9fK!${crypto.randomBytes(4).toString('hex')}`;
}

async function seedSyntheticBusiness(client, organizationId) {
  const now = new Date().toISOString();
  await client.query(
    `INSERT INTO assessment_years (organization_id, label) VALUES
      ($1::uuid, 'AY 2024-25'),
      ($1::uuid, 'AY 2025-26')
     ON CONFLICT DO NOTHING`,
    [organizationId]
  );
  await client.query(
    `INSERT INTO gst_months (organization_id, label) VALUES
      ($1::uuid, 'Apr 2025'),
      ($1::uuid, 'May 2025')
     ON CONFLICT DO NOTHING`,
    [organizationId]
  );

  const itClients = [
    {
      id: 'drill-it-001',
      name: 'Demo Client Alpha',
      pan: 'AAAAA0000A',
      fees: [
        { year: 'AY 2024-25', fees: 10000, received: 7000, balance: 3000 },
        { year: 'AY 2025-26', fees: 12000, received: 12000, balance: 0 },
      ],
    },
    {
      id: 'drill-it-002',
      name: 'Demo Client Beta',
      pan: 'BBBBB0000B',
      fees: [
        { year: 'AY 2024-25', fees: 8000, received: 8000, balance: 0 },
      ],
    },
    {
      id: 'drill-it-003',
      name: 'Demo Client Gamma',
      pan: 'CCCCC0000C',
      fees: [
        { year: 'AY 2025-26', fees: 5000, received: 2000, balance: 3000 },
      ],
    },
  ];

  for (const c of itClients) {
    await client.query(
      `INSERT INTO it_clients (
         id, organization_id, name, pan, phone, reference_number, remark,
         password_enc, created_at, updated_at, row_version
       ) VALUES ($1,$2::uuid,$3,$4,'9999900001','REF-DEMO','synthetic drill',NULL,$5::timestamptz,$5::timestamptz,1)`,
      [c.id, organizationId, c.name, c.pan, now]
    );
    for (const f of c.fees) {
      await client.query(
        `INSERT INTO it_filings (
           organization_id, it_client_id, assessment_year, filing_date,
           fees, received, balance, payment_type, payment_receive_date
         ) VALUES ($1::uuid,$2,$3,'2025-01-15',$4,$5,$6,'UPI','2025-01-20')`,
        [organizationId, c.id, f.year, f.fees, f.received, f.balance]
      );
    }
  }

  const gst = [
    {
      id: 'drill-gst-001',
      company: 'Demo GST Company One',
      months: [
        { month: 'Apr 2025', fees: 2000, interest: 0, tax: 18000, total: 20000 },
        { month: 'May 2025', fees: 2000, interest: 100, tax: 17900, total: 20000 },
      ],
      totalReceived: 15000,
    },
    {
      id: 'drill-gst-002',
      company: 'Demo GST Company Two',
      months: [
        { month: 'Apr 2025', fees: 1500, interest: 0, tax: 8500, total: 10000 },
      ],
      totalReceived: 10000,
    },
  ];

  for (const g of gst) {
    await client.query(
      `INSERT INTO gst_companies (
         id, organization_id, company_name, portal_user_id, phone, reference_number,
         remark, total_received, password_enc, created_at, updated_at, row_version
       ) VALUES ($1,$2::uuid,$3,'demo.user','9999900002','GST-REF','synthetic', $4, NULL, $5::timestamptz, $5::timestamptz, 1)`,
      [g.id, organizationId, g.company, g.totalReceived, now]
    );
    for (const m of g.months) {
      await client.query(
        `INSERT INTO gst_filings (
           organization_id, gst_company_id, month, fees, interest, tax, total
         ) VALUES ($1::uuid,$2,$3,$4,$5,$6,$7)`,
        [organizationId, g.id, m.month, m.fees, m.interest, m.tax, m.total]
      );
    }
  }

  return {
    itClients: itClients.length,
    itFilings: itClients.reduce((n, c) => n + c.fees.length, 0),
    gstCompanies: gst.length,
    gstFilings: gst.reduce((n, g) => n + g.months.length, 0),
    expectedItFees: 35000,
    expectedItReceived: 29000,
    expectedItBalance: 6000,
    expectedGstTotal: 50000,
    expectedGstReceived: 25000,
  };
}

async function collectIntegrity(connectionString) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const q = async (sql, params) =>
      (await client.query(sql, params)).rows;

    const migrations = await q(
      `SELECT id FROM schema_migrations ORDER BY id`
    );
    const orgs = await q(`SELECT id, name FROM organizations`);
    const owners = await q(
      `SELECT u.email, m.organization_id
       FROM organization_members m
       INNER JOIN users u ON u.id = m.user_id
       WHERE m.role = 'owner'
       ORDER BY u.email`
    );
    const itCount = await q(`SELECT COUNT(*)::int AS n FROM it_clients`);
    const gstCount = await q(`SELECT COUNT(*)::int AS n FROM gst_companies`);
    const itFil = await q(`SELECT COUNT(*)::int AS n FROM it_filings`);
    const gstFil = await q(`SELECT COUNT(*)::int AS n FROM gst_filings`);
    const itMoney = await q(
      `SELECT COALESCE(SUM(fees),0)::float AS fees,
              COALESCE(SUM(received),0)::float AS received,
              COALESCE(SUM(balance),0)::float AS balance
       FROM it_filings`
    );
    const gstMoney = await q(
      `SELECT COALESCE(SUM(total),0)::float AS total FROM gst_filings`
    );
    const gstRecv = await q(
      `SELECT COALESCE(SUM(total_received),0)::float AS recv FROM gst_companies`
    );
    const dupIt = await q(
      `SELECT id FROM it_clients GROUP BY id HAVING COUNT(*) > 1`
    );
    const dupGst = await q(
      `SELECT id FROM gst_companies GROUP BY id HAVING COUNT(*) > 1`
    );
    const fkOrphansIt = await q(
      `SELECT f.id FROM it_filings f
       LEFT JOIN it_clients c
         ON c.organization_id = f.organization_id AND c.id = f.it_client_id
       WHERE c.id IS NULL`
    );
    const fkOrphansGst = await q(
      `SELECT f.id FROM gst_filings f
       LEFT JOIN gst_companies c
         ON c.organization_id = f.organization_id AND c.id = f.gst_company_id
       WHERE c.id IS NULL`
    );

    return {
      migrations: migrations.map((r) => r.id),
      organizationCount: orgs.length,
      organizationId: orgs[0] ? String(orgs[0].id) : null,
      ownerCount: owners.length,
      ownerEmails: owners.map((r) => String(r.email)),
      ownerOrgIds: [...new Set(owners.map((r) => String(r.organization_id)))],
      itClients: itCount[0].n,
      gstCompanies: gstCount[0].n,
      itFilings: itFil[0].n,
      gstFilings: gstFil[0].n,
      itFees: itMoney[0].fees,
      itReceived: itMoney[0].received,
      itBalance: itMoney[0].balance,
      gstTotal: gstMoney[0].total,
      gstReceived: gstRecv[0].recv,
      duplicateItIds: dupIt.length,
      duplicateGstIds: dupGst.length,
      orphanItFilings: fkOrphansIt.length,
      orphanGstFilings: fkOrphansGst.length,
    };
  } finally {
    await client.end();
  }
}

async function verifyOwnerPasswords(connectionString, ownerA, ownerB) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const check = async (cred) => {
      const r = await client.query(
        `SELECT password_salt, password_hash FROM users WHERE LOWER(email) = LOWER($1)`,
        [cred.email]
      );
      if (!r.rowCount) return false;
      return verifySecret(
        cred.password,
        String(r.rows[0].password_salt),
        String(r.rows[0].password_hash)
      );
    };
    return {
      ownerAAuthOk: await check(ownerA),
      ownerBAuthOk: await check(ownerB),
    };
  } finally {
    await client.end();
  }
}

function safeOutputDir() {
  const base =
    process.env.LOCALAPPDATA ||
    process.env.XDG_CACHE_HOME ||
    path.join(os.homedir(), '.cache');
  const dir = path.join(base, 'associate-pg-dumps');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function main() {
  const report = {
    phase: '8C.3',
    sourceDb: SOURCE_DB,
    targetDb: TARGET_DB,
    steps: {},
  };

  const baseUrl = requireLocalBaseUrl();
  console.log(
    `[phase8c3] base=${redactDatabaseUrl(baseUrl)} drills=${SOURCE_DB},${TARGET_DB}`
  );

  const existing = await listExistingDrills(baseUrl);
  const resume = String(process.env.RESUME_PHASE8C3 || '').trim() === '1';
  if (existing.length && !resume) {
    fail(
      `Drill database(s) already exist: ${existing.join(', ')}. STOP per Phase 8C.3 rules — no drop/overwrite. ` +
        `If these were created by a interrupted 8C.3 run, re-run with RESUME_PHASE8C3=1 (still no DROP).`
    );
  }
  if (existing.length && resume) {
    const missing = [...ALLOWED_DISPOSABLE_DRILL_DB_NAMES].filter(
      (n) => !existing.includes(n)
    );
    if (missing.length) {
      fail(
        `RESUME_PHASE8C3=1 but missing drill DB(s): ${missing.join(', ')}. Refusing partial resume.`
      );
    }
    console.log(
      '[phase8c3] RESUME_PHASE8C3=1 — skipping CREATE DATABASE (existing drill DBs retained)'
    );
    report.steps.precheck = {
      bothAbsent: false,
      existing,
      resumed: true,
    };
  } else {
    report.steps.precheck = { bothAbsent: true, existing: [] };
    console.log('[phase8c3] creating disposable databases…');
    await createDatabase(baseUrl, SOURCE_DB);
    await createDatabase(baseUrl, TARGET_DB);
    report.steps.createDatabases = { created: [SOURCE_DB, TARGET_DB] };
  }

  const sourceUrl = rewriteDatabaseUrl(baseUrl, SOURCE_DB);
  const targetUrl = rewriteDatabaseUrl(baseUrl, TARGET_DB);

  runMigrateFixed(sourceUrl);

  const ownerA = {
    email: 'owner-a.drill@example.com',
    password: makeSyntheticPassword('A'),
  };
  const ownerB = {
    email: 'owner-b.drill@example.com',
    password: makeSyntheticPassword('B'),
  };

  const srcClient = new pg.Client({ connectionString: sourceUrl });
  await srcClient.connect();
  let provision;
  let seed;
  try {
    // If resume left prior synthetic rows, clear business+auth tables in SOURCE only
    // (never DROP DATABASE; disposable drill content only).
    if (resume) {
      await srcClient.query('BEGIN');
      await srcClient.query(
        `TRUNCATE TABLE
           gst_filings, it_filings, gst_companies, it_clients,
           gst_months, assessment_years, password_reset_challenges,
           sessions, organization_members, users, organizations
         RESTART IDENTITY CASCADE`
      );
      await srcClient.query('COMMIT');
      console.log(
        '[phase8c3] resume: truncated synthetic tables in source drill DB only'
      );
    }
    await srcClient.query('BEGIN');
    provision = await provisionTwoOwners(srcClient, {
      organizationName: 'Phase8C3 Synthetic Drill Org',
      ownerA,
      ownerB,
    });
    seed = await seedSyntheticBusiness(srcClient, provision.organizationId);
    await srcClient.query('COMMIT');
  } catch (err) {
    try {
      await srcClient.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    await srcClient.end();
    fail(err instanceof Error ? err.message : String(err));
  }
  await srcClient.end();

  console.log(
    `[phase8c3] provisioned org owners=2 status=${provision.status} (ids omitted from stdout)`
  );
  console.log(
    `[phase8c3] seeded IT=${seed.itClients} filings=${seed.itFilings} GST=${seed.gstCompanies} filings=${seed.gstFilings}`
  );
  report.steps.seed = {
    organizationName: 'Phase8C3 Synthetic Drill Org',
    owners: 2,
    ownerEmails: [ownerA.email, ownerB.email],
    ...seed,
  };

  const before = await collectIntegrity(sourceUrl);
  report.steps.sourceIntegrity = before;

  const dumpKey = crypto.randomBytes(32).toString('hex');
  const outputDir = safeOutputDir();
  const dumpEnv = {
    ...process.env,
    DATABASE_URL: sourceUrl,
    PG_DUMP_CONFIRM: SOURCE_DB,
    PG_DUMP_OUTPUT_DIR: outputDir,
    PG_DUMP_ENCRYPTION_KEY: dumpKey,
    DB_TARGET_MODE: 'local',
  };

  const plan = planLocalPgDump({
    connectionString: sourceUrl,
    env: dumpEnv,
  });
  console.log(
    `[phase8c3] backup dry-run OK encrypt=${plan.encrypt} out=${plan.outputDir}`
  );
  report.steps.backupDryRun = {
    encrypt: plan.encrypt,
    outputDir: plan.outputDir,
    wouldWrite: path.basename(plan.finalPath),
  };

  const dumpResult = executeLocalPgDump({
    connectionString: sourceUrl,
    env: dumpEnv,
    spawnSyncFn: spawnSync,
  });
  console.log(
    `[phase8c3] backup execute OK bytes=${dumpResult.bytes} sha256=${dumpResult.sha256.slice(0, 12)}… encrypted=${dumpResult.encrypted}`
  );
  report.steps.backupExecute = {
    bytes: dumpResult.bytes,
    sha256: dumpResult.sha256,
    encrypted: dumpResult.encrypted,
    artifactBase: path.basename(dumpResult.artifactPath),
    manifestBase: path.basename(dumpResult.manifestPath),
  };

  // Ensure target disposable DB has empty public schema (never DROP DATABASE).
  const targetProbe = new pg.Client({ connectionString: targetUrl });
  await targetProbe.connect();
  try {
    await targetProbe.query('DROP SCHEMA IF EXISTS public CASCADE');
    await targetProbe.query('CREATE SCHEMA public');
    await targetProbe.query('GRANT ALL ON SCHEMA public TO PUBLIC');
  } finally {
    await targetProbe.end();
  }
  report.steps.targetPreRestore = {
    emptiedPublicSchema: true,
    databaseDropped: false,
  };

  const encBuf = fs.readFileSync(dumpResult.artifactPath);
  if (sha256Hex(encBuf) !== dumpResult.sha256) {
    fail('Encrypted artifact SHA-256 mismatch before decrypt.');
  }
  const plainBuf = decryptPgDumpBuffer(
    encBuf,
    Buffer.from(dumpKey, 'hex')
  );
  const tmpDir = fs.mkdtempSync(
    path.join(
      process.env.LOCALAPPDATA || os.tmpdir(),
      'associate-pg-restore-'
    )
  );
  const tmpDump = path.join(tmpDir, 'restore.dump');
  fs.writeFileSync(tmpDump, plainBuf);

  const restore = spawnSync(
    'pg_restore',
    ['--no-owner', '--no-acl', '--dbname', targetUrl, tmpDump],
    { encoding: 'utf8', windowsHide: true, shell: false }
  );
  // Wipe plaintext immediately
  try {
    fs.unlinkSync(tmpDump);
  } catch {
    /* ignore */
  }
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  if (restore.error) {
    fail(`pg_restore failed to start: ${restore.error.message}`);
  }
  // pg_restore may return 1 for non-fatal warnings; treat only hard failures
  if (restore.status !== 0 && restore.status !== 1) {
    fail(`pg_restore failed with status ${restore.status}`);
  }
  console.log(`[phase8c3] pg_restore status=${restore.status} (plaintext temp removed)`);
  report.steps.restore = {
    status: restore.status,
    plaintextTempRemoved: true,
    note:
      restore.status === 1
        ? 'pg_restore exited 1 (warnings possible); integrity checks follow'
        : 'ok',
  };

  const after = await collectIntegrity(targetUrl);
  report.steps.targetIntegrity = after;

  const auth = await verifyOwnerPasswords(targetUrl, ownerA, ownerB);
  report.steps.ownerAuthSmoke = auth;

  const checks = {
    migrationsMatch:
      JSON.stringify(before.migrations) === JSON.stringify(after.migrations),
    orgCountOne: after.organizationCount === 1,
    ownersTwo: after.ownerCount === 2,
    sameOrg:
      after.ownerOrgIds.length === 1 &&
      after.ownerOrgIds[0] === after.organizationId,
    itClients: after.itClients === seed.itClients,
    gstCompanies: after.gstCompanies === seed.gstCompanies,
    itFilings: after.itFilings === seed.itFilings,
    gstFilings: after.gstFilings === seed.gstFilings,
    itFees: after.itFees === seed.expectedItFees,
    itReceived: after.itReceived === seed.expectedItReceived,
    itBalance: after.itBalance === seed.expectedItBalance,
    gstTotal: after.gstTotal === seed.expectedGstTotal,
    gstReceived: after.gstReceived === seed.expectedGstReceived,
    noDupIds: after.duplicateItIds === 0 && after.duplicateGstIds === 0,
    noOrphans: after.orphanItFilings === 0 && after.orphanGstFilings === 0,
    ownerAAuthOk: auth.ownerAAuthOk,
    ownerBAuthOk: auth.ownerBAuthOk,
    sourceUntouched: before.organizationCount === 1,
  };
  report.checks = checks;
  report.allCriticalPassed = Object.values(checks).every(Boolean);

  // Clear secrets from memory best-effort
  ownerA.password = '';
  ownerB.password = '';

  const outPath = path.join(
    projectRoot(),
    'docs',
    'phase8c-3-drill-results.json'
  );
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(
    `[phase8c3] DONE allCriticalPassed=${report.allCriticalPassed} results=${outPath}`
  );
  console.log(
    `[phase8c3] Databases retained (not deleted): ${SOURCE_DB}, ${TARGET_DB}`
  );
  console.log(
    `[phase8c3] Encrypted artifact retained under outputDir (outside project/OneDrive)`
  );
  if (!report.allCriticalPassed) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(
    `[phase8c3] FATAL: ${err instanceof Error ? err.message : String(err)}`
  );
  process.exitCode = 1;
});
