/**
 * HTTP integration tests for AUTH_BACKEND=postgres against it_gst_management_test only.
 * Spawns an API-only server; never uses ambient DATABASE_URL / it_gst_management_dev.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { postgresResetTokenPath } from '../../src/auth/resetTokenDelivery.ts';
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
  readResetTokenFromFile,
  startPgAuthHttpServer,
  type PgAuthHttpServerHandle,
} from './helpers/pgAuthHttpServer.ts';
import type pg from 'pg';

const canRun = (() => {
  try {
    assertPgAuthTestTarget(process.env);
    return true;
  } catch {
    return false;
  }
})();

const HTTP_PORT = 3199;

describe.skipIf(!canRun)('pg-auth HTTP authentication (real test DB)', () => {
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
      ownerAEmail: 'http-owner-a@example.com',
      ownerBEmail: 'http-owner-b@example.com',
      ownerAPassword: 'Http-OwnerA-Pass!99',
      ownerBPassword: 'Http-OwnerB-Pass!99',
    });

    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'associate-pg-auth-http-'));
    server = await startPgAuthHttpServer({
      testDatabaseUrl,
      organizationId: fixture.organizationId,
      dataDir,
      port: HTTP_PORT,
    });
  }, 60_000);

  afterAll(async () => {
    if (server) await server.stop();
    if (fixture && pool) await cleanupTwoOwnerOrganization(pool, fixture);
    if (pool) await closePgAuthTestPool(pool);
    if (dataDir && fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, 30_000);

  async function login(
    email: string,
    password: string
  ): Promise<{ status: number; cookie: string | null; body: unknown }> {
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

  async function me(cookie: string | null) {
    const res = await fetch(`${server.baseUrl}/api/auth/me`, {
      headers: cookie ? { cookie } : {},
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  }

  async function logout(cookie: string | null) {
    const res = await fetch(`${server.baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: cookie ? { cookie } : {},
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }

  it('reports postgres setup-status without bootstrap', async () => {
    const res = await fetch(`${server.baseUrl}/api/auth/setup-status`);
    expect(res.ok).toBe(true);
    const body = (await res.json()) as {
      authBackend?: string;
      bootstrapRequired?: boolean;
    };
    expect(body.authBackend).toBe('postgres');
    expect(body.bootstrapRequired).toBe(false);
  });

  it('logs in Owner A and Owner B with independent sessions', async () => {
    const a = await login(fixture.ownerA.email, fixture.ownerA.password);
    const b = await login(fixture.ownerB.email, fixture.ownerB.password);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.cookie).toBeTruthy();
    expect(b.cookie).toBeTruthy();
    expect(a.cookie).not.toBe(b.cookie);

    const meA = await me(a.cookie);
    const meB = await me(b.cookie);
    expect(meA.status).toBe(200);
    expect(meB.status).toBe(200);
    expect((meA.body as { email?: string }).email).toBe(fixture.ownerA.email);
    expect((meB.body as { email?: string }).email).toBe(fixture.ownerB.email);
  });

  it('rejects invalid credentials', async () => {
    const bad = await login(fixture.ownerA.email, 'Wrong-Password-Not-Real!00');
    expect(bad.status).toBe(401);
    expect(bad.cookie).toBeNull();
  });

  it('logout revokes only the current user session', async () => {
    const a = await login(fixture.ownerA.email, fixture.ownerA.password);
    const b = await login(fixture.ownerB.email, fixture.ownerB.password);
    expect(a.cookie && b.cookie).toBeTruthy();

    const out = await logout(a.cookie);
    expect(out.status).toBe(200);

    const meA = await me(a.cookie);
    const meB = await me(b.cookie);
    expect(meA.status).toBe(401);
    expect(meB.status).toBe(200);
    expect((meB.body as { email?: string }).email).toBe(fixture.ownerB.email);
  });

  it('rejects expired sessions', async () => {
    const a = await login(fixture.ownerA.email, fixture.ownerA.password);
    expect(a.cookie).toBeTruthy();

    const client = await pool.connect();
    try {
      await client.query(
        `UPDATE sessions
         SET expires_at = NOW() - INTERVAL '1 minute'
         WHERE user_id = $1::uuid
           AND revoked_at IS NULL`,
        [fixture.ownerA.id]
      );
    } finally {
      client.release();
    }

    const meA = await me(a.cookie);
    expect(meA.status).toBe(401);
  });

  it('password reset invalidates only Owner A sessions; Owner B remains; replay rejected', async () => {
    const a = await login(fixture.ownerA.email, fixture.ownerA.password);
    const b = await login(fixture.ownerB.email, fixture.ownerB.password);
    expect(a.cookie && b.cookie).toBeTruthy();

    const forgot = await fetch(`${server.baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: fixture.ownerA.email }),
    });
    expect(forgot.ok).toBe(true);
    const forgotBody = (await forgot.json()) as { token?: string };
    expect(forgotBody.token).toBeUndefined();

    const tokenPath = postgresResetTokenPath(dataDir, fixture.ownerA.email);
    expect(fs.existsSync(tokenPath)).toBe(true);
    const token = readResetTokenFromFile(tokenPath);

    const newPass = 'Http-OwnerA-ResetPass!99';
    const reset = await fetch(`${server.baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: fixture.ownerA.email,
        token,
        newPassword: newPass,
        confirmPassword: newPass,
      }),
    });
    expect(reset.ok).toBe(true);

    const meA = await me(a.cookie);
    const meB = await me(b.cookie);
    expect(meA.status).toBe(401);
    expect(meB.status).toBe(200);

    const replay = await fetch(`${server.baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: fixture.ownerA.email,
        token,
        newPassword: 'Http-OwnerA-Replay!99',
        confirmPassword: 'Http-OwnerA-Replay!99',
      }),
    });
    expect(replay.status).toBe(401);

    // Owner A can log in with the new password; keep fixture password in sync for later tests.
    const a2 = await login(fixture.ownerA.email, newPass);
    expect(a2.status).toBe(200);
    fixture.ownerA.password = newPass;
  });

  it('rejects revoked session cookies after logout', async () => {
    const a = await login(fixture.ownerA.email, fixture.ownerA.password);
    expect(a.cookie).toBeTruthy();
    await logout(a.cookie);
    const meA = await me(a.cookie);
    expect(meA.status).toBe(401);
  });
});
