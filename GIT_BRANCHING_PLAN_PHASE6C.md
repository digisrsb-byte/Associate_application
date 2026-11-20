# SAFE GIT BRANCHING PLAN (Phase 6C — NOT EXECUTED)

**Date:** 2026-11-20  
**Status:** **PLAN ONLY** — no `git add`, commit, reset, clean, stash, discard, checkout of `main`, push, or merge until you approve.

---

## 1. Current facts

| Item | Value |
|------|-------|
| Working branch | `security/phase1-password-reset` |
| Tip | Same commit as `main` / `origin/main` (`ecb6037`) |
| Phase 1–5 + 6B code | Present in **working tree / untracked files** |
| Local `dev` | Does not exist |
| Risk | Accidental `git add .` / `git reset --hard` / `git clean` could lose or leak work |

**Preserve rule:** Never discard the working tree. Never switch away from this branch for implementation.

---

## 2. Recommended branch strategy (preserves all Phase 1–5 work)

Stay on **`security/phase1-password-reset`**. Do **not** create a second branch by checking out `main` first (that would risk leaving uncommitted work behind or requiring stash).

Optional rename only (if desired later, still on same commits + WT):

```text
# OPTIONAL later — does not move files; still requires clean commit history first
# git branch -m security/phase1-password-reset security/phases-1-6-hardening
```

No new branch is required to preserve work: the feature branch already holds the WT. Creating commits **on this branch** establishes the security baseline while `main` stays at `ecb6037` until a PR merges.

---

## 3. Pre-commit gates (must pass before any staging)

1. Quarantine verified (`PHASE6_BACKUP_DELETION_CANDIDATES.md` / manifest).  
2. Prefer your approval to **delete** in-repo plaintext backups **or** leave them untracked + gitignored (already gitignored after 6A).  
3. Confirm `.env`, `data/auth.json`, reset token, quarantine dirs, and `_SECURE_BACKUP_KEY` are **not** staged.  
4. Decide policy for `data/ledger.json` (recommended: do not commit live PII; use seed fixture or untrack).  
5. Exclude `TEST_RESULTS.json` if it contains password literals.

---

## 4. Safe staging method (when 6C is approved)

**Never** run: `git add .` · `git add -A` · `git reset --hard` · `git clean -fdx` · `git stash` (unless you explicitly ask).

Use **path-by-path** adds, for example:

### Commit 1 — Security core (Phases 1–5 + 6B)
- `server.ts`, `portalCrypto.ts`, `passwordPolicy.ts`
- `src/utils/fieldValidation.ts`, `src/utils/api.ts`
- Auth/portal UI: `LoginPage.tsx`, `PortalPasswordCell.tsx`, related App wiring
- Export sanitization + form validation components (as already modified)
- `.env.example`, `.gitignore`
- `scripts/phase1-*.mjs` … `phase6b-*.mjs`, `scripts/phase6a-quarantine-backups.mjs`

### Commit 2 — Untrack backup paths from index (no history rewrite)
```text
git rm --cached data/backups/ledger-20261119-175552.json
git rm --cached data/backups/ledger-20261119-175639.json
git rm --cached data/backups/ledger-20261119-175659.json
git rm --cached data/backups/ledger-20261120-103329.json
git rm --cached data/backups/ledger-20261120-111418.json
# optional: git rm --cached data/ledger.json
```

### Commit 3 — Documentation
- Phase / audit / readiness markdown (excluding anything with embedded secrets)

After each commit: `git status` + `git diff main --stat` + confirm `main` still `ecb6037`.

---

## 5. What stays out of Git forever

| Path | Reason |
|------|--------|
| `.env` | Keys / QA secrets |
| `data/auth.json` | Password hash |
| `data/PASSWORD_RESET_TOKEN*` | Reset secret |
| `data/backups/**` | Plaintext / PII / ciphertext |
| `../_SECURE_BACKUPS_OUTSIDE_GIT/**` | Quarantine |
| `../_SECURE_BACKUP_KEY/**` | Archive key |
| Sensitive test JSON with password literals | Leak risk |

---

## 6. Push / PR (separate approval)

1. `git push -u origin security/phase1-password-reset` only when you approve push.  
2. Open PR → `main`.  
3. Do not merge until production readiness re-audit.  
4. **6D** history rewrite / force-push remains **not approved**.

---

## 7. Rollback / disaster notes (do not run unless instructed)

If something goes wrong **before** any commit: working tree is still the source of truth — do not reset.  
If a bad commit is made only on the feature branch: revert with a new commit (preferred) rather than hard reset if push already happened.

---

## 8. Ask

Approve **6C** (and optionally push) only after reviewing this plan and the deletion-candidate decision for in-repo backups.
