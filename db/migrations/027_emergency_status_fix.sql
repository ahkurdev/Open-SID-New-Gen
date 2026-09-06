-- 027_emergency_status_fix.sql — widen status kolom (team_assigned = 13 chars)
ALTER TABLE emergency_reports ALTER COLUMN status TYPE varchar(15);
