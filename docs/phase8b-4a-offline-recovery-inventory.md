# Phase 8B.4A — Offline Recovery Source Inventory

**Date:** 2026-11-25  
**Mode:** Strictly read-only  
**Roots inventoried:**

| Root | Absolute path | Access |
| --- | --- | --- |
| `_GIT_RECOVERY_BACKUPS` | `C:\Users\SRSB HR SOLUTIONS\OneDrive\Desktop\associate\_GIT_RECOVERY_BACKUPS` | **Available** |
| `_SECURE_BACKUPS_OUTSIDE_GIT` | `C:\Users\SRSB HR SOLUTIONS\OneDrive\Desktop\associate\_SECURE_BACKUPS_OUTSIDE_GIT` | **Available** |

**Not performed:** decryption, Git bundle restore, database restore, import, migrations, PostgreSQL access, application changes, authoritative source selection.

No PANs, names, phones, passwords, encryption keys, or tokens are printed. Ledger JSON inspection reports **counts and financial aggregates only**.

---

## 1. Access summary

Both directories exist and were readable.

- `_SECURE_BACKUPS_OUTSIDE_GIT`: **31** files (manifest + raw JSON + encrypted `.aes` + handover snapshot).
- `_GIT_RECOVERY_BACKUPS`: git **bundle** (~1.43 MB), bare **mirror** (~200 files / ~1.64 MB), plus manifest/refs notes.

Secure archive `manifest-20261120.json` metadata: created **2026-11-20**, `entryCount=14`, `okCount=14`, `liveLedgerModified=false`, `originalsDeleted=false`, key stored **separately** (key file path noted in manifest only; **key bytes not read**).

---

## 2. `_SECURE_BACKUPS_OUTSIDE_GIT` — artifact inventory

Base absolute path:  
`C:\Users\SRSB HR SOLUTIONS\OneDrive\Desktop\associate\_SECURE_BACKUPS_OUTSIDE_GIT\`

### 2.1 Manifest

| Relative path | Type | Bytes | mtime (UTC) | SHA-256 |
| --- | --- | ---: | --- | --- |
| `manifest-20261120.json` | manifest | 11790 | 2026-11-20T10:23:15Z | `622b2445598c063035e135a56ac41e45cf1da672645f231b9f728e61cecca5c9` |

### 2.2 Handover snapshot (`handover-fresh-20261120-165344\`)

| Relative path | Type | Bytes | mtime (UTC) | SHA-256 |
| --- | --- | ---: | --- | --- |
| `handover-fresh-20261120-165344\ledger.json` | ledger-json | 18182 | 2026-11-20T10:40:48Z | `f33905001a17c26e8b6ac68927e1f19060cecfc64f233a32409799c3e510844a` |
| `handover-fresh-20261120-165344\auth.json` | auth-json | 516 | 2026-11-20T11:22:31Z | `ac3319749207d0199b1e3c8dbbdd1913e593a33eaebd0ba69baf3dde49393083` |

`auth.json`: credential store — **not content-inspected**.

### 2.3 Raw plaintext quarantine (`raw-20261120\`)

| Relative path | Type | Bytes | mtime (UTC) | SHA-256 |
| --- | --- | ---: | --- | --- |
| `raw-20261120\data__backups__auth-20261120-152201-pre-phase4.json` | auth-json | 516 | 2026-11-20T10:23:14Z | `f727dfb1e343134704d8887e240368a99c6c11e89e155b5483bba1c7b2969b08` |
| `raw-20261120\data__backups__ledger-20261119-175552.json` | ledger-json | 12299 | 2026-11-20T10:23:15Z | `13e7c6f75b05b1ababe5810caa311f023e725b2701f05bacb8acd4327e4746c4` |
| `raw-20261120\data__backups__ledger-20261119-175639.json` | ledger-json | 12299 | 2026-11-20T10:23:15Z | `13e7c6f75b05b1ababe5810caa311f023e725b2701f05bacb8acd4327e4746c4` |
| `raw-20261120\data__backups__ledger-20261119-175659.json` | ledger-json | 12299 | 2026-11-20T10:23:14Z | `7f82bba42b37b7e62adf44ea2e458beddfc128af0b3dc1b58557ec64ce2feaca` |
| `raw-20261120\data__backups__ledger-20261120-103329.json` | ledger-json | 634 | 2026-11-20T10:23:14Z | `f7fea948018ac079b2fb3771c5a87c892da638779879de8e2161a7b81e5ade39` |
| `raw-20261120\data__backups__ledger-20261120-111418.json` | ledger-json | 10171 | 2026-11-20T10:23:14Z | `07360a53b0ac264ab8f6a04ecacf73f75cf3eb6a8dbfdcaaf6e68b2fdf40c3e1` |
| `raw-20261120\data__backups__ledger-20261120-125141.json` | ledger-json | 19007 | 2026-11-20T10:23:14Z | `62a30a54079218bfbc6129c81c76864f10c4482b2582a205a52cc23f75cbd2c8` |
| `raw-20261120\data__backups__ledger-20261120-125229.json` | ledger-json | 19335 | 2026-11-20T10:23:14Z | `125bf37531b6477485e9000baa9ec4e14a0e40ce5fd855c6913e260cf404b96c` |
| `raw-20261120\data__backups__ledger-20261120-125255.json` | ledger-json | 17985 | 2026-11-20T10:23:14Z | `accc28b44c2fddc16817011011965ee97ee9c89d5aff069614971f704948e242` |
| `raw-20261120\data__backups__ledger-20261120-143655.json` | ledger-json | **119487** | 2026-11-20T10:23:14Z | `1e276481210d63622bf5a5e76f2d0c66a3e2a1ccf4e010a1023a0448fc2b1214` |
| `raw-20261120\data__backups__ledger-20261120-150021-pre-portal-encrypt.json` | ledger-json | 18310 | 2026-11-20T10:23:14Z | `548f3a6d6bf423901a6279c1a4b06604962f64a7c01d1324b147f56baa7479d3` |
| `raw-20261120\data__backups__ledger-20261120-153455.json` | ledger-json | 18182 | 2026-11-20T10:23:14Z | `f33905001a17c26e8b6ac68927e1f19060cecfc64f233a32409799c3e510844a` |
| `raw-20261120\data__backups__ledger-20261120-153603.json` | ledger-json | 18571 | 2026-11-20T10:23:14Z | `ae00a07009a2e0dd90b95ac9956640ccbdd8cbdaac202134de2a701d98f0ce68` |
| `raw-20261120\data__ledger.pre-auto-test-backup.json` | ledger-json | 17933 | 2026-11-20T10:23:14Z | `242d9ba0d8a7ac1c6a7da4be3d6f7804a0c3bb50f61271c2cc5222c382c2ecab` |

### 2.4 Encrypted counterparts (`encrypted-20261120\`) — not decrypted

| Relative path | Type | Bytes | mtime (UTC) | SHA-256 |
| --- | --- | ---: | --- | --- |
| `…\data__backups__auth-20261120-152201-pre-phase4.json.aes` | encrypted-backup | 547 | 2026-11-20T10:23:14Z | `3ddbecf8c043f640a190cba5e4f8dee1b6eff17ba27a00816c3dd9a7f810d2fd` |
| `…\data__backups__ledger-20261119-175552.json.aes` | encrypted-backup | 12330 | 2026-11-20T10:23:15Z | `07066cbf42da226a9994b4459b2326437c7602178c57972de157931a9ff71eb2` |
| `…\data__backups__ledger-20261119-175639.json.aes` | encrypted-backup | 12330 | 2026-11-20T10:23:15Z | `d3748b85314ecd8d6ded49e1c4d1ceff52cff4cdf0d9b6dd8600b8cffe5600ad` |
| `…\data__backups__ledger-20261119-175659.json.aes` | encrypted-backup | 12330 | 2026-11-20T10:23:14Z | `a655cabc8c5ef85ce7cb4ba16f284b77d051925e7e4b29a562eee29cbe1d0a69` |
| `…\data__backups__ledger-20261120-103329.json.aes` | encrypted-backup | 665 | 2026-11-20T10:23:14Z | `af4fe473df4344103d331753a3f8ccc69428c6606137de09b99ed19fe6c94b3a` |
| `…\data__backups__ledger-20261120-111418.json.aes` | encrypted-backup | 10202 | 2026-11-20T10:23:14Z | `6cc23ebfc4555575f524b62eb6ec69ac16928872fc1d2ca2027014292f663d05` |
| `…\data__backups__ledger-20261120-125141.json.aes` | encrypted-backup | 19038 | 2026-11-20T10:23:14Z | `1f842df6977d5ce45371982264ab44e94ff185b568cb4606343f2d0b00efff3c` |
| `…\data__backups__ledger-20261120-125229.json.aes` | encrypted-backup | 19366 | 2026-11-20T10:23:14Z | `61c73b35eb8891b59e3c444143b9bb8daeec36288d6a05757271a7e577650eaa` |
| `…\data__backups__ledger-20261120-125255.json.aes` | encrypted-backup | 18016 | 2026-11-20T10:23:14Z | `924ffa8637837a5595ee47a592e70d1b03c6ce96b44672598329fcb314046596` |
| `…\data__backups__ledger-20261120-143655.json.aes` | encrypted-backup | **119518** | 2026-11-20T10:23:14Z | `cd7261929a196496c0ff275076e905a45d3ef5755845c5630b2632ae680f0e2b` |
| `…\data__backups__ledger-20261120-150021-pre-portal-encrypt.json.aes` | encrypted-backup | 18341 | 2026-11-20T10:23:14Z | `c1bc4b98908ae423bd381d8d68a280165787369679eb213794a33cb105054d5f` |
| `…\data__backups__ledger-20261120-153455.json.aes` | encrypted-backup | 18213 | 2026-11-20T10:23:14Z | `10231e3fd716db27e63b81dadcf60fc3cd2ec20fb126c3a856e4a77db0ed0d31` |
| `…\data__backups__ledger-20261120-153603.json.aes` | encrypted-backup | 18602 | 2026-11-20T10:23:14Z | `f27257d1407d5bc5bb33ba1120c4ac46c269a67135661a0c217fc072d02eb6a7` |
| `…\data__ledger.pre-auto-test-backup.json.aes` | encrypted-backup | 17964 | 2026-11-20T10:23:14Z | `7c0509a880e002bbc70a5c63c9fdecab0c60d14723e9a3a15a08f14da2af429b` |

(Full relative prefix for encrypted rows: `encrypted-20261120\`.)

---

## 3. Safe ledger aggregates (raw / handover JSON only)

| Short name | IT | GST | IT fil. | GST fil. | IT fees / recv / bal | GST billed / recv | plaintext pwd # | passwordEnc # | Classification |
| --- | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: | --- |
| Nov19-175552/175639 (dup) | 3 | 5 | 9 | 38 | 59000 / 45500 / 13500 | 642425 / 149000 | 8 | 0 | Historical mid-size |
| Nov19-175659 | 3 | 5 | 9 | 38 | same IT/GST band | same band | 8 | 0 | Near-duplicate of Nov19 |
| Nov20-103329 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **Empty business** (catalogs) |
| Nov20-111418 | 5 | 0 | 29 | 0 | 302700 / 241200 / 61500 | 0 | 5 | 0 | IT-only |
| Nov20-125141 | 6 | 5 | 30 | 38 | 312700 / 248200 / 64500 | 687830 / 271000 | 11 | 0 | Historical richer |
| Nov20-125229 | 7 | 5 | 30 | 38 | 314700 / 249200 / 65500 | 687830 / 271000 | 12 | 0 | Historical richer |
| Nov20-125255 | 5 | 4 | 29 | 38 | 302700 / 241200 / 61500 | 687830 / 268500 | 9 | 0 | Matches HEAD money profile |
| **Nov20-143655** | **8** | **5** | 29 | 39 | 302700 / 241200 / 61500 | 687958 / 269000 | 13 | 0 | **Largest file**; most IT clients |
| 150021-pre-portal-encrypt | 6 | 4 | 29 | 38 | 302700 / 241200 / 61500 | 687830 / 268500 | 10 | 0 | Pre-encrypt labeled |
| **153455 / handover ledger** | 6 | 4 | 29 | 38 | 302700 / 241200 / 61500 | 687830 / 268500 | **0** | **2** | Post-encrypt family |
| 153603 | 7 | 4 | 29 | 38 | 302700 / 241200 / 61500 | 687830 / 268500 | **0** | **3** | Post-encrypt; +1 IT vs 153455 |
| pre-auto-test-backup | 5 | 4 | 29 | 38 | 302700 / 241200 / 61500 | 687830 / 268500 | 9 | 0 | **= app Git HEAD ledger** |

No duplicate client/company **ids** within any single analyzed ledger file.

**Cross-repo check:** SHA-256 of application `git show HEAD:data/ledger.json` = `242d9ba0d8a7ac1c6a7da4be3d6f7804a0c3bb50f61271c2cc5222c382c2ecab` = `raw-20261120\data__ledger.pre-auto-test-backup.json`.

---

## 4. Duplicate content (SHA-256 groups)

| SHA-256 | Count | Absolute paths |
| --- | ---: | --- |
| `f33905001a17c26e8b6ac68927e1f19060cecfc64f233a32409799c3e510844a` | 2 | `…\handover-fresh-20261120-165344\ledger.json` · `…\raw-20261120\data__backups__ledger-20261120-153455.json` |
| `13e7c6f75b05b1ababe5810caa311f023e725b2701f05bacb8acd4327e4746c4` | 2 | `…\raw-20261120\data__backups__ledger-20261119-175552.json` · `…\ledger-20261119-175639.json` |

Encrypted `.aes` hashes differ from raw JSON (expected). Raw↔encrypted pairing is by filename stem per archive manifest.

---

## 5. `_GIT_RECOVERY_BACKUPS` inventory

Base: `C:\Users\SRSB HR SOLUTIONS\OneDrive\Desktop\associate\_GIT_RECOVERY_BACKUPS\`

### 5.1 Hashed top-level / pack / meta files

| Relative path | Type | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `Associate_application.all-20261120-163350.bundle` | git-bundle | 1432374 | `0a0795daa2cbeec42ef11acfd121ee91be298f36ed4b300d8c93ffe85de53c72` |
| `backup-manifest-20261120-163350.json` | manifest (UTF-16) | 2344 | `ac035e4da5a551caef39e9c26ab0960d088051c05fc2efceae55a49dcfbe7352` |
| `refs-20261120-163350.txt` | text-notes | 279 | `08ccf8fec80b03082dc66699c0b86511a957ce11b485bd197640f441965b81e2` |
| `Associate_application.git.mirror-20261120-163350\HEAD` | git-meta | 47 | `55e727561792b2c33935a5c8e5402955ad7a062331ec162899023dd1623cc811` |
| `…\config` | git-meta | 266 | `54be06946cf43d0e1ad1b8689be552be13f725c4087991d020948e897a0b4862` |
| `…\description` | git-meta | 73 | `85ab6c163d43a17ea9cf7788308bca1466f1b0a8d1cc92e26e9bf63da4062aee` |
| `…\packed-refs` | git-meta | 318 | `c4741e9dbd903f4c9ae62d02a66934a31d3ebc169b64565294c81478e0714895` |
| `…\objects\pack\pack-55e6d401….idx` | git-pack | 1156 | `ca2f8211229f1023474ff24a065d1cfb6fd1520e354cba15f24e2314449d3a94` |
| `…\objects\pack\pack-55e6d401….pack` | git-pack | 588 | `398b4cd06db8ae24802acadd9709edeb8a5c2fcb914abc4018e7782a60d857e4` |
| `…\objects\pack\pack-55e6d401….rev` | git-pack | 64 | `2f549849fcfed76e27072daa38eefc876cff386fd8f51bd3947dee8e02df181c` |

### 5.2 Bare git mirror (summary — not every object blob listed)

| Property | Value |
| --- | --- |
| Absolute path | `C:\Users\SRSB HR SOLUTIONS\OneDrive\Desktop\associate\_GIT_RECOVERY_BACKUPS\Associate_application.git.mirror-20261120-163350` |
| File count | 200 |
| Total bytes | 1 640 854 |
| Kind mix | 179 git-object · 14 hook samples · 4 meta · 3 pack |
| `HEAD` | `ref: refs/heads/security/phase1-password-reset` |
| Packed refs (commit ids only) | `main` / `origin/main` → `ecb603720deb6947171c8dcc38773e162ded1d05`; feature → `b788ca8ba70b0c2c8dedcf87006610f5de4c27ca` |

**No working-tree `ledger.json` inside the bare mirror.** Ledger history, if needed, would require a **secure-machine** `git clone --mirror` / checkout workflow (not performed here). The **bundle** is the primary portable Git recovery artifact.

### 5.3 Git backup manifest (metadata only)

From `backup-manifest-20261120-163350.json` (UTF-16): stamp `20261120-163350`; `mirrorOk=true`; `rawBackupCount=14`; `encAesCount=14`; `liveLedgerModifiedByThisStep=false`; points at the bundle/mirror paths above. Does **not** embed ledger business rows.

---

## 6. Historical vs empty vs encrypted vs repo recovery

| Class | Evidence | Examples |
| --- | --- | --- |
| **Empty / handover-empty business** | 0 IT + 0 GST | `ledger-20261120-103329.json` |
| **Historical business JSON** | Non-zero clients/companies; practice-scale fees | Nov19 set; Nov20 11xx–15xx raw ledgers; handover ledger |
| **Post-encrypt snapshots** | `passwordEnc>0` and `plaintextPassword=0` | handover / `153455` / `153603` |
| **Pre-encrypt snapshots** | `plaintextPassword>0` | most earlier Nov20 backups; pre-auto-test; Git HEAD twin |
| **Largest candidate** | 119 487 bytes; 8 IT / 5 GST | `ledger-20261120-143655.json` (+ matching `.aes`) |
| **Encrypted only** | `.aes` ciphertext | all `encrypted-20261120\*` — need authorized decrypt to re-verify |
| **Git recovery** | bundle + bare mirror | code/history recovery — not a direct ledger SoR without checkout |
| **Auth artifacts** | `auth.json` / auth backups | credentials — not ledger SoR |

Fee magnitudes (~3e5 IT / ~6.8e5 GST billed) are consistent with a small practice dataset — **unlike** the synthetic-scale E2E aside ledger from Phase 8B.4 (~1e8 IT fees). Offline recovery ledgers look **business-like**, not E2E synthetic.

---

## 7. Candidates that *could* be authoritative (not selected)

Operator must still choose. Evidence-ranked **candidates** for secure review:

1. **`raw-20261120\data__backups__ledger-20261120-143655.json`** (+ `.aes`) — largest; most IT clients (8) / GST (5).  
2. **Post-encrypt family:** `handover-fresh-…\ledger.json` / `…-153455.json` / `…-153603.json` — encrypted portals; handover packaging.  
3. **Git HEAD twin:** `data__ledger.pre-auto-test-backup.json` — identical to current repo `HEAD` ledger (5/4); may be incomplete vs 143655.  
4. **Encrypted-only verification** of the above using the **separate** archive key on a secure machine (not done here).  
5. **Git bundle/mirror** — only if operator needs a historical `data/ledger.json` from a specific commit (requires secure checkout; not done).

**Do not treat as SoR without review:** empty `103329`; auth-only files; git objects alone.

---

## 8. Artifacts requiring secure-machine review / authorized decryption

| Item | Why |
| --- | --- |
| All `encrypted-20261120\*.aes` | Ciphertext; decrypt only with escrowed archive key offline |
| Separate key path referenced by secure manifest | Key material must stay outside Git / this inventory |
| `auth.json` files | Credential hashes — inspect only if needed for recovery ops |
| Git bundle / mirror | Checkout can re-expose historical plaintext ledgers/passwords in old commits |
| Raw JSON with `plaintextPassword>0` | Sensitive; store/handle as confidential; encrypt before any future PG import |

---

## 9. Recommended next step

1. Operator **business review** of counts above (especially **143655** vs **153455/153603/handover** vs **pre-auto-test/HEAD**).  
2. On a secure machine: optional decrypt of the matching `.aes` for the chosen candidate to confirm round-trip integrity (archive key).  
3. Freeze the approved file to a path **outside** live `data/ledger.json`, record SHA-256, then return to Phase 8B.4 source confirmation.  
4. Still **do not** begin import implementation until that confirmation is written.

---

## Stop line

Phase **8B.4A** complete — offline recovery inventory only.  
**No authoritative source selected. No import started. No decryption performed.**
