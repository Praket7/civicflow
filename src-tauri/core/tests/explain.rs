//! The why/why-not answer over the seeded workspace, which is the same data the
//! coordinator sees: the explanation and the counterfactual run against real
//! records rather than fixtures.

use civicflow_core::matching::RosterOptions;
use civicflow_core::roster::{explain_candidate, plan_roster};
use civicflow_core::Database;

fn seeded() -> Database {
    let mut database = Database::in_memory().expect("in-memory database");
    assert!(database.seed_demo_if_empty().expect("seed"));
    database
}

fn saturday() -> Vec<String> {
    vec!["sh-sat-food".to_string(), "sh-sat-garden".to_string()]
}

fn volunteer_ids(database: &Database) -> Vec<String> {
    let connection = database.connection();
    let mut statement = connection
        .prepare("SELECT id FROM volunteers ORDER BY id")
        .expect("volunteers are readable");
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .expect("the query runs");
    rows.map(|row| row.expect("a volunteer id")).collect()
}

#[test]
fn the_holder_of_a_seat_gets_an_explanation_without_a_counterfactual() {
    let database = seeded();
    let plan = plan_roster(
        database.connection(),
        &saturday(),
        &RosterOptions::default(),
    )
    .expect("a plan is produced");
    let assignment = plan.assignments.first().expect("a seat is filled");
    let seat = assignment.explanation.slot_id.clone();

    let answer = explain_candidate(
        database.connection(),
        &saturday(),
        &RosterOptions::default(),
        &assignment.candidate_id,
        &seat,
    )
    .expect("the answer is available");

    assert!(answer.explanation.eligible);
    assert!(answer.explanation.selected);
    assert!(answer.explanation.checks.iter().all(|check| check.passed));
    assert!(answer.comparison.is_none());
    let awarded: i32 = answer
        .explanation
        .components
        .iter()
        .map(|component| component.awarded)
        .sum();
    assert_eq!(awarded, assignment.score);
}

#[test]
fn a_volunteer_left_out_of_the_plan_gets_a_verdict_about_the_seat() {
    let database = seeded();
    let plan = plan_roster(
        database.connection(),
        &saturday(),
        &RosterOptions::default(),
    )
    .expect("a plan is produced");
    let assignment = plan.assignments.first().expect("a seat is filled");
    let seat = assignment.explanation.slot_id.clone();

    // A volunteer the plan did not use for this seat, which is who a coordinator
    // actually asks about.
    let left_out = volunteer_ids(&database)
        .into_iter()
        .find(|id| {
            !plan
                .assignments
                .iter()
                .any(|row| &row.candidate_id == id && row.explanation.slot_id == seat)
        })
        .expect("the workspace has more volunteers than the plan uses");

    let answer = explain_candidate(
        database.connection(),
        &saturday(),
        &RosterOptions::default(),
        &left_out,
        &seat,
    )
    .expect("the answer is available");

    assert!(!answer.explanation.selected);
    assert!(!answer.explanation.checks.is_empty());
    // A comparison is offered exactly when the seat was within reach.
    assert_eq!(answer.comparison.is_some(), answer.explanation.eligible);
    if let Some(comparison) = answer.comparison {
        assert!(comparison.filled_before >= comparison.filled_after);
        assert!(!comparison.summary.is_empty());
    }
}

#[test]
fn an_unknown_seat_is_reported_rather_than_guessed() {
    let database = seeded();
    let report = explain_candidate(
        database.connection(),
        &saturday(),
        &RosterOptions::default(),
        "vol-maya",
        "sh-sat-food-Nobody-1",
    );
    assert!(report.is_err(), "an unknown seat is not explained");
}
