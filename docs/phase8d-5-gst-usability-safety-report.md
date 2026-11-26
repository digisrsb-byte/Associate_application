# Phase 8D.5 — GST Usability and Payment-History Safety Report

**Date:** 2026-11-25  
**Mode:** Local implementation and automated testing only  
**Plan:** `docs/phase8d-5-gst-usability-safety-plan.md`  
**Verdict: PASS WITH WARNINGS**

---

## Summary

Phase 8D.5 delivered unallocated-receipt visibility, company-vs-monthly Outstanding explanation (only when unallocated &gt; 0), UI payment idempotency hardening with App-level fallback, and stronger filing-deletion confirmation copy. Financial formulas, IT workflows, seven mandatory GST company fields, Monthly Total = Fees + Interest + Tax, and delete API behaviour were not changed. No commit, push, migration, or hosting actions were taken.

---

## Files changed (8D.5 scope)

### New
| File | Role |
|------|------|
| `src/utils/gstCopy.ts` | Shared labels, Outstanding explanation, filing-delete warning copy |
| `tests/unit/gstCopy.test.ts` | Unit coverage for copy helpers |
| `docs/phase8d-5-gst-usability-safety-report.md` | This report |

### Updated — display / Excel
| File | Change |
|------|--------|
| `src/utils/summaryUtils.ts` | `GstClientSummaryRow.unallocatedReceived` from `computeGstClientTotals` |
| `src/utils/gstExcelExport.ts` | **Unallocated Recd** column on All Data, Sheet View, Company Summary |
| `src/components/GstSheetTable.tsx` | Unallocated line + Outstanding note when &gt; 0 |
| `src/components/GstSimpleTable.tsx` | Same + delete warning on Remove |
| `src/components/mobile/GstCompanyMobileList.tsx` | Unallocated / Outstanding note + delete warning |
| `src/components/GstSummaryViews.tsx` | Unallocated / Outstanding secondary lines |
| `src/components/mobile/SummaryMobileCards.tsx` | GST summary cards show unallocated when &gt; 0 |
| `src/components/GstCompanyEditDrawer.tsx` | Aligned wording + Outstanding explanation |
| `src/components/GstFilingQuickModal.tsx` | Unallocated note, Outstanding explanation, delete warning, idempotency key lifecycle |

### Updated — safety UX / handlers
| File | Change |
|------|--------|
| `src/components/mobile/ConfirmDangerButton.tsx` | Optional `warning` shown on confirm step |
| `src/App.tsx` | Always send `Idempotency-Key` (body + header); generate fallback if UI omits |

### Updated — tests / helpers
| File | Change |
|------|--------|
| `tests/unit/gstExcelExport.test.ts` | Assert Unallocated Recd header/value |
| `tests/unit/summaryUtils.test.ts` | Assert `unallocatedReceived` on client summaries |
| `e2e/finance-gst.spec.ts` | Phase 8D.5 UI: unallocated visibility, idempotency retry key, delete warning + Keep |
| `e2e/export.spec.ts` | GST Excel Unallocated Recd e2e |
| `e2e/helpers/finance.ts` | `selectGstAllMonths`, `openGstFilingEditor` |

---

## Improvements implemented

### A. Unallocated Received visibility
- Shown as **Unallocated Received** when `unallocatedReceived > 0` on sheet, simple table, mobile company list, summary views (desktop + mobile cards), edit drawer, and filing modal.
- Excel: stable **Unallocated Recd** column (value `0` when none) before Outstanding on company-oriented sheets; company-level unallocated repeated beside Total Recd on month/All Data rows.

### B. Outstanding explanation
- Shared copy: company Outstanding includes unallocated receipts; monthly Outstanding only includes payments allocated to that month.
- Shown only when unallocated &gt; 0 (muted secondary line / `title` tooltip).
- **Formulas unchanged** (`computeGstClientTotals` / monthly outstanding math untouched).

### C. Payment idempotency
- `GstFilingQuickModal`: create path sets a stable `createIdempotencyKeyRef` before POST; cleared only after success (`resetPaymentForm`) or target change — failed retries reuse the same key.
- `App.handleRecordGstPayment`: always sends `Idempotency-Key` header and body key; generates a unique fallback if the modal omits one.
- Payment **edit** (PUT) unchanged — no idempotency requirement added.

### D. Filing deletion warning
- Confirm step warns that removing a monthly filing permanently deletes nested payment history; includes payment count when &gt; 0; states unallocated company receipts are not removed.
- Two-step confirm preserved; same delete API (hard delete of filing + nested payments). No soft-delete or reparenting.

---

## Constraints preserved

| Constraint | Status |
|------------|--------|
| GST layout / colours / responsive behaviour | Preserved (additive muted copy/columns only) |
| Field order Company → User ID → Password → Phone → Ref No → Remark → Monthly Filing | Untouched |
| All seven fields mandatory | Untouched |
| Monthly Total = Fees + Interest + Tax | Untouched |
| Company / monthly Outstanding formulas | Untouched |
| No auto-allocate of unallocated | Untouched |
| IT workflows / calculations | Untouched (regression e2e passed) |
| Portal passwords not exposed in lists/exports/normal API | Preserved (export blank Password cells asserted) |

---

## Tests executed

### Unit — `npm run test:unit`
| Result | Detail |
|--------|--------|
| **PASS** | 31 files; **238 passed**, **2 skipped** (pre-existing skips); exit 0 |

Relevant coverage includes `gstCopy`, `gstExcelExport` Unallocated Recd, `summaryUtils` unallocated field, existing GST payment safety / ledger utils, IT summary utils.

### Playwright (actually run)
| Suite / filter | Result |
|----------------|--------|
| `e2e/finance-gst.spec.ts` (full file, incl. Stage 3 + 8D.3 + 8D.5) | **PASS** (within full targeted run) |
| `e2e/clients-create.spec.ts` | **PASS** |
| `e2e/reports-dashboard.spec.ts` | **PASS** |
| `e2e/export.spec.ts` (incl. GST Unallocated Recd) | **PASS** |
| Combined targeted run (15 tests) | **15 passed**, exit 0 |

Phase 8D.5-specific cases verified:
- Unallocated Received visible on All Data with Outstanding explanation  
- UI Record Payment sends Idempotency-Key; failed retry reuses the same key  
- Filing delete warning mentions payment count; Keep cancels and preserves filing + payments  
- GST Excel export Unallocated Recd column/value  

### Build — `npm run build`
| Result | Detail |
|--------|--------|
| **PASS** | Vite client build + `server.mjs`; exit 0 (chunk-size advisory only) |

### Failures / skips
- Unit: **2 skipped** (existing suite behaviour; not introduced by 8D.5).  
- No failing tests in the final targeted Playwright run or unit/build runs recorded above.  
- Intermediate e2e failures during development (IT workbook race, strict-mode locators, 30s timeout on delete-warning test) were fixed before the final green run; not left failing.

---

## Financial / IT confirmation

- No edits to Monthly Total or Outstanding calculation implementations for formula change.  
- Unallocated remains display/accounting-pool only; not auto-allocated to months.  
- IT client creation, reports/dashboard independent totals, and GST Stage 3 / 8D.3 payment safety e2e still pass.

---

## Remaining warnings and business decisions

1. **Tax meaning** still unsigned (carried from 8D.4) — not blocking usability work.  
2. Filing delete still hard-deletes nested payments after two-tap confirm — stronger gate (type-to-confirm / block when payments exist) remains a **business decision**.  
3. Excel **import** does not round-trip `unallocatedReceived` (export-only in 8D.5).  
4. Dashboard KPI strip does not break out Unallocated (optional follow-up).  
5. Vite `__dirname` / large-chunk and WebSocket 24678-in-use messages appear during local e2e/build; non-blocking for this phase.

---

## Safety restrictions observed

- No production/staging DB connection.  
- Synthetic e2e data only (`data-e2e`).  
- No migrations, imports of business ledgers, or deletion of Phase 8C.3 drill databases.  
- No commit, push, branch switch, or deployment.

---

## Verdict

**PASS WITH WARNINGS**

Implementation and automated verification for Phase 8D.5 are complete. Warnings are residual product/business items (Tax meaning, stronger delete policy, import of unallocated, dashboard breakout), not open test failures.

**Stop.** No hosting or production steps follow this report.
