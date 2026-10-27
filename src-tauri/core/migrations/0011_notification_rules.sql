-- Reminders are rules, not a marketing platform. Each rule is a trigger, an
-- offset, an audience and an on/off switch, and every notification records the
-- rule that produced it. A coordinator can therefore answer "why did this alert
-- exist?" with a row instead of a guess, and turning a rule off stops its
-- notifications at the next generation pass rather than only hiding them.
CREATE TABLE notification_rules (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    trigger_type TEXT NOT NULL CHECK (
        trigger_type IN (
            'shift_reminder',
            'checkin_soon',
            'missed_shift_follow_up',
            'credential_expiring'
        )
    ),
    offset_minutes INTEGER NOT NULL,
    audience TEXT NOT NULL CHECK (audience IN ('volunteer', 'coordinator')),
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    created_at TEXT NOT NULL,
    UNIQUE (organization_id, trigger_type, audience)
);

ALTER TABLE notifications ADD COLUMN rule_id TEXT REFERENCES notification_rules(id) ON DELETE SET NULL;
