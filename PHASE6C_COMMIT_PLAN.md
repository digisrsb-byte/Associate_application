# PHASE 6C — Path-by-path proposed commit plan (NOT EXECUTED)

**Date:** 2026-11-20  
**Commits:** **Not approved / not performed**  
**Staging / reset / clean / stash / discard:** **Not performed**

---

## 1. Branch inspection (authoritative)

| Item | Value |
|------|-------|
| **Current branch** | `security/phase1-password-reset` (**not** `main`) |
| HEAD / `main` / `origin/main` | All `ecb6037` (same tip; feature has **no unique commits** yet) |
| Local `dev` | **Absent** |
| Uncommitted Phase 1–5 (+6) work | **Preserved** in working tree |

**Why an older note said “main”:** the feature branch tip was identical to `main`, so it looked like main’s content — but the checked-out branch name was already the feature branch.  

**Action taken:** Because we are **not** on `main`, **`security/phase6-remediation` was not created** (per your rule: create that name only if currently on `main`). All work remains on `security/phase1-password-reset`.

**Optional (needs your OK):**  
`git switch -c security/phase6-remediation` while staying on the current WT — renames/moves HEAD label only; does not discard changes. Not done.

`main` tip unchanged at `ecb6037`. No `dev` branch to modify.

---

## 2. NEVER commit (sensitive)

| Path / pattern | Reason |
|----------------|--------|
| `.env` | Encryption keys, QA credentials |
| `data/auth.json` | Admin password hash |
| `data/PASSWORD_RESET_TOKEN.txt*` | Reset secret |
| `data/backups/**` | Backups (PII / ciphertext); gitignored |
| `data/ledger.pre-auto-test-backup.json` | Deleted; was plaintext |
| `../_SECURE_BACKUPS_OUTSIDE_GIT/**` | Quarantine (outside repo) |
| `../_SECURE_BACKUP_KEY/**` | Archive key (outside repo) |
| **`TEST_RESULTS.json`** | Contains historical password **literal** in detail text |
| `QA_AUDIT_RESULTS.json` | May describe sensitive findings; prefer omit from public push |
| Live `data/ledger.json` | Real client PII + `passwordEnc` — **do not commit** unless replaced with sanitized seed |

---

## 3. Proposed Commit A — Security core (Phases 1–5 + 6B)

Stage **only** these paths (example `git add` list):

```text
server.ts
portalCrypto.ts
passwordPolicy.ts
.env.example
.gitignore
src/utils/fieldValidation.ts
src/utils/api.ts
src/utils/csvExport.ts
src/utils/gstExcelExport.ts
src/utils/ledgerUtils.ts
src/types/ledger.ts
src/App.tsx
src/index.css
src/components/LoginPage.tsx
src/components/PortalPasswordCell.tsx
src/components/ClientModal.tsx
src/components/ClientEditDrawer.tsx
src/components/GstCompanyModal.tsx
src/components/GstCompanyEditDrawer.tsx
src/components/ContinuousSheetTable.tsx
src/components/SimpleClientTable.tsx
src/components/GstSheetTable.tsx
src/components/GstSimpleTable.tsx
src/components/GstSummaryViews.tsx
src/components/DataTransferModal.tsx
src/components/OverallDashboard.tsx
src/components/Sidebar.tsx
src/components/ToastBanner.tsx
src/components/TopSummaryCards.tsx
src/components/MotionBits.tsx
src/motion/
scripts/phase1-password-reset-tests.mjs
scripts/phase2-portal-password-tests.mjs
scripts/phase3-host-binding-tests.mjs
scripts/phase4-admin-bootstrap-tests.mjs
scripts/phase5-input-validation-tests.mjs
scripts/phase6a-quarantine-backups.mjs
scripts/phase6b-cookie-security-tests.mjs
```

Optional in A or separate: `scripts/qa-audit-suite.mjs`, `scripts/run-qa-suite.mjs` (review for embedded secrets first).

---

## 4. Proposed Commit B — Stop tracking deleted backups

```text
git rm --cached data/backups/ledger-20261119-175552.json
git rm --cached data/backups/ledger-20261119-175639.json
git rm --cached data/backups/ledger-20261119-175659.json
git rm --cached data/backups/ledger-20261120-103329.json
git rm --cached data/backups/ledger-20261120-111418.json
```

(Does **not** rewrite history — 6D still required for history purge.)

Optional same commit:

```text
git rm --cached data/ledger.json
```

…only if you approve replacing tracked ledger with a sanitized seed later.

---

## 5. Proposed Commit C — Documentation (no secrets)

Safe docs (review before add):

```text
PHASE1_SECURITY_REMEDIATION.md … PHASE5_SECURITY_REMEDIATION.md
PHASE6_REMEDIATION_PLAN.md
PHASE6_EXECUTION_REPORT.md
PHASE6_PRE_DELETION_VERIFICATION.md
PHASE6_BACKUP_DELETION_CANDIDATES.md
PHASE6C_COMMIT_PLAN.md
BACKUP_SECURITY_AUDIT.md
SESSION_COOKIE_SECURITY_REPORT.md
GIT_BRANCH_SAFETY_REPORT.md
GIT_BRANCHING_PLAN_PHASE6C.md
FINAL_SECURITY_AUDIT.md
PRODUCTION_READINESS_REPORT.md
UPDATED_PRODUCTION_READINESS_REPORT.md
DATA_INTEGRITY_REPORT.md
DEPLOYMENT_CHECKLIST.md
HOSTED_DEPLOYMENT_GUIDE.md
SECURITY_REMEDIATION_REPORT.md
REGRESSION_TEST_RESULTS.md
```

**Omit or scrub:** `TEST_RESULTS.json`, `TEST_REPORT.md` if it quotes secrets, `QA_AUDIT_RESULTS.json`.

Phase `*_TEST_RESULTS.json` / `PHASE6B_COOKIE_SECURITY_TEST_RESULTS.json` — OK if they contain only pass/fail (no secret literals); spot-check before staging.

---

## 6. Explicit non-actions until you approve commits

- No `git add` / commit / push  
- No `git reset` / `clean` / `stash`  
- No 6D history rewrite / force-push  
- No merge to `main`
