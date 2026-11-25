# Phase 8C.1 — PostgreSQL Backup & Restore Readiness Audit

**Date:** 2026-11-25  
**Mode:** Strictly read-only (code and documentation inspection only)  
**Intended target:** Two-owner hosted app · separate logins · shared organization · HTTPS (Chrome on laptops/phones) · PostgreSQL as business/auth SoR  

**Not performed:** database connections, migrations, seeds, imports, exports, backups, restores, env changes, file mutations (other than this report), commit/push/deploy, inspection of customer rows.

No database URLs, passwords, tokens, encryption keys, or personal data are printed.

**Legend:** **Verified** = present in repo today · **Recommendation** = proposed ops design (not implemented)

---

## Production-readiness verdict

# NOT READY — PostgreSQL disaster recovery BLOCKED

| Question | Verdict |
| --- | --- |
| Can production treat PostgreSQL as recoverable SoR today? | **No** |
| In-app PG backup/restore? | **Not implemented** |
| Documented/tested `pg_dump` / `pg_restore` (or managed snapshot) drill? | **No** (`RECOVERY_RUNBOOK.md` §4 PENDING) |
| JSON encrypted backup usable once `BUSINESS_DATA_BACKEND=postgres`? | **No** — deliberately refused |
| Two-owner + shared-org model preservable by a full DB restore? | **Yes in principle** (schema supports it) — **unverified in practice** |

Proceed to design/implement backup tooling and drills only after explicit approval for Phase 8C.2+.

---

## 1. Current implementation findings (verified)

### 1.1 Connection and pool

| Item | Location | Finding |
| --- | --- | --- |
| Pool singleton | `src/db/pool.ts` | Lazy `pg.Pool` from `DATABASE_URL`; never logs connection string |
| TLS helper | `scripts/db-safety.mjs` → `buildPgClientConfig` | Remote targets require `sslmode=require\|verify-ca\|verify-full` (or env equivalent); `rejectUnauthorized: true` when SSL enabled |
| Redaction | `redactDatabaseUrl` in `db-safety.mjs` | Used for safe diagnostics (`getPoolTargetSummary`) |
| App startup migrations | `db/README.md` | **Verified:** application startup never runs migrations |

### 1.2 Schema and migrations

| File | Role |
| --- | --- |
| `db/migrations/001_foundation.sql` | Foundation tables (orgs, users, memberships, sessions, catalogs, IT/GST clients & filings) |
| `db/migrations/001_foundation_down.sql` | Localhost rollback of foundation (empty-business guard in rollback script) |
| `db/migrations/002_password_reset_challenges.sql` | Additive password-reset challenge table (hashed tokens only) |
| `scripts/db-migrate.mjs` / `db-preflight.mjs` / `db-rollback.mjs` | Schema ops with safety gates (local default; remote migrate via 8B.2 ACK/token) |

**Organization / owners / business relationships (verified from `001_foundation.sql`):**

```
organizations (1)
    ├── organization_members (role constrained to 'owner') → users (N owners)
    ├── sessions → users
    ├── assessment_years / gst_months (org-scoped catalogs)
    ├── it_clients → it_filings
    └── gst_companies → gst_filings
password_reset_challenges → users (002)
schema_migrations (migration ledger)
```

- Two owners = two `users` rows + two `organization_members` rows for the **same** `organizations.id`.  
- Business rows carry `organization_id` FKs; deleting an org cascades members and business data.  
- Portal secrets on clients/companies use `password_enc` (nullable TEXT) — not plaintext password columns.  
- Login password material lives on `users` as salt/hash (+ recovery hash) — restore of `users` + `organization_members` is required to preserve both owner logins.

### 1.3 Backend selection (verified)

| Env | Default | Resolver |
| --- | --- | --- |
| `AUTH_BACKEND` | `json` | `src/auth/authBackend.ts` |
| `BUSINESS_DATA_BACKEND` | `json` | `src/business/businessDataBackend.ts` |

Postgres business mode requires `AUTH_BACKEND=postgres`, `AUTH_ORGANIZATION_ID`, and `DATABASE_URL` (fail-closed). Live default remains JSON until an authorized cutover.

### 1.4 Existing backup / restore / encryption (verified)

| Capability | Status | Exact references |
| --- | --- | --- |
| JSON ledger AES-256-GCM backups (`.json.enc`, magic `ASSOCBK1`) | Implemented for **JSON** SoR | `backupCrypto.ts`; `server.ts` `backupLedgerFile` |
| Keep-10 retention under `DATA_DIR/backups` | Implemented (JSON path) | `server.ts` retention after backup write |
| Authenticated `GET /api/backups` / `POST /api/backups/restore` | Implemented for JSON | `server.ts` ~1701 / ~1741 |
| Skip JSON backup when business backend is postgres | **Verified refusal** | `maybeBackupLedgerFile` returns `''` if postgres |
| List/restore API when postgres business | **Verified refusal** | Messages refuse JSON backups / refuse overwrite of PG from JSON |
| Quarantine offline `.aes` (`BK1` magic) | Ops archive (Phase 6A) — not runtime PG DR | `scripts/phase6a-quarantine-backups.mjs` |
| `pg_dump` / `pg_restore` / snapshot scripts | **Missing** | No matches in `package.json` scripts; `RECOVERY_RUNBOOK.md` §4 |
| Automated scheduled PG backups in-app | **Missing** | — |
| PG backup encryption utility | **Missing** | JSON `BACKUP_ENCRYPTION_KEY` ≠ PG dump encryption |
| Import/verify (not DR) | Present | `import:ledger:pg`, `verify:ledger:pg` — JSON→PG load/check, not dump restore |
| Two-owner provision CLI | Present | `db:provision-owners` — creates org+owners; not a backup tool |

### 1.5 Recovery documentation (verified)

| Doc | PG DR content |
| --- | --- |
| `RECOVERY_RUNBOOK.md` §4 | **PENDING — not operationally documented**; explicitly forbids inventing dump/restore commands |
| `docs/phase8a-production-hosting-readiness.md` §2.6 | JSON PARTIALLY READY · Postgres SoR **BLOCKED** |
| `docs/phase8b-4d-recovery-approval-readiness.md` | Lists PG backup + restore drill as missing production prerequisites |
| `db/README.md` | Local migrate/preflight/rollback; remote migrate gates; **no backup section** |

### 1.6 What a full logical dump would need to cover (verified table set)

To preserve **both owners and shared business data**, a backup must include at least:

| Group | Tables |
| --- | --- |
| Migration meta | `schema_migrations` |
| Identity & access | `organizations`, `users`, `organization_members`, `sessions`, `password_reset_challenges` |
| Catalogs | `assessment_years`, `gst_months` |
| Business | `it_clients`, `it_filings`, `gst_companies`, `gst_filings` |

Indexes, PKs, FKs, and CHECKs are defined in migrations; a custom-format `pg_dump` / managed snapshot that restores schema+data preserves them. Partial table dumps risk breaking FK integrity or orphaning an owner.

---

## 2. Already implemented vs missing

### Already implemented (verified)

- PostgreSQL schema for shared-org two-owner model.  
- TLS-aware pool and remote migrate safety gates.  
- JSON encrypted backup/restore path (usable only while business SoR is JSON).  
- Explicit refusal to use JSON backup/restore against Postgres business data (prevents false recovery).  
- Ledger import/verify scripts for **loading** JSON into PG (not reverse DR).  
- Password hashes and portal `password_enc` design (secrets not stored as plaintext columns).  
- `.gitignore` excludes `data/backups/` (JSON artifacts).

### Missing (verified gaps)

| Gap | Impact |
| --- | --- |
| No `pg_dump` / managed-snapshot automation in repo | No repeatable PG backup |
| No encrypted dump packaging or offsite copy procedure | Dumps (if taken ad hoc) may land unencrypted on disk/OneDrive |
| No PG restore runbook or validation checklist tied to two-owner invariants | Recovery untested |
| No scheduled backup job (cron/provider) defined in-app or as IaC | Relies on unchosen host |
| No separate DB backup role documentation | App credentials may be over-privileged if reused for dumps |
| No restore-into-empty-database drill script | Cannot prove recovery without touching prod |
| No retention/deletion policy for PG artifacts | Risk of unbounded or accidental retention of PII |
| Portal / app password-reset still file-oriented for delivery | Ops gap parallel to DR (Phase 8A B4) — not fixed by DB dumps alone |

---

## 3. Security and recovery risks

| Risk | Severity | Notes |
| --- | --- | --- |
| Declaring PG SoR without tested restore | **Critical** | `RECOVERY_RUNBOOK` already warns against this |
| Relying on JSON `.json.enc` after postgres cutover | **Critical** | APIs refuse; false sense of safety |
| Unencrypted `pg_dump` on OneDrive / Desktop / Git | **High** | Full PII + password hashes + `password_enc` in one file |
| Committing dumps or restoring into the app repo tree | **High** | Sync/Git exposure; OneDrive `EPERM` issues already noted for JSON restores |
| Restoring dump into a non-empty live database | **Critical** | Duplicate PKs / mixed orgs / destroyed current state |
| Using app read-write role for backups only | **Medium** | Broaden blast radius if backup host compromised |
| Missing TLS on remote DB | **High** | Mitigated for migrate scripts; pool follows URL/env — must be enforced in prod URL |
| Key confusion (`BACKUP_ENCRYPTION_KEY` vs portal key vs archive key vs future dump key) | **High** | Three existing key domains already; dump encryption must be a **fourth, separate** escrow if used |
| Sessions restored from old dump | **Medium** | May revive old session token hashes until expiry/revoke — plan post-restore session revoke |
| Partial restore (business without users, or users without org) | **Critical** | Breaks two-owner shared access invariant |

---

## 4. Recommended backup architecture (recommendation)

Hosting provider is **not** assumed. Prefer a design that works for managed Postgres **or** self-hosted Postgres on a VPS.

### 4.1 Primary approach (preferred)

**Managed PostgreSQL automated backups + point-in-time recovery (PITR) if offered**, plus periodic **encrypted logical dumps** for offsite / provider-exit.

| Layer | Purpose |
| --- | --- |
| **A. Provider snapshots / continuous backup** | Fast recovery from disk failure, operator error, regional issues |
| **B. Encrypted logical dump (custom or directory format)** | Portable copy; schema+data; restore into disposable DB for drills |
| **C. Offline key escrow** | Dump encryption key (if layer B encrypted at rest outside provider) stored separately from ciphertext |

Do **not** depend on in-app JSON `.json.enc` once `BUSINESS_DATA_BACKEND=postgres`.

### 4.2 When provider snapshots alone are enough temporarily

If the chosen host provides **daily automated backups + documented restore to a new instance** and retention ≥ 7 days, that can be the **minimum** production bar — still require a **restore drill** on a disposable instance. Logical dumps remain strongly recommended for portability.

### 4.3 Frequency (recommendation)

| Artifact | Frequency |
| --- | --- |
| Provider continuous / WAL-based PITR | Always-on if available |
| Provider full snapshot | Daily (minimum) |
| Encrypted logical dump (offsite) | Daily for first 30 days after cutover; then daily or at least every 24h |
| Pre-change dump | Immediately before migrate, import, provision, or major schema change |

### 4.4 Retention (recommendation)

| Class | Retain |
| --- | --- |
| Daily dumps/snapshots | 14 days |
| Weekly dumps | 8 weeks |
| Monthly dumps | 12 months (or per legal/accounting need) |
| Pre-change dumps | 90 days |

Delete expired artifacts with an audited job; never leave dumps in the Git/OneDrive project tree.

### 4.5 Encryption requirements (recommendation)

- Prefer provider encryption-at-rest for snapshots.  
- For logical dumps: encrypt with a dedicated dump key (AES-256-GCM or age/gpg) **before** any copy to laptop/OneDrive/object storage.  
- Escrow dump key offline; **do not** reuse `BACKUP_ENCRYPTION_KEY`, portal key, or Phase 6A archive key.  
- Logs: record filename, byte size, SHA-256, timestamp, host/db **name only** — never connection strings or row data.

### 4.6 Access separation (recommendation)

| Role | Rights |
| --- | --- |
| App DB user | CRUD on app tables only; **no** `CREATE USER` / limited DDL |
| Backup role | `CONNECT` + select/`pg_dump` privileges (or provider backup IAM) — not used by the Node app |
| Restore operator | Separate break-glass credentials; dual-control for production restore |

### 4.7 What provider features to confirm before go-live

- Automated daily backups enabled? Retention days?  
- PITR / continuous backup available? RPO/RTO published?  
- Restore to **new** database/instance (not only in-place overwrite)?  
- Encryption at rest + in-transit (TLS) defaults?  
- Cross-region or offsite copy option / export of dumps?  
- Cost of storage for retention window?  
- Access logging for backup/restore actions?

---

## 5. Recommended recovery procedure (recommendation — not yet tested)

**Never restore directly onto production as the first try.**

### 5.1 Cold restore into a new empty database (logical dump)

1. Create a **new empty** PostgreSQL database on disposable infrastructure (local Docker/PG or provider staging).  
2. Confirm target is empty (`schema_migrations` absent or DB newly created).  
3. Decrypt dump to a secure temp path (if encrypted); restrict ACLs; do not unpack under OneDrive-synced project folders if avoidable.  
4. Restore with `pg_restore` (custom format) or `psql` (SQL format) into the empty DB.  
5. Run integrity checks (counts only — §5.3).  
6. Point a **staging** app instance at the recovery DB (`AUTH_BACKEND=postgres`, `BUSINESS_DATA_BACKEND=postgres`, `AUTH_ORGANIZATION_ID` = restored org id).  
7. Smoke: Owner A login, Owner B login, shared IT/GST counts match expected freeze summary.  
8. Only after success: plan production cutover restore under written authorization (snapshot production first if doing in-place disaster recovery).

### 5.2 Provider snapshot restore

1. Use provider UI/API to restore snapshot/PITR to a **new** instance.  
2. Do not overwrite production until staging validation passes.  
3. Run the same integrity + two-owner smoke checks.  
4. Rotate/revoke sessions if dump age is large; confirm password-reset challenge table is acceptable.

### 5.3 Post-restore integrity checks (no PII in logs)

- [ ] `schema_migrations` contains expected migration ids (`001_foundation`, `002_password_reset_challenges`, …).  
- [ ] Exactly **one** shared organization intended for production (or documented multi-org exception).  
- [ ] Exactly **two** owner memberships for that org (or documented headcount).  
- [ ] Both owner emails authenticate (password check in staging only — do not log secrets).  
- [ ] IT client / GST company / filing counts match pre-incident freeze summary.  
- [ ] Financial aggregates (IT fees/recv/bal; GST total/recv) match within tolerance.  
- [ ] `password_enc` non-null counts match expectation; no unexpected plaintext password columns.  
- [ ] FK violations = 0; duplicate ids = 0.  
- [ ] App refuses JSON backup/restore (still postgres mode) — DR path remains DB-based.

### 5.4 Overwrite / duplication hazards

| Action | Risk |
| --- | --- |
| `pg_restore` into non-empty DB without clean | Duplicate PK errors or mixed state |
| Restore then re-run Phase 2 import | Duplicate business rows / second org risk |
| Restore then re-run provision-two-owners | Duplicate emails / failed provision / split-brain |
| In-place prod restore without prior snapshot | Irreversible loss of post-backup writes |

---

## 6. Safe testing strategy — disposable local database (recommendation)

**Goal:** Prove backup→restore→two-owner visibility **without** touching production or staging customer data.

1. Use local Postgres only (`127.0.0.1`) and an allowlisted disposable DB name (e.g. dedicated `it_gst_management_restore_drill` — create only when implementing 8C.x; **not created in this audit**).  
2. Migrate schema with existing `db:migrate` safety confirms (local).  
3. Load **synthetic** or **approved frozen** data via controlled import/provision on that disposable DB only (separate future authorization).  
4. Take `pg_dump` (custom format) to a temp directory **outside** the repo and outside OneDrive if possible; record SHA-256.  
5. Drop/recreate a second empty drill DB (or restore into freshly created DB).  
6. Restore dump; run §5.3 checks; start app against drill DB; login both owners; compare counts.  
7. Delete drill dumps securely after the test unless retained as encrypted evidence.  
8. Document results in a future `docs/phase8c-*-restore-drill.md` (pass/fail, counts only).

**Do not** use production `DATABASE_URL`, remote ACK tokens, or live org data for the first drill.

---

## 7. Phased implementation plan (recommendation)

| Phase | Scope | Exit criteria |
| --- | --- | --- |
| **8C.1** (this report) | Read-only readiness audit | Report accepted |
| **8C.2** | Implement ops scripts: safe local `pg_dump` wrapper, encrypt-at-rest option, SHA-256 manifest, refuse prod URL without multi-ACK; draft PG restore runbook | Scripts + draft runbook; unit tests for safety gates; **no prod dumps** |
| **8C.3** | Disposable local backup→restore drill with two-owner smoke | Drill report PASS |
| **8C.4** | Provider selection checklist + enable managed backups on **staging**; restore-to-new-instance drill | Staging restore PASS |
| **8C.5** | Production backup enablement + one authorized restore-to-staging-from-prod-backup drill (or provider-equivalent) | Written prod DR sign-off |
| Parallel | Hosted password-reset channel (8A B4) | Owners can recover login without filesystem token pickup |

Each phase requires explicit approval before start. **8C.2 must not run against production.**

---

## 8. Practical hosting recommendation (summary)

For two owners on HTTPS Chrome (laptop + phone):

1. Run the Node app on a small always-on host with TLS terminator.  
2. Use **managed PostgreSQL** (or VPS Postgres with automated backup tooling) as auth + business SoR after cutover.  
3. Enable **daily automated DB backups** (+ PITR if affordable).  
4. Keep an **encrypted offsite logical dump** cadence for portability.  
5. Escrow encryption keys offline; separate app / portal / dump keys.  
6. Rehearse restore **quarterly** (minimum) and after every major schema/import change.  
7. Treat JSON `.json.enc` as legacy/pre-cutover only.  
8. Confirm provider backup pricing and restore-to-new-instance support before go-live.

Suggested restore-test cadence: **before production cutover**, then **every 90 days**, and **after** any migration/import/provision change.

---

## 9. Clear separation — verified vs recommendation

| Topic | Verified now | Recommendation only |
| --- | --- | --- |
| Schema supports two owners + shared org | Yes | — |
| JSON backup encryption | Yes | — |
| PG backup automation | No | Managed snapshots + encrypted dumps |
| PG restore runbook | PENDING | §5 procedure above |
| Local restore drill | Not done | §6 strategy |
| Production DR sign-off | Not possible yet | After 8C.3–8C.5 |

---

## Stop line

Phase **8C.1** complete — PostgreSQL backup & restore readiness audit only.  

**Verdict: NOT READY / BLOCKED for production PostgreSQL DR.**  
**No implementation started. No database connected. Awaiting approval before Phase 8C.2.**
