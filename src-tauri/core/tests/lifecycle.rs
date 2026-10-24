use civicflow_core::matching::RosterOptions;
use civicflow_core::roster::{apply_roster_plan, plan_roster, RosterApplyAssignment};
use civicflow_core::workflows::{
    cancel_registration, check_in, check_out, join_waitlist, review_hours, snapshot,
};
use civicflow_core::Database;

fn seeded() -> Database {
    let mut database = Database::in_memory().expect("in-memory database");
    assert!(database.seed_demo_if_empty().expect("seed"));
    database
}

#[test]
fn cancellation_promotes_the_first_eligible_waitlist_candidate() {
    let database = seeded();
    join_waitlist(
        database.connection(),
        "sh-tue-pantry",
        "vol-055",
        "Donation sorter",
    )
    .expect("join waitlist");

    let state = cancel_registration(
        database.connection(),
        "sh-tue-pantry",
        "vol-maya",
        "Family emergency",
    )
    .expect("cancel registration");

    let maya = state
        .registrations
        .iter()
        .find(|row| row.shift_id == "sh-tue-pantry" && row.volunteer_id == "vol-maya")
        .expect("Maya registration");
    assert_eq!(maya.status, "canceled");
    let promoted = state
        .registrations
        .iter()
        .find(|row| row.shift_id == "sh-tue-pantry" && row.volunteer_id == "vol-055")
        .expect("promoted registration");
    assert_eq!(promoted.status, "registered");
    assert!(state.waitlist.iter().any(|row| {
        row.shift_id == "sh-tue-pantry" && row.volunteer_id == "vol-055" && row.status == "promoted"
    }));
    assert!(state
        .audit
        .iter()
        .any(|event| event.action == "waitlist.promote"));
    let notification: i64 = database
        .connection()
        .query_row(
            "SELECT COUNT(*) FROM notifications WHERE kind = 'WAITLIST_PROMOTED'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(notification, 1);
}

#[test]
fn an_approved_auto_roster_plan_applies_as_one_audited_write() {
    let database = seeded();
    let options = RosterOptions {
        prefer_spanish: true,
        block_conflicts: true,
        cap_weekly: false,
        include_waitlist: false,
    };
    let plan = plan_roster(
        database.connection(),
        &["sh-sat-food".to_string()],
        &options,
    )
    .expect("plan the shift");
    assert!(
        plan.assignments.len() > 1,
        "expected a multi-seat plan, got {}",
        plan.assignments.len()
    );

    let requests: Vec<RosterApplyAssignment> = plan
        .assignments
        .iter()
        .map(|assignment| RosterApplyAssignment {
            candidate_id: assignment.candidate_id.clone(),
            role: assignment.role.clone(),
            promote_waitlist: assignment.promote_waitlist,
        })
        .collect();
    let state =
        apply_roster_plan(database.connection(), "sh-sat-food", &requests).expect("apply the plan");

    for assignment in &plan.assignments {
        assert!(state.registrations.iter().any(|row| {
            row.shift_id == "sh-sat-food"
                && row.volunteer_id == assignment.candidate_id
                && row.role == assignment.role
                && row.status == "registered"
        }));
    }
    assert_eq!(
        state
            .audit
            .iter()
            .filter(|event| event.action == "autoroster.apply")
            .count(),
        plan.assignments.len()
    );
    let confirmed: i64 = database
        .connection()
        .query_row(
            "SELECT confirmed FROM shifts WHERE id = 'sh-sat-food'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(confirmed, 10 + plan.assignments.len() as i64);
}

#[test]
fn maya_iris_lifecycle_produces_hours_and_a_verification_record() {
    let database = seeded();
    join_waitlist(
        database.connection(),
        "sh-tue-pantry",
        "vol-055",
        "Donation sorter",
    )
    .expect("join waitlist");
    cancel_registration(
        database.connection(),
        "sh-tue-pantry",
        "vol-maya",
        "Schedule conflict",
    )
    .expect("cancel Maya");

    let checked_in =
        check_in(database.connection(), "sh-tue-pantry", "vol-055", None).expect("Iris checks in");
    let row = checked_in.attendance["sh-tue-pantry"]
        .iter()
        .find(|row| row.volunteer_id == "vol-055")
        .expect("Iris attendance");
    assert_eq!(row.status, "checked_in");

    let checked_out =
        check_out(database.connection(), "sh-tue-pantry", "vol-055").expect("Iris checks out");
    let hours: i64 = database
        .connection()
        .query_row(
            "SELECT COUNT(*) FROM hour_entries
             WHERE volunteer_id = 'vol-055' AND source_shift_id = 'sh-tue-pantry'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(hours, 1);
    assert!(checked_out
        .audit
        .iter()
        .any(|event| event.action == "shift.checkout"));

    let entry_id: String = database
        .connection()
        .query_row(
            "SELECT id FROM hour_entries
             WHERE volunteer_id = 'vol-055' AND source_shift_id = 'sh-tue-pantry'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let reviewed = review_hours(
        database.connection(),
        &entry_id,
        "verified",
        Some(1),
        "Confirmed with the shift lead",
    )
    .expect("approve hours");

    let decision = &reviewed.hours_decisions[&entry_id];
    assert_eq!(decision.status, "verified");
    assert_eq!(decision.approved_minutes, Some(1));
    let verification = reviewed
        .verifications
        .iter()
        .find(|record| record.volunteer_id == "vol-055" && record.date_start == "2026-10-13")
        .expect("verification record");
    assert!(verification.code.starts_with("CFV-2026-"));
    assert_eq!(verification.total_minutes, 1);
    let entry_code: String = database
        .connection()
        .query_row(
            "SELECT verification_id FROM hour_entries WHERE id = ?1",
            [&entry_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(entry_code, verification.code);
    let notification: i64 = database
        .connection()
        .query_row(
            "SELECT COUNT(*) FROM notifications WHERE kind = 'HOURS_APPROVED'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert!(notification >= 1);
    let reopened = snapshot(database.connection()).expect("snapshot after lifecycle");
    assert!(reopened
        .verifications
        .iter()
        .any(|row| row.code == entry_code));
}
