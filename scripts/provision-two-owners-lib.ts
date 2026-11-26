/**
 * Phase 8B.3 — Transactional two-owner provisioning for one shared organization.
 * Never logs passwords, salts, hashes, or connection secrets.
 */
import crypto from 'crypto';
import { hashSecret } from '../authCrypto.ts';
import { validatePasswordPolicy } from '../passwordPolicy.ts';

export type ProvisionOwnerInput = {
  email: string;
  password: string;
};

export type ProvisionRequest = {
  organizationName: string;
  ownerA: ProvisionOwnerInput;
  ownerB: ProvisionOwnerInput;
};

export type ProvisionedOwner = {
  id: string;
  email: string;
};

export type ProvisionResult = {
  status: 'created' | 'already_provisioned';
  organizationId: string;
  organizationName: string;
  ownerA: ProvisionedOwner;
  ownerB: ProvisionedOwner;
};

type DbClient = {
  query: (
    text: string,
    values?: unknown[]
  ) => Promise<{ rowCount: number | null; rows: Record<string, unknown>[] }>;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return String(email || '')
    .trim()
    .toLowerCase();
}

export function validateProvisionEmails(
  ownerAEmail: string,
  ownerBEmail: string
): { ownerAEmail: string; ownerBEmail: string } {
  const a = normalizeEmail(ownerAEmail);
  const b = normalizeEmail(ownerBEmail);
  if (!a || !EMAIL_RE.test(a)) {
    throw new Error('Owner A email is invalid.');
  }
  if (!b || !EMAIL_RE.test(b)) {
    throw new Error('Owner B email is invalid.');
  }
  if (a === b) {
    throw new Error('Owner A and Owner B emails must be different.');
  }
  if (a.length > 254 || b.length > 254) {
    throw new Error('Email address is too long.');
  }
  return { ownerAEmail: a, ownerBEmail: b };
}

export function validateProvisionPasswords(
  ownerA: ProvisionOwnerInput,
  ownerB: ProvisionOwnerInput
): void {
  const aPolicy = validatePasswordPolicy(ownerA.password, {
    email: ownerA.email,
  });
  if (!aPolicy.ok) {
    throw new Error(`Owner A password rejected: ${aPolicy.error}`);
  }
  const bPolicy = validatePasswordPolicy(ownerB.password, {
    email: ownerB.email,
  });
  if (!bPolicy.ok) {
    throw new Error(`Owner B password rejected: ${bPolicy.error}`);
  }
}

async function findUserByEmail(
  client: DbClient,
  email: string
): Promise<{ id: string; email: string } | null> {
  const res = await client.query(
    `SELECT id, email FROM users WHERE LOWER(email) = $1 LIMIT 1`,
    [email]
  );
  if (!res.rowCount) return null;
  return {
    id: String(res.rows[0].id),
    email: normalizeEmail(String(res.rows[0].email)),
  };
}

async function findOwnerMemberships(
  client: DbClient,
  userId: string
): Promise<{ organizationId: string; organizationName: string }[]> {
  const res = await client.query(
    `SELECT m.organization_id, o.name
     FROM organization_members m
     INNER JOIN organizations o ON o.id = m.organization_id
     WHERE m.user_id = $1::uuid AND m.role = 'owner'`,
    [userId]
  );
  return res.rows.map((row) => ({
    organizationId: String(row.organization_id),
    organizationName: String(row.name),
  }));
}

async function findOrganizationByName(
  client: DbClient,
  name: string
): Promise<{ id: string; name: string } | null> {
  const res = await client.query(
    `SELECT id, name FROM organizations WHERE name = $1 LIMIT 1`,
    [name]
  );
  if (!res.rowCount) return null;
  return { id: String(res.rows[0].id), name: String(res.rows[0].name) };
}

async function insertOwnerUser(
  client: DbClient,
  email: string,
  password: string
): Promise<string> {
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
  return String(res.rows[0].id);
}

/**
 * Provision one shared organization and two owner accounts in a single transaction.
 * Never overwrites existing passwords. Idempotent when both owners already share one org.
 */
export async function provisionTwoOwners(
  client: DbClient,
  request: ProvisionRequest
): Promise<ProvisionResult> {
  const organizationName = String(request.organizationName || '').trim();
  if (!organizationName) {
    throw new Error('Organization name is required.');
  }
  if (organizationName.length > 200) {
    throw new Error('Organization name is too long.');
  }

  const { ownerAEmail, ownerBEmail } = validateProvisionEmails(
    request.ownerA.email,
    request.ownerB.email
  );

  const ownerAInput = { email: ownerAEmail, password: request.ownerA.password };
  const ownerBInput = { email: ownerBEmail, password: request.ownerB.password };

  const existingA = await findUserByEmail(client, ownerAEmail);
  const existingB = await findUserByEmail(client, ownerBEmail);

  if (existingA && existingB) {
    const membershipsA = await findOwnerMemberships(client, existingA.id);
    const membershipsB = await findOwnerMemberships(client, existingB.id);
    const shared = membershipsA.filter((a) =>
      membershipsB.some((b) => b.organizationId === a.organizationId)
    );

    if (shared.length === 1) {
      const org = shared[0];
      if (organizationName && org.organizationName !== organizationName) {
        throw new Error(
          `Owners already share organization "${org.organizationName}" ` +
            `(id=${org.organizationId}), which does not match requested name ` +
            `"${organizationName}". Refusing automatic rename or password changes.`
        );
      }
      // Idempotent — never touch password hashes.
      return {
        status: 'already_provisioned',
        organizationId: org.organizationId,
        organizationName: org.organizationName,
        ownerA: { id: existingA.id, email: existingA.email },
        ownerB: { id: existingB.id, email: existingB.email },
      };
    }

    if (shared.length > 1) {
      throw new Error(
        'Owners already share multiple organizations. Operator intervention required.'
      );
    }

    throw new Error(
      'Both owner emails already exist but do not share a single owner organization. ' +
        'Refusing to attach, merge, or overwrite passwords. Operator intervention required.'
    );
  }

  if (existingA || existingB) {
    const which = existingA && !existingB ? ownerAEmail : ownerBEmail;
    throw new Error(
      `Partial account state: user "${which}" already exists while the other owner does not. ` +
        'Refusing to create a one-sided organization. Operator intervention required.'
    );
  }

  const existingOrg = await findOrganizationByName(client, organizationName);
  if (existingOrg) {
    throw new Error(
      `Organization name "${organizationName}" already exists (id=${existingOrg.id}) ` +
        'but the requested owners are not both members. Refusing to reuse or modify it.'
    );
  }

  // Fresh create — validate then hash passwords; never log them.
  validateProvisionPasswords(ownerAInput, ownerBInput);

  const orgRes = await client.query(
    `INSERT INTO organizations (name) VALUES ($1) RETURNING id, name`,
    [organizationName]
  );
  const organizationId = String(orgRes.rows[0].id);
  const createdOrgName = String(orgRes.rows[0].name);

  const ownerAId = await insertOwnerUser(
    client,
    ownerAEmail,
    ownerAInput.password
  );
  const ownerBId = await insertOwnerUser(
    client,
    ownerBEmail,
    ownerBInput.password
  );

  await client.query(
    `INSERT INTO organization_members (organization_id, user_id, role)
     VALUES ($1::uuid, $2::uuid, 'owner')`,
    [organizationId, ownerAId]
  );
  await client.query(
    `INSERT INTO organization_members (organization_id, user_id, role)
     VALUES ($1::uuid, $2::uuid, 'owner')`,
    [organizationId, ownerBId]
  );

  return {
    status: 'created',
    organizationId,
    organizationName: createdOrgName,
    ownerA: { id: ownerAId, email: ownerAEmail },
    ownerB: { id: ownerBId, email: ownerBEmail },
  };
}

/**
 * Run provisionTwoOwners inside BEGIN/COMMIT with full rollback on failure.
 */
export async function provisionTwoOwnersInTransaction(
  connect: () => Promise<DbClient & { release: () => void }>,
  request: ProvisionRequest
): Promise<ProvisionResult> {
  const client = await connect();
  try {
    await client.query('BEGIN');
    try {
      const result = await provisionTwoOwners(client, request);
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
