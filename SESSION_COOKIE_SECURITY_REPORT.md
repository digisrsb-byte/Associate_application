# SESSION COOKIE SECURITY REPORT (F-02 Investigation + Plan)

**Date:** 2026-11-20  
**Module:** `server.ts` — `setSessionCookie` / `clearSessionCookie`  
**Mode:** **IMPLEMENTED (2026-11-20)** under Phase 6B approval. Local + production-like tests PASS.

---

## 1. Current behaviour

```text
Set-Cookie: tl_session=<token>; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200
```

| Flag | Current | Required |
|------|---------|----------|
| `HttpOnly` | Present | Keep |
| `SameSite` | `Lax` | Keep unless documented otherwise |
| `Secure` | **Absent** | `true` for HTTPS production; `false` only for isolated HTTP localhost UAT |
| `Path` | `/` | Keep |
| `Max-Age` | 12h (`SESSION_TTL_MS`) | Keep |

Login also returns a `token` in JSON (F-03 / Medium — out of scope for F-02 unless bundled later).

No `trust proxy` / `X-Forwarded-Proto` handling today — app typically terminates HTTP on loopback.

---

## 2. Risk

Without `Secure`, a browser may send `tl_session` over cleartext HTTP if the app is ever reachable without TLS. Acceptable only for single-PC `http://127.0.0.1` UAT.

---

## 3. Exact remediation design (for approval)

### 3.1 Environment variables (document in `.env.example`)

| Variable | Values | Meaning |
|----------|--------|---------|
| `COOKIE_SECURE` | `auto` (default) \| `true` \| `false` | Explicit override |
| `TRUST_PROXY` | `0` (default) \| `1` | Only when Node sits behind a **known** local/private reverse proxy |
| `NODE_ENV` | `production` / other | Used by `auto` heuristics |

### 3.2 Secure flag resolution

```text
if COOKIE_SECURE === 'true'  → Secure=true
if COOKIE_SECURE === 'false' → Secure=false
if COOKIE_SECURE === 'auto' (default):
    Secure=true  when NODE_ENV=production
                 OR (TRUST_PROXY=1 AND request is HTTPS per trusted indicator)
    Secure=false when HOST is loopback AND NODE_ENV !== production
                 (local HTTP UAT)
```

**Local UAT default:** `HOST=127.0.0.1`, `COOKIE_SECURE=auto` or `false` → cookie works on `http://127.0.0.1:3000`.

**Hosted HTTPS:** `NODE_ENV=production` and/or `COOKIE_SECURE=true` → `Secure` set. Clear cookie on logout must use the **same** Secure/SameSite attributes.

### 3.3 Proxy trust (no blind header trust)

- Default: **ignore** `X-Forwarded-Proto` / `Forwarded`.  
- Only if `TRUST_PROXY=1`:
  - Enable Express `trust proxy` limited to loopback / private hop (e.g. `trust proxy` = `loopback` or explicit proxy IP list — **not** `true` for all).  
  - Use `req.secure` after that configuration for `auto` mode.  
- Document that public clients must hit TLS terminator; Node remains on `127.0.0.1`.

### 3.4 Implementation sketch (not applied yet)

- Helper `buildSessionCookie(token, maxAge, { secure })` shared by set/clear.  
- Append `; Secure` when `secure === true`.  
- Keep `HttpOnly; SameSite=Lax`.  
- Preserve login/logout/session TTL behaviour.

### 3.5 Tests (after implementation approval)

| Case | Config | Expect |
|------|--------|--------|
| Local HTTP UAT | `HOST=127.0.0.1`, `COOKIE_SECURE=false` or auto+non-prod | Login sets cookie **without** Secure; session works |
| Production-like | `COOKIE_SECURE=true` | `Set-Cookie` contains `Secure` |
| Logout | Same secure mode | Clearing cookie includes matching flags |
| Untrusted forwarded proto | `TRUST_PROXY=0`, spoofed `X-Forwarded-Proto: https` | Must **not** flip Secure via header alone |

Simulate production-like HTTPS config via env flags even if TLS terminator is not live in UAT (`COOKIE_SECURE=true` probe).

---

## 4. Out of scope for F-02

- Removing login JSON `token` (F-03).  
- Changing `SameSite` to `Strict`.  
- Multi-node session store.

---

## 5. Implementation & test results

| Case | Result |
|------|--------|
| `COOKIE_SECURE=auto` on `127.0.0.1` | Secure **absent**; login/me/logout/reset PASS |
| `COOKIE_SECURE=true` | Secure **present** on set + clear; login/me/logout/reset PASS |
| Spoofed `X-Forwarded-Proto: https` with TRUST_PROXY off | Does **not** force Secure |

## 6. Verdict

| Context | Cookie readiness |
|---------|------------------|
| Local loopback HTTP | **READY** (Secure off under auto/false) |
| Hosted HTTPS | **READY at app layer** when `COOKIE_SECURE=true` or `NODE_ENV=production` — still requires TLS terminator |

**F-02:** Remediated in code; hosted go-live still needs TLS + ops checklist.
