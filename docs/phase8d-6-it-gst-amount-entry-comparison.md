# Phase 8D.6 — IT vs GST Amount Entry Flow Comparison

**Mode:** Strict read-only audit (no implementation)  
**Date:** 2026-11-25  
**Scope:** Compare the IT filing amount-entry experience with the GST monthly filing + payment experience, and recommend the simplest safe GST interaction that can feel like IT without discarding GST payment history.

**Audit verdict:** GST cannot become a drop-in copy of IT without either (a) losing multi-payment history, or (b) keeping payment lines under the hood while simplifying the UI. Option (b) is the safest path if an IT-like interaction is required.

---

## 1. Exactly how IT amount entry works

### Data model

IT stores **one scalar receipt per assessment year** on `FilingRecord`:

| Field | Role |
|-------|------|
| `fees` | Amount billed |
| `received` | Total received for that year (single number) |
| `balance` | Outstanding = `max(0, fees − received)` (server-enforced) |
| `paymentType` | Mode label for that receipt |
| `paymentReceiveDate` | Date for that receipt |
| `filingDate` | Filing date |

There is **no** IT payment-line array and **no** IT equivalent of GST `unallocatedReceived`.

### UI flow (`FilingQuickModal`)

1. User opens Add/Edit for a year (sheet cell, Simple View expand → Edit, or drawer history).
2. One form shows:
   - Filing Date  
   - Payment Receive Date  
   - Fees (₹) — editable  
   - Received (₹) — editable  
   - Balance (₹) — **read-only**, live `computeBalance(fees, received)`  
   - Payment Type  
3. User types Fees and Received directly.
4. One **Save** posts the whole filing.
5. Modal closes; ledger refresh shows updated year row and client Total Recd / Outstanding.

### Calculations

| Level | Formula |
|-------|---------|
| Year outstanding (Balance) | `max(0, fees − received)` |
| Client Total Recd | Sum of each year’s `received` |
| Client Outstanding | Sum of each year’s balances |

Server sanitizes and recomputes balance; the client balance is not trusted as authority.

### After save

- `POST /api/clients/:id/filings` upserts `filings[assessmentYear]`.
- App replaces ledger state from the response.
- Editing Received **overwrites** the year’s scalar — previous partial amounts are not kept as separate history rows.

### Other IT entry paths (same model)

- Inline add in Simple View (Fees / Received → same save API).
- Optional initial filing on Add Client.

**IT in one sentence:** click Add/Edit → enter Fees + Received (+ dates/mode) → Outstanding auto-calculates → one Save.

---

## 2. How GST amount entry works today

### Data model

GST separates **charges** from **payments**:

| Concept | Storage |
|---------|---------|
| Month charges | `GstMonthlyFiling`: `fees`, `interest`, `tax`, `total` (= fees + interest + tax) |
| Month receipts | `payments[]` of `GstPaymentEntry` (id, amount, date, mode, reference, idempotencyKey) |
| Month Received | **Derived** = sum of payment amounts (not a primary editable field) |
| Month Outstanding | `max(0, Total − Received)` |
| Company Total Recd | Allocated payments + `unallocatedReceived` (legacy pool) |
| Company Outstanding | `max(0, totalBilled − Total Recd)` |

`unallocatedReceived` is company-level money **not assigned to any month**. It is preserved when the first structured payment is recorded against a legacy pool, and is **not** cleared by payment edit/delete or by monthly filing delete.

### UI flow (`GstFilingQuickModal`)

**A. Charge Save (Add/Edit month)**

- Editable: Fees, Interest, Tax.  
- Display: Total = Fees + Interest + Tax.  
- Save payload: month + fees + interest + tax + total only.  
- **Does not** accept or update Received.  
- Server preserves any existing `payments[]` on charge upsert.

**B. Record Payment (separate section)**

- Shown only when a filing already exists and payment handlers are wired.
- Fields: Amount, Payment Date, Payment Mode, optional Reference.
- Creates a payment via a **different** API (`POST …/payments`) with idempotency key.
- History list supports edit/delete of individual payments.
- Received / Outstanding tiles are **read-only** summaries of payment lines.

**C. New-month practical path**

1. Save charges → modal often closes.  
2. User re-opens the month to Record Payment.  
That two-step feel is the main UX gap vs IT.

### After save

- Charge save refreshes ledger; month Total updates; payments unchanged.  
- Payment create/update/delete refreshes derived Received, month Outstanding, and company Total Recd / Outstanding.  
- Unallocated (if any) remains visible via 8D.5 copy when &gt; 0.

---

## Side-by-side comparison

| Concern | IT | GST |
|---------|----|-----|
| Charge fields | Fees | Fees + Interest + Tax → Total |
| How user enters money received | Direct **Received** input | Separate **Record Payment** (or edit a history line) |
| Outstanding | Auto from Fees − Received | Auto from Total − sum(payments) |
| Can edit “received” as one field? | Yes | No (derived from lines) |
| Multiple payments / history | No | Yes |
| Idempotent create | No | Yes (payment create) |
| Company-level unallocated pool | No | Yes (`unallocatedReceived`) |
| Single Save for charges + receipt | Yes | No (two APIs / two actions) |
| Delete filing effect | Removes that year’s scalars | Removes month **and nested payments**; unallocated kept |

---

## Answers to the eight questions

### 1. Exactly how does IT amount entry work?

One modal per assessment year: user enters Fees and Received (plus dates/mode). Balance = `max(0, fees − received)` on screen and on the server. One `POST /api/clients/:id/filings` replaces that year’s record. Client totals are sums across years. There is no multi-payment ledger for IT.

### 2. Why does GST currently require a separate Record Payment action?

Because GST was designed for **month-allocated payment lines** with:

- Multiple dated/moded receipts per month  
- Idempotent create (retry-safe)  
- Caps against remaining month outstanding  
- Preservation of legacy company receipts as **unallocated** (not auto-spread across months)  
- Charge upserts that must **not** wipe or invent payments  

Received is therefore a **derived** total. A single editable Received scalar on the charge form would conflict with line-level history and those safety rules unless the UI maps that field onto payment-line operations behind the scenes.

### 3. Can GST provide an IT-like single Add/Edit interaction?

**Yes as a UX shell; not as a pure scalar clone.**

| Approach | Feasible? | Trade-off |
|----------|-----------|-----------|
| **A. Collapse to IT scalar** (store one Received per month, drop `payments[]`) | Architecturally yes | Loses multi-payment history, references, idempotency story, edit/delete of individual receipts |
| **B. Keep payment lines; simplify UI** (one screen: charges + “Received” that creates/adjusts a payment, history still available) | Yes | Matches IT *feel* while preserving GST accounting |
| **C. Status quo** (charges Save + separate Record Payment) | Already live | Safest for history; least IT-like |

Recommendation leans to **B** if simplicity is the goal without undoing 8D.3–8D.5 payment safety.

### 4. Can the user enter monthly Fees, Interest, Tax and Received in one place?

**Display:** Already largely true for an *existing* month (charges form + Received/Outstanding tiles + payment section in the same modal).

**Single Save writing all four as independent scalars:** Not supported today. Charge POST ignores Received; payment POST requires an existing filing.

**Single interaction that saves charges and records/adjusts receipt:** Possible later by orchestrating filing upsert + payment create/update in one UI Save (still two server operations, or one new combined API).

### 5. Can Outstanding calculate automatically?

**Already does** on GST:

- Month: `max(0, Total − Received)`  
- Company: `max(0, billed − (allocated + unallocated))`  

No formula change is required for an IT-like UX. Over-receipt keeps payments and shows Outstanding ₹0 with a warning.

### 6. Can multiple payments and payment history still be preserved?

**Only if GST keeps `payments[]` (approach B).**  
IT-like scalar collapse (approach A) cannot preserve multiple payments without a different history model.  
Filing delete still removes nested payment history (8D.5 warns; behaviour unchanged).

### 7. What happens when an existing payment is edited or deleted?

| Action | Effect |
|--------|--------|
| Edit payment | Updates amount/date/mode/reference; amount re-capped vs remaining collectible; month Received and company Total Recd recompute; **unallocated unchanged** |
| Delete payment | Removes that line; same recomputes; **unallocated unchanged** |
| Delete monthly filing | Hard-deletes filing + all nested payments; **unallocated not removed** |

IT has no equivalent: changing Received simply overwrites the year total.

### 8. Which files and APIs would need changes?

**If implementing IT-like UX later (list only — not done in this phase):**

| Layer | Candidates |
|-------|------------|
| UI | `GstFilingQuickModal.tsx` (primary), possibly `GstCompanyModal.tsx`, `GstCompanyEditDrawer.tsx`, Simple/mobile GST tables if inline received is added |
| App wiring | `App.tsx` (`handleSaveGstFiling` / payment handlers orchestration) |
| Server | `server.ts` — either orchestrate existing routes or add a combined upsert; `sanitizeGstFiling` today must not accept payments from charge body |
| Types / utils | `ledger.ts`, `ledgerUtils.ts`, `gstCopy.ts` only if copy/semantics change |
| Tests | `finance-gst` e2e, GST payment unit tests, helpers |
| PG path (if used) | `pgLedgerRepository` / schema — payment lines / unallocated are not fully mirrored there today |
| Import/export | GST Excel import/export if Received entry semantics change |

**Existing APIs involved today:**

- `POST /api/gst/clients/:id/filings` — charges only; preserves payments  
- `POST /api/gst/clients/:id/filings/:month/payments` — create (idempotent)  
- `PUT …/payments/:paymentId` — edit  
- `DELETE …/payments/:paymentId` — delete payment  
- `DELETE …/filings/:month` — delete filing + nested payments  

---

## Why the experiences feel different (root cause)

| | IT | GST |
|--|----|-----|
| Product intent | Simple year ledger: billed vs received | Month collectible + audit trail of receipts |
| Source of truth for “received” | One field | Many payment rows (+ optional unallocated pool) |
| Save mental model | “Update this year’s numbers” | “Update charges” **or** “Add/adjust a payment” |

The confusion is expected: GST is **richer and safer for payment history**, and that richness shows up as a second action.

---

## Recommendation — simplest safe GST interaction closest to IT

**Do not collapse GST to IT’s single Received scalar.** That would throw away multi-payment history, references, idempotent creates, and the unallocated legacy rules built in 8D.3–8D.5.

**Preferred direction (when implementation is approved):**

1. **Keep** Fees / Interest / Tax / Total and `payments[]` / unallocated formulas unchanged.  
2. **Unify the modal UX** so one Add/Edit screen always shows:
   - Charge fields (as now)  
   - A clear **Received** summary (auto from payments)  
   - Auto **Outstanding**  
   - An IT-like primary path: enter amount (+ date/mode) and save **without** hunting for a separate “Record Payment” mental mode — e.g. “Save filing & payment” or a Received field that maps to create/adjust the latest payment line when history is empty/simple  
3. **Keep** expandable payment history for multiple payments, edit, and delete.  
4. **Keep** filing-before-payment server rules (or a single combined API that creates the filing then the payment atomically).  
5. **Do not** auto-allocate unallocated receipts to months.

That yields an interaction that *feels* like IT (one place, amounts + auto outstanding) while remaining GST-safe.

**If business prefers maximum simplicity over history:** explicitly accept approach A (scalar Received per month) as a breaking product change — out of scope for a silent UX tweak.

---

## Constraints observed this phase

- No IT or GST code changes.  
- No calculation changes.  
- No test/business records created.  
- No production/staging connection, migrations, imports, commit, push, or deploy.

**STOP.** Audit only — no implementation follows this document.
