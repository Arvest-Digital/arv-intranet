-- scheduling module: the allocation aggregate — allocations and their effective-dated segments (ADR-0008).
-- employee_id / project_id point into the org / projects schemas: no cross-schema foreign keys.

CREATE SCHEMA IF NOT EXISTS scheduling;

CREATE TABLE IF NOT EXISTS scheduling.allocations (
    id               UUID         PRIMARY KEY DEFAULT uuidv7(),
    employee_id      UUID         NOT NULL,
    project_id       UUID         NOT NULL,
    version          INTEGER      NOT NULL,
    last_changed_by  UUID         NOT NULL,
    last_changed_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_allocations_employee_id ON scheduling.allocations (employee_id);
CREATE INDEX IF NOT EXISTS idx_allocations_project_id ON scheduling.allocations (project_id);

CREATE TABLE IF NOT EXISTS scheduling.allocation_segments (
    id             UUID         PRIMARY KEY DEFAULT uuidv7(),
    allocation_id  UUID         NOT NULL REFERENCES scheduling.allocations (id) ON DELETE CASCADE,
    starts_on      DATE         NOT NULL,
    ends_on        DATE         NOT NULL,
    rate_minutes   INTEGER,
    rate_period    VARCHAR(8)   NOT NULL,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_allocation_segments_allocation_id ON scheduling.allocation_segments (allocation_id);
-- Window overlap reads: ends_on >= :from AND starts_on <= :to (board, free list, close preview, capacity impact).
CREATE INDEX IF NOT EXISTS idx_allocation_segments_ends_on_starts_on ON scheduling.allocation_segments (ends_on, starts_on);
