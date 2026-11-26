# F-01b — Demo credential remediation

**Date:** 2026-11-20  
**Branch:** `security/phase1-password-reset`  
**Commits:** None (not staged)

## Classification (before fix)

| Item | Classification |
|------|----------------|
| `createInitialLedger()` passwords (`Ramesh@2026`, `Priya#456`, `Suresh@789`) | **Sample empty-install seed data** written into a **new** `data/ledger.json` when missing (or on parse failure). **Not** admin/auth defaults. **Not** test-only (they lived in production runtime `server.ts`). |
| Admin auth | Separate: `auth.json` + bootstrap / password reset (Phase 4). Unaffected. |
| Live ledger clients | Independent of seed once `ledger.json` exists. **Not modified** by this remediation. |

## Changes made

1. Replaced all three demo portal passwords in `createInitialLedger()` with empty strings (unset).  
2. Catch-path and empty-backup seed now run `migratePortalPasswordsInState` before write (no plaintext left on disk if seed is used).  
3. Added isolated fixture `scripts/fixtures/demo-ledger-shape.json` — **no** portal passwords; **not** imported by `server.ts`.  
4. Added `scripts/phase6-f01b-demo-credentials-tests.mjs` proving:
   - banned strings absent from `server.ts`
   - seed password literals empty
   - fixture has no passwords
   - banned strings fail admin login (401)
   - bootstrap cannot use them when auth exists (409)
   - existing admin login still works
   - live `ledger.json` / `auth.json` still present

## Not modified

- Live `data/ledger.json` client records  
- `data/auth.json`  
- `.env` / encryption keys  
- Bootstrap and login flows (preserved; verified)

## Test results

| Suite | Result |
|-------|--------|
| F-01b demo credentials | **15/15 PASS** → `PHASE6_F01B_DEMO_CREDENTIAL_TEST_RESULTS.json` |
| Phase 1 (after rate-limit clear restart) | **11/11** |
| Phase 2 | **13/13** |
| Phase 3 | **7/7** |
| Phase 4 | **18/18** |
| Phase 5 (recheck) | **16/16** |
| Phase 6B cookies | **PASS** |

Note: An initial combined run hit Phase 1 rate limits (429) after F-01b login probes; cleared by server restart; recheck green.

## Git

No staging/commit/push. `main` untouched.
