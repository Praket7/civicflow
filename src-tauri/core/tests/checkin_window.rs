//! Volunteer self check-in has one timing rule, and it lives in the domain.
//! These tests pin the workspace clock around `sh-tue-pantry` (08:00–10:00) so
//! the open, boundary, and closed moments are exact rather than approximate.

use civicflow_core::models::CheckinStatus;
use civicflow_core::workflows::{
    check_in, checkin_window, get_checkin_code, manual_check_in, snapshot,
};
use civicflow_core::{clock, CoreError, Database};

fn seeded() -> Database {
    let mut database = Database::in_memory().expect("in-memory database");
    database.seed_demo_if_empty().expect("seed");
    database
}

fn at(database: &Database, timestamp: &str) {
    clock::pin(database.connection(), timestamp).expect("a pinned workspace clock");
}

fn rule_code(error: CoreError) -> String {
    match error {
        CoreError::Rule { code, .. } => code,
        other => panic!("expected a rule error, got {other:?}"),
    }
}

#[test]
fn self_checkin_opens_thirty_minutes_before_the_shift() {
    let database = seeded();
    at(&database, "2026-10-13T07:30:00-04:00");
    let window = checkin_window(database.connection(), "sh-tue-pantry").expect("a window");
    assert_eq!(window.status, CheckinStatus::Open);
    assert!(window.can_self_check_in);
    assert_eq!(window.opens_at, "2026-10-13T07:30:00-04:00");
    assert_eq!(window.closes_at, "2026-10-13T08:15:00-04:00");
}

#[test]
fn self_checkin_is_rejected_before_it_opens() {
    let database = seeded();
    at(&database, "2026-10-13T07:29:00-04:00");
    let window = checkin_window(database.connection(), "sh-tue-pantry").expect("a window");
    assert_eq!(window.status, CheckinStatus::NotOpen);
    assert!(!window.can_self_check_in);

    let code = get_checkin_code(database.connection(), "sh-tue-pantry").expect("an issued code");
    let refused = check_in(
        database.connection(),
        "sh-tue-pantry",
        "vol-maya",
        &code.code,
    )
    .expect_err("nothing can check in before the door opens");
    assert_eq!(rule_code(refused), "CHECKIN_NOT_OPEN");
}

#[test]
fn self_checkin_is_allowed_at_the_start_and_at_the_close_boundary() {
    for timestamp in ["2026-10-13T08:00:00-04:00", "2026-10-13T08:15:00-04:00"] {
        let database = seeded();
        at(&database, timestamp);
        let window = checkin_window(database.connection(), "sh-tue-pantry").expect("a window");
        assert_eq!(window.status, CheckinStatus::Open, "at {timestamp}");
        let code = get_checkin_code(database.connection(), "sh-tue-pantry").expect("a code");
        check_in(
            database.connection(),
            "sh-tue-pantry",
            "vol-maya",
            &code.code,
        )
        .unwrap_or_else(|error| panic!("check-in refused at {timestamp}: {error:?}"));
    }
}

#[test]
fn self_checkin_closes_after_the_boundary() {
    let database = seeded();
    at(&database, "2026-10-13T08:16:00-04:00");
    let window = checkin_window(database.connection(), "sh-tue-pantry").expect("a window");
    assert_eq!(window.status, CheckinStatus::Closed);
    assert!(!window.can_self_check_in);

    let code = get_checkin_code(database.connection(), "sh-tue-pantry").expect("an issued code");
    let refused = check_in(
        database.connection(),
        "sh-tue-pantry",
        "vol-maya",
        &code.code,
    )
    .expect_err("self check-in cannot slip past its close time");
    assert_eq!(rule_code(refused), "CHECKIN_CLOSED");
}

#[test]
fn a_coordinator_can_still_record_a_late_arrival_by_hand() {
    let database = seeded();
    at(&database, "2026-10-13T08:45:00-04:00");
    let refused = check_in(database.connection(), "sh-tue-pantry", "vol-maya", "482913")
        .expect_err("the volunteer path is closed");
    assert_eq!(rule_code(refused), "CHECKIN_CLOSED");

    let snapshot = manual_check_in(
        database.connection(),
        "sh-tue-pantry",
        "vol-maya",
        "Arrived at 8:45 after the bus was late",
    )
    .expect("a coordinator records the arrival");
    assert!(snapshot
        .attendance
        .get("sh-tue-pantry")
        .expect("attendance")
        .iter()
        .any(|row| row.volunteer_id == "vol-maya" && row.status == "checked_in"));

    let event = snapshot
        .audit
        .iter()
        .find(|event| event.action == "shift.manual_checkin")
        .expect("the override is audited");
    assert_eq!(event.actor, "Praket Gauri");
    assert!(event
        .detail
        .as_deref()
        .unwrap_or_default()
        .contains("Arrived at 8:45"));
}

#[test]
fn a_manual_arrival_still_needs_a_reason_and_a_live_shift() {
    let database = seeded();
    at(&database, "2026-10-13T08:45:00-04:00");
    let refused = manual_check_in(database.connection(), "sh-tue-pantry", "vol-maya", "ok")
        .expect_err("a two-letter note is not a reason");
    assert_eq!(rule_code(refused), "MANUAL_REASON_REQUIRED");

    at(&database, "2026-10-13T10:01:00-04:00");
    let ended = manual_check_in(
        database.connection(),
        "sh-tue-pantry",
        "vol-maya",
        "Recorded after the shift ended",
    )
    .expect_err("the shift is over");
    assert_eq!(rule_code(ended), "CHECKIN_CLOSED");

    // Neither refusal recorded an arrival or an audit event.
    let after = snapshot(database.connection()).expect("a snapshot");
    assert!(!after
        .attendance
        .get("sh-tue-pantry")
        .map(|rows| rows
            .iter()
            .any(|row| row.volunteer_id == "vol-maya" && row.status == "checked_in"))
        .unwrap_or(false));
    assert!(!after
        .audit
        .iter()
        .any(|event| event.action == "shift.manual_checkin"));
}
