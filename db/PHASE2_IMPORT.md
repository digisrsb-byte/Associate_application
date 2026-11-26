# Phase 2 — JSON → PostgreSQL import

Offline import of `ledger.json` into the local development database.  
**The running application continues to use JSON storage** (`server.ts` is not connected to Postgres).

## Target

- Host: `localhost` / `127.0.0.1` only  
- Database: `it_gst_management_dev` only  
- Requires Phase 1 schema (`npm run db:migrate`)

## Safety policy

| Rule | Behaviour |
|------|-----------|
| Confirm env | `DB_IMPORT_CONFIRM=it_gst_management_dev` / `DB_VERIFY_CONFIRM=it_gst_management_dev` |
| Non-empty tables | **Refuse** if any business table has rows (checked **inside** the import transaction after an advisory lock) |
| Concurrent imports | `pg_advisory_xact_lock` serializes importers; second attempt waits then fails the empty-table check |
| Cleanup | Importer **never** truncates, deletes, or cascade-deletes |
| Transaction | Entire import in one `BEGIN`…`COMMIT`; failure → `ROLLBACK` |
| JSON source | **Required** `LEDGER_IMPORT_PATH` to a frozen copy (not live `data/ledger.json`); read-only; no OS temp duplicates |
| Portal passwords | `portalCrypto.ts` rules only; store `enc:v1:` or `NULL`; never plaintext |
| Logs | Counts and redacted `DATABASE_URL` only — no PAN, phone, passwords, ciphertext, or keys |

If import is refused because tables are not empty, an operator must empty the **development** database manually (outside these scripts) if that is intentional. Production databases are out of scope for these scripts.

## Prerequisites

1. Local `.env` with `DATABASE_URL` and valid `PORTAL_PASSWORD_ENCRYPTION_KEY`.  
2. Empty business tables (fresh migrate or manually emptied dev DB).  
3. Create a **frozen copy** of the ledger (outside this tool), e.g. copy `data/ledger.json` to a path such as `C:\path\to\frozen-ledger.json`.  
4. Set `LEDGER_IMPORT_PATH` to that frozen copy (required for both import and verify). Must not be the live `data/ledger.json`.

## Commands

```powershell
cd Associate_application

# Point both import and verify at the same frozen copy
$env:LEDGER_IMPORT_PATH="C:\path\to\frozen-ledger.json"

# Import (one transaction)
$env:DB_IMPORT_CONFIRM="it_gst_management_dev"
npm run import:ledger:pg

# Independent verification (same LEDGER_IMPORT_PATH)
$env:DB_VERIFY_CONFIRM="it_gst_management_dev"
npm run verify:ledger:pg
```

Optional:

```powershell
$env:IMPORT_ORG_NAME="IT GST Management"
```

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/import-ledger-to-pg.mjs` | Atomic import |
| `scripts/verify-ledger-pg.mjs` | Post-import reconciliation |
| `scripts/ledger-pg-shared.mjs` | Required `LEDGER_IMPORT_PATH` load (read-only), mapping, password rules |
| `scripts/db-safety.mjs` | Host/DB allowlist + empty-table guard |

## Target databases (Phase 2D)

| Confirm env | Database | Connection |
|-------------|----------|------------|
| `DB_IMPORT_CONFIRM` / `DB_VERIFY_CONFIRM` = `it_gst_management_dev` | `it_gst_management_dev` | `DATABASE_URL` |
| same = `it_gst_management_test` | `it_gst_management_test` | `PG_AUTH_TEST_DATABASE_URL` only (no `DATABASE_URL` fallback) |
| same = `it_gst_management_real_rehearsal` | `it_gst_management_real_rehearsal` | `PG_AUTH_TEST_DATABASE_URL` only; URL database name must match confirm exactly |

Production / other names are refused. Prefer `it_gst_management_real_rehearsal` for frozen real-ledger import rehearsals so `it_gst_management_test` (Phase 2G synthetic) stays preserved. Reset helpers remain limited to `it_gst_management_test` and are not expanded to the real-rehearsal DB.

## Mapping summary

- One `organizations` row (shared by future owners).  
- Catalogs include empty assessment years / GST months.  
- IT/GST parent ids preserved (`cli-…` / `gst-…`).  
- Filings keyed by year/month; financial values stored as in JSON.  
- GST `filings[].payments[]` → `gst_payments` (full payment-line history; requires migration `003`).  
- GST `unallocatedReceived` → `gst_companies.unallocated_received`.  
- **Option D (migration `004`)** — per filing:
  - `payments_present` = `Array.isArray(filing.payments)` (true for `[]` and non-empty arrays; false when the property is absent).
  - `legacy_received` = filing scalar `received` when `payments_present` is false (NULL when omitted; explicit `0` is stored as `0`). Always NULL when `payments_present` is true.
  - Check constraints: non-negative `legacy_received`; XOR so payment-mode filings cannot also store a legacy scalar.
- **Payment-line accounting** (any filing on the company has a `payments` array, including `[]`): company `totalReceived` must equal sum(all allocated payment lines) + `unallocatedReceived` or import/verify fail closed. Do **not** include filing-level legacy `received` in that company formula. Filing `received` on load is the sum of payment lines.
- **Legacy pool accounting** (no `payments` property on any filing): company `totalReceived` is the pool SoR; every filing-level legacy `received` is preserved in `legacy_received`. Values are not rewritten into synthetic payment lines.
- **Empty `payments: []`**: `payments_present=true`, `legacy_received=NULL`, zero `gst_payments` rows; repository load returns `payments: []`.
- Distinctions preserved end-to-end: missing `payments` | empty `[]` | non-empty array; missing legacy received | explicit zero.
- IT filing `received` stays on `it_filings` (never converted into GST payment lines; IT mapping unchanged).  
- Duplicate payment ids or per-company idempotency keys fail closed.  
- Verify detects missing/altered `payments_present`, `legacy_received`, and payment rows.  
- `users` / `sessions` / `organization_members` are **not** imported (Phase 3).

### Rollback note (004)

`004_gst_filing_received_mode_down.sql` drops the additive columns/constraints only. Scripted `db-rollback` remains foundation-only when later migrations are recorded — use the down file manually on disposable DBs. Never drop the database or `public` schema.

## After import

- Run `verify:ledger:pg` and expect `PASS`.  
- Keep using the app against JSON until a later cutover phase.  
- Retain `PORTAL_PASSWORD_ENCRYPTION_KEY`; ciphertext is useless without it.
