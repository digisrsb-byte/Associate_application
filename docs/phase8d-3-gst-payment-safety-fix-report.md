# Phase 8D.3 — GST Payment Safety Fix Report

**Date:** 2026-11-25  
**Reference audit:** `docs/phase8d-2-gst-payment-readiness-audit.md`  
**Scope:** Legacy receipt preservation, idempotent payment create, date/mode validation, over-receipt warning.  
**Safety:** Local + isolated synthetic tests only. No commit/push/deploy. No production/staging DB. Tax meaning unchanged. No auto-allocation of legacy receipts.

---

## Changes made

1. **`unallocatedReceived`** on `GstClientRecord` — preserves company-level legacy pool receipts separately from month-allocated payments.
2. **Transition on first structured payment** — copies prior pool `totalReceived` into `unallocatedReceived` when entering payment-line accounting (does not distribute across months).
3. **Company totals** — Total Recd = allocated payments + unallocated; Outstanding = max(0, billed − Total Recd).
4. **Idempotency** — `idempotencyKey` on payment + `Idempotency-Key` header; retry returns existing payment (200) without creating a duplicate.
5. **Payment date** — strict `YYYY-MM-DD` calendar validation FE+BE; historical dates preserved on amount/mode-only edits.
6. **Payment mode** — must be in `PAYMENT_TYPES`; existing non-list modes kept on edit of old rows only.
7. **Over-receipt** — charge reductions preserve payments; UI warns when Received > Total; Outstanding stays ₹0.

---

## Legacy receipt handling and formulas

| Concept | Formula / behaviour |
|---------|---------------------|
| Monthly Total | `fees + interest + tax` (unchanged; Tax meaning not reinterpreted) |
| Monthly Received | Sum of that month’s `payments[]` only |
| Monthly Outstanding | `max(0, Total − Received)` |
| Unallocated legacy | `unallocatedReceived` (not assigned to any month) |
| Company Total Recd | `allocatedReceived + unallocatedReceived` (payment-line mode) |
| Company Outstanding | `max(0, totalBilled − Total Recd)` |

**Example (audit scenario):** Legacy pool ₹50,000, then April payment ₹1,000 → April Received ₹1,000; unallocated ₹50,000; company Total Recd ₹51,000. Edit/delete of April payment does not clear unallocated ₹50,000.

Pure legacy companies (no `payments` arrays) continue to use the pool `totalReceived` until the first structured payment.

---

## Duplicate-request protection

- Client generates one `idempotencyKey` per create-submit attempt (ref held across retries).
- Server stores key on the payment; same company+month+key → no second row (`idempotentReplay: true`, HTTP 200).
- Distinct keys allow two genuine payments with the same amount and date.

---

## Date and mode validation

- **Date format:** `YYYY-MM-DD` with real calendar check (`isValidPaymentCalendarDate` / `validatePaymentDate`).
- Rejects `not-a-date`, `99/99/99`, impossible months/days.
- **Modes:** `GPay`, `PhonePe`, `P-Pay`, `BOB`, `Cash`, `UPI`, `Bank Transfer`, `Pending`.

---

## Over-receipt handling

- Reducing fees/interest/tax below Received **keeps** all payment entries.
- No automatic refunds or amount adjustments.
- Warning in filing modal and a short “Recd exceeds Total” note in the sheet month cell.
- Outstanding displays ₹0.

---

## UI

- No redesign of layout, colours, or company form field order.
- Seven create fields remain mandatory: Company Name → User ID → Password → Phone → Ref No → Remark → Monthly Filing.
- Minimal additions: unallocated legacy line in company summary/history; over-receipt warning; sheet “incl. unalloc” when relevant.

---

## Files changed

| Area | Files |
|------|--------|
| Types | `src/types/ledger.ts` |
| Validation / calc | `src/utils/fieldValidation.ts`, `src/utils/ledgerUtils.ts` |
| Server | `server.ts` |
| UI | `GstFilingQuickModal.tsx`, `GstCompanyEditDrawer.tsx`, `GstSheetTable.tsx`, `App.tsx` |
| Tests | `tests/unit/gstPaymentSafety.test.ts`, `ledgerUtils.test.ts`, `e2e/finance-gst.spec.ts`, `e2e/helpers/finance.ts` |
| Report | `docs/phase8d-3-gst-payment-safety-fix-report.md` |

---

## Test results

| Suite | Result |
|-------|--------|
| `npm run test:unit` | **PASS** — 234 passed, 2 skipped |
| `npm run build` | **PASS** |
| Playwright `finance-gst` (incl. 8D.3 legacy/idempotency/validation) | **PASS** |
| Playwright `clients-create` + `reports-dashboard` | **PASS** (IT unaffected) |

Covered scenarios: legacy ₹50k + ₹1k April; edit/delete preserve unallocated; idempotent retry vs two genuine payments; invalid date/mode rejection; charge cut below Received keeps payments.

---

## Remaining business decisions

1. **Tax meaning** — still unsigned (fees+interest+tax formula unchanged; no reinterpretation).
2. **Whether operators should later manually allocate** unallocated legacy into months (UI/tooling not built; intentional non-auto-allocation).
3. **Whether company Outstanding using billed − (allocated + unallocated)** is the preferred business view when unallocated exists (sum of monthly outstandings will differ).
4. **Whether unsupported free-text modes** should be permanently disallowed for new payments only (current) or migrated.

**Not production-ready solely because local tests pass.** Re-run full regression and obtain business sign-off on legacy display and Outstanding formula before release.
