/**
 * Phase 8B.3 — real local test-DB verification for provisionTwoOwners.
 * Uses it_gst_management_test only (never production / never ambient DATABASE_URL fallback).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { verifySecret } from '../../authCrypto.ts';
import { findOwnerByEmail } from '../../src/db/authUsers.ts';
import {
  loadLedgerForOrganization,
  loadLedgerSnapshot,
  saveLedgerForOrganization,
} from '../../src/business/pgLedgerRepository.ts';
import type { LedgerState } from '../../src/types/ledger.ts';
import {
  provisionTwoOwnersInTransaction,
} from '../../scripts/provision-two-owners-lib.ts';
import { assertPgAuthTestTarget } from './helpers/pgAuthSafety.ts';
import {
  closePgAuthTestPool,
  createPgAuthTestPool,
} from './helpers/pgAuthClient.ts';
import type pg from 'pg';

function emptyLedger(): LedgerState {
  return {
    assessmentYears: [],
    clients: [],
    gstMonths: [],
    gstClients: [],
  };
}

const canRun = (() => {
  try {
    assertPgAuthTestTarget(process.env);
    return true;
  } catch {
    return false;
  }
})();

const RUN_ID = Date.now().toString(36);
const ORG_NAME = `Provision Test Org ${RUN_ID}`;
const EMAIL_A = `prov-a-${RUN_ID}@example.com`;
const EMAIL_B = `prov-b-${RUN_ID}@example.com`;
const PASS_A = 'Prov-OwnerA-Pass!99';
const PASS_B = 'Prov-OwnerB-Pass!99';

describe.skipIf(!canRun)(
  'provisionTwoOwners against it_gst_management_test',
  () => {
    let pool: pg.Pool;
    let organizationId = '';
    let ownerAId = '';
    let ownerBId = '';

    beforeAll(() => {
      assertPgAuthTestTarget(process.env);
      pool = createPgAuthTestPool();
    });

    afterAll(async () => {
      if (pool && organizationId) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query(
            `DELETE FROM gst_filings WHERE organization_id = $1::uuid`,
            [organizationId]
          );
          await client.query(
            `DELETE FROM it_filings WHERE organization_id = $1::uuid`,
            [organizationId]
          );
          await client.query(
            `DELETE FROM gst_companies WHERE organization_id = $1::uuid`,
            [organizationId]
          );
          await client.query(
            `DELETE FROM it_clients WHERE organization_id = $1::uuid`,
            [organizationId]
          );
          await client.query(
            `DELETE FROM gst_months WHERE organization_id = $1::uuid`,
            [organizationId]
          );
          await client.query(
            `DELETE FROM assessment_years WHERE organization_id = $1::uuid`,
            [organizationId]
          );
          await client.query(
            `DELETE FROM sessions WHERE user_id = ANY($1::uuid[])`,
            [[ownerAId, ownerBId].filter(Boolean)]
          );
          await client.query(
            `DELETE FROM organization_members WHERE organization_id = $1::uuid`,
            [organizationId]
          );
          await client.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [
            [ownerAId, ownerBId].filter(Boolean),
          ]);
          await client.query(`DELETE FROM organizations WHERE id = $1::uuid`, [
            organizationId,
          ]);
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      }
      if (pool) await closePgAuthTestPool(pool);
    });

    it('provisions one org and two owners; idempotent on retry', async () => {
      const created = await provisionTwoOwnersInTransaction(
        () => pool.connect(),
        {
          organizationName: ORG_NAME,
          ownerA: { email: EMAIL_A, password: PASS_A },
          ownerB: { email: EMAIL_B, password: PASS_B },
        }
      );
      expect(created.status).toBe('created');
      organizationId = created.organizationId;
      ownerAId = created.ownerA.id;
      ownerBId = created.ownerB.id;

      const members = await pool.query(
        `SELECT user_id, role FROM organization_members
         WHERE organization_id = $1::uuid ORDER BY user_id`,
        [organizationId]
      );
      expect(members.rowCount).toBe(2);
      expect(members.rows.every((r) => r.role === 'owner')).toBe(true);

      const userA = await findOwnerByEmail(pool, organizationId, EMAIL_A);
      const userB = await findOwnerByEmail(pool, organizationId, EMAIL_B);
      expect(userA).not.toBeNull();
      expect(userB).not.toBeNull();
      expect(verifySecret(PASS_A, userA!.passwordSalt, userA!.passwordHash)).toBe(
        true
      );
      expect(verifySecret(PASS_B, userB!.passwordSalt, userB!.passwordHash)).toBe(
        true
      );
      expect(userA!.passwordHash).not.toContain(PASS_A);

      const again = await provisionTwoOwnersInTransaction(
        () => pool.connect(),
        {
          organizationName: ORG_NAME,
          ownerA: { email: EMAIL_A, password: PASS_A },
          ownerB: { email: EMAIL_B, password: PASS_B },
        }
      );
      expect(again.status).toBe('already_provisioned');
      expect(again.organizationId).toBe(organizationId);

      // Password hashes must be unchanged by idempotent retry.
      const userA2 = await findOwnerByEmail(pool, organizationId, EMAIL_A);
      expect(userA2!.passwordHash).toBe(userA!.passwordHash);
    });

    it('both owners resolve to the same shared ledger scope', async () => {
      expect(organizationId).toBeTruthy();

      const ledger: LedgerState = {
        ...emptyLedger(),
        assessmentYears: ['2024-25'],
        clients: [
          {
            id: `it-${RUN_ID}`,
            name: 'Shared Client',
            pan: 'ABCDE1234F',
            phone: '',
            referenceNumber: '',
            filings: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      };

      const snap = await loadLedgerSnapshot(pool, organizationId);
      await saveLedgerForOrganization(pool, organizationId, ledger, {
        expectedRevision: snap.revision,
      });

      const forA = await findOwnerByEmail(pool, organizationId, EMAIL_A);
      const forB = await findOwnerByEmail(pool, organizationId, EMAIL_B);
      expect(forA?.id).toBe(ownerAId);
      expect(forB?.id).toBe(ownerBId);

      const loadedA = await loadLedgerForOrganization(pool, organizationId);
      const loadedB = await loadLedgerForOrganization(pool, organizationId);
      expect(loadedA).toEqual(loadedB);
      expect(loadedA.clients).toHaveLength(1);
      expect(loadedA.clients[0].id).toBe(`it-${RUN_ID}`);
    });

    it('rejects duplicate email provisioning into a new org name', async () => {
      await expect(
        provisionTwoOwnersInTransaction(() => pool.connect(), {
          organizationName: `${ORG_NAME} OTHER`,
          ownerA: { email: EMAIL_A, password: PASS_A },
          ownerB: { email: `other-${RUN_ID}@example.com`, password: PASS_B },
        })
      ).rejects.toThrow(/Partial account state/i);
    });
  }
);
