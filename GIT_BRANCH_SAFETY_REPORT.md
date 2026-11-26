# GIT BRANCH SAFETY REPORT (Phase 6 Investigation)

**Date:** 2026-11-20  
**Mode:** Investigation only — **no commit, push, merge, checkout of main/dev, history rewrite, or discard of work**

---

## 1. Branch state

| Item | Value |
|------|-------|
| Current branch | `security/phase1-password-reset` |
| HEAD | `ecb6037` (“second commit”) |
| `main` | `ecb6037` (identical tip) |
| `origin/main` | `ecb6037` (tracks remote) |
| Local `dev` | **Does not exist** |
| Ahead/behind remote | Feature branch has **no unique commits**; all Phase 1–5 work is **uncommitted** |

**Finding F-04 confirmed:** security remediation exists only in the working tree / untracked files, not as commits on the feature branch.

---

## 2. Working tree summary

### Modified (tracked)
`.env.example`, `.gitignore`, `data/ledger.json`, `server.ts`, many `src/**` UI/utils files, exports, types.

### Deleted in working tree (still tracked in git)
- `data/backups/ledger-20261119-175552.json`
- `data/backups/ledger-20261119-175639.json`

### Untracked (high value — must preserve)
- `portalCrypto.ts`, `passwordPolicy.ts`
- `src/utils/fieldValidation.ts`, `src/utils/api.ts`
- `src/components/LoginPage.tsx`, `PortalPasswordCell.tsx`, motion bits
- Phase 1–5 scripts under `scripts/`
- Security/QA markdown + JSON reports
- Untracked backups under `data/backups/` and `data/ledger.pre-auto-test-backup.json`

**Diff vs `main` (working tree):** ~26 tracked paths changed; ~+1900 / −1450 lines on tracked files alone — plus large untracked surface.

---

## 3. Sensitive content in changes (do **not** commit)

| Path / pattern | Why |
|----------------|-----|
| `.env` | Live encryption key / QA secrets |
| `data/auth.json` | Password hash |
| `data/PASSWORD_RESET_TOKEN.txt` | Reset secret |
| `data/backups/**` (esp. pre-encrypt) | Plaintext or ciphertext + PII |
| `data/ledger.pre-auto-test-backup.json` | Plaintext |
| `data/ledger.json` (live) | Real client PII + `passwordEnc` — **policy decision** before commit |
| `TEST_RESULTS.json` | Embeds a historical QA password string in a detail field |
| `data/backups/auth-*-pre-phase4.json` | Auth hash backup |

Already ignored (good): `.env*`, `data/auth.json`, reset token files.  
**Gap:** `data/backups/` not ignored.

---

## 4. Safe commit plan (execute only after approval)

### Goals
1. Keep all Phase 1–5 implementation on `security/phase1-password-reset`.  
2. Never discard uncommitted work.  
3. Never modify `main` / create accidental checkout.  
4. Never commit credentials, plaintext backups, keys, or sensitive test dumps.  
5. No history rewrite / force-push in this plan.

### Proposed commit set (feature branch only)

**Commit A — Security core (Phases 1–5 + F-02 cookie)**  
Include (examples):
- `server.ts`, `portalCrypto.ts`, `passwordPolicy.ts`
- `src/utils/fieldValidation.ts`, `src/utils/api.ts`
- Login / portal password UI components required for auth flows
- Export sanitization changes (`csvExport`, `gstExcelExport`, etc.)
- Client/GST form validation wiring
- `.env.example` (placeholders only)
- Updated `.gitignore` (backups, pre-* backups, sensitive JSON)
- Phase remediation markdown (optional docs commit)
- Test **scripts** (`scripts/phase*.mjs`) — OK if they read env and never hardcode secrets

**Explicitly exclude from staging:**
- `.env`, `data/auth.json`, `data/PASSWORD_RESET_TOKEN*`
- All `data/backups/**`
- `data/ledger.pre-auto-test-backup.json`
- Live `data/ledger.json` **unless** replaced with a sanitized seed fixture (preferred: stop tracking real ledger)
- `TEST_RESULTS.json`, `QA_AUDIT_RESULTS.json` if they contain secret literals
- Encrypted quarantine directory outside repo

**Commit B — Untrack secrets from index (same or follow-up)**  
```text
git rm --cached data/backups/*.json
# optional policy:
# git rm --cached data/ledger.json
# add data/ledger.seed.json (no real secrets) instead
```
Does **not** purge history; only stops future tracking.

**Commit C — Docs**  
`FINAL_SECURITY_AUDIT.md`, Phase 6 reports, `HOSTED_DEPLOYMENT_GUIDE.md`, checklists.

### Staging discipline
1. `git status` / `git diff` review before every commit.  
2. Prefer path-by-path `git add`, never `git add .` / `git add -A`.  
3. After Commit B, confirm `git ls-files data/backups` is empty.  
4. Verify `main` still at `ecb6037` until an explicit merge PR is approved.

### Push / PR
- Push feature branch only after Commit A–C and secret scan.  
- Open PR into `main` — **do not merge** until readiness re-audit.  
- Force-push / history rewrite: **out of scope** without separate approval.

---

## 5. History exposure note

`origin/main` already contains plaintext portal passwords in tracked backups and one plaintext in committed `data/ledger.json`.  

| Action | Approval needed? |
|--------|------------------|
| Stop tracking + ignore going forward | Yes (Phase 6 execution) |
| Rotate exposed portal passwords | Operator / business |
| `git filter-repo` / BFG + force-push | **Separate written approval** |

---

## 6. Verdict

| Check | Result |
|-------|--------|
| Working on correct branch | **Yes** |
| `main` modified by this investigation | **No** |
| Uncommitted work preserved | **Yes** |
| Feature branch has security commits | **No — F-04 open** |
| Safe to `git add .` | **No** |

**F-04 status:** Investigation complete; remediation = approved selective commits on current feature branch after F-01 quarantine/gitignore.
