# PHASE 6A — Pre-deletion verification + deletion result

**Date:** 2026-11-20  
**Rule:** Credentials / password values not printed.

## Pre-deletion checks

| # | Check | Result |
|---|-------|--------|
| 1 | All 14 encrypted `.aes` backups exist outside git repo | **PASS** (`_SECURE_BACKUPS_OUTSIDE_GIT\encrypted-20261120\` — 14 files) |
| 2 | Encryption key outside repo, separate from ciphertext | **PASS** (`_SECURE_BACKUP_KEY\backup-archive.key`, 32-byte key, not under quarantine tree) |
| 2b | Access restriction (NTFS ACL) | **Applied** — inheritance removed; current user + SYSTEM only on key + quarantine dirs |
| 3 | Every deletion candidate maps to verified decryptable backup | **PASS** — 14/14 decrypt + JSON parse OK |
| 4 | No live ledger / auth / unrelated app files in list | **PASS** — candidates are backups only; `data/ledger.json` + `data/auth.json` excluded |
| 5 | Exact list reviewed | See below |

### Exact deletion list (items 1–12 from candidates doc)

| # | Path | Encrypted verify | WT before delete |
|---|------|------------------|------------------|
| 1 | `data/backups/ledger-20261119-175659.json` | OK | Already absent |
| 2 | `data/backups/ledger-20261120-103329.json` | OK | Present → **deleted** |
| 3 | `data/backups/ledger-20261120-111418.json` | OK | Present → **deleted** |
| 4 | `data/backups/ledger-20261120-125141.json` | OK | Present → **deleted** |
| 5 | `data/backups/ledger-20261120-125229.json` | OK | Present → **deleted** |
| 6 | `data/backups/ledger-20261120-125255.json` | OK | Present → **deleted** |
| 7 | `data/backups/ledger-20261120-143655.json` | OK | Present → **deleted** |
| 8 | `data/backups/ledger-20261120-150021-pre-portal-encrypt.json` | OK | Present → **deleted** |
| 9 | `data/backups/ledger-20261120-153455.json` | OK | Present → **deleted** |
| 10 | `data/backups/ledger-20261120-153603.json` | OK | Present → **deleted** |
| 11 | `data/backups/auth-20261120-152201-pre-phase4.json` | OK | Present → **deleted** |
| 12 | `data/ledger.pre-auto-test-backup.json` | OK | Present → **deleted** |

Items 13–14 were already absent from the working tree (still in Git index/history until a future 6C `git rm --cached`):
- `data/backups/ledger-20261119-175552.json`
- `data/backups/ledger-20261119-175639.json`

## Deletion execution

| Metric | Value |
|--------|-------|
| Deleted now | **11** files |
| Already absent | **1** (`…175659.json`) |
| Failed | **0** |
| Encrypted backups remaining | **14** |
| Key remaining | **Yes** |
| Live `data/ledger.json` | **Preserved** |
| Live `data/auth.json` | **Preserved** |
| Git history rewrite | **Not performed** (6D not approved) |

**Note:** Tracked backup paths may still show as `D` in `git status` (index vs working tree). Removing them from the Git index requires a future approved **6C** commit (`git rm --cached`), not done now.
