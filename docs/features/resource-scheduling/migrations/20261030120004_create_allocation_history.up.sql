-- scheduling module: allocation change history, kept 12 months then purged (AC-16, PRD §6).
-- allocation_id has no foreign key on purpose: the "removed" entry must outlive a deleted allocation (AC-07a, AC-25).

CREATE SCHEMA IF NOT EXISTS scheduling;

CREATE TABLE IF NOT EXISTS scheduling.allocation_history (
    id              UUID         PRIMARY KEY DEFAULT uuidv7(),
    allocation_id   UUID         NOT NULL,
    employee_id     UUID         NOT NULL,
    project_id      UUID         NOT NULL,
    change_kind     VARCHAR(16)  NOT NULL,
    effective_from  DATE,
    before_values   JSONB,
    after_values    JSONB,
    changed_by      UUID         NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Flow 7: an allocation's entries of the last 12 months, in order.
CREATE INDEX IF NOT EXISTS idx_allocation_history_allocation_id_created_at
    ON scheduling.allocation_history (allocation_id, created_at);
-- Monthly purge: DELETE ... WHERE created_at < :cutoff.
CREATE INDEX IF NOT EXISTS idx_allocation_history_created_at ON scheduling.allocation_history (created_at);
