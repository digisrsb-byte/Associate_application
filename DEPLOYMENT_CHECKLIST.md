# DEPLOYMENT CHECKLIST

**Date:** 2026-11-20  
**Branch:** `security/phase1-password-reset`  
**Rule:** Do not deploy or bind publicly until every **Must** item is complete and re-audited.

Legend: `[ ]` incomplete · `[x]` satisfied for **local UAT only** · `N/A` not applicable yet

---

## A. Pre-release code & git

| # | Item | Status | Notes |
|---|------|--------|-------|
| A1 | All Phase 1–5 remediations committed on feature branch | `[ ]` | Currently largely uncommitted; tip equals `main` |
| A2 | No secrets in commit (`.env`, keys, plaintext passwords) | `[ ]` | Tracked backups still have plaintext passwords |
| A3 | PR reviewed; not force-pushed to `main`/`dev` | `[ ]` | Do not merge until READY |
| A4 | `main` / `dev` unmodified by this work | `[x]` | Confirmed for this audit window |
| A5 | Remove or untrack plaintext backup files | `[ ]` | Blocking (F-01 / D-01) |
| A6 | Live `ledger.json` / `auth.json` not published | Partial | `auth.json` ignored; review ledger tracking |

---

## B. Secrets & environment

| # | Item | Status | Notes |
|---|------|--------|-------|
| B1 | `PORTAL_PASSWORD_ENCRYPTION_KEY` in secrets manager | `[ ]` Hosted / `[x]` Local `.env` | Never commit |
| B2 | No hardcoded admin passwords in source | `[x]` | Phase 4 bootstrap |
| B3 | Strong admin password provisioned once | `[x]` Local | Rotate if shared |
| B4 | `.env.example` documents vars without real secrets | `[x]` | Verify before release |
| B5 | Encryption key offline backup / escrow | `[ ]` | Loss = cannot decrypt portal passwords |

---

## C. Network & TLS

| # | Item | Status | Notes |
|---|------|--------|-------|
| C1 | Default bind `127.0.0.1` | `[x]` | Phase 3 |
| C2 | Public bind forbidden without reverse proxy | `[ ]` | Policy |
| C3 | HTTPS terminator (TLS 1.2+) | `[ ]` | Required for hosted |
| C4 | Session cookie `Secure` when HTTPS | `[ ]` | Blocking for hosted (F-02) |
| C5 | Firewall: only proxy → app loopback | `[ ]` | |
| C6 | DB/files not exposed on network shares | `[ ]` | Restrict `data/` ACLs |

---

## D. Authentication & sessions

| # | Item | Status | Notes |
|---|------|--------|-------|
| D1 | Token password reset + rate limits | `[x]` | Phase 1 |
| D2 | Session expiration configured | `[x]` | Verify timeout meets policy |
| D3 | HttpOnly cookie | `[x]` | |
| D4 | SameSite set appropriately | `[x]` | Confirm value |
| D5 | Bootstrap one-time only | `[x]` | When `auth.json` absent |
| D6 | Role / admin gates on sensitive APIs | `[x]` | Re-verify reveal endpoints |
| D7 | Logout invalidates session | `[x]` | |

---

## E. Data protection

| # | Item | Status | Notes |
|---|------|--------|-------|
| E1 | Portal passwords AES-256-GCM at rest | `[x]` Live ledger | |
| E2 | API never returns plaintext/ciphertext passwords in list/detail | `[x]` | |
| E3 | Credential reveal authorized + audited | `[x]` | |
| E4 | PAN validation on write | `[x]` | Phase 5 |
| E5 | Exports exclude portal credentials | `[x]` | Still contain PII |
| E6 | Encrypted backups of `ledger.json` + `auth.json` | `[ ]` | |
| E7 | Restore drill documented and tested | `[ ]` | See DATA_INTEGRITY_REPORT |

---

## F. Operations

| # | Item | Status | Notes |
|---|------|--------|-------|
| F1 | Error logs redact passwords / tokens / keys | `[ ]` | Spot-check before prod |
| F2 | Dependency audit (`npm audit`) | Partial | 2 moderate via exceljs→uuid |
| F3 | Build succeeds (`npm run build` or project script) | `[ ]` | Re-run on RC |
| F4 | Startup health check on loopback | `[x]` Local | |
| F5 | Monitoring / disk backup schedule | `[ ]` | |
| F6 | Incident plan: key rotation + password reset | `[ ]` | |

---

## G. Go / No-go

| Environment | Verdict | Gate |
|-------------|---------|------|
| Local single-PC UAT (`127.0.0.1`) | **CONDITIONALLY READY** | Fix A5 before sharing repo; keep HOST loopback |
| Internet / multi-user production | **NOT READY** | Complete A1–A5, B1, B5, C2–C6, D4 Secure, E6–E7, F1–F6 |

**Final go-live requires:** overall audit verdict **READY** in `FINAL_SECURITY_AUDIT.md` after remediation re-audit.

---

## H. Explicit non-actions (this audit)

- No production deploy  
- No merge to `main`/`dev`  
- No code or data changes during audit  
- No push without owner approval  

Owner approval required before any remediation commits or configuration changes.
