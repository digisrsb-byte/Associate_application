# SENSITIVE FILE EXCLUSION REPORT

**Date:** 2026-11-20  
**Scope:** Read-only check that proposed commits will not include secrets  
**Rule:** Actual secret values are not printed

---

## 1. Staging area

| Check | Result |
|-------|--------|
| `git diff --cached` | **Empty** — nothing currently staged for commit |
| Encryption keys / credentials in index | **None** |

---

## 2. Must never be committed

| Path / location | Present in WT? | Git status | Ignored? | In proposed A/B/C? | Verdict |
|-----------------|----------------|------------|----------|--------------------|---------|
| `.env` (portal key, QA password) | Yes | Not listed (ignored) | **Yes** | No | **EXCLUDE** |
| `data/auth.json` | Yes | Ignored | **Yes** | No | **EXCLUDE** |
| `data/PASSWORD_RESET_TOKEN.txt` | May exist | Ignored | **Yes** | No | **EXCLUDE** |
| `data/backups/**` (any) | New file `ledger-20261120-155526.json` exists | Ignored via `data/backups/` | **Yes** | No (Commit B only untracks old tracked names) | **EXCLUDE content** |
| `data/ledger.json` (live) | Yes | ` M` tracked | **No** | Must **not** add | **EXCLUDE** |
| `TEST_RESULTS.json` | Yes | `??` | **No** | Must **not** add | **EXCLUDE** — contains `password on disk:` literal marker |
| `QA_AUDIT_RESULTS.json` | Yes | `??` | No | Prefer omit | **EXCLUDE** |
| `..\_SECURE_BACKUP_KEY\` | Outside repo | N/A | N/A | No | **Safe (outside)** |
| `..\_SECURE_BACKUPS_OUTSIDE_GIT\` | Outside repo | N/A | N/A | No | **Safe (outside)** |

---

## 3. Deleted backups (Phase 6A)

| Category | Count | Staged? | Unstaged? | Action in future Commit B |
|----------|-------|---------|-----------|---------------------------|
| Tracked backups deleted from disk | **5** | No | **Yes** (` D`) | `git rm --cached` / stage deletion of those paths only |
| Untracked backups deleted from disk | **6+** (from candidates list; never in index) | N/A | N/A | No git action needed |

Tracked unstaged deletions:

```text
data/backups/ledger-20261119-175552.json
data/backups/ledger-20261119-175639.json
data/backups/ledger-20261119-175659.json
data/backups/ledger-20261120-103329.json
data/backups/ledger-20261120-111418.json
```

Commit B records that these paths leave the **tree going forward**. Historical blobs on `origin/main` remain until optional 6D.

---

## 4. Live data spot checks (no values printed)

| Check | Result |
|-------|--------|
| Live ledger non-placeholder plaintext portal passwords | **0** |
| Live ledger `passwordEnc` present | Yes (ciphertext — still do not commit live ledger) |
| `.env.example` portal key line empty placeholder | **Yes** |

---

## 5. Source residual (F-01b — remediated)

| Item | Status |
|------|--------|
| `createInitialLedger()` demo portal passwords (`Ramesh@2026`, etc.) | **Removed** — empty/unset only; verified by F-01b tests |
| `scripts/fixtures/demo-ledger-shape.json` | Test-only shape; **no** portal passwords; not loaded by server |
| Banned strings as admin login | Rejected (401); bootstrap blocked when configured |

See `F01B_DEMO_CREDENTIAL_REMEDIATION.md`.

---

## 6. Docs / test JSON policy

| Path | Policy |
|------|--------|
| `TEST_RESULTS.json` | **Never commit** |
| `TEST_REPORT.md` / `TEST_CHECKLIST.md` | Omit unless scrubbed |
| `QA_AUDIT_*.md` / `QA_AUDIT_RESULTS.json` | Prefer omit (pre-fix vulnerability narrative) |
| `PHASE*_TEST_RESULTS.json` / `PHASE6B_COOKIE_SECURITY_TEST_RESULTS.json` | Allow only after confirming no password literals |
| Security remediation / audit `.md` listed in Commit C | OK (no secret values by design) |

---

## 7. Alignment with proposed groups

| Group | Sensitive risk if staged carelessly | Mitigation |
|-------|-------------------------------------|------------|
| Commit A | Accidentally adding `data/ledger.json` or `TEST_RESULTS.json` via broad add | Path-by-path only; never `git add .` |
| Commit B | None if limited to five backup paths | Do not add live ledger unless separately approved |
| Commit C | Adding `TEST_RESULTS.json` / QA dumps | Follow exclude list |

---

## 8. Conclusion

**Current index is clean of secrets.**  
**Proposed groups are safe if exclusions above are followed.**  
Highest operator risks at commit time: (1) `git add .`, (2) staging `data/ledger.json`, (3) staging `TEST_RESULTS.json`, (4) shipping demo seed passwords inside `server.ts` without sanitizing.

**No commit performed. Waiting for approval.**
