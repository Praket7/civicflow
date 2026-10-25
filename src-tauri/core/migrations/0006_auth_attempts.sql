-- Failed sign-in attempts, one row per email. The password form reads it to
-- slow down guessing: a handful of misses in a window is free, after that the
-- wait grows until a real sign-in clears the row. It holds no secrets.
CREATE TABLE IF NOT EXISTS auth_attempts (
    email TEXT PRIMARY KEY,
    failed_count INTEGER NOT NULL,
    first_failed_at TEXT NOT NULL,
    locked_until TEXT
);
