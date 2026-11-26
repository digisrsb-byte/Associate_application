# DATA INTEGRITY REPORT

**Date:** 2026-11-20  
**Branch:** `security/phase1-password-reset`  
**Scope:** Read-only inspection of live ledger, relationships, calculations, import/export. **No data was modified.**

## Verdict

### Live operational data: **CONDITIONALLY READY** (integrity preserved; known historical anomalies documented)

### Tracked backup artifacts: **NOT READY** (plaintext credentials in git history / tracked backups)

---

## 1. Live ledger snapshot (`data/ledger.json`)

| Metric | Observed |
|--------|----------|
| IT clients | 6 |
| GST clients | 4 |
| Plaintext portal passwords in live file | **0** |
| Encrypted portal password blobs | **2** |
| Invalid PAN format (historical, retained) | **2** |

Phase 2 migration left ciphertext only for clients that had passwords; empty passwords remain empty. Historical invalid PANs were **not** deleted (Phase 5 policy).

---

## 2. Client records

- IT and GST collections present and loadable.  
- Required identity fields generally present; PAN validation on **new writes** is strict (`^[A-Z]{3}[ABCFGHLJPT][A-Z][0-9]{4}[A-Z]$`, length 10).  
- Duplicate PAN: application behaviour relies on create/update validation paths; operators should treat PAN uniqueness as a business rule during import review.  
- **Finding (Low/Info):** Two existing records fail current PAN pattern — retained for history; edit/update of those rows may be blocked until PAN corrected.

---

## 3. Filing records & financial calculations

- IT filings and GST filings associate to clients via existing IDs.  
- Outstanding / interest / tax payable / registration charge paths exercised in prior phase regression; no arithmetic rewrite in Phase 1–5.  
- **Read-only audit did not recalculate every historical row against Excel** — rely on Phase regression + spot checks. No evidence of Phase 1–5 breakage of payment maths.

---

## 4. Excel import / export

| Path | Integrity note |
|------|----------------|
| Import | Phase 5 rejects invalid PAN / overlong fields; reports invalid rows without wiping ledger |
| Export (client-wise / filtered) | Must not include portal passwords or ciphertext — verified in security audit that ordinary export/API strips secrets |
| Reports | Filters (month/year), search, sort — functional surface unchanged by crypto/auth phases |

**Risk:** Operator-exported files still contain PII (names, PAN, GSTIN). Treat exports as confidential; do not email unencrypted.

---

## 5. Database relationships

Application uses JSON ledger (not SQL). Relationships are ID-based within `ledger.json`. No foreign-key engine; orphan risk is application-level. Spot check: filing client references resolve for current small dataset.

---

## 6. Backup integrity

| Artifact | Status |
|----------|--------|
| Live `data/ledger.json` | Encrypted passwords where set; operational |
| Tracked backup files (e.g. under `data/` or similar named backups) | **Contain plaintext portal passwords** — **High** integrity/security defect for git |
| Restore procedure | Manual file replace of `ledger.json` + `auth.json`; encryption key must match or portal passwords become unreadable |

### Restore procedure (documented, not executed)

1. Stop app.  
2. Restore `data/ledger.json` (and `data/auth.json` if restoring auth).  
3. Ensure same `PORTAL_PASSWORD_ENCRYPTION_KEY` as when ciphertext was written.  
4. Restart on `127.0.0.1`.  
5. Verify login + one portal reveal + sample client list.  

**Do not restore tracked plaintext backups into production without re-encrypting and rotating passwords.**

---

## 7. Auth store integrity

- `data/auth.json`: gitignored; holds scrypt password hash + session metadata model.  
- Bootstrap only when missing — one-time admin provisioning.  
- Reset tokens: short-lived file-based tokens; not part of ledger.

---

## 8. Findings summary (data)

| ID | Severity | Evidence | Module | Recommended action | Production impact |
|----|----------|----------|--------|--------------------|-------------------|
| D-01 | High | Tracked backups with plaintext portal passwords | Backup / git | Untrack, ignore, scrub history if needed; rotate passwords | Credential exposure |
| D-02 | Low | 2 historical invalid PANs retained | Clients / PAN | Correct on next edit; keep audit trail | Edit friction only |
| D-03 | Medium | PII in tracked `ledger.json` / exports | Data / git | Prefer ignore live ledger; encrypt backups | Privacy / compliance |
| D-04 | Info | Encryption key loss = irreversible portal password recovery | Crypto | Offline key escrow | Operational lockout of reveals |

---

## 9. Conclusion

Live ledger **structure and Phase 2 encryption state are sound** for continued local UAT. **Do not promote** until backup/git plaintext credential issue is remediated and restore drills use encrypted backups only.
