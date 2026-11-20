# Phase 3 – Network Security and Host Configuration

**Branch:** `security/phase1-password-reset`  
**Status:** Implemented and tested (local UAT)  
**Date:** 2026-11-20

## Original issue

The TaxLedger Express server listened on `0.0.0.0`, making the application reachable from other devices on the LAN during local development/UAT.

## Root cause

`app.listen(PORT, '0.0.0.0', …)` was hardcoded with no environment-driven bind host and no local-only default.

## Fix implemented

1. **Default bind host:** `127.0.0.1` when `HOST` is missing or blank.
2. **Configurable host:** `process.env.HOST` (trimmed). There is **no silent fallback to `0.0.0.0`**.
3. **Configurable port:** existing `PORT` (default `3000`).
4. **Explicit all-interfaces:** If an operator sets `HOST=0.0.0.0` or `::`, the server starts but prints a clear security warning (for future hosted/proxy use only — not for local UAT).
5. **Docs:** `.env.example` documents `HOST=127.0.0.1`; `HOSTED_DEPLOYMENT_GUIDE.md` covers future internet hosting (not configured now).

## Files modified / added

| File | Change |
|------|--------|
| `server.ts` | `HOST` env + listen on `HOST`; warn if all-interfaces |
| `.env.example` | `HOST=127.0.0.1` + guidance |
| `.env` | Local UAT `HOST=127.0.0.1` (gitignored) |
| `scripts/phase3-host-binding-tests.mjs` | Bind / LAN probes |
| `PHASE3_SECURITY_REMEDIATION.md` | This report |
| `HOSTED_DEPLOYMENT_GUIDE.md` | Future hosting guidance |
| `UPDATED_QA_AUDIT_REPORT.md` | Audit status after Phases 1–3 |
| `REGRESSION_TEST_RESULTS.md` | Regression evidence |

## Tests performed

```bash
node scripts/phase3-host-binding-tests.mjs
node scripts/phase1-password-reset-tests.mjs
node scripts/phase2-portal-password-tests.mjs
```

Evidence JSON:

- `PHASE3_HOST_BINDING_TEST_RESULTS.json`
- `PHASE1_PASSWORD_RESET_TEST_RESULTS.json`
- `PHASE2_PORTAL_PASSWORD_TEST_RESULTS.json`
- `REGRESSION_TEST_RESULTS.md`

## Verification goals

| Check | Expected |
|-------|----------|
| Default / missing `HOST` | `127.0.0.1` |
| Custom `HOST` / `PORT` | Honoured |
| Localhost access | Works |
| LAN IP access with loopback bind | Fails |
| Phase 1 / Phase 2 auth & portal crypto | Unaffected |

## Remaining risks

| Risk | Phase / note |
|------|----------------|
| Hardcoded admin password fallbacks | Phase 4 |
| Weak PAN / field validation | Phase 5 |
| Operator sets `HOST=0.0.0.0` without proxy | Warning only — operational discipline |
| Vite middleware still served by same Express listen | Same bind host covers UI + API |

## Local UAT usage

```bash
# .env
HOST=127.0.0.1
PORT=3000

npm run dev
# Open http://127.0.0.1:3000  (or http://localhost:3000)
```
