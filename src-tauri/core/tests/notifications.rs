//! Reminders as rules: a default set that works, a switch that really stops a
//! rule, and a generation pass that cannot write the same notification twice.

use civicflow_core::auth::Account;
use civicflow_core::notifications;
use civicflow_core::Database;
use rusqlite::params;

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

fn reminders(database: &Database) -> i64 {
    database
        .connection()
        .query_row(
            "SELECT COUNT(*) FROM notifications WHERE rule_id IS NOT NULL",
            [],
            |row| row.get(0),
        )
        .expect("reminders")
}

#[test]
fn a_new_workspace_starts_with_the_four_rules_that_matter() {
    let database = seeded();
    let rules = notifications::list_rules(database.connection()).expect("rules");
    assert_eq!(rules.len(), notifications::TRIGGERS.len());
    assert!(rules.iter().all(|rule| rule.enabled));
    let shift_reminder = rules
        .iter()
        .find(|rule| rule.trigger_type == "shift_reminder")
        .expect("a shift reminder");
    assert_eq!(shift_reminder.offset_minutes, 1440);
    assert_eq!(shift_reminder.audience, "volunteer");
}

#[test]
fn generating_reminders_twice_writes_each_one_once() {
    let database = seeded();
    let first =
        notifications::generate_due(database.connection(), Some(&actor())).expect("first pass");
    assert!(
        !first.created.is_empty(),
        "the demo schedule is due for reminders"
    );
    assert_eq!(reminders(&database), first.created.len() as i64);

    let before = reminders(&database);
    let second =
        notifications::generate_due(database.connection(), Some(&actor())).expect("second pass");
    assert!(second.created.is_empty());
    // Each due item is looked at once per rule, so the skip count covers both
    // rules that could have written it.
    assert!(second.skipped >= first.created.len() as i64);
    assert_eq!(reminders(&database), before);
}

#[test]
fn every_generated_reminder_records_the_rule_that_produced_it() {
    let database = seeded();
    notifications::generate_due(database.connection(), Some(&actor())).expect("pass");
    let unowned: i64 = database
        .connection()
        .query_row(
            "SELECT COUNT(*) FROM notifications
             WHERE rule_id IS NOT NULL AND rule_id NOT IN (SELECT id FROM notification_rules)",
            [],
            |row| row.get(0),
        )
        .expect("orphans");
    assert_eq!(unowned, 0);
    let kinds: Vec<String> = {
        let mut statement = database
            .connection()
            .prepare("SELECT DISTINCT kind FROM notifications WHERE rule_id IS NOT NULL")
            .expect("kinds");
        statement
            .query_map([], |row| row.get::<_, String>(0))
            .expect("query")
            .collect::<rusqlite::Result<Vec<_>>>()
            .expect("rows")
    };
    assert!(kinds.iter().any(|kind| kind == "SHIFT_REMINDER"));
}

#[test]
fn a_switched_off_rule_produces_nothing() {
    let database = seeded();
    let rules = notifications::list_rules(database.connection()).expect("rules");
    let reminder = rules
        .iter()
        .find(|rule| rule.trigger_type == "shift_reminder")
        .expect("a shift reminder");
    notifications::update_rule(
        database.connection(),
        &actor(),
        &reminder.id,
        &notifications::RulePatch {
            offset_minutes: None,
            enabled: Some(false),
        },
    )
    .expect("disable the rule");

    notifications::generate_due(database.connection(), Some(&actor())).expect("pass");
    let from_disabled: i64 = database
        .connection()
        .query_row(
            "SELECT COUNT(*) FROM notifications WHERE rule_id = ?1",
            params![reminder.id],
            |row| row.get(0),
        )
        .expect("count");
    assert_eq!(from_disabled, 0);

    let audited: i64 = database
        .connection()
        .query_row(
            "SELECT COUNT(*) FROM audit_events WHERE action = 'notification_rule.update'",
            [],
            |row| row.get(0),
        )
        .expect("audit");
    assert_eq!(audited, 1);
}

#[test]
fn an_offset_outside_the_supported_range_is_refused() {
    let database = seeded();
    let rules = notifications::list_rules(database.connection()).expect("rules");
    let refused = notifications::update_rule(
        database.connection(),
        &actor(),
        &rules[0].id,
        &notifications::RulePatch {
            offset_minutes: Some(100_000),
            enabled: None,
        },
    )
    .expect_err("an offset beyond 30 days");
    assert!(refused.to_string().contains("30 days"));
}
