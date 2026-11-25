# Phase 8D.5 — GST Usability and Payment-History Safety Plan

**Mode:** Strict read-only planning (no implementation in this phase).  
**Date:** 2026-11-25  
**References:** `docs/phase8d-4-gst-full-regression-audit.md`, `docs/phase8d-3-gst-payment-safety-fix-report.md`

**Plan verdict: READY FOR IMPLEMENTATION**

Scope is presentation, confirmation copy, idempotency verification, and tests. Financial formulas, Tax meaning, auto-allocation, IT workflows, and filing-delete *behaviour* stay unchanged.

---

## Constraints (must preserve)

| Constraint | Status in plan |
|------------|----------------|
| Existing GST layout, colours, styling | Additive copy/columns only; reuse CSS variables |
| Seven create fields order | Untouched (`GstCompanyModal.tsx`) |
| Monthly Total = Fees + Interest + Tax | Untouched |
| No auto-allocate of unallocated receipts | Untouched |
| No GST/IT calculation changes | Untouched (`computeGstClientTotals` formulas stay) |
| No IT workflow changes | Untouched |

---

## 1. Show Unallocated Received clearly

### Current behaviour

| Surface | Today |
|---------|--------|
| Sheet (`GstSheetTable.tsx`) | Total Recd shows sum; tiny footnote `incl. unalloc ₹…` only when &gt; 0 |
| Simple table (`GstSimpleTable.tsx`) | Total Recd / Outstanding only — **no** unallocated label |
| Mobile list (`GstCompanyMobileList.tsx`) | Outstanding emphasis; Total Recd may appear in card — **no** unallocated label |
| Edit/history drawer (`GstCompanyEditDrawer.tsx`) | Explicit “Unallocated legacy receipts” when &gt; 0 |
| Filing modal (`GstFilingQuickModal.tsx`) | Short company unallocated note when &gt; 0 |
| Client summaries (`GstSummaryViews.tsx` via `computeGstClientSummaries`) | Total Recd / Outstanding columns only |
| Excel (`gstExcelExport.ts`) | Headers `Total Recd`, `Outstanding` — unallocated folded into Total Recd, **no column** |
| Dashboard (`GstDashboardView.tsx` / App KPIs) | Aggregates only |

`computeGstClientTotals` already exposes `unallocatedReceived` / `allocatedReceived` — UI/export underuse them.

### Proposed behaviour

- When `unallocatedReceived > 0`, show a clear **Unallocated Received** (or “Unallocated legacy receipts”) amount on:
  - Sheet company Total Recd cell (replace cryptic `incl. unalloc` with readable label).
  - Simple table near Total Recd (secondary line, same pattern as sheet).
  - Mobile company card (one muted line under totals).
  - Company summary table: either a new column **Unallocated Recd** or a secondary line under Total Recd (prefer column on summary for Excel parity).
  - Excel: add column **Unallocated Recd** immediately before or after **Total Recd** on company-oriented sheets; month-detail sheets may repeat company unallocated on each company row (same as Total Recd is repeated today) **or** leave month sheets with a note row — prefer repeating company-level unallocated beside Total Recd for filterability.
- When `unallocatedReceived === 0`, keep current chrome (no empty column noise in dense sheet cells; summary/Excel may show `0` or blank — recommend `0` in Excel for stable columns).

### Exact files to change

| File | Change |
|------|--------|
| `src/components/GstSheetTable.tsx` | Clearer unallocated line under Total Recd |
| `src/components/GstSimpleTable.tsx` | Same secondary line under Total Recd |
| `src/components/mobile/GstCompanyMobileList.tsx` | Unallocated line when &gt; 0 |
| `src/components/GstSummaryViews.tsx` | Column or secondary display from summary row |
| `src/utils/summaryUtils.ts` | Extend `GstClientSummaryRow` with `unallocatedReceived` (from `computeGstClientTotals`) — **display field only, same math** |
| `src/utils/gstExcelExport.ts` | Add **Unallocated Recd** header + cell values; adjust column widths/indexes carefully |
| `tests/unit/gstExcelExport.test.ts` | Expect new column / values |
| Optional: `src/components/GstCompanyEditDrawer.tsx` | Align wording with sheet (“Unallocated Received”) for consistency — already mostly complete |

### Risks / compatibility

- Excel column insert shifts cell indexes — update all `getCell(n)` usages in that sheet builder and any import mapping that assumes fixed column positions for export-only sheets (import maps by header name where possible; verify `fieldCatalog` / export consumers).
- Sticky sheet columns: adding text under Total Recd must not widen sticky layout unexpectedly — keep secondary line `text-[10px]` / muted like current pattern.
- Do **not** change `totalReceived` meaning (still allocated + unallocated).

---

## 2. Explain company vs monthly Outstanding

### Current behaviour

- Company Outstanding = `max(0, billed − (allocated + unallocated))` via `computeGstClientTotals`.
- Monthly Outstanding = `max(0, month Total − month Received)` — ignores unallocated.
- 8D.4 warned that summing month `out` ≠ company Outstanding when unallocated &gt; 0; only drawer/modal partially explain.

### Proposed behaviour

Add **short, non-card, non-hero** helper copy (existing muted text styles) in:

1. Sheet: near sticky Outstanding header or below company Outstanding cell when unallocated &gt; 0.  
2. Simple table / mobile: one-line note when unallocated &gt; 0.  
3. Edit drawer summary block (strengthen existing “not assigned to any month” text).  
4. Filing modal near month Outstanding (company unallocated note already present — extend to state that company Outstanding accounts for unallocated).  
5. GstSummaryViews footer or column tooltip/title attribute: “Company outstanding includes unallocated receipts; month figures do not.”

Do not change formulas.

### Exact files

- `GstSheetTable.tsx`, `GstSimpleTable.tsx`, `GstCompanyMobileList.tsx`, `GstCompanyEditDrawer.tsx`, `GstFilingQuickModal.tsx`, `GstSummaryViews.tsx`  
- Optional shared copy constant in e.g. `src/utils/gstCopy.ts` or inline strings to avoid over-abstraction — prefer a single shared string constant if used ≥3 times.

### Risks

- Copy clutter on dense sheet — show explanation only when `unallocatedReceived > 0`.
- No calculation change → no report number drift.

---

## 3. Idempotency key on every UI payment create

### Current behaviour

- `GstFilingQuickModal.tsx`: `createIdempotencyKeyRef` set on create submit; cleared on successful reset / target change; sent as `idempotencyKey`.
- `App.tsx` `handleRecordGstPayment`: also sends `Idempotency-Key` header when present.
- Server: same key → 200 replay, no second payment.
- **Gap:** Any other UI path that records GST payments without a key (search: only this modal wires `onRecordPayment`). Verify no second entry point.
- On **failed** submit, key is intentionally retained (reset only after success) — good for retry; confirm this remains after UX edits.
- New user action after success generates a new key (ref nulled in `resetPaymentForm`) — required so two genuine identical payments still work.

### Proposed behaviour

- Audit-only confirmation + harden if gaps found:
  - Ensure **every** create path from UI always sets a key before `onRecordPayment`.
  - Ensure failed retry reuses the same key; success clears it.
  - Do not require keys for payment **edit** (PUT) unless product asks — out of scope.
- Optional: server already accepts header or body; keep both.
- Optional defensive: if UI somehow omits key, generate one inside `handleRecordGstPayment` before fetch (belt-and-suspenders) — still unique per call unless modal passes stable key. Prefer modal-owned stable key for true retry; App-level generate-only-if-missing is OK as fallback.

### Exact files

| File | Role |
|------|------|
| `src/components/GstFilingQuickModal.tsx` | Primary key lifecycle (verify/adjust) |
| `src/App.tsx` | Header + optional fallback key |
| `server.ts` | No behaviour change expected (already idempotent) |
| `e2e/helpers/finance.ts` / `e2e/finance-gst.spec.ts` | Already test API idempotency; add UI-level assertion if feasible |

### Risks

- Clearing key too early on error → duplicate on retry.  
- Generating new key every click including retry → duplicates. Plan: keep ref-until-success pattern.

---

## 4. Improve monthly filing deletion confirmation (copy only)

### Current behaviour

- `ConfirmDangerButton` in `GstFilingQuickModal.tsx`: label `Remove filing` → confirm `Confirm remove` (default).  
- Server `DELETE …/filings/:month` deletes filing **and nested payments**.  
- 8D.5 requirement: **warn clearly; do not change deletion behaviour.**

### Proposed behaviour

- Extend confirmation UX with explicit warning text, e.g.  
  **“This permanently deletes this month’s filing and all payment history for this month. Unallocated company receipts are not removed.”**  
- Prefer extending `ConfirmDangerButton` with optional `warning` / `description` prop (reusable, low visual change) **or** local confirm panel in the modal only.  
- Keep two-tap confirm; same `onDelete` → same API.  
- If payment count &gt; 0, mention count in warning (“including N payment(s)”).

### Exact files

| File | Change |
|------|--------|
| `src/components/mobile/ConfirmDangerButton.tsx` | Optional warning/description slot (if shared) |
| `src/components/GstFilingQuickModal.tsx` | Pass stronger confirm copy / warning |
| `src/components/GstSimpleTable.tsx` / `GstCompanyMobileList.tsx` | If they also remove filings, align copy |

### Risks

- Users may still confirm and lose payment history — acceptable for this phase; stronger gate (e.g. type-to-confirm) is a **business decision**, not in scope.  
- Do not soft-delete or reparent payments in 8D.5.

---

## 5. Focused tests

### Unit

| Test | File (new or extend) |
|------|----------------------|
| `GstClientSummaryRow` / export includes `unallocatedReceived` | `summaryUtils` test and/or `gstExcelExport.test.ts` |
| Excel header contains `Unallocated Recd` and correct cell value | `gstExcelExport.test.ts` |
| Copy/helper: company vs month outstanding documentation fixture (optional pure function) | small unit if shared helper added |
| Idempotency key lifecycle (if extracted helper) | unit; else cover via e2e |

### E2E / component

| Test | Notes |
|------|--------|
| Legacy company with unallocated visible on All Data sheet / simple (text match) | Synthetic via existing helpers |
| Filing delete confirm shows payment-history warning text | Open modal → Remove filing → assert warning; cancel keeps data |
| UI payment create sends idempotency key (network assert or double-click Record Payment → one payment) | Playwright request interception or ledger length |
| Existing finance-gst / reports-dashboard / IT specs still pass | Regression |

### Explicitly out of scope for 8D.5 tests

- Changing delete cascade behaviour.  
- Auto-allocation of unallocated.  
- Tax meaning.  
- Import writing `unallocatedReceived` (optional follow-up; note as decision).

---

## Risks and compatibility (summary)

| Risk | Mitigation |
|------|------------|
| Excel column shift breaks consumers | Prefer append before Outstanding; update tests; document in report |
| UI clutter | Show unallocated + Outstanding explanation only when unallocated &gt; 0 |
| Accidental formula change | Do not edit `computeGstFilingTotal` / Outstanding math |
| Idempotency regression | Keep ref-until-success; add e2e double-submit |
| ConfirmDangerButton API change | Optional prop with default = current behaviour |

---

## Decisions still requiring business approval

1. **Tax meaning** (unchanged; still unsigned) — not blocking 8D.5 UI work.  
2. Whether filing delete should later require stronger confirmation or block when payments exist — **8D.5 only improves copy**.  
3. Whether Excel/import should eventually round-trip `unallocatedReceived` on **import** (export-only in this plan).  
4. Whether dashboard KPI strip should break out Unallocated (nice-to-have; optional in sequence).

None of these block starting 8D.5 implementation as specified.

---

## Recommended implementation sequence

1. **Data plumbing for display:** add `unallocatedReceived` to `GstClientSummaryRow` in `summaryUtils.ts` (derived only).  
2. **Excel export** column + unit tests (catches index bugs early).  
3. **Sheet → simple → mobile → summary views** unallocated labels + Outstanding explanation (when unallocated &gt; 0).  
4. **Drawer/modal copy alignment** (including Outstanding explanation).  
5. **Idempotency audit/harden** in modal + App fallback; e2e double-submit.  
6. **ConfirmDangerButton / filing delete warning copy**; e2e assert text + cancel preserves payments.  
7. **Regression:** `npm run test:unit`, targeted Playwright (`finance-gst`, `clients-create`, `reports-dashboard`, export if covered), `npm run build`.  
8. Write `docs/phase8d-5-gst-usability-safety-report.md` after implementation (future phase deliverable).

---

## Out of scope (do not do in 8D.5)

- Changing delete API behaviour or soft-delete.  
- Auto-allocating unallocated to months.  
- Changing Monthly Total / company Outstanding formulas.  
- IT changes.  
- Redesigning GST UI, colours, or company form field order.  
- Commits, pushes, production/staging, migrations.

---

## Verdict

**READY FOR IMPLEMENTATION**

The work is localized, calculation-safe, and unblocked by code architecture. Remaining business decisions (Tax, stronger delete policy, import of unallocated) do not prevent this usability/safety-copy phase.

**Stop.** No source, test, database, or deployment actions were taken beyond writing this plan.
