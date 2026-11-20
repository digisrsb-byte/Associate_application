# Phase 2 – Client Portal Password Storage Remediation

**Branch:** `security/phase1-password-reset`  
**Status:** Implemented and tested (local UAT)  
**Date:** 2026-11-20

## Password-related workflows (inspection)

| Workflow | Used? | Decision |
|----------|-------|----------|
| IT client create/edit (mandatory portal password) | Yes | Keep — encrypt at rest |
| GST company create/edit (mandatory portal password) | Yes | Keep — encrypt at rest |
| Ledger table reveal / copy for GST & IT portal login | Yes (staff lookup) | Keep via **authenticated reveal API** only |
| Excel / CSV export password columns | Yes historically | Ordinary exports no longer include portal passwords |
| GST Excel import password column | Yes | Still accepted on write; encrypted on server |
| Automated login to income-tax / GST portals | No | N/A |

**Conclusion:** Credentials are required by business workflow (staff retrieve GST / IT portal passwords). They were **not deleted**. Storage uses **AES-256-GCM** encryption at rest.

## Original issue

Client and GST portal passwords were stored and returned in plaintext in `ledger.json` and `/api/ledger` responses, and shown/copied from ordinary ledger views.

## Root cause

`password` was a normal ledger field serialized end-to-end with no encryption, redaction, or separate authorization for reveal.

## Fix implemented

1. **AES-256-GCM at rest** (`portalCrypto.ts`) with key from `PORTAL_PASSWORD_ENCRYPTION_KEY` only (`.env`, gitignored).
2. **Migration on ledger read** (with `data/backups/ledger-*-pre-portal-encrypt.json` when changes apply): plaintext → `passwordEnc`; unset sentinels (`NOT SET`, empty) cleared; other fields untouched.
3. **API sanitization**: ordinary responses expose `hasPortalPassword` only — never `password` or `passwordEnc`.
4. **Secure reveal**: `POST /api/clients/:id/reveal-portal-password` and `POST /api/gst/clients/:id/reveal-portal-password` (session required).
5. **UI**: `PortalPasswordCell` uses reveal/copy via that API; edit forms do not prefill passwords; blank password on edit keeps stored secret.
6. **Exports**: password columns blank in ordinary CSV/Excel client exports.
7. **Missing/invalid key**: migration deferred without destroying data; store/reveal fail with clear 503 errors.

## Files modified / added

| File | Change |
|------|--------|
| `portalCrypto.ts` | **Added** — encrypt/decrypt/key load |
| `server.ts` | Migration, sanitize, encrypt writes, reveal routes |
| `src/types/ledger.ts` | `passwordEnc`, `hasPortalPassword`; `password` optional |
| `src/utils/api.ts` | `revealPortalPassword()` |
| `src/components/PortalPasswordCell.tsx` | **Added** — session reveal/copy cell |
| `src/components/SimpleClientTable.tsx` | Use PortalPasswordCell |
| `src/components/ContinuousSheetTable.tsx` | Use PortalPasswordCell |
| `src/components/GstSimpleTable.tsx` | Use PortalPasswordCell |
| `src/components/GstSheetTable.tsx` | Use PortalPasswordCell |
| `src/components/GstSummaryViews.tsx` | Use PortalPasswordCell |
| `src/components/ClientModal.tsx` | No prefill; blank keeps stored |
| `src/components/ClientEditDrawer.tsx` | Same |
| `src/components/GstCompanyModal.tsx` | Same |
| `src/components/GstCompanyEditDrawer.tsx` | Same |
| `src/App.tsx` | Omit empty password on update |
| `src/utils/csvExport.ts` | Blank password columns |
| `src/utils/gstExcelExport.ts` | Blank password columns |
| `src/utils/ledgerUtils.ts` | Blank password in CSV helper |
| `.env.example` | Document `PORTAL_PASSWORD_ENCRYPTION_KEY` |
| `.env` | Local key (gitignored; never commit) |
| `scripts/phase2-portal-password-tests.mjs` | Automated Phase 2 checks |

## Database / data migration

- Verified backup under `data/backups/` (label `pre-portal-encrypt` when migration writes).
- `password` → `passwordEnc` (`enc:v1:<iv>.<tag>.<ct>` base64url).
- Client/PAN/GST/filing/financial fields unchanged.
- Retry-safe: already-encrypted records skipped; missing key leaves disk unchanged.

## Tests

```bash
node scripts/phase2-portal-password-tests.mjs
```

Results: `PHASE2_PORTAL_PASSWORD_TEST_RESULTS.json`.

## Remaining risks

| Risk | Notes |
|------|-------|
| Key loss | Without `PORTAL_PASSWORD_ENCRYPTION_KEY`, stored credentials cannot be decrypted — back up the key offline |
| Session reveal | Any logged-in admin can reveal; Phase 4 strengthens admin provisioning |
| Export | Ordinary Excel/CSV no longer carry portal passwords (intentional) |
| Host binding / hardcoded admin | Phases 3–4 |
