# Phase 8D.1-Fix — All Data Screen Flickering Audit

**Date:** 2026-11-25  
**Mode:** Read-only investigation (no code, data, or config changes)  
**Symptom:** After login, UI becomes unstable (shaking / flickering / continuous shifting), especially on **All Data**.

**Browser console:** Not captured in this audit (dev server log only). React warnings were not observed in the terminal stream.

---

## Verdict

**Most likely product cause (code-backed):** continuous Framer Motion on the post-login **All Data chrome** (especially `TopSummaryCards` infinite icon rotation + enter animations), combined with **nested scroll containers and sticky table columns** that amplify any layout or compositor jitter—most visible on All Data.

**No evidence** of an API polling loop or a classic `useEffect` → `setState` infinite update cycle that re-fetches the ledger.

**Environmental confounder (this workspace today):** the running Vite session logged **dozens of `hmr update /src/index.css`** events. Full-style HMR while logged in can itself look like whole-app flicker and must be ruled out with a quiet `npm run build` + `npm start` (or a reload with no agents editing CSS) before treating the bug as production-blocking.

---

## 1. Scope — All Data only vs whole post-login shell?

| Surface | Shares risk factors? | Notes |
| --- | --- | --- |
| **IT/GST All Data** | **Highest** | Top summary KPI row (`lg+`) + search + Simple/Sheet tables (sticky + `overflow-x-auto`) or mobile card lists |
| Client / Company Summary | High chrome overlap | Same `TopSummaryCards` block when `activeTab !== 'year-summary'` |
| Mobile Summary | Medium | Compact lists; less sticky spreadsheet |
| Dashboard (`year-summary`) | Different path | No All Data `TopSummaryCards` strip; has its own motion/`CountUp` RAF (finite) |
| Login | Separate | Many infinite background motions; not the post-login shell |

**Conclusion:** Instability is **not proven exclusive to All Data**, but All Data concentrates the worst combination (KPI motion + wide/sticky tables + nested scroll). Dashboard uses a different tree; login uses a different screen entirely.

---

## 2. What was ruled out

| Hypothesis | Finding |
| --- | --- |
| Ledger polling / `setInterval` refresh | **Not found.** `fetchLedger` runs when `authStatus === 'loggedIn'` (`App.tsx`); no interval/subscription re-fetch |
| Auth/`useEffect` infinite login loop | Session check is mount-once (`[]`); login success sets status once |
| Year-selector `useEffect` hard loop | `SimpleClientTable` / `ContinuousSheetTable` only call `setSelectedYear` when selection is missing/invalid; stable years → no continuous updates |
| Network thrash from `apiFetch` | Helper is plain `fetch`; no retry storm in client helpers |

---

## 3. Root-cause analysis (ranked)

### Rank 1 — Continuous motion on All Data chrome (strong)

**Evidence**

- `App.tsx` renders `TopSummaryCards` for every non-dashboard tab, including All Data (`activeTab !== 'year-summary'`, desktop `lg+`).
- `TopSummaryCards.tsx` runs an **infinite** Framer Motion rotation on the received KPI icon:

```78:82:src/components/TopSummaryCards.tsx
          <motion.div
            className="p-2 rounded-lg bg-white/15 text-[var(--gold)] shrink-0"
            animate={{ rotate: [0, -8, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
```

- Same component also plays entrance `staggerContainer` / `cardPop` springs and animates progress bar **width** on show.
- `App.tsx` wraps the main view in `AnimatePresence` + `PageFade` (`fadeScale` opacity/scale) whenever `viewKey` changes; All Data also uses a `motion.header` with `y` enter animation.
- Global `prefers-reduced-motion` CSS in `index.css` disables `.sticker-float` / `.motion-lift` / login descendants, but **does not disable Framer Motion** infinite animations.

**Why it feels like “shaking” on All Data:** the KPI strip sits above the table; continuous transform + springy card motion draws the eye and can make the whole column feel unstable even when the table data is static.

### Rank 2 — Nested scroll + sticky columns (strong amplifier on All Data)

**Evidence**

- Shell: outer `h-dvh` + `overflow-hidden`; `main` is `overflow-y-auto` (`App.tsx`).
- All Data simple tables: inner `overflow-x-auto ledger-scroll` (`SimpleClientTable.tsx` / `GstSimpleTable.tsx`).
- Sheet view: multiple `sticky left-0` / `sticky right-*` cells (`ContinuousSheetTable.tsx` / `GstSheetTable.tsx`) inside horizontal scroll.

**Why it matters:** sticky + dual-axis overflow is a common source of subpixel “jitter” and scrollbar-driven layout shifts when content height is near the viewport. This matches “particularly All Data” better than Dashboard.

### Rank 3 — Compact breakpoint remount near `lg` (conditional)

**Evidence**

- `useIsCompactLayout()` → `(max-width: 1023px)`.
- All Data swaps entire table ↔ `ItClientMobileList` / `GstCompanyMobileList` when compact flips (`SimpleClientTable.tsx` / `GstSimpleTable.tsx`).

**When it becomes a loop:** viewport width hovering around 1024px (windowed mode, zoom, docking). Each flip remounts the list → enter animations replay → perceived flicker. Less likely on a stable full HD maximized window.

### Rank 4 — Dev HMR noise (session confounder)

**Evidence (terminal for `npm run dev`):** repeated `hmr update /src/index.css` throughout the morning (20+ times). Style HMR while staying logged in re-paints the shell and can look like continuous flicker unrelated to All Data logic.

### Rank 5 — Unlikely primary

- Toast timer (3.2s one-shot).  
- Clipboard copy timers.  
- Dashboard `CountUp` RAF (dashboard-only, finite duration).  
- No browser console dump available to confirm React strict-mode double-invoke as a user-visible loop.

---

## 4. Affected files (read-only references)

| File | Role in theory |
| --- | --- |
| `src/App.tsx` | Post-login shell; All Data chrome; `PageFade` / `motion.header`; ledger fetch once on login |
| `src/components/TopSummaryCards.tsx` | Infinite KPI icon rotation + bar width motion |
| `src/components/MotionBits.tsx` / `src/motion/presets.ts` | `PageFade` scale variants; springs |
| `src/components/SimpleClientTable.tsx` | All Data simple view; compact swap; `ledger-scroll` |
| `src/components/GstSimpleTable.tsx` | GST All Data counterpart |
| `src/components/ContinuousSheetTable.tsx` | Sheet sticky columns |
| `src/components/GstSheetTable.tsx` | GST sheet sticky columns |
| `src/hooks/useMediaQuery.ts` | Compact breakpoint |
| `src/index.css` | Scrollbar styling; reduced-motion incomplete vs Framer |

---

## 5. Safest proposed fix (do not implement until approved)

Order from lowest risk / highest leverage:

1. **Stop infinite transform on KPI chrome**  
   - Remove `repeat: Infinity` rotate (or run once / only on hover).  
   - Honor `prefers-reduced-motion` in Framer (`useReducedMotion()` → static icons).

2. **Reduce remount “punch” on All Data**  
   - After first paint, avoid replaying large `initial` animations on `TopSummaryCards` / `PageFade` for the same view (e.g. `initial={false}` once shown, or animate only on real tab changes).

3. **Stabilize scroll layout**  
   - Consider `scrollbar-gutter: stable` on `main`.  
   - Keep sticky sheet columns; verify no width oscillation at `lg` boundary (optional hysteresis in `useIsCompactLayout`, e.g. different on/off breakpoints).

4. **Verify outside HMR**  
   - Reproduce on a production build (`npm run build` + `npm start`) with DevTools Performance: confirm no repeating React commits / network to `/api/ledger`.

5. **Out of scope for this fix**  
   - No business-rule, API, or data changes.  
   - No deletion of 8C.3 drill databases.

---

## 6. Suggested reproduction matrix (for fix phase)

| Case | Setup | What to watch |
| --- | --- | --- |
| A | Prod build, 1440×900, IT All Data Simple | Continuous motion without mouse |
| B | Same, Sheet View | Sticky column jitter while idle / light scroll |
| C | Width drag across 1024px | Table ↔ mobile list remount flicker |
| D | `prefers-reduced-motion: reduce` | Whether shake stops (Framer may still run today) |
| E | Quiet HMR vs active CSS HMR | Confounder check |

---

## Stop line

Phase **8D.1-Fix investigation** complete — audit only.  

**Leading root cause:** continuous Framer Motion on All Data KPI chrome + nested/sticky table scrolling (HMR as possible local confounder).  

**No implementation performed. Awaiting approval before any fix.**
