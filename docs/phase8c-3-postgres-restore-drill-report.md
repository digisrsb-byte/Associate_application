# Phase 8C.3 — Disposable Local PostgreSQL Backup & Restore Drill

**Date:** 2026-11-25  
**Mode:** Local disposable databases + synthetic demo data only  
**Approval basis:** Synthetic demo data and disposable local databases only  

**Not performed:** production/staging/remote connections, real ledger import, hosted backup enablement, deploy, commit/push, automatic database deletion.

No passwords, database URLs with secrets, encryption keys, or real customer data are printed.

---

## Verdict

# PASS — local encrypted dump → restore drill succeeded

All critical integrity and two-owner shared-organization checks passed on disposable databases.

---

## 1. Preflight

| Check | Result |
| --- | --- |
| Local PostgreSQL tools | `psql` / `pg_dump` / `pg_restore` **18.4** available |
| Loopback `DATABASE_URL` | Present (redacted in logs) |
| Drill DBs at first start | **Both absent** — create allowed |
| Mid-run interruption | First attempt failed after CREATE+migrate (wrong provision API usage); resumed with `RESUME_PHASE8C3=1` (**no DROP DATABASE**) |
| Remote/staging/prod | Not used |

### Exact database names

| Role | Name |
| --- | --- |
| Source (seed + dump) | `it_gst_management_restore_drill` |
| Target (restore only) | `it_gst_management_backup_drill` |

---

## 2. Synthetic records created (counts only)

| Item | Count / value |
| --- | --- |
| Organizations | 1 (`Phase8C3 Synthetic Drill Org`) |
| Owner accounts | 2 (`owner-a.drill@example.com`, `owner-b.drill@example.com`) |
| IT clients | 3 |
| IT filings | 4 |
| GST companies | 2 |
| GST filings | 3 |
| Assessment years | 2 |
| GST months | 2 |
| Expected IT fees / received / balance | 35 000 / 29 000 / 6 000 |
| Expected GST filing `total` / company received | 50 000 / 25 000 |
| Portal `password_enc` | None (null) — no real portal credentials |

All names/PANs/phones are clearly fake demo values.

---

## 3. Backup and encryption

| Step | Result |
| --- | --- |
| Dry-run | **PASS** — gates accepted; encrypt planned |
| Output directory | `%LOCALAPPDATA%\associate-pg-dumps` (outside project / OneDrive) |
| Execute encrypted dump | **PASS** |
| Format | `pg_dump` custom + AES-256-GCM (`ASSOCPGD1`) |
| Artifact | `pg-it_gst_management_restore_drill-20261125T064700Z.dump.enc` |
| Bytes | 27 002 |
| SHA-256 | `71b72367c57129da6b46188d6078b97f1f6d24f67787c27d008394e2d1a0cf30` |
| Manifest | Matching `.manifest.json` beside artifact |
| Key | Ephemeral dedicated `PG_DUMP_ENCRYPTION_KEY` for this drill (not printed; process-local) |

---

## 4. Restore

| Step | Result |
| --- | --- |
| Target prepared | Public schema emptied (**database not dropped**) |
| Decrypt to secure temp | **PASS** |
| `pg_restore` into target only | **PASS** (status 0) |
| Plaintext temp removed | **PASS** |
| Source DB used as restore target | **No** |

---

## 5. Two-owner shared-organization verification

| Check | Source | Target | Pass |
| --- | ---: | ---: | :---: |
| Organization count | 1 | 1 | ✓ |
| Owner memberships | 2 | 2 | ✓ |
| Both owners same org id | Yes | Yes | ✓ |
| Owner password verify (synthetic, not printed) | — | A+B OK | ✓ |

Owners authenticate as **separate** users and share **one** organization after restore.

---

## 6. Integrity checks (source vs target)

| Check | Pass |
| --- | :---: |
| Migrations `001_foundation`, `002_password_reset_challenges` | ✓ |
| IT / GST / filing counts match | ✓ |
| IT fee / received / balance aggregates | ✓ |
| GST total / received aggregates | ✓ |
| Duplicate IT/GST ids | 0 / 0 ✓ |
| Orphan filings (FK) | 0 / 0 ✓ |
| `allCriticalPassed` | **true** |

Supporting machine-readable summary (synthetic only): `docs/phase8c-3-drill-results.json`.

---

## 7. Tooling / test results

| Suite | Result |
| --- | --- |
| `tests/unit/dbSafety.test.ts` + `pgDumpBackup.test.ts` | **48 passed** |
| Drill orchestration | `scripts/phase8c3-restore-drill.mjs` |

### Code updates required for the drill (local-only)

| Change | Purpose |
| --- | --- |
| `ALLOWED_DISPOSABLE_DRILL_DB_NAMES` in `db-safety.mjs` | Local migrate/provision allowlist; also **forbidden** as remote targets |
| `rewriteDatabaseUrl` | Point local URL at drill DB name without new secrets |
| `db-migrate.mjs` / `provision-two-owners.ts` | Accept drill confirms on localhost only |

Backend defaults (`AUTH_BACKEND` / `BUSINESS_DATA_BACKEND`) were **not** changed.

---

## 8. Cleanup status

| Item | Status |
| --- | --- |
| Plaintext temp dump / decrypt dir | **Removed** after restore |
| Encrypted drill artifact + manifest | **Retained** under `%LOCALAPPDATA%\associate-pg-dumps` |
| `it_gst_management_restore_drill` | **Retained** (not deleted) |
| `it_gst_management_backup_drill` | **Retained** (not deleted) |
| Real business DBs / recovery trees | **Untouched** |

**Awaiting separate approval before any `DROP DATABASE` of the two drill databases.**

---

## 9. Remaining production-readiness gaps (untested / not done)

| Gap | Status |
| --- | --- |
| Managed/hosting provider automated backups | **Not enabled / not tested** |
| Staging restore-to-new-instance drill | **Not done** |
| Production backup schedule | **Not implemented** |
| Offsite retention automation | **Not implemented** |
| Remote dump tooling | **Intentionally refused** (8C.2 design) |
| Import of approved real ledger (153455) into PG | **Blocked** on business Gate 0 + org-aware import |
| Hosted password-reset channel | **Still BLOCKED** (Phase 8A) |
| Full HTTP UI smoke with both owners against restored DB | **Not run** (DB-level auth verify only) |
| Key escrow runbook for long-lived dump keys | **Operational follow-up** |

---

## 10. Distinction: verified vs untested

| Verified in this drill | Untested |
| --- | --- |
| Local `pg_dump` custom format | Provider snapshots / PITR |
| Dedicated dump key encrypt/decrypt | Production dump key escrow drills |
| Restore into second empty local DB | In-place production restore |
| Two-owner + shared org + synthetic ledger counts | Real business data recovery |
| FK / duplicate / aggregate checks | HTTPS hosted app end-to-end |

---

## Stop line

Phase **8C.3** complete — disposable local backup/restore drill **PASS**.  

**Databases retained:** `it_gst_management_restore_drill`, `it_gst_management_backup_drill` — ask before cleanup.  
**No staging/production access. No real business data imported. No deploy.**
