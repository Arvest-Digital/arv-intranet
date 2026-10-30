-- org module: teams and employee records (one migration: the two tables reference each other).
-- Staged by generate-data-model; implement-tasks promotes it into @arv/migrations.

CREATE SCHEMA IF NOT EXISTS org;

CREATE TABLE IF NOT EXISTS org.teams (
    id            UUID         PRIMARY KEY DEFAULT uuidv7(),
    name          VARCHAR(100) NOT NULL,
    team_lead_id  UUID,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- AC-19d: team names are compared ignoring letter case and leading/trailing spaces.
CREATE UNIQUE INDEX IF NOT EXISTS teams_name_key_unique ON org.teams (lower(btrim(name)));

CREATE TABLE IF NOT EXISTS org.employee_records (
    id                UUID         PRIMARY KEY DEFAULT uuidv7(),
    full_name         VARCHAR(200) NOT NULL,
    user_id           UUID,
    team_id           UUID         REFERENCES org.teams (id) ON DELETE RESTRICT,
    contract_minutes  INTEGER,
    working_days      SMALLINT[]   NOT NULL,
    employment_start  DATE,
    employment_end    DATE,
    version           INTEGER      NOT NULL,
    last_changed_by   UUID         NOT NULL,
    last_changed_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- AC-19b: one login belongs to exactly one employee record; also serves "employee by login" (flow 8).
CREATE UNIQUE INDEX IF NOT EXISTS employee_records_user_id_unique ON org.employee_records (user_id);
CREATE INDEX IF NOT EXISTS idx_employee_records_team_id ON org.employee_records (team_id);

-- teams.team_lead_id -> employee_records closes the cycle; drop-then-add keeps a re-run idempotent.
ALTER TABLE org.teams DROP CONSTRAINT IF EXISTS teams_team_lead_id_fkey;
ALTER TABLE org.teams
    ADD CONSTRAINT teams_team_lead_id_fkey
    FOREIGN KEY (team_lead_id) REFERENCES org.employee_records (id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_teams_team_lead_id ON org.teams (team_lead_id);
