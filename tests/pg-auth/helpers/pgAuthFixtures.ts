/**
 * Seed / cleanup helpers for two owner accounts in one organization.
 * Seed and cleanup each run in a single transaction.
 * Scoped deletes only (no TRUNCATE / DROP). Never log passwords or hashes.
 */
import type pg from 'pg';
import crypto from 'crypto';
import { hashSecret } from '../../../authCrypto.ts';

export type PgAuthOwnerCreds = {
  id: string;
  email: string;
  /** Plaintext password for the test process only — never log. */
  password: string;
};

export type PgAuthTwoOwnerFixture = {
  organizationId: string;
  organizationName: string;
  ownerA: PgAuthOwnerCreds;
  ownerB: PgAuthOwnerCreds;
};

const DEFAULT_ORG_NAME = 'PG Auth Test Organization';
const DEFAULT_OWNER_A_EMAIL = 'pg-auth-owner-a@example.com';
const DEFAULT_OWNER_B_EMAIL = 'pg-auth-owner-b@example.com';
const DEFAULT_OWNER_A_PASSWORD = 'PgAuth-OwnerA-Pass!99';
const DEFAULT_OWNER_B_PASSWORD = 'PgAuth-OwnerB-Pass!99';

type DbClient = {
  query: (
    text: string,
    values?: unknown[]
  ) => Promise<pg.QueryResult<Record<string, unknown>>>;
};

type DbPool = {
  connect: () => Promise<DbClient & { release: () => void }>;
};

async function withTransaction<T>(
  pool: DbPool,
  fn: (client: DbClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    try {
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  } finally {
    client.release();
  }
}

/**
 * Create one organization, two owner users, and membership rows (role = owner)
 * in a single transaction.
 */
export async function seedTwoOwnerOrganization(
  pool: DbPool,
  options?: {
    organizationName?: string;
    ownerAEmail?: string;
    ownerBEmail?: string;
    ownerAPassword?: string;
    ownerBPassword?: string;
  }
): Promise<PgAuthTwoOwnerFixture> {
  const organizationName = options?.organizationName || DEFAULT_ORG_NAME;
  const ownerAEmail = (options?.ownerAEmail || DEFAULT_OWNER_A_EMAIL)
    .trim()
    .toLowerCase();
  const ownerBEmail = (options?.ownerBEmail || DEFAULT_OWNER_B_EMAIL)
    .trim()
    .toLowerCase();
  const ownerAPassword = options?.ownerAPassword || DEFAULT_OWNER_A_PASSWORD;
  const ownerBPassword = options?.ownerBPassword || DEFAULT_OWNER_B_PASSWORD;

  if (ownerAEmail === ownerBEmail) {
    throw new Error('Owner emails must be distinct.');
  }

  return withTransaction(pool, async (client) => {
    const orgRes = await client.query(
      `INSERT INTO organizations (name)
       VALUES ($1)
       RETURNING id`,
      [organizationName]
    );
    const organizationId = String(orgRes.rows[0].id);

    const ownerA = await insertOwnerUser(client, ownerAEmail, ownerAPassword);
    const ownerB = await insertOwnerUser(client, ownerBEmail, ownerBPassword);

    await client.query(
      `INSERT INTO organization_members (organization_id, user_id, role)
       VALUES ($1::uuid, $2::uuid, 'owner')`,
      [organizationId, ownerA.id]
    );
    await client.query(
      `INSERT INTO organization_members (organization_id, user_id, role)
       VALUES ($1::uuid, $2::uuid, 'owner')`,
      [organizationId, ownerB.id]
    );

    return {
      organizationId,
      organizationName,
      ownerA: { id: ownerA.id, email: ownerAEmail, password: ownerAPassword },
      ownerB: { id: ownerB.id, email: ownerBEmail, password: ownerBPassword },
    };
  });
}

async function insertOwnerUser(
  client: DbClient,
  email: string,
  password: string
): Promise<{ id: string }> {
  const passwordHashed = hashSecret(password);
  const recoveryHashed = hashSecret(
    crypto.randomBytes(32).toString('base64url')
  );

  const res = await client.query(
    `INSERT INTO users (
       email, password_salt, password_hash, recovery_salt, recovery_hash
     ) VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      email,
      passwordHashed.salt,
      passwordHashed.hash,
      recoveryHashed.salt,
      recoveryHashed.hash,
    ]
  );
  return { id: String(res.rows[0].id) };
}

/**
 * Delete only rows belonging to the given fixture, in FK-safe order,
 * inside one transaction.
 */
export async function cleanupTwoOwnerOrganization(
  pool: DbPool,
  fixture: PgAuthTwoOwnerFixture
): Promise<void> {
  const userIds = [fixture.ownerA.id, fixture.ownerB.id];
  const orgId = fixture.organizationId;

  await withTransaction(pool, async (client) => {
    // Business rows first (explicit; also CASCADE from organizations).
    await client.query(
      `DELETE FROM gst_filings WHERE organization_id = $1::uuid`,
      [orgId]
    );
    await client.query(
      `DELETE FROM it_filings WHERE organization_id = $1::uuid`,
      [orgId]
    );
    await client.query(
      `DELETE FROM gst_companies WHERE organization_id = $1::uuid`,
      [orgId]
    );
    await client.query(
      `DELETE FROM it_clients WHERE organization_id = $1::uuid`,
      [orgId]
    );
    await client.query(
      `DELETE FROM gst_months WHERE organization_id = $1::uuid`,
      [orgId]
    );
    await client.query(
      `DELETE FROM assessment_years WHERE organization_id = $1::uuid`,
      [orgId]
    );
    await client.query(
      `DELETE FROM password_reset_challenges
       WHERE user_id = ANY($1::uuid[])`,
      [userIds]
    );
    await client.query(
      `DELETE FROM sessions
       WHERE user_id = ANY($1::uuid[])`,
      [userIds]
    );
    await client.query(
      `DELETE FROM organization_members
       WHERE organization_id = $1::uuid
         AND user_id = ANY($2::uuid[])`,
      [orgId, userIds]
    );
    await client.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [
      userIds,
    ]);
    await client.query(`DELETE FROM organizations WHERE id = $1::uuid`, [
      orgId,
    ]);
  });
}
