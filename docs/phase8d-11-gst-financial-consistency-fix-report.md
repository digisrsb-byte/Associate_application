# Phase 8D.11 — GST Financial Consistency and Legacy Safety Implementation Report

**Date:** 2026-11-25  
**Mode:** Local implementation and automated testing only  
**Plan:** `docs/phase8d-10-gst-financial-consistency-fix-plan.md`  
**Verdict: PASS**

---

## Summary

Implemented Priorities **1, 2, and 4** (including payment-delete confirmation). **Did not** change FY dashboard Received/Outstanding calculation scope (Priority 3 deferred pending business decision). Legacy month `received` is no longer discarded on charge save; Excel All Data shows month payment sums; Simple expand and Sheet Excel show month Recd/Out; unallocated is labelled on dashboard/top cards; payment delete requires confirm.

---

## Files changed

| File | Change |
|------|--------|
| `src/utils/gstFilingSanitize.ts` | **New** — shared `sanitizeGstFilingCharges` (preserve payments[] or legacy `received`) |
| `server.ts` | Uses shared sanitizer |
| `src/utils/gstExcelExport.ts` | All Data: Month Recd / Company Unallocated / Month Outstanding; Sheet View Recd/Out rows |
| `src/utils/gstCopy.ts` | `gstPaymentDeleteWarning`, `GST_TOTAL_RECD_INCLUDES_UNALLOCATED` |
| `src/components/GstSimpleTable.tsx` | Expand: Recd + Outstanding columns |
| `src/components/GstDashboardView.tsx` | Unallocated note under Total Recd when &gt; 0 |
| `src/components/TopSummaryCards.tsx` | Optional `totalReceivedNote` |
| `src/App.tsx` | GST top card note when unallocated &gt; 0 |
| `src/components/GstFilingQuickModal.tsx` | Confirm before payment delete; Keep cancels |
| `tests/unit/gstFilingSanitize.test.ts` | **New** legacy / payment-array cases |
| `tests/unit/gstExcelExport.test.ts` | Multi-month Month Recd ≠ company total |
| `tests/unit/gstCopy.test.ts` | Payment delete warning copy |
| `e2e/export.spec.ts` | New All Data headers / Month Recd = 1000 |
| `e2e/finance-gst.spec.ts` | 8D.11 Keep-on-payment-delete e2e |
| `docs/phase8d-11-gst-financial-consistency-fix-report.md` | This report |

**Not changed:** IT workflows, FY card math, payment formulas, seven company fields, auto-allocation, migrations.

---

## Improvements by priority

### P1 — Legacy Received
- Charge save with no `payments[]` keeps existing scalar `received`.
- Payment-array filings still preserve lines; `received` re-derived from payments.
- Empty `payments: []` remains payment-accounting (received 0).
- No conversion of legacy receipts into payment lines.

### P2 — Excel All Data
- Headers: **Month Recd**, **Company Unallocated Recd**, **Month Outstanding**.
- Month Recd = that month’s payment sum (or legacy scalar via `computeGstFilingReceived`).
- Company Total Recd remains on **Company Summary**.
- Unallocated not added into Month Recd.

### P4 — Presentation
- Excel Sheet View: extra `Recd …` / `Out …` month cells.
- Simple expand: Recd + Outstanding columns.
- Dashboard + top summary: note when unallocated &gt; 0.

### Payment deletion safety
- Trash → warning with amount + date → Confirm remove / Keep.
- Keep leaves payment; API unchanged.

---

## Tests executed

| Suite | Result |
|-------|--------|
| `npm run test:unit` | **244 passed**, 2 skipped; exit 0 |
| Playwright `finance-gst` + `export` + `clients-create` + `reports-dashboard` | **17 passed** on first combined run after unit; **1 failed** then fixed (strict date locator); 8D.11 re-run **1 passed** |
| `npm run build` | **PASS** (exit 0) |

Final 8D.11 payment-delete e2e: **passed**. Unit suite includes new sanitize + Excel month-recd tests.

---

## Financial rules confirmation

- Monthly Total / Received / Outstanding formulas unchanged.  
- Company Received still allocated + unallocated.  
- Idempotency / over-receipt / filing-delete cascade unchanged.  
- FY dashboard calculation **not** changed (P3 deferred).

---

## Remaining / deferred

1. **Priority 3** — FY vs all-time Received/Outstanding on top cards (business decision).  
2. Interim FY label vs FY-scoped math still open.  
3. Optional stronger confirm UX polish (already two-step).

---

## Safety

No production/staging DB, migrations, commits, pushes, or deploys. Synthetic e2e only.

**STOP.** Implementation and local verification complete.
