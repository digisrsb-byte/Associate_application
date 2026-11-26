# Phase 8D.14 — GST Financial Year Dashboard Consistency Implementation Report

**Date:** 2026-11-25  
**Mode:** Local implementation and automated testing only  
**Plan:** `docs/phase8d-12-gst-fy-dashboard-consistency-plan.md`  
**Prior:** `docs/phase8d-13-gst-visible-payment-entry-report.md`  
**Verdict: PASS**

---

## Summary

Implemented Option A selected-FY GST dashboard totals. Top summary cards and month-summary footers now share `computeGstFyDashboardTotals`. A working `GstYearSelector` drives the selected FY. Unallocated company receipts stay separate from FY Received. Overall / combined money-picture KPIs remain company-wide. IT calculations and GST payment APIs/storage are unchanged.

---

## Formulas (locked)

For selected FY months `M = getMonthsForGstFinancialYear(selectedFy)`:

| Metric | Formula |
|--------|---------|
| **FY Billed** | `Σ getGstFilingCollectibleTotal(f)` for filings with month ∈ `M` |
| **FY Received** | `Σ computeGstFilingReceived(f)` for those filings (filing month, **not** `paymentDate`) |
| **FY Outstanding** | `Σ computeGstFilingOutstanding(f)` — overpayment does not cross months |
| **FY Entries** | Count of those filings |
| **Unallocated** | `Σ getGstUnallocatedReceived(c)` — display only; never in FY Received |

`computeGstClientTotals` is **not** modified.

---

## Selector behaviour

- State: `selectedGstFy` (init = current Indian GST FY).
- `GstYearSelector` mounted on GST section tabs (not overall year-summary).
- Prev/Next call `shiftGstFinancialYear`; updates `visibleGstMonths`, top cards, All Data / Sheet / Company Summary month columns, and header FY label.
- Top Received card shows `receivedScopeLabel` = selected FY plus FY scope / unallocated copy.

---

## Files changed

| File | Change |
|------|--------|
| `src/utils/summaryUtils.ts` | **New** `computeGstFyDashboardTotals`; `computeGstMonthSummary` Recd/Out/unallocated from helper |
| `src/App.tsx` | Selected FY state; FY options; `gstTotalsSummary` via helper; mount `GstYearSelector`; FY labels on top cards |
| `src/components/GstYearSelector.tsx` | Wired from App (component already existed) |
| `src/components/TopSummaryCards.tsx` | Optional `receivedScopeLabel` |
| `src/components/GstDashboardView.tsx` | FY label on hero/totals; FY Recd/Out copy; unallocated separate |
| `src/components/OverallDashboard.tsx` | Combined GST KPIs stay **company-wide** via `computeGstClientTotals` |
| `src/components/mobile/MobileDashboard.tsx` | Same company-wide combined GST totals |
| `src/utils/gstCopy.ts` | `GST_FY_RECD_SCOPE_NOTE`, `gstFyUnallocatedSeparateNote` |
| `tests/unit/gstFyDashboardTotals.test.ts` | **New** — plan §8 scenarios |
| `tests/unit/summaryUtils.test.ts` | Month-summary footer expectations |
| `tests/unit/gstCopy.test.ts` | FY copy |
| `e2e/finance-gst.spec.ts` | 8D.14 FY selector smoke |
| `e2e/reports-dashboard.spec.ts` | Soften money-picture amount assert (shared e2e DB) |
| `docs/phase8d-14-gst-fy-dashboard-implementation-report.md` | This report |

**Not changed:** GST payment APIs/storage, `computeGstClientTotals` body, IT year-summary math, migrations, imports.

---

## Tests executed

### Unit — `npm run test:unit`
| Result | Detail |
|--------|--------|
| **PASS** | **257** passed, 2 skipped (was 244 + new FY/copy cases) |

### Playwright
| Suite | Result |
|-------|--------|
| `finance-gst` 8D.14 FY selector | **PASS** |
| `finance-gst` 8D.5 / 8D.8 / 8D.11 / 8D.13 (targeted) | **PASS** |
| `reports-dashboard` Stage 4D | **PASS** (after soft money-picture assert) |
| Earlier full `finance-gst` + create + export run | 18/20 then fixed; FY + Stage 4D green |

### Build — `npm run build`
| Result | Detail |
|--------|--------|
| **PASS** | Vite + `server.mjs`; exit 0 |

---

## Financial safety

- Payment FY = parent filing month.  
- FY Outstanding = sum of month outs.  
- Unallocated never auto-assigned.  
- Legacy month `received` still via `computeGstFilingReceived`.  
- Company totals unchanged.  
- IT unchanged.  
- No payment API/storage changes.

---

## Safety

Local only; no production/staging DB; no migrations/imports; no commit/push/deploy.

---

## STOP

Implementation and local verification complete.
