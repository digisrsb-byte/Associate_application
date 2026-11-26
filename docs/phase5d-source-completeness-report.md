# Phase 5D — Find Complete IT/GST Business Data Source

**Mode:** READ-ONLY. No workbook save/recalc, no DB, no import, no application code/config changes for cutover.  
**No names, PAN, GSTIN, phones, emails, passwords, or financial cell values appear below.**

Machine-readable evidence: `docs/phase5d-source-completeness.json`  
Inspector: `scripts/phase5d-source-completeness.mjs`

Prior inputs used: `docs/phase5-migration-plan.md`, `docs/phase5b-excel-structure-report.md`, `docs/phase5c-excel-verify-report.md`.

---

## Final verdict

# INCOMPLETE SOURCE — ORIGINAL DATA REQUIRED

No inspected candidate is a complete, trustworthy production SoR for IT **and** GST at the scale implied by the Filing Master spine (~1,164–1,918 clients / ~4,526 All Data rows). Populated Excel exports and all ledger snapshots are **demo/dev scale** (≤30 IT clients / ≤8 GST companies).

---

## 1. Candidate identity (metadata)

| Source | Bytes | SHA-256 (full) | Role |
| --- | ---: | --- | --- |
| Downloads IT `2019-2027_2026-11-19` | 20,146 | `9f71843866bbfbe6b81c77288fb9b4491a74ed332f9fdd624f20b3b36c85cd2e` | Small populated export |
| Downloads IT `2019-2027_2026-11-20` | 23,291 | `d8f6a723965564a74f4956d6122571dcb33ca987db289ce1b17adc24b6f7e772` | Small populated export (DEMO-like) |
| Downloads GST `Apr2025-Mar2027_2026-11-20` | 10,583 | `539cefab0b8b12dff7908e051e8f341e90f871195f1abd88c6dcbaafa17d79d44` | Empty period skeleton |
| Downloads IT `2019-2026 - Copy` (selected) | 987,844 | `2c31ce62a7993dc0715250044a255262d14b3aec58023f728ba09e3ef6d8faaf` | Large incomplete master |
| Desktop `\xl\` IT `2019-2026 - Copy` | 987,844 | **identical** to selected | Byte twin of selected |
| App `Filing_Master_Report_DEMO.xlsx` | 23,322 | `8c0646857530771ff1928c9bb573b95da1efc7d7ddcef5b292eadb09626dc139` | Packaged DEMO |
| App `GST_Filing_Master_Report_DEMO.xlsx` | 16,574 | `d18f17f4c7f828898db31b5d3c8d320f285b9f6f889d883622bd15e5851683d6` | Packaged DEMO |
| Live `data/ledger.json` | 423 | `beb82175…` | Catalog-only empty business |
| Git `HEAD:data/ledger.json` | 17,933 | `242d9ba0…` | Small populated snapshot |
| Secure raw ledger set | 13 files | (per-file in JSON) | Dev/handover backups, max 8 IT / 5 GST |
| Secure handover `ledger.json` | 18,182 | (in JSON) | 6 IT / 4 GST |
| E2E aside ledger | 23,890 | `ce54746f…` | Test isolation (30 IT / 8 GST) |
| `_GIT_RECOVERY_BACKUPS` | git bundle + manifests | — | Repo recovery, **not** a ledger SoR |
| `LEDGER_IMPORT_PATH` | unset | — | No operator frozen import path |

Identical-content group: selected Downloads IT Copy ≡ Desktop `\xl\` Copy (same SHA-256).

Nov 20 IT export is **not** byte-identical to app DEMO (different hash/size) but matches DEMO **shape and scale** (29 All Data rows / 5 clients / fully populated critical fields).

---

## 2. Excel completeness

### IT workbooks

| Metric | Nov 19 export | Nov 20 export | DEMO | Selected / Desktop twin |
| --- | ---: | ---: | ---: | ---: |
| Sheets | Year / All Data / Client / Mobile / Review / Notes | same | same | same |
| All Data rows | 9 | 29 | 29 | **4,526** |
| Distinct Client IDs | 3 | 5 | 5 | **1,918** |
| Client Summary IDs | 3 | 5 | 5 | **1,164** |
| Orphans (All Data only) | 0 | 0 | 0 | **754** |
| Name populated | 9 | 29 | 29 | **0** |
| PAN populated | 9 | 29 | 29 | **0** |
| Filing Date populated | 7 | 29 | 29 | **0** |
| Fees / Received populated | 9 / 9 | 29 / 29 | 29 / 29 | **0 / 0** |
| Outstanding populated | 4 | 12 | 12 | **0** |
| Classification | demo-scale export | demo-scale export | demo | **incomplete original structure** |

Assessment years: small exports cover a handful of AY fingerprints; the incomplete master retains the multi-year Filing Master spine (Phase 5B/5C).

### GST workbooks

| Metric | Downloads `Apr2025–Mar2027` | App GST DEMO |
| --- | ---: | ---: |
| Sheets | Month Summary, All Data, Company Summary, Notes | Month Summary, All Data, Sheet View, Company Summary, Notes |
| All Data rows | **0** | 37 |
| Company Summary rows | **0** | 3 |
| Month Summary rows | 26 period labels | 22 |
| Months with non-zero company/fee totals | **0 / 0** | (demo has populated All Data) |
| Identity / fees on All Data | none | 37 / 37 |
| Classification | **empty period skeleton** | demo-scale populated export |

Downloads GST is **not** a usable GST source: period headers exist through Mar 2027, but company filings and company master rows are absent.

---

## 3. Ledger / recovery completeness

| Source | IT clients | IT filings | GST cos | GST filings | Identity filled | Fees on filings | Notes |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| Live ledger | 0 | 0 | 0 | 0 | — | — | Not SoR |
| Git HEAD | 5 | 29 | 4 | 38 | yes | yes | Small snapshot |
| Secure handover | 6 | 29 | 4 | 38 | yes | yes | Near-HEAD variant |
| E2E aside | 30 | 26 | 8 | 12 | yes | partial | Test data; synthetic-scale fees |
| Secure raw (largest file 119,487 B) | 8 | 29 | 5 | 39 | yes | yes | Large bytes ≠ production scale (likely long ciphertext/fields) |
| Other secure-raw snapshots | 0–7 | 0–30 | 0–5 | 0–38 | varies | varies | Dev progression backups |
| Git recovery bundle | — | — | — | — | — | — | Repository mirror only |

`LEDGER_IMPORT_PATH` is **not set**. Encrypted twins exist under `_SECURE_BACKUPS_OUTSIDE_GIT\encrypted-20261120` for the same 13 ledger/auth artifacts; content matches the raw set already counted (no additional production-scale ledger found).

---

## 4. Comparison vs what PostgreSQL needs

| Need | Best Excel | Best ledger | Gap |
| --- | --- | --- | --- |
| ~1k+ IT clients with name/PAN/phone | Incomplete master has IDs+names on Client Summary only (1,164); All Data identity blank | Max **30** clients (E2E) | Production-scale identity+filings missing |
| IT filings with fees + filing dates | Only demo-scale Excels (≤29 rows) have fees/dates | Max **30** filings | Cannot fill 4,526-row spine |
| GST companies + period filings | Only GST DEMO (3 cos / 37 filings) | Max **8** companies | Downloads GST empty |
| No guessing / no data loss | — | — | **Blocked** |

---

## 5. Trustworthiness labels

| Candidate | Label |
| --- | --- |
| Selected / Desktop IT `2019-2026 - Copy` | Possible original **structure**, **incomplete** content (Phase 5C confirmed) |
| Nov 19 / Nov 20 IT Excels | **Export / near-DEMO**, not production master |
| App IT/GST DEMO | **Demo** fixtures |
| Downloads GST Apr2025–Mar2027 | **Empty template / skeleton** |
| Live ledger | Empty business store |
| Git HEAD / secure-raw / handover | **Backup / snapshot**, demo-dev scale |
| E2E aside | **Test isolation**, not production |
| `_GIT_RECOVERY_BACKUPS` | **Repo recovery**, not business SoR |

---

## Evidence → verdict

1. The only large IT workbook remains fee/identity-blank on All Data.  
2. Newer dated IT Excels are tiny and populated like DEMO — they do **not** replace the master.  
3. Dated GST Excel has **zero** company filing rows.  
4. Every JSON ledger (live, HEAD, secure-raw, handover, E2E) tops out at **30** IT clients — orders of magnitude below the Excel client spine.  
5. Therefore a complete trustworthy IT+GST source was **not** found on this machine among the listed candidates.

### Next recommended action

1. Obtain operator-provided **complete** IT All Data (populated identity + fees + filing dates) and **complete** GST All Data (company identity + period filings), **or** a frozen `ledger.json` of matching production scale.  
2. Place that artifact outside the live `data/` tree, fingerprint it, set `LEDGER_IMPORT_PATH` only after written approval.  
3. Re-run Phase 5 audit + `import:ledger:pg` rehearsal on `it_gst_management_dev` only — **do not** import any current candidate into PostgreSQL as production.
