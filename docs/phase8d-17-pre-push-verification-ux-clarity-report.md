# Phase 8D.17 — Final Pre-Push Verification and UX Clarity

**Date:** 2026-11-25  
**Mode:** Local testing + minimal approved UX / test fixes  
**References:** `docs/phase8d-16-gst-it-simple-view-regression-report.md`

---

## 1. Overall verdict: **PASS**

Client Summary failure is **not** an application data-refresh defect. GST month-filter labels are clearer without changing formulas. IT All Years default and IT math were left unchanged.

---

## 2. reports-dashboard failure — root cause

### Classification

| Hypothesis | Finding |
|------------|---------|
| App data-refresh defect | **Rejected.** After create + API filings + `page.reload()`, All Data already showed the client by PAN with correct Outstanding/Received. Ledger API also returned the clients. |
| Test timing / locator | **Primary cause.** Client Summary defaults to sort **Most outstanding**, page size **25**. Shared e2e ledger had **77** clients; RepIT1 outstanding (~₹3,000) is far below FinEdge-scale rows, so the name never appears on page 1. `getByText(name1)` with a 5s timeout cannot find an off-page row. Increasing timeout alone would not help. |
| Test isolation | **Contributing.** Shared e2e DB accumulates clients. `syntheticPan` previously encoded only `n % 10000` into the digit block, so PAN collisions (`A client with PAN … already exists`) can abort create before Client Summary. |

### Evidence (pre-fix standalone run)

- Heading `IT · Client Summary` and table rendered (`77 clients`, page 1 of high-outstanding E2E FinEdge rows).
- Target `E2E RepIT1 …` absent from the accessibility snapshot of page 1.
- Earlier steps in the same test already validated All Data row amounts for that PAN.

### Fixes applied

1. **`e2e/reports-dashboard.spec.ts`** — After navigating to Client Summary, fill the search box with `pan1`, then assert name/PAN on the filtered row (uses the product search UI; no timeout bump).
2. **`e2e/helpers/ids.ts`** — Wider `nextSeq` entropy; `syntheticPan` varies 5th letter + digits + check letter so uniqueness is not capped at four digits.

---

## 3. reports-dashboard run matrix (honest)

| Run | Scope | Result | Notes |
|-----|--------|--------|-------|
| Pre-fix first-run | Alone | **FAIL** | Client Summary: name not on page 1 (locator/pagination). |
| After search fix only | Alone | **FAIL** | Different error: PAN already exists on create (isolation / ID collision). |
| Post both fixes — first-run | Alone | **PASS** (~18.7s) | |
| Post both fixes — retry | Alone | **PASS** (~19.2s) | |
| Combined first-run | `clients-create` + `finance-gst` + `finance-it` + `reports-dashboard` | **PASS** 21/21 (~2.3m) | |

---

## 4. GST Simple View label clarity

**File:** `src/components/GstSimpleTable.tsx`  
**Calculations:** unchanged (`computeGstClientTotals` still drives parent Recd/Outstanding).

| Mode | Behaviour |
|------|-----------|
| All months (default) | Headers remain **Total Recd** / **Outstanding**; Months cell keeps `N Months · ₹…`. |
| Single-month filter | Headers become **Company Received** / **Company Outstanding**. Months cell shows `{Mon YY} billed · ₹…` and, when different, subtitle **Company billed ₹…**. |

IT Simple View: **no changes** (All Years default and financial math untouched).

---

## 5. Regression results

| Suite | Result |
|-------|--------|
| `npm run test:unit` | **PASS** — 257 passed, 2 skipped |
| `e2e/finance-gst.spec.ts` | **PASS** (in combined 21) |
| `e2e/finance-it.spec.ts` | **PASS** (in combined 21) |
| `e2e/clients-create.spec.ts` | **PASS** (in combined 21) |
| `e2e/reports-dashboard.spec.ts` | **PASS** alone (×2) and in combined |

---

## 6. Files touched

| File | Change |
|------|--------|
| `src/components/GstSimpleTable.tsx` | Filtered-month company Received/Outstanding headers + clearer billed labels |
| `e2e/reports-dashboard.spec.ts` | Search-by-PAN before Client Summary row asserts |
| `e2e/helpers/ids.ts` | Stronger synthetic PAN / seq uniqueness |

---

## 7. Stop

Phase 8D.17 complete. Ready for an explicit push/commit phase if requested.
