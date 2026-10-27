//! What a coordinator's spreadsheet does to the roster: which rows are accepted,
//! what a rejected file leaves behind, and whether an export can come back in.

use civicflow_core::auth::Account;
use civicflow_core::imports::{apply, export_roster, preview, template_csv, RowOutcome};
use civicflow_core::workflows::{snapshot, snapshot_for};
use civicflow_core::{roster, Database};

fn seeded() -> Database {
    let mut database = Database::in_memory().expect("in-memory database");
    assert!(database.seed_demo_if_empty().expect("seed"));
    database
}

fn actor() -> Account {
    Account {
        id: "user-coordinator".into(),
        name: "Praket Gauri".into(),
        email: "praket@example.org".into(),
        role: "coordinator".into(),
        volunteer_id: None,
    }
}

fn roster_size(database: &Database) -> i64 {
    database
        .connection()
        .query_row("SELECT COUNT(*) FROM volunteers", [], |row| row.get(0))
        .expect("count")
}

const GOOD_FILE: &str = concat!(
    "Name,Email,Phone,Status,Skills,Availability,Interests,Causes\r\n",
    "\"Chen, Maya\",maya.new@example.org,(716) 555-0142,onboarding,",
    "\"Food handling; Tutoring\",mon:morning; wed:evening,Pantry and tutoring,food; education\r\n",
    "Ibrahim Diallo,ibrahim.new@example.org,,active,Driver,tue:afternoon,Delivery,food\r\n",
);

#[test]
fn a_valid_file_adds_volunteers_with_their_skills_and_availability() {
    let database = seeded();
    let organization = roster::workspace_organization_id(database.connection())
        .expect("organization")
        .expect("organization id");
    let before = roster_size(&database);

    let summary = apply(database.connection(), &actor(), &organization, GOOD_FILE).expect("import");
    assert_eq!(summary.created, 2);
    assert_eq!(summary.preview.invalid, 0);
    assert_eq!(roster_size(&database), before + 2);

    let (name, phone, status, interests, causes): (String, String, String, String, String) =
        database
            .connection()
            .query_row(
                "SELECT name, phone, status, interests, causes_json FROM volunteers
                 WHERE email = 'maya.new@example.org'",
                [],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                    ))
                },
            )
            .expect("imported volunteer");
    // A quoted cell holding a comma keeps the comma as part of the name.
    assert_eq!(name, "Chen, Maya");
    assert_eq!(phone, "(716) 555-0142");
    assert_eq!(status, "onboarding");
    assert_eq!(interests, "Pantry and tutoring");
    assert_eq!(causes, "[\"food\",\"education\"]");

    let skills: i64 = database
        .connection()
        .query_row(
            "SELECT COUNT(*) FROM volunteer_skills WHERE volunteer_id =
             (SELECT id FROM volunteers WHERE email = 'maya.new@example.org')",
            [],
            |row| row.get(0),
        )
        .expect("skills");
    assert_eq!(skills, 2);

    let windows: i64 = database
        .connection()
        .query_row(
            "SELECT COUNT(*) FROM availability_rules WHERE volunteer_id =
             (SELECT id FROM volunteers WHERE email = 'maya.new@example.org')",
            [],
            |row| row.get(0),
        )
        .expect("availability");
    assert_eq!(windows, 2);

    assert!(summary.preview.rows[0]
        .notes
        .iter()
        .all(|note| !note.contains("skills")));

    let audited: i64 = database
        .connection()
        .query_row(
            "SELECT COUNT(*) FROM audit_events
             WHERE action = 'volunteers.imported' AND actor_id = 'Praket Gauri'",
            [],
            |row| row.get(0),
        )
        .expect("audit");
    assert_eq!(audited, 1);
}

#[test]
fn a_missing_required_column_reads_no_rows_and_writes_nothing() {
    let database = seeded();
    let organization = roster::workspace_organization_id(database.connection())
        .expect("organization")
        .expect("organization id");
    let before = roster_size(&database);

    let file = "Email,Phone\r\nmaya.new@example.org,555\r\n";
    let checked = preview(database.connection(), &organization, file).expect("preview");
    assert_eq!(checked.total, 0);
    assert_eq!(checked.rows.len(), 0);
    assert!(checked
        .problems
        .iter()
        .any(|problem| problem.contains("Name")));

    let refused = apply(database.connection(), &actor(), &organization, file);
    assert!(refused.is_err());
    assert_eq!(roster_size(&database), before);
}

#[test]
fn a_row_that_needs_a_decision_blocks_the_whole_file() {
    let database = seeded();
    let organization = roster::workspace_organization_id(database.connection())
        .expect("organization")
        .expect("organization id");
    let before = roster_size(&database);

    let file = concat!(
        "Name,Email,Skills,Availability,Causes\r\n",
        "Maya Chen,maya.new@example.org,Food handling,mon:morning,food\r\n",
        "Sam Rivera,sam.new@example.org,Driver,mon:noon,farming\r\n",
    );
    let checked = preview(database.connection(), &organization, file).expect("preview");
    assert_eq!(checked.total, 2);
    assert_eq!(checked.valid, 1);
    assert_eq!(checked.invalid, 1);
    let rejected = &checked.rows[1];
    assert_eq!(rejected.outcome, RowOutcome::Invalid);
    // Both the availability window and the cause are named, so the fix is not a
    // guess.
    assert!(rejected
        .problems
        .iter()
        .any(|problem| problem.contains("mon:morning")));
    assert!(rejected
        .problems
        .iter()
        .any(|problem| problem.contains("not a cause")));

    let refused = apply(database.connection(), &actor(), &organization, file);
    assert!(refused.is_err());
    assert_eq!(roster_size(&database), before);
}

#[test]
fn an_email_already_on_the_roster_is_a_file_problem_not_an_overwrite() {
    let database = seeded();
    let organization = roster::workspace_organization_id(database.connection())
        .expect("organization")
        .expect("organization id");
    let existing: String = database
        .connection()
        .query_row(
            "SELECT email FROM volunteers ORDER BY id LIMIT 1",
            [],
            |row| row.get(0),
        )
        .expect("seeded volunteer");

    let file = format!("Name,Email\r\nSomeone Else,{existing}\r\n");
    let checked = preview(database.connection(), &organization, &file).expect("preview");
    assert_eq!(checked.invalid, 1);
    assert!(checked.rows[0]
        .problems
        .iter()
        .any(|problem| problem.contains("already on this roster")));
}

#[test]
fn two_rows_cannot_share_one_email() {
    let database = seeded();
    let organization = roster::workspace_organization_id(database.connection())
        .expect("organization")
        .expect("organization id");

    let file = "Name,Email\r\nMaya Chen,shared@example.org\r\nMaya Chen,SHARED@example.org\r\n";
    let checked = preview(database.connection(), &organization, file).expect("preview");
    assert_eq!(checked.valid, 1);
    assert_eq!(checked.invalid, 1);
    assert!(checked.rows[1]
        .problems
        .iter()
        .any(|problem| problem.contains("Two rows use")));
}

#[test]
fn an_export_imports_back_into_an_empty_workspace() {
    let source = seeded();
    let organization = roster::workspace_organization_id(source.connection())
        .expect("organization")
        .expect("organization id");
    let exported = export_roster(source.connection(), &organization).expect("export");
    let expected = roster_size(&source);

    let target = seeded();
    let target_organization = roster::workspace_organization_id(target.connection())
        .expect("organization")
        .expect("organization id");
    target
        .connection()
        .execute("DELETE FROM volunteers", [])
        .expect("clear roster");

    let summary = apply(
        target.connection(),
        &actor(),
        &target_organization,
        &exported,
    )
    .expect("import the export");
    assert_eq!(summary.created as i64, expected);
    assert_eq!(roster_size(&target), expected);

    let skills_source: i64 = source
        .connection()
        .query_row("SELECT COUNT(*) FROM volunteer_skills", [], |row| {
            row.get(0)
        })
        .expect("skills");
    let skills_target: i64 = target
        .connection()
        .query_row("SELECT COUNT(*) FROM volunteer_skills", [], |row| {
            row.get(0)
        })
        .expect("skills");
    assert_eq!(skills_target, skills_source);
}

#[test]
fn an_imported_volunteer_reaches_the_roster_screen_reads() {
    let database = seeded();
    let organization = roster::workspace_organization_id(database.connection())
        .expect("organization")
        .expect("organization id");
    apply(database.connection(), &actor(), &organization, GOOD_FILE).expect("import");

    let state = snapshot(database.connection()).expect("snapshot");
    let imported = state
        .roster
        .iter()
        .find(|person| person.email == "ibrahim.new@example.org")
        .expect("imported volunteer on the roster");
    assert_eq!(imported.name, "Ibrahim Diallo");
    assert_eq!(imported.status, "active");
    assert_eq!(imported.skills, vec!["Driver".to_string()]);
    assert_eq!(imported.availability, vec!["tue:afternoon".to_string()]);
    assert_eq!(imported.causes, vec!["food".to_string()]);
    // The authored roster is still present: an import adds, it does not replace.
    assert!(state.roster.iter().any(|person| person.id == "vol-maya"));
}

#[test]
fn a_volunteer_snapshot_holds_only_their_own_roster_record() {
    let database = seeded();
    let organization = roster::workspace_organization_id(database.connection())
        .expect("organization")
        .expect("organization id");
    apply(database.connection(), &actor(), &organization, GOOD_FILE).expect("import");

    let theirs = snapshot_for(database.connection(), Some("vol-maya")).expect("snapshot");
    assert_eq!(theirs.roster.len(), 1);
    assert_eq!(theirs.roster[0].id, "vol-maya");
}

#[test]
fn the_template_is_offered_even_before_a_file_is_chosen() {
    let database = seeded();
    let organization = roster::workspace_organization_id(database.connection())
        .expect("organization")
        .expect("organization id");

    let empty = preview(database.connection(), &organization, "").expect("preview");
    assert_eq!(empty.total, 0);
    assert_eq!(empty.columns.len(), 0);
    assert_eq!(
        empty.required,
        vec!["Name".to_string(), "Email".to_string()]
    );
    assert_eq!(empty.template, template_csv());
    assert!(empty
        .problems
        .iter()
        .any(|problem| problem.contains("Choose a CSV file")));
}
