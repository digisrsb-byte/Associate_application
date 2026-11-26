/**
 * Phase 2 — independent post-import reconciliation (read-only).
 * Compares frozen ledger JSON to PostgreSQL. Counts and aggregates only.
 * Never logs PAN, phone, passwords, ciphertext, or keys.
 *
 * Run via: npm run verify:ledger:pg
 * Requires: DB_VERIFY_CONFIRM=it_gst_management_dev|it_gst_management_test|it_gst_management_real_rehearsal
 * Test/rehearsal targets use PG_AUTH_TEST_DATABASE_URL (never DATABASE_URL fallback).
 */
import 'dotenv/config';
import pg from 'pg';
import { isEncryptedPortalPassword, recordHasPortalPassword } from '../portalCrypto.ts';
import {
  redactDatabaseUrl,
  resolveImportVerifyTarget,
  tableExists,
} from './db-safety.mjs';
import {
  buildImportRows,
  diffGstFilingReceivedModeRows,
  diffGstPaymentRows,
  loadFrozenLedger,
  nearlyEqual,
  summarizeLedger,
} from './ledger-pg-shared.mjs';
import { loadPortalEncryptionKey } from '../portalCrypto.ts';

async function main() {
  const { connectionString, host, database, confirm, clientConfig } =
    resolveImportVerifyTarget('DB_VERIFY_CONFIRM');
  console.info(
    `[verify:ledger] target host=${host} database=${database} confirm=${confirm}`
  );
  console.info(`[verify:ledger] url=${redactDatabaseUrl(connectionString)}`);

  const { state, sourcePath, byteLength } = loadFrozenLedger();
  console.info(
    `[verify:ledger] frozenSource=${basename(sourcePath)} bytes=${byteLength}`
  );
  const summary = summarizeLedger(state);

  const client = new pg.Client(clientConfig);
  const failures = [];
  try {
    await client.connect();
    const connectedDb = (await client.query('SELECT current_database() AS db')).rows[0].db;
    if (connectedDb !== confirm) {
      throw new Error(
        `Connected database is "${connectedDb}", expected "${confirm}".`
      );
    }

    for (const table of [
      'organizations',
      'assessment_years',
      'gst_months',
      'it_clients',
      'it_filings',
      'gst_companies',
      'gst_filings',
      'gst_payments',
    ]) {
      if (!(await tableExists(client, table))) {
        failures.push(`missing table ${table}`);
      }
    }
    if (failures.length) {
      throw new Error(failures.join('; '));
    }

    const keyStatus = loadPortalEncryptionKey();
    if (!keyStatus.ok) {
      throw new Error(
        `PORTAL_PASSWORD_ENCRYPTION_KEY is ${keyStatus.reason}. Refusing verify.`
      );
    }
    const expectedRows = buildImportRows(state, keyStatus.key, 'verify-org');

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

    const gstPaymentCount = await scalar(
      client,
      'SELECT COUNT(*)::bigint AS n FROM gst_payments'
    );
    check(failures, 'gst_payments count', gstPaymentCount, summary.counts.gstPayments);

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
    // Compare as locale-normalized sets — PG ORDER BY collation can differ from
    // JS Array.sort (e.g. case-insensitive vs ASCII), without changing membership.
    checkLabelSet(
      failures,
      'assessment year labels',
      yearsDb,
      summary.yearLabelsSorted
    );

    const monthsDb = (
      await client.query('SELECT label FROM gst_months ORDER BY label')
    ).rows.map((r) => r.label);
    checkLabelSet(
      failures,
      'gst month labels',
      monthsDb,
      summary.monthLabelsSorted
    );

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
              COALESCE(SUM(total),0)::float8 AS total,
              COALESCE(SUM(legacy_received),0)::float8 AS legacy_received,
              COUNT(*) FILTER (WHERE payments_present)::bigint AS payments_present_true,
              COUNT(*) FILTER (WHERE legacy_received IS NOT NULL)::bigint AS legacy_received_present
       FROM gst_filings`
    );
    checkNum(failures, 'GST fees sum', gstFin.rows[0].fees, summary.finance.gstFees);
    checkNum(failures, 'GST interest sum', gstFin.rows[0].interest, summary.finance.gstInt);
    checkNum(failures, 'GST tax sum', gstFin.rows[0].tax, summary.finance.gstTax);
    checkNum(failures, 'GST total sum', gstFin.rows[0].total, summary.finance.gstTotal);
    checkNum(
      failures,
      'GST legacy_received sum',
      gstFin.rows[0].legacy_received,
      summary.finance.gstLegacyReceivedSum
    );
    check(
      failures,
      'GST payments_present true count',
      Number(gstFin.rows[0].payments_present_true),
      summary.counts.gstPaymentsPresentTrue
    );
    check(
      failures,
      'GST legacy_received present count',
      Number(gstFin.rows[0].legacy_received_present),
      summary.counts.gstLegacyReceivedPresent
    );

    const filingModeRowsDb = (
      await client.query(
        `SELECT gst_company_id, month, payments_present,
                legacy_received::float8 AS legacy_received
         FROM gst_filings
         ORDER BY gst_company_id, month`
      )
    ).rows.map((r) => ({
      gst_company_id: String(r.gst_company_id),
      month: String(r.month),
      payments_present: Boolean(r.payments_present),
      legacy_received:
        r.legacy_received == null ? null : Number(r.legacy_received),
    }));
    for (const f of diffGstFilingReceivedModeRows(
      expectedRows.gstFilings,
      filingModeRowsDb
    )) {
      failures.push(f);
    }

    const gstRecv = await scalar(
      client,
      'SELECT COALESCE(SUM(total_received),0)::float8 AS n FROM gst_companies'
    );
    checkNum(failures, 'GST total_received sum', gstRecv, summary.finance.gstRecv);

    const gstUnallocated = await scalar(
      client,
      'SELECT COALESCE(SUM(unallocated_received),0)::float8 AS n FROM gst_companies'
    );
    checkNum(
      failures,
      'GST unallocated_received sum',
      gstUnallocated,
      summary.finance.gstUnallocated
    );

    const gstPaymentSum = await scalar(
      client,
      'SELECT COALESCE(SUM(amount),0)::float8 AS n FROM gst_payments'
    );
    checkNum(
      failures,
      'GST payment amount sum',
      gstPaymentSum,
      summary.finance.gstPaymentAmountSum
    );

    const paymentRowsDb = (
      await client.query(
        `SELECT id, gst_company_id, month, amount::float8 AS amount,
                payment_date, payment_mode, reference, idempotency_key,
                created_at, updated_at
         FROM gst_payments
         ORDER BY id`
      )
    ).rows.map((r) => ({
      id: String(r.id),
      gst_company_id: String(r.gst_company_id),
      month: String(r.month),
      amount: Number(r.amount),
      payment_date: String(r.payment_date || ''),
      payment_mode: String(r.payment_mode || ''),
      reference: r.reference == null ? null : String(r.reference),
      idempotency_key:
        r.idempotency_key == null ? null : String(r.idempotency_key),
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));

    for (const f of diffGstPaymentRows(expectedRows.gstPayments, paymentRowsDb)) {
      failures.push(f);
    }

    // Per-company payment amount + unallocated reconciliation (counts only / money).
    const perCompanyDb = await client.query(
      `SELECT c.id,
              c.total_received::float8 AS total_received,
              c.unallocated_received::float8 AS unallocated_received,
              COALESCE(p.payment_count, 0)::bigint AS payment_count,
              COALESCE(p.payment_sum, 0)::float8 AS payment_sum
       FROM gst_companies c
       LEFT JOIN (
         SELECT gst_company_id,
                COUNT(*)::bigint AS payment_count,
                COALESCE(SUM(amount),0)::float8 AS payment_sum
         FROM gst_payments
         GROUP BY gst_company_id
       ) p ON p.gst_company_id = c.id
       ORDER BY c.id`
    );
    for (const row of perCompanyDb.rows) {
      const exp = summary.perCompany[row.id];
      if (!exp) {
        failures.push(`gst company unexpected in DB id=${row.id}`);
        continue;
      }
      check(
        failures,
        `gst company ${row.id} payment count`,
        Number(row.payment_count),
        exp.paymentCount
      );
      checkNum(
        failures,
        `gst company ${row.id} payment sum`,
        Number(row.payment_sum),
        exp.paymentAmountSum
      );
      checkNum(
        failures,
        `gst company ${row.id} unallocated_received`,
        Number(row.unallocated_received),
        exp.unallocated
      );
      checkNum(
        failures,
        `gst company ${row.id} total_received`,
        Number(row.total_received),
        exp.totalReceived
      );
      if (exp.usesPaymentAccounting) {
        const allocatedPlusUnallocated =
          Number(row.payment_sum) + Number(row.unallocated_received);
        checkNum(
          failures,
          `gst company ${row.id} totalReceived vs allocated+unallocated`,
          Number(row.total_received),
          allocatedPlusUnallocated
        );
      }
    }

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
      `[verify:ledger] counts matched: it=${summary.counts.clients}/${summary.counts.itFilings} gst=${summary.counts.gstClients}/${summary.counts.gstFilings} gstPayments=${summary.counts.gstPayments} years=${summary.counts.assessmentYearsToInsert} months=${summary.counts.gstMonthsToInsert} passwordEnc=${expectedEnc}`
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

/** Case/base-insensitive label membership compare (avoids PG vs JS sort drift). */
function checkLabelSet(failures, label, actual, expected) {
  const norm = (arr) =>
    [...arr]
      .map((x) => String(x))
      .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  const a = norm(actual);
  const e = norm(expected);
  if (a.length !== e.length) {
    failures.push(`${label}: length got ${a.length}, expected ${e.length}`);
    return;
  }
  for (let i = 0; i < e.length; i += 1) {
    if (a[i].localeCompare(e[i], 'en', { sensitivity: 'base' }) !== 0) {
      failures.push(`${label}: mismatch at index ${i}`);
      return;
    }
  }
}

main().catch((err) => {
  console.error(`[verify:ledger] FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
