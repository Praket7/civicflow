//! The organization a command acts in.
//!
//! One workspace database can hold several organizations, and an account may
//! hold a different membership in each. Operational records therefore have to
//! name the organization they belong to rather than assuming the installation
//! has only one. The command layer resolves the signed-in account, records that
//! account's selected organization on the connection, and the data layer reads
//! it from here.
//!
//! The scope lives in a temporary table so it belongs to the connection that is
//! serving one command. The command layer serializes calls behind one mutex, so
//! the value cannot change underneath a query half-way through.

use rusqlite::{params, Connection, OptionalExtension};

use crate::error::Result;

const TABLE: &str = "session_scope";

/// Records the organization for the rest of this connection's work. `None`
/// clears the scope, which a signed-out connection does.
pub fn select(conn: &Connection, organization_id: Option<&str>) -> Result<()> {
    conn.execute_batch(&format!(
        "CREATE TEMP TABLE IF NOT EXISTS {TABLE} (organization_id TEXT NOT NULL);"
    ))?;
    conn.execute(&format!("DELETE FROM {TABLE}"), [])?;
    if let Some(id) = organization_id {
        conn.execute(
            &format!("INSERT INTO {TABLE} (organization_id) VALUES (?1)"),
            params![id],
        )?;
    }
    Ok(())
}

/// Records that the caller is signed in but does not belong to any
/// organization. That is different from "no session": access must be empty
/// rather than falling back to the installation's own organization, or a new
/// account could read a workspace it never joined.
pub fn select_none(conn: &Connection) -> Result<()> {
    select(conn, None)?;
    conn.execute(
        &format!("INSERT INTO {TABLE} (organization_id) VALUES ('')"),
        [],
    )?;
    Ok(())
}

/// The organization this connection is working in.
///
/// A caller that has not selected one — a test, a backup, or a freshly seeded
/// demo — works in the installation's own organization, which is the oldest
/// row. That keeps the single-organization behaviour unchanged while a second
/// organization can never be read through it.
pub fn current(conn: &Connection) -> Result<Option<String>> {
    let exists: bool = conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM sqlite_temp_master
                        WHERE type = 'table' AND name = ?1)",
        params![TABLE],
        |row| row.get(0),
    )?;
    if exists {
        let scoped: Option<String> = conn
            .query_row(
                &format!("SELECT organization_id FROM {TABLE} LIMIT 1"),
                [],
                |row| row.get(0),
            )
            .optional()?;
        match scoped.as_deref() {
            // Signed in, no membership.
            Some("") => return Ok(None),
            Some(id) => return Ok(Some(id.to_string())),
            None => {}
        }
    }
    Ok(conn
        .query_row(
            "SELECT id FROM organizations ORDER BY created_at, id LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()?)
}

/// The organization an operational record belongs to, derived from the record
/// itself. An audit entry names an entity; that entity is the authority on which
/// organization the entry concerns, so an invite issued for another organization
/// is never filed under the one that happens to be open.
pub fn for_entity(conn: &Connection, entity_type: &str, entity_id: &str) -> Result<Option<String>> {
    let query = match entity_type {
        "shift" => {
            "SELECT o.organization_id FROM shifts s
             JOIN opportunities o ON o.id = s.opportunity_id
             WHERE s.id = ?1"
        }
        "opportunity" => "SELECT organization_id FROM opportunities WHERE id = ?1",
        "volunteer" => "SELECT organization_id FROM volunteers WHERE id = ?1",
        "organization" => "SELECT id FROM organizations WHERE id = ?1",
        _ => return Ok(None),
    };
    Ok(conn
        .query_row(query, params![entity_id], |row| row.get(0))
        .optional()?)
}

/// The organization a write belongs to. Refuses to invent one, because a row
/// filed under the wrong organization is worse than a refused command.
pub fn require(conn: &Connection) -> Result<String> {
    current(conn)?.ok_or_else(|| {
        crate::error::CoreError::rule(
            "NO_ORGANIZATION",
            "This workspace has no organization yet. Create one before continuing.",
            None,
            Some("CREATE_ORGANIZATION".into()),
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    #[test]
    fn a_connection_without_a_selection_uses_the_workspace_organization() {
        let mut database = Database::in_memory().unwrap();
        database.seed_demo_if_empty().unwrap();
        let conn = database.connection();
        let organization = current(conn).unwrap().expect("the demo organization");
        assert!(organization.starts_with("org-"));
        assert_eq!(require(conn).unwrap(), organization);
    }

    #[test]
    fn a_selection_narrows_the_scope_and_can_be_cleared() {
        let mut database = Database::in_memory().unwrap();
        database.seed_demo_if_empty().unwrap();
        let conn = database.connection();
        conn.execute(
            "INSERT INTO organizations
             (id, name, initials, mission, city, state, address, website, email, timezone, created_at)
             VALUES ('org-second', 'Second Org', 'SO', '', 'Buffalo', 'NY', '', '', '', 'America/New_York',
                     '2030-01-01T00:00:00+00:00')",
            [],
        )
        .unwrap();
        select(conn, Some("org-second")).unwrap();
        assert_eq!(current(conn).unwrap().as_deref(), Some("org-second"));
        select_none(conn).unwrap();
        assert_eq!(current(conn).unwrap(), None);
        select(conn, None).unwrap();
        assert_ne!(current(conn).unwrap().as_deref(), Some("org-second"));
    }

    #[test]
    fn require_refuses_an_empty_workspace() {
        let database = Database::in_memory().unwrap();
        assert!(require(database.connection()).is_err());
    }
}
