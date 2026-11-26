# Phase 8D.12 — GST Financial Year Dashboard Consistency Plan

**Date:** 2026-11-25  
**Mode:** Strict read-only investigation and implementation planning  
**Approved decision:** Option A — Selected Financial Year  
**Reference:** `docs/phase8d-11-gst-financial-consistency-fix-report.md`, `docs/phase8d-10-gst-financial-consistency-fix-plan.md` (Priority 3)  
**Verdict: READY FOR IMPLEMENTATION** (no accounting blocker)

---

## 1. Objective

Make all GST financial-year dashboard cards use one consistent selected-FY scope:

| Card / metric | Scope after Option A |
|---------------|----------------------|
| Total Billed | Charges on filings whose month ∈ selected FY |
| Total Received | Payment amounts allocated to those same FY filings |
| Outstanding | Outstanding for those same FY filings |
| Entries | Count of filings in that FY |
| Unallocated | Company-level legacy receipts — **separate**, never assigned to an FY |
| Selected FY label | Clearly visible on dashboard / top cards |

**Non-goals:** Do not change GST payment storage or APIs; do not modify IT dashboard calculations; do not change company-level or monthly formulas used by Sheet / Simple / company drawers.

---

## 2. Root cause

### 2.1 Mixed scope in `gstTotalsSummary` (`App.tsx` ~264–287)

```text
For each gstClient:
  totalReceived     += computeGstClientTotals(c).totalReceived      // ALL months + unallocated
  outstandingTotal  += computeGstClientTotals(c).outstandingTotal   // ALL months + unallocated
  for filings where month ∈ visibleGstMonths:
    totalBilled     += filing.total                                 // FY only
    totalEntries    += 1                                            // FY only
```

- **Billed / Entries** are already Option A (selected FY via `visibleGstMonths` from `getMonthsForGstFinancialYear(activeGstFy)`).
- **Received / Outstanding** are all-time company aggregates (allocated payments across every month + `unallocatedReceived`).
- Header already shows `activeGstFy` (`App.tsx` ~863), so users reasonably read all four cards as FY-scoped — but Received/Outstanding are not.

### 2.2 Same mix in GST month-summary footer (`summaryUtils.ts` `computeGstMonthSummary` ~381–388)

- Per-month rows and `totalBilled` / `totalEntries` / fee/interest/tax totals iterate the passed `months` list (FY when called from `GstDashboardView` with `visibleGstMonths`).
- Footer `totalReceived` / `totalOutstanding` again sum `computeGstClientTotals(client)` company-wide.
- `GstDashboardView` “GST Totals Summary” and hero “filings in the selected year” therefore imply FY while Recd/Outstanding remain all-time (8D.11 only added an unallocated **note**, not FY math).

### 2.3 FY selector not wired

- `activeGstFy = currentGstFy` always (`App.tsx` ~257); no state for prior/next FY.
- `GstYearSelector.tsx` exists (prev/next + “Current” badge) but is **not mounted** anywhere in `src/`.
- Helpers already exist: `shiftGstFinancialYear`, `getMonthsForGstFinancialYear`, `collectGstFinancialYears`, etc. (`ledgerUtils.ts` ~368–445).

---

## 3. How payments associate with filings (critical accounting inspection)

### 3.1 Storage model

| Concept | Behaviour today |
|---------|-----------------|
| Payment record | `GstPaymentEntry` lives **on** `GstMonthlyFiling.payments[]` (`types/ledger.ts`) |
| Filing key | Month label, e.g. `Apr 2025` → maps to FY via `getGstFinancialYearLabel(month)` |
| `paymentDate` | Calendar metadata (`YYYY-MM-DD`) for UX / confirm copy; **not** used in any FY or month Received formula |
| Month Received | `computeGstFilingReceived(filing)` = sum of that filing’s `payments[].amount` (or legacy scalar `received`) |
| Company allocated Received | `sumGstClientPaymentLines` = sum of `computeGstFilingReceived` over **all** filings |
| Unallocated | `client.unallocatedReceived` — company-level; never tied to a month/FY |

**Conclusion:** A payment is economically “allocated to” the filing month it is stored under. There is no separate payment ledger keyed by date for GST FY reporting.

### 3.2 Filing-month FY vs payment-date FY

| Rule | Meaning | Fits current product? |
|------|---------|------------------------|
| **A. Filing association (recommended)** | Count payment in the FY of the **filing month** it is attached to | Yes — matches storage, month Recd, Excel Month Recd, Option A wording (“payments allocated to filings belonging to that FY”) |
| B. Payment calendar date | Count payment in FY of `paymentDate` even if filing is another FY | No — would invent a second FY axis; silent change; breaks parity with monthly Recd |

**Approved Option A text already selects rule A:**  
“Total Received must show payments allocated to filings belonging to that FY.”

### 3.3 IT convention (do not change IT)

`computeYearSummary` (`summaryUtils.ts`): for each assessment year key, `received += Number(f.received)` on **that year’s filing**. IT has no payment-date FY bucket either — Received is **filing-period scoped**, not cash-date scoped.

**Recommendation (document as assumption, not a silent rule change):**  
GST FY Received = sum of payment amounts on filings whose month ∈ selected FY.  
**Do not** attribute by `paymentDate`. No further business blocker for this axis.

---

## 4. Proposed formulas (Option A)

Let `M` = `getMonthsForGstFinancialYear(selectedFy)` (same set already used for Billed/Entries).  
Let `F_fy` = all filings across companies with `month ∈ M`.

| Metric | Formula | Notes |
|--------|---------|--------|
| **FY Billed** | `Σ getGstFilingCollectibleTotal(f)` for `f ∈ F_fy` | Same as current `gstTotalsSummary` billed loop |
| **FY Received** | `Σ computeGstFilingReceived(f)` for `f ∈ F_fy` | Only allocated month payments / legacy month scalars on those filings |
| **FY Outstanding** | `Σ computeGstFilingOutstanding(f)` for `f ∈ F_fy` | Per-filing `max(0, collectible − received)`; over-receipt on one month does not reduce another month’s outstanding |
| **FY Entries** | `\|F_fy\|` | Unchanged |
| **Unallocated (separate)** | `Σ getGstUnallocatedReceived(c)` over companies | Never added into FY Received; never assigned to an FY |
| **Company totals** | Keep `computeGstClientTotals` unchanged | Sheet / Simple / drawers / overall GST strip |

### 4.1 Outstanding: sum of month outs vs `max(0, FY Billed − FY Received)`

| Variant | Behaviour when one month over-receives |
|---------|----------------------------------------|
| **Recommended: Σ month outstanding** | Matches “outstanding for those FY filings”; aligns with Sheet/Simple month Out; overpayment stays local |
| `max(0, FY Billed − FY Received)` | Can understate “still due” if overpayment on month A offsets underpayment on month B |

**Assumption locked for implementation:** use `Σ computeGstFilingOutstanding(f)` for FY cards and FY dashboard footer.  
Document in UI that FY Outstanding is the sum of monthly outstanding for the selected FY (not company all-time).

### 4.2 Double-count safety

- Iterate each filing in `F_fy` once; call `computeGstFilingReceived` once per filing.
- Do **not** also add `computeGstClientTotals().totalReceived` or unallocated into FY Received.
- Do **not** sum raw `payments[]` twice (once via helper + once manually).
- Pure legacy companies with only company `totalReceived` / unallocated and **no** month payment arrays: FY Received from filings uses per-month legacy `received` when present; company pool/unallocated stays in the separate Unallocated (or company) line — same separation as Excel Month Recd vs Company Unallocated (8D.11).

### 4.3 What stays all-time / company-wide

- `gstOverallTotalsSummary` and Overall / year-summary combined KPIs that intentionally use company totals.
- Per-company Total Recd / Outstanding in tables and drawers (`computeGstClientTotals`).
- IT `itTotalsSummary` / `computeYearSummary` — untouched.

---

## 5. Exact files / functions to change (implementation phase only)

| File | Function / area | Proposed change |
|------|-----------------|-----------------|
| `src/utils/summaryUtils.ts` (preferred) | **New** e.g. `computeGstFyDashboardTotals(clients, months)` | Single helper returning `{ totalBilled, totalReceived, totalOutstanding, totalEntries, unallocatedReceived }` using formulas in §4; optionally extend `computeGstMonthSummary` footer to use FY-scoped received/outstanding when months are the FY set (or always scope footer to the `months` argument for Recd/Out) |
| `src/App.tsx` | `gstTotalsSummary` | Replace Received/Outstanding from `computeGstClientTotals` with FY helper over `visibleGstMonths`; keep company-wide `gstOverallTotalsSummary` as-is |
| `src/App.tsx` | `activeGstFy` | Introduce selected FY state (init = `currentGstFy`); wire shift via `shiftGstFinancialYear`; mount `GstYearSelector` on GST section (layout preserved) |
| `src/components/GstYearSelector.tsx` | Already built | Mount + pass `selectedYear` / `onShiftYear`; ensure `years` / `onChange` props used or trimmed if unused |
| `src/components/TopSummaryCards.tsx` | Labels / optional note props | Keep layout/colours; add optional subtitle for selected FY on GST; change unallocated note so FY Received is **not** described as including unallocated; show separate unallocated amount when &gt; 0 |
| `src/components/GstDashboardView.tsx` | Hero + Totals Summary | Show selected FY label explicitly; Recd/Outstanding from month-summary after footer fix; unallocated as separate line (reuse `GST_UNALLOCATED_LABEL`) |
| `src/utils/gstCopy.ts` | Copy constants | Add FY-scoped received note vs company unallocated line; stop using `GST_TOTAL_RECD_INCLUDES_UNALLOCATED` on FY cards once Recd is FY-only |
| Unit tests | New / extend `summaryUtils` or FY helper tests | Cover scenarios in §8 |
| e2e (optional smoke) | GST dashboard / top cards | Switch FY if selector wired; assert labels |

**Do not modify:** payment create/update/delete APIs, `server.ts` payment handlers, `computeGstClientTotals` / `computeGstFilingReceived` definitions (reuse only), IT summary paths, migrations, imports.

---

## 6. UI requirements (implementation constraints)

- Keep existing dashboard layout, colours, and card styling (`TopSummaryCards`, `GstDashboardView` panels).
- Clearly show selected FY (header already has `activeGstFy`; reinforce on Totals Summary / selector; avoid implying all-time on FY cards).
- Label unallocated separately (muted line under FY Recd or sibling row) — amount = sum of company unallocated; **not** inside FY Recd.
- Avoid misleading labels such as implying FY Recd “includes unallocated” after the calc change.
- Collection % on top Received card becomes coherent once Received and Billed share FY scope.

---

## 7. Accounting assumptions (locked for this phase)

1. **Selected FY** = Indian GST Apr–Mar label from `formatGstFinancialYearLabel` / `getMonthsForGstFinancialYear`.
2. **Payment FY attribution** = filing month of the parent `GstMonthlyFiling`, **not** `paymentDate`.
3. **FY Outstanding** = sum of per-filing outstanding for FY months (§4.1).
4. **Unallocated** is company-scoped and FY-agnostic; display only, never auto-allocated.
5. **Company and monthly** formulas remain the source of truth for non-dashboard surfaces.
6. **IT** reporting remains assessment-year filing scoped; no cross-changes.

**Blockers:** None for calculation. Option A + filing-association wording remove the Priority 3 business hold from 8D.10/8D.11.  
If product later demands cash-date FY Received, treat as a **new** decision — do not implement under 8D.12.

---

## 8. Testing plan

### 8.1 Unit (synthetic clients; no live DB)

| # | Case | Expect |
|---|------|--------|
| 1 | Filings in FY25-26 and FY26-27 | Selecting each FY shows only that FY’s billed / received / outstanding / entries |
| 2 | Multiple payments on one filing | FY Received = sum of those amounts once |
| 3 | Payments on filings in different FYs | Each payment counted only in its filing’s FY |
| 4 | Unallocated legacy receipts | Appear only in separate unallocated figure; FY Received unchanged |
| 5 | Zero-payment filing | Contributes to Billed/Entries; Received 0; Outstanding = collectible |
| 6 | Partially paid filing | Outstanding = collectible − received |
| 7 | Over-received filing | Month/FY outstanding for that filing = 0; excess does not reduce other months’ FY outstanding |
| 8 | Switch selected FY | All four metrics + label update; no cross-FY bleed |
| 9 | Company totals | `computeGstClientTotals` unchanged before/after helper |
| 10 | `computeGstMonthSummary` footer | When months = one FY, Recd/Out match FY helper (not all-time) |
| 11 | Empty FY | All FY metrics 0; unallocated still showable if companies have it |
| 12 | Legacy month scalar `received` (no `payments[]`) | Included in FY Received via `computeGstFilingReceived` |

### 8.2 Regression

| Suite | Expect |
|-------|--------|
| Existing GST unit (sanitize, excel month Recd, copy) | Pass unchanged |
| IT year summary / IT top cards | Unchanged numbers |
| Overall dashboard GST strip using `gstOverallTotalsSummary` | Still company-wide |
| e2e finance-gst / export / reports-dashboard | Pass; update assertions only if labels change |

### 8.3 Manual / UI smoke (local)

- GST section shows selected FY on header + selector.
- Top cards Recd/Outstanding move when shifting FY.
- Unallocated note appears only as separate figure when &gt; 0.
- Company Sheet/Simple Recd/Out and company totals unchanged.

---

## 9. Risks

| Risk | Mitigation |
|------|------------|
| Users accustomed to all-time Recd on GST top cards | Clear FY label; Overall / company views still show all-time |
| Confusing FY Recd vs company Total Recd | Copy: “Selected FY” vs `GST_UNALLOCATED_LABEL` / company totals |
| Footer vs top cards diverge | One shared helper for App + `computeGstMonthSummary` |
| Wiring FY selector changes visible months mid-session | Init to current FY; same helpers as today |
| Accidental change to `computeGstClientTotals` | Reuse only; no edits to company formula |
| Payment-date misinterpretation in future PRs | Document assumption in helper JSDoc + this plan |

**Financial-data loss:** None — display aggregation only; no storage/API mutation.

---

## 10. Implementation readiness

| Item | Status |
|------|--------|
| Business decision Option A | **Confirmed** |
| Filing vs payment-date rule | **Resolved** — filing association (matches Option A + IT/GST storage) |
| Outstanding aggregation rule | **Locked** — Σ month outstanding for FY filings |
| Root cause + files | Documented |
| Formulas | Documented |
| Tests | Documented |
| Blockers | **None** |
| Ready to implement | **Yes** |

**Out of scope for 8D.12 code:** migrations, imports, production/staging, commits/pushes/deploys, IT calc changes, payment API changes, auto-allocation of unallocated.

---

## 11. Suggested implementation order (next phase)

1. Add `computeGstFyDashboardTotals` (or equivalent) + unit tests.  
2. Point `gstTotalsSummary` and `computeGstMonthSummary` Recd/Out at the helper.  
3. Wire selected FY state + mount `GstYearSelector`.  
4. Update labels/copy (FY + separate unallocated).  
5. Run unit + targeted e2e + build.  
6. Write `docs/phase8d-12-…-report.md` after implementation.

---

## 12. Stop

This document is the deliverable for Phase 8D.12 planning. **No source or test code was changed in this phase.**
