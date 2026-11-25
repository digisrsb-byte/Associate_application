# Phase 8B.1 — Production Node.js Start Path

**Date:** 2026-11-25  
**Scope:** Reliable production start for the ASSOCIATE Express SPA+API monolith  
**Out of scope:** PostgreSQL cutover, migrations, auth/business changes, UI, deploy, commit

---

## Root cause

`"start": "node server.ts"` was unreliable because:

1. The entrypoint is TypeScript (`server.ts`) with `.ts` imports (`allowImportingTsExtensions`).
2. Plain Node does not execute that graph.
3. The working local runner (`tsx`) lived only in **devDependencies**, so it would be missing after `npm ci --omit=dev`.
4. `tsconfig.json` has `"noEmit": true`, so `tsc` was never a production emit path.

---

## Chosen execution strategy

**Build-time esbuild bundle → plain Node start**

| Step | Command | Purpose |
| --- | --- | --- |
| SPA build | `vite build` | Emits `dist/` |
| Server build | `node scripts/build-server.mjs` | Bundles `server.ts` + local TS modules → `server.mjs` (npm packages external) |
| Production start | `node scripts/start-production.mjs` | Forces `NODE_ENV=production`, refuses missing artifacts / non-production `NODE_ENV`, runs `node server.mjs` |
| Development | `npm run dev` → `tsx server.ts` | Unchanged Vite middleware workflow |

Why this strategy (vs keeping `tsx` in dependencies):

- Production start uses only Node + runtime packages after `npm ci --omit=dev`.
- No silent Vite/dev fallback: start script and server both fail closed without `dist/index.html` when `NODE_ENV=production`.
- `server.mjs` stays at project root so existing `__dirname`-relative `data/` and `dist/` paths remain correct.

---

## Files changed

| File | Change |
| --- | --- |
| `package.json` | `build` / `start` / `clean` / `build:server`; runtime vs build dependency split; `esbuild` ^0.28 |
| `package-lock.json` | Regenerated for dependency split + esbuild bump |
| `scripts/build-server.mjs` | **New** — esbuild production server bundle |
| `scripts/start-production.mjs` | **New** — production start guard + spawn |
| `scripts/phase8b1-smoke-http.mjs` | **New** — health/SPA/asset smoke helper |
| `server.ts` | Production static path: exit if `dist/index.html` missing (no auth/API logic changes) |
| `.gitignore` | Ignore `server.mjs` / `server.mjs.map` |

**Not changed:** auth handlers, business backends/defaults, UI, DB config, `.env`, migrations.

---

## Dependency split (for `npm ci --omit=dev`)

**Runtime `dependencies`:** `dotenv`, `exceljs`, `express`, `pg`

**Build/dev moved to `devDependencies`:** `vite`, React stack, Tailwind/Vite plugins, `tsx`, `esbuild`, test/Electron tooling, etc.

Production hosts: `npm ci` (full) → `npm run build` → deploy `dist/` + `server.mjs` + lockfile → `npm ci --omit=dev` → `npm start`.

---

## Build results

| Check | Result |
| --- | --- |
| `npm run build` | **Pass** — Vite SPA + `server.mjs` (~169 KB) |
| `npm run test:unit` | **Pass** — 165 passed, **2 skipped** |

### Skipped unit tests

Both skips are existing Windows platform skips in `tests/unit/backupCrypto.test.ts` (`it.skipIf(isWin)` chmod-related cases). Not introduced by 8B.1. PostgreSQL suites were **not** run (no DB connection per safety rules).

---

## Production start verification

| Check | Result |
| --- | --- |
| `npm start` (PORT=3911, isolated `DATA_DIR`) | **Pass** — listens; `[auth] backend=json`, `[business] backend=json` |
| `GET /api/health` | **Pass** — `200` `{"status":"ok"}` |
| `GET /` SPA | **Pass** — `200`, root mount present |
| Client route fallback | **Pass** — `/some-client-route` → SPA `index.html` |
| Static JS asset | **Pass** — `/assets/*.js` `200` |
| `NODE_ENV=development npm start` | **Pass** — refused (exit 1), points to `npm run dev` |

---

## Production-only dependency verification

Isolated directory under `%TEMP%\phase8b1-omit-dev` with copied `package.json`, `package-lock.json`, `server.mjs`, `dist/`, `scripts/`:

| Check | Result |
| --- | --- |
| `npm ci --omit=dev` | **Pass** (258 packages) |
| `tsx` / `esbuild` / `vite` present | **False** (omitted) |
| `express` / `pg` / `dotenv` / `exceljs` present | **True** |
| `npm start` on PORT=3912 | **Pass** |
| Health + SPA + asset smoke | **Pass** (`SMOKE_OK`) |

---

## Remaining blockers (not in 8B.1)

From Phase 8A — still open for later 8B slices:

- PostgreSQL production cutover / remote migrate path  
- Two-owner production provisioning  
- Hosted HTTPS + cookie/proxy hardening ops  
- Password-reset channel without filesystem token files  
- Managed DB backup/restore for Postgres SoR  

---

## How to run (operators)

```bash
npm ci
npm run build
npm ci --omit=dev          # production image / host install
set HOST=127.0.0.1         # or private bind behind proxy
set PORT=3000
npm start                  # forces NODE_ENV=production
```

Local development remains:

```bash
npm run dev
```

---

## Stop line

Phase **8B.1 complete**. Phase **8B.2 not started**.
