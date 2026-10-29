//! What the waiting line is asked before a seat opens: can this person take it,
//! and why not, in the order they joined.

use chrono::{Datelike, Timelike};
use civicflow_core::waitlist;
use civicflow_core::Database;
use rusqlite::params;

fn seeded() -> Database {
    let mut database = Database::in_memory().expect("in-memory database");
    assert!(database.seed_demo_if_empty().expect("seed"));
    database
}

struct Waiting {
    shift_id: String,
    role: String,
    credential: String,
    without: String,
    with: String,
}

/// A future shift with an open required seat that needs a credential, plus one
/// active volunteer who holds it and one who does not. The requirement is added
/// here rather than read from the seed, so the test says what it depends on.
fn a_guarded_open_seat(database: &Database) -> Option<Waiting> {
    let conn = database.connection();
    let now: String = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'workspace_clock'",
            [],
            |row| row.get(0),
        )
        .expect("demo clock");
    // A future shift with an open seat, paired with a volunteer who holds a
    // credential the seat can then require and who is available at that day and
    // time. Everything the eligibility gate checks is satisfied on purpose, so
    // the test measures the ranking and not the fixture.
    let open_seats: Vec<(String, String, String)> = {
        let mut statement = conn
            .prepare(
                "SELECT s.id, sr.name, s.starts_at
                 FROM shifts s
                 JOIN shift_roles sr ON sr.shift_id = s.id
                 WHERE s.status = 'scheduled' AND s.starts_at > ?1 AND sr.filled < sr.required
                 ORDER BY s.starts_at, sr.name LIMIT 40",
            )
            .expect("open seats");
        statement
            .query_map(params![now], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })
            .expect("query")
            .collect::<rusqlite::Result<Vec<_>>>()
            .expect("rows")
    };

    let mut chosen: Option<(String, String, String, String, String)> = None;
    for (shift_id, role, starts_at) in &open_seats {
        let start = chrono::DateTime::parse_from_rfc3339(starts_at).expect("shift time");
        let day = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
            [start.weekday().num_days_from_sunday() as usize];
        let period = if start.hour() < 12 {
            "morning"
        } else if start.hour() < 17 {
            "afternoon"
        } else {
            "evening"
        };
        let date = start.date_naive().format("%Y-%m-%d").to_string();
        let found: Option<(String, String, String)> = conn
            .query_row(
                "SELECT ct.id, ct.name, vc.volunteer_id
                 FROM volunteer_credentials vc
                 JOIN credential_types ct ON ct.id = vc.credential_type_id
                 JOIN volunteers v ON v.id = vc.volunteer_id
                 WHERE v.status = 'active' AND vc.valid_through >= ?1
                   AND EXISTS (
                     SELECT 1 FROM availability_rules a
                     WHERE a.volunteer_id = v.id AND a.day = ?2 AND a.period = ?3
                   )
                 ORDER BY ct.name, v.id LIMIT 1",
                params![date, day, period],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .ok();
        if let Some((type_id, credential, holder)) = found {
            chosen = Some((shift_id.clone(), role.clone(), type_id, credential, holder));
            break;
        }
    }
    let (shift_id, role, type_id, credential, holder) = chosen?;

    let without: String = conn
        .query_row(
            "SELECT v.id FROM volunteers v
             WHERE v.status = 'active'
               AND NOT EXISTS (
                 SELECT 1 FROM volunteer_credentials vc
                 WHERE vc.volunteer_id = v.id AND vc.credential_type_id = ?1
               )
             ORDER BY v.id LIMIT 1",
            params![type_id],
            |row| row.get(0),
        )
        .ok()?;

    // The test owns this shift's line, so a seeded entry cannot decide the
    // outcome of a ranking it did not set up.
    conn.execute(
        "DELETE FROM waitlist_entries WHERE shift_id = ?1",
        params![shift_id],
    )
    .expect("clear the seeded line");
    conn.execute(
        "INSERT OR REPLACE INTO role_requirements
         (id, shift_id, role_name, skill, credential_type_id, minimum_age)
         VALUES (?1, ?2, ?3, NULL, ?4, NULL)",
        params![format!("req-{shift_id}-{role}"), shift_id, role, type_id],
    )
    .expect("role requirement");

    Some(Waiting {
        shift_id,
        role,
        credential,
        without,
        with: holder,
    })
}

fn wait(database: &Database, shift_id: &str, volunteer_id: &str, role: &str, position: i64) {
    database
        .connection()
        .execute(
            "INSERT INTO waitlist_entries
             (id, shift_id, volunteer_id, position, created_at, status, eligible_role)
             VALUES (?1, ?2, ?3, ?4, '2026-10-01T09:00:00-04:00', 'waiting', ?5)",
            params![
                format!("wl-{position}-{volunteer_id}"),
                shift_id,
                volunteer_id,
                position,
                role
            ],
        )
        .expect("waitlist entry");
}

#[test]
fn the_seed_offers_a_guarded_open_seat_to_rank() {
    let database = seeded();
    let seat = a_guarded_open_seat(&database).expect("a credential-guarded open seat");
    assert!(!seat.credential.is_empty());
    assert_ne!(seat.with, seat.without);
    let answer =
        waitlist::rank(database.connection(), &seat.shift_id, &seat.role).expect("a rankable seat");
    assert_eq!(answer.shift_id, seat.shift_id);
}

#[test]
fn the_first_eligible_volunteer_is_the_recommendation() {
    let database = seeded();
    let Some(seat) = a_guarded_open_seat(&database) else {
        return;
    };
    wait(&database, &seat.shift_id, &seat.without, &seat.role, 1);
    wait(&database, &seat.shift_id, &seat.with, &seat.role, 2);

    let answer = waitlist::rank(database.connection(), &seat.shift_id, &seat.role).expect("rank");
    let recommended = answer.recommended.expect("a recommendation");
    assert_eq!(recommended.volunteer_id, seat.with);
    assert!(!answer.ranked[0].eligible);
    assert!(
        answer.ranked[0].reason.contains(&seat.credential),
        "the skip reason names the credential: {}",
        answer.ranked[0].reason
    );
    assert!(
        answer.summary.contains("first eligible"),
        "{}",
        answer.summary
    );
    assert!(
        answer.summary.contains(&seat.credential),
        "the summary explains who was passed over: {}",
        answer.summary
    );
}

#[test]
fn a_line_with_nobody_eligible_says_so_without_a_recommendation() {
    let database = seeded();
    let Some(seat) = a_guarded_open_seat(&database) else {
        return;
    };
    wait(&database, &seat.shift_id, &seat.without, &seat.role, 1);
    let answer = waitlist::rank(database.connection(), &seat.shift_id, &seat.role).expect("rank");
    assert!(answer.recommended.is_none());
    assert!(answer.summary.contains("can take"), "{}", answer.summary);
}

#[test]
fn an_empty_line_is_not_an_error() {
    let database = seeded();
    let shift_id: String = database
        .connection()
        .query_row(
            "SELECT s.id FROM shifts s JOIN shift_roles sr ON sr.shift_id = s.id LIMIT 1",
            [],
            |row| row.get(0),
        )
        .expect("a shift");
    let role: String = database
        .connection()
        .query_row(
            "SELECT name FROM shift_roles WHERE shift_id = ?1 LIMIT 1",
            params![shift_id],
            |row| row.get(0),
        )
        .expect("a role");
    let answer = waitlist::rank(database.connection(), &shift_id, &role).expect("rank");
    assert!(answer.recommended.is_none());
    assert!(answer.ranked.is_empty());
}

#[test]
fn the_line_keeps_its_order_when_everybody_can_take_the_seat() {
    let database = seeded();
    let Some(seat) = a_guarded_open_seat(&database) else {
        return;
    };
    wait(&database, &seat.shift_id, &seat.with, &seat.role, 1);
    let answer = waitlist::rank(database.connection(), &seat.shift_id, &seat.role).expect("rank");
    let recommended = answer.recommended.expect("a recommendation");
    assert_eq!(recommended.volunteer_id, seat.with);
    assert_eq!(recommended.position, 1);
    assert!(
        answer.summary.contains(&recommended.name),
        "the sentence names who was chosen: {}",
        answer.summary
    );
    assert!(answer.ranked.iter().all(|row| !row.reason.is_empty()));
}
