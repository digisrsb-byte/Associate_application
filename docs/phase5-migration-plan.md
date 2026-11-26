# Phase 5 — Production Data Source Audit and Migration Plan

**Status:** Audit complete. **No production import or cutover executed.**  
**Default runtime:** `BUSINESS_DATA_BACKEND=json`  
**Machine-readable inventory:** `docs/phase5-ledger-source-audit.json`  
**Audit tool (read-only):** `scripts/phase5-ledger-source-audit.mjs`

---

## 1. Possible business-data sources

| Source ID | Role | Present | Authoritative? |
| --- | --- | --- | --- |
| `live-data-ledger` (`data/ledger.json`) | Current default JSON store | Yes | **Not proven** — currently empty of clients/companies (catalogs only) |
| `git-head-data-ledger` | VCS snapshot of `data/ledger.json` at `HEAD` | Yes | Candidate historical snapshot; **differs from live** |
| `e2e-aside-ledger` | OneDrive-aside E2E isolation copy | Yes | **No** — test isolation artifact |
| `demo-ledger-shape-fixture` | Shape fixture under `scripts/fixtures/` | Yes | **No** — not loaded by production server |
| `data/backups/` | Encrypted JSON ledger backups | **Empty** | N/A |
| `data-e2e…/backups/` | Encrypted E2E backups (10 artifacts) | Yes | **No** — E2E only |
| `LEDGER_IMPORT_PATH` | Operator frozen copy (Phase 2 import contract) | Not set in this audit | Required for any approved import |
| External `_GIT_RECOVERY_BACKUPS` / `_SECURE_BACKUP_KEY` / `_SECURE_BACKUPS_OUTSIDE_GIT` | Documented in `RECOVERY` / repo recovery reports | **Present** beside app root (git bundles/mirrors/manifest; key escrow). Content not scanned in Phase 5 | Repo/key recovery — **not** automatically a ledger SoR; operator must inventory for any frozen ledger copies |
| PostgreSQL `it_gst_management_dev` / production | Runtime SoR after cutover | Out of scope for this audit | **Not** SoR until import + verify + cutover approval |
| Excel import paths | Runtime merge into active ledger | Code only | Not a standing ledger source |

**Conclusion:** Do **not** treat the current live `data/ledger.json` as the production business dataset. It holds **0** IT clients and **0** GST companies. A richer snapshot exists in Git `HEAD`, and a larger E2E aside copy exists but must not be mistaken for production.

---

## 2. Source comparison (counts & fingerprints only)

No names, PANs, phones, passwords, or ciphertext are included.

| Metric | Live `data/ledger.json` | Git `HEAD` ledger | E2E aside | Demo fixture |
| --- | ---: | ---: | ---: | ---: |
| Bytes / SHA-256 prefix | 423 / `beb82175…` | 17933 / `242d9ba0…` | 23890 / `ce54746f…` | 513 / `72887b87…` |
| IT clients | 0 | 5 | 30 | 1 |
| GST companies | 0 | 4 | 8 | 0 |
| AY catalog (array) | 8 | 10 | 8 | 2 |
| GST months (array) | 12 | 24 | 12 | 1 |
| IT filings | 0 | 29 | 26 | 0 |
| GST filings | 0 | 38 | 12 | 0 |
| IT fees / received / balance | 0 / 0 / 0 | 302700 / 241200 / 61500 | ~1.00e8 / 35511 / ~1.00e8 | 0 |
| GST billed total / company received | 0 / 0 | 687830 / 268500 | ~5.00e7 / 10640 | 0 |
| Portal enc expected | 0 | 1* | 36 | 0 |
| Plaintext password fields present | 0 | **9** | 0 | 0 |
| IT id-set fingerprint | empty | `88cc6b15494e` | `989c420e3849` | `c14940228154` |
| GST id-set fingerprint | empty | `42cc3c2e8e20` | `0a6a771af78b` | empty |

\*Git snapshot: `passwordEncExpected=1` via `recordHasPortalPassword`, while **9** records still carry a non-empty plaintext `password` field — import must encrypt via `portalCrypto` (`toPasswordEnc`) and must not store plaintext.

### Differences / duplicates / missing

- Live vs Git: **not identical**; live has been emptied of business rows (consistent with demo-cleanup direction); Git retains 5+4 entities.
- E2E aside vs Git: **different id-set fingerprints** and much larger synthetic-looking fees — treat as **test data**, not production.
- No duplicate IT/GST ids detected inside any analyzed source.
- Catalog-only years/months exist (empty periods) — PostgreSQL import preserves these via catalog tables (required for filing FKs).
- Demo fixture missing `createdAt`/`updatedAt` (1 client) — would fail import timestamp validation until filled.
- Live `data/backups/`: **no** encrypted artifacts to restore from for production recovery on this machine path.
- E2E aside backups: 10 `.json.enc` files (sizes ~8–23 KB) — E2E retention only.

### Fields that cannot migrate 1:1

| JSON field | PostgreSQL | Notes |
| --- | --- | --- |
| `password` (plaintext) | **Dropped** after encrypt → `password_enc` | Must have `PORTAL_PASSWORD_ENCRYPTION_KEY` |
| `hasPortalPassword` | Not stored | API-derived |
| Root `_comment` (fixture) | Ignored | Non-schema |
| Filing map keys | Become FK labels | Must match `assessment_years` / `gst_months` |
| No org entity in JSON | `organizations` row created at import | Shared by both owners later |
| Users/sessions | Not in ledger | Phase 3 auth — separate from business import |

---

## 3. PostgreSQL compatibility

Mapped correctly (001 + `pgLedgerRepository` / Phase 2 `buildImportRows`):

- IT: id, name, pan, phone, reference_number, remark, other_mobiles, name_variants, password_enc, created_at, updated_at  
- IT filings: assessment_year, filing_date, fees, received, balance, payment_type, payment_receive_date  
- GST: company_name, portal_user_id←userId, phone, reference_number, remark, total_received, password_enc, timestamps  
- GST filings: month, fees, interest, tax, total  
- Catalogs: assessment_years, gst_months  

Transformations required:

1. Encrypt residual plaintext portal passwords → `enc:v1:` ciphertext.  
2. Ensure every filing year/month exists in catalog before insert (importer already unions catalogs + filing keys).  
3. Provide non-empty ISO `createdAt`/`updatedAt` (fixture gap; live/Git snapshots OK).  
4. Bind all rows to a single `organization_id` (shared org for Owner A + Owner B).  
5. NUMERIC(14,2) for money — JSON numbers round-trip; watch float edge cases (verify script compares aggregates).

Could be lost if mishandled:

- Plaintext passwords if imported without encryption key.  
- Empty catalog periods if catalogs omitted.  
- `row_version` stays default `1` (unused by RMW revision fingerprint — OK).

Relationships that can break:

- Filing without catalog label → FK violation.  
- Cross-org id collision: `it_clients.id` / `gst_companies.id` are **global PK** in 001 — ids must be unique across orgs in one DB (single-org import is the intended model).  
- Import into non-empty business tables is **refused** by Phase 2 scripts.

Sensitive fields:

- `password_enc` — store ciphertext only; never log.  
- PAN/phone/name — migrate as business data; never print in logs/reports.  
- Backup encryption key — separate from portal key; required to decrypt `.json.enc` offline sources.

Concurrency after cutover: Phase 4B revision + mutator retry (already verified on test DB).

---

## 4. Recommended migration plan (not executed)

### Gate 0 — Choose authoritative source (human decision)

**Blocker:** Live ledger is empty; Git HEAD and E2E aside disagree.  
Operator must designate **one** frozen file as the migration source, e.g.:

1. Export / copy the true production ledger from the **client machine of record** (preferred), **or**  
2. Explicitly approve Git `HEAD` snapshot as the frozen source after business review of counts above, **or**  
3. Decrypt a known-good `.json.enc` backup into a frozen plaintext copy (staging only).

Never import the E2E aside ledger into shared owner production data without written approval.

### Gate 1 — Freeze & fingerprint

1. Copy chosen ledger to a path **outside** live `data/ledger.json`.  
2. Set `LEDGER_IMPORT_PATH` to that copy.  
3. Run `node scripts/phase5-ledger-source-audit.mjs` and retain SHA-256 + counts.  
4. Confirm `PORTAL_PASSWORD_ENCRYPTION_KEY` matches the environment that created any `passwordEnc` ciphertext.

### Gate 2 — Dev import rehearsal (local only)

1. Target **only** `it_gst_management_dev` with `DB_IMPORT_CONFIRM` / `DB_VERIFY_CONFIRM`.  
2. Ensure business tables empty (or use a fresh local DB).  
3. `npm run import:ledger:pg` then `npm run verify:ledger:pg` → expect `PASS`.  
4. Point a staging app at `AUTH_BACKEND=postgres` + `BUSINESS_DATA_BACKEND=postgres` + same `AUTH_ORGANIZATION_ID`.  
5. Two-owner smoke: both see shared counts; mutate one record; other sees update.  
6. Keep JSON mode as default in production until Gate 4.

### Gate 3 — Reconciliation checklist

- IT/GST entity counts match frozen source.  
- IT/GST filing counts match.  
- Sum(fees/received/balance) and GST totals match within verify tolerances.  
- `password_enc` non-null count matches `passwordEncExpected`.  
- Spot-check AY filters and outstanding reports (no PII in logs).

### Gate 4 — Cutover (requires separate written approval)

1. Maintenance window; final frozen copy + fingerprint.  
2. Import into the **approved** shared database (not test DB).  
3. Verify.  
4. Switch `BUSINESS_DATA_BACKEND=postgres` (and auth already postgres).  
5. Disable JSON backup restore for business path (already 409).  
6. Retain frozen JSON + encrypted backups offline; do not delete until soak period ends.  
7. PostgreSQL dump/restore runbook must exist before declaring PG the DR SoR (`RECOVERY_RUNBOOK.md` currently marks PG DR as pending).

### Explicit non-goals of this phase

- No import into `it_gst_management_dev` or production executed here.  
- No `BUSINESS_DATA_BACKEND` default change.  
- No modification of `data/ledger.json` / `data/auth.json`.  
- No migration SQL execution.

---

## 5. Remaining gaps before production cutover

1. **Authoritative source selection** (critical).  
2. Inventory/decrypt offline recovery artifacts if they hold the real production ledger.  
3. Confirm portal encryption key continuity for any existing `passwordEnc`.  
4. Owner provisioning + `AUTH_ORGANIZATION_ID` alignment with the imported org row.  
5. Operational PostgreSQL backup/restore runbook.  
6. Written cutover approval and rollback (revert env to `BUSINESS_DATA_BACKEND=json` + keep frozen file).  
7. Optional: stop tracking live `data/ledger.json` business blobs in Git (already flagged in demo-cleanup docs).
