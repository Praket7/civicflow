CREATE TABLE organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    initials TEXT NOT NULL,
    mission TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    address TEXT NOT NULL,
    website TEXT NOT NULL,
    email TEXT NOT NULL,
    timezone TEXT NOT NULL
);

CREATE TABLE app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE volunteers (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    first_name TEXT NOT NULL,
    initials TEXT NOT NULL,
    role TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL,
    joined_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'onboarding', 'inactive')),
    tone TEXT NOT NULL,
    languages_json TEXT NOT NULL,
    causes_json TEXT NOT NULL,
    hours_verified REAL NOT NULL CHECK (hours_verified >= 0),
    attendance_rate INTEGER NOT NULL CHECK (attendance_rate BETWEEN 0 AND 100),
    events_completed INTEGER NOT NULL CHECK (events_completed >= 0),
    interests TEXT NOT NULL,
    availability_json TEXT NOT NULL
);

CREATE TABLE volunteer_skills (
    volunteer_id TEXT NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
    skill TEXT NOT NULL,
    PRIMARY KEY (volunteer_id, skill)
);

CREATE TABLE opportunities (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    cause TEXT NOT NULL,
    organization_name TEXT NOT NULL,
    image TEXT NOT NULL,
    image_alt TEXT NOT NULL,
    description TEXT NOT NULL,
    address TEXT NOT NULL,
    distance_miles REAL NOT NULL CHECK (distance_miles >= 0),
    coordinator TEXT NOT NULL,
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    duration TEXT NOT NULL,
    training_json TEXT NOT NULL,
    requirements_json TEXT NOT NULL,
    impact_metric TEXT NOT NULL
);

CREATE TABLE shifts (
    id TEXT PRIMARY KEY,
    opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    confirmed INTEGER NOT NULL CHECK (confirmed >= 0),
    waitlisted INTEGER NOT NULL DEFAULT 0 CHECK (waitlisted >= 0),
    status TEXT NOT NULL CHECK (status IN ('scheduled', 'completed', 'canceled')),
    CHECK (confirmed <= capacity),
    CHECK (ends_at > starts_at)
);

CREATE TABLE shift_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shift_id TEXT NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    required INTEGER NOT NULL CHECK (required >= 0),
    filled INTEGER NOT NULL CHECK (filled >= 0),
    UNIQUE (shift_id, name),
    CHECK (filled <= required)
);

CREATE TABLE hour_entries (
    id TEXT PRIMARY KEY,
    volunteer_id TEXT NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
    opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE RESTRICT,
    date TEXT NOT NULL,
    minutes INTEGER NOT NULL CHECK (minutes >= 0 AND minutes <= 1440),
    status TEXT NOT NULL CHECK (status IN ('verified', 'pending', 'rejected')),
    verification_id TEXT UNIQUE
);

CREATE TABLE notifications (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    priority TEXT NOT NULL CHECK (priority IN ('high', 'normal')),
    created_at TEXT NOT NULL,
    read_at TEXT,
    href TEXT NOT NULL
);

CREATE TABLE activity_events (
    id TEXT PRIMARY KEY,
    volunteer_id TEXT NOT NULL,
    name TEXT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT NOT NULL,
    tone TEXT NOT NULL,
    at TEXT NOT NULL
);

CREATE TABLE audit_events (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    actor_type TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    summary TEXT NOT NULL
);

CREATE TABLE impact_totals (
    organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    hours_ytd INTEGER NOT NULL,
    unique_volunteers_ytd INTEGER NOT NULL,
    meals_packed INTEGER NOT NULL,
    tutoring_sessions INTEGER NOT NULL,
    trees_planted INTEGER NOT NULL,
    families_served_month INTEGER NOT NULL,
    shifts_completed INTEGER NOT NULL,
    attendance_rate INTEGER NOT NULL
);

CREATE INDEX idx_shifts_starts_at ON shifts(starts_at);
CREATE INDEX idx_shifts_opportunity ON shifts(opportunity_id);
CREATE INDEX idx_hours_volunteer ON hour_entries(volunteer_id);
CREATE INDEX idx_notifications_created ON notifications(created_at);
