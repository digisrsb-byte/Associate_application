/**
 * Phase 2 — import frozen ledger JSON into an allowlisted local database.
 * Allowed confirms: it_gst_management_dev | it_gst_management_test | it_gst_management_real_rehearsal.
 * One transaction. Refuses if any business table has rows.
 * Never truncates/deletes. Never modifies the JSON source.
 * Never logs secrets, PAN, phone, or ciphertext.
 *
 * Run via: npm run import:ledger:pg
 * Requires: DB_IMPORT_CONFIRM=it_gst_management_dev|it_gst_management_test|it_gst_management_real_rehearsal
 * Test/rehearsal targets use PG_AUTH_TEST_DATABASE_URL (never DATABASE_URL fallback).
 */
import 'dotenv/config';
import pg from 'pg';
import { loadPortalEncryptionKey } from '../portalCrypto.ts';
import {
  DEFAULT_IMPORT_ORG_NAME,
  IMPORT_ADVISORY_LOCK_KEY1,
  IMPORT_ADVISORY_LOCK_KEY2,
  assertBusinessTablesEmpty,
  redactDatabaseUrl,
  resolveImportVerifyTarget,
} from './db-safety.mjs';
import {
  buildImportRows,
  loadFrozenLedger,
  summarizeLedger,
} from './ledger-pg-shared.mjs';

async function main() {
  const keyStatus = loadPortalEncryptionKey();
  if (!keyStatus.ok) {
    throw new Error(
      `PORTAL_PASSWORD_ENCRYPTION_KEY is ${keyStatus.reason}. Refusing import.`
    );
  }

  const { connectionString, host, database, confirm, clientConfig } =
    resolveImportVerifyTarget('DB_IMPORT_CONFIRM');

  console.info(
    `[import:ledger] target host=${host} database=${database} confirm=${confirm}`
  );
  console.info(`[import:ledger] url=${redactDatabaseUrl(connectionString)}`);

  const { state, sourcePath, byteLength } = loadFrozenLedger();
  console.info(
    `[import:ledger] frozenSource=${pathBasename(sourcePath)} bytes=${byteLength}`
  );

  const summary = summarizeLedger(state);
  console.info(
    `[import:ledger] preflight counts clients=${summary.counts.clients} itFilings=${summary.counts.itFilings} gstClients=${summary.counts.gstClients} gstFilings=${summary.counts.gstFilings} gstPayments=${summary.counts.gstPayments} years=${summary.counts.assessmentYearsToInsert} months=${summary.counts.gstMonthsToInsert} passwordEncExpected=${summary.counts.passwordEncExpected}`
  );

  const orgName = (process.env.IMPORT_ORG_NAME || DEFAULT_IMPORT_ORG_NAME).trim();
  if (!orgName) throw new Error('IMPORT_ORG_NAME must be non-empty when set.');

  const rows = buildImportRows(state, keyStatus.key, orgName);
  if (rows.passwordEncNonNull !== summary.counts.passwordEncExpected) {
    throw new Error(
      `password_enc count mismatch before insert (built=${rows.passwordEncNonNull} expected=${summary.counts.passwordEncExpected}).`
    );
  }

  const client = new pg.Client(clientConfig);
  try {
    await client.connect();
    const connectedDb = (await client.query('SELECT current_database() AS db')).rows[0].db;
    if (connectedDb !== confirm) {
      throw new Error(
        `Connected database is "${connectedDb}", expected "${confirm}".`
      );
    }

    await client.query('BEGIN');
    try {
      // Transaction-scoped lock: concurrent imports wait; released on COMMIT/ROLLBACK.
      await client.query('SELECT pg_advisory_xact_lock($1, $2)', [
        IMPORT_ADVISORY_LOCK_KEY1,
        IMPORT_ADVISORY_LOCK_KEY2,
      ]);
      await assertBusinessTablesEmpty(client);

      const orgRes = await client.query(
        `INSERT INTO organizations (name) VALUES ($1) RETURNING id`,
        [rows.organizationName]
      );
      const organizationId = orgRes.rows[0].id;

      for (const label of rows.yearLabels) {
        await client.query(
          `INSERT INTO assessment_years (organization_id, label) VALUES ($1, $2)`,
          [organizationId, label]
        );
      }
      for (const label of rows.monthLabels) {
        await client.query(
          `INSERT INTO gst_months (organization_id, label) VALUES ($1, $2)`,
          [organizationId, label]
        );
      }

      for (const c of rows.itClients) {
        await client.query(
          `INSERT INTO it_clients (
             id, organization_id, name, pan, phone, reference_number, remark,
             other_mobiles, name_variants, password_enc, created_at, updated_at, row_version
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,1
           )`,
          [
            c.id,
            organizationId,
            c.name,
            c.pan,
            c.phone,
            c.reference_number,
            c.remark,
            c.other_mobiles,
            c.name_variants,
            c.password_enc,
            c.created_at,
            c.updated_at,
          ]
        );
      }

      for (const f of rows.itFilings) {
        await client.query(
          `INSERT INTO it_filings (
             organization_id, it_client_id, assessment_year, filing_date,
             fees, received, balance, payment_type, payment_receive_date
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            organizationId,
            f.it_client_id,
            f.assessment_year,
            f.filing_date,
            f.fees,
            f.received,
            f.balance,
            f.payment_type,
            f.payment_receive_date,
          ]
        );
      }

      for (const c of rows.gstCompanies) {
        await client.query(
          `INSERT INTO gst_companies (
             id, organization_id, company_name, portal_user_id, phone, reference_number,
             remark, total_received, unallocated_received, password_enc,
             created_at, updated_at, row_version
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,1
           )`,
          [
            c.id,
            organizationId,
            c.company_name,
            c.portal_user_id,
            c.phone,
            c.reference_number,
            c.remark,
            c.total_received,
            c.unallocated_received,
            c.password_enc,
            c.created_at,
            c.updated_at,
          ]
        );
      }

      for (const f of rows.gstFilings) {
        await client.query(
          `INSERT INTO gst_filings (
             organization_id, gst_company_id, month, fees, interest, tax, total,
             payments_present, legacy_received
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            organizationId,
            f.gst_company_id,
            f.month,
            f.fees,
            f.interest,
            f.tax,
            f.total,
            f.payments_present === true,
            f.legacy_received,
          ]
        );
      }

      for (const p of rows.gstPayments) {
        await client.query(
          `INSERT INTO gst_payments (
             id, organization_id, gst_company_id, month, amount, payment_date,
             payment_mode, reference, idempotency_key, created_at, updated_at
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
           )`,
          [
            p.id,
            organizationId,
            p.gst_company_id,
            p.month,
            p.amount,
            p.payment_date,
            p.payment_mode,
            p.reference,
            p.idempotency_key,
            p.created_at,
            p.updated_at,
          ]
        );
      }

      // In-transaction count checks (no PII).
      const checks = {
        organizations: await count(client, 'organizations'),
        assessment_years: await count(client, 'assessment_years'),
        gst_months: await count(client, 'gst_months'),
        it_clients: await count(client, 'it_clients'),
        it_filings: await count(client, 'it_filings'),
        gst_companies: await count(client, 'gst_companies'),
        gst_filings: await count(client, 'gst_filings'),
        gst_payments: await count(client, 'gst_payments'),
        password_enc_it: await countWhere(
          client,
          'it_clients',
          'password_enc IS NOT NULL'
        ),
        password_enc_gst: await countWhere(
          client,
          'gst_companies',
          'password_enc IS NOT NULL'
        ),
      };

      assertEq(checks.organizations, 1, 'organizations');
      assertEq(checks.assessment_years, rows.yearLabels.length, 'assessment_years');
      assertEq(checks.gst_months, rows.monthLabels.length, 'gst_months');
      assertEq(checks.it_clients, rows.itClients.length, 'it_clients');
      assertEq(checks.it_filings, rows.itFilings.length, 'it_filings');
      assertEq(checks.gst_companies, rows.gstCompanies.length, 'gst_companies');
      assertEq(checks.gst_filings, rows.gstFilings.length, 'gst_filings');
      assertEq(checks.gst_payments, rows.gstPayments.length, 'gst_payments');
      assertEq(
        checks.password_enc_it + checks.password_enc_gst,
        rows.passwordEncNonNull,
        'password_enc non-null'
      );

      const badEnc = await client.query(
        `SELECT COUNT(*)::bigint AS n FROM (
           SELECT password_enc AS p FROM it_clients WHERE password_enc IS NOT NULL
           UNION ALL
           SELECT password_enc FROM gst_companies WHERE password_enc IS NOT NULL
         ) x WHERE p NOT LIKE 'enc:v1:%'`
      );
      if (Number(badEnc.rows[0].n) > 0) {
        throw new Error('Found password_enc values without enc:v1: prefix.');
      }

      await client.query('COMMIT');
      console.info(
        `[import:ledger] COMMIT ok orgRows=1 itClients=${checks.it_clients} itFilings=${checks.it_filings} gstCompanies=${checks.gst_companies} gstFilings=${checks.gst_filings} gstPayments=${checks.gst_payments} years=${checks.assessment_years} months=${checks.gst_months} passwordEnc=${checks.password_enc_it + checks.password_enc_gst}`
      );
      console.info(
        '[import:ledger] Application storage is unchanged (JSON). Run npm run verify:ledger:pg next.'
      );
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  } finally {
    await client.end().catch(() => {});
  }
}

function pathBasename(p) {
  return String(p).replace(/^.*[\\/]/, '');
}

async function count(client, table) {
  const res = await client.query(`SELECT COUNT(*)::bigint AS n FROM ${table}`);
  return Number(res.rows[0].n);
}

async function countWhere(client, table, whereSql) {
  const res = await client.query(
    `SELECT COUNT(*)::bigint AS n FROM ${table} WHERE ${whereSql}`
  );
  return Number(res.rows[0].n);
}

function assertEq(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`In-TX verify failed for ${label}: got ${actual}, expected ${expected}.`);
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[import:ledger] FAILED: ${msg}`);
  process.exitCode = 1;
});
