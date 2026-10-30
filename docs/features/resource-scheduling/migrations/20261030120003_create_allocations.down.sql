DROP INDEX IF EXISTS scheduling.idx_allocation_segments_ends_on_starts_on;
DROP INDEX IF EXISTS scheduling.idx_allocation_segments_allocation_id;
DROP TABLE IF EXISTS scheduling.allocation_segments;
DROP INDEX IF EXISTS scheduling.idx_allocations_project_id;
DROP INDEX IF EXISTS scheduling.idx_allocations_employee_id;
DROP TABLE IF EXISTS scheduling.allocations;
DROP SCHEMA IF EXISTS scheduling;
