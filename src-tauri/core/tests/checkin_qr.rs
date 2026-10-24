//! The QR code is not decoration: its payload carries the shift token that
//! `check_in` validates. These tests exercise the same command the kiosk calls
//! after scanning, so a broken payload format fails the suite rather than the
//! demo.

use civicflow_core::workflows::{check_in, get_checkin_code};
use civicflow_core::Database;

fn seeded() -> Database {
    let mut database = Database::in_memory().expect("in-memory database");
    database.seed_demo_if_empty().expect("seed");
    database
}

#[test]
fn the_scanned_payload_checks_a_volunteer_in() {
    let database = seeded();
    let code = get_checkin_code(database.connection(), "sh-tue-pantry").expect("issued code");
    assert!(code.payload.starts_with("civicflow://checkin/"));
    assert_eq!(code.payload, format!("civicflow://checkin/{}", code.token));

    let snapshot = check_in(
        database.connection(),
        "sh-tue-pantry",
        "vol-maya",
        Some(&code.payload),
    )
    .expect("QR payload accepted");

    let attendance = snapshot
        .attendance
        .get("sh-tue-pantry")
        .expect("attendance row");
    assert!(attendance
        .iter()
        .any(|row| row.volunteer_id == "vol-maya" && row.status == "checked_in"));
}

#[test]
fn a_typed_code_checks_a_volunteer_in() {
    let database = seeded();
    let code = get_checkin_code(database.connection(), "sh-tue-pantry").expect("issued code");
    check_in(
        database.connection(),
        "sh-tue-pantry",
        "vol-maya",
        Some(&code.code),
    )
    .expect("six-digit code accepted");
}

#[test]
fn a_token_from_another_shift_is_refused() {
    let database = seeded();
    let other = get_checkin_code(database.connection(), "sh-sat-food").expect("other code");
    let refused = check_in(
        database.connection(),
        "sh-tue-pantry",
        "vol-maya",
        Some(&other.payload),
    )
    .expect_err("a token for a different shift must be refused");
    assert!(matches!(
        refused,
        civicflow_core::CoreError::Rule { ref code, .. } if code == "INVALID_CHECKIN_CODE"
    ));

    let forged = check_in(
        database.connection(),
        "sh-tue-pantry",
        "vol-maya",
        Some("civicflow://checkin/not-a-real-token"),
    );
    assert!(forged.is_err());
}
