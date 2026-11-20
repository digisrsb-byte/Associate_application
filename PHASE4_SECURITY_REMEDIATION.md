# Phase 4 – Administrator Credential Security

**Branch:** `security/phase1-password-reset`  
**Status:** Implemented and tested (local UAT)  
**Date:** 2026-11-20

## Original issue

Runtime code fell back to hardcoded administrator credentials (`Admin@123`, default email, recovery code) and auto-wrote `auth.json` with those defaults when the file was missing or incomplete.

## Root cause

`createDefaultAuth()` + `DEFAULT_ADMIN_PASSWORD` / `DEFAULT_RECOVERY_CODE` / `ADMIN_EMAIL` fallbacks in `server.ts` created a predictable bootstrap path without operator intent.

## Fix implemented

1. **Removed hardcoded runtime credentials** from `server.ts` (no `Admin@123`, no auto-create defaults).
2. **Existing `auth.json` preserved** — never overwritten on corrupt/incomplete parse; warn and refuse instead.
3. **One-time bootstrap** when `auth.json` is missing:
   - `GET /api/auth/setup-status` → `{ configured, bootstrapRequired, authFileCorrupt }`
   - `POST /api/auth/bootstrap` → email + strong password + confirm; **409** after setup
4. **Password policy** (`passwordPolicy.ts`) on bootstrap and password reset:
   - min 12 chars; upper + lower + number + special; reject common/weak; reject email-local substring
5. **Hashing:** continue **scrypt** (Node `crypto.scryptSync`) with per-secret salt — appropriate KDF; existing hashes unchanged (no Argon2 migration that would break logins).
6. **Login UI:** first-time setup mode when bootstrap required (same card layout).
7. **Verified backup** before changes: `data/backups/auth-*-pre-phase4.json` (SHA-256 matched).

## Recovery procedure

| Situation | Action |
|-----------|--------|
| Forgot password (auth intact) | Phase 1 flow: Forgot → `data/PASSWORD_RESET_TOKEN.txt` → Reset with **strong** password |
| Lost `auth.json` | Restore from `data/backups/auth-*.json`, **or** delete/missing file and use one-time **First-time setup** |
| Corrupt `auth.json` | Do **not** bootstrap over it. Restore from backup. Bootstrap is disabled while a file is present |
| Key / env notes | Server never creates admin from `ADMIN_PASSWORD` env |

## Files modified / added

| File | Change |
|------|--------|
| `server.ts` | Remove defaults; bootstrap + setup-status; policy on reset |
| `passwordPolicy.ts` | **Added** |
| `src/components/LoginPage.tsx` | Bootstrap mode |
| `.env.example` | No default admin password |
| `.env` | Removed runtime admin password vars usage (QA_* for scripts only) |
| `scripts/phase4-admin-bootstrap-tests.mjs` | **Added** |
| `scripts/phase1-password-reset-tests.mjs` | Strong restore password |
| `scripts/phase2-portal-password-tests.mjs` | Login candidate list |
| `PHASE4_SECURITY_REMEDIATION.md` | This report |

## Tests

```bash
node scripts/phase4-admin-bootstrap-tests.mjs
node scripts/phase1-password-reset-tests.mjs
node scripts/phase2-portal-password-tests.mjs
node scripts/phase3-host-binding-tests.mjs
```

Evidence: `PHASE4_ADMIN_BOOTSTRAP_TEST_RESULTS.json` + Phase 1–3 JSON + `REGRESSION_TEST_RESULTS.md`.

## Remaining risks

| Risk | Phase |
|------|-------|
| Weak legacy password still valid for **login** until changed | Operators should reset to a strong password via Phase 1 flow |
| PAN / field validation | Phase 5 |
| Session cookie `Secure` flag for HTTPS hosting | Hosted guide |

## Note on UAT password after Phase 1 regression

Phase 1 tests restore a **policy-compliant** password (`SecureUat!Ledger2026` by default / `QA_PASSWORD_STRONG`). Update local `QA_PASSWORD` accordingly after running that suite. Existing install login was verified **before** that restore using the prior hash (preserved through Phase 4 code changes).

Note: passwords must not contain the email local-part (e.g. `admin`); the policy rejects that.
