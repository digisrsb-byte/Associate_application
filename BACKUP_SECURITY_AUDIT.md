# BACKUP SECURITY AUDIT (Phase 6 Investigation)

**Date:** 2026-11-20  
**Branch:** `security/phase1-password-reset` @ `ecb6037` (same tip as `main` / `origin/main`)  
**Mode:** READ-ONLY investigation — **no backups deleted, no history rewrite, live ledger untouched**  
**Rule:** Actual password/secret values are **not** printed in this report.

---

## 1. Executive summary

| Area | Status |
|------|--------|
| Live `data/ledger.json` (working tree) | **PASS** — portal credentials stored as `passwordEnc` only (2 blobs); **0** plaintext password values |
| Working-tree backups | **FAIL** — multiple pre-migration JSON files still hold plaintext portal passwords |
| Git-tracked backups (`origin/main`) | **FAIL** — 3 ledger backups with non-placeholder plaintext; live committed ledger has **1** non-placeholder plaintext |
| Auth backups | Untracked `auth-*.json` / `auth.json` hold **password hashes** (not portal plaintext); still sensitive |
| Automatic backup writer | Copies live ledger as-is → **safe going forward only while live ledger stays ciphertext-only**; directory still inside git tree and **not** gitignored |
| History exposure | Commit `ecb6037` on `origin/main` permanently contains plaintext until a **separately approved** history rewrite |

---

## 2. Inventory (counts only — no secret values)

### 2.1 Working tree / untracked

| Path | Type | Tracked? | Exists WT? | Exposure | Pre-AES likely? | Notes |
|------|------|----------|------------|----------|-----------------|-------|
| `data/ledger.json` | Live ledger | Yes | Yes | **ENCRYPTED_ONLY** | No | 2 `passwordEnc`; do not treat as disposable backup |
| `data/ledger.pre-auto-test-backup.json` | Ledger backup | No | Yes | **PLAINTEXT** (1 non-empty) | Yes | Outside `backups/` |
| `data/backups/ledger-20261119-175659.json` | Ledger backup | Yes | Yes | **PLAINTEXT** (8) | Yes | Also in git history |
| `data/backups/ledger-20261119-175552.json` | Ledger backup | Yes | **No** (deleted in WT) | **PLAINTEXT** in git blob (8) | Yes | Still in index/history |
| `data/backups/ledger-20261119-175639.json` | Ledger backup | Yes | **No** (deleted in WT) | **PLAINTEXT** in git blob (8) | Yes | Still in index/history |
| `data/backups/ledger-20261120-103329.json` | Ledger backup | Yes | Yes | No password fields | N/A | Tiny/empty-ish snapshot |
| `data/backups/ledger-20261120-111418.json` | Ledger backup | Yes | Yes | Placeholders only (`NOT SET`) | Pre-encrypt era | Low portal-secret risk |
| `data/backups/ledger-20261120-125141.json` | Ledger backup | No | Yes | **PLAINTEXT** (3) | Yes | |
| `data/backups/ledger-20261120-125229.json` | Ledger backup | No | Yes | **PLAINTEXT** (3) | Yes | |
| `data/backups/ledger-20261120-125255.json` | Ledger backup | No | Yes | **PLAINTEXT** (1) | Yes | |
| `data/backups/ledger-20261120-143655.json` | Ledger backup | No | Yes | **PLAINTEXT** (5) | Yes | |
| `data/backups/ledger-20261120-150021-pre-portal-encrypt.json` | Pre-migration | No | Yes | **PLAINTEXT** (2) | **Yes (explicit)** | Phase 2 migration backup |
| `data/backups/ledger-20261120-153455.json` | Post-encrypt | No | Yes | **ENCRYPTED_ONLY** | No | Still sensitive (PII + ciphertext) |
| `data/backups/ledger-20261120-153603.json` | Post-encrypt | No | Yes | **ENCRYPTED_ONLY** | No | Same |
| `data/backups/auth-20261120-152201-pre-phase4.json` | Auth backup | No | Yes | Auth **hash** present | N/A | Do not commit |
| `data/auth.json` | Live auth | No (ignored) | Yes | Auth **hash** present | N/A | Already gitignored |

### 2.2 `origin/main` / commit `ecb6037` (historical Git exposure)

| Path | nonPlaceholderPlaintext | encMarkers |
|------|-------------------------|------------|
| `data/backups/ledger-20261119-175552.json` | **8** | 0 |
| `data/backups/ledger-20261119-175639.json` | **8** | 0 |
| `data/backups/ledger-20261119-175659.json` | **8** | 0 |
| `data/backups/ledger-20261120-103329.json` | 0 | 0 |
| `data/backups/ledger-20261120-111418.json` | 0 (placeholders only) | 0 |
| `data/ledger.json` | **1** | 0 |

**Conclusion:** Deleting working-tree files **does not** remove exposure. Anyone with clone access to `origin/main` can recover plaintext from history.

---

## 3. Backup pipeline review

| Check | Result |
|-------|--------|
| Writer | `backupLedgerFile()` in `server.ts` — copies `data/ledger.json` → `data/backups/ledger-<stamp>[-label].json` |
| Retention | Keeps newest **10** `ledger-*.json` under `data/backups/`; deletes older by mtime |
| Encryption of backup archive | **None** — raw JSON copy |
| Key separation | N/A today; live portal key is `PORTAL_PASSWORD_ENCRYPTION_KEY` in `.env` (gitignored) |
| Gitignore for `data/backups/` | **Missing** |
| New backups after Phase 2 | Should contain `passwordEnc` only (matches post-encrypt samples) — **still must not be committed** (PII + reversible ciphertext with key) |
| Seed `createInitialLedger()` | Still embeds **demo plaintext** portal passwords in source — if ledger is recreated from seed, plaintext reappears until migration |

---

## 4. Related sensitive artifacts (commit risk)

| Artifact | Risk | Commit? |
|----------|------|---------|
| `.env` | Encryption key + QA password | **Never** (ignored) |
| `TEST_RESULTS.json` | Detail string embeds a past QA portal password literal | **Do not commit** / redact |
| Phase `*_TEST_RESULTS.json` | Mostly pass/fail; low risk | Prefer omit or scrub |
| `QA_AUDIT_RESULTS.json` | Describes old vulns; may aid attackers | Prefer omit from public push |

---

## 5. Exports / logs

| Path | Result |
|------|--------|
| CSV / Excel password columns | Blanked (`""`) in current export code — **PASS** for credentials |
| API strip | `stripPublicSecrets` removes `password` / `passwordEnc` — **PASS** |
| Logs | Migration logs backup **filename** only — **PASS** (spot) |

---

## 6. Required controls (to implement after approval)

1. **Quarantine:** Copy all sensitive backups to a directory **outside** the git repo; encrypt archives; verify restore sample; only then remove repo copies.  
2. **Ignore:** `data/backups/`, `data/ledger*.backup*`, `data/*.pre-*-backup.json`, encrypted archive dirs.  
3. **Untrack:** `git rm --cached` tracked backup paths (and decide policy for `data/ledger.json`).  
4. **Harden writer:** Backups must never reintroduce plaintext `password` fields; optional encrypt-at-rest for backup files.  
5. **Sanitize seed:** Remove demo plaintext passwords from `createInitialLedger()`.  
6. **Rotate** any third-party portal passwords that appeared in tracked/history backups (operator action).  
7. **History:** Separate approved plan only — filter-repo / BFG + coordinated force-push — **not** in default Phase 6 execution.

---

## 7. Phase 6A execution update (2026-11-20)

- Quarantine + AES encrypt + decrypt verify: **14/14 OK** outside the git repo.  
- `.gitignore` now ignores `data/backups/` and pre-auto-test backup.  
- **Originals not deleted** — see `PHASE6_BACKUP_DELETION_CANDIDATES.md`.  
- Git history / `origin/main` exposure: **unchanged** (6D not approved).

## 8. Verdict

**Backup posture: IMPROVED but NOT READY for production** until in-repo plaintext copies are removed (after delete approval), index untrack (6C), and history exposure is accepted+rotated or purged (6D).
