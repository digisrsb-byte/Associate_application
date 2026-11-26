# Login Page — Responsive Correction (Mobile Centered + Desktop Restored)

**Date:** 2026-11-25  
**File:** `src/components/LoginPage.tsx`  
**Breakpoint:** `useIsCompactLayout()` → `(max-width: 1023px)` (Tailwind `lg` = 1024px)  
**Logo asset:** `public/srsb-logo.jpg`

## Layout split

Authentication handlers, modes, validation, APIs, session handling, and forgot/reset/bootstrap flows are **unchanged**. Only JSX/layout branches by viewport.

### Mobile / tablet (`< 1024px`) — approved centered corporate login

Kept exactly as approved:

1. Soft app-background (`--bg`) with light navy wash — no marketing hero mesh  
2. Vertically and horizontally centered composition  
3. White card (`max-w-[400px]`) with border, soft shadow, rounded corners  
4. Content order: SRSB logo (`alt="SRSB Associate"`) → **ASSOCIATE** wordmark → Welcome heading → fields → **Sign In** → Remember Me / Forgot Password  
5. Safe-area padding and existing compact spacing  

### Desktop (`>= 1024px`) — original two-column login (restored from pre-centered HEAD)

Selectively restored from git HEAD (not a full-file revert):

1. Navy mesh / floating-orb backdrop  
2. Two-column composition: left Welcome/marketing hero + right large white form  
3. Hero: logo mark (`alt="SRSB"`), Welcome **back.**, Associate wordmark, tags, Sparkles chip  
4. Form: Sign in heading, fields, Remember me / Forgot **above** submit, animated **Sign in →** button  
5. Original desktop spacing, sizing, and visual hierarchy  

## Responsive notes

| Width | Layout |
| --- | --- |
| 360–430px | Centered mobile card |
| 768px | Centered mobile card (same compact branch) |
| 1024px | Original two-column desktop |
| 1280 / 1440px | Original two-column desktop |

Transition at 1024px via a single `isCompact` branch (one form tree at a time — no duplicate `#login-email` / `#login-password` IDs).

## Verification

| Check | Result |
| --- | --- |
| `npm run build` | **Pass** |
| `npm run test:unit` | **Pass** — 165 passed, 2 skipped |
| Viewport 390 | **Pass** — centered card, Sign In (Playwright + screenshot) |
| Viewport 768 | **Pass** — centered compact layout |
| Viewport 1024 / 1280 / 1440 | **Pass** — two-column desktop, Sign in → |
| Phase C login composition e2e | **Pass** — 2/2 |
| Auth / backend / ledger | Not modified |
| Commit / push / deploy | Not performed |

E2E helpers accept both CTAs (`Sign In` and `Sign in →`). Screenshots: `docs/phase-c-screenshots/login-*.png`.
