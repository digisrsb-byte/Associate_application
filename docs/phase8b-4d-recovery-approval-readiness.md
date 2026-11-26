# Phase 8B.4D — Recovery Approval and Import Readiness Gate

**Date:** 2026-11-25  
**Mode:** Read-only audit and documentation only  
**Basis:**  
- `docs/phase8b-4a-offline-recovery-inventory.md`  
- `docs/phase8b-4b-ledger-comparison-report.md`  
- `docs/phase8b-4c-recovery-verification-report.md`  
- Cross-refs: `docs/phase8b-4-ledger-discovery-report.md`, `docs/phase8a-production-hosting-readiness.md`

**Not performed:** ledger file copy/move/modify, decryption, PostgreSQL connection, import, migration, owner provisioning, deployment, commit/push, business SoR approval.

No personal data, portal credentials, encryption keys, or tokens are printed.

---

## Gate status

| Gate | Status |
| --- | --- |
| Technical preferred candidate identified (8B.4C) | **Recorded** — 153455 |
| Business-owner source approval | **OPEN — not granted** |
| Frozen `LEDGER_IMPORT_PATH` configured | **Not set** |
| Import implementation (org-aware) ready | **Not ready** (see §6) |
| Production cutover authorization | **Not granted** |

**Overall:** **BLOCKED for import and production cutover** until business approval and remaining technical prerequisites are complete.

---

## 1. Technically preferred recovery candidate (not business-approved)

Recorded from Phase 8B.4C for continuity. This is a **technical preference only**.

| Field | Value |
| --- | --- |
| Alias | **153455** |
| Filename | `ledger-20261120-153455.json` |
| Exact absolute path | `C:\Users\SRSB HR SOLUTIONS\OneDrive\Desktop\associate\_SECURE_BACKUPS_OUTSIDE_GIT\raw-20261120\data__backups__ledger-20261120-153455.json` |
| Full SHA-256 | `f33905001a17c26e8b6ac68927e1f19060cecfc64f233a32409799c3e510844a` |
| Bytes | 18 182 |
| Quarantine `.aes` twin | `…\encrypted-20261120\data__backups__ledger-20261120-153455.json.aes` (SHA-256 `10231e3fd716db27e63b81dadcf60fc3cd2ec20fb126c3a856e4a77db0ed0d31`) |
| Packaging twin (byte-identical) | `…\handover-fresh-20261120-165344\ledger.json` (same SHA-256) |

### Snapshot profile (aggregates only)

| Metric | Value |
| --- | ---: |
| IT clients | 6 |
| GST clients | 4 |
| IT filings | 29 |
| GST filings | 38 |
| IT fees / received / balance | 302 700 / 241 200 / 61 500 |
| GST billed (`total`) / received | 687 830 / 268 500 |
| Plaintext portal `password` fields | 0 |
| `passwordEnc` fields | 2 |
| Zero-filing IT shells | 1 |
| Far-future catalog labels (`209x`) | 3 AY + 2 GST months |

**Explicit statement:** 153455 is **not** an approved business source of record. Business owners must still approve or reject it (or name a different frozen path + SHA-256).

---

## 2. Decisions requiring business-owner approval

Complete before any freeze-for-import or import implementation kickoff.

### Decision A — Client set

| Question | Context |
| --- | --- |
| Are **6 IT** and **4 GST** clients the correct production set? | Matches 153455 / handover. HEAD has 5 IT / 4 GST (same money on shared core). 143655 has extras rejected for technical contamination. |

**Owner answer required:** Approve 6/4 · Reject · Prefer another named file.

### Decision B — Zero-filing IT shell

| Question | Context |
| --- | --- |
| Should the **zero-filing IT shell** in 153455 remain? | Present only as a client row with **0** filings; carries a `passwordEnc` field. No impact on IT fee/received/balance totals. 153603 adds a **second** shell — not preferred technically. |

**Owner answer required:** Keep · Remove under controlled edit before freeze · Prefer HEAD (no shells).

### Decision C — `209x` catalog labels

| Question | Context |
| --- | --- |
| Should far-future assessment-year / GST-month labels (`209x`) remain? | Present in 153455 catalogs (3 AY + 2 months). Absent from HEAD. May be test pollution retained after synthetic GST extras were dropped. |

**Owner answer required:** Keep as-is · Clean catalogs in a controlled pre-freeze edit · Prefer HEAD catalogs.

### Decision D — Formal SoR designation

| Question | Required output |
| --- | --- |
| Which file is the authoritative recovery/import source? | Exact absolute path + full SHA-256 + dated owner signature / written approval |
| Is Git HEAD ledger approved, rejected, or superseded? | Explicit status |
| Is 153455 approved, rejected, or approved-with-edits? | Explicit status |

Until Decision D is recorded in writing, Phase 8B.4 **Gate 0** remains open.

---

## 3. Secure handling of PII and portal credentials

153455 has **no plaintext portal passwords**, but the JSON still contains business PII (names, contact fields, identifiers, remarks, etc. — not listed here). Handle as confidential throughout.

| Rule | Requirement |
| --- | --- |
| Storage | Keep approved source **outside** live `data/ledger.json` and **outside** Git. Prefer existing quarantine tree or a new frozen path under a secure non-repo directory. |
| Access | Limit to authorized owners/operators; do not paste ledger content into chat, tickets, or commits. |
| Portal secrets | Never print or log portal passwords / `passwordEnc` ciphertext / archive keys / `PORTAL_PASSWORD_ENCRYPTION_KEY`. |
| Archive key | `_SECURE_BACKUP_KEY\backup-archive.key` stays escrowed separately from ciphertext; load only on authorized secure-machine verify. |
| Runtime backup key | `BACKUP_ENCRYPTION_KEY` / file is separate from archive key and from portal key — do not reuse. |
| Pre-import | Ensure PG columns store encrypted portal material only; **zero** plaintext password columns after import verify. |
| 153455 status | Already post-encrypt for portal fields (0 plaintext / 2 `passwordEnc`) — still treat whole file as sensitive PII. |
| If HEAD (or any pre-encrypt file) were ever chosen instead | Encrypt portal passwords under controlled key continuity **before** any PG import; do not import plaintext. |
| Disposal | Do not delete quarantine originals without dual confirmation; prefer freeze-by-copy only after approval (copy is a **future authorized step**, not done in 8B.4D). |

---

## 4. Checklist — freeze approved source (future, after owner approval)

Do **not** execute until Decision D is written. Checklist for the operator when ready:

- [ ] Owner recorded approved path + full SHA-256 + date.  
- [ ] Recalculate SHA-256 of the approved file; must match the recorded hash.  
- [ ] Optional: authorized `.aes` round-trip verify for 153455 twin (Phase 6A `BK1` codec) — decrypt to temp only; compare SHA; delete temp; **do not** write live `data/`.  
- [ ] Create a **frozen copy** outside the repo and outside live `DATA_DIR` (name includes date + short hash prefix).  
- [ ] Re-hash the frozen copy; confirm identity with approved SHA-256.  
- [ ] Set `LEDGER_IMPORT_PATH` to the frozen copy (env / secrets store — not committed).  
- [ ] Record freeze manifest entry: path, SHA-256, bytes, approver, date, decisions A–C outcomes.  
- [ ] Confirm live `data/ledger.json` was **not** overwritten by the freeze step.  
- [ ] Confirm freeze copy is listed in `.gitignore` / outside Git tracking.

---

## 5. Checklist — future import verification (after freeze + tooling ready)

Local rehearsal first; production only with separate authorization (§7).

### Pre-import

- [ ] Frozen path + SHA-256 still match.  
- [ ] Phase 5-style audit on frozen file (counts, money, duplicate ids, plaintext password count) — no PII in logs.  
- [ ] Decisions A–C reflected in frozen content (or documented accepted residuals).  
- [ ] `PORTAL_PASSWORD_ENCRYPTION_KEY` continuity confirmed for any `passwordEnc` already present.  
- [ ] Target org strategy chosen: **provision-then-import** (needs org-aware import) **or** import-then-attach-owners.  
- [ ] Empty / conflict probes on target DB (business tables) documented.  
- [ ] Dry-run report produced (path, SHA-256, counts, aggregates, org mode) — no PII.

### Post-import (local or authorized staging)

- [ ] `verify:ledger:pg` (or successor) **PASS** on counts and financial aggregates.  
- [ ] IT/GST id sets match frozen source.  
- [ ] Portal: expected `password_enc` count; **zero** plaintext password columns.  
- [ ] Catalog years/months match approved freeze (including intentional keep/clean of `209x`).  
- [ ] Both owners see identical client/company counts and sample totals (two-owner smoke).  
- [ ] `AUTH_ORGANIZATION_ID` equals imported business `organization_id`.  
- [ ] Audit pack retained: freeze SHA-256, import log (counts only), verify output, DB snapshot if available.

---

## 6. Missing prerequisites for production readiness

These block **production** import/cutover even after business approval of 153455. Local implementation/testing may proceed only within the bounds of §7.

| Prerequisite | Status | Why it matters |
| --- | --- | --- |
| Business SoR approval (path + SHA-256) | **Missing** | Gate 0 |
| Frozen `LEDGER_IMPORT_PATH` | **Missing** | Import must not use live mutable ledger |
| Org-aware JSON→PG import (bind existing org / skip second org) | **Missing** | 8B.3 two-owner provision conflicts with current Phase 2 “create org + refuse if any auth rows exist” |
| Import empty-guard scoped to business tables | **Missing** | Allow provisioned users/org/sessions when loading ledger rows |
| Dry-run / report-only import mode | **Missing** | Safe rehearsal |
| Remote import safety gates (8B.2-style ACK/token for managed PG) | **Missing** | Phase 2 import still localhost-oriented for safety |
| **PostgreSQL backup** (managed snapshots / `pg_dump` runbook) | **Missing / BLOCKED** | Phase 8A: no in-app PG backup when business backend is Postgres |
| **PostgreSQL restore testing** (verified drill on staging) | **Missing / NOT IMPLEMENTED** | Cannot declare PG SoR without a tested restore path |
| **Hosted password reset** usable on phones | **BLOCKED** | Phase 8A: reset depends on server-local token files — unsuitable for phone-only owners |
| Production two-owner provision on target host | Implemented as CLI (8B.3) but **not authorized for prod** until ops checklist + secrets | Separate from ledger approval |
| JSON encrypted backup behavior under PG SoR | **BLOCKED** | App refuses JSON backup/restore in Postgres business mode — ops must rely on DB backups |
| Production secret manager / TLS / host hardening | Partial (8A/8B.1–8B.2) | Must be complete before go-live, not only before local rehearsal |

### Especially critical (call out)

1. **PostgreSQL backup + restore drill** — without this, a successful import still leaves production without a recoverable SoR story.  
2. **Hosted password reset** — two-owner production on phones remains operationally blocked until an out-of-band or hosted reset channel exists.  
3. **Org-aware import tooling** — required so provisioned owners and imported ledger share one organization UUID.

---

## 7. Local implementation/testing vs production authorization

Keep these lanes separate.

| Lane | Allowed (after relevant gates) | Forbidden without explicit written authorization |
| --- | --- | --- |
| **Local / disposable DB** | Implement org-aware import; dry-run; import frozen copy into empty **local** test DB; `verify:ledger:pg`; two-owner smoke on localhost | Using production connection strings; remote migrate/import; writing approved SoR into live `data/ledger.json` |
| **Staging / managed non-prod** | Only with written staging approval + remote safety gates + DB snapshot before write | Treating staging success as production cutover |
| **Production** | None until: business SoR approval, freeze checklist, PG backup/restore drill, password-reset plan, remote gates, cutover runbook sign-off | Import, migrate, provision, deploy, backend switch, restore into prod |

**This phase (8B.4D)** does not authorize any of the above write paths. It only documents the approval and readiness gate.

---

## 8. Suggested owner response template

Copy and complete when ready (no secrets):

```text
Phase 8B.4 Gate 0 — Source approval
Date:
Approver:

Decision A (6 IT / 4 GST): Approve / Reject / Other:
Decision B (zero-filing IT shell): Keep / Remove before freeze / Prefer other:
Decision C (209x catalogs): Keep / Clean before freeze / Prefer other:
Decision D — Approved source path:
Decision D — Approved SHA-256:
Git HEAD ledger status: Approved / Rejected / Superseded by above

Notes:
```

---

## 9. Recommended next steps (ordered)

1. Owners complete §8 template (Gate 0).  
2. If 153455 (or another path) is approved: execute §4 freeze checklist.  
3. Implement org-aware import + dry-run (local only) — proposed Phase 8B.5 work, after Gate 0.  
4. Parallel ops: PG backup/restore drill design; hosted password-reset approach.  
5. Only then consider staging rehearsal and, separately, production authorization.

**Do not start import implementation execution against any shared/production database in this phase.**

---

## Stop line

Phase **8B.4D** complete — recovery approval and import-readiness documentation only.  

**153455 recorded as technical preference only.**  
**Business source approval: not granted.**  
**No ledger files modified or copied. No import started.**
