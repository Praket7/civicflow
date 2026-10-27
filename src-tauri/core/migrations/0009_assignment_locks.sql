-- A coordinator can hold one seat still. Recovery and AutoRoster may fill open
-- seats but never move a locked assignment, so human judgement survives the
-- optimizer instead of being overwritten by the next plan. The lock records who
-- set it and when, because "who moved my volunteer?" is a question the audit
-- trail has to answer.
ALTER TABLE registrations ADD COLUMN locked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE registrations ADD COLUMN locked_by TEXT;
ALTER TABLE registrations ADD COLUMN locked_at TEXT;
