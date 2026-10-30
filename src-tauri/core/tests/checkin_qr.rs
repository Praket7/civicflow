//! The QR code is not decoration: its payload carries the shift token that
//! `check_in` validates. These tests exercise the same command the kiosk calls
//! after scanning, so a broken payload format fails the suite rather than the
//! demo.

use civicflow_core::workflows::{check_in, get_checkin_code, volunteer_checkin_credential};
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
        &code.payload,
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
fn a_volunteer_gets_the_token_but_not_the_printed_code() {
    let database = seeded();
    let issued = get_checkin_code(database.connection(), "sh-tue-pantry").expect("issued code");

    let credential =
        volunteer_checkin_credential(database.connection(), "sh-tue-pantry", "vol-maya")
            .expect("volunteer credential");
    assert!(credential.code.is_empty());
    assert_eq!(credential.token, issued.token);
    assert_eq!(credential.payload, issued.payload);

    check_in(
        database.connection(),
        "sh-tue-pantry",
        "vol-maya",
        &credential.payload,
    )
    .expect("the volunteer's own token checks in");
}

#[test]
fn a_volunteer_outside_the_roster_cannot_read_the_credential() {
    let database = seeded();
    get_checkin_code(database.connection(), "sh-tue-pantry").expect("issued code");

    let refused = volunteer_checkin_credential(database.connection(), "sh-tue-pantry", "vol-025")
        .expect_err("an unregistered volunteer must not read the token");
    assert!(matches!(
        refused,
        civicflow_core::CoreError::Rule { ref code, .. } if code == "NOT_REGISTERED"
    ));
}

#[test]
fn a_volunteer_cannot_open_a_code_the_table_has_not_issued() {
    let database = seeded();
    let refused = volunteer_checkin_credential(database.connection(), "sh-tue-pantry", "vol-maya")
        .expect_err("there is no code yet");
    assert!(matches!(
        refused,
        civicflow_core::CoreError::Rule { ref code, .. } if code == "CHECKIN_NOT_OPEN"
    ));
    // Asking must not have issued a code behind the coordinator's back.
    assert!(
        get_checkin_code(database.connection(), "sh-tue-pantry")
            .expect("coordinator can issue")
            .code
            .len()
            == 6
    );
}

#[test]
fn a_typed_code_checks_a_volunteer_in() {
    let database = seeded();
    let code = get_checkin_code(database.connection(), "sh-tue-pantry").expect("issued code");
    check_in(
        database.connection(),
        "sh-tue-pantry",
        "vol-maya",
        &code.code,
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
        &other.payload,
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
        "civicflow://checkin/not-a-real-token",
    );
    assert!(forged.is_err());
}
