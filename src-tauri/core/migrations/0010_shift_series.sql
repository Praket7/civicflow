-- A volunteer program repeats the same shift every week, and rebuilding it by
-- hand is the work coordinators complain about most. A series stores the rule
-- once and owns the shifts it generated, so an instance is never an orphan copy
-- of its metadata: editing the series reaches every instance it created, and
-- deleting the series takes the schedule it produced with it.
--
-- The recurrence is deliberately small: no repeat, or weekly every N weeks on
-- chosen weekdays, ended by a date or by an occurrence count. Nothing here is an
-- iCalendar RRULE, because nothing in the product needs one.
CREATE TABLE shift_series (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    timezone TEXT NOT NULL,
    recurrence_kind TEXT NOT NULL CHECK (recurrence_kind IN ('none', 'weekly')),
    interval_weeks INTEGER NOT NULL CHECK (interval_weeks BETWEEN 1 AND 8),
    weekdays_json TEXT NOT NULL,
    starts_local_time TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 15 AND 1440),
    starts_on TEXT NOT NULL,
    ends_on TEXT,
    occurrence_count INTEGER,
    created_at TEXT NOT NULL,
    -- One end condition, always: a series that never ends cannot be defended to
    -- a coordinator who has to staff it.
    CHECK ((ends_on IS NULL) <> (occurrence_count IS NULL)),
    CHECK (occurrence_count IS NULL OR occurrence_count BETWEEN 1 AND 60)
);

-- The roles a generated shift carries, copied from the series at generation
-- time. They live here rather than only on the shifts so a coordinator can top
-- up a series later without retyping the role list.
CREATE TABLE shift_series_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    series_id TEXT NOT NULL REFERENCES shift_series(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    required INTEGER NOT NULL CHECK (required >= 0),
    UNIQUE (series_id, name)
);

ALTER TABLE shifts ADD COLUMN series_id TEXT REFERENCES shift_series(id) ON DELETE SET NULL;
ALTER TABLE shifts ADD COLUMN occurrence_date TEXT;

CREATE INDEX shifts_series_idx ON shifts (series_id, occurrence_date);
