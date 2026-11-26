# Phase 8D.15 — Complete GST End-to-End Regression and Usability Audit

**Date:** 2026-11-25  
**Mode:** Strict read-only audit (code inspection + synthetic automated tests)  
**References:**  
- `docs/phase8d-13-gst-visible-payment-entry-report.md`  
- `docs/phase8d-14-gst-fy-dashboard-implementation-report.md`  

## 1. Overall verdict: **PASS WITH WARNINGS**

Core GST workflows after 8D.13 (visible payment entry) and 8D.14 (FY dashboard) behave correctly under synthetic automated tests and code inspection. No calculation blockers found for Option A FY rules, payment arrays, or IT isolation.

Warnings are **usability / presentation / responsive gaps**, not financial-data-loss defects. GST is **ready for the next testing stage** with the prioritized follow-ups below.

**No source or test files were modified in this phase.** (Running `phase-c-responsive-qa` may refresh screenshot PNGs under `docs/phase-c-screenshots/` as a test side effect.)

---

## 2. Workflow verification results

### 2.1 Company management — **PASS** (minor label warning)

| Check | Result |
|-------|--------|
| Create GST company | **PASS** — `GstCompanyModal` + e2e `clients-create` |
| Edit GST company | **PASS** — drawer/modal; blank password keeps stored portal password |
| View company details | **PASS** — edit drawer / history mode |
| Seven mandatory fields + order | **PASS** on create: Company Name → User ID → Password → Phone → Ref No → Remark → Monthly Filing (`GstCompanyModal.tsx`) |
| Existing records compatible | **PASS** — edit without Monthly Filing block; `hasPortalPassword` path |
| Passwords never in UI ledger / exports | **PASS** — `stripPublicSecrets` / blank Password export columns; reveal only via dedicated reveal API |

**Warning W1:** Simple table headers mark Company Name / User ID / Password with `*`, but Phone / Ref No / Remark are also mandatory on create and lack `*` in the table header row (`GstSimpleTable.tsx`). Validation still enforces them.

---

### 2.2 Monthly filing workflow — **PASS**

| Check | Result |
|-------|--------|
| Create / edit monthly filing | **PASS** — `GstFilingQuickModal` + Stage 3 / 8D.13 e2e |
| Fees / Interest / Tax | **PASS** |
| Total = Fees + Interest + Tax | **PASS** — `computeGstFilingTotal` |
| Received + Outstanding on main form | **PASS** — always visible; `gst-month-received` / `gst-month-outstanding` |
| Payment entry without expand | **PASS** — 8D.13; no collapse/`showPaymentForm` gate |
| Payment history visible | **PASS** when filing exists |
| Save Filing does not create payment | **PASS** — charges-only `onSave`; 8D.13 e2e |
| New filing stays open for first payment | **PASS** — 8D.8/8D.13 e2e |

**Note:** Payment **form** remains gated until the filing exists (correct safety). Helper text: save filing first.

---

### 2.3 Payment management — **PASS**

| Check | Result |
|-------|--------|
| First / multiple partial payments | **PASS** — Stage 3 + 8D.8/13 e2e |
| Edit payment | **PASS** — Stage 3 API/UI path |
| Delete with confirmation | **PASS** — Confirm remove / Keep (8D.11) |
| Date / mode validation | **PASS** — 8D.3 e2e + server `sanitizeGstPaymentEntry` |
| Idempotency / retry | **PASS** — 8D.3 API + 8D.5 UI Idempotency-Key |
| Received / Outstanding update | **PASS** — live ledger refresh via `gstQuickEditLive` |
| Edit charges keeps payment history | **PASS** — 8D.8/13 + sanitize preserve |
| Legacy scalar received | **PASS** — 8D.3 / unit sanitize |
| Unallocated separate | **PASS** — never auto-allocated; UI notes |

---

### 2.4 Financial calculations — **PASS**

Verified via `tests/unit/gstFyDashboardTotals.test.ts`, `ledgerUtils` / payment-safety units, and finance-gst e2e (synthetic only).

| Metric | Rule verified |
|--------|----------------|
| Monthly Total / Received / Outstanding | `computeGstFiling*` |
| Company Received / Outstanding | `computeGstClientTotals` (allocated + unallocated; outstanding = max(0, billed − totalRecd)) |
| Selected-FY Billed / Received / Outstanding / Entries | `computeGstFyDashboardTotals` — filing month ∈ FY |
| Unallocated | Separate; not in FY Received |
| Over-received | Month out = 0; does not reduce other months’ FY out |
| Empty FY | Zeros for FY metrics; unallocated still reported |
| Multi-FY | No cross-bleed |
| Payment FY attribution | **Parent filing month**, not `paymentDate` |

**Intentional difference (not a bug):** Company Outstanding can differ from Σ monthly outs because unallocated reduces company outstanding and over-receipt floors per month. Explained in `GST_OUTSTANDING_UNALLOCATED_EXPLAIN`.

---

### 2.5 Financial-year selector — **PASS** (UX warnings)

| Check | Result |
|-------|--------|
| Current FY + prev/next | **PASS** — `GstYearSelector` + 8D.14 e2e |
| Four FY cards update together | **PASS** — shared `gstTotalsSummary` from helper |
| Selected FY labelled | **PASS** — header + card `receivedScopeLabel` + selector |
| Overall KPIs company-wide | **PASS** — `gstOverallTotalsSummary` / OverallDashboard company-wide GST |
| No FY data leak | **PASS** — unit + 8D.14 e2e |

**Warning W2:** `years` / `onChange` props exist but are **unused** in `GstYearSelector` — navigation is chevron-only (no year dropdown/jump list).

**Warning W3:** Dedicated **GST Totals Summary** panel (`GstMonthSummaryView` in `GstDashboardView.tsx`) is **not mounted** in `App.tsx` (year-summary uses `OverallDashboard`). FY card parity with that panel is verified by shared `computeGstMonthSummary` / helper unit tests, not a live dual-panel UI. Live FY KPIs are `TopSummaryCards` on GST tabs.

**Warning W4:** `exportGstMonthSummaryExcelCsv` footer still labels “Total Recd” / “Outstanding” without “FY” wording even when months are FY-scoped (values are month-set scoped, not company all-time).

---

### 2.6 Tables, reports, exports — **PASS**

| Surface | Result |
|---------|--------|
| GST All Data / Simple | Month Recd on expand; company unallocated labelled |
| Sheet View | Month Recd/Out in UI; desktop-oriented |
| Company drawers | Company totals + unallocated notes |
| Dashboard | FY cards on GST; overall combined company-wide |
| Excel All Data / Sheet / Company Summary | Month Recd, Unallocated columns; Password blank |
| Duplicate payment amounts | Not observed; idempotency covered |
| FY vs all-time mislabel on top cards | **Mitigated** by 8D.14 scope notes |

---

### 2.7 IT regression — **PASS**

| Check | Result |
|-------|--------|
| IT create / edit | **PASS** — `clients-create`, `clients-edit` |
| IT Received / Outstanding / filings | **PASS** — `finance-it` (4 tests) |
| IT summaries / reports | **PASS** — `reports-dashboard` ledger math + UI shell; `computeYearSummary` untouched by GST FY helper |
| IT exports | **PASS** — `export.spec` CSV/Excel password blank |

IT `FilingQuickModal` remains scalar Received + close-on-save; no GST payment arrays mixed in.

---

### 2.8 Responsive usability — **PASS WITH WARNINGS**

**Methods:** Code inspection + Playwright Chromium viewport automation (`phase-c-responsive-qa`, plus GST e2e at 1400×900). **Not** physical-device testing.

| Area | Finding |
|------|---------|
| Desktop (≥1024) | Sidebar; `TopSummaryCards` + FY selector visible; Sheet View available |
| Tablet (~768) | Bottom nav; compact lists; Sheet gated (`MobileSheetUnavailable`) |
| Mobile (~390) | Bottom nav; GST All Data list; overflow checks ≤1px in Phase C |
| Filing modal | `max-w-md`, scrollable body, safe-area padding — suitable for phone; long payment history requires scroll |
| FY selector | Stacks on narrow screens; chevrons usable |
| **W5** | `TopSummaryCards` wrapped in `hidden lg:block` — **no mobile FY KPI strip** on GST All Data; mobile users see table/list only for FY totals |
| **W6** | Phase C covers shell/login/IT/GST search overflow; **no dedicated e2e** for GST filing modal + Record Payment + FY selector at phone widths after 8D.13/14 |

---

## 3. Exact test commands and results

### 3.1 Unit

```text
npm run test:unit
```

| First run | **PASS** — 257 passed, 2 skipped; exit 0 |

### 3.2 GST / create / export / dashboard / search / filters (first run)

```text
npx playwright test e2e/finance-gst.spec.ts e2e/clients-create.spec.ts e2e/export.spec.ts e2e/reports-dashboard.spec.ts e2e/clients-search.spec.ts e2e/filters-month.spec.ts --reporter=line
```

| First run | **PASS** — **23 passed**; exit 0 |

Includes Stage 3 GST, 8D.3/5/8/11/13/14, export Unallocated, Stage 4D dashboard.

### 3.3 IT + responsive (first run)

```text
npx playwright test e2e/finance-it.spec.ts e2e/clients-edit.spec.ts e2e/phase-c-responsive-qa.spec.ts --reporter=line
```

| First run | **PASS** — **11 passed**; exit 0 |

### 3.4 Production build

```text
npm run build
```

| First run | **PASS** — exit 0 (chunk-size advisory only) |

### 3.5 Honesty on historical flakiness

- In **Phase 8D.14**, `reports-dashboard` **failed once** looking for isolated IT `6,000` on the combined money picture (shared e2e DB pollution), then passed on re-run; assertion was later softened.  
- **This audit’s first combined run** of that suite: **passed** (no failure to hide).  
- No test in this audit required a re-run to achieve green.

---

## 4. Bugs and confusing UX findings

| ID | Severity | Finding |
|----|----------|---------|
| W1 | Low | Table headers under-mark Phone / Ref / Remark vs create validation |
| W2 | Low | FY selector has no year dropdown (`years`/`onChange` unused) |
| W3 | Low | `GstDashboardView` Totals Summary not on live App route; FY KPIs = top cards only |
| W4 | Low | Month-summary CSV footer labels omit “FY” / “selected months” wording |
| W5 | Medium (UX) | No mobile GST top-card FY totals (`hidden lg:block`) |
| W6 | Low | No phone-viewport e2e for filing payment form + FY selector after 8D.13/14 |
| I1 | Info | Company Outstanding ≠ Σ month outs when unallocated/over-receipt present — **by design** |

No critical calculation bugs or payment double-count defects identified.

---

## 5. Responsive testing limitations

- Chromium Playwright viewports only (phone / tablet / desktop widths).  
- **No** physical iOS/Android device, real keyboard, or assistive-tech audit.  
- Phase C does not deep-click GST Record Payment / FY chevrons at 390px.  
- Sheet View intentionally unavailable on compact layouts.

---

## 6. IT regression results

| Suite | First-run result |
|-------|------------------|
| `e2e/finance-it.spec.ts` | 4/4 **PASS** |
| `e2e/clients-create.spec.ts` (IT case) | **PASS** |
| `e2e/clients-edit.spec.ts` | **PASS** |
| `e2e/reports-dashboard.spec.ts` | **PASS** |
| `e2e/export.spec.ts` (IT CSV/Excel) | **PASS** |

Code: IT filing modal and `computeYearSummary` remain independent of GST FY helpers.

---

## 7. Prioritized remaining fixes (do **not** implement in 8D.15)

1. **P2 — Mobile FY visibility:** Surface selected-FY Billed/Received/Outstanding/Entries on compact GST views (or document that FY KPIs are desktop-only).  
2. **P3 — FY selector UX:** Wire year list / `onChange` for jump navigation.  
3. **P3 — Labels:** Clarify CSV month-summary Recd/Out as selected-period; align Simple table mandatory asterisks.  
4. **P3 — Coverage:** Add phone-viewport e2e for filing modal payment + FY shift.  
5. **P4 — Dead UI:** Mount or remove unused `GstDashboardView` / `UnifiedDashboard` to avoid dual-source confusion.

---

## 8. Ready for next testing stage?

**Yes — with warnings.**  

GST payment entry (8D.13) and FY dashboard consistency (8D.14) are functionally verified under synthetic automated tests. Proceed to the next stage (e.g. broader UAT, staging dry-run, or mobile-focused UX polish) after acknowledging W5 (mobile FY cards) as the main usability gap.

---

## Safety confirmation

- Strict read-only for application source/tests/config.  
- Synthetic e2e / unit data only.  
- No production/staging DB, migrations, imports, commits, pushes, or deploys.  
- Backup / restore-drill artifacts not deleted.

## STOP

Audit complete. No implementation or fixes in this phase.
