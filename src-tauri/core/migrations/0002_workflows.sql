ALTER TABLE volunteers ADD COLUMN onboarding_completed INTEGER NOT NULL DEFAULT 1;
ALTER TABLE opportunities ADD COLUMN created_at TEXT;
ALTER TABLE hour_entries ADD COLUMN approved_minutes INTEGER;
ALTER TABLE hour_entries ADD COLUMN reviewed_at TEXT;
ALTER TABLE hour_entries ADD COLUMN reviewer TEXT;
ALTER TABLE hour_entries ADD COLUMN review_reason TEXT;
ALTER TABLE audit_events ADD COLUMN detail TEXT;

CREATE TABLE saved_opportunities (
    volunteer_id TEXT NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
    opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    saved_at TEXT NOT NULL,
    PRIMARY KEY (volunteer_id, opportunity_id)
);

CREATE TABLE applications (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    initials TEXT NOT NULL,
    tone TEXT NOT NULL,
    stage TEXT NOT NULL CHECK (stage IN ('applied', 'review', 'onboarding', 'active')),
    applied_at TEXT NOT NULL,
    source TEXT NOT NULL,
    cause TEXT NOT NULL,
    skills_json TEXT NOT NULL,
    note TEXT NOT NULL
);

CREATE TABLE waitlist_entries (
    id TEXT PRIMARY KEY,
    shift_id TEXT NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    volunteer_id TEXT NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('waiting', 'promoted', 'declined', 'expired', 'removed')),
    position INTEGER NOT NULL CHECK (position > 0),
    eligible_role TEXT NOT NULL,
    UNIQUE (shift_id, volunteer_id)
);

CREATE TABLE registrations (
    shift_id TEXT NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    volunteer_id TEXT NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (shift_id, volunteer_id)
);

CREATE TABLE attendance_events (
    shift_id TEXT NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    volunteer_id TEXT NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('expected', 'checked_in', 'completed', 'no_show')),
    checked_in_at TEXT,
    checked_out_at TEXT,
    recorded_at TEXT NOT NULL,
    PRIMARY KEY (shift_id, volunteer_id)
);

CREATE INDEX idx_waitlist_shift ON waitlist_entries(shift_id, position);
CREATE INDEX idx_registrations_shift ON registrations(shift_id);
CREATE INDEX idx_attendance_shift ON attendance_events(shift_id);
CREATE INDEX idx_audit_at ON audit_events(timestamp DESC);
