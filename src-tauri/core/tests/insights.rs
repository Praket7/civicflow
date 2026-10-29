//! The rules behind retention and recognition: every signal names its threshold,
//! every milestone says what is still missing, and no number pretends to be a
//! prediction.

use civicflow_core::insights;
use civicflow_core::Database;
use rusqlite::params;

fn seeded() -> Database {
    let mut database = Database::in_memory().expect("in-memory database");
    assert!(database.seed_demo_if_empty().expect("seed"));
    database
}

#[test]
fn every_signal_states_its_rule_and_its_action() {
    let database = seeded();
    let signals = insights::retention_signals(database.connection()).expect("signals");
    assert!(!signals.is_empty(), "the demo roster produces signals");
    for signal in &signals {
        assert!(!signal.reason.is_empty(), "{} has a reason", signal.name);
        assert!(
            !signal.suggested_action.is_empty(),
            "{} has a suggested action",
            signal.name
        );
        assert!(
            signal.reason.chars().any(|value| value.is_ascii_digit()),
            "the reason names its threshold: {}",
            signal.reason
        );
    }
}

#[test]
fn the_same_roster_produces_the_same_signals() {
    let database = seeded();
    let first = insights::retention_signals(database.connection()).expect("signals");
    let second = insights::retention_signals(database.connection()).expect("signals");
    assert_eq!(first, second);
}

#[test]
fn a_volunteer_with_no_verified_hours_has_every_milestone_ahead() {
    let database = seeded();
    let volunteer: String = database
        .connection()
        .query_row(
            "SELECT id FROM volunteers v
             WHERE NOT EXISTS (
               SELECT 1 FROM hour_entries h
               WHERE h.volunteer_id = v.id AND h.status = 'verified'
             )
             ORDER BY id LIMIT 1",
            [],
            |row| row.get(0),
        )
        .expect("a volunteer without verified hours");
    let insight = insights::volunteer_insight(database.connection(), &volunteer).expect("insight");
    assert_eq!(insight.verified_hours, 0);
    assert!(insight.milestones.iter().all(|row| !row.earned));
    let next = insight.next.expect("a next milestone");
    assert!(next.contains("10 verified hours"), "{next}");
    assert!(next.contains("to go"), "{next}");
}

#[test]
fn verifying_hours_earns_the_milestone_it_crosses() {
    let database = seeded();
    let volunteer: String = database
        .connection()
        .query_row("SELECT id FROM volunteers ORDER BY id LIMIT 1", [], |row| {
            row.get(0)
        })
        .expect("a volunteer");
    let opportunity: String = database
        .connection()
        .query_row(
            "SELECT id FROM opportunities ORDER BY id LIMIT 1",
            [],
            |row| row.get(0),
        )
        .expect("an opportunity");
    for index in 0..11 {
        database
            .connection()
            .execute(
                "INSERT INTO hour_entries
                 (id, volunteer_id, opportunity_id, date, minutes, status, verification_id)
                 VALUES (?1, ?2, ?3, '2026-09-01', 60, 'verified', NULL)",
                params![format!("h-milestone-{index}"), volunteer, opportunity],
            )
            .expect("hour entry");
    }
    let insight = insights::volunteer_insight(database.connection(), &volunteer).expect("insight");
    assert!(insight.verified_hours >= 11);
    let ten = insight
        .milestones
        .iter()
        .find(|row| row.key == "hours-10")
        .expect("the ten-hour milestone");
    assert!(ten.earned);
    let fifty = insight
        .milestones
        .iter()
        .find(|row| row.key == "hours-50")
        .expect("the fifty-hour milestone");
    assert!(!fifty.earned);
    assert!(fifty.remaining.contains("39 hour"));
}

#[test]
fn engagement_metrics_stay_inside_their_ranges() {
    let database = seeded();
    let metrics = insights::engagement_metrics(database.connection()).expect("metrics");
    for rate in [
        metrics.return_30,
        metrics.return_60,
        metrics.return_90,
        metrics.no_show_rate,
        metrics.late_cancellation_rate,
        metrics.waitlist_promotion_rate,
    ] {
        assert!((0..=100).contains(&rate), "rate out of range: {rate}");
    }
    assert!(metrics.completed_shifts > 0);
    assert!(metrics.average_lead_days >= 0);
}

#[test]
fn credential_readiness_counts_every_credential_once() {
    let database = seeded();
    let readiness = insights::credential_readiness(database.connection()).expect("readiness");
    let total: i64 = database
        .connection()
        .query_row("SELECT COUNT(*) FROM volunteer_credentials", [], |row| {
            row.get(0)
        })
        .expect("credentials");
    assert!(readiness.current + readiness.expired <= total);
    assert!(readiness.expiring_soon >= 0);
    assert!(readiness.assignments_at_risk >= 0);
}

#[test]
fn a_future_assignment_that_depends_on_a_lapsed_credential_is_counted() {
    let database = seeded();
    let before = insights::credential_readiness(database.connection()).expect("readiness");
    // Take a volunteer who is registered on a future guarded shift and expire
    // the credential that seat requires.
    let row: Option<(String, String, String, String)> = database
        .connection()
        .query_row(
            "SELECT r.volunteer_id, r.role, rr.credential_type_id, s.id
             FROM registrations r
             JOIN shifts s ON s.id = r.shift_id
             JOIN role_requirements rr ON rr.shift_id = r.shift_id AND rr.role_name = r.role
             WHERE r.status = 'registered' AND s.status = 'scheduled'
               AND rr.credential_type_id IS NOT NULL
               AND s.starts_at > (SELECT value FROM app_settings WHERE key = 'workspace_clock')
             ORDER BY s.starts_at
             LIMIT 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .ok();
    let Some((volunteer, _role, credential_type, _shift)) = row else {
        return;
    };
    database
        .connection()
        .execute(
            "UPDATE volunteer_credentials SET valid_through = '2020-01-01'
             WHERE volunteer_id = ?1 AND credential_type_id = ?2",
            params![volunteer, credential_type],
        )
        .expect("expire the credential");
    let after = insights::credential_readiness(database.connection()).expect("readiness");
    assert!(
        after.assignments_at_risk >= before.assignments_at_risk.max(1),
        "a lapsed credential on a future shift is counted: {} then {}",
        before.assignments_at_risk,
        after.assignments_at_risk
    );
}
