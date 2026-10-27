use chrono::Utc;
use civicflow_core::auth::{
    clear_hosted_handoff, create_account, current_user, hosted_handoff_pending,
    remember_hosted_handoff, sign_in, sign_in_with_hosted, store_hosted_link, take_hosted_link,
};
use civicflow_core::error::CoreError;
use civicflow_core::workflows::snapshot_for;
use civicflow_core::Database;
use rusqlite::params;

fn seeded() -> Database {
    let mut database = Database::in_memory().expect("in-memory database");
    assert!(database.seed_demo_if_empty().expect("seed"));
    database
}

fn rule_code(error: CoreError) -> String {
    match error {
        CoreError::Rule { code, .. } => code,
        other => panic!("expected a rule error, got {other:?}"),
    }
}

#[test]
fn a_new_coordinator_can_sign_in_with_the_password_it_chose() {
    let database = seeded();
    let session = create_account(
        database.connection(),
        "  Jordan   Reyes ",
        "Jordan@FeedMoreWNY.org",
        "kitchen-table-2026",
        "coordinator",
    )
    .expect("account is created");

    assert_eq!(session.user.name, "Jordan Reyes");
    assert_eq!(session.user.email, "jordan@feedmorewny.org");
    assert_eq!(session.user.role, "coordinator");
    assert_eq!(session.user.volunteer_id, None);

    let resolved = current_user(database.connection(), &session.token)
        .unwrap()
        .expect("the new session resolves");
    assert_eq!(resolved.id, session.user.id);

    let again = sign_in(
        database.connection(),
        "jordan@feedmorewny.org",
        "kitchen-table-2026",
        false,
    )
    .expect("the stored hash verifies");
    assert_eq!(again.user.id, session.user.id);

    let audited: i64 = database
        .connection()
        .query_row(
            "SELECT COUNT(*) FROM audit_events WHERE action = 'auth.account_created'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(audited, 1);
}

#[test]
fn a_new_volunteer_gets_a_roster_profile_and_a_redacted_snapshot() {
    let database = seeded();
    let session = create_account(
        database.connection(),
        "Alicia Moreno",
        "alicia.moreno@example.org",
        "second-saturday",
        "volunteer",
    )
    .expect("account is created");

    let volunteer_id = session.user.volunteer_id.clone().expect("linked profile");
    let (name, status, initials): (String, String, String) = database
        .connection()
        .query_row(
            "SELECT name, status, initials FROM volunteers WHERE id = ?1",
            [&volunteer_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .expect("the volunteer row exists");
    assert_eq!(name, "Alicia Moreno");
    assert_eq!(status, "onboarding");
    assert_eq!(initials, "AM");

    let snapshot = snapshot_for(database.connection(), Some(&volunteer_id)).unwrap();
    assert!(snapshot
        .registrations
        .iter()
        .all(|row| row.volunteer_id == volunteer_id));
    assert!(snapshot.hours_decisions.is_empty());
    assert!(snapshot.audit.is_empty());
}

#[test]
fn an_existing_roster_profile_is_claimed_by_its_email() {
    let database = seeded();
    let (volunteer_id, email): (String, String) = database
        .connection()
        .query_row(
            "SELECT id, email FROM volunteers WHERE id <> 'vol-maya' ORDER BY id LIMIT 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();

    let session = create_account(
        database.connection(),
        "Someone Else",
        &email,
        "second-saturday",
        "volunteer",
    )
    .expect("account is created");

    assert_eq!(
        session.user.volunteer_id.as_deref(),
        Some(volunteer_id.as_str())
    );
}

#[test]
fn an_email_that_already_has_an_account_is_refused() {
    let database = seeded();
    let error = create_account(
        database.connection(),
        "Praket Gauri",
        "praket@feedmorewny.org",
        "another-password",
        "coordinator",
    )
    .expect_err("duplicate email is refused");
    assert_eq!(rule_code(error), "EMAIL_TAKEN");

    // The signed-in volunteer's email is taken as well, wherever the role sits.
    let error = create_account(
        database.connection(),
        "Maya Chen",
        "maya.chen@gmail.com",
        "another-password",
        "volunteer",
    )
    .expect_err("the volunteer profile already has an account");
    assert_eq!(rule_code(error), "EMAIL_TAKEN");
}

#[test]
fn a_hosted_identity_gets_a_local_account_without_a_password() {
    let database = seeded();
    let first = sign_in_with_hosted(
        database.connection(),
        "Jordan Reyes",
        "Jordan@Example.org",
        "coordinator",
    )
    .expect("hosted account is created");

    assert_eq!(first.user.email, "jordan@example.org");
    assert_eq!(first.user.role, "coordinator");

    let hash: Option<String> = database
        .connection()
        .query_row(
            "SELECT password_hash FROM users WHERE id = ?1",
            [&first.user.id],
            |row| row.get(0),
        )
        .unwrap();
    assert!(hash.is_none(), "hosted accounts keep no local password");

    let error = sign_in(
        database.connection(),
        "jordan@example.org",
        "second-saturday",
        true,
    )
    .expect_err("the local password form stays closed");
    assert_eq!(rule_code(error), "PASSWORD_NOT_SET");

    // Returning from another email link resumes the same local account and
    // keeps the role it already had.
    let again = sign_in_with_hosted(
        database.connection(),
        "Jordan",
        "jordan@example.org",
        "volunteer",
    )
    .expect("the hosted identity resumes");
    assert_eq!(again.user.id, first.user.id);
    assert_eq!(again.user.role, "coordinator");
}

#[test]
fn a_hosted_volunteer_gets_a_roster_profile() {
    let database = seeded();
    let session = sign_in_with_hosted(
        database.connection(),
        "Alicia Moreno",
        "alicia.hosted@example.org",
        "volunteer",
    )
    .expect("hosted volunteer is created");

    let volunteer_id = session.user.volunteer_id.clone().expect("linked profile");
    let name: String = database
        .connection()
        .query_row(
            "SELECT name FROM volunteers WHERE id = ?1",
            [&volunteer_id],
            |row| row.get(0),
        )
        .expect("the volunteer row exists");
    assert_eq!(name, "Alicia Moreno");
}

#[test]
fn weak_input_is_refused_before_anything_is_written() {
    let database = seeded();

    let error = create_account(
        database.connection(),
        "",
        "new@example.org",
        "second-saturday",
        "volunteer",
    )
    .expect_err("a name is required");
    assert_eq!(rule_code(error), "NAME_REQUIRED");

    let error = create_account(
        database.connection(),
        "Alicia Moreno",
        "not-an-email",
        "second-saturday",
        "volunteer",
    )
    .expect_err("the email must look like an address");
    assert_eq!(rule_code(error), "EMAIL_INVALID");

    let error = create_account(
        database.connection(),
        "Alicia Moreno",
        "alicia.moreno@example.org",
        "short",
        "volunteer",
    )
    .expect_err("the password is too short");
    assert_eq!(rule_code(error), "PASSWORD_TOO_SHORT");

    let error = create_account(
        database.connection(),
        "Alicia Moreno",
        "alicia.moreno@example.org",
        "second-saturday",
        "admin",
    )
    .expect_err("only the two roles exist");
    assert!(matches!(error, CoreError::Validation(_)));

    let users: i64 = database
        .connection()
        .query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))
        .unwrap();
    assert_eq!(users, 2, "the demo accounts are untouched");
}

#[test]
fn a_session_token_is_256_random_bits_and_never_stored_in_the_clear() {
    let database = seeded();
    let session = sign_in(
        database.connection(),
        "praket@feedmorewny.org",
        "civicflow-demo",
        false,
    )
    .expect("demo coordinator signs in");

    assert_eq!(session.token.len(), 64, "32 bytes, hex encoded");
    assert!(session
        .token
        .chars()
        .all(|character| character.is_ascii_hexdigit()));

    let stored: String = database
        .connection()
        .query_row(
            "SELECT token_hash FROM auth_sessions ORDER BY created_at DESC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_ne!(stored, session.token);
    assert_eq!(stored.len(), 64, "the database keeps only a SHA-256 hash");
}

#[test]
fn repeated_wrong_passwords_start_a_wait_and_a_real_sign_in_clears_it() {
    let database = seeded();
    for _ in 0..5 {
        let error = sign_in(
            database.connection(),
            "praket@feedmorewny.org",
            "not-the-password",
            false,
        )
        .expect_err("a wrong password is refused");
        assert_eq!(rule_code(error), "INVALID_CREDENTIALS");
    }

    let error = sign_in(
        database.connection(),
        "praket@feedmorewny.org",
        "not-the-password",
        false,
    )
    .expect_err("the sixth miss starts a wait");
    assert_eq!(rule_code(error), "TOO_MANY_ATTEMPTS");

    // The right password is refused too while the wait runs, so guessing gains
    // nothing from the account already being correct.
    let error = sign_in(
        database.connection(),
        "praket@feedmorewny.org",
        "civicflow-demo",
        false,
    )
    .expect_err("the wait applies to every attempt");
    assert_eq!(rule_code(error), "TOO_MANY_ATTEMPTS");

    database
        .connection()
        .execute(
            "UPDATE auth_attempts SET locked_until = '2000-01-01T00:00:00Z',
                 first_failed_at = '2000-01-01T00:00:00Z'",
            [],
        )
        .unwrap();
    sign_in(
        database.connection(),
        "praket@feedmorewny.org",
        "civicflow-demo",
        false,
    )
    .expect("the right password works once the wait has passed");

    let remaining: i64 = database
        .connection()
        .query_row("SELECT COUNT(*) FROM auth_attempts", [], |row| row.get(0))
        .unwrap();
    assert_eq!(remaining, 0, "a real sign-in clears the counter");
}

#[test]
fn an_unknown_email_is_counted_without_revealing_whether_it_exists() {
    let database = seeded();
    for _ in 0..6 {
        let error = sign_in(
            database.connection(),
            "nobody@example.org",
            "not-the-password",
            false,
        )
        .expect_err("no such account");
        let code = rule_code(error);
        assert!(code == "INVALID_CREDENTIALS" || code == "TOO_MANY_ATTEMPTS");
    }
    let locked: i64 = database
        .connection()
        .query_row(
            "SELECT COUNT(*) FROM auth_attempts WHERE email = 'nobody@example.org'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(locked, 1, "unknown emails are throttled the same way");
}

#[test]
fn resetting_the_demo_workspace_clears_a_sign_in_lock() {
    let mut database = seeded();
    for _ in 0..6 {
        let _ = sign_in(
            database.connection(),
            "praket@feedmorewny.org",
            "not-the-password",
            false,
        );
    }
    let error = sign_in(
        database.connection(),
        "praket@feedmorewny.org",
        "civicflow-demo",
        false,
    )
    .expect_err("the account is waiting out repeated misses");
    assert_eq!(rule_code(error), "TOO_MANY_ATTEMPTS");

    database.reset_demo().expect("the demo workspace resets");

    sign_in(
        database.connection(),
        "praket@feedmorewny.org",
        "civicflow-demo",
        false,
    )
    .expect("a reset clears the wait with the rest of the demo state");
}

#[test]
fn a_hosted_handoff_is_remembered_until_it_is_finished() {
    let database = seeded();
    assert!(!hosted_handoff_pending(database.connection(), "callback").unwrap());

    remember_hosted_handoff(database.connection(), "callback").expect("the hand-off is recorded");

    assert!(hosted_handoff_pending(database.connection(), "callback").unwrap());
    // A reset link must not answer for a sign-in link, or the other way round.
    assert!(!hosted_handoff_pending(database.connection(), "reset").unwrap());

    clear_hosted_handoff(database.connection()).expect("the hand-off is cleared");

    assert!(!hosted_handoff_pending(database.connection(), "callback").unwrap());
}

#[test]
fn a_hosted_handoff_older_than_a_day_is_refused() {
    let database = seeded();
    let old = Utc::now().timestamp() - 2 * 86_400;
    database
        .connection()
        .execute(
            "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('hosted_handoff', ?1)",
            params![format!("callback:{old}")],
        )
        .unwrap();

    assert!(!hosted_handoff_pending(database.connection(), "callback").unwrap());
}

#[test]
fn an_unknown_handoff_kind_is_refused() {
    let database = seeded();

    assert!(remember_hosted_handoff(database.connection(), "elsewhere").is_err());
    assert!(!hosted_handoff_pending(database.connection(), "elsewhere").unwrap());
}

#[test]
fn a_return_link_survives_until_it_is_taken_once() {
    let database = seeded();
    let link = "civicflow://auth/callback#access_token=one&refresh_token=two";

    store_hosted_link(database.connection(), link).expect("the address is kept");

    assert_eq!(
        take_hosted_link(database.connection()).unwrap(),
        Some(link.into())
    );
    // Taking it spends it: a reload cannot sign the window in a second time.
    assert_eq!(take_hosted_link(database.connection()).unwrap(), None);
}

#[test]
fn a_return_link_older_than_an_hour_is_dropped() {
    let database = seeded();
    let old = Utc::now().timestamp() - 2 * 3600;
    database
        .connection()
        .execute(
            "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('hosted_link', ?1)",
            params!["civicflow://auth/callback#access_token=one"],
        )
        .unwrap();
    database
        .connection()
        .execute(
            "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('hosted_link_at', ?1)",
            params![old.to_string()],
        )
        .unwrap();

    assert_eq!(take_hosted_link(database.connection()).unwrap(), None);
    // The stale address is not left behind to answer a later launch.
    assert_eq!(take_hosted_link(database.connection()).unwrap(), None);
}

#[test]
fn only_civicflow_addresses_are_kept() {
    let database = seeded();

    assert!(store_hosted_link(database.connection(), "https://example.org/auth/callback").is_err());
    assert!(
        store_hosted_link(database.connection(), "civicflow://auth/callback\nrm -rf /").is_err()
    );
    assert_eq!(take_hosted_link(database.connection()).unwrap(), None);
}
