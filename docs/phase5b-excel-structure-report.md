# Phase 5B — Original IT Excel Structure Inspection

**Mode:** READ-ONLY. No workbook modification, copy, import, PostgreSQL connection, or app config changes.  
**No cell values, names, PAN, phones, or credentials are included below.**

Machine-readable dump: `docs/phase5b-excel-structure-inspect.json`  
Inspector: `scripts/phase5b-excel-structure-inspect.mjs`

---

## 1. Confirmed inspected file

| Property | Value |
| --- | --- |
| Path | `C:\Users\SRSB HR SOLUTIONS\Downloads\Filing_Master_Report_2019-2026 - Copy.xlsx` |
| Size at inspection | 987,844 bytes |
| SHA-256 | `2c31ce62a7993dc0715250044a255262d14b3aec58023f728ba09e3ef6d8faaf` |
| Modified (filesystem) | 2026-11-24T12:19:22.166Z |

---

## 2. Worksheet inventory

| # | Sheet | Non-empty rows | Role |
| --- | --- | ---: | --- |
| 1 | Year Summary | 14 (title + header ~row 4 + ~8–10 data/total) | AY aggregates (mostly formulas) |
| 2 | **All Data** | **4,527** (1 header + **4,526** data) | Filing-level fact table (primary import source for the app) |
| 3 | Client Summary | 1,920 (1 header + 1,919 body; **1,164** rows with Client ID) | Client-level wide summary by AY |
| 4 | Mobile Summary | 1,569 | Mobile-level rollup (almost entirely formulas; key cols empty in file) |
| 5 | Review Needed | 169 (header ~row 4 + 166 notes) | Data-quality checklist |
| 6 | Notes | 11 | Documentation of how the workbook was built |

Matches app-recognised IT sheets (`excelImport.ts`): All Data, Client Summary, Mobile Summary, Year Summary, Review Needed. Extra sheet: **Notes** (ignored by importer).

No Excel Tables detected. **No data-validation dropdown rules** detected via ExcelJS. Merged ranges: **0** on inspected sheets. One workbook defined name (count only).

---

## 3. Headings and field mapping

### All Data (filing grain — 1 row ≈ 1 client × assessment year)

| Excel heading | Maps to app / PostgreSQL | Notes |
| --- | --- | --- |
| Assessment Year | `it_filings.assessment_year` + `assessment_years.label` | Stored strings; **8** distinct fingerprints |
| Sl No | *(not stored)* | Sequence helper |
| Name | `it_clients.name` | **Column present but all 4,526 data cells empty in this file** |
| PAN | `it_clients.pan` | **All empty** in All Data |
| Mobile (primary) | `it_clients.phone` | **All empty** |
| Other Mobile(s) | `it_clients.other_mobiles` | **All empty** |
| Filing Date | `it_filings.filing_date` | **All empty** |
| Filing Note | *(no PG column)* | Would be lost unless mapped to `remark` |
| Amount Billed | `it_filings.fees` | **All empty** (critical) |
| Received | `it_filings.received` | **All empty** (critical) |
| Outstanding | derived `balance` (fees − received) | **All empty**; app recomputes balance |
| Payment Mode | `it_filings.payment_type` | **3,726** filled / **800** empty; **15** distinct modes |
| Payment Date | `it_filings.payment_receive_date` | **3,683** dates (`dd-mmm-yyyy`); **843** empty |
| Client ID | joins to client (`pan` / id) | **4,526** filled; **1,918** distinct fingerprints |
| Amount Note | *(no PG column)* | Sparse (**127** non-empty) |
| First Mobile+Client (helper) | *(not stored)* | **4,526** formulas, pattern `IF(AND(E…COUNTIFS($E,$N)…))` — helper flag |

### Client Summary (client grain)

| Excel heading | Maps to | Notes |
| --- | --- | --- |
| Client ID (PAN) | `it_clients.pan` (and often becomes identity) | **1,164** non-empty; **0** duplicates among those |
| Client Name (latest) | `it_clients.name` | **1,164** non-empty |
| Mobile (latest) | `it_clients.phone` | **1,142** numbers stored |
| Other Mobile(s) | `it_clients.other_mobiles` | **140** non-empty |
| AY 2019-20 … AY 2026-27 | per-AY billed (wide) | Formula-driven; many uncached results in file |
| Years Filed / First AY / Last AY / Total Entries | derived | Formulas |
| Total Billed / Received / Outstanding | derived | Formulas present; results largely **uncached** in file |
| Name Variants (if differ) | `it_clients.name_variants` | **87** non-empty |

### Year Summary (after title rows)

Headings (row 4): Assessment Year, Entries, Unique Clients, Amount Billed, Received, Outstanding, Collection %, Times Filed (years), Clients — **report-only**; app recomputes from filings.

### Mobile Summary

Headings align with app mobile report. Identity columns empty in stored cells; body is formula-heavy — **not** a migration source of truth.

### Not present in workbook (but in app/PG)

- Portal password / `password_enc`
- `reference_number`, free-text `remark` (except possible reuse of Filing Note / Amount Note)
- GST entities (IT workbook only)
- Explicit payment ledger rows (payments are cumulative fields on the filing row)

---

## 4. Row counts and duplicate / missing patterns (counts only)

| Metric | Count |
| --- | ---: |
| All Data filing rows | 4,526 |
| Distinct Assessment Year fingerprints | 8 |
| Distinct Client ID fingerprints (All Data) | 1,918 |
| Client Summary rows with Client ID | 1,164 |
| Client Summary blank Client ID rows | 755 |
| All Data Payment Mode missing | 800 |
| All Data Payment Date missing | 843 |
| All Data Name/PAN/Mobile/Filing Date/Fees/Received/Outstanding filled | **0** |
| Client Summary name-variant rows | 87 |

**Structural implication:** In this file, **All Data identity/money columns are blank**; client master attributes live mainly on **Client Summary**, while All Data still carries AY + Client ID + payment mode/date. That is a **major import risk** relative to the app’s All-Data-first importer (which expects PAN/Name/fees/received on All Data).

---

## 5. Formula and validation summary

| Area | Finding |
| --- | --- |
| All Data helper col | 4,526 formulas: first-occurrence flag over Mobile+Client ID (`COUNTIFS` on cols E & N) |
| Client Summary | Tens of thousands of formulas (per-AY and totals); many **without cached results** in the xlsx |
| Mobile Summary | Formula-dominated; key value columns empty as stored |
| Year Summary | Totals use `SUM(...)`, collection `%` = `IF(D13=0,0,E13/D13)` |
| Number formats | Indian grouping `[>=10000000]##,##,##,##0;…`; dates `dd-mmm-yyyy`; percents `0.0%` |
| Dropdowns / DV | **None** detected |
| Merged headers | **None** on data sheets (Year Summary uses a title row above the real header) |

Formulas were redacted (quoted literals stripped) before reporting.

---

## 6. PostgreSQL / app compatibility gaps

### Direct map (when values are present)

`Assessment Year`, fees (`Amount Billed`), `Received`, `Payment Mode` → `payment_type`, `Payment Date` → `payment_receive_date`, client name/phone/other mobiles/name variants, PAN → `it_clients` + `it_filings` as in `docs/phase4-business-data.md` / `pgLedgerRepository.ts`.

### Transformations required

1. **Grain:** All Data row → one `it_filings` row under one `it_clients` (keyed by PAN/Client ID); AY labels → `assessment_years`.  
2. **Outstanding:** do not trust Excel column; store/recompute `balance = max(0, fees − received)`.  
3. **Client ID vs PAN:** All Data uses “Client ID”; Client Summary uses “Client ID (PAN)” — normalize to PAN rules before insert.  
4. **Wide Client Summary AY columns:** optional enrichment only; canonical filings should come from All Data once money columns are populated.  
5. **Uncached formulas:** open/recalc in Excel or rebuild from All Data before migration if relying on summary sheets.  
6. **Encrypt portal passwords:** N/A for this workbook (no password column).

### Missing from PostgreSQL / would be lost

- Filing Note, Amount Note  
- Sl No, helper flag column  
- Review Needed / Notes narrative sheets  
- Mobile Summary as a stored entity (app derives it)  
- Year Summary report layout  

### Could be lost or wrong if migrated naively from **this file as-is**

- **All fees/received/filing dates/names/PANs from All Data** — columns exist but are empty → filings would import with **zero money** and missing client profile fields unless Client Summary is merged in a custom pipeline.  
- Count mismatch: **1,918** distinct All Data Client IDs vs **1,164** Client Summary IDs — needs reconciliation before cutover.  
- No portal credentials in source — existing `password_enc` in JSON/PG (if any) must be handled separately.

### Recommended mapping strategy for migration design

1. Treat **Client Summary** as client master (name, PAN, mobiles, variants) for this file.  
2. Treat **All Data** as filing spine (AY + Client ID + payment mode/date) **after** confirming whether a fuller All Data (with fees/names) exists elsewhere, or recover amounts from another artifact.  
3. Do **not** use Mobile Summary / Year Summary as SoR.  
4. Load into PG via frozen JSON or an enhanced importer that joins Client Summary → All Data on Client ID/PAN, then `import:ledger:pg` / repository save — **not executed in 5B**.

---

## Safety confirmation

- Workbook not modified, copied, or imported.  
- No PostgreSQL connection.  
- No application code/config changes for cutover.  
- No secrets or personal cell values printed.
