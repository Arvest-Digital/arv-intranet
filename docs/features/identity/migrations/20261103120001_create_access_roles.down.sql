-- Documentation only: drizzle has no down migrations; a rollback is a new forward migration.
DROP INDEX IF EXISTS identity.idx_access_role_permissions_permission_key;
DROP TABLE IF EXISTS identity.access_role_permissions;
DROP INDEX IF EXISTS identity.access_roles_one_preselected_unique;
DROP INDEX IF EXISTS identity.access_roles_name_key_unique;
DROP TABLE IF EXISTS identity.access_roles;
