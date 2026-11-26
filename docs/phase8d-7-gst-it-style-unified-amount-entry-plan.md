# Phase 8D.7 — GST IT-Style Unified Amount Entry Plan

**Mode:** Strict read-only planning (no implementation)  
**Date:** 2026-11-25  
**References:** `docs/phase8d-6-it-gst-amount-entry-comparison.md`, `docs/phase8d-5-gst-usability-safety-report.md`, `docs/phase8d-3-gst-payment-safety-fix-report.md`

**Plan verdict: READY FOR IMPLEMENTATION**

---

## Confirmed product decision (this phase)

**Chosen design (user Option A — display Received from payments; keep payment arrays):**

| Decision | Detail |
|----------|--------|
| Received on main Add/Edit | **Display-only** total for the selected month |
| Source of Received | Sum of that month’s `payments[]` (`computeGstFilingReceived`) |
| Payment arrays | **Retained** — never replaced by a scalar Received field |
| Payment History | Expandable; add / edit / delete individual payments |
| Primary Save | **Save Filing** saves charge fields only (Fees, Interest, Tax → Total) |
| Never | Treat displayed Received as a new payment on Save Filing |

> Note: In 8D.6 this was recommended as “keep lines + simplify UI.” The user’s label “Option A” here means that confirmed UX, **not** collapsing to an IT scalar Received.

---

## Constraints (must preserve)

| Constraint | Plan stance |
|------------|-------------|
| IT functionality | Untouched |
| GST `payments[]` model | Untouched |
| Seven company fields + order | Untouched (`GstCompanyModal`) |
| Monthly Total = Fees + Interest + Tax | Untouched |
| Monthly Received / Outstanding formulas | Untouched |
| Company Total Recd / Outstanding | Untouched |
| Unallocated never auto-assigned to a month | Untouched |
| Charge save preserves payments | Already server rule — keep |
| Over-receipt warning + payment idempotency | Keep |
| Filing delete behaviour | No change in 8D.7 |
| Layout / colours / styling | Recompose within existing modal patterns / CSS variables |

---

## 1. Current IT vs GST modal (facts)

### IT (`FilingQuickModal.tsx`)

- One form: Fees (editable) + Received (editable) + Balance (auto) + dates/mode.
- One Save → `POST /api/clients/:id/filings`.
- No payment history list.

### GST today (`GstFilingQuickModal.tsx`)

- Charge form: Fees, Interest, Tax, Total (auto).
- When filing exists: small Total / Received / Outstanding tiles (Received already derived).
- **Below** a separate “Record Payment” block + always-visible history.
- Charge Save calls `onSave` then **`onClose()`** — user must reopen to pay on a brand-new month.
- Payment create/update/delete use dedicated handlers/APIs.

**Gap vs desired UX:** Information is already mostly present; the layout feels like two products (charges vs payments), and new-month flow forces a reopen. Received is not yet presented in the same “primary row” visual language as IT’s Fees / Received / Balance.

---

## 2. GST payment APIs (keep as-is)

| API | Behaviour to preserve |
|-----|------------------------|
| `POST …/filings` | Charges only; Total = fees+interest+tax; **preserves** existing `payments[]` |
| `POST …/filings/:month/payments` | Requires existing filing; amount ≤ remaining outstanding; idempotency key → 200 replay; may set `unallocatedReceived` on first transition |
| `PUT …/payments/:paymentId` | Edit; re-cap vs collectible − other payments; unallocated unchanged |
| `DELETE …/payments/:paymentId` | Remove line; recompute; unallocated unchanged |
| `DELETE …/filings/:month` | Filing + nested payments; unallocated kept (warning copy already in 8D.5) |

No new payment validation rules are required for this UX plan.

---

## 3. Safest internal separation while simplifying UI

**Principle:** UI composition only. Storage and APIs stay split.

```
┌─────────────────────────────────────────────┐
│  GST Add/Edit month (one dialog)            │
│  ┌─ Charges (editable) ──────────────────┐  │
│  │ Fees · Interest · Tax                 │  │
│  │ Total (auto)                          │  │
│  │ Received (display = Σ payments)       │  │
│  │ Outstanding (auto)                    │  │
│  │ [Save Filing]  ← charges API only     │  │
│  └───────────────────────────────────────┘  │
│  ┌─ Payment History (expandable) ────────┐  │
│  │ List · Add payment · Edit · Delete    │  │
│  │ → existing payment APIs + idempotency │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

- Displayed Received is **bound to** `computeGstFilingReceived(liveFiling)` — read-only control (not `<input>` that posts on Save).
- Save Filing must **never** POST a payment equal to the displayed Received total.
- Payment mutations only from explicit Add / Edit / Delete in history.

---

## 4–5. Combined Save Filing + optional new payment?

### Assessment

| Option | Recommendation |
|--------|----------------|
| Primary Save Filing also posts an optional new payment | **Not recommended** for this confirmed UX |
| Separate Add Payment inside history | **Recommended** |
| New server atomic “charges + payment” API | **Not needed** if Save Filing stays charge-only |

**Why not combine into Save Filing**

1. User decision: primary Save is for **charge changes**; history owns payment CRUD.  
2. Combining invites the exact bug to avoid: “Received display looks editable → Save creates a duplicate payment.”  
3. Partial-failure risk (filing OK, payment 400 on over-cap) needs extra UX and possibly an atomic API — unnecessary complexity.  
4. Idempotency already lives on payment create; charge upsert has no payment key.

**New-month without reopen (still without combined Save):**

After successful first charge save for a **new** month, **do not close** the modal (change from today’s `onClose()`). Refresh `liveFiling` via existing `gstQuickEditLive` ledger binding, show Received ₹0 / Outstanding = Total, expand or surface Payment History with **Add payment**. User can then add the first payment without leaving the screen.

That matches IT’s “stay in one dialog” feel without merging APIs.

---

## 6. Editing an existing month (multiple payments)

| State | UI behaviour |
|-------|----------------|
| N ≥ 1 payments | Received = sum; list all lines in Payment History (amount, date, mode, ref); Edit / Delete per row |
| Expandable history | Default **expanded** when N ≥ 1 (or remember last toggle); collapsed when N = 0 with clear “Add payment” |
| Save Filing | Updates fees/interest/tax only; payment rows unchanged |
| Unallocated &gt; 0 | Keep 8D.5 muted note: company unallocated is **not** part of this month’s Received |

---

## 7. New-month filing + payment entry

| Step | Behaviour |
|------|-----------|
| 1 | Open Add for month (empty / no `existing`) |
| 2 | Enter Fees / Interest / Tax; Total auto |
| 3 | Received shows ₹0 (or “—” until filing exists); Outstanding mirrors live Total draft |
| 4 | **Save Filing** → `POST …/filings`; **keep modal open**; bind live filing |
| 5 | Payment History enabled; user **Add payment** (date/mode/amount) via existing POST payments |
| 6 | Received / Outstanding tiles update from ledger |
| 7 | Further charge edits use same Save Filing; further receipts via history |

**Add Company with initial month** (`GstCompanyModal`): out of scope to redesign; optional later note only — month edit path above covers payment entry after create.

---

## 8. Edge UI states

| Condition | Behaviour |
|-----------|-----------|
| Received = 0 | Display ₹0; Outstanding = Total; history empty + Add payment CTA |
| Multiple payments | Received = sum; history lists each; Outstanding from formula |
| Unallocated &gt; 0 | Note under totals (existing copy); do not add into month Received |
| Over-receipt | Keep amber warning; Outstanding ₹0; payments unchanged by charge save |
| Payment create over remaining | Server 400; show error; do not invent payment from Received display |
| Idempotent retry | Keep modal key lifecycle (ref until success) |

---

## 9. Files, APIs, tests, migrations

### Implementation files (proposed — not modified in this phase)

| File | Planned change |
|------|----------------|
| `src/components/GstFilingQuickModal.tsx` | **Primary.** IT-like amount row (Total / Received display / Outstanding); collapsible Payment History; rename primary button to “Save Filing”; stop auto-close after successful charge save when staying to allow payment; wire Add payment into history section (reuse existing payment form controls) |
| `src/App.tsx` | Only if target refresh / close behaviour needs a flag (prefer keep modal open from modal itself after save success without closing) — handlers likely unchanged |
| `src/utils/gstCopy.ts` | Optional short helper labels (“Month received from payments”) if needed |
| `src/components/GstCompanyModal.tsx` | **No required change** for 8D.7 |
| IT components | **No change** |

### APIs

- **No new endpoints required.**  
- **No behaviour change** to sanitize/payment routes expected.  
- **No atomic combined API.**

### Tests to add/update in implementation phase

| Area | Focus |
|------|-------|
| Unit | Modal behaviour helpers if extracted; existing payment math unchanged |
| E2E `finance-gst` | Open month → see Received display; Save Filing preserves payments; Add payment from history; edit/delete; new month Save Filing then Add payment without full reopen |
| Regression | `clients-create`, `reports-dashboard`, existing 8D.3/8D.5 GST payment cases |

### Migrations / DB

| Item | Impact |
|------|--------|
| JSON ledger schema | None — same `payments[]` / `unallocatedReceived` |
| PG mapper | None for this UX-only phase (payment-line PG gaps remain a known separate topic) |
| Imports / Excel | None required |

---

## 10. Simple design that preserves layout / styling

Reuse existing GST modal chrome:

- Same navy header, frost Total strip, rounded-xl fields, navy primary button, danger ConfirmDangerButton.  
- Promote Received / Outstanding into the **main charge scroll area** in an IT-like 3-up or Fees-Interest-Tax then Total/Received/Outstanding block (Received/Outstanding as read-only mono boxes like IT Balance — not editable inputs).  
- Move today’s “Record Payment” heading into **Payment History** accordion: collapsed summary `Payment history (N) · Recd ₹…` → expand for list + Add form.  
- Avoid new colour themes, cards-in-hero, or layout redesign outside the modal.

---

## Recommended implementation sequence

1. Restructure `GstFilingQuickModal` layout: charges + display Received/Outstanding always (draft zeros when no live filing).  
2. Collapsible Payment History wrapping existing payment form + list; CTA “Add payment”.  
3. Rename primary action to **Save Filing**; on success, update live state and **do not close** (or close only via Cancel / explicit Done — prefer stay open).  
4. Ensure Save Filing path never calls payment APIs.  
5. Preserve over-receipt, unallocated notes, delete warning, idempotency.  
6. E2E + unit regression; write `docs/phase8d-7-…-report.md` after implementation (future phase).

---

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Users think Received is editable like IT | Use read-only styled box (not number input); helper text “Sum of payments below” |
| Save Filing closes before first payment | Stop auto-`onClose` after charge save |
| Accidental double payment from “matching” Received | Never POST payment from Save Filing |
| Clutter on small screens | History collapsed by default when N = 0; expanded when N &gt; 0 |
| Scope creep into scalar Received | Explicitly out of scope |

---

## Out of scope (do not do in 8D.7 implementation)

- Changing IT.  
- Replacing `payments[]` with scalar Received.  
- Changing formulas, unallocated rules, or filing-delete cascade.  
- Combined charge+payment atomic API (unless a later phase revisits).  
- Redesigning company create field order.  
- Commits, pushes, production, migrations.

---

## Decisions locked by this plan

1. Received is **display-only**, derived from payments.  
2. Payment CRUD stays in expandable history with existing APIs.  
3. Save Filing is charges-only; no combined save; no new atomic API.  
4. New-month: Save Filing then Add payment in the **same** open modal.  
5. Styling stays within current GST modal language.

---

## Verdict

**READY FOR IMPLEMENTATION**

The confirmed UX is a presentation and flow change inside `GstFilingQuickModal`, backed by existing charge and payment APIs. Calculation and storage rules stay intact; the main behavioural tweak is keeping the modal open after first charge save and presenting Received like IT’s Balance (read-only) with history for real receipt edits.

**STOP.** No source, test, database, or deployment actions were taken beyond writing this plan.
