-- projects module: projects of every type, open until the end of their close date.

CREATE SCHEMA IF NOT EXISTS projects;

CREATE TABLE IF NOT EXISTS projects.projects (
    id          UUID         PRIMARY KEY DEFAULT uuidv7(),
    name        VARCHAR(200) NOT NULL,
    type        VARCHAR(16)  NOT NULL,
    close_date  DATE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- AC-24: "open project with the same name ignoring case and surrounding spaces" (flow 11).
-- Not UNIQUE: uniqueness holds only among open projects, and "open" depends on today's date.
CREATE INDEX IF NOT EXISTS idx_projects_name_key ON projects.projects (lower(btrim(name)));
