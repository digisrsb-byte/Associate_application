# Phase 6 — IT + GST Excel Import System

**Status:** Implementation and verification complete.  
**Defaults unchanged:** `BUSINESS_DATA_BACKEND=json` (and auth default).  
**Not done:** production import, deployment, commit/push, live `data/ledger.json` / `data/auth.json` changes, Phase 5 real workbook import.

---

## 1. Existing functionality reused

- `mutateBusinessLedger` / `pgLedgerRepository.mutateLedgerForOrganization` (revision + advisory lock)
- `persistPasswordFields` / `portalCrypto` for GST portal passwords
- PAN helpers in `fieldValidation.ts`; balance/total helpers in `ledgerUtils.ts`
- Legacy `POST /api/import/it` and `POST /api/import/gst` retained; now call shared apply helpers
- Entry: Import tab of `DataTransferModal` (export tab unchanged)
- Existing ExcelJS stack; `.xlsx` only

## 2. Files created and modified

**Created**

- `src/import/excelCells.ts`
- `src/import/fieldCatalog.ts`
- `src/import/workbookInspect.ts`
- `src/import/columnMapping.ts`
- `src/import/itMappedParse.ts`
- `src/import/gstMappedParse.ts`
- `src/import/validateImport.ts`
- `src/import/anonymizePreview.ts`
- `src/import/applyImportToLedger.ts`
- `src/import/importSessionStore.ts`
- `src/import/index.ts`
- `src/components/ExcelImportWizard.tsx`
- `tests/unit/importEngine.test.ts`
- `tests/unit/importSessionStore.test.ts`
- `docs/phase6-excel-import-report.md`

**Modified**

- `server.ts` — session routes; shared apply; `maybeBackupLedgerFile` (skip JSON backup under postgres business mode)
- `src/components/DataTransferModal.tsx` — Import tab hosts wizard
- `src/utils/fieldValidation.ts` — optional GSTIN helpers
- `src/utils/csvHelpers.ts` — formula-injection neutralization
- `tests/pg-auth/httpBusiness.pg.test.ts` — import-session HTTP smoke on test DB

## 3. IT import workflow delivered

1. Choose IT  
2. Upload `.xlsx` → `POST /api/import/session` (temp file, OOXML sniff, size ≤ 15MB)  
3. Select worksheet (suggested All Data)  
4. Map columns (aliases auto-suggested; unmapped headings listed)  
5. Validate → anonymized preview, counts, reconciliation  
6. Review errors/duplicates  
7. Confirm (`confirm: true` + mapping fingerprint; type `REPLACE` if replace)  
8. Commit → `mutateBusinessLedger` + report  

## 4. GST import workflow delivered

Same steps with GST field catalog (User ID, company, month, fees/interest/tax, optional password).  
Passwords never appear in preview; encrypted on commit via `persistPasswordFields` (fails closed if key missing when password present).

## 5. Validation and duplicate-handling rules

| Rule | Behavior |
| --- | --- |
| Required mappings | PAN/name/AY (IT); userId/company/month (GST) |
| PAN / optional GSTIN | Format validation; invalid PAN clients excluded |
| Duplicate client+AY / company+month in file | Later row wins; warning counted |
| Existing ledger conflict | `update` overwrites filing; `skip` leaves existing |
| `merge` vs `replace` | Replace removes domain entities not in file only (other domain untouched) |
| Outstanding / GST total | Discrepancies warned; commit stores **calculated** balance/total |
| Unknown columns | Reported; never silently discarded |

## 6. Security and transaction protections

- Auth required; session bound to owner (`userId` or email); org id from server env only  
- Temp workbook under OS temp; deleted on commit/abort/expire  
- Per-org in-process import lock + existing PG advisory lock / mutate retry  
- One-shot commit (fingerprint must match validate); cross-owner session access → 404  
- No passwords in API preview/logs; plaintext never stored  
- CSV formula injection neutralized for generated CSV helpers  
- Macros never executed; `.xls` rejected  

## 7. Test results and build result

| Suite | Result |
| --- | --- |
| `npm run test:unit` | **158 passed**, 2 skipped (24 files) |
| `npm run test:pg-auth` | **42 passed** (includes import-session HTTP smoke on `it_gst_management_test`) |
| `npm run build` | **Succeeded** |

Note: `npm run lint` (`tsc --noEmit`) still reports a few **pre-existing** errors outside Phase 6 (`e2e/security-login-ratelimit.spec.ts`, `pgAuthHttpServer.ts` stdin typing, `passwordResetStore.test.ts`). No remaining errors under `src/import/`.

## 8. Known limitations

- Client Summary ↔ All Data join for incomplete Phase 5 masters is not implemented (incomplete All Data still cannot invent fees)  
- GSTIN is validated optionally but not persisted as a first-class DB column (no schema change)  
- Upload uses base64 JSON (15MB cap); no multipart/multer  
- Wizard does not re-run Mobile/Year Summary cross-checks from the old client-side importer  
- Concurrent JSON-mode imports rely on mutex + single RMW; PG uses revision retry  

## 9. Can owners safely test with synthetic Excel files?

**Yes.** Use blank templates from Export → “Download blank import template”, or any synthetic `.xlsx` with demo PANs/user IDs.  
Do **not** import Phase 5 production/incomplete real workbooks into shared/production stores.

## 10. Remaining work before production deployment

1. Obtain a complete authoritative IT/GST source (Phase 5D still incomplete)  
2. Operator approval + frozen copy + `LEDGER_IMPORT_PATH` rehearsal on `it_gst_management_dev` only  
3. Confirm portal + backup encryption keys in target environment  
4. Explicit cutover approval for `BUSINESS_DATA_BACKEND=postgres`  
5. Optional: multipart upload, GSTIN column, Client Summary join pipeline, E2E UI wizard coverage  

---

## API summary

| Method | Path |
| --- | --- |
| `POST` | `/api/import/session` |
| `POST` | `/api/import/session/:id/validate` |
| `POST` | `/api/import/session/:id/commit` |
| `DELETE` | `/api/import/session/:id` |
| `POST` | `/api/import/it` (legacy) |
| `POST` | `/api/import/gst` (legacy) |
