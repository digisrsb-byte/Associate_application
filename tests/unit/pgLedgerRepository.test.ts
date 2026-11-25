import { createHash } from 'crypto';
import { describe, expect, it, vi } from 'vitest';
import type { LedgerState } from '../../src/types/ledger.ts';
import type { DbPool } from '../../src/db/passwordResetStore.ts';
import {
  assertOrganizationScope,
  LedgerConflictError,
  loadLedgerForOrganization,
  loadLedgerSnapshot,
  mutateLedgerForOrganization,
  saveLedgerForOrganization,
} from '../../src/business/pgLedgerRepository.ts';
import {
  computeClientSummaries,
  computeGstClientSummaries,
  computeYearSummary,
} from '../../src/utils/summaryUtils.ts';

const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

type Row = Record<string, unknown>;

/** In-memory org-scoped tables — no real PostgreSQL connection. */
function createOrgStore() {
  const store = {
    organizations: [{ id: ORG_A }, { id: ORG_B }] as Row[],
    assessment_years: [] as Row[],
    gst_months: [] as Row[],
    it_clients: [] as Row[],
    it_filings: [] as Row[],
    gst_companies: [] as Row[],
    gst_filings: [] as Row[],
  };

  function scoped(table: keyof typeof store, orgId: string) {
    if (table === 'organizations') {
      return store.organizations.filter((r) => r.id === orgId);
    }
    return store[table].filter((r) => r.organization_id === orgId);
  }

  function fingerprint(orgId: string): string {
    const parts = [
      ...scoped('assessment_years', orgId).map((r) => `ay:${r.label}`),
      ...scoped('gst_months', orgId).map((r) => `gm:${r.label}`),
      ...scoped('it_clients', orgId).map(
        (r) => `it:${r.id}:${r.updated_at}`
      ),
      ...scoped('it_filings', orgId).map(
        (r) =>
          `itf:${r.it_client_id}:${r.assessment_year}:${r.fees}:${r.received}:${r.balance}`
      ),
      ...scoped('gst_companies', orgId).map(
        (r) => `gst:${r.id}:${r.updated_at}:${r.total_received}`
      ),
      ...scoped('gst_filings', orgId).map(
        (r) =>
          `gf:${r.gst_company_id}:${r.month}:${r.fees}:${r.interest}:${r.tax}:${r.total}`
      ),
    ].sort();
    return createHash('md5').update(parts.join('|')).digest('hex');
  }

  function createPool(): DbPool & { store: typeof store } {
    const client = {
      query: vi.fn(async (text: string, values?: unknown[]) => {
        const sql = text.replace(/\s+/g, ' ').trim();
        const v = values || [];

        if (/^BEGIN$/i.test(sql) || /^COMMIT$/i.test(sql) || /^ROLLBACK$/i.test(sql)) {
          return { rowCount: 0, rows: [] };
        }
        if (/SELECT id FROM organizations WHERE id/i.test(sql)) {
          const orgId = String(v[0]);
          const rows = scoped('organizations', orgId);
          return { rowCount: rows.length, rows };
        }
        if (/pg_advisory_xact_lock/i.test(sql)) {
          return { rowCount: 1, rows: [{ pg_advisory_xact_lock: '' }] };
        }
        if (/md5\(COALESCE\(string_agg/i.test(sql)) {
          return {
            rowCount: 1,
            rows: [{ revision: fingerprint(String(v[0])) }],
          };
        }

        const del = sql.match(/^DELETE FROM (\w+) WHERE organization_id/i);
        if (del) {
          const table = del[1] as keyof typeof store;
          const orgId = String(v[0]);
          const before = (store[table] as Row[]).length;
          (store as Record<string, Row[]>)[table] = (store[table] as Row[]).filter(
            (r) => r.organization_id !== orgId
          );
          return {
            rowCount: before - (store[table] as Row[]).length,
            rows: [],
          };
        }

        if (/SELECT label FROM assessment_years/i.test(sql)) {
          const orgId = String(v[0]);
          return {
            rowCount: scoped('assessment_years', orgId).length,
            rows: scoped('assessment_years', orgId)
              .map((r) => ({ label: r.label }))
              .sort((a, b) => String(a.label).localeCompare(String(b.label))),
          };
        }
        if (/SELECT label FROM gst_months/i.test(sql)) {
          const orgId = String(v[0]);
          return {
            rowCount: scoped('gst_months', orgId).length,
            rows: scoped('gst_months', orgId)
              .map((r) => ({ label: r.label }))
              .sort((a, b) => String(a.label).localeCompare(String(b.label))),
          };
        }
        if (/FROM it_clients/i.test(sql) && /SELECT id, name/i.test(sql)) {
          const orgId = String(v[0]);
          return {
            rowCount: scoped('it_clients', orgId).length,
            rows: [...scoped('it_clients', orgId)].sort((a, b) =>
              String(a.id).localeCompare(String(b.id))
            ),
          };
        }
        if (/FROM it_filings/i.test(sql) && /SELECT it_client_id/i.test(sql)) {
          const orgId = String(v[0]);
          return {
            rowCount: scoped('it_filings', orgId).length,
            rows: scoped('it_filings', orgId),
          };
        }
        if (/FROM gst_companies/i.test(sql) && /SELECT id, company_name/i.test(sql)) {
          const orgId = String(v[0]);
          return {
            rowCount: scoped('gst_companies', orgId).length,
            rows: [...scoped('gst_companies', orgId)].sort((a, b) =>
              String(a.id).localeCompare(String(b.id))
            ),
          };
        }
        if (/FROM gst_filings/i.test(sql) && /SELECT gst_company_id/i.test(sql)) {
          const orgId = String(v[0]);
          return {
            rowCount: scoped('gst_filings', orgId).length,
            rows: scoped('gst_filings', orgId),
          };
        }

        if (/INSERT INTO assessment_years/i.test(sql)) {
          store.assessment_years.push({
            organization_id: String(v[0]),
            label: String(v[1]),
          });
          return { rowCount: 1, rows: [] };
        }
        if (/INSERT INTO gst_months/i.test(sql)) {
          store.gst_months.push({
            organization_id: String(v[0]),
            label: String(v[1]),
          });
          return { rowCount: 1, rows: [] };
        }
        if (/INSERT INTO it_clients/i.test(sql)) {
          store.it_clients.push({
            id: String(v[0]),
            organization_id: String(v[1]),
            name: String(v[2]),
            pan: String(v[3]),
            phone: String(v[4]),
            reference_number: String(v[5]),
            remark: v[6],
            other_mobiles: v[7],
            name_variants: v[8],
            password_enc: v[9],
            created_at: String(v[10]),
            updated_at: String(v[11]),
          });
          return { rowCount: 1, rows: [] };
        }
        if (/INSERT INTO it_filings/i.test(sql)) {
          store.it_filings.push({
            organization_id: String(v[0]),
            it_client_id: String(v[1]),
            assessment_year: String(v[2]),
            filing_date: String(v[3]),
            fees: Number(v[4]),
            received: Number(v[5]),
            balance: Number(v[6]),
            payment_type: String(v[7]),
            payment_receive_date: String(v[8]),
          });
          return { rowCount: 1, rows: [] };
        }
        if (/INSERT INTO gst_companies/i.test(sql)) {
          store.gst_companies.push({
            id: String(v[0]),
            organization_id: String(v[1]),
            company_name: String(v[2]),
            portal_user_id: String(v[3]),
            phone: String(v[4]),
            reference_number: String(v[5]),
            remark: v[6],
            total_received: Number(v[7]),
            password_enc: v[8],
            created_at: String(v[9]),
            updated_at: String(v[10]),
          });
          return { rowCount: 1, rows: [] };
        }
        if (/INSERT INTO gst_filings/i.test(sql)) {
          store.gst_filings.push({
            organization_id: String(v[0]),
            gst_company_id: String(v[1]),
            month: String(v[2]),
            fees: Number(v[3]),
            interest: Number(v[4]),
            tax: Number(v[5]),
            total: Number(v[6]),
          });
          return { rowCount: 1, rows: [] };
        }

        throw new Error(`Unhandled mock SQL: ${sql.slice(0, 120)}`);
      }),
      release: vi.fn(),
    };

    const pool = {
      connect: async () => client,
      store,
    } as unknown as DbPool & { store: typeof store };

    return pool;
  }

  return { createPool, store, fingerprint };
}

function sampleLedger(overrides?: Partial<LedgerState>): LedgerState {
  return {
    assessmentYears: ['2024-25'],
    clients: [
      {
        id: 'it-1',
        name: 'Alpha IT',
        pan: 'ZZAPA0001A',
        phone: '9000000001',
        referenceNumber: 'R1',
        filings: {
          '2024-25': {
            assessmentYear: '2024-25',
            filingDate: '2025-01-15',
            fees: 1000,
            received: 400,
            balance: 600,
            paymentType: 'UPI',
            paymentReceiveDate: '2025-02-01',
          },
        },
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-02T00:00:00.000Z',
      },
    ],
    gstMonths: ['Apr 2024'],
    gstClients: [
      {
        id: 'gst-1',
        companyName: 'Beta GST',
        userId: 'portal-user-1',
        phone: '9000000002',
        referenceNumber: 'G1',
        totalReceived: 250,
        filings: {
          'Apr 2024': {
            month: 'Apr 2024',
            fees: 200,
            interest: 10,
            tax: 50,
            total: 260,
          },
        },
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-02T00:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

async function saveFresh(
  pool: DbPool,
  orgId: string,
  ledger: LedgerState
) {
  const snap = await loadLedgerSnapshot(pool, orgId);
  return saveLedgerForOrganization(pool, orgId, ledger, {
    expectedRevision: snap.revision,
  });
}

describe('pgLedgerRepository (mocked, no DB connection)', () => {
  it('Owner A and Owner B see the same organization records', async () => {
    const { createPool } = createOrgStore();
    const pool = createPool();
    await saveFresh(pool, ORG_A, sampleLedger());

    const asOwnerA = await loadLedgerForOrganization(pool, ORG_A);
    const asOwnerB = await loadLedgerForOrganization(pool, ORG_A);

    expect(asOwnerA.clients).toHaveLength(1);
    expect(asOwnerB.clients).toEqual(asOwnerA.clients);
    expect(asOwnerB.gstClients).toEqual(asOwnerA.gstClients);
  });

  it('Owner A creates a client and Owner B can retrieve it', async () => {
    const { createPool } = createOrgStore();
    const pool = createPool();
    await saveFresh(
      pool,
      ORG_A,
      sampleLedger({ clients: [], gstClients: [], gstMonths: [] })
    );

    await mutateLedgerForOrganization(pool, ORG_A, (ledger) => {
      ledger.clients.push(sampleLedger().clients[0]);
      ledger.assessmentYears = ['2024-25'];
      return ledger;
    });

    const asOwnerB = await loadLedgerForOrganization(pool, ORG_A);
    expect(asOwnerB.clients.map((c) => c.id)).toContain('it-1');
  });

  it('Owner B updates a shared record and Owner A sees the update', async () => {
    const { createPool } = createOrgStore();
    const pool = createPool();
    await saveFresh(pool, ORG_A, sampleLedger());

    await mutateLedgerForOrganization(pool, ORG_A, (current) => {
      current.clients[0] = {
        ...current.clients[0],
        name: 'Alpha IT Updated',
        updatedAt: '2025-06-01T00:00:00.000Z',
      };
      return current;
    });

    const asOwnerA = await loadLedgerForOrganization(pool, ORG_A);
    expect(asOwnerA.clients[0].name).toBe('Alpha IT Updated');
  });

  it('one organization cannot access another organization records', async () => {
    const { createPool } = createOrgStore();
    const pool = createPool();
    await saveFresh(pool, ORG_A, sampleLedger());
    await saveFresh(
      pool,
      ORG_B,
      sampleLedger({
        clients: [
          {
            id: 'it-other',
            name: 'Other Org Client',
            pan: 'ZZAPA9999Z',
            phone: '',
            referenceNumber: '',
            filings: {},
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-01T00:00:00.000Z',
          },
        ],
        gstClients: [],
        gstMonths: [],
      })
    );

    const forA = await loadLedgerForOrganization(pool, ORG_A);
    const forB = await loadLedgerForOrganization(pool, ORG_B);

    expect(forA.clients.map((c) => c.id)).toEqual(['it-1']);
    expect(forB.clients.map((c) => c.id)).toEqual(['it-other']);
  });

  it('assertOrganizationScope rejects cross-org row access', () => {
    expect(() => assertOrganizationScope(ORG_A, ORG_B)).toThrow(
      /Organization scope violation/
    );
  });

  it('payment and outstanding calculations remain correct after round-trip', async () => {
    const { createPool } = createOrgStore();
    const pool = createPool();
    await saveFresh(pool, ORG_A, sampleLedger());
    const loaded = await loadLedgerForOrganization(pool, ORG_A);

    const summaries = computeClientSummaries(
      loaded.clients,
      loaded.assessmentYears
    );
    expect(summaries[0].totalReceived).toBe(400);
    expect(summaries[0].outstanding).toBe(600);

    const year = computeYearSummary(loaded.clients, ['2024-25']);
    expect(year.totalBilled).toBe(1000);
    expect(year.totalOutstanding).toBe(600);

    const gst = computeGstClientSummaries(loaded.gstClients, loaded.gstMonths);
    expect(gst[0].totalBilled).toBe(260);
    expect(gst[0].outstanding).toBe(10);
  });

  it('GST and IT client records remain correctly separated', async () => {
    const { createPool } = createOrgStore();
    const pool = createPool();
    await saveFresh(pool, ORG_A, sampleLedger());
    const loaded = await loadLedgerForOrganization(pool, ORG_A);

    expect(loaded.clients[0]).not.toHaveProperty('companyName');
    expect(loaded.gstClients[0]).not.toHaveProperty('pan');
    expect(loaded.gstClients[0].userId).toBe('portal-user-1');
  });

  it('AY catalog and filing filters preserve existing behaviour', async () => {
    const { createPool } = createOrgStore();
    const pool = createPool();
    await saveFresh(
      pool,
      ORG_A,
      sampleLedger({
        assessmentYears: ['2023-24', '2024-25'],
        clients: [
          {
            id: 'it-1',
            name: 'Alpha IT',
            pan: 'ZZAPA0001A',
            phone: '',
            referenceNumber: '',
            filings: {
              '2023-24': {
                assessmentYear: '2023-24',
                filingDate: '',
                fees: 500,
                received: 500,
                balance: 0,
                paymentType: 'Cash',
                paymentReceiveDate: '',
              },
              '2024-25': {
                assessmentYear: '2024-25',
                filingDate: '',
                fees: 800,
                received: 0,
                balance: 800,
                paymentType: 'Pending',
                paymentReceiveDate: '',
              },
            },
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-01T00:00:00.000Z',
          },
        ],
      })
    );

    const loaded = await loadLedgerForOrganization(pool, ORG_A);
    expect(computeYearSummary(loaded.clients, ['2023-24']).totalOutstanding).toBe(
      0
    );
    expect(computeYearSummary(loaded.clients, ['2024-25']).totalOutstanding).toBe(
      800
    );
  });

  it('stale expectedRevision raises LedgerConflictError (no JSON fallback)', async () => {
    const { createPool } = createOrgStore();
    const pool = createPool();
    await saveFresh(pool, ORG_A, sampleLedger());

    await expect(
      saveLedgerForOrganization(pool, ORG_A, sampleLedger(), {
        expectedRevision: 'definitely-stale-revision',
      })
    ).rejects.toBeInstanceOf(LedgerConflictError);
  });

  it('PostgreSQL errors propagate (no silent JSON fallback)', async () => {
    const release = vi.fn();
    const pool = {
      connect: async () => ({
        query: async () => {
          throw new Error('connection refused');
        },
        release,
      }),
    } as unknown as DbPool;

    await expect(loadLedgerForOrganization(pool, ORG_A)).rejects.toThrow(
      /connection refused/
    );
    expect(release).toHaveBeenCalled();
  });

  it('save requires expectedRevision and uses transactional locks', async () => {
    const { createPool } = createOrgStore();
    const pool = createPool();
    const snap = await loadLedgerSnapshot(pool, ORG_A);
    await saveLedgerForOrganization(pool, ORG_A, sampleLedger(), {
      expectedRevision: snap.revision,
    });

    await expect(
      // @ts-expect-error intentional missing options
      saveLedgerForOrganization(pool, ORG_A, sampleLedger())
    ).rejects.toThrow(/expectedRevision/);
  });
});
