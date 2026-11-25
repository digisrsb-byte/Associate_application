# Phase 8B.3 — Secure Production Organization and Two-Owner Provisioning

**Date:** 2026-11-25  
**Scope:** Operator-only CLI to create one shared organization and two owner logins in PostgreSQL  
**Not done:** production DB use, real owner creation on prod, ledger import, backend cutover, deploy, UI, HTTP registration

---

## Architecture

```text
Operator (TTY)
   │  PROVISION_ORG_NAME / OWNER emails (env)
   │  passwords via hidden interactive prompts (never argv)
   ▼
npm run db:provision-owners
   │  DB_PROVISION_CONFIRM + local|remote safety gates (8B.2)
   ▼
BEGIN
  → organizations (1 row)
  → users (Owner A + Owner B)  scrypt hash via authCrypto.hashSecret
  → organization_members (role=owner for both, same organization_id)
COMMIT  (ROLLBACK on any failure)
   │
   ▼
Print organization_id + owner ids/emails (never passwords)
   → operator sets AUTH_ORGANIZATION_ID in server env (not Git)
```

Both owners authenticate independently (`findOwnerByEmail` + org membership) and see the **same** org-scoped IT/GST data when `BUSINESS_DATA_BACKEND=postgres` (cutover is a later phase).

No public HTTP registration. Bootstrap remains disabled under `AUTH_BACKEND=postgres`.

---

## Files changed

| File | Purpose |
| --- | --- |
| `scripts/provision-two-owners-lib.ts` | Transactional provision core + validation |
| `scripts/provision-two-owners.ts` | Operator CLI (interactive passwords) |
| `scripts/db-safety.mjs` | Remote `provision` ACK/token gates |
| `package.json` | `db:provision-owners` |
| `.env.example` | Env name documentation |
| `db/README.md` | Pointer to this phase |
| `tests/unit/provisionTwoOwners.test.ts` | Mocked unit coverage |
| `tests/pg-auth/provisionTwoOwners.pg.test.ts` | Local test-DB integration |

---

## Provisioning CLI usage

### Local test DB (preferred for dry runs)

```powershell
$env:DB_TARGET_MODE="local"
$env:DB_PROVISION_CONFIRM="it_gst_management_test"
$env:PROVISION_ORG_NAME="SRSB Associate Shared"
$env:PROVISION_OWNER_A_EMAIL="owner.a@example.com"
$env:PROVISION_OWNER_B_EMAIL="owner.b@example.com"
npm run db:provision-owners
```

Uses `PG_AUTH_TEST_DATABASE_URL` only (never falls back to `DATABASE_URL`).

### Local dev DB

```powershell
$env:DB_PROVISION_CONFIRM="it_gst_management_dev"
# … org + emails …
npm run db:provision-owners
```

### Authorized remote (future — do not run against production until approved)

Requires 8B.2 remote identity + TLS plus:

- `DB_REMOTE_PROVISION_ACK=I_UNDERSTAND_THIS_PROVISIONS_OWNERS`
- `DB_REMOTE_PROVISION_TOKEN=PROVISION_REMOTE_<exact_db_name>`
- `DB_PROVISION_CONFIRM=<exact_db_name>`

Passwords are prompted twice each (create + confirm), never echoed, never accepted as CLI arguments.

---

## Security controls

| Control | Behaviour |
| --- | --- |
| No HTTP registration | CLI only |
| No argv passwords | Refused if `--password` / `password=` seen |
| Interactive TTY passwords | Required for CLI |
| Hashing | Existing `hashSecret` (scrypt) + random recovery material |
| Policy | Existing `validatePasswordPolicy` |
| Parameterized SQL | Yes |
| Log hygiene | Redacted URL; no passwords/hashes/tokens printed |
| Remote refuse | Multi-gate host/db/ACK/token/TLS |
| No password overwrite | Idempotent path never updates hashes |
| No auto-attach | Partial/conflict states require operator intervention |

---

## Database transaction behaviour

| Scenario | Result |
| --- | --- |
| Fresh org + two new emails | `created` inside one transaction |
| Mid-flight failure | `ROLLBACK` — no half-org |
| Both emails already owners of one shared org | `already_provisioned` (no writes) |
| One email exists, other missing | Refuse |
| Both emails exist, no shared org | Refuse |
| Org name exists without both owners | Refuse |
| Duplicate email on new org attempt | Refuse |

---

## Test results

| Suite | Result |
| --- | --- |
| `tests/unit/provisionTwoOwners.test.ts` | **Pass** (included in unit run) |
| Full `npm run test:unit` | **197 passed**, **2 skipped** (existing Windows chmod skips) |
| `tests/pg-auth/provisionTwoOwners.pg.test.ts` | **3 passed** on local `it_gst_management_test` |
| Remote provision without approved host | **Refused** |
| Production database | **Not contacted** |
| Real production owners | **Not created** |

Integration coverage on test DB: one org, two owners, `role=owner`, independent hash verify, idempotent retry leaves hashes unchanged, shared ledger row visible to both owner lookups, partial duplicate refused.

---

## Future production operator instructions

1. Complete remote migrate + preflight (8B.2) on the approved managed database.  
2. Set remote provision env gates + `PROVISION_ORG_NAME` / owner emails.  
3. Run `npm run db:provision-owners` on a secure operator workstation (TTY).  
4. Record printed `organization_id` as `AUTH_ORGANIZATION_ID` in the server secret store.  
5. Do **not** commit passwords or `.env` values.  
6. Later phase: switch `AUTH_BACKEND` / `BUSINESS_DATA_BACKEND` to postgres and host over HTTPS.

---

## Remaining limitations

- No SMTP / hosted password-reset channel (still filesystem OOB for resets).  
- No remote rollback of provisioned rows (manual SQL / ops only).  
- Application cutover to postgres backends not performed.  
- Ledger import still separate.  
- Role model remains `owner` only (schema constraint).  

---

## Stop line

Phase **8B.3 complete**. No production provisioning performed. Later 8B phases not started.
