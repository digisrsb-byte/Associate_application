# FINAL SECURITY AUDIT

**Date:** 2026-11-20  
**Branch:** `security/phase1-password-reset` (HEAD = `ecb6037`, same tip as `main`)  
**Audit type:** READ-ONLY (no application code, config, or ledger mutations by the auditor)  
**Scope:** Live implementation inspection + non-mutating API probes + disk/git review  

## Overall verdict

| Context | Verdict |
|---------|---------|
| **Internet / production hosting** | **NOT READY** |
| **Local single-PC UAT (`HOST=127.0.0.1`)** | **CONDITIONALLY READY** |

Automated Phase 1–5 tests passing is **necessary but not sufficient**. Blocking production issues remain (see findings).

---

## 1. Phase implementation verification (code inspection)

### Phase 1 – Password reset
| Check | Result | Evidence |
|-------|--------|----------|
| Email alone cannot reset | **PASS** | `POST /api/auth/reset-password` requires `token`; missing → 400 |
| Crypto single-use token | **PASS** | `crypto.randomBytes(32)` + scrypt hash in `auth.passwordReset`; cleared after use |
| Short expiry | **PASS** | `RESET_TOKEN_TTL_MS = 15 * 60 * 1000` |
| Rate limiting | **PASS** | `allowRateLimit` on forgot (5/15m) and reset (10/15m) |
| No email enumeration | **PASS** | `GENERIC_FORGOT_MESSAGE` always returned |
| Token not in HTTP JSON | **PASS** | Written to `data/PASSWORD_RESET_TOKEN.txt` only; gitignored |
| Timing-safe verify | **PASS** | `crypto.timingSafeEqual` in `verifySecret` |

**Residual:** Local token file is readable by OS users on the machine (acceptable for single-PC UAT; not for shared hosted without SMTP). Rate limits are in-memory (reset on process restart).

### Phase 2 – Portal password encryption
| Check | Result | Evidence |
|-------|--------|----------|
| AES-256-GCM | **PASS** | `portalCrypto.ts` (`aes-256-gcm`, 12-byte IV, auth tag) |
| Key from env only | **PASS** | `PORTAL_PASSWORD_ENCRYPTION_KEY`; `.env` gitignored |
| Not in ordinary API | **PASS** | Live probe: ledger JSON has no `password` / `passwordEnc` / `enc:v1:` |
| Reveal authorized | **PASS** | Unauth reveal → 401; routes behind `requireAuth` |
| Disk at rest | **PASS** | Current `data/ledger.json`: 0 plaintext password fields; 2 `passwordEnc` |
| Exports | **PASS** | CSV/GST Excel password columns blanked (`''`) |

**Residual:** Untracked/tracked **backup** JSON files still contain historical plaintext (see findings). Login reveal is available to any authenticated admin (single-admin product).

### Phase 3 – Host binding
| Check | Result | Evidence |
|-------|--------|----------|
| Default `127.0.0.1` | **PASS** | `HOST = (process.env.HOST \|\| '127.0.0.1')` |
| No silent `0.0.0.0` default | **PASS** | Explicit env required for all-interfaces; warning logged |
| Live bind | **PASS** | Process log: `listening on 127.0.0.1:3000` |

### Phase 4 – Admin provisioning
| Check | Result | Evidence |
|-------|--------|----------|
| No `Admin@123` runtime fallback | **PASS** | No `createDefaultAuth` / `DEFAULT_ADMIN_PASSWORD` in `server.ts` |
| Bootstrap one-time | **PASS** | Live: `bootstrap` → **409** when configured |
| Strong policy | **PASS** | `passwordPolicy.ts` on bootstrap + reset |
| Existing auth preserved | **PASS** | `auth.json` gitignored; read never auto-overwrites with defaults |
| Hashing | **PASS** | scrypt via Node `crypto.scryptSync` + salt (appropriate KDF) |

### Phase 5 – PAN / input validation
| Check | Result | Evidence |
|-------|--------|----------|
| PAN regex | **PASS** | `PAN_REGEX` in `fieldValidation.ts` |
| Create/update enforcement | **PASS** | Server uses `validatePanValue`; duplicate → 409 |
| Historical invalid preserved | **PASS** | Disk: `!!!` and `DHLVS7788P` still present; report lists 2 |
| Import reporting | **PASS** | Import path builds `invalidPanRows` without deleting ledger |

---

## 2. Authentication & authorization

| Area | Result | Notes |
|------|--------|-------|
| Login / logout | **PASS** | Wrong password → 401; `/api/auth/me` returns email only |
| Session TTL | **PASS** | 12h (`SESSION_TTL_MS`); pruned on access |
| Cookie flags | **PARTIAL** | `HttpOnly; SameSite=Lax` present; **`Secure` absent** |
| Session token in JSON body | **FAIL (prod)** | Login returns `token` in body (XSS / leakage risk if mishandled) |
| API gate | **PASS** | Unauth `/api/ledger` → 401; reveal → 401 |
| RBAC | **N/A / INFO** | Single administrator model; no multi-role RBAC |
| Bootstrap reuse | **PASS** | 409 when `auth.json` exists |
| Bearer header support | **INFO** | `Authorization: Bearer` accepted alongside cookie |

---

## 3. Client data security

| Area | Result | Evidence |
|------|--------|----------|
| Encrypted at rest (live ledger) | **PASS** | No plaintext `password` on disk ledger |
| API sanitization | **PASS** | Probe: no password/ciphertext in ledger payload |
| Key not in source | **PASS** | Key only in `.env` (ignored) |
| Tracked backups with plaintext | **FAIL** | See finding F-01 |
| PAN/GST in API | **INFO** | Expected for authenticated admin ledger app; protected by session |
| Logs | **PASS (spot)** | Reset/bootstrap intentionally avoid logging secrets |

---

## 4. Findings register

### F-01 — Git-tracked ledger backups contain plaintext portal passwords
- **Severity:** High  
- **Evidence:** Tracked `data/backups/ledger-20261119-175659.json` has plaintext passwords (e.g. demo clients); `ledger-20261120-111418.json` likewise. Untracked `ledger-20261120-150021-pre-portal-encrypt.json` has ~10 plaintext values.  
- **Module:** `data/backups/`, git index  
- **Recommended action:** Stop tracking backup JSON with secrets; purge from git history or rotate credentials; add `data/backups/` to `.gitignore`; keep encrypted-only operational ledger.  
- **Production impact:** Credential leak via repository clone/CI artifacts.

### F-02 — Session cookie missing `Secure` flag
- **Severity:** High (for HTTPS production) / Low (local HTTP UAT)  
- **Evidence:** `Set-Cookie: tl_session=...; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200` — no `Secure`.  
- **Module:** `server.ts` `setSessionCookie`  
- **Recommended action:** Set `Secure` when `NODE_ENV=production` or `COOKIE_SECURE=true` behind HTTPS.  
- **Production impact:** Cookie can be sent over cleartext HTTP if app is ever reached without TLS.

### F-03 — Session token returned in login JSON body
- **Severity:** Medium  
- **Evidence:** Login response keys include `token` in addition to HttpOnly cookie.  
- **Module:** `POST /api/auth/login`  
- **Recommended action:** Prefer cookie-only sessions for browser UI; avoid returning raw token unless required for a documented API client.  
- **Production impact:** Increases exposure to XSS token theft vs HttpOnly-only.

### F-04 — Security remediation not committed; branch tip equals `main`
- **Severity:** High (process / release integrity)  
- **Evidence:** `security/phase1-password-reset` and `main` both at `ecb6037`; all Phase 1–5 work is **uncommitted** working tree / untracked files.  
- **Module:** Git  
- **Recommended action:** Review, commit on feature branch (excluding secrets/backups), PR, CI review before merge. Do not push `.env`, `auth.json`, or plaintext backups.  
- **Production impact:** Cannot deploy a reviewed, reproducible security baseline from git alone.

### F-05 — `data/ledger.json` is tracked while containing business data
- **Severity:** Medium  
- **Evidence:** `git ls-files` includes `data/ledger.json`. Current file has no plaintext passwords but includes PANs and filings.  
- **Module:** Git / data layer  
- **Recommended action:** Decide product policy: sample seed vs real data; prefer not committing real client PANs; use seed fixtures.  
- **Production impact:** PII in VCS.

### F-06 — npm audit: 2 moderate vulnerabilities (prod deps)
- **Severity:** Medium  
- **Evidence:** `npm audit --omit=dev` → moderate: 2, high/critical: 0  
- **Module:** Dependencies  
- **Recommended action:** Review `npm audit` details; upgrade/patch before production.  
- **Production impact:** Known dependency risk.

### F-07 — In-memory sessions and rate limits
- **Severity:** Medium (multi-instance / restart) / Low (single local process)  
- **Evidence:** `sessions` Map; `rateLimitBuckets` Map  
- **Module:** `server.ts`  
- **Recommended action:** Sticky sessions or shared store for hosted scale-out; document single-node assumption.  
- **Production impact:** Sessions/rate limits lost on restart; ineffective across multiple nodes.

### F-08 — Local password-reset token file
- **Severity:** Medium (shared host) / Low (single trusted PC)  
- **Evidence:** `data/PASSWORD_RESET_TOKEN.txt`  
- **Module:** Auth reset  
- **Recommended action:** SMTP/out-of-band email for hosted; keep file local-only for UAT.  
- **Production impact:** Anyone with filesystem access can reset admin password during token TTL.

### F-09 — Historical invalid PANs remain
- **Severity:** Low (accepted Phase 5 design)  
- **Evidence:** Report: 2 invalid (`DHLVS7788P`, `!!!`); records not deleted  
- **Module:** Ledger / Phase 5  
- **Recommended action:** Admin correction via UI using pan-validation-report.  
- **Production impact:** Data quality only; not an auth bypass.

### F-10 — No multi-role RBAC
- **Severity:** Informational  
- **Evidence:** Single admin in `auth.json`  
- **Module:** Auth  
- **Recommended action:** Accept for current product or add roles later.  
- **Production impact:** All authenticated users are full admin (currently one).

---

## 5. Functionality spot-check (read-only)

| Workflow | Method | Result |
|----------|--------|--------|
| Health | GET `/api/health` | OK |
| Auth gate | Unauth ledger/reveal | 401 |
| Login / me | Authenticated probe | OK |
| Ledger load | Auth GET | 6 clients / 4 GST |
| PAN report | Auth GET | 2 invalid, non-mutating |
| Filing balance helper | Code review `computeBalance` | fees−received, floor 0 |
| GST outstanding | Code review | billed−received |
| Portal lookup UI | Code review `PortalPasswordCell` | Session reveal API |
| Excel import invalid PAN | Code review | Skip + report |

Full CRUD/filing mutation re-tests were **not** re-executed in this read-only audit (would modify data). Prior Phase regression suites remain the mutation evidence.

---

## 6. Git & branch safety

| Check | Result |
|-------|--------|
| Current branch | `security/phase1-password-reset` |
| `main` tip | `ecb6037` (identical to feature HEAD) |
| Local `dev` branch | **Not present** |
| `main`/`dev` modified by this audit | **No** |
| `.env` tracked | **No** (ignored) |
| `auth.json` tracked | **No** (ignored) |
| Reset token file tracked | **No** (ignored) |
| Sensitive untracked | `.env` (has `QA_PASSWORD`, encryption key names); pre-encrypt backup; test result JSON |
| Risk if `git add .` | Would stage plaintext backups + ledger PII + reports — **do not** |

---

## 7. Companion deliverables

| Document | Verdict focus |
|----------|---------------|
| `PRODUCTION_READINESS_REPORT.md` | **NOT READY** (hosted) / **CONDITIONALLY READY** (local UAT) |
| `DATA_INTEGRITY_REPORT.md` | Live ledger sound; tracked/untracked plaintext backups **NOT READY** |
| `DEPLOYMENT_CHECKLIST.md` | Must-complete gates before go-live |

## 8. Summary recommendation

- **Do not deploy to the public internet** until F-01, F-02, F-04, F-06 are addressed and `HOSTED_DEPLOYMENT_GUIDE.md` / `DEPLOYMENT_CHECKLIST.md` are completed.  
- **Local UAT on loopback** may continue under documented residual risks (F-07–F-10).  
- **Await owner approval** before any remediation commits, config changes, merges, or pushes.
