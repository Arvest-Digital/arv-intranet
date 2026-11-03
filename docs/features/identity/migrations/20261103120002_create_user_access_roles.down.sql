-- Documentation only: drizzle has no down migrations; a rollback is a new forward migration.
DROP INDEX IF EXISTS identity.idx_user_access_roles_access_role_id;
DROP TABLE IF EXISTS identity.user_access_roles;
