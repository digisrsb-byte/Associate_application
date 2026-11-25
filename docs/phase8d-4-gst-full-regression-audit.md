# Phase 8D.4 — GST Full Regression and Financial Reconciliation Audit

**Mode:** Strict read-only (no code, data, configuration, database, import, migration, commit, push, or deploy).  
**Date:** 2026-11-25  
**References:**  
- `docs/gst-monthly-payment-flow-correction-report.md`  
- `docs/phase8d-2-gst-payment-readiness-audit.md`  
- `docs/phase8d-3-gst-payment-safety-fix-report.md`

**Final verdict: PASS WITH WARNINGS**

The post–8D.3 payment-line model, legacy preservation, validations, and IT separation are consistent in code for the intended formulas. Residual warnings are UI/export visibility of unallocated receipts, filing-delete cascading payment removal, Outstanding composition when unallocated exists, unsigned Tax meaning, and test gaps. **Not a production-readiness certification.**

---

## 1. Company management

| Check | Result | Code reference |
|-------|--------|----------------|
| Create GST company | **PASS** | `POST /api/gst/clients` (`server.ts`); UI `GstCompanyModal.tsx` |
| View | **PASS** | Sheet / simple / mobile lists; drawer history |
| Edit | **PASS** | `PUT /api/gst/clients/:id`; `GstCompanyEditDrawer.tsx` (Phone/Ref/Remark required) |
| Delete | **PASS** | `DELETE /api/gst/clients/:id`; UI confirm in `CompanyRowMenu.tsx` |
| Seven mandatory create fields | **PASS** | FE: Company Name → User ID → Password → Phone → Ref No → Remark → Monthly Filing (`GstCompanyModal.tsx`). BE: `validateRequiredText` / `validateRequiredPhone` + filings non-empty |
| Field order preserved | **PASS** | Same modal order as 8D.1–8D.3 |
| IDs intact on edit | **PASS** | PUT spreads `existing`; does not reassign `id` |
| Password security | **PASS** | Stored as `passwordEnc` via `persistPasswordFields`; `stripPublicSecrets` strips `password`/`passwordEnc` from ledger JSON; reveal via authenticated `POST …/reveal-portal-password` only |

**Note:** Create ignores manual `totalReceived` (starts at 0). Edit drawer Total Recd is read-only derived summary.

---

## 2. Monthly filing management

| Check | Result | Code reference |
|-------|--------|----------------|
| Multiple months per company | **PASS** | `filings: Record<string, GstMonthlyFiling>`; upsert by month key |
| Fees / Interest / Tax saved | **PASS** | `sanitizeGstFiling` clamps ≥0 |
| Total = fees + interest + tax | **PASS** | Server overwrites client total; `computeGstFilingTotal` |
| Edit filing preserves payments | **PASS** | `sanitizeGstFiling(..., existing)` copies `existing.payments` |
| Delete filing vs payments | **WARNING** | `DELETE …/filings/:month` deletes the whole filing object, **including nested `payments[]`**. UI uses `ConfirmDangerButton` (“Remove filing”) — not silent, but there is **no** soft-delete, archive, or “payments reparent” rule. Company `unallocatedReceived` is preserved via `syncGstCompanyTotalReceived`. |

---

## 3. Payment management

| Check | Result | Evidence |
|-------|--------|----------|
| Record / partial / full / multi-payment | **PASS** | Payment CRUD + e2e `finance-gst.spec.ts` |
| Edit / delete payment | **PASS** | `PUT`/`DELETE …/payments/:paymentId`; recalculates via `withGstFilingReceived` + `syncGstCompanyTotalReceived` |
| Month-specific allocation | **PASS** | Payments stored only on `filings[decodedMonth]` |
| Duplicate submission protection | **PASS** (when key present) | `idempotencyKey` / `Idempotency-Key`; replay → 200, no second row. **WARNING:** requests **without** a key can still double-create on double-click |
| Date validation | **PASS** | `validatePaymentDate` / `YYYY-MM-DD` calendar check |
| Mode validation | **PASS** | Must be in `PAYMENT_TYPES`; legacy mode kept on edit if unchanged |
| Over-receipt warning | **PASS** | `gstFilingHasOverReceipt`; modal amber warning; sheet “Recd exceeds Total”; Outstanding ₹0; payments not auto-reduced |

---

## 4. Legacy receipt reconciliation

| Check | Result | Evidence |
|-------|--------|----------|
| Legacy pool preserved on first structured payment | **PASS** | `preserveLegacyReceiptsOnPaymentTransition` → `unallocatedReceived` (`server.ts`) |
| First payment does not erase legacy | **PASS** | e2e: ₹50,000 → April ₹1,000 → unallocated 50k, Total Recd 51k |
| Unallocated visible | **PASS WITH GAP** | Shown in edit drawer, history drawer, sheet Total Recd footnote, filing modal note. **Not** labeled on mobile list / simple table / Excel columns (numbers still include unallocated via `computeGstClientTotals`) |
| Edit/delete payments keep unallocated | **PASS** | Sync never clears `unallocatedReceived`; e2e confirms after edit/delete |
| No double-count | **PASS** | Total Recd = allocated + unallocated once |
| Internal consistency | **PASS WITH WARNING** | Company Outstanding = `max(0, billed − (allocated + unallocated))`. Sum of **monthly** Outstanding cells **does not** subtract unallocated (by design — unallocated is not month-assigned). Operators summing month `out` will disagree with company Outstanding when unallocated &gt; 0 |

---

## 5. Financial report consistency

Shared calculator: `computeGstClientTotals` (`ledgerUtils.ts`).

| Surface | Total Recd / Outstanding source | Unallocated callout |
|---------|----------------------------------|---------------------|
| GST sheet (`GstSheetTable.tsx`) | `computeGstClientTotals` | Footnote when unalloc &gt; 0 |
| Simple table / mobile list | `computeGstClientTotals` | No separate label |
| Edit / history drawer | `computeGstClientTotals` | Explicit unallocated lines |
| Filing payment modal | Month Received/Outstanding local; company unalloc note | Yes |
| Dashboard (`App.tsx` gst overall) | Sum of `computeGstClientTotals` | No breakdown |
| GST summaries (`summaryUtils` → `GstSummaryViews`) | `computeGstClientTotals` | No unallocated column |
| Excel export (`gstExcelExport.ts`) | `computeGstClientTotals` | No unallocated column |
| Excel import (`gstMappedParse.ts`) | Seeds company `totalReceived` pool; **no** `unallocatedReceived` field | Becomes legacy pool until first payment |

**Differences identified (not calculation bugs):**

1. Company Outstanding ≠ Σ monthly Outstanding when `unallocatedReceived > 0`.  
2. Unallocated visibility uneven across mobile/simple/export vs sheet/drawer.  
3. Import still creates pool-style `totalReceived` (compatible with transition path; no import of `unallocatedReceived`).

---

## 6. IT regression

| Check | Result | Notes |
|-------|--------|-------|
| IT create/edit | **PASS** (code isolation) | Separate `/api/clients*` + `sanitizeFiling`; GST types/routes do not mutate IT clients |
| IT fees / received / balance | **PASS** | `sanitizeFiling` / `computeBalance` unchanged by GST payment work |
| IT reports / dashboard mix | **PASS** | IT summaries use IT helpers; combined dashboard adds IT + GST totals independently |
| IT exports | **PASS** | CSV/IT paths separate from GST payment arrays |
| Automated IT coverage present | **PASS** | `e2e/finance-it.spec.ts`, `finance-it-balance-trust.spec.ts`, `reports-dashboard.spec.ts` (IT+GST), `clients-create` IT case |

No GST payment code path writes into `ClientRecord.filings`.

---

## 7. Security and data safety

| Check | Result | Notes |
|-------|--------|-------|
| API auth | **PASS** | `app.use('/api', requireAuth)` except `/health` and `/auth/*` (`server.ts` ~1814) |
| Org scoping | **PASS** (backend model) | `mutateBusinessLedger` / `loadBusinessLedger` use `BUSINESS_DATA_BACKEND.organizationId` |
| Intra-org ACL | **INFO** | Authenticated org users share the org ledger (pre-existing model; not row-level per user) |
| Payment validation | **PASS** | Amount &gt; 0; outstanding cap; date; mode; month must exist |
| Accidental overwrite of legacy receipts | **PASS** after 8D.3 | Unallocated preserved |
| Portal secrets in ledger responses | **PASS** | `stripPublicSecrets`; e2e `security-portal.spec.ts` asserts absence of `password`/`passwordEnc` |
| Reveal endpoint | **PASS WITH CAUTION** | Session-required; returns plaintext password by design for portal use — sensitive if session stolen |
| Logging of secrets | **PASS** (spot-check) | No `console.log` of portal passwords found in `server.ts` strip/persist path |
| Production/staging | **N/A** | Audit did not connect |

---

## 8. Testing review (coverage vs gaps)

### Covered (existing; not re-run as a full suite in this audit)

- Unit: totals, cross-month isolation, legacy+allocated math, date helpers, over-receipt (`gstPaymentSafety.test.ts`, `ledgerUtils.test.ts`, `gstMonthlyPayments.test.ts`).
- E2E: create; multi-month payments; edit/delete; legacy ₹50k; idempotency; bad date/mode; over-receipt keep payments; IT+GST dashboard (`finance-gst`, `clients-create`, `reports-dashboard`).
- Prior 8D.3 report: unit 234 pass, build pass, targeted Playwright 9/9.

### Missing / thin coverage

1. Delete **monthly filing** that still has payment rows (cascade behaviour).  
2. Delete **company** with payments + unallocated.  
3. Payment POST **without** idempotency key double-submit.  
4. Explicit **401** on GST payment routes when unauthenticated.  
5. GST reveal-portal-password parity with IT security-portal tests.  
6. Mobile / simple table / Excel **unallocated labeling** assertions.  
7. Assert Σ monthly Outstanding ≠ company Outstanding when unallocated &gt; 0 (documented expectation).  
8. FE create validation matrix (each of seven fields missing one at a time).  
9. Import round-trip with pool `totalReceived` then first payment → unallocated.  
10. Concurrent optimistic-lock conflicts on payment mutate (if PG path).

---

## 9. Blockers and warnings

### Blockers (must resolve before treating as production-ready)

None identified as **code defects** that reverse 8D.3 safety fixes. Remaining items are **business / product** gates:

1. **Tax meaning** still unsigned (formula unchanged).  
2. Accept **company Outstanding** formula including unallocated vs educating users that month cells won’t sum to it.  
3. Policy for **filing delete** cascading payment removal (confirm UX is enough vs stronger barrier).

### Warnings

| ID | Warning |
|----|---------|
| W1 | Filing delete removes nested payments (confirmed UI, hard delete). |
| W2 | Unallocated not labeled on mobile/simple/Excel (included in totals only). |
| W3 | Idempotency depends on client key; bare API clients can still duplicate. |
| W4 | Import does not emit `unallocatedReceived`. |
| W5 | Unsigned Tax semantics and optional future manual allocation of legacy. |

---

## Verdict

**PASS WITH WARNINGS**

- Company CRUD, seven-field create order, payment-line math, month allocation, legacy preservation, date/mode validation, over-receipt handling, auth stripping of portal secrets, and IT isolation **verify as implemented**.  
- Warnings above must be accepted or scheduled before production claims.  
- This audit does **not** certify production readiness, hosting, or full e2e suite greenness beyond reviewing existing reports and code.

**No code, database, import, migration, production connection, commit, push, or deploy was performed** beyond writing this report file.
