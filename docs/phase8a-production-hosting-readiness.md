# Phase 8A — Production Hosting Readiness Audit

**Date:** 2026-11-25  
**Application:** ASSOCIATE IT & GST Filing Ledger (`associate-it-gst-ledger` v0.7.0)  
**Scope:** Strictly read-only audit — no code changes, no migrations, no production DB connections, no deploy, no secrets disclosed  
**Business target:** Two owners · separate logins · **shared** business data · HTTPS in Chrome (laptop + phone) · PostgreSQL · encrypted backups · reliable recovery · no EXE required

---

## Executive verdict

| Question | Answer |
| --- | --- |
| Can both owners use Chrome over HTTPS without installing an EXE? | **Architecturally yes** once the Express SPA+API is hosted behind TLS. Electron is optional. |
| Is the app production-hosting ready today? | **No.** Default runtime is still local JSON; Postgres is implemented but not cut over; several ops/security gaps remain. |
| Overall classification | **PARTIALLY READY** — strong application foundations; **BLOCKED** for go-live until Phase 8B hosting/cutover work. |

---

## 1. Current architecture

```text
┌─────────────┐  ┌─────────────┐  ┌──────────────┐
│ Owner A     │  │ Owner B     │  │ Optional     │
│ Chrome      │  │ Chrome      │  │ Electron     │
│ (laptop/phone)│ │ (laptop/phone)│ │ thin client │
└──────┬──────┘  └──────┬──────┘  └──────┬───────┘
       │ HTTPS (target)  │               │ HTTPS only when packaged
       └────────┬────────┘───────────────┘
                ▼
     ┌──────────────────────────┐
     │ Single Node process      │
     │ Express (server.ts)      │
     │  /api/*  +  SPA (dist/)  │
     └────────────┬─────────────┘
                  │
     ┌────────────┴─────────────┐
     │ DEFAULT today            │ OPTIONAL (env-selected)
     │ AUTH_BACKEND=json        │ AUTH_BACKEND=postgres
     │ BUSINESS_DATA=json       │ BUSINESS_DATA=postgres
     │ data/auth.json           │ users + sessions + org members
     │ data/ledger.json         │ org-scoped IT/GST tables
     │ in-memory sessions       │ DB sessions (token_hash)
     │ encrypted .json.enc      │ JSON backup/restore refused
     │ backups under DATA_DIR   │ (DB backup not in-app)
     └──────────────────────────┘
```

**Key facts (verified in repo):**

- One Node Express process serves API and (in `NODE_ENV=production`) static `dist/` SPA — same-origin by design.
- Dev uses Vite middleware; production expects `vite build` then static serve.
- PostgreSQL schema (`db/migrations/001_foundation.sql`, `002_password_reset_challenges.sql`), auth backend, org-scoped business load/save, conflict retries, and pg-auth tests exist.
- **Default remains JSON.** Production cutover has not been executed (`docs/phase4-business-data.md`, `.env.example`).
- Electron (Phase 7) is a thin HTTPS client only; it does not embed DB/API secrets and is **not** required for Chrome use.

---

## 2. Area-by-area findings

Classification key: **READY** · **PARTIALLY READY** · **BLOCKED** · **NOT IMPLEMENTED**

### 2.1 Node.js application hosting compatibility — PARTIALLY READY

| Item | Status | Evidence / notes |
| --- | --- | --- |
| Runs as standard Express HTTP server | READY | `server.ts` `app.listen(HOST, PORT)` |
| Same-origin SPA + API monolith | READY | Production branch serves `dist/` + `*` → `index.html` |
| Bind address controllable | READY | `HOST` (default `127.0.0.1`); warns on `0.0.0.0` |
| Health probe | READY | `GET /api/health` |
| Production start script | BLOCKED | `package.json` `"start": "node server.ts"` — TypeScript entry; `dev` correctly uses `tsx`. Hosts need `tsx`/compile or a fixed start command before go-live. |
| Runtime dependency footprint | PARTIALLY READY | `vite`, React, Tailwind plugins are in `dependencies` (needed for build; inflate production `npm ci` unless build/omit strategy is defined) |
| Multi-instance / horizontal scale | BLOCKED (JSON) / PARTIALLY READY (Postgres auth) | JSON sessions are in-process `Map`. Postgres sessions are DB-backed. Rate limits remain in-memory. Prefer single Node instance until shared rate-limit store exists. |
| Persistent disk | PARTIALLY READY | JSON mode and reset-token files need durable `DATA_DIR`. Postgres mode still uses `DATA_DIR` for local reset-token files. |

**Hosting compatibility summary:** Suitable for a single always-on Node service behind a reverse proxy **after** start-script and env/cutover work.

---

### 2.2 Production PostgreSQL configuration and connection management — PARTIALLY READY

| Item | Status | Notes |
| --- | --- | --- |
| Schema for orgs, users, sessions, IT/GST | READY | `001_foundation.sql` |
| Password-reset challenge table | READY | `002_password_reset_challenges.sql` |
| Connection pool helper | PARTIALLY READY | `src/db/pool.ts` — `DATABASE_URL` pool; **no SSL / `sslmode` options** configured |
| Fail-closed backend selection | READY | Invalid/missing `AUTH_BACKEND` / `BUSINESS_DATA_BACKEND` / org UUID exits process |
| Migrate / rollback / import scripts | BLOCKED for remote prod | `scripts/db-safety.mjs` **refuses non-localhost** hosts and only allowlists `it_gst_management_dev` / test DB names |
| App default still JSON | BLOCKED for “Postgres is production SoR” | Cutover not performed; JSON remains live default |
| Managed Postgres TLS / private network | NOT IMPLEMENTED in app | Must be enforced by hosting + connection string / pool config in a later phase |
| Least-privilege DB role docs | PARTIALLY READY | Guidance in older hosting docs; no production role provisioning script |

---

### 2.3 Authentication, sessions, cookies, and HTTPS security — PARTIALLY READY

| Item | Status | Notes |
| --- | --- | --- |
| Separate owner logins (Postgres) | READY (code) | `findOwnerByEmail` + `organization_members.role = 'owner'` |
| Separate owner logins (JSON default) | BLOCKED | Single `auth.json` administrator |
| Session cookie `HttpOnly` + `SameSite=Lax` | READY | `tl_session` |
| Cookie `Secure` modes | READY | `COOKIE_SECURE=auto|true|false`; production expects Secure |
| Trust proxy opt-in | READY | `TRUST_PROXY=1` only when set |
| Login rate limiting | READY | IP + account windows (in-memory) |
| Session TTL | READY | 12 hours (`SESSION_TTL_MS`) |
| Login response does not return raw token | READY | Cookie-only session |
| Password reset (Postgres) | PARTIALLY READY | DB challenge store + **local per-email token files** under `DATA_DIR` — **no SMTP** |
| Password reset (hosted phones) | BLOCKED | Owners on phones cannot read server filesystem token files without an operator channel |
| Security headers (Helmet / CSP / HSTS) | NOT IMPLEMENTED | No helmet/CSP in `server.ts` |
| App-level TLS termination | NOT IMPLEMENTED | Expected at reverse proxy / platform edge (`HOSTED_DEPLOYMENT_GUIDE.md`) |
| CORS for split origins | NOT IMPLEMENTED | Fine while SPA+API stay same-origin; would be needed if frontend hosted separately |

---

### 2.4 Required production environment variables (names only) — PARTIALLY READY

Documented / referenced names (values **never** audited or printed):

| Variable | Role | Prod expectation |
| --- | --- | --- |
| `NODE_ENV` | production static SPA path | `production` |
| `HOST` | Listen address | Private bind (e.g. `127.0.0.1`) behind proxy |
| `PORT` | Listen port | Platform-assigned or fixed private port |
| `COOKIE_SECURE` | Cookie Secure flag | `true` (or `auto` with HTTPS + trusted proxy) |
| `TRUST_PROXY` | Honour `X-Forwarded-*` | `1` only behind known proxy |
| `DATA_DIR` | File store (ledger/auth/tokens/backups) | Persistent volume if JSON or reset files needed |
| `PORTAL_PASSWORD_ENCRYPTION_KEY` | AES portal passwords | Required; escrow offline |
| `BACKUP_ENCRYPTION_KEY` or `BACKUP_ENCRYPTION_KEY_FILE` | AES ledger `.json.enc` | Required for JSON backups; escrow offline |
| `DATABASE_URL` | Postgres connection | Required for postgres backends |
| `AUTH_BACKEND` | `json` \| `postgres` | `postgres` for two-owner shared host |
| `AUTH_ORGANIZATION_ID` | Shared org UUID | Required with postgres auth |
| `BUSINESS_DATA_BACKEND` | `json` \| `postgres` | `postgres` for concurrent shared SoR |
| `DB_MIGRATE_CONFIRM` / `DB_ROLLBACK_CONFIRM` / `DB_IMPORT_CONFIRM` / `DB_VERIFY_CONFIRM` | Script safety gates | Ops only; currently localhost-oriented |
| `LEDGER_IMPORT_PATH` / `IMPORT_ORG_NAME` | Frozen import path | Cutover ops |
| `LOGIN_RATE_*` | Optional rate-limit tuning | Optional |
| `E2E_*` / `PG_AUTH_TEST_*` | Test isolation | **Must not** be set in production |

**Gap:** No production secret-manager checklist enforced in code; `.env.example` is the inventory. Presence of real values on any host was **not** inspected in this audit (by design).

---

### 2.5 Shared two-owner workspace architecture — PARTIALLY READY

Business requirement: **two individual logins, same shared business data** (not per-owner data isolation).

| Item | Status | Notes |
| --- | --- | --- |
| Shared organization model | READY | `organizations` + `organization_members` |
| Both owners see same ledger (Postgres) | READY | All business queries scoped to `AUTH_ORGANIZATION_ID` |
| Concurrent edit safety (Postgres) | PARTIALLY READY | Ledger revision + `FOR UPDATE` / advisory lock + retry (`docs/phase4-business-data.md`) |
| Integration tests for two owners | READY | `seedTwoOwnerOrganization` + pg-auth / http business suites |
| Production owner provisioning | NOT IMPLEMENTED | HTTP bootstrap **disabled** when `AUTH_BACKEND=postgres`; only **test** fixtures seed two owners — no operator CLI/runbook for production owner creation |
| Default JSON mode | BLOCKED | Cannot meet two separate owner logins |

---

### 2.6 Backup creation, encryption, retention, restore — PARTIALLY READY (JSON) / BLOCKED (Postgres SoR)

| Item | Status | Notes |
| --- | --- | --- |
| AES-256-GCM encrypted ledger backups | READY | `.json.enc`; Stage 7C tested |
| Retention (keep 10) | READY | Local `DATA_DIR/backups` |
| Authenticated restore API | READY | `POST /api/backups/restore` with confirm |
| Key escrow / rotation | PARTIALLY READY | Escrow documented; rotation **PENDING** (`RECOVERY_RUNBOOK.md`) |
| Off-box / automated cloud backup | NOT IMPLEMENTED | Local disk only |
| Backups while `BUSINESS_DATA_BACKEND=postgres` | BLOCKED | App **refuses** JSON backup/restore so it cannot overwrite PG from JSON; **no in-app `pg_dump` / PITR workflow** |
| Postgres recovery readiness | NOT IMPLEMENTED | Relies on future managed-DB snapshots + verified restore drill |

---

### 2.7 Production migration and fresh-database bootstrap — PARTIALLY READY

| Item | Status | Notes |
| --- | --- | --- |
| Versioned SQL migrations | READY | `001`, `002` + `npm run db:migrate` |
| Safety confirms | READY | Confirm env must match DB name |
| Fresh empty schema | READY | Foundation creates empty tables; no owner seed in SQL |
| Localhost-only migrate guard | BLOCKED for managed cloud DB | Scripts refuse remote hosts — intentional Phase 1 safety; blocks using current scripts against production host without a later ops change |
| Ledger import / verify | PARTIALLY READY | `import:ledger:pg` / `verify:ledger:pg` exist; require frozen `LEDGER_IMPORT_PATH`; localhost gates |
| JSON admin bootstrap | READY | `/api/auth/bootstrap` when `auth.json` missing |
| Postgres first-owner bootstrap UI | NOT IMPLEMENTED | Returns 409; owners must be inserted out-of-band |
| Authoritative production ledger identified | PARTIALLY READY | Phase 5 audit: live `data/ledger.json` may be empty; richer copies exist elsewhere — cutover source must be explicitly approved |

---

### 2.8 Frontend / backend deployment architecture — PARTIALLY READY

| Item | Status | Notes |
| --- | --- | --- |
| Recommended shape | READY | Build SPA → run one Node process serving `dist/` + `/api` |
| Split frontend host | NOT IMPLEMENTED / not needed | Would require CORS; not recommended |
| Desktop EXE | OPTIONAL | Not required for Chrome HTTPS access |
| CI/CD production pipeline | NOT IMPLEMENTED | No production deploy workflow audited as live |
| Hosted deployment guide | PARTIALLY READY | `HOSTED_DEPLOYMENT_GUIDE.md` is guidance; checklist items still open |

---

### 2.9 HTTPS without installing an EXE — READY (architecture)

| Item | Status | Notes |
| --- | --- | --- |
| Browser clients | READY | SPA works in Chrome once origin is HTTPS |
| Mobile Chrome | READY (app) | Responsive login/shell delivered in prior mobile phases; real-device UAT on staging HTTPS still recommended |
| TLS in Node | NOT IMPLEMENTED | Terminate at Caddy/nginx/cloud edge |
| Electron | OPTIONAL | Packaged builds require HTTPS URL; usable after hosting exists |

**Conclusion:** Owners do **not** need the Windows installer for day-to-day use if the web app is hosted.

---

### 2.10 Hosting requirements and estimated monthly cost (INR) — PARTIALLY READY (guidance)

#### Minimum production requirements

1. Always-on Node.js process (1 vCPU / 1–2 GB RAM class is enough initially).  
2. Managed PostgreSQL (or self-managed Postgres on private network) with automated snapshots.  
3. HTTPS reverse proxy / platform TLS + custom domain (or provider subdomain).  
4. Secrets store for keys and `DATABASE_URL`.  
5. Persistent volume **if** any JSON/`DATA_DIR` artifacts (reset token files, legacy backups) remain.  
6. Off-box encrypted DB backups + key escrow.  
7. Single region near users (India: Mumbai/Bangalore preferred).

#### Estimated monthly infrastructure cost (indicative, Nov 2026)

Prices change often; treat as planning bands, not quotes. GST may apply.

| Stack option | Components (indicative) | Est. INR / month |
| --- | --- | --- |
| **A. India budget VPS + managed PG** | Node host ~₹99–₹499 + managed Postgres ~₹149–₹499 | **₹250–₹1,000** |
| **B. Single India VPS (Node + Postgres co-located)** | 2 GB VPS ~₹400–₹800 + ops time for DB backups | **₹400–₹900** (+ labour) |
| **C. Global PaaS (e.g. Render-class)** | Web ~$7 + Postgres ~$7 ≈ ₹1,100–₹1,400 at ~₹90–93/USD | **₹1,100–₹1,500** |
| **D. Heavier managed (DO/AWS-class small)** | App + managed PG + backups | **₹2,000–₹5,000+** |

**Recommendation for two-owner practice:** Option **A** or **C** with **managed Postgres backups enabled**, TLS subdomain, and offline key escrow. Avoid free/sleeping tiers for live shared business data.

---

## 3. Production blockers (must resolve before go-live)

| ID | Blocker | Classification |
| --- | --- | --- |
| B1 | Default runtime still JSON single-admin / file ledger | BLOCKED |
| B2 | No production Postgres cutover (migrate on remote host + import + switch env) | BLOCKED |
| B3 | No production two-owner provisioning path (bootstrap disabled; only test seed helper) | BLOCKED |
| B4 | Password reset depends on server-local token files (no SMTP/email) — unsuitable for phone-only owners | BLOCKED |
| B5 | JSON encrypted backup/restore disabled in Postgres mode; no in-app DB backup/restore | BLOCKED |
| B6 | `npm start` does not reliably run TypeScript `server.ts` | BLOCKED |
| B7 | Migrate/import safety scripts localhost-only — cannot apply as-is to managed cloud DB | BLOCKED |

---

## 4. Security gaps (non-exhaustive)

| Gap | Severity | Classification |
| --- | --- | --- |
| No Helmet / CSP / HSTS in app | Medium | NOT IMPLEMENTED |
| Postgres pool lacks explicit SSL configuration | High (on public DB URLs) | PARTIALLY READY |
| In-memory login rate limits reset on restart / don’t share across instances | Medium | PARTIALLY READY |
| Authenticated restore can replace whole JSON ledger (any logged-in owner) | High (ops) | PARTIALLY READY |
| Filesystem reset tokens on host disk | High if `DATA_DIR` mis-exposed | PARTIALLY READY |
| Historical git/ledger exposure (older audits) | High if remotes unclean | Outside this phase — re-verify before public repo use |

---

## 5. Backup and recovery readiness summary

| Mode | Backup | Restore | Offsite | Drill |
| --- | --- | --- | --- | --- |
| JSON SoR (current default) | Encrypted local `.json.enc` | API restore (auth + confirm) | NOT IMPLEMENTED | Documented staging-only in `RECOVERY_RUNBOOK.md` |
| Postgres SoR (intended prod) | NOT IMPLEMENTED in app | NOT IMPLEMENTED in app | Provider snapshots only if configured | NOT IMPLEMENTED |

**Recovery readiness for intended PostgreSQL production: BLOCKED** until managed DB backups + verified restore procedure + key escrow are operational.

---

## 6. Recommended hosting architecture

```text
Owners (Chrome laptop/phone)
        │ HTTPS :443
        ▼
 TLS terminator (Caddy / nginx / cloud LB)
        │ private forward
        ▼
 Node ASSOCIATE (single instance)
   HOST=127.0.0.1  PORT=3000
   NODE_ENV=production
   AUTH_BACKEND=postgres
   BUSINESS_DATA_BACKEND=postgres
   AUTH_ORGANIZATION_ID=<shared-org-uuid>
   COOKIE_SECURE=true  TRUST_PROXY=1
   PORTAL_PASSWORD_ENCRYPTION_KEY  (secret manager)
   DATABASE_URL  (TLS, private network)
        │
        ▼
 Managed PostgreSQL (daily snapshots + PITR if available)
        │
        ▼
 Offsite snapshot copies + offline key escrow (portal key; backup key if JSON artifacts retained)
```

- Keep SPA and API on **one origin**.  
- Do **not** require Electron for MVP.  
- Prefer **one Node instance** until rate limits move off process memory.  
- Provision **Owner A** and **Owner B** as `organization_members` with `role=owner` for the same org UUID.

---

## 7. Prioritized implementation roadmap

### P0 — Unblock hosted two-owner Postgres (next phase)

1. Fix production process start (`tsx` or compile `server.js`) and document build → start.  
2. Production-safe migrate path for remote/managed Postgres (TLS, allowlisted prod DB name, confirm gates).  
3. Operator runbook + script to create org + two owner accounts (no secrets in git).  
4. Import approved frozen ledger → verify → switch `AUTH_BACKEND` + `BUSINESS_DATA_BACKEND` to postgres.  
5. Provision HTTPS host + `COOKIE_SECURE=true` + `TRUST_PROXY=1`.  
6. Enable managed Postgres automated backups; perform one restore drill on staging.  
7. Replace or augment filesystem reset tokens (SMTP or secure operator channel) before phone-only use.

### P1 — Hardening

8. Explicit DB SSL in pool config; private DB network only.  
9. Helmet/CSP/HSTS at proxy or app.  
10. Off-box copy of any remaining `DATA_DIR` artifacts; secret rotation runbooks.  
11. Real-device Chrome UAT (Android + iPhone Safari) on staging HTTPS.

### P2 — Optional

12. Point desktop `DESKTOP_APP_URL` / `desktop-config.json` at HTTPS origin.  
13. Shared rate-limit store if multi-instance ever required.  
14. SameSite revisit / shorter idle timeout if policy demands.

---

## 8. Finding roll-up by audit area

| # | Area | Classification |
| --- | ---: | --- |
| 1 | Node.js hosting compatibility | PARTIALLY READY |
| 2 | Production PostgreSQL configuration | PARTIALLY READY |
| 3 | Auth / sessions / cookies / HTTPS | PARTIALLY READY |
| 4 | Production env var inventory | PARTIALLY READY |
| 5 | Shared two-owner workspace | PARTIALLY READY |
| 6 | Backup / encryption / restore | PARTIALLY READY (JSON) / BLOCKED (Postgres SoR) |
| 7 | Migration / fresh bootstrap | PARTIALLY READY |
| 8 | Frontend/backend deployment architecture | PARTIALLY READY |
| 9 | HTTPS without EXE | READY |
| 10 | Hosting requirements & INR cost guidance | READY (guidance) |

**Overall: PARTIALLY READY — go-live BLOCKED.**

---

## 9. Recommendation for the next implementation phase

**Proceed to Phase 8B: Production Hosting & PostgreSQL Cutover (implementation).**

Phase 8B should implement only what is required to remove the P0 blockers: production start path, remote-safe migrations, two-owner provisioning, HTTPS deployment of the existing monolith, Postgres as SoR with managed backups + restore drill, and a hosted-safe password-reset channel — **without** changing working ledger business rules or redesigning the UI.

Do **not** treat Phase 8A as approval to deploy. This audit created documentation only.

---

## 10. Audit constraints observed

- No application source files modified except creation of this report.  
- No production database connections.  
- No migrations executed.  
- No secrets or `.env` values disclosed.  
- No deploy, commit, push, or branch switch.  

**Primary evidence sources:** `server.ts`, `package.json`, `.env.example`, `src/auth/*`, `src/db/*`, `src/business/*`, `db/migrations/*`, `scripts/db-*.mjs`, `HOSTED_DEPLOYMENT_GUIDE.md`, `RECOVERY_RUNBOOK.md`, `docs/phase4-business-data.md`, `docs/phase5-migration-plan.md`, `docs/phase7-desktop-report.md`, and related readiness docs (read-only).
