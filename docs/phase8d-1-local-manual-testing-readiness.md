# Phase 8D.1 — Local Application Manual Testing Readiness Audit

**Date:** 2026-11-25  
**Mode:** Read-only audit (no demo records created, no database changes, no backend default changes)  
**Goal:** Prepare complete manual functional testing before hosting  

**Not performed:** production/staging connections, real ledger import, UI/business-logic changes, commit/push/deploy, creation of test accounts or synthetic UI data.

---

## Verdict

**READY for a JSON-backend local manual test cycle** after a short environment-prep step (approved separately).  

**NOT READY** to treat PostgreSQL two-owner mode as the default manual path without a dedicated, approved prep phase (defaults must stay JSON; drill DBs must not be deleted casually).

| Area | Status |
| --- | --- |
| Local startup (`npm run dev`) | Ready |
| Default backends (`AUTH_BACKEND=json`, `BUSINESS_DATA_BACKEND=json`) | Ready — **recommended for this manual cycle** |
| Feature surface (IT/GST CRUD, filings, reports, import/export) | Ready to test |
| Automated coverage (unit + Playwright on `data-e2e`) | Strong for regression; manual still needed for UX/hosting prep |
| Two-owner shared-org UI on **default** JSON | **Not available** (single admin + shared file ledger) |
| Real recovered ledger (153455) as test data | **Forbidden** for this cycle |
| Phase 8C.3 drill DBs | **Must not be deleted**; optional later PG smoke only with explicit approval |

---

## 1. Safest local testing setup

### Recommendation (primary)

Use the **default JSON stack** on loopback only:

| Setting | Value |
| --- | --- |
| Host | `127.0.0.1` (do not use `0.0.0.0` for local UAT) |
| Port | `3000` (or existing local `.env` `PORT`) |
| `AUTH_BACKEND` | unset / `json` |
| `BUSINESS_DATA_BACKEND` | unset / `json` |
| Data | Prefer a **dedicated** `DATA_DIR` for manual synthetic testing (e.g. `./data-manual`) so live `data/` and E2E `data-e2e/` stay untouched |
| Keys | Local `PORTAL_PASSWORD_ENCRYPTION_KEY` + backup key as needed for portal reveal / JSON `.json.enc` tests |
| Browser | Chrome (desktop + responsive DevTools ~375px) |

**Why JSON first:** matches current product defaults, avoids touching PostgreSQL drill/dev DBs, supports encrypted JSON backup/restore drills already proven in E2E, and matches existing `TEST_CHECKLIST.md` / Playwright assumptions.

### Explicitly out of scope for the primary cycle

- Recovered offline ledger `153455` / handover / any real PII  
- Production or staging URLs  
- Changing default backends in committed `.env.example` or forcing PG mode  
- Dropping `it_gst_management_restore_drill` / `it_gst_management_backup_drill`

### Optional later (separate approval) — PostgreSQL two-owner smoke

Only after JSON manual pass + written approval:

1. Point a **throwaway** local env (not production) at a disposable DB (prefer a **new** drill name or carefully reuse 8C.3 DBs **without DROP**).  
2. Set `AUTH_BACKEND=postgres`, `BUSINESS_DATA_BACKEND=postgres`, `AUTH_ORGANIZATION_ID=<shared org>`.  
3. Log in as Owner A and Owner B; confirm identical IT/GST counts.  
4. Do **not** import real business SoR in that smoke.

---

## 2. Backend choice for manual testing

| Backend | Use for Phase 8D manual? | Notes |
| --- | --- | --- |
| **JSON (default)** | **Yes — primary** | Single administrator; full IT/GST UI; JSON backups available |
| PostgreSQL auth + business | Later / optional | Required for true two-owner shared-org UI; JSON backup APIs refused |
| E2E `data-e2e` + `E2E_ISOLATION=1` | Automated only | Do not point manual Chrome at the Playwright server unless intentionally isolating |

**Selected for this readiness plan:** JSON local backend.

---

## 3. Exact startup instructions (JSON primary)

Prerequisites: Node 20+, existing local `.env` with loopback `HOST`, portal key set for password-reveal tests.

```powershell
cd Associate_application
# Optional isolation (recommended when preparing the environment — do not do in this audit):
#   ensure DATA_DIR=./data-manual and folder exists; keep AUTH/BUSINESS backends unset (json)

npm install
npm run dev
```

Open: `http://127.0.0.1:3000`  

Smoke APIs (while logged out / as applicable):

- `GET /api/health` → `{"status":"ok"}`  
- `GET /api/auth/setup-status` → whether bootstrap is needed  

**Production start path** (`npm start` after `npm run build`) is available for a later “prod-like local” pass; first manual cycle can stay on `npm run dev`.

---

## 4. Test accounts needed

### JSON mode (primary)

| Account | How obtained | Notes |
| --- | --- | --- |
| Single administrator | One-time **bootstrap** if `auth.json` is missing in the chosen `DATA_DIR`; otherwise existing local admin | Strong password policy (12+, upper/lower/number/special) |
| Second “owner” | **N/A** on JSON | File ledger is one shared admin — do not expect two separate JSON logins |

Do **not** reuse production emails/passwords. Use clearly synthetic addresses (e.g. `manual.tester@example.com`).

### PostgreSQL mode (optional later)

| Account | How obtained |
| --- | --- |
| Owner A + Owner B | `npm run db:provision-owners` against an allowlisted **local** disposable DB only |
| Organization | Printed `organization_id` → `AUTH_ORGANIZATION_ID` |

8C.3 already proved DB-level two-owner restore; UI smoke against PG is still a separate prep step.

---

## 5. Feature map (for manual cases)

| Feature | Primary UI / API | Automated coverage (indicative) |
| --- | --- | --- |
| Login / logout / session | `LoginPage`, `/api/auth/*` | `e2e/auth.smoke.spec.ts`, security auth specs |
| Bootstrap | `/api/auth/bootstrap` when no auth store | Partial / setup helpers |
| Password reset | Forgot/reset → token file under `DATA_DIR` | Limited; file-based |
| IT client CRUD | Modals/drawers → `/api/clients` | `clients-*.spec.ts` |
| IT filings / years | Filing modals → `/api/clients/:id/filings`, `/api/years` | `finance-it*.spec.ts` |
| GST company CRUD | GST modals → `/api/gst/clients` | GST finance/create paths |
| GST filings / months | `/api/gst/clients/:id/filings`, `/api/gst/months` | `finance-gst.spec.ts` |
| Dashboard / summaries | Year/Client/GST/Mobile/Overall views | `reports-dashboard.spec.ts` |
| Search / filters | App search + year/month filters | `clients-search`, `filters-*.spec.ts` |
| Export / data transfer | CSV + Excel transfer | `export.spec.ts` |
| Excel import wizard | `/api/import/*` | Partial vs full wizard UX |
| Portal password reveal | Reveal endpoints + encryption key | `security-portal.spec.ts` |
| JSON backup/restore | `/api/backups*` | `security-backup*.spec.ts` |
| Responsive / mobile shell | Bottom nav, lists, sheets | `phase-c-responsive-qa.spec.ts` |
| Two-owner shared org | PG backends only | `tests/pg-auth/*` (API/DB), not full UI default |

---

## 6. Manual test cases (JSON primary)

Mark each: Pass / Fail / Skip. Use **synthetic** clients only (prefix names with `MANUAL-`).

### A. Smoke & auth

| ID | Steps | Expected |
| --- | --- | --- |
| A1 | Open app URL | Login or bootstrap UI loads; no blank page |
| A2 | `/api/health` | `status: ok` |
| A3 | Bootstrap (if needed) or login | Session established; ledger shell visible |
| A4 | Logout → login again | Works; prior synthetic data still present |
| A5 | Wrong password | Clear error; no session |
| A6 | Forgot password (optional) | Token file appears under `DATA_DIR`; reset works; **do not** paste token into tickets |

### B. IT clients

| ID | Steps | Expected |
| --- | --- | --- |
| B1 | Add client: name, valid PAN, portal password, phone | Appears in All Data / lists |
| B2 | Empty name/PAN | Validation error; not saved |
| B3 | Invalid PAN shape | Rejected (see PAN validation behaviour) |
| B4 | Edit name/phone/password | Updates after save; toast success |
| B5 | Refresh (F5) | Edits persist |
| B6 | Delete with confirm | Removed from all IT views |
| B7 | Search by name | Filters correctly |

### C. IT filings & payments

| ID | Steps | Expected |
| --- | --- | --- |
| C1 | Add assessment year | Year available |
| C2 | Add filing: fees, received, payment type, dates | Saved |
| C3 | fees=10000, received=4000 | Balance/outstanding = 6000 across summary views |
| C4 | Edit fees/received | Totals update consistently |
| C5 | Delete one filing | Filing gone; client remains |
| C6 | Payment types (e.g. UPI/Cash/Pending) | Each persists |

### D. GST companies & filings

| ID | Steps | Expected |
| --- | --- | --- |
| D1 | Add company | Appears in GST views |
| D2 | Required-field validation | Blocks empty required fields |
| D3 | Edit company | Persists after refresh |
| D4 | Add month + filing (fees/interest/tax) | `total` consistent; summaries match |
| D5 | Edit filing amounts | Recalculates |
| D6 | Delete filing / delete company | Confirm; removed appropriately |

### E. Reports, totals, outstanding

| ID | Steps | Expected |
| --- | --- | --- |
| E1 | Compare IT Year Summary vs All Data for one client | Same fees/received/balance |
| E2 | Compare GST Company Summary vs All Data | Same billed components / received / outstanding |
| E3 | Dashboard / top cards | Match sum of underlying synthetic rows |
| E4 | Mobile summary / narrow viewport | Usable; totals not contradictory |

### F. Validation & errors

| ID | Steps | Expected |
| --- | --- | --- |
| F1 | Special characters in name/remark | Saves; UI stable |
| F2 | Nonsense search | Empty state; no crash |
| F3 | Rapid double-save | No duplicate clients (or safe error) |
| F4 | Stop server mid-session → action | Clear failure message |

### G. Import / export / backup (synthetic only)

| ID | Steps | Expected |
| --- | --- | --- |
| G1 | Export IT/GST CSV | Downloads; opens cleanly |
| G2 | Data Transfer export | Workbook downloads |
| G3 | Excel import of a **tiny synthetic** file (optional) | Preview/validate; no real PII |
| G4 | Create JSON encrypted backup → list → restore to **isolated** `DATA_DIR` only | Restores counts; never point at prod data |

### H. Two-owner (skip on JSON primary)

| ID | Steps | Expected |
| --- | --- | --- |
| H1 | Skip unless PG prep approved | Document as blocked on JSON default |
| H2 | (Later) Owner A vs Owner B same counts | Identical shared org ledger |

---

## 7. Persistence expectations

| Action | Expected |
| --- | --- |
| Browser refresh | Ledger state unchanged (JSON file or PG) |
| Logout / login | Same business rows for that backend |
| Server restart (`npm run dev`) | JSON: `DATA_DIR/ledger.json` + `auth.json` survive |
| Switching `DATA_DIR` | Different datastore — do not confuse with “data loss” |

---

## 8. Cleanup procedure (synthetic records)

After the manual cycle (execute only when approved to run tests):

1. Delete UI records whose names start with `MANUAL-` (clients/companies).  
2. Remove any manual-only assessment years / GST months added solely for the test, if empty.  
3. If using `DATA_DIR=./data-manual`: archive or delete that folder when finished — **do not** delete live `data/` or `data-e2e/` casually.  
4. Remove any manual Excel fixtures from Downloads / temp.  
5. **Do not** drop PostgreSQL drill databases without separate approval.  
6. **Do not** restore recovered real backups into the manual tree.

---

## 9. Automated tests vs missing manual coverage

### Already strong in automation

- Auth smoke, rate limits, cookie/security basics  
- IT create/edit/delete/validation/PAN/search  
- IT/GST finance and balance trust  
- Dashboard reports + filters  
- Export  
- Encrypted backup restore (isolated E2E dir)  
- Responsive Phase C checks  

### Still prioritize manually

| Gap | Why manual |
| --- | --- |
| Visual polish / toast / modal focus | Hard to assert fully in E2E |
| Real Chrome mobile DevTools feel | Complements Playwright viewports |
| Excel import wizard end-to-end UX | Partial automation |
| Operator judgment on “outstanding looks right” | Business confidence |
| Bootstrap on a clean `DATA_DIR` | First-run path |
| Password-reset file workflow on this machine | Hosted gap remains |
| Two-owner **UI** on Postgres | Not default; needs approved prep |
| Prod-like `npm start` + static `dist/` | Optional second pass |

Existing checklist to reuse when executing: `TEST_CHECKLIST.md` (align IDs with §6; keep synthetic-only data rules).

---

## 10. Blockers and cautions

| Item | Severity | Notes |
| --- | --- | --- |
| Two-owner shared login not testable on JSON default | Medium (for hosting goal) | Needs approved PG prep later |
| Real SoR (153455) must not be loaded for manual UI tests | High if ignored | Gate 0 still open for import |
| Live `data/ledger.json` may be empty or differ from Git HEAD | Info | Prefer isolated `DATA_DIR` |
| Hosted password reset still file-based | High for go-live | Manual local reset OK; phones later |
| JSON backup disabled if someone switches to PG business mode | Info | Keep JSON for this cycle |
| OneDrive / Windows locks on `data/` | Medium | Prefer non-synced `DATA_DIR` if rename/`EPERM` appears |
| Do not delete 8C.3 drill DBs | Hard rule | Cleanup is synthetic UI/files only |

**No audit-blocking defect found** that prevents starting a JSON local manual cycle once environment prep is approved.

---

## 11. Suggested next step (awaiting approval)

**Phase 8D.2 (proposed):** prepare isolated `DATA_DIR` (or confirmed clean bootstrap path), document tester credentials privately, and execute §6 checklist — still no real ledger import, no drill DB drops, no backend default changes, no deploy.

---

## Stop line

Phase **8D.1** complete — local manual testing readiness audit only.  

**Recommended backend:** JSON (defaults).  
**No demo records created. No databases modified. Waiting for approval before preparing the manual testing environment.**
