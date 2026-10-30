DROP INDEX IF EXISTS scheduling.idx_allocation_history_created_at;
DROP INDEX IF EXISTS scheduling.idx_allocation_history_allocation_id_created_at;
DROP TABLE IF EXISTS scheduling.allocation_history;
-- The scheduling schema is dropped by the down of 20261030120003_create_allocations.
