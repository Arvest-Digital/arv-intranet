-- identity module: access roles and the permission keys they grant (one aggregate).
-- Staged by generate-data-model; implement-tasks promotes it into @arv/migrations (via schema.ts + pnpm db:generate).

CREATE SCHEMA IF NOT EXISTS identity;

CREATE TABLE IF NOT EXISTS identity.access_roles (
    id              UUID          PRIMARY KEY DEFAULT uuidv7(),
    name            VARCHAR(100)  NOT NULL,
    -- No DB default: the app writes false on insert.
    is_preselected  BOOLEAN       NOT NULL,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- AC-10: role names are unique ignoring letter case and surrounding spaces; Flow 6 / AC-15 look roles up by this key.
CREATE UNIQUE INDEX IF NOT EXISTS access_roles_name_key_unique ON identity.access_roles (lower(btrim(name)));
-- AC-13: at most one role is pre-selected for new people; Flows 4 and 7 read the mark from this one-row index.
CREATE UNIQUE INDEX IF NOT EXISTS access_roles_one_preselected_unique ON identity.access_roles ((true)) WHERE is_preselected;

CREATE TABLE IF NOT EXISTS identity.access_role_permissions (
    access_role_id  UUID          NOT NULL REFERENCES identity.access_roles (id) ON DELETE CASCADE,
    -- Key from the code-declared catalog (ADR-0004), e.g. identity:manage-access. Not an FK; undeclared = retired.
    permission_key  VARCHAR(100)  NOT NULL,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    PRIMARY KEY (access_role_id, permission_key)
);

-- The PK (access_role_id leading) is the FK index and serves "role -> granted keys" (Critical flow 2, Flow 10).
-- Last-admin check (AC-14), first-admin rule (AC-15), admins on the not-set-up screen (AC-03): roles granting a key.
CREATE INDEX IF NOT EXISTS idx_access_role_permissions_permission_key ON identity.access_role_permissions (permission_key);
