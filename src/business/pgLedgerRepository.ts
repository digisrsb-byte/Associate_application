/**
 * Organization-scoped PostgreSQL ledger load/save (Phase 4 / 4B).
 * Maps between LedgerState and foundation schema (001).
 * Full-ledger replace in one transaction with optimistic revision checks
 * and an organization advisory lock to prevent lost updates.
 * Never log PAN, phones, passwords, or ciphertext.
 */
import crypto from 'crypto';
import type {
  ClientRecord,
  FilingRecord,
  GstClientRecord,
  GstMonthlyFiling,
  GstPaymentEntry,
  LedgerState,
} from '../types/ledger.ts';
import type { DbPool } from '../db/passwordResetStore.ts';

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string {
  return v == null ? '' : String(v);
}

export class LedgerConflictError extends Error {
  readonly code = 'LEDGER_CONFLICT';
  constructor(message = 'Ledger was modified by another session. Retry required.') {
    super(message);
    this.name = 'LedgerConflictError';
  }
}

export type LedgerSnapshot = {
  ledger: LedgerState;
  /** Opaque revision of org-scoped business rows at load time. */
  revision: string;
};

type QueryClient = {
  query: (
    text: string,
    values?: unknown[]
  ) => Promise<{ rowCount: number | null; rows: Record<string, unknown>[] }>;
};

/** Stable fingerprint of all org-scoped business rows (no migration required). */
export async function computeLedgerRevision(
  client: QueryClient,
  organizationId: string
): Promise<string> {
  const res = await client.query(
    `SELECT COALESCE(string_agg(part, '|' ORDER BY part), '') AS fingerprint
     FROM (
       SELECT 'ay:' || label AS part
         FROM assessment_years WHERE organization_id = $1::uuid
       UNION ALL
       SELECT 'gm:' || label
         FROM gst_months WHERE organization_id = $1::uuid
       UNION ALL
       SELECT 'it:' || id || ':' || EXTRACT(EPOCH FROM updated_at)::text
         FROM it_clients WHERE organization_id = $1::uuid
       UNION ALL
       SELECT 'itf:' || it_client_id || ':' || assessment_year || ':' ||
              fees::text || ':' || received::text || ':' || balance::text || ':' ||
              payment_type || ':' || payment_receive_date || ':' || filing_date
         FROM it_filings WHERE organization_id = $1::uuid
       UNION ALL
       SELECT 'gst:' || id || ':' || EXTRACT(EPOCH FROM updated_at)::text || ':' ||
              total_received::text || ':' || unallocated_received::text
         FROM gst_companies WHERE organization_id = $1::uuid
       UNION ALL
       SELECT 'gf:' || gst_company_id || ':' || month || ':' ||
              fees::text || ':' || interest::text || ':' || tax::text || ':' || total::text || ':' ||
              payments_present::text || ':' || COALESCE(legacy_received::text, '')
         FROM gst_filings WHERE organization_id = $1::uuid
       UNION ALL
       SELECT 'gp:' || id || ':' || gst_company_id || ':' || month || ':' ||
              amount::text || ':' || payment_date || ':' || payment_mode || ':' ||
              COALESCE(reference, '') || ':' || COALESCE(idempotency_key, '') || ':' ||
              EXTRACT(EPOCH FROM created_at)::text || ':' ||
              COALESCE(EXTRACT(EPOCH FROM updated_at)::text, '')
         FROM gst_payments WHERE organization_id = $1::uuid
     ) parts`,
    [organizationId]
  );
  const fingerprint = String(res.rows[0]?.fingerprint ?? '');
  return crypto.createHash('sha256').update(fingerprint).digest('hex');
}

async function lockOrganization(
  client: QueryClient,
  organizationId: string
): Promise<void> {
  const org = await client.query(
    `SELECT id FROM organizations WHERE id = $1::uuid FOR UPDATE`,
    [organizationId]
  );
  if (!org.rowCount) {
    throw new Error('Organization not found for business-data scope.');
  }
  // Extra serialization key derived from org UUID (stable; no secrets logged).
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtext($1::text), hashtext($1::text || ':biz'))`,
    [organizationId]
  );
}

function paymentFilingKey(companyId: string, month: string): string {
  return `${companyId}\0${month}`;
}

function mapPaymentRow(row: Record<string, unknown>): GstPaymentEntry {
  const entry: GstPaymentEntry = {
    id: str(row.id),
    amount: num(row.amount),
    paymentDate: str(row.payment_date),
    paymentMode: str(row.payment_mode),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
  if (row.reference != null && str(row.reference)) {
    entry.reference = str(row.reference);
  }
  if (row.idempotency_key != null && str(row.idempotency_key)) {
    entry.idempotencyKey = str(row.idempotency_key);
  }
  if (row.updated_at != null && str(row.updated_at)) {
    entry.updatedAt = new Date(String(row.updated_at)).toISOString();
  }
  return entry;
}

function mapLedgerFromRows(args: {
  years: Record<string, unknown>[];
  months: Record<string, unknown>[];
  itClients: Record<string, unknown>[];
  itFilings: Record<string, unknown>[];
  gstCompanies: Record<string, unknown>[];
  gstFilings: Record<string, unknown>[];
  gstPayments: Record<string, unknown>[];
}): LedgerState {
  const filingsByClient = new Map<string, Record<string, FilingRecord>>();
  for (const row of args.itFilings) {
    const cid = String(row.it_client_id);
    const year = String(row.assessment_year);
    const map = filingsByClient.get(cid) || {};
    map[year] = {
      assessmentYear: year,
      filingDate: str(row.filing_date),
      fees: num(row.fees),
      received: num(row.received),
      balance: num(row.balance),
      paymentType: str(row.payment_type),
      paymentReceiveDate: str(row.payment_receive_date),
    };
    filingsByClient.set(cid, map);
  }

  const clients: ClientRecord[] = args.itClients.map((row) => {
    const id = String(row.id);
    const rec: ClientRecord = {
      id,
      name: str(row.name),
      pan: str(row.pan),
      phone: str(row.phone),
      referenceNumber: str(row.reference_number),
      filings: filingsByClient.get(id) || {},
      createdAt: new Date(String(row.created_at)).toISOString(),
      updatedAt: new Date(String(row.updated_at)).toISOString(),
    };
    if (row.remark != null) rec.remark = str(row.remark);
    if (row.other_mobiles != null) rec.otherMobiles = str(row.other_mobiles);
    if (row.name_variants != null) rec.nameVariants = str(row.name_variants);
    if (row.password_enc != null && str(row.password_enc)) {
      rec.passwordEnc = str(row.password_enc);
    }
    return rec;
  });

  const paymentsByFiling = new Map<string, GstPaymentEntry[]>();
  for (const row of args.gstPayments) {
    const key = paymentFilingKey(String(row.gst_company_id), String(row.month));
    const list = paymentsByFiling.get(key) || [];
    list.push(mapPaymentRow(row));
    paymentsByFiling.set(key, list);
  }
  for (const list of paymentsByFiling.values()) {
    list.sort((a, b) => {
      const byCreated = a.createdAt.localeCompare(b.createdAt);
      if (byCreated !== 0) return byCreated;
      return a.id.localeCompare(b.id);
    });
  }

  const filingsByGst = new Map<string, Record<string, GstMonthlyFiling>>();
  for (const row of args.gstFilings) {
    const cid = String(row.gst_company_id);
    const month = String(row.month);
    const map = filingsByGst.get(cid) || {};
    const paymentsPresent = Boolean(row.payments_present);
    const filing: GstMonthlyFiling = {
      month,
      fees: num(row.fees),
      interest: num(row.interest),
      tax: num(row.tax),
      total: num(row.total),
    };
    if (paymentsPresent) {
      // Always return an array (including []) so consumers detect payment mode.
      const payments = paymentsByFiling.get(paymentFilingKey(cid, month)) || [];
      filing.payments = payments;
      filing.received = payments.reduce(
        (sum, p) => sum + Math.max(0, Number(p.amount) || 0),
        0
      );
    } else if (row.legacy_received != null && row.legacy_received !== '') {
      filing.received = num(row.legacy_received);
    }
    map[month] = filing;
    filingsByGst.set(cid, map);
  }

  const gstClients: GstClientRecord[] = args.gstCompanies.map((row) => {
    const id = String(row.id);
    const rec: GstClientRecord = {
      id,
      companyName: str(row.company_name),
      userId: str(row.portal_user_id),
      phone: str(row.phone),
      referenceNumber: str(row.reference_number),
      totalReceived: num(row.total_received),
      filings: filingsByGst.get(id) || {},
      createdAt: new Date(String(row.created_at)).toISOString(),
      updatedAt: new Date(String(row.updated_at)).toISOString(),
    };
    if (row.remark != null) rec.remark = str(row.remark);
    if (row.password_enc != null && str(row.password_enc)) {
      rec.passwordEnc = str(row.password_enc);
    }
    const unallocated = num(row.unallocated_received);
    if (unallocated !== 0) {
      rec.unallocatedReceived = unallocated;
    }
    return rec;
  });

  return {
    assessmentYears: args.years.map((r) => String(r.label)),
    clients,
    gstMonths: args.months.map((r) => String(r.label)),
    gstClients,
  };
}

async function readLedgerRows(
  client: QueryClient,
  organizationId: string
): Promise<LedgerState> {
  const years = await client.query(
    `SELECT label FROM assessment_years
     WHERE organization_id = $1::uuid
     ORDER BY label`,
    [organizationId]
  );
  const months = await client.query(
    `SELECT label FROM gst_months
     WHERE organization_id = $1::uuid
     ORDER BY label`,
    [organizationId]
  );
  const itClients = await client.query(
    `SELECT id, name, pan, phone, reference_number, remark, other_mobiles,
            name_variants, password_enc, created_at, updated_at
     FROM it_clients
     WHERE organization_id = $1::uuid
     ORDER BY id`,
    [organizationId]
  );
  const itFilings = await client.query(
    `SELECT it_client_id, assessment_year, filing_date, fees, received, balance,
            payment_type, payment_receive_date
     FROM it_filings
     WHERE organization_id = $1::uuid`,
    [organizationId]
  );
  const gstCompanies = await client.query(
    `SELECT id, company_name, portal_user_id, phone, reference_number, remark,
            total_received, unallocated_received, password_enc, created_at, updated_at
     FROM gst_companies
     WHERE organization_id = $1::uuid
     ORDER BY id`,
    [organizationId]
  );
  const gstFilings = await client.query(
    `SELECT gst_company_id, month, fees, interest, tax, total,
            payments_present, legacy_received
     FROM gst_filings
     WHERE organization_id = $1::uuid`,
    [organizationId]
  );
  const gstPayments = await client.query(
    `SELECT id, gst_company_id, month, amount, payment_date, payment_mode,
            reference, idempotency_key, created_at, updated_at
     FROM gst_payments
     WHERE organization_id = $1::uuid
     ORDER BY created_at, id`,
    [organizationId]
  );

  return mapLedgerFromRows({
    years: years.rows,
    months: months.rows,
    itClients: itClients.rows,
    itFilings: itFilings.rows,
    gstCompanies: gstCompanies.rows,
    gstFilings: gstFilings.rows,
    gstPayments: gstPayments.rows,
  });
}

/**
 * Load the full shared ledger for one organization, with a revision token.
 * Always filters by organization_id — never trusts a client-supplied org.
 */
export async function loadLedgerSnapshot(
  pool: DbPool,
  organizationId: string
): Promise<LedgerSnapshot> {
  const client = await pool.connect();
  try {
    const ledger = await readLedgerRows(client, organizationId);
    const revision = await computeLedgerRevision(client, organizationId);
    return { ledger, revision };
  } finally {
    client.release();
  }
}

/** Convenience wrapper — ledger only (revision discarded). */
export async function loadLedgerForOrganization(
  pool: DbPool,
  organizationId: string
): Promise<LedgerState> {
  const snap = await loadLedgerSnapshot(pool, organizationId);
  return snap.ledger;
}

async function replaceLedgerRows(
  client: QueryClient,
  organizationId: string,
  state: LedgerState
): Promise<void> {
  await client.query(
    `DELETE FROM gst_payments WHERE organization_id = $1::uuid`,
    [organizationId]
  );
  await client.query(`DELETE FROM gst_filings WHERE organization_id = $1::uuid`, [
    organizationId,
  ]);
  await client.query(`DELETE FROM it_filings WHERE organization_id = $1::uuid`, [
    organizationId,
  ]);
  await client.query(
    `DELETE FROM gst_companies WHERE organization_id = $1::uuid`,
    [organizationId]
  );
  await client.query(`DELETE FROM it_clients WHERE organization_id = $1::uuid`, [
    organizationId,
  ]);
  await client.query(`DELETE FROM gst_months WHERE organization_id = $1::uuid`, [
    organizationId,
  ]);
  await client.query(
    `DELETE FROM assessment_years WHERE organization_id = $1::uuid`,
    [organizationId]
  );

  const yearLabels = new Set<string>(state.assessmentYears || []);
  for (const c of state.clients || []) {
    for (const y of Object.keys(c.filings || {})) yearLabels.add(y);
  }
  for (const label of yearLabels) {
    const trimmed = label.trim();
    if (!trimmed) continue;
    await client.query(
      `INSERT INTO assessment_years (organization_id, label) VALUES ($1::uuid, $2)`,
      [organizationId, trimmed]
    );
  }

  const monthLabels = new Set<string>(state.gstMonths || []);
  for (const c of state.gstClients || []) {
    for (const m of Object.keys(c.filings || {})) monthLabels.add(m);
  }
  for (const label of monthLabels) {
    const trimmed = label.trim();
    if (!trimmed) continue;
    await client.query(
      `INSERT INTO gst_months (organization_id, label) VALUES ($1::uuid, $2)`,
      [organizationId, trimmed]
    );
  }

  for (const c of state.clients || []) {
    await client.query(
      `INSERT INTO it_clients (
         id, organization_id, name, pan, phone, reference_number, remark,
         other_mobiles, name_variants, password_enc, created_at, updated_at
       ) VALUES (
         $1, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10,
         $11::timestamptz, $12::timestamptz
       )`,
      [
        c.id,
        organizationId,
        c.name,
        c.pan,
        c.phone || '',
        c.referenceNumber || '',
        c.remark ?? null,
        c.otherMobiles ?? null,
        c.nameVariants ?? null,
        c.passwordEnc && String(c.passwordEnc).trim() ? c.passwordEnc : null,
        c.createdAt || new Date().toISOString(),
        c.updatedAt || new Date().toISOString(),
      ]
    );
    for (const [year, f] of Object.entries(c.filings || {})) {
      await client.query(
        `INSERT INTO it_filings (
           organization_id, it_client_id, assessment_year, filing_date,
           fees, received, balance, payment_type, payment_receive_date
         ) VALUES (
           $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9
         )`,
        [
          organizationId,
          c.id,
          year,
          f.filingDate || '',
          f.fees || 0,
          f.received || 0,
          f.balance || 0,
          f.paymentType || '',
          f.paymentReceiveDate || '',
        ]
      );
    }
  }

  for (const c of state.gstClients || []) {
    await client.query(
      `INSERT INTO gst_companies (
         id, organization_id, company_name, portal_user_id, phone,
         reference_number, remark, total_received, unallocated_received,
         password_enc, created_at, updated_at
       ) VALUES (
         $1, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10,
         $11::timestamptz, $12::timestamptz
       )`,
      [
        c.id,
        organizationId,
        c.companyName,
        c.userId || '',
        c.phone || '',
        c.referenceNumber || '',
        c.remark ?? null,
        c.totalReceived || 0,
        Math.max(0, Number(c.unallocatedReceived) || 0),
        c.passwordEnc && String(c.passwordEnc).trim() ? c.passwordEnc : null,
        c.createdAt || new Date().toISOString(),
        c.updatedAt || new Date().toISOString(),
      ]
    );
    for (const [month, f] of Object.entries(c.filings || {})) {
      const paymentsPresent = Array.isArray(f.payments);
      let legacyReceived: number | null = null;
      if (!paymentsPresent && f.received != null && Number.isFinite(Number(f.received))) {
        legacyReceived = Math.max(0, Number(f.received));
      }
      await client.query(
        `INSERT INTO gst_filings (
           organization_id, gst_company_id, month, fees, interest, tax, total,
           payments_present, legacy_received
         ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          organizationId,
          c.id,
          month,
          f.fees || 0,
          f.interest || 0,
          f.tax || 0,
          f.total || 0,
          paymentsPresent,
          legacyReceived,
        ]
      );
      if (!paymentsPresent) continue;
      for (const p of f.payments || []) {
        const paymentId = String(p?.id || '').trim();
        if (!paymentId) {
          throw new Error('GST payment id is required for PostgreSQL persistence.');
        }
        await client.query(
          `INSERT INTO gst_payments (
             id, organization_id, gst_company_id, month, amount, payment_date,
             payment_mode, reference, idempotency_key, created_at, updated_at
           ) VALUES (
             $1, $2::uuid, $3, $4, $5, $6, $7, $8, $9,
             $10::timestamptz, $11::timestamptz
           )`,
          [
            paymentId,
            organizationId,
            c.id,
            month,
            Math.max(0, Number(p.amount) || 0),
            p.paymentDate || '',
            p.paymentMode || '',
            p.reference != null && String(p.reference).trim()
              ? String(p.reference)
              : null,
            p.idempotencyKey != null && String(p.idempotencyKey).trim()
              ? String(p.idempotencyKey)
              : null,
            p.createdAt || new Date().toISOString(),
            p.updatedAt ? p.updatedAt : null,
          ]
        );
      }
    }
  }
}

export type SaveLedgerOptions = {
  /**
   * Required for safe concurrent writes. When set, save fails with
   * LedgerConflictError if the DB revision no longer matches.
   */
  expectedRevision: string;
};

/**
 * Replace all business rows for one organization with the given ledger state.
 * Uses FOR UPDATE on the organization row + advisory lock + revision check.
 */
export async function saveLedgerForOrganization(
  pool: DbPool,
  organizationId: string,
  state: LedgerState,
  options: SaveLedgerOptions
): Promise<{ revision: string }> {
  if (!options || typeof options.expectedRevision !== 'string') {
    throw new Error(
      'saveLedgerForOrganization requires expectedRevision (optimistic concurrency).'
    );
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    try {
      await lockOrganization(client, organizationId);
      const currentRevision = await computeLedgerRevision(client, organizationId);
      if (currentRevision !== options.expectedRevision) {
        throw new LedgerConflictError();
      }

      await replaceLedgerRows(client, organizationId, state);
      const revision = await computeLedgerRevision(client, organizationId);
      await client.query('COMMIT');
      return { revision };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  } finally {
    client.release();
  }
}

/**
 * Load → mutate → save with automatic retry on conflict.
 * Mutator is re-applied against a fresh clone on each attempt so independent
 * concurrent edits survive (lost-update safe for full-ledger replace).
 */
export async function mutateLedgerForOrganization(
  pool: DbPool,
  organizationId: string,
  mutator: (ledger: LedgerState) => LedgerState | Promise<LedgerState>,
  options?: { maxAttempts?: number }
): Promise<LedgerSnapshot> {
  const maxAttempts = Math.max(1, options?.maxAttempts ?? 8);
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const snap = await loadLedgerSnapshot(pool, organizationId);
    const draft = structuredClone(snap.ledger);
    const next = await mutator(draft);
    try {
      const saved = await saveLedgerForOrganization(pool, organizationId, next, {
        expectedRevision: snap.revision,
      });
      return { ledger: next, revision: saved.revision };
    } catch (err) {
      lastErr = err;
      if (!(err instanceof LedgerConflictError) || attempt === maxAttempts) {
        throw err;
      }
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new LedgerConflictError('Ledger mutation exhausted retries.');
}

/** Assert a query/filter never crosses organizations (defense in depth for tests). */
export function assertOrganizationScope(
  organizationId: string,
  rowOrgId: string
): void {
  if (organizationId !== rowOrgId) {
    throw new Error('Organization scope violation.');
  }
}
