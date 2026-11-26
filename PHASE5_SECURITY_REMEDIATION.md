# Phase 5 – PAN and Input Validation

**Branch:** `security/phase1-password-reset`  
**Status:** Implemented and tested (local UAT)  
**Date:** 2026-11-20

## Original issue

Backend accepted arbitrary PAN strings and unbounded text fields. Invalid historical PANs existed in the ledger with no admin report.

## Root cause

Create/update APIs only checked non-empty PAN; no Indian format regex; import accepted any non-empty PAN; no shared length policy.

## Fix implemented

1. **Shared validation** (`src/utils/fieldValidation.ts`):
   - PAN pattern `^[A-Z]{3}[ABCFGHLJPT][A-Z][0-9]{4}[A-Z]$` (structure only — **not** ITD verification)
   - Trim + uppercase normalization
   - Field limits: name/company 120, userId 80, phone 20, remark 500, ref 40, etc.
2. **API**: IT create/update + GST create/update enforce validation; **duplicate PAN → 409**
3. **Grandfathering**: Updating a client with an **unchanged** historically invalid PAN is allowed so records are not blocked; changing PAN requires a valid format
4. **Import**: Invalid PAN rows **skipped** and listed in `report.invalidPanRows` — existing ledger rows not deleted
5. **Report**: `GET /api/clients/pan-validation-report` lists invalid historical PANs
6. **Frontend**: Client/GST forms validate before submit; PAN `maxLength=11`; same layout/colours

## Files modified / added

| File | Change |
|------|--------|
| `src/utils/fieldValidation.ts` | **Added** |
| `src/utils/ledgerUtils.ts` | `normalizePan` → shared 10-char helper |
| `server.ts` | Validation, duplicate PAN, import report, pan-validation-report |
| `src/components/ClientModal.tsx` | Frontend checks + maxLength 10 |
| `src/components/ClientEditDrawer.tsx` | Same |
| `src/components/GstCompanyModal.tsx` | Length/phone checks |
| `src/components/DataTransferModal.tsx` | Show invalid PAN import rows |
| `scripts/phase5-input-validation-tests.mjs` | **Added** |
| `PHASE5_SECURITY_REMEDIATION.md` | This report |

## Tests

```bash
node scripts/phase5-input-validation-tests.mjs
# plus Phase 1–4 regression
```

Evidence: `PHASE5_INPUT_VALIDATION_TEST_RESULTS.json`, `REGRESSION_TEST_RESULTS.md`.

## Remaining notes

- Format validation ≠ Income Tax Department verification.
- Historical invalid PANs (e.g. `!!!`, non-category 4th letter) remain until an admin corrects them; use `/api/clients/pan-validation-report`.
