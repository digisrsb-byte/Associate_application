# PRODUCTION READINESS REPORT

**Date:** 2026-11-20  
**Branch:** `security/phase1-password-reset`  
**Audit:** Read-only final security assessment  

## Verdict

### **NOT READY** for internet / production hosting

### **CONDITIONALLY READY** for local single-PC UAT (`HOST=127.0.0.1` only)

---

## Why not production-ready

| # | Blocking / high issue | Severity | Production impact |
|---|----------------------|----------|-------------------|
| 1 | Git-tracked backups contain **plaintext portal passwords** | High | Secrets leak via git/CI |
| 2 | Session cookie lacks **`Secure`** | High | Cookie on cleartext HTTP if exposed |
| 3 | Phase 1–5 remediation is **uncommitted**; branch tip equals `main` without security commits | High | No reproducible reviewed release artifact |
| 4 | Hosted TLS / reverse proxy / firewall / secrets manager **not configured** (by design deferred) | High | App must not bind publicly without them |
| 5 | Local reset-token file model unsuitable as sole hosted recovery channel | Medium–High | Filesystem privilege = account takeover window |

Additional non-blocking but required before go-live: session token in login JSON (Medium), npm `exceljs`→`uuid` moderate advisories (Medium), in-memory sessions (Medium for scale), tracked `ledger.json` PII (Medium).

---

## What is solid (local UAT)

- Password reset is token-based, rate-limited, non-enumerating.  
- Portal passwords encrypted at rest in the **live** ledger; ordinary API strips secrets.  
- Server binds to loopback by default.  
- No hardcoded admin password bootstrap; one-time setup when `auth.json` missing.  
- PAN format + field limits enforced on create/update; historical invalid PANs reported, not deleted.  
- Unauthenticated ledger/reveal denied (401).  

---

## Environment requirements (production)

Must be set in a secrets manager (never commit):

| Variable | Purpose |
|----------|---------|
| `HOST` | Private bind (e.g. `127.0.0.1` behind proxy) — **not** public `0.0.0.0` without controls |
| `PORT` | App port |
| `PORTAL_PASSWORD_ENCRYPTION_KEY` | 32-byte AES key (base64/hex); offline backup required |
| Cookie secure flag (future) | e.g. `COOKIE_SECURE=true` when HTTPS |

Auth is **not** bootstrapped from `ADMIN_PASSWORD` env (Phase 4).

---

## Deployment posture vs guide

See `HOSTED_DEPLOYMENT_GUIDE.md` and `DEPLOYMENT_CHECKLIST.md`. None of the hosted checklist items were applied in this audit (correct for local UAT).

---

## Recommended sequence before claiming READY

1. Fix F-01 (remove/ignore plaintext backups; scrub git if needed; rotate any exposed portal passwords).  
2. Add production `Secure` cookie behaviour.  
3. Commit remediation on the feature branch **without** secrets; open PR; review.  
4. Resolve or accept-with-ticket npm moderate findings.  
5. Complete TLS + proxy + firewall + secrets manager.  
6. Re-run final audit on the release candidate build.  

**Do not merge to production remotes or bind publicly until the above are done.**
