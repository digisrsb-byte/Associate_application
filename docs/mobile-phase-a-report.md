# Phase A — Mobile UI Implementation Report

**Date:** 2026-11-25  
**Scope:** P0 mobile responsiveness for Android phone widths 360–430px (layouts below Tailwind `lg` / 1024px).  
**Reference:** `docs/mobile-ui-audit-report.md`  
**Mode:** Frontend SPA adaptation only. No Phase B work. No backend / DB / auth / ledger data changes. No commit or deploy.

---

## 1. Components modified and created

### Created

| Path | Role |
| --- | --- |
| `src/hooks/useMediaQuery.ts` | `useMediaQuery` + `useIsCompactLayout` (`max-width: 1023px`) |
| `src/components/mobile/ItClientMobileList.tsx` | IT All Data card / expand list |
| `src/components/mobile/GstCompanyMobileList.tsx` | GST All Data card / expand list |
| `src/components/mobile/MobileSheetUnavailable.tsx` | Sheet View gate + “Use mobile list” CTA |

### Modified

| Path | Change |
| --- | --- |
| `src/components/SimpleClientTable.tsx` | Compact → mobile list; desktop table unchanged |
| `src/components/GstSimpleTable.tsx` | Compact → mobile list; desktop table unchanged |
| `src/components/ContinuousSheetTable.tsx` | Compact → sheet unavailable + `onPreferSimpleView` |
| `src/components/GstSheetTable.tsx` | Same for GST |
| `src/App.tsx` | Wire `onPreferSimpleView`; hide Sheet View tab below `lg` |
| `src/components/FilingQuickModal.tsx` | Bottom sheet on small screens; single-column grids; sticky footer; safe-area |
| `src/components/GstFilingQuickModal.tsx` | Same pattern for GST filing |
| `src/components/CompanyRowMenu.tsx` | Always-visible on touch; 44px targets; hover-dim only on fine pointer |
| `src/components/PortalPasswordCell.tsx` | Larger reveal/copy targets below `lg` |
| `src/components/Sidebar.tsx` | Larger menu/close/add targets; always show add label; safe-area top |
| `index.html` | `viewport-fit=cover` for safe-area insets |

**Not modified (Phase B):** dashboards, summary `min-w-[1100px]` tables, import wizard density, bottom tab bar, chart hover tips.

---

## 2. Mobile layouts implemented

### IT All Data (below `lg`)

- Card rows: name, PAN (+ copy), phone, period hint, outstanding.
- Expand: portal password, ref/remark, filing cards (fees / received / balance), Edit filing → existing `FilingQuickModal`, Remove → existing `onDeleteFiling`, Add/edit filing → quick edit for suggested year.
- Year toolbar / period navigator / footer preserved from `SimpleClientTable`.
- App search still filters `clients` passed into the table.

### GST All Data (below `lg`)

- Equivalent cards: company name, User ID / GSTIN (+ copy), phone, period, status hint, outstanding.
- Expand + Edit/Remove/Add filing via existing GST quick-edit callbacks.

### Sheet View (below `lg`)

- Spreadsheet not rendered.
- Clear message that Sheet View is for desktop.
- CTA switches to Simple View (`setDataViewMode('simple')`).
- Sheet View tab hidden below `lg` so users are not steered into it on phones.

### Filing editors

- Phone: bottom-aligned sheet, stacked fields (`grid-cols-1` below `sm`), scrollable body, sticky Cancel/Save (min-height 44px), `safe-area-inset-bottom`.
- `sm+`: previous centered dialog density restored (`sm:grid-cols-2` / `sm:grid-cols-3`).
- Balance / GST total still use `computeBalance` / `computeGstFilingTotal` — no math changes.

### Touch

- Row kebab always visible on coarse pointers; hover opacity only when `(hover: hover) and (pointer: fine)`.
- Delete confirmation in `CompanyRowMenu` unchanged.
- Mobile header menu / add / drawer close enlarged.

---

## 3. Existing features preserved

- All table prop contracts and App callbacks (`onSaveFiling`, `onOpenQuickEdit`, drawers, delete confirmations).
- Desktop Simple + Sheet tables and sticky columns at `lg+`.
- Search filtering in App.
- Period navigation (year / month) on All Data toolbars.
- Inline desktop filing add editors in Simple tables (desktop only).
- Validation / save / cancel / delete error handling in quick modals.
- Brand colours, fonts, and design tokens unchanged.
- No new business data state, no localStorage ledger, no mock records.

---

## 4. Desktop regression verification

| Check | Result |
| --- | --- |
| Vite production build | Passed (`vite build`, ~2.5s) |
| Desktop path in Simple tables | Still rendered when `useIsCompactLayout()` is false (`≥1024px`) |
| Sheet tables | Full spreadsheet when not compact; new prop optional |
| Sheet View tab | Visible at `lg+` (`hidden lg:inline-flex`) |
| Filing modals at `sm+` | Multi-column grids and centered dialog retained |
| Hover menus on fine pointers | Dim until row hover; confirmed via CSS media query |
| Brand / tokens | No token value changes in `index.css` |

Manual width spot-check guidance for QA: Chrome DevTools **1280px** and **1440px** — expect identical All Data tables and Sheet View as before Phase A aside from slightly larger password/menu hit areas (still desktop-usable).

---

## 5. Phone viewport verification results

Verification method for this task: **code + build + unit tests** (no Playwright device screenshot run in this session). Layouts use `useIsCompactLayout` / Tailwind `sm`/`lg` so all target phone widths share the same compact branch.

| Width | Expected behavior |
| --- | --- |
| 360 / 375 / 390 / 412 / 430 | IT/GST card lists; no sheet sticky table; stacked filing modal; Sheet tab hidden |
| Horizontal overflow | Card list avoids page-level sheet scroll; cards use `min-w-0` / `break-words` |
| Modal footer | Sticky outside scroll region so Save/Cancel stay tappable with keyboard |

**Recommended follow-up QA:** device mode or Android Chrome at each width; expand a client/company; open filing edit; Save/Cancel; open Sheet View only after resizing to ≥1024.

---

## 6. Tests and build results

| Command | Result |
| --- | --- |
| `npm run build` | **Pass** |
| `npm run test:unit` | **Pass** — 165 passed, 2 skipped (25 files) |
| `npm run lint` (`tsc --noEmit`) | **Pre-existing failures only** (unrelated to Phase A): `e2e/security-login-ratelimit.spec.ts`, `tests/pg-auth/helpers/pgAuthHttpServer.ts`, `tests/unit/passwordResetStore.test.ts` |
| IDE diagnostics on touched UI files | Clean |
| PostgreSQL / e2e suites | Not re-run (out of scope) |

No component unit tests previously covered these tables; none were added that would require mock business data.

---

## 7. Known remaining issues (Phase B / later)

- Client / Mobile / Company **summary** tables still force ~1100–1200px min width.
- Dashboard nested tables and **hover chart tips** still desktop-oriented.
- Import/export wizard still dense in a centered `max-w-3xl` modal.
- No bottom tab navigation yet (drawer remains primary mobile nav).
- Filing **Remove** on mobile cards still one-tap (same as desktop Simple expand row) — no extra confirm.
- Soft-keyboard overlap on Login page not fully addressed (Phase A focused on All Data + filing + touch).
- Compact layout uses JS media query: first paint may briefly match SSR/default before sync (standard `matchMedia` pattern).

---

## 8. Confirmation — backend, database, business data untouched

| Artifact | Status |
| --- | --- |
| `server.ts` / APIs | Not modified in Phase A |
| Auth / sessions | Untouched |
| PostgreSQL / migrations | Untouched |
| `data/ledger.json` / `data/auth.json` | Not modified by this work |
| `data-e2e` / backups | Untouched |
| Backend defaults (JSON vs Postgres) | Untouched |
| Commit / push / deploy | **Not performed** |
| Branch / reset / clean | **Not performed** — prior uncommitted work preserved |

---

## Summary

Phase A delivers usable IT/GST All Data workflows on 360–430px phones via card lists and mobile filing sheets, gates Spreadsheet Sheet View on narrow screens, and improves touch targets — while keeping desktop tables and business logic intact for `lg+`.
