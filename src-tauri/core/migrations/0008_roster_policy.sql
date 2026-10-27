-- The rules AutoRoster follows for one organization. Versions accumulate rather
-- than overwrite: a generated plan names the version that produced it, so a
-- coordinator can ask what changed between two plans. No row means the shipped
-- defaults, which is why nothing has to be backfilled here.
CREATE TABLE organization_roster_policies (
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    policy_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY (organization_id, version)
);
