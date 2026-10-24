-- Local accounts. The app remains offline; passwords are hashed with Argon2id
-- and never leave this SQLite file. Existing demo users receive a password when
-- the workspace is next opened.
ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN volunteer_id TEXT REFERENCES volunteers(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled'));
ALTER TABLE users ADD COLUMN last_login_at TEXT;

CREATE TABLE auth_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked_at TEXT
);

CREATE INDEX auth_sessions_user ON auth_sessions(user_id, expires_at);

-- Notifications were a single mixed feed. New rows carry an audience so a
-- coordinator does not receive volunteer-only alerts and vice versa.
ALTER TABLE notifications ADD COLUMN audience TEXT NOT NULL DEFAULT 'coordinator'
    CHECK (audience IN ('coordinator', 'volunteer', 'all'));
ALTER TABLE notifications ADD COLUMN volunteer_id TEXT REFERENCES volunteers(id) ON DELETE CASCADE;

UPDATE notifications SET audience = 'volunteer' WHERE href LIKE '/volunteer/%';

CREATE INDEX notifications_audience ON notifications(audience, created_at);
