# Phase 4 — Shared IT/GST Business Data Integration

## Architecture

| Layer | JSON mode (default) | PostgreSQL mode |
| --- | --- | --- |
| Selection | `BUSINESS_DATA_BACKEND=json` (or unset) | `BUSINESS_DATA_BACKEND=postgres` |
| Prerequisites | none | `AUTH_BACKEND=postgres`, `AUTH_ORGANIZATION_ID`, `DATABASE_URL` |
| Load | `readLedger()` → `data/ledger.json` | `loadLedgerForOrganization(pool, orgId)` |
| Save | `writeLedger()` atomic file replace | `saveLedgerForOrganization` transactional DELETE+INSERT |
| Organization | N/A (single-file ledger) | Always `AUTH_ORGANIZATION_ID` from server env — never from the browser |
| Fail behaviour | existing | Fail closed at startup if misconfigured; runtime DB errors propagate (no JSON fallback) |

Both owners authenticate separately. Shared visibility comes from membership in the same organization (`organization_members`) and every business query filtering on that `organization_id`.

## JSON ↔ PostgreSQL field map

| JSON (`LedgerState`) | PostgreSQL (001) |
| --- | --- |
| `assessmentYears[]` | `assessment_years (organization_id, label)` |
| `gstMonths[]` | `gst_months (organization_id, label)` |
| `clients[]` → IT | `it_clients` + nested `it_filings` |
| `clients[].passwordEnc` | `it_clients.password_enc` |
| `clients[].password` (legacy plaintext) | **not stored** (normalized away before persist) |
| `gstClients[]` | `gst_companies` |
| `gstClients[].userId` | `gst_companies.portal_user_id` |
| `gstClients[].passwordEnc` | `gst_companies.password_enc` |
| Filing fees/received/balance | columns on `it_filings` / `gst_filings` (no separate payments table) |

## Schema gaps vs JSON ledger (additive only — **not executed in Phase 4**)

Existing 001/002 schema is **sufficient** for full-ledger RMW parity used by current APIs.

Documented non-blockers (no migration prepared unless cutover requires them):

1. **`row_version` unused** — present on `it_clients` / `gst_companies`; Phase 4 uses full-ledger transactional replace (same concurrency model as JSON). Optimistic concurrency would need API redesign.
2. **No dedicated payments table** — payment fields live on filings in both JSON and PG; intentional.
3. **Legacy plaintext `password`** — JSON-only transient; PG stores `password_enc` only.
4. **Catalog FK on filings** — save inserts catalog labels before filings (matches import scripts). Empty catalog years/months without filings are preserved.
5. **JSON encrypted backup/restore** — intentionally **refused** while `BUSINESS_DATA_BACKEND=postgres` (409). DB-native backup is out of scope for Phase 4.

No additive migration files were created: none are required to implement org-scoped load/save against 001.

## Concurrency (Phase 4B)

Full-ledger replace alone can lose updates when two owners RMW from the same snapshot.
Correction (no migration required):

1. Opaque **ledger revision** fingerprint over all org-scoped business rows.
2. `saveLedgerForOrganization` requires `expectedRevision`; mismatch → `LedgerConflictError`.
3. Organization row `FOR UPDATE` + `pg_advisory_xact_lock` for the save transaction.
4. `mutateLedgerForOrganization` / `mutateBusinessLedger` re-apply the mutator on a fresh clone and retry.

## Safety constraints observed

- Did not modify `data/ledger.json`, `data/auth.json`, backups, or recovery keys for cutover.
- Phase 4B uses only `it_gst_management_test` via `PG_AUTH_TEST_DATABASE_URL` (never ambient `DATABASE_URL`).
- Did not run migrations during Phase 4B.
- Default remains JSON; production cutover not performed.
