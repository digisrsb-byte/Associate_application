# Regression test results (post F-01b)

**Date:** 2026-11-20  
**Branch:** `security/phase1-password-reset`  
**Server:** `HOST=127.0.0.1`, `COOKIE_SECURE=auto`

| Suite | Result | Artifact |
|-------|--------|----------|
| F-01b demo credentials | **15/15 PASS** | `PHASE6_F01B_DEMO_CREDENTIAL_TEST_RESULTS.json` |
| Phase 1 password reset | **11/11 PASS** | `PHASE1_PASSWORD_RESET_TEST_RESULTS.json` |
| Phase 2 portal encryption | **13/13 PASS** | `PHASE2_PORTAL_PASSWORD_TEST_RESULTS.json` |
| Phase 3 host binding | **7/7 PASS** | `PHASE3_HOST_BINDING_TEST_RESULTS.json` |
| Phase 4 admin bootstrap | **18/18 PASS** | `PHASE4_ADMIN_BOOTSTRAP_TEST_RESULTS.json` |
| Phase 5 input validation | **16/16 PASS** | `PHASE5_INPUT_VALIDATION_TEST_RESULTS.json` |
| Phase 6B cookie security | **ALL PASS** | `PHASE6B_COOKIE_SECURITY_TEST_RESULTS.json` |

**Overall:** All listed suites green after F-01b remediation (Phase 1/5 rechecked after rate-limit restart).

Live ledger / auth were not wiped. No commits performed.
