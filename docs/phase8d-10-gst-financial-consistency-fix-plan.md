# Phase 8D.10 — GST Financial Consistency and Legacy Safety Plan

**Mode:** Strict read-only audit and planning (no implementation)  
**Date:** 2026-11-25  
**Reference:** `docs/phase8d-9-full-gst-user-flow-verification-report.md` (warnings A–G)

**Plan verdict: READY FOR IMPLEMENTATION** (after Priority 3 business decision)

---

## Scope and constraints

| Preserve | Status |
|----------|--------|
| IT workflows | Untouched |
| GST payment arrays + formulas | Untouched |
| Idempotency / over-receipt | Untouched |
| Seven company fields + order | Untouched |
| No auto-allocate of unallocated | Untouched |
| UI colours / design language | Additive columns/labels/confirm only |
| No data cleanup / migrations in 8D.10 | Plan only; any data repair is a later approved phase |

---

## Priority 1 — Legacy Received preservation (Warning F)

### Root cause

`sanitizeGstFiling` in `server.ts` builds a charge-only `base` (`month`, `fees`, `interest`, `tax`, `total`).

- If `existing.payments` **is an array** → payments are copied and `received` is re-derived via `withGstFilingReceived`.
- If `existing.payments` is **absent** (legacy month with only scalar `received`) → function returns `base` **without** `received` or `payments`.

Display still uses `computeGstFilingReceived` (`ledgerUtils.ts`), which falls back to `filing.received` only when `payments` is not an array. After charge save, that fallback value is gone → UI shows ₹0 for month Received even though money was previously stored on the filing.

**Trigger path:** `POST /api/gst/clients/:id/filings` → `sanitizeGstFiling(month, req.body, existingFiling)` (`server.ts` ~3220).

**Also:** company create can call `sanitizeGstFiling` without `existing` (no legacy to lose). Import GST paths that omit payments behave like create.

**Not the same as company `unallocatedReceived` / `totalReceived`:** those are company-level. Warning F is **month-level** scalar `GstMonthlyFiling.received` without `payments[]`.

### Financial-data loss risk

| Risk | Severity |
|------|----------|
| User edits Fees/Interest/Tax on a legacy month → Save Filing → month Received disappears from storage | **High** (silent loss of displayed/stored month receipt) |
| Affects any ledger still carrying pre–payment-array month `received` | Medium–High depending on data age |
| Payment-array companies (current 8D path) | Low — payments preserved |

### Recommended correction

**Do not auto-allocate** month legacy `received` into payment lines or into unallocated.

**Safe preserve (recommended default):**

In `sanitizeGstFiling`, when `existing.payments` is not an array:

1. Keep charge fields from input as today.  
2. If `existing.received` is a finite number &gt; 0 (or ≥ 0), **copy `received` onto the saved filing**.  
3. Still do **not** invent an empty `payments: []` (avoids flipping the company into payment-accounting mode accidentally and wiping the scalar fallback).

Optional later (separate business decision): one-time migration tool that converts month scalar `received` into a single synthetic payment line — **out of scope** for silent 8D.10 fix.

### Files / functions likely to change

| File | Change |
|------|--------|
| `server.ts` — `sanitizeGstFiling` | Preserve `existing.received` when no `payments` array |
| Mirror in built `server.mjs` via normal build | — |
| `tests/unit/` (new or extend payment/safety tests) | Legacy month: charge save keeps `received`; with `payments[]` still preserves lines |

### Regression tests

- Legacy filing `{ received: N, no payments }` → POST charges → `received` still N; Total recalculated.  
- Filing with `payments: [...]` → charge save preserves payments; `received` = sum.  
- Filing with `payments: []` → received stays 0 (payment-accounting mode).  
- Existing 8D.3 legacy **company** unallocated tests still pass.

---

## Priority 2 — Excel All Data monthly Received (Warning B)

### Root cause

`writeGstAllData` in `gstExcelExport.ts` writes each company–month row with:

- Col “Total Recd” = `computeGstClientTotals(client).totalReceived` (company-wide: allocated + unallocated)  
- Col “Unallocated Recd” = company unallocated  
- Col “Outstanding” = company outstanding  

So every month row for the same company repeats the **same company totals**, not that month’s payment sum. Misleading when comparing to modal “Received” for the month.

### Financial-data loss risk

None (export-only presentation). Risk is **misreporting / wrong business decisions** from Excel filters and pivots.

### Recommended correction

On **month rows** in All Data:

| Column | Recommended value |
|--------|-------------------|
| Rename or keep “Total Recd” as month receipt | Prefer header **Month Recd** (or keep “Total Recd” with documented month meaning) = `computeGstFilingReceived(f)` |
| Unallocated Recd | Keep company unallocated on the row **or** blank on month rows and only show on company-only rows — prefer keep company unallocated for filterability, with clear header **Company Unallocated Recd** |
| Outstanding | Prefer **Month Outstanding** = `computeGstFilingOutstanding(f)` on month rows |

Company-level Total Recd / Outstanding / Unallocated remain authoritative on **Company Summary** sheet (already present).

Do **not** put unallocated into Month Recd.

Company-only rows (no filings): keep company Total Recd / Unallocated / Outstanding as today.

### Files / functions

| File | Change |
|------|--------|
| `src/utils/gstExcelExport.ts` — `writeGstAllData` | Month Recd / Month Outstanding from filing helpers; adjust headers |
| `tests/unit/gstExcelExport.test.ts` | Assert month payment sum ≠ company total when both exist |
| `e2e/export.spec.ts` | Optional assert Month Recd / Unallocated semantics |

### Regression tests

- Company with unallocated 50k + month payment 1k → All Data month row Month Recd = 1000; Unallocated = 50000; Company Summary Total Recd = 51000.  
- Password column blank.  
- Existing export e2e still passes.

---

## Priority 3 — Financial Year dashboard consistency (Warning A)

### Root cause

`gstTotalsSummary` in `App.tsx` (~263–286):

- **totalBilled / totalEntries:** sum only filings whose month ∈ `visibleGstMonths` (selected FY).  
- **totalReceived / outstandingTotal:** sum of `computeGstClientTotals(c)` over **all** companies → **all months + unallocated**, not FY-scoped.

`gstOverallTotalsSummary` is fully company-wide (used on overall dashboard). GST section top cards use `gstTotalsSummary` when not on year-summary tab.

`computeGstMonthSummary` similarly aggregates month billed rows by month list, then adds company-wide received/outstanding at the footer (`summaryUtils.ts` ~381–388).

Unallocated is **company-level**, not FY-tagged — so “FY Received” cannot include unallocated without an explicit product rule.

### Financial-data loss risk

None. Risk is **incorrect operational reading** of FY cards vs month tables.

### Recommended correction (requires business decision)

| Option | Behaviour | Pros / cons |
|--------|-----------|-------------|
| **A — Scope cards to FY (recommended if cards imply FY)** | FY Billed = FY months; FY Received = sum of payment lines in FY months only; FY Outstanding = max(0, FY Billed − FY Received) **or** sum of month outstandings; show **Company Unallocated** as a separate labelled figure (not inside FY Received) | Consistent with “this FY”; needs clear unallocated card/label |
| **B — Keep maths; fix labels only** | Leave numbers; relabel Received/Outstanding as “All companies (all months)” and Billed as “This FY” | Minimal code; still confusing side-by-side |
| **C — Use overall totals on GST top cards** | Always show `gstOverallTotalsSummary` | Removes mix; loses FY billed on top strip |

**Unallocated representation (if Option A):** separate muted line or fifth metric: “Unallocated Received (company)” = sum of `getGstUnallocatedReceived` — never folded into FY Received.

**Do not change** underlying `computeGstClientTotals` formulas; only **which slices** feed the cards and **labels**.

### Files / functions

| File | Change |
|------|--------|
| `src/App.tsx` — `gstTotalsSummary` | After decision: FY-scoped received/outstanding helper or label-only |
| Optional `src/utils/summaryUtils.ts` | Shared `computeGstFyPaymentReceived(clients, months)` |
| `src/components/TopSummaryCards.tsx` / `GstDashboardView.tsx` | Labels; optional unallocated line |
| Unit tests for FY slice helper | — |

### Business decision required (blocking for Priority 3 implementation)

> Should GST top-summary Received/Outstanding mean **selected FY only**, or **all-time company totals**?  
> How should **unallocated** appear when FY-scoping Received?

Until answered, implement **label clarification (Option B)** as the safe interim, or hold Priority 3 code.

---

## Priority 4 — Other presentation and safety warnings

### C — Excel Sheet View missing monthly Recd/Out

**Root cause:** `writeGstSheetView` emits Fees/Inter/Tax/Total strings per month cell; company Total Recd / Unallocated / Outstanding only on the fees row trailing columns — no per-month Recd/Out (unlike UI Sheet cells).

**Risk:** Export incompleteness vs UI; no data loss.

**Recommendation:** Add two extra sub-rows (or append `Recd …` / `Out …` strings in month cells on additional rows) mirroring UI Sheet, **or** document Sheet View export as charge-layout only and point users to All Data for Month Recd. Prefer additive Recd/Out lines for parity if low effort.

**Files:** `gstExcelExport.ts` — `writeGstSheetView`; unit export test.

### D — Simple View expanded month rows

**Root cause:** Expand table headers/cells are Month, Fees, Interest, Tax, Total, Action only (`GstSimpleTable.tsx` ~595–624).

**Risk:** UX inconsistency vs Sheet; no data loss.

**Recommendation:** Add **Recd** and **Outstanding** columns using `computeGstFilingReceived` / `computeGstFilingOutstanding` (same styling as Fees columns). Optional on mobile expand if space allows (`GstCompanyMobileList` already emphasises company outstanding).

**Files:** `GstSimpleTable.tsx`; optional mobile list; e2e visibility smoke optional.

### E — Dashboard Total Recd labelling when unallocated exists

**Root cause:** `GstDashboardView` shows “Total Recd” from summary that includes unallocated via `computeGstClientTotals`, without always labelling unallocated.

**Recommendation:** When aggregate unallocated &gt; 0, add muted note under Total Recd (reuse `GST_UNALLOCATED_LABEL` / existing explain copy). Align with Priority 3 labels.

**Files:** `GstDashboardView.tsx`; possibly month-summary footer in `summaryUtils` consumers.

### G — Individual payment deletion without confirmation

**Root cause:** Payment delete is a single trash button → `handleDeletePayment` (`GstFilingQuickModal.tsx`); filing delete uses `ConfirmDangerButton`.

**Risk:** Accidental permanent removal of a payment line (recoverable only via backup/restore).

**Recommendation:** Reuse `ConfirmDangerButton` (or compact two-tap) for payment delete: warning “Remove this payment of ₹X? This cannot be undone.” Keep API unchanged.

**Files:** `GstFilingQuickModal.tsx`; e2e: cancel keeps payment; confirm deletes.

---

## Implementation order (recommended)

1. **P1 — Legacy `received` preserve in `sanitizeGstFiling`** (data-loss prevention; highest urgency).  
2. **P2 — Excel All Data Month Recd / Month Outstanding** (reporting accuracy).  
3. **P4-G — Confirm before payment delete** (accident prevention).  
4. **P4-D — Simple expand Recd/Out columns** (parity).  
5. **P4-E — Dashboard unallocated label** (clarity).  
6. **P4-C — Excel Sheet View Recd/Out** (parity; after P2 patterns).  
7. **P3 — FY cards** only after business decision (or interim Option B labels).

Each step: unit + targeted Playwright; no IT changes; no formula changes to `computeGstClientTotals` / payment caps.

---

## Required regression tests (suite-level)

| Area | Tests |
|------|-------|
| Legacy month received | New unit: charge save preserves scalar `received` |
| Payment-array path | Existing 8D.3 / ledger utils |
| Excel All Data | Unit + export e2e: Month Recd = payment sum; Unallocated not in Month Recd |
| Company Summary | Unchanged company Total Recd |
| FY cards | Unit for scoped helper once P3 decided |
| Payment delete confirm | E2E cancel preserves; confirm removes |
| Simple expand | Optional e2e or component assertion |
| IT | `clients-create`, IT finance unchanged |
| Full GST | `finance-gst`, `reports-dashboard`, `export` |

---

## Business decisions requiring approval

1. **Priority 3:** FY vs all-time meaning of GST top-card Received/Outstanding; how to show unallocated.  
2. **Excel All Data headers:** rename to “Month Recd” / “Month Outstanding” vs keep “Total Recd” with new meaning (breaking for users who already pivot on the old company-repeated value).  
3. **Legacy migration (optional later):** convert month scalar `received` into a payment line — **not** part of the default P1 preserve.  
4. **Payment delete confirm:** proceed with two-tap (recommended) vs leave one-click.

---

## Overall readiness verdict

**READY FOR IMPLEMENTATION** for Priorities **1, 2, and 4** (with P4-C optional parity).

**Priority 3** is **READY FOR LABEL-ONLY** immediately; **READY FOR CALCULATION CHANGE** only after the FY/unallocated business decision.

No source, test, database, or deployment actions were taken in this phase.

**STOP.** Do not implement fixes until an implementation phase is explicitly approved.
