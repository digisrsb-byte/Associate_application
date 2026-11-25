/**
 * Phase 2 — independent post-import reconciliation (read-only).
 * Compares frozen ledger JSON to PostgreSQL. Counts and aggregates only.
 * Never logs PAN, phone, passwords, ciphertext, or keys.
 *
 * Run via: npm run verify:ledger:pg
 * Requires: DB_VERIFY_CONFIRM=it_gst_management_dev
 */
import 'dotenv/config';
import pg from 'pg';
import { isEncryptedPortalPassword, recordHasPortalPassword } from '../portalCrypto.ts';
import {
  ALLOWED_DB_NAME,
  assertConfirmEnv,
  assertSafeDatabaseTarget,
  redactDatabaseUrl,
  tableExists,
} from './db-safety.mjs';
import { loadFrozenLedger, nearlyEqual, summarizeLedger } from './ledger-pg-shared.mjs';

async function main() {
  assertConfirmEnv('DB_VERIFY_CONFIRM', ALLOWED_DB_NAME);

  const { connectionString, host, database } = assertSafeDatabaseTarget(
    process.env.DATABASE_URL
  );
  console.info(`[verify:ledger] target host=${host} database=${database}`);
  console.info(`[verify:ledger] DATABASE_URL=${redactDatabaseUrl(connectionString)}`);

  const { state, sourcePath, byteLength } = loadFrozenLedger();
  console.info(
    `[verify:ledger] frozenSource=${basename(sourcePath)} bytes=${byteLength}`
  );
  const summary = summarizeLedger(state);

  const client = new pg.Client({ connectionString });
  const failures = [];
  try {
    await client.connect();
    const connectedDb = (await client.query('SELECT current_database() AS db')).rows[0].db;
    if (connectedDb !== ALLOWED_DB_NAME) {
      throw new Error(`Connected database is "${connectedDb}", expected "${ALLOWED_DB_NAME}".`);
    }

    for (const table of [
      'organizations',
      'assessment_years',
      'gst_months',
      'it_clients',
      'it_filings',
      'gst_companies',
      'gst_filings',
    ]) {
      if (!(await tableExists(client, table))) {
        failures.push(`missing table ${table}`);
      }
    }
    if (failures.length) {
      throw new Error(failures.join('; '));
    }

    const orgCount = await scalar(client, 'SELECT COUNT(*)::bigint AS n FROM organizations');
    check(failures, 'organizations count', orgCount, 1);

    const yearCount = await scalar(
      client,
      'SELECT COUNT(*)::bigint AS n FROM assessment_years'
    );
    check(failures, 'assessment_years count', yearCount, summary.counts.assessmentYearsToInsert);

    const monthCount = await scalar(client, 'SELECT COUNT(*)::bigint AS n FROM gst_months');
    check(failures, 'gst_months count', monthCount, summary.counts.gstMonthsToInsert);

    const itCount = await scalar(client, 'SELECT COUNT(*)::bigint AS n FROM it_clients');
    check(failures, 'it_clients count', itCount, summary.counts.clients);

    const itFilingCount = await scalar(client, 'SELECT COUNT(*)::bigint AS n FROM it_filings');
    check(failures, 'it_filings count', itFilingCount, summary.counts.itFilings);

    const gstCount = await scalar(client, 'SELECT COUNT(*)::bigint AS n FROM gst_companies');
    check(failures, 'gst_companies count', gstCount, summary.counts.gstClients);

    const gstFilingCount = await scalar(
      client,
      'SELECT COUNT(*)::bigint AS n FROM gst_filings'
    );
    check(failures, 'gst_filings count', gstFilingCount, summary.counts.gstFilings);

    const itIdsDb = (
      await client.query('SELECT id FROM it_clients ORDER BY id')
    ).rows.map((r) => r.id);
    checkArr(failures, 'it client ids', itIdsDb, summary.itIdsSorted);

    const gstIdsDb = (
      await client.query('SELECT id FROM gst_companies ORDER BY id')
    ).rows.map((r) => r.id);
    checkArr(failures, 'gst company ids', gstIdsDb, summary.gstIdsSorted);

    const yearsDb = (
      await client.query('SELECT label FROM assessment_years ORDER BY label')
    ).rows.map((r) => r.label);
    checkArr(failures, 'assessment year labels', yearsDb, summary.yearLabelsSorted);

    const monthsDb = (
      await client.query('SELECT label FROM gst_months ORDER BY label')
    ).rows.map((r) => r.label);
    checkArr(failures, 'gst month labels', monthsDb, summary.monthLabelsSorted);

    const itFin = await client.query(
      `SELECT COALESCE(SUM(fees),0)::float8 AS fees,
              COALESCE(SUM(received),0)::float8 AS received,
              COALESCE(SUM(balance),0)::float8 AS balance
       FROM it_filings`
    );
    checkNum(failures, 'IT fees sum', itFin.rows[0].fees, summary.finance.itFees);
    checkNum(failures, 'IT received sum', itFin.rows[0].received, summary.finance.itRecv);
    checkNum(failures, 'IT balance sum', itFin.rows[0].balance, summary.finance.itBal);

    const gstFin = await client.query(
      `SELECT COALESCE(SUM(fees),0)::float8 AS fees,
              COALESCE(SUM(interest),0)::float8 AS interest,
              COALESCE(SUM(tax),0)::float8 AS tax,
              COALESCE(SUM(total),0)::float8 AS total
       FROM gst_filings`
    );
    checkNum(failures, 'GST fees sum', gstFin.rows[0].fees, summary.finance.gstFees);
    checkNum(failures, 'GST interest sum', gstFin.rows[0].interest, summary.finance.gstInt);
    checkNum(failures, 'GST tax sum', gstFin.rows[0].tax, summary.finance.gstTax);
    checkNum(failures, 'GST total sum', gstFin.rows[0].total, summary.finance.gstTotal);

    const gstRecv = await scalar(
      client,
      'SELECT COALESCE(SUM(total_received),0)::float8 AS n FROM gst_companies'
    );
    checkNum(failures, 'GST total_received sum', gstRecv, summary.finance.gstRecv);

    const itBalBad = await scalar(
      client,
      `SELECT COUNT(*)::bigint AS n FROM it_filings
       WHERE ABS(balance - GREATEST(0, fees - received)) > 0.000001`
    );
    check(failures, 'IT balance formula mismatches', itBalBad, 0);

    const gstTotBad = await scalar(
      client,
      `SELECT COUNT(*)::bigint AS n FROM gst_filings
       WHERE ABS(total - (fees + interest + tax)) > 0.000001`
    );
    check(failures, 'GST total formula mismatches', gstTotBad, 0);

    const encIt = await scalar(
      client,
      'SELECT COUNT(*)::bigint AS n FROM it_clients WHERE password_enc IS NOT NULL'
    );
    const encGst = await scalar(
      client,
      'SELECT COUNT(*)::bigint AS n FROM gst_companies WHERE password_enc IS NOT NULL'
    );
    const expectedEnc = [...(state.clients || []), ...(state.gstClients || [])].filter(
      (r) => recordHasPortalPassword(r)
    ).length;
    check(failures, 'password_enc non-null count', encIt + encGst, expectedEnc);

    const badPrefix = await scalar(
      client,
      `SELECT COUNT(*)::bigint AS n FROM (
         SELECT password_enc AS p FROM it_clients WHERE password_enc IS NOT NULL
         UNION ALL
         SELECT password_enc FROM gst_companies WHERE password_enc IS NOT NULL
       ) x WHERE p NOT LIKE 'enc:v1:%'`
    );
    check(failures, 'password_enc missing enc:v1: prefix', badPrefix, 0);

    // Spot-check: every non-null password_enc passes isEncryptedPortalPassword (prefix only).
    const sample = await client.query(
      `SELECT password_enc AS p FROM it_clients WHERE password_enc IS NOT NULL
       UNION ALL
       SELECT password_enc FROM gst_companies WHERE password_enc IS NOT NULL`
    );
    let badCryptoShape = 0;
    for (const row of sample.rows) {
      if (!isEncryptedPortalPassword(row.p)) badCryptoShape += 1;
    }
    check(failures, 'password_enc portalCrypto shape', badCryptoShape, 0);

    if (failures.length) {
      console.error('[verify:ledger] FAIL');
      for (const f of failures) console.error(`  - ${f}`);
      process.exitCode = 1;
      return;
    }

    console.info('[verify:ledger] PASS');
    console.info(
      `[verify:ledger] counts matched: it=${summary.counts.clients}/${summary.counts.itFilings} gst=${summary.counts.gstClients}/${summary.counts.gstFilings} years=${summary.counts.assessmentYearsToInsert} months=${summary.counts.gstMonthsToInsert} passwordEnc=${expectedEnc}`
    );
  } finally {
    await client.end().catch(() => {});
  }
}

function basename(p) {
  return String(p).replace(/^.*[\\/]/, '');
}

async function scalar(client, sql) {
  const res = await client.query(sql);
  return Number(res.rows[0].n);
}

function check(failures, label, actual, expected) {
  if (actual !== expected) {
    failures.push(`${label}: got ${actual}, expected ${expected}`);
  }
}

function checkNum(failures, label, actual, expected) {
  if (!nearlyEqual(actual, expected)) {
    failures.push(`${label}: got ${actual}, expected ${expected}`);
  }
}

function checkArr(failures, label, actual, expected) {
  if (actual.length !== expected.length) {
    failures.push(`${label}: length got ${actual.length}, expected ${expected.length}`);
    return;
  }
  for (let i = 0; i < expected.length; i += 1) {
    if (actual[i] !== expected[i]) {
      failures.push(`${label}: mismatch at index ${i}`);
      return;
    }
  }
}

main().catch((err) => {
  console.error(`[verify:ledger] FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
