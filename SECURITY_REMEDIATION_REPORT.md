# Security Remediation Report — Phases 1–5

**Branch:** `security/phase1-password-reset`  
**Date:** 2026-11-20  
**Scope:** Controlled fixes only — no UI redesign or business-workflow changes

| Phase | Issue | Fix | Tests |
|-------|-------|-----|-------|
| 1 | Email-only password reset | Single-use token, expiry, rate limits, no enumeration | 11/11 |
| 2 | Portal passwords plaintext | AES-256-GCM at rest; strip API; session reveal | 13/13 |
| 3 | Bind `0.0.0.0` | Default `HOST=127.0.0.1` | 7/7 |
| 4 | Hardcoded admin defaults | One-time bootstrap + strong policy; preserve `auth.json` | 18/18 |
| 5 | Weak PAN / field validation | Indian PAN regex + lengths; import report; historical preserve | 16/16 |

Detail reports: `PHASE1_SECURITY_REMEDIATION.md` … `PHASE5_SECURITY_REMEDIATION.md`  
QA update: `UPDATED_QA_AUDIT_REPORT.md`  
Regression: `REGRESSION_TEST_RESULTS.md`  
Hosted future: `HOSTED_DEPLOYMENT_GUIDE.md`
