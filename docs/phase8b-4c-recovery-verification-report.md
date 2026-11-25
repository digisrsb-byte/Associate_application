# Phase 8B.4C — Safe Recovery Candidate Verification

**Date:** 2026-11-25  
**Mode:** Strictly read-only  
**Basis:** `docs/phase8b-4a-offline-recovery-inventory.md`, `docs/phase8b-4b-ledger-comparison-report.md`  
**Focus candidates:** HEAD twin, `153455`, `153603`, handover  

**Not performed:** decryption of `.aes` files, import, migration, PostgreSQL access, application/live-ledger changes, owner provisioning, deploy, commit/push, authoritative business SoR approval.

No names, PANs, phones, passwords, portal credentials, encryption keys, or key material are printed.

---

## Verdict (technical only)

**Technically safest verifiable recovery candidate:**  
`raw-20261120\data__backups__ledger-20261120-153455.json`  
SHA-256 `f33905001a17c26e8b6ac68927e1f19060cecfc64f233a32409799c3e510844a`

**Packaging twin (byte-identical):**  
`handover-fresh-20261120-165344\ledger.json` (same SHA-256)

This is a **technical safety recommendation**, not business-owner approval and not an authoritative SoR selection for import.

---

## 1. SHA-256 recalculation (this phase)

| Alias | Absolute path | Bytes | SHA-256 (recalculated) | Matches 8B.4A/4B | Matches quarantine manifest |
| --- | --- | ---: | --- | :---: | :---: |
| **HEAD** | `C:\Users\SRSB HR SOLUTIONS\OneDrive\Desktop\associate\_SECURE_BACKUPS_OUTSIDE_GIT\raw-20261120\data__ledger.pre-auto-test-backup.json` | 17 933 | `242d9ba0d8a7ac1c6a7da4be3d6f7804a0c3bb50f61271c2cc5222c382c2ecab` | Yes | Yes |
| **153455** | `…\raw-20261120\data__backups__ledger-20261120-153455.json` | 18 182 | `f33905001a17c26e8b6ac68927e1f19060cecfc64f233a32409799c3e510844a` | Yes | Yes |
| **153603** | `…\raw-20261120\data__backups__ledger-20261120-153603.json` | 18 571 | `ae00a07009a2e0dd90b95ac9956640ccbdd8cbdaac202134de2a701d98f0ce68` | Yes | Yes |
| **handover** | `…\handover-fresh-20261120-165344\ledger.json` | 18 182 | `f33905001a17c26e8b6ac68927e1f19060cecfc64f233a32409799c3e510844a` | Yes | N/A (not a quarantine `entries[]` row) |

Hashes are stable versus Phase 8B.4A inventory and 8B.4B comparison.

---

## 2. Handover ↔ 153455 byte identity

| Check | Result |
| --- | --- |
| Equal byte length | Yes (18 182) |
| Equal SHA-256 | Yes (`f33905001a17c26e…`) |
| Full byte-for-byte compare | **Identical** |

**Conclusion:** handover and 153455 are the same ledger file content at two paths. Prefer citing **153455** as the quarantine-manifested artifact; treat handover as a verified packaging copy.

---

## 3. Encryption implementation vs quarantine backups

### 3.1 Two different ciphertext formats

| Layer | Implementation | File suffix | Magic | Key source |
| --- | --- | --- | --- | --- |
| **Runtime Stage 7C backups** | `backupCrypto.ts` (`encryptLedgerBackup` / `verifyEncryptedBackupFile`) | `.json.enc` | `ASSOCBK1` (8 bytes) | `BACKUP_ENCRYPTION_KEY` / `BACKUP_ENCRYPTION_KEY_FILE` |
| **Phase 6A quarantine archive** | `scripts/phase6a-quarantine-backups.mjs` | `.aes` | `BK1` (3 bytes) | Separate file `_SECURE_BACKUP_KEY\backup-archive.key` |

Observed on candidate `.aes` files: magic **`BK1`**, not `ASSOCBK1`. Size delta vs matching raw JSON is **+31 bytes** in every checked pair (`BK1` 3 + IV 12 + GCM tag 16), consistent with the quarantine encoder.

### 3.2 What the recovery docs allow

From `RECOVERY_RUNBOOK.md`:

- Documented restore path targets **runtime** `ledger-*.json.enc` under app `DATA_DIR/backups/`.
- Encrypted checks (magic / GCM decrypt / JSON shape) run **inside restore processing**.
- There is **no public standalone verify-only API**.
- Runtime `verifyEncryptedBackupFile` rejects non-`ASSOCBK1` buffers — it **cannot** verify quarantine `.aes` files as-is.

Phase 6A quarantine performed encrypt + decrypt round-trip **at archive creation** and recorded results in `manifest-20261120.json` (`decryptRoundTrip`, `jsonParseOk`, `status`). That is historical evidence, not a live re-verify performed in 8B.4C.

### 3.3 Authorization / decrypt decision for this phase

| Factor | Observation |
| --- | --- |
| Archive key path from manifest | `_SECURE_BACKUP_KEY\backup-archive.key` — **file exists** (size noted only; **contents not read**) |
| `BACKUP_ENCRYPTION_KEY` / `BACKUP_ENCRYPTION_KEY_FILE` in process env | **Not set** |
| Documented non-destructive verify for quarantine `BK1`+`.aes` | **Not present** in recovery runbook (Stage 7C path is `.json.enc` / `ASSOCBK1`) |
| Explicit operator authorization to load/use archive key in this phase | **Not granted** |

**Limitation — decryption not performed:**  
Re-decrypting `.aes` counterparts here would require loading the archive key and using the Phase 6A `BK1` codec, which is **outside** the documented Stage 7C verify/restore procedure and lacks explicit authorization for this session. Therefore 8B.4C relies on:

1. Recalculated raw SHA-256 integrity,  
2. Manifest SHA match + prior `decryptRoundTrip: true`,  
3. Non-destructive `.aes` header/size pairing (`BK1`, +31 bytes),  
4. Raw JSON structural/financial checks.

A future **authorized** secure-machine step could re-run Phase 6A-style decrypt-to-temp (or an equivalent) against the chosen candidate’s `.aes` and confirm SHA equality with the raw file — without writing into live `data/ledger.json`.

### 3.4 Encrypted counterpart presence (non-decrypt)

| Candidate | `.aes` present | `.aes` SHA-256 | Magic | Bytes | Manifest `encBytes` match | Manifest `decryptRoundTrip` |
| --- | :---: | --- | --- | ---: | :---: | :---: |
| HEAD | Yes | `7c0509a880e002bbc70a5c63c9fdecab0c60d14723e9a3a15a08f14da2af429b` | BK1 | 17 964 | Yes | true |
| 153455 | Yes | `10231e3fd716db27e63b81dadcf60fc3cd2ec20fb126c3a856e4a77db0ed0d31` | BK1 | 18 213 | Yes | true |
| 153603 | Yes | `f27257d1407d5bc5bb33ba1120c4ac46c269a67135661a0c217fc072d02eb6a7` | BK1 | 18 602 | Yes | true |
| handover | No dedicated `.aes` | — | — | — | — | Covered by 153455 `.aes` |

---

## 4. Data integrity (raw JSON, non-destructive)

| Check | HEAD | 153455 | 153603 | handover |
| --- | :---: | :---: | :---: | :---: |
| JSON parse | OK | OK | OK | OK |
| Shape (`clients` + `gstClients` arrays) | OK | OK | OK | OK |
| Duplicate IT/GST ids | None | None | None | None |
| IT filing balance mismatches (fees−recv≠bal) | 0 | 0 | 0 | 0 |
| GST filing total mismatches (fees+interest+tax≠total) | 0 | 0 | 0 | 0 |
| IT / GST / filings | 5 / 4 / 29+38 | 6 / 4 / 29+38 | 7 / 4 / 29+38 | 6 / 4 / 29+38 |
| IT fees / recv / bal | 302 700 / 241 200 / 61 500 | same | same | same |
| GST billed (`total`) / recv | 687 830 / 268 500 | same | same | same |
| Anomalous oversized name field (>10k chars) | 0 | 0 | 0 | 0 |
| Zero-filing IT clients | 0 | 1 | 2 | 1 |
| Far-future catalog labels (`209x`) | 0 AY / 0 mo | 3 AY / 2 mo | 3 AY / 2 mo | 3 AY / 2 mo |

Shared-core financial totals remain identical across HEAD and the post-encrypt family (per 8B.4B). Integrity math holds on all four.

**143655** (from 8B.4B, not re-selected here): still disqualified for technical safety due to anomalous ~100 000-character name field and synthetic-looking GST/catalog extras, despite larger size and matching `.aes`/manifest entry.

---

## 5. Credential safety

Counts only — no secret values.

| Candidate | Non-empty `password` fields (any string) | Non-empty after placeholder filter* | `passwordEnc` fields | Credential risk |
| --- | ---: | ---: | ---: | --- |
| **HEAD** | 9 | 1 | 0 | **Higher** — plaintext portal password material present |
| **153455 / handover** | 0 | 0 | 2 | **Lower** — no plaintext passwords; selective ciphertext |
| **153603** | 0 | 0 | 3 | **Lower** — same family as 153455 + one more enc shell |

\*Placeholder filter matches Phase 6A quarantine analyzer (`NOT SET`, `N/A`, etc.). Manifest historical `plaintextNonEmpty` for HEAD was `1`, consistent with the filtered count.

**Note:** Post-encrypt JSON still contains other PII in plaintext fields (not printed). “Safer” here means **portal-password handling**, not full anonymization.

---

## 6. Anomalous records and backup completeness

| Dimension | Assessment |
| --- | --- |
| Contaminated maximal snapshot | **143655** — reject as technical SoR candidate |
| Catalog pollution (`209x`) | Present in 153455 / 153603 / handover; **absent** in HEAD |
| Shell IT clients (0 filings) | 1 in 153455/handover; 2 in 153603; 0 in HEAD |
| Quarantine completeness | HEAD, 153455, 153603 each have raw + `.aes` + manifest `status: OK` + prior round-trip claim |
| Handover completeness | Byte twin of 153455; no own `.aes` row; useful packaging copy |
| Git bundle/mirror | Code/history recovery only — not used as ledger SoR here |
| Live app ledger | Out of scope; not modified |

---

## 7. Candidate scoring (technical safety)

| Criterion (weight) | HEAD | 153455 | 153603 | handover |
| --- | :---: | :---: | :---: | :---: |
| Hash stable + manifest match | ✓ | ✓ | ✓ | ✓ (via 153455) |
| No anomalous oversized fields | ✓ | ✓ | ✓ | ✓ |
| No plaintext portal passwords | ✗ | ✓ | ✓ | ✓ |
| Matching `.aes` + BK1 pairing | ✓ | ✓ | ✓ | via 153455 |
| Prior decryptRoundTrip claim | ✓ | ✓ | ✓ | via 153455 |
| Clean catalogs (no `209x`) | ✓ | ✗ | ✗ | ✗ |
| No zero-filing shell IT | ✓ | △ (1) | △ (2) | △ (1) |
| Dual-path byte verification | — | ✓ w/ handover | — | ✓ w/ 153455 |

**Technical ranking**

1. **153455** — best balance of credential safety, integrity, archive completeness, and dual-path verification; residual catalog/`shell` caveats.  
2. **handover** — identical content; slightly weaker as “archive of record” only because it lacks its own manifest/`.aes` row.  
3. **153603** — same core as 153455 with an extra zero-filing encrypted IT shell; no financial gain.  
4. **HEAD** — cleanest catalogs and no shells, but plaintext portal password exposure makes it **less safe** as a recovery handling candidate until passwords are encrypted under a controlled key.

---

## 8. Recommendations (separated)

### 8.1 Technical recommendation (this phase)

Use **`ledger-20261120-153455.json`** (SHA-256 `f33905001a17c26e…`) as the **technically safest verifiable recovery candidate** among the compared set.

Optional packaging reference: handover path (byte-identical).  
Optional integrity follow-up (authorized secure machine only): decrypt matching `…153455.json.aes` with the escrowed archive key using the Phase 6A `BK1` codec and confirm SHA equality — **do not** restore into live `data/`.

### 8.2 Business-owner approval (still required)

Technical safety ≠ business truth. Owners must still confirm whether:

- the post-encrypt **6 IT / 4 GST** set (including one zero-filing IT) is the intended production ledger,  
- retained **`209x` catalog labels** are acceptable or should be cleaned under a separate controlled edit,  
- **HEAD**’s cleaner catalogs / 5 IT subset should be preferred despite plaintext password handling risk,  
- **153603**’s extra IT shell is wanted or discarded.

Until that written confirmation (path + SHA-256), Phase 8B.4 Gate 0 remains open: **no authoritative SoR for import**.

### 8.3 Explicitly not recommended as technical SoR

- **143655** — anomalous content / synthetic extras.  
- Empty / auth-only / E2E synthetic artifacts (prior phases).  
- Git bundle alone without a named ledger blob checkout.

---

## 9. Recommended next step

1. Owner reviews §8 and records an approved frozen path + SHA-256.  
2. If desired, authorized offline `.aes` round-trip verify for that path only.  
3. Return to Phase 8B.4 source-confirmation gate.  
4. **Do not** begin import implementation until that confirmation is written.

---

## Stop line

Phase **8B.4C** complete — safe recovery candidate verification only.  
**Technical preference recorded for 153455; business SoR not approved. No decryption performed. No import started.**
