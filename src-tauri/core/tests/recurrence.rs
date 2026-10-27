//! What a series promises: the same dates every time, one transaction per write,
//! and no way to schedule a shift nobody can staff.

use civicflow_core::auth::Account;
use civicflow_core::recurrence::{self, RecurrenceKind, RecurrenceRule, SeriesRole};
use civicflow_core::Database;

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

fn weekly(weekdays: Vec<u32>, starts_on: &str, count: i64) -> RecurrenceRule {
    RecurrenceRule {
        kind: RecurrenceKind::Weekly,
        interval_weeks: 1,
        weekdays,
        starts_local_time: "09:00".into(),
        duration_minutes: 120,
        starts_on: starts_on.into(),
        ends_on: None,
        occurrence_count: Some(count),
    }
}

fn roles() -> Vec<SeriesRole> {
    vec![
        SeriesRole {
            name: "Food sorter".into(),
            required: 2,
        },
        SeriesRole {
            name: "Driver".into(),
            required: 1,
        },
    ]
}

fn an_opportunity(database: &Database) -> String {
    database
        .connection()
        .query_row(
            "SELECT id FROM opportunities ORDER BY id LIMIT 1",
            [],
            |row| row.get(0),
        )
        .expect("an opportunity")
}

#[test]
fn a_weekly_rule_lands_on_the_chosen_weekdays() {
    // 2026-11-03 is a Tuesday, 2026-11-05 a Thursday.
    let rule = weekly(vec![2, 4], "2026-11-03", 4);
    let dates: Vec<String> = recurrence::occurrences(&rule)
        .expect("occurrences")
        .iter()
        .map(|date| date.to_string())
        .collect();
    assert_eq!(
        dates,
        vec!["2026-11-03", "2026-11-05", "2026-11-10", "2026-11-12"]
    );
}

#[test]
fn a_rule_runs_the_same_way_every_time() {
    let rule = weekly(vec![1], "2026-11-02", 6);
    let first = recurrence::occurrences(&rule).expect("occurrences");
    let second = recurrence::occurrences(&rule).expect("occurrences");
    assert_eq!(first, second);
    assert_eq!(first.len(), 6);
}

#[test]
fn every_n_weeks_skips_the_weeks_between() {
    let mut rule = weekly(vec![2], "2026-11-03", 3);
    rule.interval_weeks = 2;
    let dates: Vec<String> = recurrence::occurrences(&rule)
        .expect("occurrences")
        .iter()
        .map(|date| date.to_string())
        .collect();
    assert_eq!(dates, vec!["2026-11-03", "2026-11-17", "2026-12-01"]);
}

#[test]
fn an_end_date_stops_the_series_and_a_count_stops_it_too() {
    let mut rule = weekly(vec![2], "2026-11-03", 1);
    rule.occurrence_count = None;
    rule.ends_on = Some("2026-11-17".into());
    assert_eq!(
        recurrence::occurrences(&rule).expect("occurrences").len(),
        3
    );

    rule.ends_on = Some("2026-11-17".into());
    rule.occurrence_count = Some(2);
    let both = recurrence::occurrences(&rule).expect_err("two end conditions");
    assert!(both
        .to_string()
        .contains("either an end date or an occurrence"));

    let mut open_ended = weekly(vec![2], "2026-11-03", 1);
    open_ended.occurrence_count = None;
    let endless = recurrence::occurrences(&open_ended).expect_err("no end condition");
    assert!(endless
        .to_string()
        .contains("end date or an occurrence count"));
}

#[test]
fn a_rule_that_would_flood_the_schedule_is_refused_not_truncated() {
    // A year of a daily rule over every weekday is far past the cap.
    let mut capped = weekly(vec![0, 1, 2, 3, 4, 5, 6], "2026-11-02", 1);
    capped.occurrence_count = Some(60);
    assert_eq!(
        recurrence::occurrences(&capped).expect("capped rule").len(),
        60
    );

    let mut daily = weekly(vec![0, 1, 2, 3, 4, 5, 6], "2026-11-02", 1);
    daily.occurrence_count = Some(61);
    let refused = recurrence::occurrences(&daily).expect_err("too many counts");
    assert!(refused.to_string().contains("between 1 and 60"));
}

#[test]
fn a_weekly_rule_without_weekdays_is_refused() {
    let rule = weekly(vec![], "2026-11-03", 3);
    let refused = recurrence::occurrences(&rule).expect_err("no weekdays");
    assert!(refused.to_string().contains("at least one weekday"));
}

#[test]
fn creating_a_series_writes_every_shift_in_one_go() {
    let database = seeded();
    let opportunity_id = an_opportunity(&database);
    let rule = weekly(vec![2, 4], "2026-11-03", 4);
    let result = recurrence::create_series(
        database.connection(),
        &actor(),
        &opportunity_id,
        &rule,
        &roles(),
    )
    .expect("series");

    assert_eq!(result.shifts.len(), 4);
    assert_eq!(result.series.generated, 4);
    assert_eq!(result.series.roles.len(), 2);

    // Each generated shift carries its roles and its parentage.
    let conn = database.connection();
    for shift in &result.shifts {
        let (roles_written, series_id, capacity): (i64, String, i64) = conn
            .query_row(
                "SELECT (SELECT COUNT(*) FROM shift_roles WHERE shift_id = ?1), series_id, capacity
                 FROM shifts WHERE id = ?1",
                [&shift.id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("generated shift");
        assert_eq!(roles_written, 2);
        assert_eq!(capacity, 3);
        assert_eq!(series_id, result.series.id);
    }

    let audited: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM audit_events WHERE action = 'series.create'",
            [],
            |row| row.get(0),
        )
        .expect("audit");
    assert_eq!(audited, 1);
}

#[test]
fn a_series_cannot_ask_for_more_volunteers_than_the_opportunity_has() {
    let database = seeded();
    let opportunity_id = an_opportunity(&database);
    let capacity: i64 = database
        .connection()
        .query_row(
            "SELECT capacity FROM opportunities WHERE id = ?1",
            [&opportunity_id],
            |row| row.get(0),
        )
        .expect("capacity");
    let rule = weekly(vec![2], "2026-11-03", 2);
    let too_big = vec![SeriesRole {
        name: "Everyone".into(),
        required: capacity + 1,
    }];
    let refused = recurrence::create_series(
        database.connection(),
        &actor(),
        &opportunity_id,
        &rule,
        &too_big,
    )
    .expect_err("over capacity");
    assert!(refused.to_string().contains("is listed for"));
    let shifts: i64 = database
        .connection()
        .query_row(
            "SELECT COUNT(*) FROM shifts WHERE series_id IS NOT NULL",
            [],
            |row| row.get(0),
        )
        .expect("shifts");
    assert_eq!(shifts, 0);
}

#[test]
fn generating_again_adds_only_what_the_series_is_missing() {
    let database = seeded();
    let opportunity_id = an_opportunity(&database);
    let rule = weekly(vec![2, 4], "2026-11-03", 4);
    let created = recurrence::create_series(
        database.connection(),
        &actor(),
        &opportunity_id,
        &rule,
        &roles(),
    )
    .expect("series");

    let again = recurrence::generate_instances(database.connection(), &actor(), &created.series.id)
        .expect("regenerate");
    assert!(again.shifts.is_empty());

    // Remove one instance, and the top-up puts exactly that one back.
    let removed = &created.shifts[2];
    database
        .connection()
        .execute("DELETE FROM shift_roles WHERE shift_id = ?1", [&removed.id])
        .expect("delete the roles of one instance");
    database
        .connection()
        .execute("DELETE FROM shifts WHERE id = ?1", [&removed.id])
        .expect("delete one instance");
    let topped_up =
        recurrence::generate_instances(database.connection(), &actor(), &created.series.id)
            .expect("top up");
    assert_eq!(topped_up.shifts.len(), 1);
    assert_eq!(topped_up.shifts[0].occurrence_date, removed.occurrence_date);
}

#[test]
fn retiming_reaches_the_series_or_one_shift() {
    let database = seeded();
    let opportunity_id = an_opportunity(&database);
    let rule = weekly(vec![2, 4], "2026-11-03", 4);
    let created = recurrence::create_series(
        database.connection(),
        &actor(),
        &opportunity_id,
        &rule,
        &roles(),
    )
    .expect("series");

    recurrence::retime(
        database.connection(),
        &actor(),
        &created.series.id,
        "07:30",
        180,
        "series",
    )
    .expect("retime the series");

    let conn = database.connection();
    let rows: Vec<String> = {
        let mut statement = conn
            .prepare("SELECT starts_at FROM shifts WHERE series_id = ?1 ORDER BY occurrence_date")
            .expect("statement");
        statement
            .query_map([&created.series.id], |row| row.get::<_, String>(0))
            .expect("query")
            .collect::<rusqlite::Result<Vec<String>>>()
            .expect("rows")
    };
    assert_eq!(rows.len(), 4);
    for stamp in &rows {
        assert!(stamp.contains("T07:30:00"), "{stamp}");
    }

    recurrence::retime(
        database.connection(),
        &actor(),
        &created.series.id,
        "08:15",
        90,
        "instance",
    )
    .expect("retime one shift");
    let moved: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM shifts WHERE series_id = ?1 AND starts_at LIKE '%T08:15:00%'",
            [&created.series.id],
            |row| row.get(0),
        )
        .expect("moved count");
    assert_eq!(moved, 1);
}

#[test]
fn deleting_a_series_refuses_while_volunteers_are_on_its_shifts() {
    let database = seeded();
    let opportunity_id = an_opportunity(&database);
    let rule = weekly(vec![3], "2026-11-04", 2);
    let created = recurrence::create_series(
        database.connection(),
        &actor(),
        &opportunity_id,
        &rule,
        &roles(),
    )
    .expect("series");
    let shift_id = created.shifts[0].id.clone();
    let volunteer: String = database
        .connection()
        .query_row("SELECT id FROM volunteers LIMIT 1", [], |row| row.get(0))
        .expect("volunteer");

    database
        .connection()
        .execute(
            "INSERT INTO registrations (shift_id, volunteer_id, role, created_at, status)
             VALUES (?1, ?2, 'Food sorter', '2026-11-01T00:00:00-04:00', 'registered')",
            rusqlite::params![shift_id, volunteer],
        )
        .expect("register");
    database
        .connection()
        .execute("UPDATE shifts SET confirmed = 1 WHERE id = ?1", [&shift_id])
        .expect("confirm");

    let refused = recurrence::delete_series(database.connection(), &actor(), &created.series.id)
        .expect_err("booked series");
    assert!(refused.to_string().contains("already have volunteers"));

    database
        .connection()
        .execute("UPDATE shifts SET confirmed = 0 WHERE id = ?1", [&shift_id])
        .expect("release");
    recurrence::delete_series(database.connection(), &actor(), &created.series.id)
        .expect("delete the series");
    let left: i64 = database
        .connection()
        .query_row(
            "SELECT COUNT(*) FROM shifts WHERE series_id = ?1",
            [&created.series.id],
            |row| row.get(0),
        )
        .expect("remaining shifts");
    assert_eq!(left, 0);
}
