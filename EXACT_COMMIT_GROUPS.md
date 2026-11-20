# EXACT COMMIT GROUPS (proposed — not staged, not committed)

**Date:** 2026-11-20  
**Branch:** `security/phase1-password-reset`  
**Index:** empty (nothing in `git diff --cached`)

Reconciled from `PHASE6C_COMMIT_PLAN.md` against actual `git status` / `git diff --name-status` / untracked files.

---

## Commit A — Security core (Phases 1–6B code)

**Intent:** Auth reset, portal AES crypto, host bind, bootstrap, PAN validation, Secure cookies, UI/export wiring, tests.

### From unstaged modifications (` M`) — include

```text
.env.example
.gitignore
server.ts
src/App.tsx
src/index.css
src/types/ledger.ts
src/utils/csvExport.ts
src/utils/gstExcelExport.ts
src/utils/ledgerUtils.ts
src/components/ClientEditDrawer.tsx
src/components/ClientModal.tsx
src/components/ContinuousSheetTable.tsx
src/components/DataTransferModal.tsx
src/components/GstCompanyEditDrawer.tsx
src/components/GstCompanyModal.tsx
src/components/GstSheetTable.tsx
src/components/GstSimpleTable.tsx
src/components/GstSummaryViews.tsx
src/components/OverallDashboard.tsx
src/components/Sidebar.tsx
src/components/SimpleClientTable.tsx
src/components/ToastBanner.tsx
src/components/TopSummaryCards.tsx
```

### From untracked (`??`) — include

```text
portalCrypto.ts
passwordPolicy.ts
src/utils/api.ts
src/utils/fieldValidation.ts
src/components/LoginPage.tsx
src/components/PortalPasswordCell.tsx
src/components/MotionBits.tsx
src/motion/presets.ts
scripts/phase1-password-reset-tests.mjs
scripts/phase2-portal-password-tests.mjs
scripts/phase3-host-binding-tests.mjs
scripts/phase4-admin-bootstrap-tests.mjs
scripts/phase5-input-validation-tests.mjs
scripts/phase6a-quarantine-backups.mjs
scripts/phase6b-cookie-security-tests.mjs
scripts/phase6-f01b-demo-credentials-tests.mjs
scripts/fixtures/demo-ledger-shape.json
```

### Optional (review before add)

```text
scripts/qa-audit-suite.mjs
scripts/run-qa-suite.mjs
```

### Explicitly NOT in Commit A

```text
data/ledger.json
data/backups/**
.test results with secrets (see exclusion report)
```

**F-01b update:** `server.ts` `createInitialLedger()` demo portal passwords removed (empty/unset). Also include in Commit A when approved:

```text
scripts/phase6-f01b-demo-credentials-tests.mjs
scripts/fixtures/demo-ledger-shape.json
F01B_DEMO_CREDENTIAL_REMEDIATION.md
PHASE6_F01B_DEMO_CREDENTIAL_TEST_RESULTS.json
```

---

## Commit B — Untrack deleted tracked backups

**Intent:** Record removal of tracked backup paths from the index (working-tree files already deleted). Does **not** purge history (6D).

### Exact paths (currently unstaged ` D`, still in `git ls-files`)

```text
data/backups/ledger-20261119-175552.json
data/backups/ledger-20261119-175639.json
data/backups/ledger-20261119-175659.json
data/backups/ledger-20261120-103329.json
data/backups/ledger-20261120-111418.json
```

Proposed commands when approved (not run now):

```text
git rm --cached -- data/backups/ledger-20261119-175552.json
git rm --cached -- data/backups/ledger-20261119-175639.json
git rm --cached -- data/backups/ledger-20261119-175659.json
git rm --cached -- data/backups/ledger-20261120-103329.json
git rm --cached -- data/backups/ledger-20261120-111418.json
```

Alternatively, after approval, staging the existing unstaged deletions with path-specific `git add --` on those five paths is equivalent for commit purposes.

### Optional (separate approval)

```text
git rm --cached -- data/ledger.json
```

Only if replacing with a sanitized seed policy.

---

## Commit C — Documentation

**Intent:** Security/audit/readiness docs without secret dumps.

### Include (untracked)

```text
PHASE1_SECURITY_REMEDIATION.md
PHASE2_SECURITY_REMEDIATION.md
PHASE3_SECURITY_REMEDIATION.md
PHASE4_SECURITY_REMEDIATION.md
PHASE5_SECURITY_REMEDIATION.md
PHASE6_REMEDIATION_PLAN.md
PHASE6_EXECUTION_REPORT.md
PHASE6_PRE_DELETION_VERIFICATION.md
PHASE6_BACKUP_DELETION_CANDIDATES.md
PHASE6_GIT_STATUS_REPORT.md
PHASE6C_COMMIT_PLAN.md
F01B_DEMO_CREDENTIAL_REMEDIATION.md
BACKUP_SECURITY_AUDIT.md
SESSION_COOKIE_SECURITY_REPORT.md
GIT_BRANCH_SAFETY_REPORT.md
GIT_BRANCHING_PLAN_PHASE6C.md
FINAL_SECURITY_AUDIT.md
FINAL_PRE_COMMIT_REVIEW.md
EXACT_COMMIT_GROUPS.md
SENSITIVE_FILE_EXCLUSION_REPORT.md
PRODUCTION_READINESS_REPORT.md
UPDATED_PRODUCTION_READINESS_REPORT.md
DATA_INTEGRITY_REPORT.md
DEPLOYMENT_CHECKLIST.md
HOSTED_DEPLOYMENT_GUIDE.md
SECURITY_REMEDIATION_REPORT.md
REGRESSION_TEST_RESULTS.md
```

### Phase test result JSON (include only if scrubbed — currently pass/fail style)

```text
PHASE1_PASSWORD_RESET_TEST_RESULTS.json
PHASE2_PORTAL_PASSWORD_TEST_RESULTS.json
PHASE3_HOST_BINDING_TEST_RESULTS.json
PHASE4_ADMIN_BOOTSTRAP_TEST_RESULTS.json
PHASE5_INPUT_VALIDATION_TEST_RESULTS.json
PHASE6B_COOKIE_SECURITY_TEST_RESULTS.json
```

Spot-check before staging: no password literals.

### Exclude from Commit C

```text
TEST_RESULTS.json
TEST_REPORT.md
TEST_CHECKLIST.md
QA_AUDIT_RESULTS.json
QA_AUDIT_REPORT.md
UPDATED_QA_AUDIT_REPORT.md
```

(Prefer omit historical QA dumps that describe pre-fix vulns or embed secrets.)

---

## Staging discipline (when approved)

1. Never `git add .` / `git add -A`  
2. Path-by-path `git add -- <paths>` per group  
3. `git diff --cached --name-status` review before each commit  
4. Confirm exclusions from `SENSITIVE_FILE_EXCLUSION_REPORT.md`  
5. Do not push/merge until separately approved  

**No commits executed in this review.**
