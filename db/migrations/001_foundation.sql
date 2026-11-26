-- Phase 1 foundation schema for it_gst_management_dev (empty tables only).
-- No CREATE EXTENSION. No business data. No owner seed.

CREATE TABLE schema_migrations (
  id         TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE organizations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  recovery_salt TEXT NOT NULL,
  recovery_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_email_nonempty CHECK (length(trim(email)) > 0)
);

CREATE UNIQUE INDEX users_email_lower_uidx ON users (LOWER(email));

CREATE TABLE organization_members (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, user_id),
  CONSTRAINT organization_members_role_owner CHECK (role = 'owner')
);

CREATE TABLE sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ NULL,
  CONSTRAINT sessions_token_hash_nonempty CHECK (length(token_hash) > 0)
);

CREATE UNIQUE INDEX sessions_token_hash_uidx ON sessions (token_hash);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

-- Catalogs may contain periods with zero filings.
CREATE TABLE assessment_years (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,
  PRIMARY KEY (organization_id, label),
  CONSTRAINT assessment_years_label_nonempty CHECK (length(trim(label)) > 0)
);

CREATE TABLE gst_months (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,
  PRIMARY KEY (organization_id, label),
  CONSTRAINT gst_months_label_nonempty CHECK (length(trim(label)) > 0)
);

CREATE TABLE it_clients (
  id               TEXT PRIMARY KEY,
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  pan              TEXT NOT NULL,
  phone            TEXT NOT NULL DEFAULT '',
  reference_number TEXT NOT NULL DEFAULT '',
  remark           TEXT NULL,
  other_mobiles    TEXT NULL,
  name_variants    TEXT NULL,
  password_enc     TEXT NULL,
  created_at       TIMESTAMPTZ NOT NULL,
  updated_at       TIMESTAMPTZ NOT NULL,
  row_version      BIGINT NOT NULL DEFAULT 1,
  CONSTRAINT it_clients_id_nonempty CHECK (length(trim(id)) > 0),
  CONSTRAINT it_clients_org_id_uidx UNIQUE (organization_id, id)
);

CREATE INDEX it_clients_organization_id_idx ON it_clients (organization_id);

CREATE TABLE it_filings (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID NOT NULL,
  it_client_id         TEXT NOT NULL,
  assessment_year      TEXT NOT NULL,
  filing_date          TEXT NOT NULL DEFAULT '',
  fees                 NUMERIC(14,2) NOT NULL DEFAULT 0,
  received             NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance              NUMERIC(14,2) NOT NULL DEFAULT 0,
  payment_type         TEXT NOT NULL DEFAULT '',
  payment_receive_date TEXT NOT NULL DEFAULT '',
  CONSTRAINT it_filings_year_nonempty CHECK (length(trim(assessment_year)) > 0),
  CONSTRAINT it_filings_client_year_uidx UNIQUE (it_client_id, assessment_year),
  CONSTRAINT it_filings_client_org_fk
    FOREIGN KEY (organization_id, it_client_id)
    REFERENCES it_clients (organization_id, id)
    ON DELETE CASCADE,
  CONSTRAINT it_filings_year_catalog_fk
    FOREIGN KEY (organization_id, assessment_year)
    REFERENCES assessment_years (organization_id, label)
);

CREATE INDEX it_filings_organization_id_idx ON it_filings (organization_id);

CREATE TABLE gst_companies (
  id               TEXT PRIMARY KEY,
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  company_name     TEXT NOT NULL,
  portal_user_id   TEXT NOT NULL DEFAULT '',
  phone            TEXT NOT NULL DEFAULT '',
  reference_number TEXT NOT NULL DEFAULT '',
  remark           TEXT NULL,
  total_received   NUMERIC(14,2) NOT NULL DEFAULT 0,
  password_enc     TEXT NULL,
  created_at       TIMESTAMPTZ NOT NULL,
  updated_at       TIMESTAMPTZ NOT NULL,
  row_version      BIGINT NOT NULL DEFAULT 1,
  CONSTRAINT gst_companies_id_nonempty CHECK (length(trim(id)) > 0),
  CONSTRAINT gst_companies_org_id_uidx UNIQUE (organization_id, id)
);

CREATE INDEX gst_companies_organization_id_idx ON gst_companies (organization_id);

CREATE TABLE gst_filings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  gst_company_id  TEXT NOT NULL,
  month           TEXT NOT NULL,
  fees            NUMERIC(14,2) NOT NULL DEFAULT 0,
  interest        NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax             NUMERIC(14,2) NOT NULL DEFAULT 0,
  total           NUMERIC(14,2) NOT NULL DEFAULT 0,
  CONSTRAINT gst_filings_month_nonempty CHECK (length(trim(month)) > 0),
  CONSTRAINT gst_filings_company_month_uidx UNIQUE (gst_company_id, month),
  CONSTRAINT gst_filings_company_org_fk
    FOREIGN KEY (organization_id, gst_company_id)
    REFERENCES gst_companies (organization_id, id)
    ON DELETE CASCADE,
  CONSTRAINT gst_filings_month_catalog_fk
    FOREIGN KEY (organization_id, month)
    REFERENCES gst_months (organization_id, label)
);

CREATE INDEX gst_filings_organization_id_idx ON gst_filings (organization_id);
