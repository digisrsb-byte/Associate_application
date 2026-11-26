# Mobile UI Responsiveness Audit — IT GST Management Application

**Mode:** READ-ONLY investigation. No application code, APIs, auth, or business data were changed.  
**Goal:** Adapt the existing SPA for Android phone viewports **without** a separate app and **without** breaking the desktop UI.  
**Target widths:** 360 · 375 · 390 · 412 · 430 px (all sit below Tailwind `sm` / 640px).  
**Breakpoint note:** Existing layout switches primarily at `sm` (640), `md` (768), `lg` (1024), `xl` (1280). There are **no dedicated phone media queries** for 360–430px.

---

## Executive summary

The app already has a **partial mobile shell**: sticky `MobileHeader`, off-canvas `Sidebar` below `lg`, stacking summary cards, and some column-hiding on summary tables. It is **not yet phone-usable** for core IT/GST ledger work.

Highest risk areas on 360–430px:

1. **Sheet View** tables (IT + GST) with sticky left + multiple sticky right columns and large `min-w-*` cells.  
2. **Simple View** wide multi-column tables and nested inline filing editors.  
3. **Client / Mobile / Company summary** tables with `min-w-[1100px]`–`[1200px]`.  
4. **Touch gaps:** hover-only affordances (`group-hover` action menus, dashboard hover tips), sub-40px controls.  
5. **Dense modals** (`FilingQuickModal` 3-column money grid; Import wizard inside `max-h-[90vh]`).

Desktop experience can be preserved by gating phone layouts behind `<lg` / new `max-sm` patterns and keeping current desktop classes as defaults.

---

## 1. Pages / surfaces inspected

| # | Surface | Primary files |
| --- | --- | --- |
| 1 | App shell / routing of views | `App.tsx` |
| 2 | Auth / login / bootstrap / reset | `LoginPage.tsx` |
| 3 | Navigation | `Sidebar.tsx` (`Sidebar`, `MobileHeader`) |
| 4 | Dashboard (overall) | `OverallDashboard.tsx`, `UnifiedDashboard.tsx` |
| 5 | IT / GST year & GST dashboards | `YearSummaryView.tsx`, `GstDashboardView.tsx` |
| 6 | Top KPI cards | `TopSummaryCards.tsx` |
| 7 | IT All Data — Simple | `SimpleClientTable.tsx` |
| 8 | IT All Data — Sheet | `ContinuousSheetTable.tsx` |
| 9 | GST All Data — Simple / Sheet | `GstSimpleTable.tsx`, `GstSheetTable.tsx` |
| 10 | IT Client Summary | `ClientSummaryView.tsx` |
| 11 | IT Mobile Summary | `MobileSummaryView.tsx` |
| 12 | GST Company Summary | `GstSummaryViews.tsx` |
| 13 | Assessment years / GST periods | `PeriodNavigator.tsx`, `GstYearSelector.tsx`, year menus in toolbars |
| 14 | Filing / payment quick edit | `FilingQuickModal.tsx`, `GstFilingQuickModal.tsx` |
| 15 | Client / company create & edit | `ClientModal.tsx`, `GstCompanyModal.tsx`, `ClientEditDrawer.tsx`, `GstCompanyEditDrawer.tsx` |
| 16 | Reports / charts / explorers | `SummaryExplorer.tsx`, `MultiSeriesLineChart.tsx`, `DashboardHoverTip.tsx`, `DashboardStatsChrome.tsx` |
| 17 | Import / export | `DataTransferModal.tsx`, `ExcelImportWizard.tsx` |
| 18 | Shared chrome | `MotionModalShell.tsx`, `DrawerShell.tsx`, `ModalFormFooter.tsx`, `SheetTableToolbar.tsx`, `LimeSelect.tsx`, `PortalPasswordCell.tsx`, `CompanyRowMenu.tsx` |
| 19 | Design tokens / global CSS | `index.css`, `index.html` viewport meta |

No separate Settings page exists; logout / import-export live in the sidebar.

---

## 2. Current mobile responsiveness (what already works)

| Area | Current behavior |
| --- | --- |
| Viewport meta | Present in `index.html` (`width=device-width, initial-scale=1`) |
| Shell | `flex-col` below `lg`; `lg:flex-row` desktop sidebar + main |
| Mobile nav | `MobileHeader` (`lg:hidden`) + overlay drawer sidebar when `mobileOpen` |
| Desktop nav | Fixed `w-[216px]` sidebar `hidden lg:flex` — desktop preserved |
| Main padding | `px-3` on small screens; `min-w-0` on main prevents some flex blowouts |
| KPI strip | `TopSummaryCards`: `grid-cols-1` → `md:grid-cols-3` |
| Search / view toggle | Stacks `flex-col` → `sm:flex-row` on All Data |
| Login | Brand panel + form; form usable full-width on phone; large inputs (~`py-4`) |
| Drawers | `DrawerShell`: `w-full max-w-md` — acceptable full-bleed on phones |
| Some summary columns | Hidden via `hidden sm:table-cell` / `hidden lg:table-cell` |
| Charts | `MultiSeriesLineChart` uses responsive SVG height `h-[168px] sm:h-[180px]` |
| Tokens | CSS variables in `index.css`; no phone-specific token overrides |
| Media queries in CSS | Only `prefers-color-scheme: dark` and `prefers-reduced-motion` — **not** width-based |

**Verdict:** Shell/login are partially ready. **Data-dense ledgers are desktop-first** and rely on horizontal scroll.

---

## 3. Problems by page (360–430px)

Severity: **P0** blocks core tasks · **P1** major friction · **P2** polish / accessibility.

### 3.1 Authentication (`LoginPage.tsx`) — mostly OK

| Issue | Sev | Notes |
| --- | --- | --- |
| Long marketing copy + large `text-4xl` heading | P2 | Usable but consumes vertical space before form |
| Tag chips / left brand panel | P2 | Layout adapts; fine on phone |
| Safe-area / keyboard overlap | P1 | No `env(safe-area-inset-*)`; soft keyboard may cover submit on short phones |

### 3.2 Navigation (`Sidebar` / `MobileHeader`) — partial

| Issue | Sev | Notes |
| --- | --- | --- |
| Drawer width fixed `216px` | P2 | OK overlay; leaves ~144px backdrop on 360px |
| Close (X) hit area ~24–28px | P1 | Below ~44px recommended touch target |
| Menu button `p-1.5` / icons `w-4` | P1 | Small touch targets |
| Add CTA hides label below `sm` | P2 | Icon-only “+” on 360–430; ambiguity for GST “Add Company” |
| No bottom tab bar | P1 | Deep IT/GST paths require opening drawer each time |
| Footer actions (Import/Export, CSV, Logout) only in drawer | P1 | Easy to miss on phone |

### 3.3 Dashboard (`OverallDashboard`, `UnifiedDashboard`, year/GST dashboards) — mixed

| Issue | Sev | Notes |
| --- | --- | --- |
| Complex `md:`/`xl:` grids collapse to 1 col | — | Stacking works |
| Billing / GST SVG charts fixed visual density | P1 | Readable but tip overlays are hover-oriented |
| `DashboardHoverTip` mouse hover | P0/P1 | Touch users get little/no chart detail |
| Nested table `min-w-[640px]` in IT block | P1 | Forces horizontal scroll inside dashboard card |
| Expand rows with `grid-cols-[1.2fr_1fr_1fr_1fr_90px]` | P1 | Overflows narrow screens |
| Action buttons in hero may wrap tightly | P2 | Check tap spacing |

### 3.4 Top summary cards — OK

Stacks to one column below `md`. Currency `text-xl` acceptable. Minor: three stacked cards push content far down (P2).

### 3.5 IT All Data — Simple View (`SimpleClientTable`) — poor

| Issue | Sev | Notes |
| --- | --- | --- |
| ~11 columns, no phone card layout | P0 | Heavy `overflow-x-auto`; primary workflow is sideways scrolling |
| Nested filing editor many fixed widths (`w-[88px]`…`w-[114px]`) | P0 | Inline edit nearly unusable at 360px without zoom/scroll |
| Expand / copy / reveal controls `p-0.5` | P0 | Far below touch size |
| Password cell truncated `max-w-[82px]` | P1 | Reveal/copy tiny |
| Toolbar year navigator + filters | P1 | Likely wraps; period controls compete with horizontal table scroll |

### 3.6 IT All Data — Sheet View (`ContinuousSheetTable`) — critical

| Issue | Sev | Notes |
| --- | --- | --- |
| Sticky left name + sticky right totals (`right-[188px]`, `right-[82px]`, `right-0`) | P0 | On 360px, sticky gutters consume most width; center months unusable |
| Per-month `min-w-[152px]` × N years | P0 | Table width grows with assessment years |
| Identity columns `min-w-[105px]`–`[155px]` | P0 | Compounds sticky problem |
| Year picker dropdown `w-[168px]` | P2 | OK |
| Empty-state / add flows | P2 | Generally fine |

**Same class of issues:** `GstSheetTable.tsx` (GST months instead of AYs).

### 3.7 GST All Data — Simple (`GstSimpleTable`) — poor

Same pattern as IT simple table: wide columns, expand-in-place filings, small icon buttons (P0/P1).

### 3.8 Assessment years / GST periods

| Issue | Sev | Notes |
| --- | --- | --- |
| Period chips / selectors in toolbars | P1 | Horizontal chip rows need scroll or compact select on phone |
| `GstYearSelector` / period menus | P1 | Ensure full-width selects on `<sm` |

### 3.9 IT Client Summary (`ClientSummaryView`) — poor

| Issue | Sev | Notes |
| --- | --- | --- |
| `min-w-[1100px]` | P0 | Always horizontal scroll on phones |
| Column hiding helps but sticky name + remaining cols still wide | P1 | |
| Nested detail tables | P1 | Extra scroll contexts |

### 3.10 IT Mobile Summary (`MobileSummaryView`) — poor

| Issue | Sev | Notes |
| --- | --- | --- |
| `min-w-[1200px]` | P0 | Worst-case scroll width among summaries |
| Partial `sm`/`lg` column hiding | P1 | Still not a phone-first layout |

### 3.11 GST Company Summary (`GstSummaryViews`) — poor

| Issue | Sev | Notes |
| --- | --- | --- |
| `min-w-[1100px]` | P0 | Same as IT client summary |
| Month matrix density | P0 | Desktop spreadsheet metaphor |

### 3.12 Filing / payment modals

| Issue | Sev | Notes |
| --- | --- | --- |
| `FilingQuickModal` `grid-cols-2` dates + `grid-cols-3` fees/received/balance | P0 | Three money fields side-by-side ~100px each on 360px |
| Footer buttons `text-xs` / modest padding | P1 | Tight thumb targets |
| Long client name in header | P2 | May truncate awkwardly |
| `GstFilingQuickModal` similar density | P0/P1 | |

### 3.13 Client / company create & edit

| Issue | Sev | Notes |
| --- | --- | --- |
| `ClientModal` / `GstCompanyModal` via `MotionModalShell` | P1 | `overflow-y-auto` on overlay helps; body with filing grids (`grid-cols-2 sm:grid-cols-3`) still dense |
| Drawers full-width on phone | — | Good pattern to prefer on mobile over large modals |
| Modal close control small | P1 | |

### 3.14 Reports / charts

Covered under dashboard. Hover tips and dense tables are the main phone blockers. Line charts generally scale.

### 3.15 Import / export (`DataTransferModal`, `ExcelImportWizard`)

| Issue | Sev | Notes |
| --- | --- | --- |
| Modal `max-w-3xl max-h-[90vh]` | P1 | Wizard steps + mapping lists cramped; need internal scroll (partially present) |
| Mapping UI `sm:flex-row` with `sm:w-44` labels | P2 | Stacks on phone — OK |
| Preview `grid-cols-2` stats | P2 | Tight but readable |
| File picker / drag-drop | P1 | Drag-drop irrelevant on Android; ensure tap “Choose .xlsx” is prominent |
| Step chip strip | P1 | Many steps wrap; consider compact step indicator |

### 3.16 Cross-cutting desktop assumptions

| Assumption | Impact |
| --- | --- |
| Hover for discovery (`group-hover:opacity-100` on row actions) | Actions invisible until awkward long-press equivalent |
| Horizontal scroll as primary adaptation | Acceptable for rare reports; unacceptable for daily All Data editing |
| Sticky multi-column spreadsheet | Breaks on narrow CSS viewports |
| `min-h-8` (32px) as “minimum” | Below 44×44px touch guideline |
| Tailwind `sm` = phone | **False** for 360–430; phones never get `sm:` enhancements |
| Electron desktop shell | Out of scope for Android browser/WebView; same SPA CSS applies if wrapped later |

---

## 4. Shared components needing responsive work

| Component | Recommended change theme |
| --- | --- |
| `Sidebar` / `MobileHeader` | Larger hit targets; optional bottom nav; always-visible add label or icon+aria |
| `SheetTableToolbar` / `SimpleTableToolbar` | Compact vertical stack; sticky toolbar; full-width period control |
| `ContinuousSheetTable` / `GstSheetTable` | **Do not use as-is on `<lg`** — switch to card/list or simplified column set |
| `SimpleClientTable` / `GstSimpleTable` | Card list + dedicated filing screen/drawer on phone |
| `ClientSummaryView` / `MobileSummaryView` / `GstSummaryViews` | Card or accordion; drop `min-w-[1100px]+` on phone |
| `FilingQuickModal` / `GstFilingQuickModal` | Single-column fields below `sm`; larger footers |
| `MotionModalShell` / `ModalFormFooter` | Full-bleed sheet on phone; 44px actions |
| `DrawerShell` | Keep; add safe-area padding |
| `PortalPasswordCell` / copy buttons | Larger tap targets; don’t rely on hover |
| `CompanyRowMenu` | Always-visible kebab; no `group-hover` opacity |
| `DashboardHoverTip` | Tap-to-pin / bottom sheet details |
| `PeriodNavigator` / `LimeSelect` | Full-width on `<sm` |
| `DataTransferModal` / `ExcelImportWizard` | Phone sheet layout; step progress condensed |
| `index.css` | Optional `@media (max-width: 430px)` utilities; safe-area helpers |

---

## 5. Recommended mobile navigation

**Keep** desktop sidebar unchanged at `lg+`.

**For `<lg` (phones + small tablets):**

1. Retain top `MobileHeader` (menu + context + primary Add).  
2. Add a **bottom tab bar** (thumb zone), e.g.:  
   - Dashboard  
   - IT  
   - GST  
   - More (Import/Export, CSV, Logout, account email)  
3. Within IT/GST, use a **segmented control** or secondary chips for: All Data · Summary · (Mobile Summary for IT).  
4. Default All Data on phone to **Simple / card mode**; hide or gate Sheet View behind “Desktop layout” or `lg+` only.  
5. Prefer **drawers / full-screen sheets** for edit & filing instead of centered dense modals.

This preserves branding colors (`--navy-900`, `--gold`) and avoids a separate Android codebase.

---

## 6. Recommended mobile table and form behavior

### Tables

| Desktop pattern | Phone pattern (`max-width: 639px` or `<lg`) |
| --- | --- |
| Sheet matrix | **Disable or replace** with: client/company list → tap → period list → tap → filing editor |
| Simple wide table | **Card list**: name, id (PAN/User), outstanding, chevron; expand or navigate for filings |
| Summary `min-w-[1100px]` | Stacked **metric cards** per entity + optional “View as table” horizontal scroll |
| Sticky multi-side columns | Avoid; if table kept, sticky **one** leading column only |
| Inline multi-field editors | Move to `FilingQuickModal` / drawer in single column |

Horizontal scroll may remain as an **escape hatch** for power users, not the default.

### Forms

| Desktop | Phone |
| --- | --- |
| `grid-cols-2` / `grid-cols-3` | `grid-cols-1` below `sm` |
| `py-2` / `text-xs` controls | Prefer `min-h-11` (44px), `text-sm` |
| Modal filing grids | Full-width stacked labels |
| Import mapping | Already stacks; enlarge selects and primary buttons |

### Touch

- Minimum ~44×44px for icon buttons (menu, copy, reveal, row kebab).  
- Replace hover-only visibility with always-visible overflow menus.  
- Support tap on chart segments instead of hover tips.

---

## 7. Prioritized implementation plan

### Phase A — Unblock daily use (P0)

1. **Phone list mode for IT/GST All Data** (card rows) behind `<lg`, keep existing tables for `lg+`.  
2. **Gate Sheet View** on `<lg` (message + switch to list, or hide tab).  
3. **Single-column Filing / GST filing modals** below `sm`.  
4. **Always-visible row actions** (remove hover-only opacity).  
5. **Enlarge critical header/nav hit targets**.

### Phase B — Summaries & dashboard (P1)

6. Responsive Client / Mobile / Company summaries without forced 1100px+ width.  
7. Dashboard nested tables → cards or simplified lists on phone.  
8. Tap-friendly chart details (replace hover tips).  
9. Bottom navigation + clearer IT/GST section switching.  
10. Import/export modal as full-height sheet on phone; emphasize file button over drag-drop.

### Phase C — Polish (P2)

11. Safe-area insets; keyboard-aware login scroll.  
12. Consistent `text-sm` form typography on phone.  
13. Compact step indicator for Excel wizard.  
14. Visual QA at 360 / 375 / 390 / 412 / 430 (+ landscape).  
15. Optional `prefers-reduced-motion` already present — verify new transitions respect it.

**Testing approach (later implementation):** browser DevTools device mode + real Android Chrome; no API/schema changes; screenshot diffs desktop `lg` vs phone to prove desktop unchanged.

---

## 8. Files likely to require modification (implementation later)

**Must touch for Phase A**

- `src/App.tsx` — view switching / hide sheet on small screens  
- `src/components/SimpleClientTable.tsx`  
- `src/components/GstSimpleTable.tsx`  
- `src/components/ContinuousSheetTable.tsx`  
- `src/components/GstSheetTable.tsx`  
- `src/components/FilingQuickModal.tsx`  
- `src/components/GstFilingQuickModal.tsx`  
- `src/components/CompanyRowMenu.tsx`  
- `src/components/Sidebar.tsx` (`MobileHeader` targets)  
- Possibly new: `src/components/mobile/*` list/card components (reuse data hooks/props)

**Phase B**

- `ClientSummaryView.tsx`, `MobileSummaryView.tsx`, `GstSummaryViews.tsx`  
- `OverallDashboard.tsx`, `DashboardHoverTip.tsx`  
- `DataTransferModal.tsx`, `ExcelImportWizard.tsx`  
- `SheetTableToolbar.tsx`, `PeriodNavigator.tsx`  
- `src/index.css` (safe-area / optional phone utilities)

**Shared shells**

- `MotionModalShell.tsx`, `ModalFormFooter.tsx`, `DrawerShell.tsx`, `PortalPasswordCell.tsx`

**Likely unchanged (good)**

- Backend, auth, ledger types, Electron shell, import engine, PostgreSQL paths  
- Design token **values** (keep brand colors/fonts; only apply layout/spacing variants)

---

## 9. Risks to the existing desktop interface

| Risk | Mitigation |
| --- | --- |
| Regressing desktop table density | Use mobile-only branches (`max-lg:`, `max-sm:`) ; never rewrite desktop markup in place without `lg:` defaults |
| Breaking sticky sheet math | Leave sheet tables untouched at `lg+`; alternate UI only below breakpoint |
| Accidental global CSS | Prefer Tailwind responsive variants over broad element selectors |
| Touch CSS affecting mouse UX | Prefer `@media (hover: hover) and (pointer: fine)` for hover-only enhancements |
| Bottom nav overlapping content | Add `padding-bottom` on `<main>` only when bottom nav visible |
| Dual maintenance of table + cards | Share row data mappers; presentational split only |
| QA gap | Checklist: desktop 1280/1440 + each target phone width before merge |

---

## 10. Out of scope (confirmed)

- Separate Android/React Native/Electron-Android app  
- Backend, auth, database, or business-logic changes  
- Mock production business data  
- Implementing the responsive changes in this audit task  

---

## 11. Conclusion

The ASSOCIATE SPA is **desktop-ledger-first** with a **starter mobile chrome**. At 360–430px, authentication and high-level navigation can work with polish, but **IT/GST All Data (especially Sheet View), summaries, and filing editors are not fit for primary phone use**.

A responsive adaptation that **reuses components and tokens**, **gates spreadsheet layouts behind `lg+`**, and introduces **card/list + drawer editing on phones** is the lowest-risk path to Android usability without a second application and without harming the existing desktop UI.

**Next step (when authorized):** implement Phase A only, with visual regression checks on desktop `lg+`.
