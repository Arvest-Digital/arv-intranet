ALTER TABLE IF EXISTS org.teams DROP CONSTRAINT IF EXISTS teams_team_lead_id_fkey;
DROP INDEX IF EXISTS org.idx_teams_team_lead_id;
DROP INDEX IF EXISTS org.idx_employee_records_team_id;
DROP INDEX IF EXISTS org.employee_records_user_id_unique;
DROP TABLE IF EXISTS org.employee_records;
DROP INDEX IF EXISTS org.teams_name_key_unique;
DROP TABLE IF EXISTS org.teams;
DROP SCHEMA IF EXISTS org;
