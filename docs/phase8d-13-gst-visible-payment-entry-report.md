# Phase 8D.13 — GST Visible Payment Entry Implementation Report

**Date:** 2026-11-25  
**Mode:** Local implementation and automated testing only  
**References:** Phase 8D.8, 8D.9, 8D.11  
**Verdict: PASS**

---

## Summary

The GST monthly filing Add/Edit modal now keeps **Filing Charges**, **Payment Details** (including Total Received, Outstanding, and Record Payment fields), and **Payment History** permanently visible. Payment entry no longer requires expanding a collapsed history panel or a second “Add Payment” reveal step. Existing payment APIs, arrays, idempotency, legacy received, unallocated rules, and Save Filing behaviour are unchanged.

---

## Root cause

Phase 8D.8 already showed read-only Received/Outstanding on the main form, but **payment entry and history were gated**:

1. Collapsible **Payment History** (`historyOpen`) — often collapsed unless payments already existed.
2. Nested **Add Payment** toggle (`showPaymentForm`) — amount/date/mode/reference hidden until clicked.

Users therefore could not reliably see how to record a payment or review history without extra clicks, which felt broken relative to the visible Received figure.

**Not an API/model blocker:** `onRecordPayment` / update / delete and `gstQuickEditLive` ledger refresh already supported the required flow once the filing existed.

---

## Files changed

| File | Change |
|------|--------|
| `src/components/GstFilingQuickModal.tsx` | Three always-visible sections; remove collapse/`showPaymentForm`; **Record Payment** action; history always listed when filing exists |
| `e2e/helpers/finance.ts` | Dialog matcher includes Payment Details / Record Payment |
| `e2e/finance-gst.spec.ts` | Updated 8D.5 / 8D.8 / 8D.11 selectors; added 8D.13 Save-Filing-does-not-pay safety case |
| `docs/phase8d-13-gst-visible-payment-entry-report.md` | This report |

**Not changed:** `server.ts` payment/charge APIs, IT workflows, company mandatory fields/order, `computeGstFilingReceived` / outstanding formulas, payment storage, migrations, FY dashboard (8D.12).

---

## UI behaviour

### Section 1 — Filing Charges
- Fees, Interest, Tax (editable)
- Total = Fees + Interest + Tax (auto, read-only display)

### Section 2 — Payment Details (always visible)
- **Total Received** — read-only; `computeGstFilingReceived` (payments[] or legacy month scalar)
- **Outstanding** — read-only; `max(0, draft Total − Received)`
- When filing exists: Payment Amount, Date, Mode, Reference + **Record Payment** (or **Update Payment** when editing a line)
- When filing does not exist yet: helper text that Save Filing enables payment entry and never records a payment

### Section 3 — Payment History
- Always shown when a filing exists (count in heading)
- Edit / Delete with existing delete confirmation (Confirm remove / Keep)
- Empty state: “No payments recorded for this month.”

### Save Filing
- Saves charges only — never creates a payment from displayed Received or filled Payment Amount
- Modal stays open after new-month save so the user can record the first payment immediately
- After save, `gstQuickEditLive` refreshes `existing` from ledger → Payment Details form unlocks

---

## Financial safety checks

| Rule | Status |
|------|--------|
| Total = Fees + Interest + Tax | Preserved |
| Received = payment sum / legacy month received | Preserved via `computeGstFilingReceived` |
| Outstanding uses existing GST rules | Preserved |
| Never treat Total as Received | Received remains read-only display |
| Save Filing does not auto-record payment | Confirmed in UI + 8D.13 e2e |
| Displayed Received not submitted as payment | Separate Payment Amount field only |
| Idempotency on create retries | Existing key ref + API headers unchanged |
| Unallocated not auto-allocated to month | Note retained; company field untouched |
| Payment history / dates / modes / refs | Preserved |
| Tax remains office-collected charge | Unchanged meaning |
| Payment arrays not replaced by scalar | Unchanged |

---

## Tests executed

### Unit — `npm run test:unit`
| Result | Detail |
|--------|--------|
| **PASS** | 244 passed, 2 skipped; exit 0 |

### Playwright
| Suite | Result |
|-------|--------|
| `e2e/finance-gst.spec.ts` (Stage 3, 8D.3, 8D.5, 8D.8/13, 8D.11, 8D.13 safety) | **PASS** |
| `e2e/clients-create.spec.ts` | **PASS** |
| `e2e/reports-dashboard.spec.ts` | First combined run **1 flaky fail** (IT overall `6,000` visibility); **PASS** on immediate re-run — unrelated to GST modal |

Combined first run: **15 passed / 1 failed** (dashboard flake). Targeted GST/IT create cases all green.

### Build — `npm run build`
| Result | Detail |
|--------|--------|
| **PASS** | Vite + `server.mjs`; exit 0 |

---

## Coverage vs requested cases

| Case | How covered |
|------|-------------|
| New filing, no payment | History (0); Received 0; 8D.13 e2e |
| Immediate first payment after save | New-month e2e; modal stays open |
| Existing filing with previous payments | History list + Recd update e2e |
| Multiple partial payments | Record Payment adds second line (8D.8/13) |
| Edit charges after payments | Save Filing fees change; payments preserved |
| Received/Outstanding refresh | `gstQuickEditLive` + testids |
| Save charges without payment | 8D.13 e2e with amount filled but unused |
| Duplicate payment retry | 8D.5 idempotency e2e (Record Payment) |
| Legacy / unallocated | Untouched server + unit paths; modal note |
| Payment delete confirmation | 8D.11 e2e (no expand needed) |
| IT regression | clients-create + reports-dashboard re-run |

---

## Safety

- Local only; no production/staging DB; no migrations/imports; no commit/push/deploy.
- No second payment system; existing APIs reused.

---

## STOP

Implementation and local verification complete. No further work in this phase.
