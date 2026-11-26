# PHASE 6 – REMEDIATION PLAN (F-01 / F-02 / F-04)

**Date:** 2026-11-20  
**Branch:** `security/phase1-password-reset`  
**Status:** **6A (copy/encrypt/verify) + 6B (cookies) EXECUTED.** Deletion / 6C / 6D still awaiting approval.  
**Constraint:** No irreversible Git operations, no backup deletion, no live ledger mutation beyond approved cookie code.

Companion reports:
- `BACKUP_SECURITY_AUDIT.md`
- `GIT_BRANCH_SAFETY_REPORT.md`
- `SESSION_COOKIE_SECURITY_REPORT.md`
- `UPDATED_PRODUCTION_READINESS_REPORT.md`

---

## 0. What was **not** done yet (by design)

| Action | Status |
|--------|--------|
| Delete / overwrite backups | **Not done** |
| Git history rewrite / force-push | **Not done** |
| Commit / push / merge | **Not done** |
| Checkout `main` / `dev` | **Not done** |
| Modify live `data/ledger.json` client records | **Not done** |
| Implement Secure cookie code | **Not done** (design only) |
| Move backups outside repo | **Not done** (path proposed below) |

---

## 1. Findings confirmed

| ID | Severity | Confirmed? | One-line |
|----|----------|------------|----------|
| **F-01** | High | **Yes** | Tracked + untracked + `origin/main` history contain plaintext portal passwords in backups; live WT ledger is encrypted |
| **F-02** | High (hosted) | **Yes** | Cookie lacks `Secure` |
| **F-04** | High (release) | **Yes** | All Phase 1–5 work uncommitted; branch tip = `main` = `ecb6037` |

Additional issues discovered during investigation (include in execution if approved):

| ID | Severity | Issue |
|----|----------|-------|
| **F-01b** | High | `createInitialLedger()` still hardcodes demo plaintext portal passwords in `server.ts` |
| **F-01c** | Medium | `backupLedgerFile()` writes raw JSON inside the git tree with no archive encryption / gitignore |
| **F-01d** | Medium | `TEST_RESULTS.json` contains a literal historical QA password string — do not commit |
| **F-01e** | High (ops) | `origin/main` already published plaintext — **rotate** exposed third-party portal passwords |

---

## 2. Exact remediation plan (ordered)

### Phase 6A — Quarantine & encrypt backups (F-01)  
**Reversible until delete step; delete requires your OK after verify.**

1. **Create restricted directory outside the git repo** (proposed):  
   `C:\Users\SRSB HR SOLUTIONS\OneDrive\Desktop\associate\_SECURE_BACKUPS_OUTSIDE_GIT\`  
   - Not under `Associate_application/`  
   - Restrict NTFS ACLs to your admin user only (manual OS step)

2. **Inventory copy (no delete):** Copy every sensitive backup listed in `BACKUP_SECURITY_AUDIT.md` §2.1 into:  
   `_SECURE_BACKUPS_OUTSIDE_GIT\raw-YYYYMMDD\`  
   Include WT-missing but git-blob files by exporting via `git show HEAD:<path> > …` into the same quarantine (still no history rewrite).

3. **Encrypt at rest:** For each raw JSON, produce `*.json.aes` (AES-256-GCM) using a **new** `BACKUP_ARCHIVE_KEY` stored only in a secrets file **outside** the backup folder (e.g. password manager / separate USB / Key Vault).  
   - Do **not** store the archive key next to the ciphertext.  
   - Do **not** reuse and commit portal key material into the quarantine tree.

4. **Verify:** Decrypt one encrypted sample to a temp path; confirm JSON parses; compare record counts (not secret values) to raw; delete temp decrypt output.

5. **Stop here for approval** before removing repo copies. After you confirm quarantine is good:  
   - Remove plaintext copies **inside** the repo working tree (backups only — **not** live `data/ledger.json` / `data/auth.json`).  
   - Keep encrypted quarantine + raw offline copy until you explicitly authorize raw destruction.

6. **`.gitignore` updates:**  
   ```gitignore
   data/backups/
   data/ledger*.pre-*.json
   data/*.pre-*-backup.json
   data/ledger.pre-auto-test-backup.json
   *.aes
   _SECURE_BACKUPS_OUTSIDE_GIT/
   ```

7. **Harden `backupLedgerFile()`:**  
   - Ensure copied ledger never writes plaintext `password` fields (strip or refuse if present).  
   - Optionally write encrypted `.json.aes` backups; keep retention policy (e.g. 10).  
   - Never place backup key in the backup directory.

8. **Sanitize `createInitialLedger()`:** Replace demo plaintext passwords with empty / unset; migration path already encrypts real values.

9. **Operator action:** Rotate any Income-tax / GST **portal** passwords that may have appeared in committed backups or demo seeds (values not listed here).

10. **Git history:** Document only — **no filter-repo/BFG** in 6A. See Phase 6C.

### Phase 6B — Secure cookies (F-02)

1. Implement env-aware `Secure` as specified in `SESSION_COOKIE_SECURITY_REPORT.md`.  
2. Keep `HttpOnly` + `SameSite=Lax`.  
3. Default local UAT: Secure off on loopback HTTP.  
4. Production / `COOKIE_SECURE=true`: Secure on.  
5. `TRUST_PROXY` default off; never trust arbitrary forwarded headers.  
6. Test local login/logout and production-like `COOKIE_SECURE=true` header probe.  
7. Update `.env.example` with `COOKIE_SECURE` / `TRUST_PROXY`.

### Phase 6C — Git branch / commits (F-04)  
**No force-push. No history rewrite.**

1. Remain on `security/phase1-password-reset`.  
2. Confirm quarantine + gitignore complete before staging.  
3. `git rm --cached` all `data/backups/*` still tracked.  
4. Decide ledger policy (recommended):  
   - Stop tracking live `data/ledger.json`, OR replace committed content with sanitized seed (no real PII/secrets).  
5. Stage **path-by-path** (never `git add .`): security code, scripts, docs, `.env.example`, `.gitignore`.  
6. Create 1–3 commits per `GIT_BRANCH_SAFETY_REPORT.md`.  
7. Verify `main` still `ecb6037`; feature branch ahead with new commits.  
8. Push feature branch **only when you approve push**; open PR; do not merge to `main` until readiness re-audit.

### Phase 6D — History purge (OPTIONAL — separate approval)

Only if you accept force-push coordination with all clones:

1. Written approval for `git filter-repo` / BFG removing `data/backups/**` secrets and scrubbing historical ledger plaintext.  
2. Rotate portal passwords **before or immediately after** (assume prior leak).  
3. Force-push `main` / feature with coordinated downtime.  
4. All developers re-clone.

**Default recommendation:** Complete 6A–6C + password rotation first; schedule 6D only if the GitHub repo is shared beyond a fully trusted set.

---

## 3. Approval checklist (reply with what you approve)

Please approve explicitly, for example:

- [ ] **6A-1..4** Quarantine copy + encrypt (no delete yet)  
- [ ] **6A-5** Delete plaintext backups **inside** the repo after verify  
- [ ] **6A-6..8** gitignore + backup writer + seed sanitization (code)  
- [ ] **6B** Implement Secure cookie  
- [ ] **6C** Selective commits on feature branch (no push)  
- [ ] **6C-push** Push feature branch / open PR  
- [ ] **6D** History rewrite + force-push (irreversible without recovery plan)  
- [ ] **Rotate** third-party portal passwords (operator-owned)

---

## 4. Safety guarantees during execution (once approved)

- Live client/filing/financial records in `data/ledger.json` will not be “cleaned” of business data.  
- No UI redesign; no payment/interest formula changes.  
- `main` / production remotes not modified except via your later PR merge.  
- No credentials printed in reports or logs.  
- Uncommitted Phase 1–5 work will not be discarded (`git reset --hard` / clean -fdx forbidden).

---

## 5. Success criteria

| Criterion | Done when |
|-----------|-----------|
| F-01 WT | No plaintext portal passwords under repo `data/backups/` or pre-* backup files |
| F-01 git future | `data/backups/` ignored; untracked from index |
| F-01 history | Either accepted+rotated **or** purged via approved 6D |
| F-02 | Local HTTP works; `COOKIE_SECURE=true` emits `Secure` |
| F-04 | Feature branch has commits containing Phase 1–5+6 code; `main` unchanged until PR |

---

## 6. Immediate ask

**Approve Phase 6A (quarantine+encrypt first) and/or 6B/6C code+commit scopes.**  
I will not delete backups, rewrite history, or push until you check the boxes above.
