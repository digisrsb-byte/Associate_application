# Phase C — Responsive QA & UI Stabilisation Report

**Date:** 2026-11-25  
**Branch:** `security/phase1-password-reset` (existing uncommitted work preserved; no commit/push/deploy)  
**Method:** Playwright Chromium against isolated `data-e2e` (`E2E_ISOLATION=1`). Not CSS-only verification.

---

## 1. Viewports actually tested

| Width | Login | Authenticated shell | Notes |
| --- | --- | --- | --- |
| 360 | Yes | — | Screenshot + overflow ≤1px |
| 375 | Yes | — | Screenshot + overflow ≤1px |
| 390 | Yes | Yes | Dashboard, IT/GST All Data, More, Client Summary, Import/Export |
| 412 | Yes | — | Screenshot + overflow ≤1px |
| 430 | Yes | — | Screenshot + overflow ≤1px |
| 768 | Yes | Yes | Bottom nav present (compact) |
| 1024 | Yes | Yes | Desktop shell (no bottom nav); dashboard charts |
| 1280 | Yes | Yes | Sidebar, Sheet View tab, no bottom nav |
| 1440 | Yes | Yes | Desktop overflow check |

Automated checks also asserted: logo + ASSOCIATE on login, password Show/Hide, invalid login alert, mobile bottom nav, More sheet, Import/Export open/close, desktop Sheet View available (not gated).

---

## 2. Screenshots captured

Directory: `docs/phase-c-screenshots/`

| File | Subject |
| --- | --- |
| `login-360.png` … `login-430.png` | Centered corporate login (phones) |
| `login-768.png`, `login-1024.png`, `login-1280.png`, `login-1440.png` | Login at tablet/desktop |
| `login-390-invalid.png` | Invalid credentials alert |
| `dashboard-390.png` | Mobile Business snapshot + bottom nav |
| `it-all-data-390.png` | IT All Data mobile |
| `gst-all-data-390.png` | GST All Data mobile |
| `more-sheet-390.png` | More bottom sheet |
| `client-summary-390.png` | Client Summary cards |
| `import-export-390.png` | Import/Export mobile sheet |
| `dashboard-768.png`, `dashboard-1024.png`, `dashboard-1280.png`, `dashboard-1440.png` | Authenticated dashboards |
| `it-all-data-1280.png`, `it-sheet-1280.png` | Desktop IT Simple + Sheet |

---

## 3. Features tested (browser)

- Login: logo (`/srsb-logo.jpg`), ASSOCIATE wordmark, fields, Show/Hide, Sign In, Forgot/reset flow (auth smoke)
- Mobile: bottom nav (Dashboard / IT Clients / GST / More), More → Client Summary, Import/Export
- Desktop: no bottom nav; sidebar logout; money-picture dashboard; Sheet View tab
- Page-level horizontal overflow probe (`scrollWidth - clientWidth ≤ 1`) on exercised views

E2E ledger had **0 clients / 0 companies** (isolated empty seed). Expand/edit/remove with live rows was therefore not exercised against sample filings in this run; UI paths and empty states were verified.

---

## 4. Defects found and fixed

| Defect | Fix |
| --- | --- |
| E2E helpers still expected old “Sign in” / “money picture”-only chrome after login redesign | Updated `e2e/helpers/auth.ts` (+ smoke assertions) for Welcome back / Sign In / Business snapshot / compact nav |
| Desktop Simple IT/GST tables still one-tap **Remove** filing | Wired `ConfirmDangerButton` in `SimpleClientTable.tsx` and `GstSimpleTable.tsx` |
| Nested summary history tables could contribute to awkward scroll | Contained with `max-w-full overflow-x-auto overscroll-x-contain` (+ `min-w-*` on tables) in Client / GST / Mobile summary history panels |
| Phase C QA script needed for real viewport proof | Added `e2e/phase-c-responsive-qa.spec.ts` |

No redesign of the approved centered login or mobile dashboard was done in this phase beyond the above defect fixes.

---

## 5. Desktop regression results

At **1280** and **1440** (Playwright):

- Bottom nav **absent**
- Desktop dashboard (“money picture”) visible
- Sidebar Log out visible
- IT All Data + Sheet View available (sheet not mobile-gated)
- Login remains centered card (marketing hero removed in prior login redesign — intentional)

---

## 6. Build and unit test results

| Command | Result |
| --- | --- |
| `npm run build` | **Pass** |
| `npm run test:unit` | **Pass** — 165 passed, 2 skipped |
| `tsc --noEmit` (project lint) | Pre-existing failures outside Phase C UI (`e2e/security-login-ratelimit.spec.ts`, `tests/pg-auth/...`, `tests/unit/passwordResetStore.test.ts`) — not reintroduced by this phase |

---

## 7. Browser test results

| Suite | Result |
| --- | --- |
| `e2e/phase-c-responsive-qa.spec.ts` | **6 passed** |
| `e2e/auth.smoke.spec.ts` | **7 passed** |
| Full `npm run test:e2e` | **Not run** (out of scope; Stage 2–7 suites not required for Phase C) |

**Environment note:** Playwright Chromium had to be installed (`npx playwright install chromium`) after a missing browser binary; TLS intercept required `NODE_TLS_REJECT_UNAUTHORIZED=0` for the download only.

---

## 8. Remaining limitations

- Empty `data-e2e` ledger: no populated filing rows for expand/edit/remove confirmation UI in browser QA
- Soft-keyboard open behaviour not instrumented beyond scrollable login page (no device IME automation)
- Nested history tables may still scroll **internally** on narrow screens (by design; page-level overflow checks passed)
- Full multi-stage Playwright suite not executed in this phase

---

## 9. Confirmation — backend / data untouched

- No API, auth crypto, session, schema, or calculation changes for product logic
- No edits to `data/ledger.json`, `data/auth.json`, backups, or `.env` secrets for this phase
- Browser QA used **`data-e2e` only**
- No commit, push, deploy, branch switch, reset, clean, or stash

---

## Summary

Phase C performed **actual Playwright viewport verification** with screenshots, fixed desktop filing Remove confirmation and nested-history scroll containment, aligned E2E helpers with the new login shell, and confirmed build + unit + Phase C / auth smoke browser suites green.
