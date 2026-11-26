/**
 * PostgreSQL user lookup for Phase 3 authentication.
 * Never log passwords, salts, or hashes.
 */
import type { DbPool } from './passwordResetStore.ts';

export type AuthUserRow = {
  id: string;
  email: string;
  passwordSalt: string;
  passwordHash: string;
};

/**
 * Find a user by case-insensitive email who is an owner of the given organization.
 */
export async function findOwnerByEmail(
  pool: DbPool,
  organizationId: string,
  email: string
): Promise<AuthUserRow | null> {
  const normalized = String(email || '')
    .trim()
    .toLowerCase();
  if (!normalized) return null;

  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT u.id, u.email, u.password_salt, u.password_hash
       FROM users u
       INNER JOIN organization_members m
         ON m.user_id = u.id
        AND m.organization_id = $1::uuid
        AND m.role = 'owner'
       WHERE LOWER(u.email) = $2
       LIMIT 1`,
      [organizationId, normalized]
    );
    if (!res.rowCount) return null;
    const row = res.rows[0];
    return {
      id: String(row.id),
      email: String(row.email).trim().toLowerCase(),
      passwordSalt: String(row.password_salt),
      passwordHash: String(row.password_hash),
    };
  } finally {
    client.release();
  }
}

/** True if the user is an owner member of the organization. */
export async function userIsOrgOwner(
  pool: DbPool,
  organizationId: string,
  userId: string
): Promise<boolean> {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT 1
       FROM organization_members
       WHERE organization_id = $1::uuid
         AND user_id = $2::uuid
         AND role = 'owner'
       LIMIT 1`,
      [organizationId, userId]
    );
    return (res.rowCount || 0) > 0;
  } finally {
    client.release();
  }
}
