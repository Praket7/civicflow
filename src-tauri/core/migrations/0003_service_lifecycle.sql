-- Phase 6–8 foundation: credentials, role requirements, attendance ledger,
-- verification records, impact outcomes, saved report views and check-in codes.
-- Existing rows keep working; new columns are nullable or defaulted.

ALTER TABLE volunteers ADD COLUMN birthdate TEXT;

ALTER TABLE registrations ADD COLUMN status TEXT NOT NULL DEFAULT 'registered';
ALTER TABLE registrations ADD COLUMN updated_at TEXT;

ALTER TABLE hour_entries ADD COLUMN scheduled_minutes INTEGER;
ALTER TABLE hour_entries ADD COLUMN calculated_minutes INTEGER;
ALTER TABLE hour_entries ADD COLUMN source_shift_id TEXT REFERENCES shifts(id) ON DELETE SET NULL;
ALTER TABLE hour_entries ADD COLUMN note TEXT;

CREATE TABLE users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK (role IN ('coordinator', 'volunteer')),
    created_at TEXT NOT NULL
);

CREATE TABLE availability_rules (
    id TEXT PRIMARY KEY,
    volunteer_id TEXT NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
    day TEXT NOT NULL CHECK (day IN ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')),
    period TEXT NOT NULL CHECK (period IN ('morning', 'afternoon', 'evening')),
    UNIQUE (volunteer_id, day, period)
);

CREATE TABLE credential_types (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    validity_months INTEGER NOT NULL CHECK (validity_months > 0)
);

CREATE TABLE volunteer_credentials (
    id TEXT PRIMARY KEY,
    volunteer_id TEXT NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
    credential_type_id TEXT NOT NULL REFERENCES credential_types(id) ON DELETE RESTRICT,
    identifier TEXT NOT NULL,
    issued_at TEXT NOT NULL,
    valid_from TEXT NOT NULL,
    valid_through TEXT NOT NULL,
    verified_at TEXT,
    verified_by TEXT,
    notes TEXT,
    UNIQUE (volunteer_id, credential_type_id, identifier)
);

CREATE INDEX volunteer_credentials_volunteer ON volunteer_credentials(volunteer_id);
CREATE INDEX volunteer_credentials_expiry ON volunteer_credentials(valid_through);

CREATE TABLE role_requirements (
    id TEXT PRIMARY KEY,
    shift_id TEXT NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    role_name TEXT NOT NULL,
    skill TEXT,
    credential_type_id TEXT REFERENCES credential_types(id) ON DELETE SET NULL,
    minimum_age INTEGER,
    UNIQUE (shift_id, role_name)
);

CREATE TABLE attendance_ledger (
    id TEXT PRIMARY KEY,
    shift_id TEXT NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    volunteer_id TEXT NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (
        event_type IN (
            'check_in', 'check_out', 'manual_check_in', 'manual_check_out',
            'marked_late', 'marked_no_show', 'correction'
        )
    ),
    actor TEXT NOT NULL,
    note TEXT,
    at TEXT NOT NULL
);

CREATE INDEX attendance_ledger_shift ON attendance_ledger(shift_id, volunteer_id, at);

CREATE TABLE checkin_codes (
    id TEXT PRIMARY KEY,
    shift_id TEXT NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    issued_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    consumed_at TEXT,
    created_by TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

CREATE UNIQUE INDEX one_active_code_per_shift
    ON checkin_codes(shift_id) WHERE active = 1;

CREATE TABLE service_verifications (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    volunteer_id TEXT NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    date_start TEXT NOT NULL,
    date_end TEXT NOT NULL,
    total_minutes INTEGER NOT NULL CHECK (total_minutes > 0),
    issued_at TEXT NOT NULL,
    issued_by TEXT NOT NULL
);

CREATE INDEX service_verifications_volunteer ON service_verifications(volunteer_id, issued_at);

CREATE TABLE impact_metric_definitions (
    id TEXT PRIMARY KEY,
    opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    metric_key TEXT NOT NULL,
    name TEXT NOT NULL,
    unit TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (opportunity_id, metric_key)
);

CREATE TABLE impact_results (
    id TEXT PRIMARY KEY,
    definition_id TEXT NOT NULL REFERENCES impact_metric_definitions(id) ON DELETE CASCADE,
    shift_id TEXT REFERENCES shifts(id) ON DELETE SET NULL,
    value REAL NOT NULL CHECK (value >= 0),
    recorded_at TEXT NOT NULL,
    recorded_by TEXT NOT NULL
);

CREATE INDEX impact_results_definition ON impact_results(definition_id);

CREATE TABLE report_saved_views (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    scope TEXT NOT NULL,
    name TEXT NOT NULL,
    filters_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (owner_id, scope, name)
);

CREATE TABLE volunteer_stage_history (
    id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    from_stage TEXT NOT NULL,
    to_stage TEXT NOT NULL,
    changed_at TEXT NOT NULL,
    changed_by TEXT NOT NULL,
    note TEXT
);

CREATE INDEX volunteer_stage_history_application
    ON volunteer_stage_history(application_id, changed_at);

CREATE TABLE backup_snapshots (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL,
    created_at TEXT NOT NULL,
    trigger TEXT NOT NULL,
    database_size INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    integrity TEXT NOT NULL,
    counts_json TEXT NOT NULL
);
