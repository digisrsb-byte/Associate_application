# Phase 8C.2 — Safe PostgreSQL Backup Tooling

**Date:** 2026-11-25  
**Mode:** Local implementation only — no production/staging DB access  
**Basis:** `docs/phase8c-1-postgres-backup-restore-readiness.md`

**Not performed:** live `pg_dump` / `pg_restore`, database connections, migrations, imports, restores, provisioning, backend default changes, commit/push/deploy.

---

## Verdict

Phase **8C.2 complete** for tooling + automated tests (mocked; no database).  

Default CLI mode is **dry-run** (gates only). Real dumps require an explicit `--execute` against an allowlisted **disposable local** database and a safe output directory — **not run in this phase**.

---

## 1. Files changed

| File | Change |
| --- | --- |
| `scripts/pg-dump-backup-lib.mjs` | **Added** — safety gates, dedicated dump crypto (`ASSOCPGD1`), plan/execute helpers |
| `scripts/pg-dump-backup.mjs` | **Added** — CLI (`--dry-run` default, `--execute` opt-in) |
| `tests/unit/pgDumpBackup.test.ts` | **Added** — 26 unit tests (mocked `pg_dump`; no DB) |
| `package.json` | **Added** script `db:backup-pg-local` |
| `db/README.md` | Short pointer to 8C.2 tooling |
| `docs/phase8c-2-postgres-backup-tooling-report.md` | This report |
| `.gitignore` | Ignore `*.dump`, `*.dump.enc`, dump key filenames, `pg-dumps/` |

Reused: `scripts/db-safety.mjs` (`assertSafeDatabaseTarget`, `parseDatabaseUrl`, `redactDatabaseUrl`, `resolveDbTargetMode`, loopback checks).

---

## 2. Backup command usage

```powershell
# Dry-run (default) — validates gates; does not run pg_dump
$env:DATABASE_URL="postgresql://USER:***@127.0.0.1:5432/it_gst_management_restore_drill"
$env:PG_DUMP_CONFIRM="it_gst_management_restore_drill"
$env:PG_DUMP_OUTPUT_DIR="$env:LOCALAPPDATA\associate-pg-dumps"
$env:PG_DUMP_ENCRYPTION_KEY="<64-hex or base64 32-byte key — dedicated>"
npm run db:backup-pg-local

# Execute only after dry-run succeeds and a disposable DB exists (future phase)
npm run db:backup-pg-local -- --execute
```

Allowlisted disposable database names:

- `it_gst_management_restore_drill`
- `it_gst_management_backup_drill`

Plaintext local drill (discouraged): set `PG_DUMP_ALLOW_PLAINTEXT=1` and omit the dump encryption key.

---

## 3. Safety gates

| Gate | Behaviour |
| --- | --- |
| Local host only | Refuses non-loopback hosts |
| No remote mode | Refuses `DB_TARGET_MODE=remote` (no remote ACK bypass) |
| Disposable DB allowlist | Only the two drill names above |
| Production-like names | Refuses `prod` / `production` / `live` / `staging` / system DBs |
| Explicit confirm | `PG_DUMP_CONFIRM` must equal URL database name |
| Output directory | Must be absolute, **outside** project Git tree |
| OneDrive | Refuses any output path containing `OneDrive` |
| Encryption default | Requires `PG_DUMP_ENCRYPTION_KEY` or `_FILE` unless plaintext override |
| Key isolation | Refuses dump key equal to `BACKUP_ENCRYPTION_KEY` or `PORTAL_PASSWORD_ENCRYPTION_KEY` when those are set |
| `pg_dump` present | `--execute` probes `pg_dump --version`; fails on ENOENT |
| Dump success | Non-zero status / empty file → refuse; no stderr secrets printed |
| Manifest | Timestamp, DB name, host, bytes, SHA-256 only (no URL passwords, no row data) |

---

## 4. Encryption approach

| Item | Choice |
| --- | --- |
| Algorithm | AES-256-GCM (same class as JSON backups; **separate** implementation) |
| Magic | `ASSOCPGD1` (not `ASSOCBK1`, not quarantine `BK1`) |
| Env | `PG_DUMP_ENCRYPTION_KEY` or `PG_DUMP_ENCRYPTION_KEY_FILE` only |
| Explicitly not used | `BACKUP_ENCRYPTION_KEY`, portal key, `_SECURE_BACKUP_KEY` archive key |
| Artifact | `{name}.dump.enc` after encrypt; plaintext `.dump` deleted on success |
| Companion | `{name}.manifest.json` with hashes |

Secure key handling is implemented for this phase (dedicated env/file + reuse detection + no key logging). Operators must still generate and escrow the dump key offline.

---

## 5. Test results

```text
npm run test:unit -- tests/unit/pgDumpBackup.test.ts
Test Files  1 passed (1)
Tests       26 passed (26)
```

Covered: remote refusal, production-name refusal, missing/mismatched confirm, unsafe output dir (project + OneDrive), missing `pg_dump`, failed dump status, hash verification, encrypt/decrypt magic, key-reuse refusal, secret redaction.

**No database was connected. No real `pg_dump` was executed.**

---

## 6. Known limitations

- Does not create/schedule production backups.  
- Does not support remote/managed hosts (by design in 8C.2).  
- Does not implement restore (`pg_restore`) — deferred to 8C.3+.  
- Does not create the disposable drill database or run migrations.  
- OneDrive refusal means dumps cannot land under the current Desktop/OneDrive project tree; use `%LOCALAPPDATA%\associate-pg-dumps` (or similar).  
- Dry-run parses `DATABASE_URL` locally but does not open a PG connection.  
- `--execute` still requires a real local disposable DB + `pg_dump` on PATH (future drill).

---

## 7. Exact steps for a future disposable local restore drill (8C.3+)

Do **not** run these until Phase 8C.3 is approved.

1. Create local DB `it_gst_management_restore_drill` on `127.0.0.1` only.  
2. Migrate schema with existing local `db:migrate` confirms aimed at that DB (or a documented drill migrate allowlist extension).  
3. Load synthetic or **approved frozen** data only (separate authorization).  
4. Set `PG_DUMP_OUTPUT_DIR` under `%LOCALAPPDATA%\associate-pg-dumps` (create folder).  
5. Generate a dedicated dump key; set `PG_DUMP_ENCRYPTION_KEY`; escrow offline.  
6. `npm run db:backup-pg-local` (dry-run) → confirm plan.  
7. `npm run db:backup-pg-local -- --execute` → record manifest SHA-256.  
8. Create a second empty local DB; decrypt dump to a secure temp path outside OneDrive; `pg_restore` into the empty DB.  
9. Verify counts (orgs, two owners, IT/GST aggregates) — no PII in logs.  
10. Point a staging app env at the restored DB; smoke both owner logins.  
11. Securely delete plaintext temp files; retain encrypted dump per retention policy.

---

## Stop line

Phase **8C.2** complete — safe local backup tooling + tests only.  
**Awaiting approval before Phase 8C.3 (disposable restore drill).**
