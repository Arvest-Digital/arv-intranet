-- identity module: server-side sign-in sessions (ADR-0003).
-- Staged by generate-data-model; implement-tasks promotes it into @arv/migrations (via schema.ts + pnpm db:generate).

CREATE SCHEMA IF NOT EXISTS identity;

CREATE TABLE IF NOT EXISTS identity.sessions (
    id              UUID         PRIMARY KEY DEFAULT uuidv7(),
    token_hash      VARCHAR(64)  NOT NULL,
    -- Nullable on purpose: a removed user's revoked sessions survive so the next request can say "access removed" (AC-07).
    user_id         UUID         REFERENCES identity.users (id) ON DELETE SET NULL,
    expires_at      TIMESTAMPTZ  NOT NULL,
    revoked_reason  VARCHAR(32),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Critical flow 2: per-request lookup of the session by its token hash; Flow 11: sign-out by token hash.
CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_hash_unique ON identity.sessions (token_hash);
-- FK index; Critical flow 3: revoke all of a removed user's sessions (AC-07).
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON identity.sessions (user_id);
-- Lazy purge at sign-in: delete sessions that expired before now.
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON identity.sessions (expires_at);
