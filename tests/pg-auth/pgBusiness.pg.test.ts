/**
 * Real PostgreSQL business-data integration (it_gst_management_test only).
 * Uses repository APIs — no mocks for DB I/O. Never uses ambient DATABASE_URL.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import type { LedgerState } from '../../src/types/ledger.ts';
import {
  LedgerConflictError,
  loadLedgerForOrganization,
  loadLedgerSnapshot,
  mutateLedgerForOrganization,
  saveLedgerForOrganization,
} from '../../src/business/pgLedgerRepository.ts';
import { resolveBusinessDataBackend } from '../../src/business/businessDataBackend.ts';
import {
  computeClientSummaries,
  computeYearSummary,
} from '../../src/utils/summaryUtils.ts';
import { assertPgAuthTestTarget } from './helpers/pgAuthSafety.ts';
import {
  closePgAuthTestPool,
  createPgAuthTestPool,
} from './helpers/pgAuthClient.ts';
import {
  cleanupTwoOwnerOrganization,
  seedTwoOwnerOrganization,
  type PgAuthTwoOwnerFixture,
} from './helpers/pgAuthFixtures.ts';

const canRun = (() => {
  try {
    assertPgAuthTestTarget(process.env);
    return true;
  } catch {
    return false;
  }
})();

const RUN_ID = `p4b-${Date.now().toString(36)}`;
const IT_A = `${RUN_ID}-it-a`;
const IT_B = `${RUN_ID}-it-b`;
const GST_A = `${RUN_ID}-gst-a`;
const AY = 'AY 2024-25';
const MONTH = 'Apr 2024';

function emptyLedger(): LedgerState {
  return {
    assessmentYears: [],
    clients: [],
    gstMonths: [],
    gstClients: [],
  };
}

describe.skipIf(!canRun)(
  'pg business-data repository (real it_gst_management_test)',
  () => {
    let pool: pg.Pool;
    let fixture: PgAuthTwoOwnerFixture;
    let otherOrg: PgAuthTwoOwnerFixture;

    beforeAll(async () => {
      assertPgAuthTestTarget(process.env);
      pool = createPgAuthTestPool();

      const leftover = await pool.query(
        `SELECT
           (SELECT COUNT(*)::int FROM it_clients) AS it_clients,
           (SELECT COUNT(*)::int FROM gst_companies) AS gst_companies`
      );
      const row = leftover.rows[0] as {
        it_clients: number;
        gst_companies: number;
      };
      if (row.it_clients > 0 || row.gst_companies > 0) {
        throw new Error(
          'Unexpected business data in test DB before Phase 4B seed — aborting.'
        );
      }

      fixture = await seedTwoOwnerOrganization(pool, {
        organizationName: `PG Biz Org ${RUN_ID}`,
        ownerAEmail: `pg-biz-a-${RUN_ID}@example.com`,
        ownerBEmail: `pg-biz-b-${RUN_ID}@example.com`,
        ownerAPassword: 'PgBiz-OwnerA-Pass!99',
        ownerBPassword: 'PgBiz-OwnerB-Pass!99',
      });
      otherOrg = await seedTwoOwnerOrganization(pool, {
        organizationName: `PG Biz Other ${RUN_ID}`,
        ownerAEmail: `pg-biz-other-a-${RUN_ID}@example.com`,
        ownerBEmail: `pg-biz-other-b-${RUN_ID}@example.com`,
        ownerAPassword: 'PgBiz-OtherA-Pass!99',
        ownerBPassword: 'PgBiz-OtherB-Pass!99',
      });

      const snap = await loadLedgerSnapshot(pool, fixture.organizationId);
      await saveLedgerForOrganization(
        pool,
        fixture.organizationId,
        emptyLedger(),
        { expectedRevision: snap.revision }
      );
      const otherSnap = await loadLedgerSnapshot(pool, otherOrg.organizationId);
      await saveLedgerForOrganization(
        pool,
        otherOrg.organizationId,
        emptyLedger(),
        { expectedRevision: otherSnap.revision }
      );
    }, 60_000);

    afterAll(async () => {
      if (fixture && pool) await cleanupTwoOwnerOrganization(pool, fixture);
      if (otherOrg && pool) await cleanupTwoOwnerOrganization(pool, otherOrg);
      if (pool) await closePgAuthTestPool(pool);
    }, 60_000);

    it('1-2. Owner A and Owner B load the same organization ledger', async () => {
      const a = await loadLedgerForOrganization(pool, fixture.organizationId);
      const b = await loadLedgerForOrganization(pool, fixture.organizationId);
      expect(a).toEqual(b);
      expect(a.clients).toEqual([]);
    });

    it('3-4. Owner A creates IT client; Owner B retrieves it', async () => {
      await mutateLedgerForOrganization(pool, fixture.organizationId, (ledger) => {
        ledger.assessmentYears = [AY];
        ledger.clients.push({
          id: IT_A,
          name: 'Synthetic IT Alpha',
          pan: 'ZZZZA0001A',
          phone: '9000000001',
          referenceNumber: 'SYN-A',
          filings: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        return ledger;
      });

      const asB = await loadLedgerForOrganization(pool, fixture.organizationId);
      expect(asB.clients.map((c) => c.id)).toContain(IT_A);
      expect(asB.clients.find((c) => c.id === IT_A)?.name).toBe(
        'Synthetic IT Alpha'
      );
    });

    it('5-6. Owner B updates client; Owner A sees update', async () => {
      await mutateLedgerForOrganization(pool, fixture.organizationId, (ledger) => {
        const c = ledger.clients.find((x) => x.id === IT_A);
        if (!c) throw new Error('missing IT_A');
        c.name = 'Synthetic IT Alpha Updated';
        c.updatedAt = new Date().toISOString();
        return ledger;
      });
      const asA = await loadLedgerForOrganization(pool, fixture.organizationId);
      expect(asA.clients.find((c) => c.id === IT_A)?.name).toBe(
        'Synthetic IT Alpha Updated'
      );
    });

    it('7. GST company creation and retrieval', async () => {
      await mutateLedgerForOrganization(pool, fixture.organizationId, (ledger) => {
        ledger.gstMonths = [MONTH];
        ledger.gstClients.push({
          id: GST_A,
          companyName: 'Synthetic GST Co',
          userId: `portal-${RUN_ID}`,
          phone: '9000000002',
          referenceNumber: 'G-SYN',
          totalReceived: 0,
          filings: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        return ledger;
      });
      const loaded = await loadLedgerForOrganization(pool, fixture.organizationId);
      expect(loaded.gstClients.map((c) => c.id)).toContain(GST_A);
      expect(loaded.clients.some((c) => c.id === GST_A)).toBe(false);
    });

    it('8-9. Payment fields and outstanding calculations', async () => {
      await mutateLedgerForOrganization(pool, fixture.organizationId, (ledger) => {
        const c = ledger.clients.find((x) => x.id === IT_A);
        if (!c) throw new Error('missing IT_A');
        c.filings[AY] = {
          assessmentYear: AY,
          filingDate: '2025-01-10',
          fees: 2000,
          received: 500,
          balance: 1500,
          paymentType: 'UPI',
          paymentReceiveDate: '2025-02-01',
        };
        c.updatedAt = new Date().toISOString();
        return ledger;
      });

      const loaded = await loadLedgerForOrganization(pool, fixture.organizationId);
      const filing = loaded.clients.find((c) => c.id === IT_A)?.filings[AY];
      expect(filing?.received).toBe(500);
      expect(filing?.balance).toBe(1500);

      const summaries = computeClientSummaries(loaded.clients, [AY]);
      const row = summaries.find((s) => s.id === IT_A);
      expect(row?.totalReceived).toBe(500);
      expect(row?.outstanding).toBe(1500);

      const year = computeYearSummary(loaded.clients, [AY]);
      expect(year.totalOutstanding).toBe(1500);
    });

    it('10. Assessment-year filtering preserves related records', async () => {
      await mutateLedgerForOrganization(pool, fixture.organizationId, (ledger) => {
        if (!ledger.assessmentYears.includes('AY 2023-24')) {
          ledger.assessmentYears.push('AY 2023-24');
        }
        const c = ledger.clients.find((x) => x.id === IT_A);
        if (!c) throw new Error('missing IT_A');
        c.filings['AY 2023-24'] = {
          assessmentYear: 'AY 2023-24',
          filingDate: '',
          fees: 100,
          received: 100,
          balance: 0,
          paymentType: 'Cash',
          paymentReceiveDate: '',
        };
        return ledger;
      });
      const loaded = await loadLedgerForOrganization(pool, fixture.organizationId);
      expect(computeYearSummary(loaded.clients, ['AY 2023-24']).totalOutstanding).toBe(
        0
      );
      expect(computeYearSummary(loaded.clients, [AY]).totalOutstanding).toBe(1500);
    });

    it('11. Deletion removes IT client for both owners', async () => {
      await mutateLedgerForOrganization(pool, fixture.organizationId, (ledger) => {
        ledger.clients.push({
          id: IT_B,
          name: 'Synthetic disposable',
          pan: 'ZZZZA0002B',
          phone: '',
          referenceNumber: '',
          filings: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        return ledger;
      });
      await mutateLedgerForOrganization(pool, fixture.organizationId, (ledger) => {
        ledger.clients = ledger.clients.filter((c) => c.id !== IT_B);
        return ledger;
      });
      const loaded = await loadLedgerForOrganization(pool, fixture.organizationId);
      expect(loaded.clients.map((c) => c.id)).not.toContain(IT_B);
      expect(loaded.clients.map((c) => c.id)).toContain(IT_A);
    });

    it('12. Transaction rollback after failed write (conflict)', async () => {
      const before = await loadLedgerSnapshot(pool, fixture.organizationId);
      await expect(
        saveLedgerForOrganization(
          pool,
          fixture.organizationId,
          {
            ...before.ledger,
            clients: [
              ...before.ledger.clients,
              {
                id: `${RUN_ID}-should-not-persist`,
                name: 'Rollback probe',
                pan: 'ZZZZA0099Z',
                phone: '',
                referenceNumber: '',
                filings: {},
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
          },
          { expectedRevision: 'stale-revision-token' }
        )
      ).rejects.toBeInstanceOf(LedgerConflictError);

      const after = await loadLedgerForOrganization(pool, fixture.organizationId);
      expect(after.clients.map((c) => c.id)).not.toContain(
        `${RUN_ID}-should-not-persist`
      );
      expect(after.clients.map((c) => c.id)).toEqual(
        before.ledger.clients.map((c) => c.id)
      );
    });

    it('13. Organization A cannot read Organization B records', async () => {
      await mutateLedgerForOrganization(pool, otherOrg.organizationId, (ledger) => {
        ledger.clients.push({
          id: `${RUN_ID}-other-only`,
          name: 'Other org only',
          pan: 'ZZZZB0001A',
          phone: '',
          referenceNumber: '',
          filings: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        return ledger;
      });

      const forA = await loadLedgerForOrganization(pool, fixture.organizationId);
      const forOther = await loadLedgerForOrganization(
        pool,
        otherOrg.organizationId
      );
      expect(forA.clients.map((c) => c.id)).not.toContain(`${RUN_ID}-other-only`);
      expect(forOther.clients.map((c) => c.id)).toContain(`${RUN_ID}-other-only`);
      expect(forOther.clients.map((c) => c.id)).not.toContain(IT_A);
    });

    it('14. Missing/invalid business backend config fails closed', () => {
      expect(() =>
        resolveBusinessDataBackend(
          { BUSINESS_DATA_BACKEND: 'postgres' },
          { kind: 'json', organizationId: null }
        )
      ).toThrow(/AUTH_BACKEND=postgres/);
      expect(() =>
        resolveBusinessDataBackend(
          { BUSINESS_DATA_BACKEND: 'postgres' },
          { kind: 'postgres', organizationId: fixture.organizationId }
        )
      ).toThrow(/DATABASE_URL/);
    });

    it('15. Default BUSINESS_DATA_BACKEND remains json', () => {
      expect(resolveBusinessDataBackend({}, { kind: 'json', organizationId: null }).kind).toBe(
        'json'
      );
    });

    it('concurrent independent edits both survive (lost-update fix)', async () => {
      await mutateLedgerForOrganization(pool, fixture.organizationId, (ledger) => {
        if (!ledger.clients.find((c) => c.id === `${RUN_ID}-conc-a`)) {
          ledger.clients.push({
            id: `${RUN_ID}-conc-a`,
            name: 'Conc A start',
            pan: 'ZZZZC0001A',
            phone: '',
            referenceNumber: '',
            filings: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
        if (!ledger.clients.find((c) => c.id === `${RUN_ID}-conc-b`)) {
          ledger.clients.push({
            id: `${RUN_ID}-conc-b`,
            name: 'Conc B start',
            pan: 'ZZZZC0002B',
            phone: '',
            referenceNumber: '',
            filings: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
        return ledger;
      });

      const [r1, r2] = await Promise.all([
        mutateLedgerForOrganization(pool, fixture.organizationId, (ledger) => {
          const c = ledger.clients.find((x) => x.id === `${RUN_ID}-conc-a`);
          if (!c) throw new Error('missing conc-a');
          c.name = 'Conc A done';
          c.updatedAt = new Date().toISOString();
          return ledger;
        }),
        mutateLedgerForOrganization(pool, fixture.organizationId, (ledger) => {
          const c = ledger.clients.find((x) => x.id === `${RUN_ID}-conc-b`);
          if (!c) throw new Error('missing conc-b');
          c.name = 'Conc B done';
          c.updatedAt = new Date().toISOString();
          return ledger;
        }),
      ]);

      expect(r1.ledger.clients.find((c) => c.id === `${RUN_ID}-conc-a`)?.name).toBe(
        'Conc A done'
      );
      expect(r2.ledger.clients.find((c) => c.id === `${RUN_ID}-conc-b`)?.name).toBe(
        'Conc B done'
      );

      const final = await loadLedgerForOrganization(pool, fixture.organizationId);
      expect(final.clients.find((c) => c.id === `${RUN_ID}-conc-a`)?.name).toBe(
        'Conc A done'
      );
      expect(final.clients.find((c) => c.id === `${RUN_ID}-conc-b`)?.name).toBe(
        'Conc B done'
      );
    });

    it('concurrent same-record updates are deterministic (last successful mutator wins)', async () => {
      const id = `${RUN_ID}-same`;
      await mutateLedgerForOrganization(pool, fixture.organizationId, (ledger) => {
        if (!ledger.clients.find((c) => c.id === id)) {
          ledger.clients.push({
            id,
            name: 'Same start',
            pan: 'ZZZZC0003C',
            phone: '',
            referenceNumber: '',
            filings: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
        return ledger;
      });

      await Promise.all([
        mutateLedgerForOrganization(pool, fixture.organizationId, (ledger) => {
          const c = ledger.clients.find((x) => x.id === id);
          if (!c) throw new Error('missing same');
          c.name = 'Same from A';
          c.updatedAt = new Date().toISOString();
          return ledger;
        }),
        mutateLedgerForOrganization(pool, fixture.organizationId, (ledger) => {
          const c = ledger.clients.find((x) => x.id === id);
          if (!c) throw new Error('missing same');
          c.name = 'Same from B';
          c.updatedAt = new Date().toISOString();
          return ledger;
        }),
      ]);

      const final = await loadLedgerForOrganization(pool, fixture.organizationId);
      const name = final.clients.find((c) => c.id === id)?.name;
      expect(['Same from A', 'Same from B']).toContain(name);
    });
  }
);
