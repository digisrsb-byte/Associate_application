# Phase 8D.9 — Full GST User-Flow Verification Audit

**Date:** 2026-11-25  
**Mode:** Strict read-only audit (no source/test changes, no business data mutation)  
**References:** `phase8d-8-gst-unified-entry-implementation-report.md`, `phase8d-7-gst-it-style-unified-amount-entry-plan.md`, `phase8d-5-gst-usability-safety-report.md`, `phase8d-3-gst-payment-safety-fix-report.md`

## Overall verdict: PASS WITH WARNINGS

Core GST workflow from company creation through unified Save Filing, payment history, company totals, filing-delete warnings, and IT regression is consistent and covered by automated synthetic tests executed in this phase. Non-blocking presentation inconsistencies remain in FY dashboard cards, Excel month-row Total Recd semantics, Simple expand month detail, and related export/dashboard labelling.

**GST is ready for the next testing stage** (broader QA / staging dry-run), with the warnings below tracked as known gaps—not blockers for 8D.8 behaviour.

---

## 1. GST company creation — PASS

| Check | Result | Evidence basis |
|-------|--------|----------------|
| Field order Company Name → User ID → Password → Phone → Ref No → Remark → Monthly Filing | Pass | Code: `GstCompanyModal.tsx` |
| All seven mandatory on create | Pass | FE validation + server `POST /api/gst/clients` |
| Frontend + backend validation | Pass | Phone/ref/remark/month required; server rejects empty filings map |

**This phase:** code inspection + `e2e/clients-create` GST create (executed).  
**Prior reports:** 8D.5/8D.8 noted seven fields untouched.

---

## 2. Monthly filing creation — PASS

| Check | Result |
|-------|--------|
| New month can be created | Pass |
| Fees / Interest / Tax editable | Pass |
| Total = Fees + Interest + Tax | Pass |
| Received initially ₹0 (no payments) | Pass |
| Outstanding initially = Total | Pass (draft Total − Received) |
| Save Filing does not create a payment | Pass (charges payload only) |
| Modal remains open after new month | Pass |

**This phase:** code (`GstFilingQuickModal`) + e2e Phase 8D.8 “new month Save Filing keeps modal open” (executed).

---

## 3. Payment management — PASS

| Check | Result |
|-------|--------|
| First payment without reopen | Pass |
| Multiple payments same month | Pass |
| Received = sum of month payments | Pass |
| Outstanding = max(0, Total − Received) | Pass |
| Edit / delete individual payments | Pass (API + UI; delete is one-click) |
| Idempotent retry no duplicates | Pass |
| Invalid dates / modes rejected | Pass |

**This phase:** e2e Stage 3 payments, 8D.3 idempotency/date/mode, 8D.5 UI idempotency retry, 8D.8 Add Payment (executed).  
**Soft note:** payment row delete has no two-step confirm (filing delete does)—UX only.

---

## 4. Charge editing safety — PASS (with legacy edge warning)

| Check | Result |
|-------|--------|
| Editing charges preserves payments | Pass (`sanitizeGstFiling` copies existing `payments[]`) |
| Saving charges never creates a payment | Pass |
| Reduce charges below Received → over-receipt warning; payments kept | Pass (UI warning + 8D.3 over-receipt e2e) |
| Payments stay on correct month | Pass |

**Warning F:** If a filing has **no** `payments[]` but still carries a legacy scalar `received`, charge save can drop that scalar. Payment-array companies (post-8D path) are safe.

**This phase:** code + 8D.3 over-receipt e2e + 8D.8 Save Filing preserves payments (executed).

---

## 5. Company-level totals — PASS (with presentation warnings)

| Check | Result |
|-------|--------|
| Company Total Recd = allocated + unallocated | Pass (`computeGstClientTotals`) |
| Company Outstanding = existing formula | Pass |
| Monthly Received excludes unallocated | Pass |
| Unallocated visible on sheet / simple / mobile / summary / Excel | Pass when &gt; 0 |

**This phase:** code + unit ledger/summary/excel tests + 8D.5 unallocated UI e2e + export Unallocated Recd e2e (executed).

---

## 6. Filing deletion — PASS (code inspection only)

| Check | Result |
|-------|--------|
| Confirmation warning | Pass (`ConfirmDangerButton` + `gstFilingDeleteWarning`) |
| Mentions payment count when &gt; 0 | Pass |
| Cascade deletes month + nested payments | Pass (server DELETE path) |
| Unallocated preserved | Pass (field not cleared; warning copy states this) |

**This phase:** code inspection + e2e “Keep cancels and preserves history” (executed; **no confirmed delete of business data**—synthetic e2e only; keep path verified).  
**Not executed this phase:** intentional hard-delete cascade against production/business data (forbidden).

---

## 7. Reports and exports — PASS WITH WARNINGS

| Surface | Consistency | Notes |
|---------|-------------|-------|
| Dashboard / month summary | Mostly | Recd includes unallocated; not always labelled |
| Company summary | Pass | Unallocated secondary line / Excel column |
| GST sheet / simple / mobile company totals | Pass | Unallocated when &gt; 0 |
| Excel Company Summary / Unallocated Recd | Pass | Covered by unit + e2e |
| Excel All Data | **Warning B** | Company Total Recd repeated on each month row (not month payment sum) |
| Excel Sheet View | **Warning C** | No monthly Recd/Out columns (UI Sheet has them) |
| FY top cards (`gstTotalsSummary`) | **Warning A** | Billed/entries FY-filtered; Received/Outstanding company-wide |

**This phase:** code + `reports-dashboard` e2e + `export` (incl. GST Unallocated) e2e (executed).

---

## 8. IT regression — PASS

| Check | Result |
|-------|--------|
| IT filing create/edit | Pass (`FilingQuickModal` separate; editable Received) |
| Fees / Received / Balance | Pass |
| Payment dates / modes | Pass (IT scalar model unchanged) |
| IT reports / exports | Pass (`reports-dashboard`, IT export e2e) |

**This phase:** `clients-create` IT + `reports-dashboard` + IT export cases (executed). GST modal changes do not alter IT paths.

---

## 9. Responsive UI — PASS (code inspection)

| Check | Result |
|-------|--------|
| Modal max-height / scroll | Pass |
| Payment History expand/collapse | Pass |
| Desktop Sheet View | lg+ only (`hidden lg:inline-flex`) — by design |
| Mobile / compact | Sheet prefers simple/mobile list |
| Colours / layout redesign | Not changed in 8D.8/9 |

**This phase:** code only (no visual device lab). 8D.8 new-month e2e uses 1400×900 for Sheet View.

---

## 10. Testing evidence

### A. Tests actually executed in this phase (8D.9)

| Command / suite | Result |
|-----------------|--------|
| `npm run test:unit` | **238 passed**, 2 skipped; exit 0 |
| `npx playwright test e2e/finance-gst.spec.ts e2e/clients-create.spec.ts e2e/reports-dashboard.spec.ts e2e/export.spec.ts` | **17 passed**; exit 0 |

Includes Stage 3 GST finance, 8D.3 payment safety, 8D.5 usability, 8D.8 unified entry, IT/GST create, dashboard, CSV/Excel/GST Unallocated export.

### B. Tests reviewed from previous reports (not re-claimed beyond above)

| Source | Content |
|--------|---------|
| `phase8d-8-…-report.md` | Unit + 14 Playwright + build PASS for 8D.8 |
| `phase8d-5-…-report.md` | Unallocated visibility, idempotency UI, delete warning |
| `phase8d-3-…-report.md` | Legacy unallocated, idempotency API, date/mode, over-receipt |

### C. Scenarios inspected through code only

- Server sanitize/payment/DELETE paths (no live DELETE of filings in this audit beyond prior e2e keep/cancel and synthetic suite behaviour)  
- FY card scoping math in `App.tsx`  
- Excel All Data / Sheet View column semantics  
- Simple expand month columns  
- Responsive Sheet View `lg` gate  
- Legacy `filing.received` drop when no `payments[]`

### D. Scenarios not verified in 8D.9

- Manual multi-device visual QA (tablet physical devices)  
- Production/staging data  
- Confirmed hard-delete cascade against long-lived DBs  
- Full Playwright suite outside the four files listed  
- `npm run build` not re-run in 8D.9 (passed in 8D.8; not required for this audit’s scope but optional)

---

## Bugs / inconsistencies discovered

| ID | Severity | Issue |
|----|----------|-------|
| A | Medium | GST FY summary cards: billed/entries filtered by FY; Received/Outstanding use full-company `computeGstClientTotals` |
| B | Medium | Excel All Data “Total Recd” on month rows = company Total Recd, not that month’s payment sum |
| C | Low | Excel Sheet View lacks monthly Received/Outstanding present in UI Sheet |
| D | Low | Simple View expanded month rows omit monthly Received/Outstanding |
| E | Low | Dashboard Total Recd can include unallocated without always labelling it |
| F | Low (legacy) | Charge save without `payments[]` may drop legacy scalar `received` |
| G | UX | Individual payment delete is single-click (no confirm) |

None of A–G break the 8D.8 Save Filing / payment-history / unallocated-preservation design.

---

## Remaining risks

1. Users comparing Excel All Data month rows to modal month Received may see different numbers (Warning B).  
2. Multi-FY ledgers make FY top cards easy to misread (Warning A).  
3. Very old pre–payment-array GST filings remain a legacy edge (Warning F).  
4. Accidental payment deletes are easier than filing deletes (Warning G).

---

## Readiness for next testing stage

**Yes — ready**, with warnings documented.

Recommended next stage focus (out of scope for 8D.9):  
- Staging dry-run with synthetic data  
- Explicit Excel “month Received” column clarification or fix (product decision)  
- Optional FY card scoping alignment  
- Optional confirm-on-payment-delete  

---

## Safety restrictions observed

- No source or test code changes  
- No production/staging DB  
- No business records created/modified outside isolated e2e  
- No migrations, imports, commits, pushes, or deploys  
- Phase 8C.3 restore-drill databases not touched  

**STOP.** Audit complete — no implementation follows this report.
