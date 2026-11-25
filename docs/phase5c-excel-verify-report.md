# Phase 5C — Verify Excel Source and Investigate Missing IT Data

**Mode:** READ-ONLY. No workbook save/recalc, no DB, no import, no code/config changes.  
**No names, PAN, phones, passwords, or financial cell values appear below.**

JSON evidence: `docs/phase5c-excel-verify.json`

---

## Final verdict

# SOURCE EXISTS BUT REQUIRES RECONCILIATION

This workbook is a real IT Filing Master structure with a large All Data spine and a Client Summary master, but **complete IT filings (identity + fees + filing dates) cannot be reconstructed without guessing** from this file alone.

---

## Task 1 — Workbook identity

| | Selected (Downloads) | Other candidate (`Desktop\xl`) |
| --- | --- | --- |
| Path | `C:\Users\SRSB HR SOLUTIONS\Downloads\Filing_Master_Report_2019-2026 - Copy.xlsx` | `C:\Users\SRSB HR SOLUTIONS\OneDrive\Desktop\xl\Filing_Master_Report_2019-2026 - Copy.xlsx` |
| Bytes | **987,844** | **987,844** |
| SHA-256 | `2c31ce62a7993dc0715250044a255262d14b3aec58023f728ba09e3ef6d8faaf` | **identical** |
| mtime | 2026-11-24T12:19:22.166Z | 2026-11-18T08:46:34.680Z |

- **Same content:** yes (identical SHA-256 / size). Timestamps differ (copies of the same bytes).
- **Changed since Phase 5B:** **no** (same hash/bytes/mtime as `docs/phase5b-excel-structure-inspect.json`).
- Neither path is privileged by content; Downloads was the selected inspection target.

Sheets (both): Year Summary, All Data, Client Summary, Mobile Summary, Review Needed, Notes — same headings/row counts as Phase 5B.

---

## Task 2 — Relationships and missing columns

### All Data (4,526 data rows)

| Column group | Population |
| --- | --- |
| Assessment Year | 4,526 stored strings |
| Client ID | 4,526 stored strings; **1,918** distinct fingerprints |
| Payment Mode | 3,726 stored / 800 empty |
| Payment Date | 3,683 dates / 843 empty |
| Name, PAN, Mobile, Other Mobile, Filing Date | **0 stored, 0 formulas — genuinely blank** |
| Amount Billed, Received, Outstanding | **0 stored, 0 formulas — genuinely blank** |

Distinct Client ID + AY pairs: **4,506**; extra duplicate pair rows: **20**.

### Client Summary

- **1,164** rows with Client ID (PAN); all **1,164** also have a name cell populated.
- **755** body rows without Client ID (blank template / spacer).
- Per-AY and total money columns are **formulas** (mostly **uncached** in the file).

### Join Client Summary ↔ All Data

| Set | Count |
| --- | ---: |
| IDs in both | **1,164** |
| IDs only in All Data | **754** |
| IDs only in Client Summary | **0** |

**Why ~1,918 vs ~1,164:** All Data references **754** Client IDs that never appear on Client Summary. Every Client Summary ID appears in All Data. Join is possible for the intersection only; the 754 are **orphans** relative to the client master sheet.

Missing All Data identity/finance cells are **not** uncached formulas and **not** external-link placeholders — they are empty stored cells.

### Where is the money?

- All Data fee columns: empty (not formulas).
- Client Summary / Mobile Summary / Year Summary money columns: formulas that ultimately depend on All Data (e.g. existence `COUNTIFS` on All Data; totals via sheet refs). With All Data Amount Billed empty, **Excel recalculation cannot invent fee values**.
- Review Needed: 166 data rows (quality checklist — headings only inspected).
- Notes: workbook build notes (11 rows) — not a fee ledger.

---

## Task 3 — Formulas and dependencies

- **External workbook links:** none detected.
- **`#REF!` formulas:** 0.
- Dominant cross-sheet dependency: formulas reference **All Data** (tens of thousands of refs).
- Patterns (redacted): helper `COUNTIFS` on Mobile+Client ID; Client Summary AY flags via `COUNTIFS` into All Data; many simple cell mirrors.
- `fullCalcOnLoad`: not relied upon; **recalc would refresh summary caches but cannot populate blank All Data fee/identity columns.**
- Workbook was **not** opened in Excel, recalculated, or saved.

---

## Task 4 — Migration suitability vs PostgreSQL / Phase 4

| Needed for `it_clients` / `it_filings` | Available here? |
| --- | --- |
| Client name / PAN / phone | Partially via Client Summary for **1,164** IDs only |
| Assessment year + client key | Yes on All Data |
| fees / received / balance | **No** (blank on All Data; summaries cannot recover) |
| filing_date | **No** (blank) |
| payment_type / payment_receive_date | Partial on All Data |
| Portal password | Not in workbook |

**Cannot reconstruct complete IT filings without guessing or data loss** if this file is the only source.

---

## Evidence → verdict

1. File is a stable Filing Master twin of the `Desktop\xl` copy (same hash).  
2. Structural spine exists (4,526 All Data rows; 1,164 client master rows).  
3. Critical money and identity fields on All Data are **blank**, not formula-backed.  
4. Client ID sets need reconciliation (**754** All Data–only IDs).  
5. Recalc does not restore fees.

### Next recommended action

1. Locate a **complete All Data** artifact (populated Amount Billed / Received / Name / PAN / Filing Date)—another export, backup `.json.enc` restore to staging, or operator-provided master.  
2. Optionally open this workbook in Excel only to confirm UI matches empty fee columns (do not treat recalc as a fix).  
3. Until fees exist, **do not** import into PostgreSQL / do not treat this file as production cutover source.  
4. When a complete source exists, freeze it, re-run Phase 5 audit fingerprints, then rehearse `import:ledger:pg` on `it_gst_management_dev` only.
