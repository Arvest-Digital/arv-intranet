-- Documentation only: drizzle has no down migrations; a rollback is a new forward migration.
DROP INDEX IF EXISTS identity.idx_sessions_expires_at;
DROP INDEX IF EXISTS identity.idx_sessions_user_id;
DROP INDEX IF EXISTS identity.sessions_token_hash_unique;
DROP TABLE IF EXISTS identity.sessions;
