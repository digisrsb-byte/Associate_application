# Phase 8D.16 — Latest GST and IT Simple View Changes Regression Testing

**Date:** 2026-11-25  
**Mode:** Local testing + read-only code inspection  
**Scope:** Post–8D.15 Simple View UX (GST inline charges / Pay / All months; IT Fees+Received inline / Receive due / Pay)  
**No source or test files were modified in this phase.**

---

## 1. Overall verdict: **PASS WITH WARNINGS**

GST and IT Simple View behavior matches the intended post–8D.15 contract under code inspection and synthetic automated tests. Charge Save does not create GST payments; Pay opens the existing modals; IT remains one Received amount per assessment year.

Warnings are **test flake / UX labeling nuance**, not calculation or payment-history defects.

---

## 2. Automated results (first run, honest)

| Suite | Result |
|-------|--------|
| `npm run test:unit` | **PASS** — 257 passed, 2 skipped (33 files) |
| Playwright `finance-gst.spec.ts` | **PASS** — all cases (Stage 3, 8D.3, 8D.5, 8D.8/13, 8D.11, 8D.14) |
| Playwright `finance-it.spec.ts` | **PASS** — all cases |
| Playwright `clients-create.spec.ts` | **PASS** |
| Playwright `export.spec.ts` | **PASS** |
| Playwright `reports-dashboard.spec.ts` | **FAIL (1)** — see W1 |
| `npm run build` | **PASS** |

**Combined e2e first run:** 23 passed / 1 failed / ~2.8m.

---

## 3. GST Simple View checklist

| Check | Result | Evidence |
|-------|--------|----------|
| Expanded row aligns with nested column headers | **PASS** | Nested 8-column table: Month, Fees, Interest, Tax, Total, Recd, Outstanding, Action. Existing + draft rows each emit 8 `<td>`s (`GstSimpleTable.tsx`). |
| Add Month / Save Month under Action | **PASS*** | Draft row Action has **Save Month**. Empty company Months cell shows **+ Add Month** (expands). There is no separate nested-table **Add Month** button in Action — new months use the always-visible draft row. |
| Fees / Interest / Tax editable | **PASS** | Inline number inputs with live edit state. |
| Total updates immediately | **PASS** | `liveTotal = computeGstFilingTotal(fees, interest, tax)` on each keystroke. |
| Outstanding updates immediately | **PASS** | `liveOut = max(0, liveTotal − monthRecd)`; Recd stays payment-derived (read-only in row). |
| Save persists charge changes | **PASS** | `handleInlineSaveExisting` → `onSaveFiling` with month/fees/interest/tax/total only. |
| Save does not create a payment | **PASS** | Charges-only payload; server `sanitizeGstFilingCharges` never accepts payments from upsert body. Covered by 8D.8/8D.13 e2e. |
| Pay opens existing payment modal | **PASS** | `onOpenQuickEdit(company, m, f)` → `GstFilingQuickModal`. |
| Recording a payment updates Recd / Outstanding | **PASS** | Payment APIs + modal refresh; Stage 3 / 8D.13 e2e. |
| Existing payment history preserved | **PASS** | `sanitizeGstFilingCharges` copies `existing.payments` (and legacy scalar `received`). 8D.3 / 8D.8 e2e. |
| All months visible by default | **PASS** | `useState(true)` for `showAllMonths`. |
| Month count and displayed amount match visible months | **PASS** | Count = `companyMonths.length`; ₹ = `visibleBilled` over those months only. |
| Company totals | **PASS** | Parent Recd / Outstanding = `computeGstClientTotals` (company-wide, incl. unallocated notes). When filtered billed ≠ company billed, subtitle **Company total ₹…** appears under the Months cell. |

\*Clarification only — behavior is intentional; wording in the user checklist may imply a second Action button that does not exist.

### Helper copy (GST expand)
> Type Fees, Interest and Tax here — Total and Outstanding update live. Click **Save** for charges. Use **Pay** only to record payments.

---

## 4. IT Simple View checklist

| Check | Result | Evidence |
|-------|--------|----------|
| Full inline editing reverted | **PASS** | Filing Date / Pay Type / Pay Recv Date are display-only in expand. |
| Fees and Received editable inline | **PASS** | `moneyEdits` + number inputs. |
| Balance updates live | **PASS** | `liveBal = computeBalance(liveFees, liveRecd)`. |
| Save persists changes | **PASS** | `handleSaveMoney` → `onSaveFiling` with fees, received, balance (+ existing payment meta). |
| Receive due sets Received = Fees | **PASS** | Override `{ fees: liveFees, received: liveFees }`; shown only when `liveBal > 0`. |
| Pay opens existing details modal | **PASS** | `onOpenQuickEdit(client, yr, f)` (renamed from More…). |
| One Received amount per assessment year | **PASS** | Scalar `received` / `balance` model unchanged; no GST-style payment array on IT. |

### Helper copy (IT expand)
> To record a payment, change **Received** in the row (total paid so far) — Balance updates live. Use **Receive due** to clear outstanding in one click.

---

## 5. Warnings

### W1 — `reports-dashboard` flake (known class)
First-run failure: Client Summary could not find `E2E RepIT1 …` within 5s after creating the IT client in the same spec. **Not caused by Simple View inline edits** — finance-it / clients-create / export all passed. Same suite was softened earlier in 8D.14 for combined-money-picture timing. Retries not run in this phase (honest first-run policy).

### W2 — GST month label vs company Recd/Out columns
Months cell now clarifies filtered ₹ vs **Company total ₹** when they differ. Parent **Recd** / **Outstanding** columns remain **company-wide** even when a single month chip is selected. Math is correct; operators may still momentarily assume those two columns are month-scoped. No code change in this phase.

### W3 — IT `showAllYears` still defaults to `false`
GST defaulted to All months; IT still starts on the active assessment year chip unless the user toggles All years. Intentional asymmetry unless a follow-up requests parity.

---

## 6. Code anchors (read-only)

| Area | File |
|------|------|
| GST expand / inline Save / Pay / All months / visibleBilled | `src/components/GstSimpleTable.tsx` |
| GST charge sanitize (preserve payments) | `src/utils/gstFilingSanitize.ts` |
| IT Fees/Received / Receive due / Pay | `src/components/SimpleClientTable.tsx` |
| GST save / payment APIs | `src/App.tsx` (`handleSaveGstFiling`, payment handlers) |

---

## 7. Stop

Phase 8D.16 complete. **No implementation** performed. Ready for next approved phase if UX follow-ups (W2/W3) or flake hardening (W1) are desired.
