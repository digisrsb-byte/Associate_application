# Hosted Deployment Guide (Future)

**Status:** Guidance only — production hosting is **not** configured in this Phase 3 change.  
**Local UAT default:** `HOST=127.0.0.1` (loopback). Do not use this guide to weaken local testing.

This document describes the secure configuration required **before** exposing TaxLedger / Associate on the internet.

---

## 1. HTTPS / TLS

- Terminate TLS at a reverse proxy (nginx, Caddy, Traefik, cloud load balancer) or platform edge.
- Use a valid certificate (ACM, Let’s Encrypt, or corporate PKI).
- Redirect all HTTP → HTTPS.
- Prefer TLS 1.2+; disable weak ciphers.
- HSTS once HTTPS is stable.

## 2. Reverse proxy

- Public clients talk only to the proxy on 443.
- Proxy forwards to the Node app on a **private** address (e.g. `127.0.0.1:3000` on the same VM, or an internal VPC IP).
- Set `HOST` so the app listens only on that private interface (not the public NIC).
- Forward real client IP carefully (`X-Forwarded-For` / `X-Real-IP`) and trust only the proxy.
- Do not expose the Node port on the public firewall.

Example pattern (illustrative):

```text
Internet → :443 (TLS) → reverse proxy → 127.0.0.1:3000 (Node)
```

## 3. Firewall restrictions

- Allow inbound **443/tcp** (and optionally 80 for redirect) from the internet or VPN only as required.
- Deny inbound to the application port (`PORT`) from the internet.
- Restrict SSH/RDP admin access (VPN, bastion, IP allowlists).
- Separate security groups / NSGs for web, app, and data tiers.

## 4. Secure environment variables

- Store secrets outside source control (platform secrets, Vault, AWS SM, Azure Key Vault, etc.).
- Required / recommended for hosted use:
  - `HOST` (private bind)
  - `PORT`
  - `ADMIN_EMAIL` / initial admin provisioning secrets (see Phase 4 when implemented)
  - `PORTAL_PASSWORD_ENCRYPTION_KEY` (32-byte AES key; back up offline)
  - Session / cookie settings when hardened for production
- Never commit `.env` with real secrets.
- Rotate keys on a schedule; document break-glass recovery.

## 5. Database / data network restrictions

- Current stack uses local JSON files under `data/`. For hosted:
  - Keep `data/` on encrypted disk, not world-readable.
  - If migrating to a database later: private subnet only, TLS to DB, least-privilege DB users, no public DB endpoints.
- Backups must not be publicly downloadable.

## 6. Production secrets management

- Unique secrets per environment (dev / UAT / prod).
- Principle of least privilege for who can read production secrets.
- Audit secret access.
- Plan for key rotation of `PORTAL_PASSWORD_ENCRYPTION_KEY` (re-encrypt or dual-key window) before rotating blindly.

## 7. Secure session cookies

When hosting over HTTPS, harden session cookies (implement/verify in a later hardening pass):

- `Secure` — cookie only over HTTPS  
- `HttpOnly` — already intended for session tokens  
- `SameSite=Strict` or `Lax` as appropriate  
- Short idle/absolute session TTL  
- Invalidate sessions on password reset (already done in Phase 1)

## 8. Backup and recovery

- Automated backups of `data/ledger.json`, `data/auth.json`, and encryption-key material (key stored separately from data backups).
- Test restore regularly.
- Retain pre-migration backups (Phase 2 pattern) before schema/crypto changes.
- Document RPO/RTO.

## 9. Access logging and monitoring

- Reverse-proxy access logs (without passwords or reset tokens).
- Application logs: auth failures, rate limits, migration warnings — **never** log passwords, portal credentials, encryption keys, or reset tokens.
- Alerts on repeated 401/429, process crash, disk full.
- Uptime check on HTTPS health endpoint only.

## 10. Checklist before go-live

- [ ] TLS working end-to-end  
- [ ] App not listening on a public interface  
- [ ] Firewall denies app port from internet  
- [ ] Secrets in a secrets manager; not in git  
- [ ] Portal encryption key backed up offline  
- [ ] Session cookies Secure + HttpOnly  
- [ ] Backups verified  
- [ ] Phase 4 admin provisioning complete (no default passwords)  
- [ ] Phase 5 input validation complete  
- [ ] Penetration / smoke security test on staging  

---

*This guide intentionally does not apply production hosting settings to the current local UAT branch.*
