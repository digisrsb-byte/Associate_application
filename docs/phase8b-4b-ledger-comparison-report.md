# Phase 8B.4B — Recovered Ledger Comparison Report

**Date:** 2026-11-25  
**Mode:** Strictly read-only  
**Basis:** Candidates named in `docs/phase8b-4a-offline-recovery-inventory.md`  
**Compared snapshots:** Nov 20 `143655`, `153455`, `153603`, handover ledger, Git HEAD twin (`pre-auto-test-backup`)

**Not performed:** decryption, import, migration, PostgreSQL access, application changes, authoritative source selection, commit/push.

Identifiers below are **masked** as `id#` + first 8 hex of SHA-256(raw id). No names, PANs, phones, passwords, portal credentials, or encryption keys are printed.

---

## 1. Snapshot identity

| Alias | Absolute path | Bytes | SHA-256 | Role |
| --- | --- | ---: | --- | --- |
| **143655** | `C:\Users\SRSB HR SOLUTIONS\OneDrive\Desktop\associate\_SECURE_BACKUPS_OUTSIDE_GIT\raw-20261120\data__backups__ledger-20261120-143655.json` | 119 487 | `1e276481210d63622bf5a5e76f2d0c66a3e2a1ccf4e010a1023a0448fc2b1214` | Largest raw Nov-20 backup |
| **153455** | `…\raw-20261120\data__backups__ledger-20261120-153455.json` | 18 182 | `f33905001a17c26e8b6ac68927e1f19060cecfc64f233a32409799c3e510844a` | Post-encrypt family |
| **153603** | `…\raw-20261120\data__backups__ledger-20261120-153603.json` | 18 571 | `ae00a07009a2e0dd90b95ac9956640ccbdd8cbdaac202134de2a701d98f0ce68` | Post-encrypt +1 IT |
| **handover** | `…\handover-fresh-20261120-165344\ledger.json` | 18 182 | `f33905001a17c26e8b6ac68927e1f19060cecfc64f233a32409799c3e510844a` | **Byte-identical to 153455** |
| **HEAD** | `…\raw-20261120\data__ledger.pre-auto-test-backup.json` | 17 933 | `242d9ba0d8a7ac1c6a7da4be3d6f7804a0c3bb50f61271c2cc5222c382c2ecab` | Twin of app Git `HEAD:data/ledger.json` (per 8B.4A) |

**Duplicate:** `handover` ≡ `153455` (same SHA-256). Treat as one logical ledger with two paths.

Matching `.aes` ciphertext counterparts exist under `encrypted-20261120\` for `143655`, `153455`, `153603`, and `HEAD` (not decrypted in this phase). Handover has no separate `.aes` twin in the archive layout (its content is already covered by `153455.json.aes`).

---

## 2. Aggregate comparison

GST “billed” = sum of filing `total` (fees + interest + tax), matching Phase 8B.4A convention.

| Snapshot | IT clients | GST clients | IT filings | GST filings | IT fees / recv / bal | GST billed (`total`) / recv | Plaintext pwd fields | `passwordEnc` fields | Catalogs (AY / GST months) |
| --- | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: | --- |
| **HEAD** | 5 | 4 | 29 | 38 | 302 700 / 241 200 / 61 500 | 687 830 / 268 500 | **9** | 0 | 10 / 24 |
| **143655** | **8** | **5** | 29 | **39** | 302 700 / 241 200 / 61 500 | **687 958** / **269 000** | **13** | 0 | **13 / 26** |
| **153455** / **handover** | 6 | 4 | 29 | 38 | 302 700 / 241 200 / 61 500 | 687 830 / 268 500 | **0** | **2** | 13 / 26 |
| **153603** | 7 | 4 | 29 | 38 | 302 700 / 241 200 / 61 500 | 687 830 / 268 500 | **0** | **3** | 13 / 26 |

### Aggregate deltas (business money)

| Pair | IT money | GST billed / recv | Notes |
| --- | --- | --- | --- |
| HEAD → 143655 | Unchanged | +128 / +500 | Extra GST filing only |
| HEAD → 153455/handover | Unchanged | Unchanged | Credential shape changes; +1 IT shell client |
| HEAD → 153603 | Unchanged | Unchanged | Credential shape + 2 IT shell clients vs HEAD |
| 143655 → 153455 | Unchanged IT totals | −128 / −500 | Dropped GST client that held the +128/+500 |
| 153455 → 153603 | Unchanged | Unchanged | +1 IT client, **0** filings |

**Shared-core money check:** For the 5 IT + 4 GST ids present in both HEAD and 153455, filing fees/received/balance (IT) and fees/interest/tax/total + company `totalReceived` (GST) are **byte-identical** (0 money diffs). Credential field changes alone explain content-fingerprint diffs between pre-encrypt and post-encrypt families.

---

## 3. Record-level differences (masked ids only)

### 3.1 IT client presence matrix

| Masked id | HEAD | 143655 | 153455 / handover | 153603 | Filings (where present) | Notes |
| --- | :---: | :---: | :---: | :---: | ---: | --- |
| `id#73b6a81f` | ✓ | ✓ | ✓ | ✓ | 8 | Core |
| `id#781fa0c2` | ✓ | ✓ | ✓ | ✓ | 7 | Core |
| `id#20cfdd5c` | ✓ | ✓ | ✓ | ✓ | 6 | Core |
| `id#56142840` | ✓ | ✓ | ✓ | ✓ | 5 | Core |
| `id#252db3c0` | ✓ | ✓ | ✓ | ✓ | 3 | Core |
| `id#de1afd04` | — | ✓ | ✓ | ✓ | **0** | Shell client; gains `passwordEnc` in post-encrypt family |
| `id#72a24353` | — | ✓ | — | — | **0** | Only in 143655 |
| `id#7b3269ef` | — | ✓ | — | — | **0** | Only in 143655; **anomalous** (see §5) |
| `id#6324cea3` | — | — | — | ✓ | **0** | Only in 153603; has `passwordEnc` |

### 3.2 GST client presence matrix

| Masked id | HEAD | 143655 | 153455 / handover | 153603 | Filings | Notes |
| --- | :---: | :---: | :---: | :---: | ---: | --- |
| `id#68ad834d` | ✓ | ✓ | ✓ | ✓ | 20 | Core |
| `id#ff6012a5` | ✓ | ✓ | ✓ | ✓ | 10 | Core |
| `id#3338962c` | ✓ | ✓ | ✓ | ✓ | 7 | Core |
| `id#de5a73b7` | ✓ | ✓ | ✓ | ✓ | 1 | Core; gains `passwordEnc` post-encrypt |
| `id#e92e5295` | — | ✓ | — | — | **1** | Only in 143655; drives GST aggregate delta |

### 3.3 Added / removed / changed (by pair)

**HEAD → 143655**

- **Added IT:** `id#de1afd04`, `id#72a24353`, `id#7b3269ef` (all 0 filings).
- **Added GST:** `id#e92e5295` (1 filing; aggregate +128 billed / +500 received).
- **Removed:** none.
- **Changed (shared 5 IT + 4 GST):** none in money/filing keys — content fingerprints match (including plaintext credential presence).
- **Catalogs:** 143655 adds three assessment-year labels (`AY 2097-98`, `AY 2098-99`, `AY 2099-00`) and two GST month labels (`Dec 2099`, `Jan 2098`) not in HEAD.

**143655 → 153455 / handover**

- **Removed IT:** `id#72a24353`, `id#7b3269ef`.
- **Removed GST:** `id#e92e5295`.
- **Added:** none (relative to 143655).
- **Changed (shared 6 IT + 4 GST):** **no money or filing-key changes**. Differences are credential/field-set only:
  - Shared core IT/GST: plaintext password fields cleared (`plain true → false`); most remain without `passwordEnc`.
  - `id#de1afd04` (IT): plaintext cleared → `passwordEnc` present.
  - `id#de5a73b7` (GST): plaintext cleared → `passwordEnc` present.
- **Catalogs:** identical (13 AY / 26 months).

**153455 → 153603**

- **Added IT:** `id#6324cea3` (0 filings, `passwordEnc` present).
- **Removed / money-changed / filing-changed:** none.
- Shared 6 IT + 4 GST unchanged (including credential fingerprints).

**153455 → handover**

- **Identical file** (SHA-256 match). No record diffs.

**HEAD → 153455 / 153603**

- Shared core money/filings identical.
- Diffs = credential migration (plaintext → cleared / selective `passwordEnc`) + shell IT clients (`de1afd04`; plus `6324cea3` in 153603 only) + expanded catalogs (13/26 vs HEAD 10/24).

---

## 4. Successive-version assessment

**Verdict: related lineage around a stable core, not a single clean linear succession.**

Evidence for a **common business core**:

- Five IT + four GST ids appear in **all five** snapshots.
- On that core, IT/GST filing keys and financial amounts are **identical** across HEAD, 143655, 153455/handover, and 153603.
- Filename timestamps (`143655` → `153455` → `153603`) and handover packaging are consistent with activity on the same day (2026-11-20).

Evidence **against** treating them as one unbroken progressive SoR chain:

1. **143655 is not a strict parent of 153455.** Going forward in time *removes* two IT clients and one GST client (including the only GST money delta), rather than only accumulating data.
2. **143655 contains contamination signals** (oversized name field; far-future catalog/filing labels — §5) absent from HEAD and dropped again by 153455.
3. **HEAD is a subset of the later post-encrypt family** for clients, but has **cleaner catalogs** (no `209x` labels). Chronology of HEAD vs 143655 is not proven by these filenames alone; content-wise HEAD matches the core of 143655 **before** those extras.
4. **153603** is a thin delta on 153455 (+1 zero-filing IT with `passwordEnc`), not a full rewrite.
5. **Credential epoch change** (plaintext → cleared / `passwordEnc`) separates HEAD/143655 from 153455/153603/handover more than business money does.

Practical reading: operator is looking at **one practice-scale core dataset** with (a) a pre-encrypt subset (HEAD), (b) a contaminated maximal snapshot (143655), and (c) a post-encrypt cleaned family (153455 ≡ handover, then 153603).

---

## 5. Historical vs synthetic / anomalous evidence

| Signal | Where | Interpretation |
| --- | --- | --- |
| Practice-scale IT totals (302 700 / 241 200 / 61 500) | All five | Historical-looking core |
| Practice-scale GST totals (~687 830 / ~268 500) | HEAD, 153455, 153603, handover | Historical-looking core |
| Far-future AY labels `2097–2099` and months `Dec 2099` / `Jan 2098` | 143655, 153455, 153603, handover catalogs | Synthetic / test catalog pollution retained after client drop |
| Extra GST filing dated `Jan 2098` (+128 / +500) | **143655 only** (`id#e92e5295`) | Synthetic-looking add-on |
| IT client with **~100 000-character name** and 0 filings | **143655 only** (`id#7b3269ef`) | Anomalous / corrupt paste — explains nearly all of the 119 KB file size (`clients` JSON ≈ 107 KB) |
| Zero-filing IT shells | `de1afd04`, `72a24353`, `6324cea3` | Not financially material; may be incomplete entries or encrypt-test rows |
| E2E-scale fees (~1e8) | **Not present** in these five | Unlike Phase 8B.4 E2E aside ledger |

**HEAD** has no `209x` catalog labels and no anomalous oversized field — financially aligned with the post-encrypt family on the shared core.

---

## 6. Encryption vs plaintext credentials

### 6.1 Archive-level encryption (`.aes`)

| Snapshot | Raw JSON readable here? | Matching `.aes` present? | Decrypted in this phase? |
| --- | --- | --- | --- |
| 143655 | Yes (plaintext JSON file) | Yes (`…143655.json.aes`) | **No** |
| 153455 | Yes | Yes | **No** |
| 153603 | Yes | Yes | **No** |
| handover | Yes | No separate handover `.aes` (content = 153455) | **No** |
| HEAD | Yes | Yes (`…pre-auto-test-backup.json.aes`) | **No** |

The compared business content came from **raw quarantine / handover JSON**, not from decrypting `.aes` files.

### 6.2 In-JSON portal credential shape (from inventory + this comparison)

| Snapshot | Plaintext `password` fields (non-empty) | `passwordEnc` fields (non-empty) | Classification |
| --- | ---: | ---: | --- |
| **HEAD** | 9 | 0 | **Contains plaintext portal credentials** |
| **143655** | 13 | 0 | **Contains plaintext portal credentials** |
| **153455 / handover** | 0 | 2 | Post-encrypt family; no plaintext passwords; selective ciphertext |
| **153603** | 0 | 3 | Same family as 153455 + one more encrypted shell IT |

Post-encrypt snapshots still store other PII fields in plaintext JSON (names, etc. — not printed here). “Encrypted” in 8B.4A means **portal password encryption inside JSON**, plus optional whole-file `.aes` archive copies — not full-ledger field encryption.

---

## 7. Comparison summary (no SoR selection)

| Theme | Finding |
| --- | --- |
| Strongest shared business core | 5 IT + 4 GST; identical money/filings across all five |
| Largest file ≠ richest clean history | 143655 size dominated by one anomalous IT name field + synthetic extras |
| Cleanest post-encrypt packaging | 153455 ≡ handover; 153603 is +1 shell IT |
| Closest to current Git tree | HEAD twin (`242d9ba0…`) |
| Financial disagreement among “clean” set | Essentially **none** on shared core; only 143655’s extra GST differs |
| Main non-money disagreement | Client set membership + credential epoch + catalog pollution |

---

## 8. Recommendation (still not selecting an authoritative source)

For **operator business review** before Phase 8B.4 source confirmation:

1. Treat **HEAD**, **153455/handover**, and **153603** as the primary comparison set for the **shared core** (identical IT/GST money).
2. Treat **143655** as a **superset with contamination** (anomalous oversized field; `209x` GST add-on). Do not assume “largest = best” without reviewing those extras on a secure machine.
3. Prefer a **post-encrypt** candidate if portal-password handling for import matters — but confirm whether shell clients (`de1afd04`, `6324cea3`) and retained `209x` catalogs are wanted.
4. Prefer **HEAD** if the goal is alignment with the current Git snapshot and cleaner catalogs — accepting plaintext credentials that must be encrypted before any future PG load.
5. Optionally verify the chosen raw file against its `.aes` twin on a secure machine (authorized decrypt only).
6. After business confirmation, freeze path + SHA-256 and return to Phase 8B.4 Gate 0 — still **do not** begin import implementation in this phase.

---

## Stop line

Phase **8B.4B** complete — recovered ledger comparison only.  
**No authoritative source selected. No import started. No decryption performed.**
