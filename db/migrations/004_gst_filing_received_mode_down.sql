-- Down for 004_gst_filing_received_mode.sql (additive column removal only).
-- NEVER DROP DATABASE. NEVER DROP SCHEMA public.
-- Note: scripts/db-rollback.mjs still only rolls back foundation when no later
-- migrations are recorded; this file is for explicit/manual reverse of 004
-- on empty disposable databases after 004 has been applied in isolation.

ALTER TABLE gst_filings DROP CONSTRAINT IF EXISTS gst_filings_received_mode_xor;
ALTER TABLE gst_filings DROP CONSTRAINT IF EXISTS gst_filings_legacy_received_nonneg;
ALTER TABLE gst_filings DROP COLUMN IF EXISTS legacy_received;
ALTER TABLE gst_filings DROP COLUMN IF EXISTS payments_present;
