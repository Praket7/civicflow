//! The one clock every domain rule reads.
//!
//! Production workspaces follow the system clock. A demo or a test pins the
//! clock in `app_settings`, so the same domain code runs in both modes. Nothing
//! outside this module asks where the time came from, which is what keeps
//! "demo" out of ordinary behaviour.

use chrono::{DateTime, FixedOffset, Utc};
use rusqlite::{params, Connection, OptionalExtension};

use crate::error::Result;

/// The setting that pins the clock. Absent means "follow the system clock".
pub const CLOCK_SETTING: &str = "workspace_clock";

fn pinned(conn: &Connection) -> Result<Option<DateTime<FixedOffset>>> {
    let raw: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            params![CLOCK_SETTING],
            |row| row.get(0),
        )
        .optional()?;
    Ok(raw.and_then(|value| DateTime::parse_from_rfc3339(&value).ok()))
}

/// The current time for this workspace.
pub fn now(conn: &Connection) -> Result<DateTime<FixedOffset>> {
    Ok(pinned(conn)?.unwrap_or_else(|| Utc::now().fixed_offset()))
}

/// Whether the clock is pinned, which is how a demo or a test behaves.
pub fn is_pinned(conn: &Connection) -> Result<bool> {
    Ok(pinned(conn)?.is_some())
}

/// Pins the clock to a moment. Used by demo fixtures and by tests that need a
/// stable date; a malformed value is rejected rather than silently ignored.
pub fn pin(conn: &Connection, at: &str) -> Result<DateTime<FixedOffset>> {
    let parsed = DateTime::parse_from_rfc3339(at)?;
    conn.execute(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?1, ?2)",
        params![CLOCK_SETTING, parsed.to_rfc3339()],
    )?;
    Ok(parsed)
}

/// Returns the workspace to the system clock.
pub fn unpin(conn: &Connection) -> Result<()> {
    conn.execute(
        "DELETE FROM app_settings WHERE key = ?1",
        params![CLOCK_SETTING],
    )?;
    Ok(())
}

/// The organization timezone, or UTC when the workspace has none yet.
pub fn timezone(conn: &Connection) -> String {
    conn.query_row("SELECT timezone FROM organizations LIMIT 1", [], |row| {
        row.get::<_, String>(0)
    })
    .unwrap_or_else(|_| "UTC".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    #[test]
    fn a_fresh_workspace_reads_the_system_clock() {
        let database = Database::in_memory().unwrap();
        let conn = database.connection();
        assert!(!is_pinned(conn).unwrap());
        let before = Utc::now();
        let stamped = now(conn).unwrap();
        assert!((stamped.with_timezone(&Utc) - before).num_seconds().abs() < 5);
    }

    #[test]
    fn a_pinned_clock_wins_and_can_be_released() {
        let database = Database::in_memory().unwrap();
        let conn = database.connection();
        let at = "2026-10-13T07:45:00-04:00";
        assert_eq!(pin(conn, at).unwrap().to_rfc3339(), at);
        assert_eq!(now(conn).unwrap().to_rfc3339(), at);
        unpin(conn).unwrap();
        assert!(!is_pinned(conn).unwrap());
    }

    #[test]
    fn a_malformed_pin_is_rejected() {
        let database = Database::in_memory().unwrap();
        assert!(pin(database.connection(), "next tuesday").is_err());
    }

    #[test]
    fn a_real_workspace_is_never_a_demo_and_cannot_be_overwritten() {
        use crate::auth::Account;
        use crate::organizations::{create_organization, NewOrganization};

        let mut database = Database::in_memory().unwrap();
        assert!(!database.is_demo().unwrap());

        let owner: Account = crate::auth::create_account(
            database.connection(),
            "Real Owner",
            "owner@example.org",
            "river-cleanup-2026",
        )
        .unwrap()
        .user;
        create_organization(
            database.connection(),
            &owner,
            &NewOrganization {
                name: "River Cleanup Crew".into(),
                description: String::new(),
                website: String::new(),
                address: String::new(),
                city: "Buffalo".into(),
                state: "NY".into(),
                contact_emails: vec![owner.email.clone()],
                image: None,
                image_alt: None,
                visibility: "private".into(),
            },
        )
        .unwrap();

        // Opening the demo must refuse instead of replacing real records.
        assert!(database.seed_demo().is_err());
        assert!(!database.is_demo().unwrap());
        assert!(database.reset_demo().is_err());
    }
}
