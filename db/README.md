# PostgreSQL (Phase 1)

Empty foundation schema for local development only.

## Target database

- Host: `localhost` / `127.0.0.1`
- Database: `it_gst_management_dev`
- JSON (`data/ledger.json`) remains the **live** application store until a later phase.

## Setup

1. Ensure PostgreSQL is running and database `it_gst_management_dev` exists.
2. Put secrets in **local** `.env` (gitignored), for example:

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/it_gst_management_dev
```

3. Apply the empty schema:

```powershell
$env:DB_MIGRATE_CONFIRM="it_gst_management_dev"
npm run db:migrate
```

4. Rollback (only if business tables are empty and only `001_foundation` is applied):

```powershell
$env:DB_ROLLBACK_CONFIRM="it_gst_management_dev"
npm run db:rollback
```

## Safety

- **Default:** scripts refuse non-localhost hosts and only allowlisted local DB names (`it_gst_management_dev` / test via separate URL).
- Migrate/rollback/preflight require matching confirm env vars.
- Rollback remains **localhost-only** (no remote rollback path in Phase 8B.2).
- Rollback refuses if later migrations exist or any business table has rows.
- Scripts never `DROP DATABASE` or `DROP SCHEMA public`.
- Logs redact passwords from `DATABASE_URL`.
- Application startup **never** runs migrations.

## Phase 8B.2 — remote/managed migrate (explicit authorization)

Off by default (`DB_TARGET_MODE=local`). Remote migrate requires independent env confirmations (host, database, migrate confirm, ACK phrase, token, TLS). See `docs/phase8b-2-remote-postgres-migration-report.md`.

Read-only check (local or authorized remote):

```powershell
$env:DB_PREFLIGHT_CONFIRM="it_gst_management_dev"
npm run db:preflight
```

## Phase 8B.3 — two-owner provisioning

Operator CLI only (`npm run db:provision-owners`). Creates **one** organization and **two** owner logins that share it. Passwords are interactive (never argv). See `docs/phase8b-3-two-owner-provisioning-report.md`.

## Files

| File | Purpose |
|------|---------|
| `migrations/001_foundation.sql` | Create empty tables |
| `migrations/001_foundation_down.sql` | Drop those tables |
| `migrations/002_password_reset_challenges.sql` | Password-reset challenge table |
| `migrations/003_gst_payment_lines.sql` | GST payment lines + `unallocated_received` |
| `migrations/004_gst_filing_received_mode.sql` | Filing `payments_present` + `legacy_received` (Option D) |
| `migrations/004_gst_filing_received_mode_down.sql` | Manual down for 004 only (scripted rollback still foundation-only) |
| `../scripts/db-migrate.mjs` | Apply up (local default; optional authorized remote) |
| `../scripts/db-preflight.mjs` | Read-only connectivity / identity check |
| `../scripts/db-rollback.mjs` | Apply down (localhost only) |
| `../scripts/db-safety.mjs` | Shared safety + remote authorization gates |
| `../src/db/pool.ts` | Pool helper (TLS-aware from URL/env) |

## Phase 2 — ledger import

See [PHASE2_IMPORT.md](./PHASE2_IMPORT.md) for JSON → PostgreSQL import/verify commands and the refuse-if-not-empty safety policy.

**Runtime defaults:** local `npm run dev` may use `AUTH_BACKEND=json` / `BUSINESS_DATA_BACKEND=json`.  
**Production (`npm start`):** requires `AUTH_BACKEND=postgres` and `BUSINESS_DATA_BACKEND=postgres` plus `DATABASE_URL` and `AUTH_ORGANIZATION_ID` — JSON is not a silent production fallback.

## Phase 8C.2 — local PostgreSQL dump tooling

Local disposable dump preparation only (`npm run db:backup-pg-local`). Default is **dry-run** (no `pg_dump`). Remote/production targets are refused. Output directories inside the Git tree or OneDrive are refused. See `docs/phase8c-2-postgres-backup-tooling-report.md`.

## Phase 8C.3 — disposable restore drill

Synthetic-only drill DBs: `it_gst_management_restore_drill`, `it_gst_management_backup_drill`. Orchestrator: `scripts/phase8c3-restore-drill.mjs`. Report: `docs/phase8c-3-postgres-restore-drill-report.md`. Do not drop those databases without separate approval.
