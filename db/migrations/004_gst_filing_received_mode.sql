-- Phase 2F / Option D: per-filing payment-mode marker + legacy month received.
-- Additive only. Does not drop or rewrite existing columns/tables.
-- Preserves distinction between missing `payments` and empty `payments: []`.

ALTER TABLE gst_filings
  ADD COLUMN payments_present BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE gst_filings
  ADD COLUMN legacy_received NUMERIC(14,2) NULL;

ALTER TABLE gst_filings
  ADD CONSTRAINT gst_filings_legacy_received_nonneg
  CHECK (legacy_received IS NULL OR legacy_received >= 0);

-- Payment-accounting filings must not also store a legacy scalar received.
ALTER TABLE gst_filings
  ADD CONSTRAINT gst_filings_received_mode_xor
  CHECK (
    (payments_present = false)
    OR (payments_present = true AND legacy_received IS NULL)
  );
