# GST Monthly Payment and Outstanding Flow — Correction Report

**Date:** 2026-11-25  
**Scope:** Correct GST monthly filing payment allocation and outstanding calculation without redesigning the GST UI.  
**Safety:** No commit/push/deploy. No production/staging DB. Isolated synthetic tests only. IT records untouched.

---

## What was wrong in the previous flow

1. **Company-level payment pool.** `GstClientRecord.totalReceived` was a single cumulative number for the whole company. There was no per-month payment allocation.
2. **Pooled outstanding.** Company Outstanding was `max(0, Σ month totals − company.totalReceived)`. A payment intended for an older month reduced the same pool used for newer months, so allocation was ambiguous.
3. **No payment history.** Raising `totalReceived` overwrote prior instalment detail. Mode/date/reference were not stored for GST.
4. **Manual Total Recd.** The company form/drawer allowed editing Total Recd by hand, which could drift from actual collections.
5. **Incomplete company-form mandatory set.** Phone, Ref No, Remark, and Monthly Filing were not all enforced as required on create (frontend and backend).

## What was changed

### Data model
- Added `GstPaymentEntry` (`id`, `amount`, `paymentDate`, `paymentMode`, optional `reference`, timestamps).
- Extended `GstMonthlyFiling` with optional `payments[]` and derived `received`.
- Company `totalReceived` is now **derived** from the sum of month-allocated payments once any filing uses payment-line accounting. Legacy companies with only a pool `totalReceived` (no `payments` arrays) keep the previous pool behaviour until the first structured payment is recorded.

### Calculations (unchanged Total formula)
- **Monthly Total** remains `fees + interest + tax` via `computeGstFilingTotal` / server `sanitizeGstFiling`.
- **Monthly Received** = sum of payments on that month.
- **Monthly Outstanding** = `max(0, Total − Received)`.
- **Company Total Recd** = sum of Received across months (when payment lines exist).
- **Company Outstanding** = sum of monthly Outstanding (when payment lines exist).

### APIs
- `POST /api/gst/clients/:id/filings/:month/payments` — record payment (rejects ≤0 and amounts above remaining outstanding; no advance payments).
- `PUT …/payments/:paymentId` — edit payment; recalculates.
- `DELETE …/payments/:paymentId` — remove payment; recalculates.
- Charge upsert preserves existing payments (does not accept payment lines in the charge body).
- GST company create requires Phone, Ref No, Remark, and at least one Monthly Filing. Create ignores manual `totalReceived` (starts at 0).

### UI (no redesign)
- Company form field order: Company Name → User ID → Password → Phone → Ref No → Remark → Monthly Filing (all mandatory on create). Removed editable Total Recd.
- Edit drawer: Total Recd / Outstanding are read-only summaries.
- Filing quick modal: shows Total / Received / Outstanding, Record Payment, payment history with month label, edit/delete payment.
- Sheet month cells show `recd` / `out` under total.

## How monthly Total, Received and Outstanding are calculated

| Field | Formula |
|-------|---------|
| Total | `fees + interest + tax` (server overwrites client-supplied total) |
| Received | `sum(payments[].amount)` for that month |
| Outstanding | `max(0, Total − Received)` |

Example: Total ₹2,000, pay ₹1,200 → Received ₹1,200, Outstanding ₹800. Later pay ₹800 → Outstanding ₹0.

## How company-level Total Recd and Outstanding are calculated

When any filing has a `payments` array (payment-line accounting):

- Total Recd = Σ monthly Received  
- Outstanding = Σ monthly Outstanding  

Legacy (no `payments` arrays on any filing): keep prior pool formula `max(0, Σ totals − totalReceived)`.

## How payments are allocated to months

Payments are stored **on the monthly filing** addressed by the URL month. A payment posted to `…/filings/Apr%202026/payments` never increments May’s Received. Cross-month bleed is prevented by construction.

## Files changed

| Area | Files |
|------|--------|
| Types | `src/types/ledger.ts` |
| Calc | `src/utils/ledgerUtils.ts`, `src/utils/summaryUtils.ts`, `src/utils/fieldValidation.ts` |
| Server | `server.ts` |
| UI | `src/components/GstCompanyModal.tsx`, `GstCompanyEditDrawer.tsx`, `GstFilingQuickModal.tsx`, `GstSheetTable.tsx`, `src/App.tsx` |
| Tests | `tests/unit/gstMonthlyPayments.test.ts`, `tests/unit/ledgerUtils.test.ts`, `e2e/finance-gst.spec.ts`, `e2e/helpers/*`, `e2e/reports-dashboard.spec.ts` |
| Report | `docs/gst-monthly-payment-flow-correction-report.md` |

## Tests performed and results

| Test | Result |
|------|--------|
| `npm run test:unit` (228 passed, 2 skipped) | **PASS** — includes new GST payment allocation cases |
| `npm run build` | **PASS** |
| Playwright e2e `finance-gst.spec.ts` (3 tests) | **PASS** — per-month payments, edit/delete, totals |
| Playwright e2e `clients-create.spec.ts` (IT + GST) | **PASS** — GST seven-field create |
| Playwright e2e `reports-dashboard.spec.ts` | **PASS** — IT unaffected; GST payment via month API |

Synthetic unit coverage includes: Total = fees+interest+tax; partial then full settlement; older-month payment does not reduce newer-month outstanding; required Phone/Ref/Remark validation helpers.

## Unresolved business-rule ambiguity

1. **Semantic meaning of Tax.** Code and Stage 7D treat `tax` as a **charge component** that enters Total (`fees + interest + tax`). Labels say “Tax”; there is **no** documented confirmation whether this is government GST liability collected on behalf of the client, an office/service tax line, or another billed component. **No speculative reinterpretation was made.** Total calculation was left as the verified existing formula.
2. **Advance payments.** Existing rules floor outstanding at 0 and never stored advances. New payment APIs **reject** amounts above remaining outstanding. If the business later wants advances, that needs an explicit rule.
3. **Legacy pool → payment lines.** Recording the first structured payment switches the company to payment-line Total Recd. Prior cumulative `totalReceived` without payment rows is not auto-split across months (would invent allocation). Operators should record historical instalments per month if they need per-month history.
4. **Charge reduction below Received.** Editing fees/interest/tax downward while payments remain can leave Received > Total; Outstanding floors at 0. Payments are preserved (IDs kept). Business may later want a warning or forced adjustment.

## Production readiness

Local unit tests, production build, and targeted Playwright e2e (GST finance, client create, reports/IT) pass against isolated `data-e2e` synthetic data. **Do not treat the application as production-ready** solely because these local checks pass — full regression, hosting, and business sign-off on Tax semantics / legacy payment migration remain open.
