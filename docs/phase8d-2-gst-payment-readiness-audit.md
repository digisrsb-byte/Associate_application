# Phase 8D.2 — GST Monthly Payment Implementation Audit

**Mode:** Strict read-only (no code, data, configuration, or database changes during this audit).  
**Date:** 2026-11-25  
**Sources:** `docs/gst-monthly-payment-flow-correction-report.md`, `server.ts`, `src/types/ledger.ts`, `src/utils/ledgerUtils.ts`, `src/utils/summaryUtils.ts`, `src/utils/fieldValidation.ts`, GST UI components, unit/e2e tests.

**Overall readiness:** Calculations and month allocation are correctly implemented for the *new* payment-line model. **Not release-ready for ledgers that already carry company-level `totalReceived` without payment rows** until the legacy transition risk below is accepted or mitigated. Tax business meaning remains unsigned.

---

## 1. Mandatory company fields

### Verified — create path (frontend + backend)

| # | Field | Frontend | Backend | Notes |
|---|--------|----------|---------|--------|
| 1 | Company Name | Required — `GstCompanyModal.tsx` (`required`, empty-block) | `validateRequiredText(..., 'Company Name', ...)` in `POST /api/gst/clients` | Order: first in form |
| 2 | User ID | Required | `validateRequiredText(..., 'User ID', ...)` | Second |
| 3 | Password | Required on create; edit may leave blank if `hasPortalPassword` | Non-empty password on create; edit allows keep-stored | Third (grid beside User ID) |
| 4 | Phone | `validateRequiredPhone` + `required` | `validateRequiredPhone` | Fourth — not optional |
| 5 | Ref No | Non-empty check + `required` | `validateRequiredText(..., 'Ref No', ...)` | Fifth |
| 6 | Remark | Non-empty check + `required` | `validateRequiredText(..., 'Remark', ...)` | Sixth |
| 7 | Monthly Filing | Always shown on create; invalid/empty month blocked | `filings` object must have ≥1 key or `400 Monthly Filing is required.` | Seventh section |

**Field order in UI** (`GstCompanyModal.tsx`): Company Name → User ID → Password → Phone → Ref No → Remark → Monthly Filing. Matches the required sequence.

**Fees / Interest / Tax inside Monthly Filing** may be left at 0. The *filing* is mandatory; non-zero charge lines are not. That matches treating “Monthly Filing” as a required section, not as “all charge amounts > 0”.

### Edit path nuances (not a create-order regression)

- **Edit drawer** (`GstCompanyEditDrawer.tsx`): requires Company Name, User ID, Password (or keep stored), Phone, Ref No, Remark. Does **not** re-collect Monthly Filing on edit (expected; filings edited elsewhere).
- **PUT `/api/gst/clients/:id`:** same required identity/contact fields via `validateRequiredPhone` / `validateRequiredText`.

### Finding

**PASS** for create: none of the seven fields is accidentally optional on the create FE/BE path.

---

## 2. Monthly payment calculations

### Verified formulas

| Rule | Implementation | Files |
|------|----------------|-------|
| Monthly Total = Fees + Interest + Tax | `computeGstFilingTotal`; server `sanitizeGstFiling` sets `total = fees + interest + tax` (ignores client total) | `ledgerUtils.ts`, `server.ts` |
| Monthly Received = sum of payments for that month | `computeGstFilingReceived` sums `payments[]` when present | `ledgerUtils.ts` |
| Monthly Outstanding = max(0, Total − Received) | `computeGstFilingOutstanding` | `ledgerUtils.ts` |
| Company Total Recd = Σ monthly Received (payment-line mode) | `computeGstClientTotals` when any filing has `payments.length > 0`; `syncGstCompanyTotalReceived` writes `client.totalReceived` | `ledgerUtils.ts`, `server.ts` |
| Company Outstanding = Σ monthly Outstanding (payment-line mode) | Same `computeGstClientTotals` path | `ledgerUtils.ts` |

### Trace through layers

| Layer | Behaviour |
|-------|-----------|
| Frontend sheet / modal / drawer | Uses `computeGstClientTotals`, `computeGstFilingReceived`, `computeGstFilingOutstanding` |
| Reports / GST summaries | `summaryUtils.ts` GST month/client summaries call `computeGstClientTotals` |
| APIs | Charge upsert preserves payments; payment CRUD calls `syncGstCompanyTotalReceived` |
| Legacy fallback | If **no** filing has a non-empty `payments` array, company totals still use pool `client.totalReceived` and `max(0, Σ totals − totalReceived)` |

### Finding

**PASS** for the payment-line model. Formulas match the correction report. Cross-month bleed is prevented because payments are stored on the filing keyed by URL month.

---

## 3. Critical legacy payment safety audit

### What happens on first structured monthly payment?

In `POST …/filings/:month/payments` (`server.ts`):

1. Payment is appended to that month’s `payments` array.
2. `syncGstCompanyTotalReceived` detects `Array.isArray(f.payments)` on any filing.
3. It sets `client.totalReceived = sumGstClientPaymentLines(client)` (sum of structured payments only).

Comment in code: *“First structured payment replaces legacy company-level pool accounting.”*

### Can the old cumulative amount disappear from displayed Total Recd?

**YES — HIGH RISK.**

Example: legacy `totalReceived = 50_000`, no `payments` arrays. User records a ₹1,000 payment for Apr.

- Stored `totalReceived` becomes `1000`.
- UI Total Recd (via `computeGstClientTotals`) shows **₹1,000**, not ₹50,000.
- The prior ₹50,000 is **not** copied into a payment row, **not** kept as an unallocated balance field, and **not** shown as a warning.

After all structured payments are deleted, `payments` remains `[]` (array still present). Sync keeps `totalReceived` at the payment sum (0). Display falls back to pool mode with `totalReceived === 0`. The original legacy figure is already gone from the field.

### Can it be counted twice?

**After the switch: no** — display uses payment sums only, not `legacy + payments`.  
**Before the switch: N/A** — only the pool value counts.  
**Import path** can still seed company-level `totalReceived` without payment lines (`gstMappedParse.ts`), which recreates the legacy pool state until the first payment.

### Indication that historical payments are unallocated?

**NO.** No banner, badge, or “unallocated / legacy pool” indicator in sheet, drawer, or filing modal. Operators get no UI cue that recording the first payment will replace the company pool total.

### Does editing/deleting a monthly payment affect legacy values?

- Once payment-line accounting is on, edit/delete only change payment lines and re-sync `totalReceived` from those lines.
- They do **not** restore a previously overwritten legacy pool value.
- While still in pure legacy mode (no `payments` arrays), PUT may still accept a manual `totalReceived` body when no payment lines exist (`server.ts` PUT branch).

### Are old records preserved during transition?

| Preserved | At risk / overwritten |
|-----------|------------------------|
| Company `id`, identity fields, filing charge lines, existing payment entry IDs after creation | Company field `totalReceived` numeric value on first payment sync |
| Payment rows once created (edit keeps `id` / `createdAt`) | Semantic meaning of pre-transition “money already received” unless re-entered as lines |

**No migration was run** (per implementation report). The risk is **runtime overwrite of the derived/cache field**, not a bulk delete of companies or filings.

### Finding

**FAIL / blocker for ledgers with non-zero legacy `totalReceived` and no payment history.** Safe for greenfield / zero-pool companies. Matches the correction report’s own unresolved item #3, but severity for real ledgers is higher than “document and move on.”

---

## 4. Payment API safety

| Check | Result | Evidence |
|-------|--------|----------|
| Allocated only to selected month | **PASS** | Route param `month`; payments stored on `filings[decodedMonth]` only |
| Zero / negative rejected | **PASS** | `sanitizeGstPaymentEntry`: `amount <= 0` → 400 |
| Exceeds remaining outstanding rejected | **PASS** | POST compares to `computeGstFilingOutstanding`; PUT to remaining after other payments (`> 0.009` tolerance) |
| Edit/delete recalculate | **PASS** | `withGstFilingReceived` + `syncGstCompanyTotalReceived` on PUT/DELETE |
| Invalid dates | **PARTIAL** | Empty date rejected; **no** ISO/calendar validation — `"not-a-date"` / `"99/99/99"` accepted as strings |
| Payment modes | **PARTIAL** | Non-empty required; **not** restricted to `PAYMENT_TYPES`; arbitrary free text allowed (length-clipped) |
| Duplicate requests | **FAIL / gap** | No idempotency key or dedupe. Double-submit of POST creates two payments until outstanding is exhausted. New UUID each time. |

---

## 5. Charge editing safety

When Fees / Interest / Tax are reduced via `POST …/filings` while payments exist:

- `sanitizeGstFiling` **preserves** existing `payments[]`.
- `total` is recomputed as fees+interest+tax.
- Outstanding becomes `max(0, newTotal − receivedSum)`.
- **Received can exceed Total.** No server rejection of that state; payments are not auto-reduced.

**UI communication:** `GstFilingQuickModal` shows Total / Received / Outstanding side by side but has **no** explicit warning when Received > Total (Outstanding simply shows ₹0). Sheet cells show `recd` / `out` the same way — no over-receipt flag.

### Finding

**PASS** on preservation of payment IDs; **GAP** on operator clarity for over-receipt after charge cuts.

---

## 6. UI and regression

| Check | Result |
|-------|--------|
| Layout / colour pattern | **PASS with minor additive UI** — same CSS variables, navy header, frost panels; added recd/out lines and payment panel inside existing modal patterns (not a redesign) |
| Payment history shows month | **PASS** — `Month: {target.month}` under each payment in `GstFilingQuickModal.tsx` |
| Company summaries read-only | **PASS** — drawer shows calculated Total Recd / Outstanding; no editable Total Recd on create/edit UI |
| IT records / calculations | **PASS** — IT still uses `sanitizeFiling` / fees−received; e2e `reports-dashboard` + `clients-create` IT path green per correction report |
| Existing business records not overwritten | **CONDITIONAL** — filings and IDs preserved; **legacy `totalReceived` can be overwritten** (see §3) |

---

## 7. Testing coverage review

### Present (reviewed; no data created this audit)

- Unit: Total formula; partial/full settlement; no cross-month bleed; required phone/ref/remark helpers (`gstMonthlyPayments.test.ts`, `ledgerUtils.test.ts`).
- E2E: create with filing; per-month payments; edit/delete payment; IT+GST dashboard (`finance-gst.spec.ts`, `clients-create.spec.ts`, `reports-dashboard.spec.ts`).

### Missing / recommended (do not implement in this audit)

1. **Legacy transition:** company with `totalReceived > 0` and no payments → first payment → assert whether Total Recd drops (documents current behaviour or desired fix).
2. **API overpayment / zero / negative** rejection assertions (currently logic-only in server).
3. **Double POST** / duplicate payment behaviour.
4. **Charge reduction** with Received > Total (API + UI).
5. **Invalid paymentDate** format handling (once policy is defined).
6. **Create validation matrix** for each of the seven fields missing (FE+API), one field at a time.
7. **Empty `payments: []` after delete-all** vs display fallback vs stored `totalReceived`.

---

## Verdict matrix

| Area | Verdict |
|------|---------|
| Seven mandatory create fields | **PASS** |
| Payment-line math (month + company) | **PASS** |
| Month allocation isolation | **PASS** |
| Legacy `totalReceived` on first payment | **FAIL — data display risk** |
| Unallocated legacy indication | **FAIL — missing** |
| Overpayment / negative payment API | **PASS** |
| Idempotent payment create | **FAIL — gap** |
| Date/mode strictness | **PARTIAL** |
| Charge cut vs Received > Total UX | **GAP** |
| IT unaffected | **PASS** |
| Production readiness | **Not ready** for ledgers with legacy pool receipts; acceptable only for greenfield / zero-pool GST data with acknowledged Tax ambiguity |

---

## Required business confirmations before production use

1. Accept **silent replacement** of legacy company Total Recd on first structured payment, **or** require a migration/UI that preserves or allocates the pool.
2. Confirm whether **Tax** is government remittance vs office charge (calculation already fixed as fees+interest+tax; meaning still unsigned).
3. Confirm whether **Received > Total** after charge edits needs a hard block, warning, or auto-adjust.
4. Confirm whether payment **idempotency** and **strict date/mode** validation are required.

---

## Files inspected (read-only)

- `docs/gst-monthly-payment-flow-correction-report.md`
- `server.ts` (GST create/update, filing sanitize, payment CRUD, sync)
- `src/types/ledger.ts`
- `src/utils/ledgerUtils.ts`, `summaryUtils.ts`, `fieldValidation.ts`
- `src/components/GstCompanyModal.tsx`, `GstCompanyEditDrawer.tsx`, `GstFilingQuickModal.tsx`, `GstSheetTable.tsx`
- `src/import/gstMappedParse.ts` (legacy `totalReceived` seed)
- `tests/unit/gstMonthlyPayments.test.ts`, `ledgerUtils.test.ts`
- `e2e/finance-gst.spec.ts` (coverage presence only)

**No code, configuration, database, or business-record changes were made in this audit beyond writing this report file.**
