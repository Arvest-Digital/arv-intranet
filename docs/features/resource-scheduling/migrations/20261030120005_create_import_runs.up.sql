-- scheduling module: the one-time spreadsheet import (US-11). Only completed runs are stored.

CREATE SCHEMA IF NOT EXISTS scheduling;

CREATE TABLE IF NOT EXISTS scheduling.import_runs (
    id                        UUID         PRIMARY KEY DEFAULT uuidv7(),
    imported_by               UUID         NOT NULL,
    employee_records_created  INTEGER      NOT NULL,
    projects_created          INTEGER      NOT NULL,
    allocations_created       INTEGER      NOT NULL,
    created_at                TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- AC-32: at most one completed import, even if two imports commit concurrently.
CREATE UNIQUE INDEX IF NOT EXISTS import_runs_one_time_unique ON scheduling.import_runs ((true));
