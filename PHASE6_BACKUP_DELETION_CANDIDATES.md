# PHASE 6A — Backup deletion candidates

**Date:** 2026-11-20  
**Status:** Pre-deletion verification **PASS**. Approved deletions **executed** for items 1–12 (11 deleted; 1 already absent). Encrypted copies + key **preserved**.

See `PHASE6_PRE_DELETION_VERIFICATION.md` for check details.

Secure copies (outside git repo):
- Raw: `..\_SECURE_BACKUPS_OUTSIDE_GIT\raw-20261120\`
- Encrypted: `..\_SECURE_BACKUPS_OUTSIDE_GIT\encrypted-20261120\` (14 `.aes`)
- Manifest: `..\_SECURE_BACKUPS_OUTSIDE_GIT\manifest-20261120.json`
- Archive key: `..\_SECURE_BACKUP_KEY\backup-archive.key` (ACL-restricted)

---

## Deletion result (items 1–12)

| # | Path | Result |
|---|------|--------|
| 1 | `data/backups/ledger-20261119-175659.json` | Already absent |
| 2 | `data/backups/ledger-20261120-103329.json` | **Deleted** |
| 3 | `data/backups/ledger-20261120-111418.json` | **Deleted** |
| 4 | `data/backups/ledger-20261120-125141.json` | **Deleted** |
| 5 | `data/backups/ledger-20261120-125229.json` | **Deleted** |
| 6 | `data/backups/ledger-20261120-125255.json` | **Deleted** |
| 7 | `data/backups/ledger-20261120-143655.json` | **Deleted** |
| 8 | `data/backups/ledger-20261120-150021-pre-portal-encrypt.json` | **Deleted** |
| 9 | `data/backups/ledger-20261120-153455.json` | **Deleted** |
| 10 | `data/backups/ledger-20261120-153603.json` | **Deleted** |
| 11 | `data/backups/auth-20261120-152201-pre-phase4.json` | **Deleted** |
| 12 | `data/ledger.pre-auto-test-backup.json` | **Deleted** |

## Already missing (13–14) — not recreated; still in Git history

| # | Path |
|---|------|
| 13 | `data/backups/ledger-20261119-175552.json` |
| 14 | `data/backups/ledger-20261119-175639.json` |

## Preserved

| Path | Status |
|------|--------|
| `data/ledger.json` | Live — preserved |
| `data/auth.json` | Live — preserved |
| Quarantine + key | Preserved |
| `data/backups/ledger-20261120-155526.json` | **New** post-deletion server backup (encrypted-only, **0** plaintext); **not** in approved delete list; gitignored |

## Follow-ups (not done)

- `git rm --cached` for tracked backup paths → requires **6C commit approval**
- History purge → **6D** (not approved)
