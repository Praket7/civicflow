-- Operational records now name the organization they belong to. These six
-- tables were introduced while an installation held a single workspace, so
-- they were written and read without an organization. Each row that already
-- exists belongs to the organization this database was created for, which is
-- the oldest one. New writes stamp the organization the session is acting in.
--
-- A membership also names the roster profile it belongs to. One person can
-- volunteer at two organizations, and each roster has its own record for them;
-- a single `users.volunteer_id` could only ever point at one of those.

ALTER TABLE organization_memberships ADD COLUMN volunteer_id TEXT
    REFERENCES volunteers(id) ON DELETE SET NULL;

UPDATE organization_memberships
SET volunteer_id = (SELECT u.volunteer_id FROM users u WHERE u.id = organization_memberships.user_id)
WHERE volunteer_id IS NULL;

ALTER TABLE audit_events ADD COLUMN organization_id TEXT
    REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE activity_events ADD COLUMN organization_id TEXT
    REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD COLUMN organization_id TEXT
    REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE applications ADD COLUMN organization_id TEXT
    REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE report_saved_views ADD COLUMN organization_id TEXT
    REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE impact_metric_definitions ADD COLUMN organization_id TEXT
    REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE audit_events
SET organization_id = (SELECT id FROM organizations ORDER BY created_at, id LIMIT 1)
WHERE organization_id IS NULL;

UPDATE activity_events
SET organization_id = (SELECT id FROM organizations ORDER BY created_at, id LIMIT 1)
WHERE organization_id IS NULL;

UPDATE notifications
SET organization_id = (SELECT id FROM organizations ORDER BY created_at, id LIMIT 1)
WHERE organization_id IS NULL;

UPDATE applications
SET organization_id = (SELECT id FROM organizations ORDER BY created_at, id LIMIT 1)
WHERE organization_id IS NULL;

UPDATE report_saved_views
SET organization_id = (SELECT id FROM organizations ORDER BY created_at, id LIMIT 1)
WHERE organization_id IS NULL;

UPDATE impact_metric_definitions
SET organization_id = (SELECT organization_id FROM opportunities
                       WHERE opportunities.id = impact_metric_definitions.opportunity_id)
WHERE organization_id IS NULL;

-- A saved view is named inside one organization, so the same name may exist
-- once per organization. Rebuilding the table is the only way SQLite lets a
-- unique key change; the rows keep their identifiers.
CREATE TABLE report_saved_views_scoped (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    scope TEXT NOT NULL,
    name TEXT NOT NULL,
    filters_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
    UNIQUE (organization_id, owner_id, scope, name)
);

INSERT INTO report_saved_views_scoped
    (id, owner_id, scope, name, filters_json, created_at, organization_id)
SELECT id, owner_id, scope, name, filters_json, created_at, organization_id
FROM report_saved_views;

DROP TABLE report_saved_views;
ALTER TABLE report_saved_views_scoped RENAME TO report_saved_views;

CREATE INDEX audit_events_organization ON audit_events(organization_id, timestamp DESC);
CREATE INDEX activity_events_organization ON activity_events(organization_id, at DESC);
CREATE INDEX notifications_organization ON notifications(organization_id, created_at);
CREATE INDEX applications_organization ON applications(organization_id, applied_at);
CREATE INDEX report_saved_views_organization ON report_saved_views(organization_id, created_at);
