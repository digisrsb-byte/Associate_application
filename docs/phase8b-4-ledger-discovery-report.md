# Phase 8B.4 — Existing Ledger Data Discovery and Import Planning

**Date:** 2026-11-25  
**Mode:** Strictly read-only (no import, no production DB, no backend cutover, no deploy)  
**Related:** Phase 5 source audit refresh (`docs/phase5-ledger-source-audit.json`), Phase 2 import (`db/PHASE2_IMPORT.md`), Phase 6 Excel import, Phases 8A–8B.3  

---

## Verdict

# BLOCKED — SOURCE CONFIRMATION REQUIRED

Multiple candidate ledgers disagree (empty live JSON vs richer Git snapshot vs synthetic E2E aside vs offline recovery trees). **No authoritative production source is selected in this phase.** Operator confirmation is mandatory before any import implementation or execution.

**Secondary (also blocking for a future import):** import tooling today cannot safely load business rows into an already-provisioned shared organization without further safeguards (see §5–§6).

---

## 1. Candidate source inventory

Counts and fingerprints below are from the read-only auditor (`scripts/phase5-ledger-source-audit.mjs` → `docs/phase5-ledger-source-audit.json`). **No PAN, names, phones, passwords, or ciphertext are printed.**

| Source ID | Exact path | Type / size | IT / GST / filings | Finance snapshot (aggregates only) | Classification | Sensitive? |
| --- | --- | ---: | --- | --- | --- | --- |
| **live-data-ledger** | `Associate_application/data/ledger.json` | JSON · **423 B** · mtime 2026-11-25 | 0 / 0 / 0+0 | All zeros | **Empty catalogs only** — not a business SoR | Low (no clients) |
| **git-head-data-ledger** | `data/ledger.json` @ Git `HEAD` | JSON · **17 933 B** | **5 / 4 / 29+38** | IT fees 302 700 · recv 241 200 · bal 61 500; GST billed 687 830 · recv 268 500 | **Historical VCS snapshot** — richest in-repo non-test ledger | **Yes** — quality flag: **9 plaintext portal password fields** + expected enc count mismatch |
| **e2e-aside-ledger** | `data-e2e.onedrive-aside-20261123-173801/ledger.json` | JSON · **23 890 B** | **30 / 8 / 26+12** | IT fees ~1.00e8 · GST fees ~5.00e7 (synthetic scale) | **E2E isolation aside — not production** | Yes (test portal enc) |
| **demo-ledger-shape-fixture** | under `scripts/fixtures/` (shape fixture in audit) | JSON · **513 B** | 1 / 0 / 0 | Zeros | Shape/demo only | Low |
| **live data/backups** | `data/backups/` | — | — | — | **Absent / empty** on this workspace | N/A |
| **data-e2e ledger** | `data-e2e/ledger.json` | JSON · **423 B** | 0 / 0 | Zeros | Current E2E working copy (empty business) | Low |
| **data-e2e backups** | `data-e2e/backups/*.json.enc` | Encrypted · ~25–27 KB each (10 retained) | Unknown without decrypt | Unknown | **E2E Stage 7C artifacts only** | Yes (ciphertext + needs backup key) |
| **LEDGER_IMPORT_PATH** | *(env unset)* | — | — | — | No operator frozen copy configured | — |
| **Offline recovery trees** | `../_GIT_RECOVERY_BACKUPS`, `../_SECURE_BACKUPS_OUTSIDE_GIT` | Git bundles/mirrors + `encrypted-*` / `raw-*` / `handover-fresh-*` trees (multiple files; some ~12–119 KB) | **Not decoded in this audit** | Unknown | **Possible real historical copies — operator must inventory** | **Likely yes** — do not commit; treat as confidential |
| **Excel/CSV standing sources** | *(none found under app tree)* | — | — | — | No checked-in production workbook | — |
| **PostgreSQL** | local `it_gst_management_dev` / future prod | DB | Out of scope to treat as SoR | — | Dev may hold schema/test rows; **not** declared production SoR | — |

### Duplicate / conflict indicators (sources vs each other)

| Pair | Evidence |
| --- | --- |
| Live vs Git HEAD | **Different** — live 0 clients vs Git 5; id-set fingerprints do not match |
| Git HEAD vs E2E aside | **Different** id-set hashes (`88cc6b15494e` vs `989c420e3849` IT); fee magnitudes diverge sharply |
| Intra-file duplicates | Auditor: **no** duplicate IT/GST ids inside analyzed JSON sources |
| Balance math | Auditor: **0** IT balance mismatches vs fees−received; **0** GST total mismatches vs fees+interest+tax (in analyzed sources) |

### Date range

Filings are labeled by assessment year / GST month strings inside JSON (catalogs present). Exact calendar span of “real business history” **cannot** be asserted until the operator names the SoR; Git snapshot catalogs include multiple AY/month labels (10 years / 24 months in HEAD snapshot).

---

## 2. Evidence for a *likely* authoritative source (not selected)

| Candidate | Why it might matter | Why it is **not** auto-selected |
| --- | --- | --- |
| Client machine / operator export | True production SoR for a practice app | **Not present** as a designated frozen path in this workspace |
| Git HEAD ledger | Only in-repo non-empty non-E2E ledger with plausible small practice scale | May be stale UAT; contains **plaintext password fields**; not confirmed by owners |
| Offline `_SECURE_BACKUPS_OUTSIDE_GIT` | Sized artifacts consistent with full ledgers / enc backups | Contents **not opened** here; may mix handover-empty and historical raw |
| Live `data/ledger.json` | Current runtime default | **Empty of business rows** — importing it would wipe meaning into empty PG |
| E2E aside | Large / complete shape | Synthetic fee scale; wrong id fingerprint — **reject for production** |

**Ask the operator to confirm one frozen file** (path + SHA-256) before any import work. Preferred order:

1. Export from the **machine of record** (current production JSON or approved backup decrypt → frozen copy).  
2. Else explicitly approve a specific offline backup artifact after review.  
3. Else explicitly approve Git HEAD **only** after business review of counts above.  
4. **Never** approve E2E aside / `data-e2e` for shared owner production without written exception.

---

## 3. Data quality findings (analyzed JSON)

| Issue | Where | Import impact |
| --- | --- | --- |
| Empty live ledger | `data/ledger.json` | Must not be used as SoR |
| Plaintext portal passwords | Git HEAD snapshot (9 fields) | Must encrypt via `portalCrypto` / import mapper; never store plaintext in PG |
| `passwordEnc` vs plaintext inconsistency | Git HEAD (`passwordEncExpected=1` vs plaintext present) | Rehearse with real `PORTAL_PASSWORD_ENCRYPTION_KEY` continuity |
| Missing timestamps | Demo fixture only | Fixture unsuitable; real SoR must have ISO timestamps |
| Catalog-only years/months | Live + Git | Importer must preserve empty catalog periods (Phase 2 already unions catalogs) |
| Global PK on client/company ids | Schema 001 | Single-org import model required; ids must stay unique in DB |

---

## 4. Import implementation assessment

### A. Phase 2 JSON → PostgreSQL (`import:ledger:pg` / `verify:ledger:pg`)

| Capability | Status |
| --- | --- |
| Frozen path required (`LEDGER_IMPORT_PATH`, not live file) | Ready |
| Localhost + confirm env | Ready (remote import gates **not** yet wired like 8B.2 migrate) |
| Refuse non-empty business tables | Ready — **but** empty check includes `organizations`, `users`, `organization_members`, `sessions` |
| Creates **new** `organizations` row | Ready — **conflicts** with 8B.3 “provision org first” unless sequenced carefully |
| Maps IT/GST clients, filings, catalogs, money | Ready |
| Encrypts portal passwords | Ready (requires key) |
| Verify counts + financial aggregates | Ready (`verify:ledger:pg`) |
| Does **not** create owner users/memberships | By design — owners via 8B.3 |
| Idempotent re-import / merge into existing org | **Not implemented** — second run refused if tables non-empty |
| Bind to existing `AUTH_ORGANIZATION_ID` | **Not implemented** |

**Conclusion:** Phase 2 can import a frozen JSON ledger into an **empty** local DB and verify totals, but it **cannot** today safely:

- Import into an org that already has two owners provisioned, **or**  
- Attach imported business rows to a pre-created organization UUID without creating a second org.

### B. Phase 6 Excel import (runtime wizard)

| Capability | Status for **historical SoR cutover** |
| --- | --- |
| Merge/update/replace into **current** ledger | Designed for ongoing Excel loads |
| Session auth + org scoping | Ready for runtime |
| Duplicate filing rules (update/skip) | Ready for incremental Excel |
| Replace domain entities | Can delete entities missing from file — **dangerous** as sole historical loader |
| Full JSON→PG freeze/verify | **Not** a substitute for Phase 2 bulk import |

**Conclusion:** Excel import is **not** the primary path for one-shot historical SoR migration into PostgreSQL. Use it later for ongoing updates after cutover.

### C. Shared-org / two-owner visibility

Once business rows sit under a single `organization_id` and both owners are `organization_members` with `role=owner` for that id, both see the same IT/GST data (Phase 4 / 8B.3 design). **Provisioning and import must converge on the same organization UUID.**

---

## 5. Reconciliation strategy (future import)

After an approved frozen source and an import-into-org-capable tool:

| Check | Method |
| --- | --- |
| Entity counts | Frozen summary vs `it_clients` / `gst_companies` / filings / catalogs |
| Id sets | Sorted IT/GST ids must match (existing verify) |
| Money | Sum fees/received/balance; GST fees/interest/tax/total/received (existing verify + near-equal) |
| Portal secrets | `password_enc` non-null count == expected; **zero** plaintext columns |
| Relationships | Filing FKs to catalogs; client id FK for filings |
| Duplicates | Pre-import: duplicate id scan; post-import: unique constraints |
| Missing refs | Preflight fail on filing year/month absent from catalog union |
| Owner visibility | Login Owner A and Owner B → identical client/company counts and sample totals |
| Org binding | `AUTH_ORGANIZATION_ID` == import org id; both memberships present |
| Audit | Retain frozen SHA-256, import log (counts only), verify `PASS`, optional PG dump |

Dry-run report should include: source path, SHA-256, counts, finance aggregates, plaintext-password remediation count, target org id mode (`create-new` vs `use-existing`), and empty-table / conflict probes — **no PII**.

---

## 6. Proposed future import sequence

1. **Operator confirms authoritative source** (path + SHA-256 + business sign-off).  
2. **Preserve untouched copy** outside `data/ledger.json`; set `LEDGER_IMPORT_PATH`.  
3. **Validate & map** (phase5 audit + portal key continuity check).  
4. **Dry-run report** (no writes, or write only to disposable local DB).  
5. **Review reconciliation diffs**; fix source issues (plaintext passwords encrypted in frozen copy if required).  
6. **Explicit written approval** for target DB identity (local rehearsal then remote).  
7. **Import into the approved shared organization** (implementation must support existing org id — see gaps).  
8. **Verify** (`verify:ledger:pg` or successor) + two-owner UI/API smoke.  
9. **Audit trail + recovery**: keep frozen JSON, verify output, PG snapshot; rollback = restore snapshot / keep JSON SoR until soak ends.

### Implementation changes required before production import

| # | Change | Why |
| --- | ---: | --- |
| 1 | Operator source confirmation workflow | Multiple candidates |
| 2 | Import into **existing** `organization_id` (no second org; skip creating users) | Align with 8B.3 owners |
| 3 | Empty-table guard: allow users/sessions/org row when importing business tables only | Provision-before-import |
| 4 | Or reverse sequence: import-first then **attach** owners to imported org (provision must support existing org id) | Alternative sequencing |
| 5 | Remote import safety gates (8B.2-style) for managed PG | Production host |
| 6 | Dry-run / report-only mode | Approval without write |
| 7 | Portal plaintext scrub in frozen copy before import | Git HEAD quality issue |
| 8 | PG backup/restore runbook before declaring PG SoR | Phase 8A gap |

---

## 7. Risks and missing prerequisites

| Risk | Severity |
| --- | --- |
| Importing empty live ledger | **Critical** — empty production |
| Importing E2E aside | **Critical** — wrong synthetic data |
| Unconfirmed Git HEAD as SoR | **High** — may be incomplete/stale UAT |
| Plaintext passwords in historical JSON | **High** — must encrypt; key continuity |
| Provisioned org ≠ imported org | **Critical** — owners see empty ledger |
| Re-import refused / partial state | **High** — need clear ops runbook |
| Offline recovery trees unread | **High** — real SoR may live only there |
| No Excel file of record in repo | Medium — may exist only on client PC |

---

## 8. Recommended next implementation task

**Phase 8B.5 (proposed):** after the operator names the frozen SoR,

1. Implement **org-aware ledger import** (import business tables into an existing provisioned organization **or** provision-into-imported-org).  
2. Add **dry-run** + remote safety confirms.  
3. Rehearse on local test/dev DB with verify + two-owner smoke.  

**Do not** begin import execution or production cutover in that phase without the source confirmation captured in writing.

---

## Operator confirmation checklist (please answer)

1. Which file is the authoritative ledger? (full path)  
2. SHA-256 of that file?  
3. Is Git HEAD `data/ledger.json` approved, rejected, or unknown?  
4. Should offline `_SECURE_BACKUPS_OUTSIDE_GIT` / `_GIT_RECOVERY_BACKUPS` be inventoried next (decrypt on a secure machine)?  
5. Preferred sequence: **provision org then import**, or **import then attach owners**?

---

## Stop line

Phase **8B.4** complete — discovery and planning only.  
**No import executed. No production database used. No backend switch.**

**Verdict: BLOCKED — SOURCE CONFIRMATION REQUIRED**
