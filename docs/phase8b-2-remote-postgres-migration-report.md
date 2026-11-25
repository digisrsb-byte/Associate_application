# Phase 8B.2 — Production-Safe Remote PostgreSQL Migration Infrastructure

**Date:** 2026-11-25  
**Scope:** Explicit remote/managed PostgreSQL migrate + read-only preflight authorization  
**Not done:** production connections, production migrate, owner provisioning, ledger import, deploy, cutover

---

## Existing protections (preserved)

Before 8B.2, and still the **default**:

| Control | Behaviour |
| --- | --- |
| Localhost-only | `assertSafeDatabaseTarget` refuses non-loopback hosts |
| Allowlisted DB names | Local migrate: `it_gst_management_dev` / `it_gst_management_test` |
| Confirm env | `DB_MIGRATE_CONFIRM` must match connected database |
| Test URL isolation | Test migrate uses `PG_AUTH_TEST_DATABASE_URL` only (never falls back to `DATABASE_URL`) |
| Transactional migrate | Each pending file in `BEGIN` … `COMMIT` / `ROLLBACK` with `schema_migrations` insert |
| No startup migrate | Application server never invokes migrate scripts |
| Password redaction | Logs use `user:***@host/db` only |
| Rollback | Remains **localhost-only** (no remote rollback path in this phase) |
| Import/verify | Unchanged — still localhost Phase 2 gates (out of 8B.2 scope) |

---

## Changes implemented

| File | Change |
| --- | --- |
| `scripts/db-safety.mjs` | Remote multi-gate auth, SSL helpers, forbidden remote names, parse/redact helpers |
| `scripts/db-migrate.mjs` | `DB_TARGET_MODE=local\|remote` branch; remote uses TLS client config |
| `scripts/db-preflight.mjs` | **New** read-only identity/connectivity check |
| `scripts/db-rollback.mjs` | Uses `clientConfig`; still localhost-only |
| `src/db/pool.ts` | TLS-aware pool via shared `buildPgClientConfig` |
| `package.json` | `db:preflight` script |
| `.env.example` | Documents remote env names (no secrets) |
| `db/README.md` | Remote/preflight notes |
| `tests/unit/dbSafety.test.ts` | **New** gate/SSL unit coverage |

---

## New safety controls (remote)

Remote path is **off** unless `DB_TARGET_MODE=remote`.

Independent confirmations required for **remote migrate**:

1. `DB_TARGET_MODE=remote`
2. `DB_APPROVED_REMOTE_HOST` — exact hostname match to `DATABASE_URL`
3. `DB_APPROVED_REMOTE_DATABASE` — exact DB name match (not `it_gst_management_dev|test|postgres|template0|template1`)
4. `DB_MIGRATE_CONFIRM` — same exact DB name
5. `DB_REMOTE_MIGRATE_ACK=I_UNDERSTAND_THIS_MODIFIES_REMOTE_SCHEMA`
6. `DB_REMOTE_MIGRATE_TOKEN=MIGRATE_REMOTE_<exact_db_name>`
7. TLS: `sslmode=require|verify-ca|verify-full` on URL **or** `DB_REMOTE_SSL_MODE` / `PGSSLMODE` to one of those values

Additional hard refuses:

- Loopback host while `DB_TARGET_MODE=remote`
- `DATABASE_URL` equal to `PG_AUTH_TEST_DATABASE_URL`
- Using local-only DB names as remote confirm values
- Missing/incorrect any of the above gates

**Remote preflight** uses the same host/database/TLS/confirm gates but does **not** require migrate ACK/token (read-only).

---

## SSL/TLS handling

| Mode | Behaviour |
| --- | --- |
| Local default | SSL not required |
| Remote | SSL **required**; client uses `{ rejectUnauthorized: true }` |
| Prefer | URL `sslmode=verify-full` (or `verify-ca`) with proper CA (`NODE_EXTRA_CA_CERTS` if needed) |
| Refuse | Remote with no SSL mode / `sslmode=disable` |

`src/db/pool.ts` applies the same TLS construction when the URL/env requests require/verify-* (does not force SSL for plain local URLs).

---

## Test results

| Check | Result |
| --- | --- |
| `tests/unit/dbSafety.test.ts` | **22 passed** |
| Full `npm run test:unit` | **187 passed**, **2 skipped** (existing Windows chmod skips) |
| Local `npm run db:preflight` (`it_gst_management_dev`) | **Pass** — read-only; listed `001_foundation` |
| Local `npm run db:migrate` | **Pass** — applied pending `002_password_reset_challenges` on local dev DB |
| Migrate without confirm | **Refused** |
| Remote migrate without approved host | **Refused** |
| Remote migrate with local-only DB name | **Refused** |
| Preflight without confirm | **Refused** |
| Production DB connection | **Not attempted** |
| Secret leakage in script logs | Passwords appear only as `***` in redacted URL summaries |

`npm run lint` (`tsc --noEmit`) still reports pre-existing issues in unrelated e2e/pg-auth files; the new dbSafety assertion typing was fixed. No new auth/UI/business logic regressions in unit suite.

---

## Remaining limitations

- Remote **rollback** not implemented (intentional).
- Ledger **import/verify** still localhost-only (later phase).
- No automatic CA bundle management for every cloud vendor.
- Operators must still provision the empty remote database themselves (scripts never `CREATE DATABASE`).
- Application runtime cutover (`AUTH_BACKEND` / `BUSINESS_DATA_BACKEND`) is **not** part of 8B.2.
- Owner provisioning still not implemented.

---

## Exact future operator procedure (when authorized)

**Do not run against production until explicitly approved.**

### A. Read-only preflight (remote)

```powershell
$env:DB_TARGET_MODE="remote"
$env:DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require"
$env:DB_APPROVED_REMOTE_HOST="HOST"
$env:DB_APPROVED_REMOTE_DATABASE="DBNAME"
$env:DB_PREFLIGHT_CONFIRM="DBNAME"
# optional if URL lacks sslmode:
# $env:DB_REMOTE_SSL_MODE="require"
npm run db:preflight
```

### B. Schema migrate (remote)

After successful preflight and backup policy confirmation:

```powershell
$env:DB_TARGET_MODE="remote"
$env:DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require"
$env:DB_APPROVED_REMOTE_HOST="HOST"
$env:DB_APPROVED_REMOTE_DATABASE="DBNAME"
$env:DB_MIGRATE_CONFIRM="DBNAME"
$env:DB_REMOTE_MIGRATE_ACK="I_UNDERSTAND_THIS_MODIFIES_REMOTE_SCHEMA"
$env:DB_REMOTE_MIGRATE_TOKEN="MIGRATE_REMOTE_DBNAME"
npm run db:migrate
```

### C. Local development (unchanged)

```powershell
$env:DB_TARGET_MODE="local"   # or unset
$env:DB_MIGRATE_CONFIRM="it_gst_management_dev"
npm run db:migrate
```

---

## Stop line

Phase **8B.2 complete**. No production migration performed. Phase **8B.3+** not started.
