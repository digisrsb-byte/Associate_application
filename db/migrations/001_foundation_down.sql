-- Phase 1 foundation rollback. Drops only objects created by 001_foundation.sql.
-- NEVER DROP DATABASE. NEVER DROP SCHEMA public.

DROP TABLE IF EXISTS gst_filings;
DROP TABLE IF EXISTS gst_companies;
DROP TABLE IF EXISTS it_filings;
DROP TABLE IF EXISTS it_clients;
DROP TABLE IF EXISTS gst_months;
DROP TABLE IF EXISTS assessment_years;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS organization_members;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS organizations;
DROP TABLE IF EXISTS schema_migrations;
