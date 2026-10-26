-- Organizations become records in their own right rather than a single profile
-- row, and access to one is decided by a membership row instead of a frontend
-- list. Invitations store only the hash of their token, so the database never
-- holds a value that can be replayed as a credential.

ALTER TABLE organizations ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'private'));
ALTER TABLE organizations ADD COLUMN image TEXT;
ALTER TABLE organizations ADD COLUMN image_alt TEXT;
ALTER TABLE organizations ADD COLUMN created_at TEXT NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN created_by_user_id TEXT REFERENCES users(id)
    ON DELETE SET NULL;

UPDATE organizations
SET created_at = strftime('%Y-%m-%dT%H:%M:%S+00:00', 'now')
WHERE created_at = '';

CREATE TABLE organization_contacts (
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (organization_id, email)
);

CREATE TABLE organization_memberships (
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('coordinator', 'volunteer')),
    status TEXT NOT NULL CHECK (status IN ('active', 'invited', 'disabled')),
    joined_at TEXT NOT NULL,
    PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX organization_memberships_user ON organization_memberships(user_id, status);

CREATE TABLE organization_invites (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('coordinator', 'volunteer')),
    token_hash TEXT NOT NULL UNIQUE,
    created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    redeemed_at TEXT,
    redeemed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX organization_invites_organization
    ON organization_invites(organization_id, redeemed_at, expires_at);

CREATE TABLE organization_updates (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('event', 'announcement')),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    href TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    author_user_id TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX organization_updates_feed ON organization_updates(organization_id, created_at DESC);

CREATE TABLE organization_update_reads (
    update_id TEXT NOT NULL REFERENCES organization_updates(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    read_at TEXT NOT NULL,
    PRIMARY KEY (update_id, user_id)
);

-- Accounts created before this migration already had access to the workspace
-- organization. They keep exactly that access, and nothing more.
INSERT INTO organization_memberships (organization_id, user_id, role, status, joined_at)
SELECT o.id, u.id, u.role, 'active', COALESCE(u.created_at, strftime('%Y-%m-%dT%H:%M:%S+00:00', 'now'))
FROM organizations o
CROSS JOIN users u
WHERE NOT EXISTS (
    SELECT 1 FROM organization_memberships m
    WHERE m.organization_id = o.id AND m.user_id = u.id
);
