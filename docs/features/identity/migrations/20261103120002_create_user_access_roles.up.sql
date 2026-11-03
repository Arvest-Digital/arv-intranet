-- identity module: which access roles each user on the access list holds.
-- Staged by generate-data-model; implement-tasks promotes it into @arv/migrations (via schema.ts + pnpm db:generate).
-- Depends on 20261103120001_create_access_roles.

CREATE SCHEMA IF NOT EXISTS identity;

CREATE TABLE IF NOT EXISTS identity.user_access_roles (
    -- AC-07: a removed user's assignments go with them.
    user_id         UUID         NOT NULL REFERENCES identity.users (id) ON DELETE CASCADE,
    -- AC-11: deleting a role ends every holder's assignment.
    access_role_id  UUID         NOT NULL REFERENCES identity.access_roles (id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, access_role_id)
);

-- The PK (user_id leading) is the user_id FK index and serves "user -> access roles" (Critical flow 2, Flow 8).
-- FK index; role holder count (Flows 7, 10) and the last-admin count (AC-14) join grants to assignments by role.
CREATE INDEX IF NOT EXISTS idx_user_access_roles_access_role_id ON identity.user_access_roles (access_role_id);
