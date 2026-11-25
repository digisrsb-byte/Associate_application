/**
 * HTTP integration: AUTH_BACKEND=postgres + BUSINESS_DATA_BACKEND=postgres
 * against it_gst_management_test only. Isolated DATA_DIR. No ambient DATABASE_URL.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
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
import {
  extractTlSessionCookie,
  startPgAuthHttpServer,
  type PgAuthHttpServerHandle,
} from './helpers/pgAuthHttpServer.ts';
import { resolveBusinessDataBackend } from '../../src/business/businessDataBackend.ts';

const canRun = (() => {
  try {
    assertPgAuthTestTarget(process.env);
    return true;
  } catch {
    return false;
  }
})();

const HTTP_PORT = 3201;
const RUN_ID = `httpbiz-${Date.now().toString(36)}`;

describe.skipIf(!canRun)(
  'pg business-data HTTP (real test DB, BUSINESS_DATA_BACKEND=postgres)',
  () => {
    let pool: pg.Pool;
    let fixture: PgAuthTwoOwnerFixture;
    let server: PgAuthHttpServerHandle;
    let dataDir: string;
    let testDatabaseUrl: string;

    beforeAll(async () => {
      const target = assertPgAuthTestTarget(process.env);
      testDatabaseUrl = target.connectionString;
      pool = createPgAuthTestPool();
      fixture = await seedTwoOwnerOrganization(pool, {
        organizationName: `HTTP Biz Org ${RUN_ID}`,
        ownerAEmail: `http-biz-a-${RUN_ID}@example.com`,
        ownerBEmail: `http-biz-b-${RUN_ID}@example.com`,
        ownerAPassword: 'HttpBiz-OwnerA-Pass!99',
        ownerBPassword: 'HttpBiz-OwnerB-Pass!99',
      });

      dataDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'associate-pg-biz-http-')
      );
      // Empty JSON ledger in isolated DATA_DIR — postgres mode must not use it.
      fs.writeFileSync(
        path.join(dataDir, 'ledger.json'),
        JSON.stringify({
          assessmentYears: [],
          clients: [],
          gstMonths: [],
          gstClients: [],
        }),
        'utf8'
      );

      server = await startPgAuthHttpServer({
        testDatabaseUrl,
        organizationId: fixture.organizationId,
        dataDir,
        port: HTTP_PORT,
        businessDataBackend: 'postgres',
      });
    }, 90_000);

    afterAll(async () => {
      if (server) await server.stop();
      if (fixture && pool) await cleanupTwoOwnerOrganization(pool, fixture);
      if (pool) await closePgAuthTestPool(pool);
      if (dataDir && fs.existsSync(dataDir)) {
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    }, 60_000);

    async function login(email: string, password: string) {
      const res = await fetch(`${server.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json().catch(() => ({}));
      return {
        status: res.status,
        cookie: extractTlSessionCookie(res),
        body,
      };
    }

    it('Owner A and Owner B log in independently', async () => {
      const a = await login(fixture.ownerA.email, fixture.ownerA.password);
      const b = await login(fixture.ownerB.email, fixture.ownerB.password);
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      expect(a.cookie).toBeTruthy();
      expect(b.cookie).toBeTruthy();
      expect(a.cookie).not.toBe(b.cookie);
    });

    it('unauthorized ledger access is rejected', async () => {
      const res = await fetch(`${server.baseUrl}/api/ledger`);
      expect(res.status).toBe(401);
    });

    it('both owners see shared records; A create visible to B', async () => {
      const aLogin = await login(fixture.ownerA.email, fixture.ownerA.password);
      const yearRes = await fetch(`${server.baseUrl}/api/years`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: aLogin.cookie!,
        },
        body: JSON.stringify({ year: 'AY 2024-25' }),
      });
      expect(yearRes.status).toBe(200);

      const createRes = await fetch(`${server.baseUrl}/api/clients`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: aLogin.cookie!,
        },
        body: JSON.stringify({
          name: 'HTTP Shared Client',
          pan: 'ZZAPA0001A',
          password: 'Portal-Pass!99',
          phone: '9000000099',
        }),
      });
      expect(createRes.status).toBe(201);
      const created = (await createRes.json()) as {
        client: { id: string; name: string };
      };
      expect(created.client.name).toBe('HTTP Shared Client');

      const bLogin = await login(fixture.ownerB.email, fixture.ownerB.password);
      const ledgerRes = await fetch(`${server.baseUrl}/api/ledger`, {
        headers: { cookie: bLogin.cookie! },
      });
      expect(ledgerRes.status).toBe(200);
      const ledger = (await ledgerRes.json()) as {
        clients: Array<{ id: string; name: string; pan: string }>;
      };
      expect(ledger.clients.some((c) => c.id === created.client.id)).toBe(true);

      const updateRes = await fetch(
        `${server.baseUrl}/api/clients/${created.client.id}`,
        {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
            cookie: bLogin.cookie!,
          },
          body: JSON.stringify({
            name: 'HTTP Shared Client By B',
            pan: 'ZZAPA0001A',
          }),
        }
      );
      expect(updateRes.status).toBe(200);

      const aLedger = await fetch(`${server.baseUrl}/api/ledger`, {
        headers: { cookie: aLogin.cookie! },
      });
      const aBody = (await aLedger.json()) as {
        clients: Array<{ id: string; name: string }>;
      };
      expect(
        aBody.clients.find((c) => c.id === created.client.id)?.name
      ).toBe('HTTP Shared Client By B');
    });

    it('JSON remains the default when postgres business mode is not selected', () => {
      expect(
        resolveBusinessDataBackend({}, { kind: 'json', organizationId: null })
          .kind
      ).toBe('json');
    });

    it('Excel import session commits IT synthetic workbook into shared org', async () => {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      const sheet = wb.addWorksheet('All Data');
      sheet.addRow([
        'Assessment Year',
        'Client ID',
        'Name',
        'Amount Billed',
        'Received',
        'Outstanding',
      ]);
      sheet.addRow([
        'AY 2024-25',
        'ZZAPA0002B',
        'Synth Import Client',
        1500,
        500,
        1000,
      ]);
      const buf = Buffer.from(await wb.xlsx.writeBuffer());
      const contentBase64 = buf.toString('base64');

      const aLogin = await login(fixture.ownerA.email, fixture.ownerA.password);
      const unauth = await fetch(`${server.baseUrl}/api/import/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          domain: 'it',
          filename: 'synth-it.xlsx',
          contentBase64,
        }),
      });
      expect(unauth.status).toBe(401);

      const yearRes = await fetch(`${server.baseUrl}/api/years`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: aLogin.cookie!,
        },
        body: JSON.stringify({ year: 'AY 2024-25' }),
      });
      expect(yearRes.status).toBe(200);

      const up = await fetch(`${server.baseUrl}/api/import/session`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: aLogin.cookie!,
        },
        body: JSON.stringify({
          domain: 'it',
          filename: 'synth-it.xlsx',
          contentBase64,
        }),
      });
      expect(up.status).toBe(200);
      const upBody = (await up.json()) as {
        sessionId: string;
        suggestedSheetName: string;
        suggestedMapping: Record<string, string | null>;
      };

      const validated = await fetch(
        `${server.baseUrl}/api/import/session/${upBody.sessionId}/validate`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie: aLogin.cookie!,
          },
          body: JSON.stringify({
            sheetName: upBody.suggestedSheetName,
            mapping: upBody.suggestedMapping,
            mode: 'merge',
            onConflict: 'update',
          }),
        }
      );
      expect(validated.status).toBe(200);
      const vBody = (await validated.json()) as {
        canCommit: boolean;
        mappingFingerprint: string;
        preview: { validClientCount: number };
      };
      expect(vBody.canCommit).toBe(true);

      const bLogin = await login(fixture.ownerB.email, fixture.ownerB.password);
      const cross = await fetch(
        `${server.baseUrl}/api/import/session/${upBody.sessionId}/commit`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie: bLogin.cookie!,
          },
          body: JSON.stringify({
            confirm: true,
            mappingFingerprint: vBody.mappingFingerprint,
          }),
        }
      );
      expect(cross.status).toBe(404);

      const commit = await fetch(
        `${server.baseUrl}/api/import/session/${upBody.sessionId}/commit`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie: aLogin.cookie!,
          },
          body: JSON.stringify({
            confirm: true,
            mappingFingerprint: vBody.mappingFingerprint,
          }),
        }
      );
      expect(commit.status).toBe(200);
      const committed = (await commit.json()) as {
        report: { clientsCreated: number };
        ledger: { clients: Array<{ pan: string }> };
      };
      expect(committed.report.clientsCreated).toBeGreaterThanOrEqual(1);
      expect(
        committed.ledger.clients.some((c) => c.pan === 'ZZAPA0002B')
      ).toBe(true);

      const bLedger = await fetch(`${server.baseUrl}/api/ledger`, {
        headers: { cookie: bLogin.cookie! },
      });
      const bBody = (await bLedger.json()) as {
        clients: Array<{ pan: string }>;
      };
      expect(bBody.clients.some((c) => c.pan === 'ZZAPA0002B')).toBe(true);
    });
  }
);
