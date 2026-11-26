-- Phase 3A: password-reset challenges for PostgreSQL-authenticated users.
-- Additive only. Does not alter users, sessions, or ledger tables.
-- Never store raw reset tokens — token_salt / token_hash only.

CREATE TABLE password_reset_challenges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_salt  TEXT NOT NULL,
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at TIMESTAMPTZ NULL
);

-- At most one unconsumed challenge per user (last-request-wins supersede).
CREATE UNIQUE INDEX password_reset_challenges_user_unconsumed_uidx
  ON password_reset_challenges (user_id)
  WHERE consumed_at IS NULL;

-- Lookup challenges by user (active or historical).
CREATE INDEX password_reset_challenges_user_id_idx
  ON password_reset_challenges (user_id);
