# Phase B — Professional Mobile UI Redesign Report

**Date:** 2026-11-25  
**Scope:** Polished smartphone-first UI below Tailwind `lg` (1024px), preserving desktop at ≥1024px.  
**References:** `docs/mobile-ui-audit-report.md`, `docs/mobile-phase-a-report.md`  
**Safety:** No backend/API/auth/schema/ledger data changes. No commit, push, deploy, or branch switches.

---

## Brand colours note

The brief listed Navy `#142B4A` and Teal `#16A6A1`. The live app tokens remain the established Scheduly palette (`--navy-900: #2f4dbf`, gold accent, existing success/muted surfaces) so **desktop branding is not globally rewritten**. Mobile layouts reuse those CSS variables for a professional look without a second colour system.

---

## 1. Files changed / created

### Created

| File | Purpose |
| --- | --- |
| `src/components/mobile/MobileBottomNav.tsx` | Fixed bottom tabs: Dashboard · IT Clients · GST · More |
| `src/components/mobile/MobileMoreSheet.tsx` | Bottom sheet for summaries, import/export, CSV, logout |
| `src/components/mobile/MobileDashboard.tsx` | Mobile-first dashboard using live `computeYearSummary` / `computeGstMonthSummary` |
| `src/components/mobile/ConfirmDangerButton.tsx` | Two-step confirm for destructive Remove |
| `src/components/mobile/SummaryMobileCards.tsx` | Card layouts for Client / Mobile / GST summaries |

### Updated

| File | Change |
| --- | --- |
| `src/App.tsx` | Bottom nav + more sheet; main safe bottom padding; hide `TopSummaryCards` below `lg` |
| `src/components/OverallDashboard.tsx` | Compact → `MobileDashboard`; desktop charts unchanged |
| `src/components/mobile/ItClientMobileList.tsx` | Redesigned cards, Edit/View actions, remove confirm, empty state |
| `src/components/mobile/GstCompanyMobileList.tsx` | Same for GST |
| `src/components/ClientSummaryView.tsx` | Compact card list; desktop `min-w-[1100px]` table preserved |
| `src/components/MobileSummaryView.tsx` | Compact card list; desktop table preserved |
| `src/components/GstSummaryViews.tsx` | Compact company cards; desktop table preserved |
| `src/components/DataTransferModal.tsx` | Full-height mobile sheet; larger controls |
| `src/components/ExcelImportWizard.tsx` | Compact step progress + percentage bar |
| `src/components/FilingQuickModal.tsx` | Remove uses confirm control |
| `src/components/GstFilingQuickModal.tsx` | Same |

Phase A pieces (`useIsCompactLayout`, sheet gate, filing sheet layout, touch menus) remain in place.

---

## 2. Screens / features improved

| Area | Mobile behaviour |
| --- | --- |
| **Navigation** | Bottom bar drives Dashboard / IT All Data / GST All Data; More opens summaries + data tools + sign-out. Desktop sidebar unchanged. |
| **Dashboard** | KPI tiles (IT clients, GST companies), outstanding + collection progress, billed/received stats, recent IT years & GST months, primary actions — all from live ledger summaries. |
| **IT / GST All Data** | Separated card chrome, outstanding badges, Edit + View filings, organised expand panels, empty states, filing remove confirmation. |
| **Summaries** | Client, Mobile, and GST Company summaries use expandable cards instead of 1100–1200px tables. Filters/sort/pagination unchanged. |
| **Import / Export** | Bottom sheet dialog, safe-area padding, touch-sized domain/tab controls, scrollable body; import step progress simplified on phones. |
| **Filing delete** | Confirm-then-remove in mobile lists and quick modals. |

---

## 3. Desktop regression verification

| Check | Result |
| --- | --- |
| Bottom nav / more sheet | `lg:hidden` — not shown ≥1024px |
| Main bottom padding | `lg:pb-0` — no extra desktop chrome gap |
| Overall dashboard | Full chart/SVG experience when not compact |
| Summary / All Data tables | Rendered when `useIsCompactLayout()` is false |
| Sheet View | Still available via tab at `lg+` |
| Top summary cards | Visible again at `lg+` (`hidden lg:block` wrapper) |
| Global CSS tokens | Unchanged |
| Production build | Pass |

Manual QA target: DevTools **1280px** and **1440px** — expect pre-Phase-B desktop composition (plus Phase A touch-target size tweaks that remain harmless on desktop).

---

## 4. Mobile width verification

Verification method: **code paths + production build + unit tests**. All five widths (360 / 375 / 390 / 412 / 430) share the compact branch (`max-width: 1023px`).

| Expectation | Status |
| --- | --- |
| No Sheet sticky spreadsheet as default | Yes (Phase A gate + hidden sheet tab) |
| Card lists for All Data + summaries | Yes |
| Bottom nav + content padding / safe-area | Yes |
| Filing / import sheets scrollable with sticky actions | Yes |
| ≥44px primary controls | Targeted on nav, cards, modals, confirms |
| No mock business data | Yes — live ledger helpers only |

**Not run in this session:** Playwright / Android device screenshots. Recommend a quick DevTools pass at each width after pull.

---

## 5. Build and test results

| Command | Result |
| --- | --- |
| `npm run build` | **Pass** |
| `npm run test:unit` | **Pass** — 165 passed, 2 skipped |
| `tsc --noEmit` (project lint) | Pre-existing failures only outside Phase B UI (`e2e/security-login-ratelimit.spec.ts`, `tests/pg-auth/...`, `tests/unit/passwordResetStore.test.ts`) |
| IDE diagnostics on touched files | Clean |
| PostgreSQL / e2e suites | Not re-run |

---

## 6. Remaining issues

- Nested Year/Month history tables inside summary expands may still scroll horizontally on very narrow screens (contained within cards, not page-level).
- Desktop Simple View filing **Remove** in expanded table rows is still one-tap (confirm added on mobile cards + quick modals).
- Chart hover tips on the **desktop** dashboard remain hover-oriented (mobile uses the new dashboard instead).
- Login soft-keyboard polish is still limited.
- Optional future: map More → deep-link badges, offline banners, or pull-to-refresh — not in Phase B.
- Requested `#142B4A` / `#16A6A1` palette not applied globally (desktop protection); can be a deliberate theme token migration later if product wants a rebrand.

---

## 7. Confirmation — data & ops untouched

Backend, auth, database, import engine safety checks, ledger JSON, and business calculations were not modified. Existing uncommitted work outside these UI files was left in place. No commit, push, or deploy was performed.

---

## Summary

Phase B turns the compact SPA into a phone-oriented product shell: bottom navigation, a live-data mobile dashboard, redesigned IT/GST cards, card-based summaries, and a mobile import/export sheet — while desktop tables, Sheet View, sidebar, and brand tokens stay intact at `lg+`.
