-- Phase 2A: GST payment-line history + company unallocated received.
-- Additive only. Does not alter IT tables or auth tables.
-- Preserves individual payment rows (never collapse history into total_received alone).
-- Filing-level payments_present / legacy_received markers are added in 004 (Option D).

-- Company-level receipts not allocated to any month (legacy pool remnant).
ALTER TABLE gst_companies
  ADD COLUMN unallocated_received NUMERIC(14,2) NOT NULL DEFAULT 0;

ALTER TABLE gst_companies
  ADD CONSTRAINT gst_companies_unallocated_received_nonneg
  CHECK (unallocated_received >= 0);

-- Org-scoped uniqueness so payment rows can FK to a filing by org+company+month.
ALTER TABLE gst_filings
  ADD CONSTRAINT gst_filings_org_company_month_uidx
  UNIQUE (organization_id, gst_company_id, month);

CREATE TABLE gst_payments (
  id               TEXT PRIMARY KEY,
  organization_id  UUID NOT NULL,
  gst_company_id   TEXT NOT NULL,
  month            TEXT NOT NULL,
  amount           NUMERIC(14,2) NOT NULL DEFAULT 0,
  payment_date     TEXT NOT NULL DEFAULT '',
  payment_mode     TEXT NOT NULL DEFAULT '',
  reference        TEXT NULL,
  idempotency_key  TEXT NULL,
  created_at       TIMESTAMPTZ NOT NULL,
  updated_at       TIMESTAMPTZ NULL,
  CONSTRAINT gst_payments_id_nonempty CHECK (length(trim(id)) > 0),
  CONSTRAINT gst_payments_month_nonempty CHECK (length(trim(month)) > 0),
  CONSTRAINT gst_payments_amount_nonneg CHECK (amount >= 0),
  CONSTRAINT gst_payments_company_org_fk
    FOREIGN KEY (organization_id, gst_company_id)
    REFERENCES gst_companies (organization_id, id)
    ON DELETE CASCADE,
  CONSTRAINT gst_payments_filing_fk
    FOREIGN KEY (organization_id, gst_company_id, month)
    REFERENCES gst_filings (organization_id, gst_company_id, month)
    ON DELETE CASCADE
);

CREATE INDEX gst_payments_organization_id_idx
  ON gst_payments (organization_id);

CREATE INDEX gst_payments_company_month_idx
  ON gst_payments (organization_id, gst_company_id, month);

-- Same idempotency key must not create duplicate payment rows for one company.
CREATE UNIQUE INDEX gst_payments_company_idempotency_uidx
  ON gst_payments (organization_id, gst_company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND length(trim(idempotency_key)) > 0;
