-- A profile photo chosen by the volunteer. Stored as a small data URL so the
-- image travels with the local backup and never needs a network request.
ALTER TABLE volunteers ADD COLUMN photo TEXT NOT NULL DEFAULT '';
