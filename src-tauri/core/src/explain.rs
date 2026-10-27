//! Answers the two questions a coordinator actually asks about a plan: why this
//! person, and why not that one.
//!
//! Nothing here guesses. The hard checks and the score come from the same
//! functions the planner used, and "why not" is a real experiment: the
//! questioned assignment is decided, the solver runs again, and the two plans
//! are compared. That is why the answer can say "this would leave the Driver
//! seat uncovered" instead of only quoting two scores.

use serde::{Deserialize, Serialize};

use crate::error::{CoreError, Result};
use crate::matching::{
    explain_selection, is_eligible_explained, plan, plan_with_forced, Candidate, MatchExplanation,
    RosterOptions, RosterPlan, Slot,
};
use crate::policy::RosterPolicy;

/// One seat that a different person holds in the alternative plan.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AssignmentChange {
    pub kind: String,
    pub shift_id: String,
    pub shift_title: String,
    pub role: String,
    pub from_candidate: Option<String>,
    pub to_candidate: Option<String>,
}

/// What happens to the whole plan if the questioned assignment is forced.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ForcedComparison {
    pub candidate_id: String,
    pub candidate_name: String,
    pub slot_id: String,
    pub shift_id: String,
    pub role: String,
    pub filled_before: usize,
    pub filled_after: usize,
    pub required_filled_before: usize,
    pub required_filled_after: usize,
    pub total_score_before: i32,
    pub total_score_after: i32,
    pub changed_assignments: Vec<AssignmentChange>,
    /// Seats this decision would leave uncovered.
    pub becomes_uncovered: Vec<String>,
    /// Plain sentences, so the screen shows the consequence rather than a diff.
    pub summary: Vec<String>,
}

/// The answer to "why this person?" or "why not that one?".
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CandidateAnswer {
    pub explanation: MatchExplanation,
    /// Present when the candidate could take the seat but the plan did not give
    /// it to them, which is the only case where the question is interesting.
    pub comparison: Option<ForcedComparison>,
}

fn slot_key_raw(shift_id: &str, role: &str) -> String {
    format!("{shift_id}\u{1}{role}")
}

fn held_seat(plan: &RosterPlan) -> Vec<(String, Option<String>)> {
    plan.assignments
        .iter()
        .map(|assignment| {
            (
                slot_key_raw(&assignment.shift_id, &assignment.role),
                Some(assignment.candidate_id.clone()),
            )
        })
        .collect()
}

fn required_filled(plan: &RosterPlan, slots: &[Slot]) -> usize {
    plan.assignments
        .iter()
        .filter(|assignment| {
            slots
                .iter()
                .any(|slot| slot.id == assignment.explanation.slot_id && slot.mandatory)
        })
        .count()
}

/// Compares the plan the organization has with the plan it would have if this
/// one assignment were forced.
pub fn compare_forced(
    candidates: &[Candidate],
    slots: &[Slot],
    policy: &RosterPolicy,
    options: &RosterOptions,
    candidate_id: &str,
    slot_id: &str,
) -> Result<ForcedComparison> {
    let Some(candidate) = candidates.iter().find(|row| row.id == candidate_id) else {
        return Err(CoreError::NotFound("that volunteer".into()));
    };
    let Some(slot) = slots.iter().find(|row| row.id == slot_id) else {
        return Err(CoreError::NotFound("that role".into()));
    };

    let base = plan(candidates, slots, policy, options);
    let forced = plan_with_forced(
        candidates,
        slots,
        policy,
        options,
        &[(candidate_id.to_string(), slot_id.to_string())],
    );

    let before = held_seat(&base);
    let after = held_seat(&forced);
    let mut changed = Vec::new();
    let mut becomes_uncovered = Vec::new();
    for (key, owner) in &before {
        let (shift_id, role) = key
            .split_once('\u{1}')
            .map(|(shift, role)| (shift.to_string(), role.to_string()))
            .unwrap_or_default();
        let now = after
            .iter()
            .find(|(other, _)| other == key)
            .and_then(|(_, owner)| owner.clone());
        if now == *owner {
            continue;
        }
        let shift_title = slots
            .iter()
            .find(|slot| slot.shift_id == shift_id && slot.role == role)
            .map(|slot| slot.shift_title.clone())
            .unwrap_or_default();
        if now.is_none() {
            becomes_uncovered.push(format!("{role} on {shift_title}"));
        }
        changed.push(AssignmentChange {
            kind: if now.is_none() { "lost" } else { "moved" }.to_string(),
            shift_id,
            shift_title,
            role,
            from_candidate: owner.clone(),
            to_candidate: now,
        });
    }
    for (key, owner) in &after {
        if before.iter().any(|(other, _)| other == key) {
            continue;
        }
        let (shift_id, role) = key
            .split_once('\u{1}')
            .map(|(shift, role)| (shift.to_string(), role.to_string()))
            .unwrap_or_default();
        let shift_title = slots
            .iter()
            .find(|slot| slot.shift_id == shift_id && slot.role == role)
            .map(|slot| slot.shift_title.clone())
            .unwrap_or_default();
        changed.push(AssignmentChange {
            kind: "gained".into(),
            shift_id,
            shift_title,
            role,
            from_candidate: None,
            to_candidate: owner.clone(),
        });
    }
    changed.sort_by(|left, right| {
        left.shift_id
            .cmp(&right.shift_id)
            .then_with(|| left.role.cmp(&right.role))
            .then_with(|| left.kind.cmp(&right.kind))
    });

    let mut summary = vec![format!(
        "Forcing {} into {}: required seats filled {} to {}",
        candidate.name,
        slot.role,
        required_filled(&base, slots),
        required_filled(&forced, slots)
    )];
    if base.total_score != forced.total_score {
        summary.push(format!(
            "Total match score {} to {}",
            base.total_score, forced.total_score
        ));
    }
    if becomes_uncovered.is_empty() {
        summary.push("No seat loses its volunteer".to_string());
    } else {
        summary.push(format!("Uncovered: {}", becomes_uncovered.join(", ")));
    }

    Ok(ForcedComparison {
        candidate_id: candidate.id.clone(),
        candidate_name: candidate.name.clone(),
        slot_id: slot.id.clone(),
        shift_id: slot.shift_id.clone(),
        role: slot.role.clone(),
        filled_before: base.assignments.len(),
        filled_after: forced.assignments.len(),
        required_filled_before: required_filled(&base, slots),
        required_filled_after: required_filled(&forced, slots),
        total_score_before: base.total_score,
        total_score_after: forced.total_score,
        changed_assignments: changed,
        becomes_uncovered,
        summary,
    })
}

/// The full answer for one candidate and one seat: the checks, the score, and —
/// when they were eligible but not chosen — what choosing them would cost.
pub fn explain_candidate(
    candidates: &[Candidate],
    slots: &[Slot],
    policy: &RosterPolicy,
    options: &RosterOptions,
    candidate_id: &str,
    slot_id: &str,
) -> Result<CandidateAnswer> {
    let Some(candidate) = candidates.iter().find(|row| row.id == candidate_id) else {
        return Err(CoreError::NotFound("that volunteer".into()));
    };
    let Some(slot) = slots.iter().find(|row| row.id == slot_id) else {
        return Err(CoreError::NotFound("that role".into()));
    };

    let base = plan(candidates, slots, policy, options);
    let selected = base.assignments.iter().any(|assignment| {
        assignment.candidate_id == candidate_id && assignment.explanation.slot_id == slot_id
    });
    let explanation = if selected {
        base.assignments
            .iter()
            .find(|assignment| {
                assignment.candidate_id == candidate_id && assignment.explanation.slot_id == slot_id
            })
            .map(|assignment| assignment.explanation.clone())
            .expect("the assignment was just found")
    } else {
        explain_selection(candidate, slot, policy, options, false)
    };

    let comparison = if !selected && is_eligible_explained(candidate, slot, policy, options) {
        Some(compare_forced(
            candidates,
            slots,
            policy,
            options,
            candidate_id,
            slot_id,
        )?)
    } else {
        None
    };

    Ok(CandidateAnswer {
        explanation,
        comparison,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::matching::{day_key, RosterOptions};
    use chrono::{DateTime, FixedOffset, NaiveDate};
    use std::collections::HashSet;

    fn date(value: &str) -> DateTime<FixedOffset> {
        DateTime::parse_from_rfc3339(value).unwrap()
    }

    fn candidate(id: &str, skills: &[&str], availability: &[&str]) -> Candidate {
        Candidate {
            id: id.into(),
            name: format!("Volunteer {id}"),
            initials: id.to_uppercase(),
            skills: skills.iter().map(|value| value.to_string()).collect(),
            languages: vec!["English".into()],
            causes: vec!["food".into()],
            availability: availability.iter().map(|value| value.to_string()).collect(),
            birthdate: Some(NaiveDate::from_ymd_opt(1995, 1, 1).unwrap()),
            attendance_rate: 95,
            events_completed: 5,
            credentials: Vec::new(),
            assigned_blocks: Vec::new(),
            assigned_shift_ids: HashSet::new(),
            waitlisted_shift_ids: HashSet::new(),
            weekly_load: 0,
            weekly_minutes: 0,
        }
    }

    fn slot(id: &str, role: &str, skill: &str, starts_at: &str) -> Slot {
        let starts_at = date(starts_at);
        Slot {
            id: id.into(),
            shift_id: "shift-1".into(),
            opportunity_id: "opp-1".into(),
            shift_title: "Food distribution".into(),
            role: role.into(),
            cause: "food".into(),
            day_key: day_key(starts_at.date_naive()),
            starts_at,
            ends_at: starts_at + chrono::Duration::hours(3),
            required_skill: Some(skill.into()),
            required_credential: None,
            minimum_age: None,
            mandatory: true,
        }
    }

    /// Two seats on one Saturday: only x can drive, only y packs, and x can do
    /// either. The plan therefore puts x on Driver and y on Packing.
    fn split_roles() -> (Vec<Candidate>, Vec<Slot>) {
        let candidates = vec![
            candidate(
                "x",
                &["Driver", "Packing"],
                &["sat:morning", "sat:afternoon"],
            ),
            candidate("y", &["Packing"], &["sat:afternoon"]),
        ];
        let slots = vec![
            slot("p", "Driver", "Driver", "2026-10-17T09:00:00-04:00"),
            slot("s", "Packing", "Packing", "2026-10-17T13:00:00-04:00"),
        ];
        (candidates, slots)
    }

    fn answer(candidates: &[Candidate], slots: &[Slot], who: &str, seat: &str) -> CandidateAnswer {
        explain_candidate(
            candidates,
            slots,
            &RosterPolicy::default(),
            &RosterOptions::default(),
            who,
            seat,
        )
        .expect("the candidate and seat exist")
    }

    #[test]
    fn a_selected_candidate_is_explained_without_a_counterfactual() {
        let (candidates, slots) = split_roles();
        let answer = answer(&candidates, &slots, "y", "s");
        assert!(answer.explanation.eligible);
        assert!(answer.explanation.selected);
        assert_eq!(answer.explanation.total_score, Some(96));
        assert!(answer.comparison.is_none());
    }

    #[test]
    fn a_candidate_holding_another_seat_is_told_what_moving_would_cost() {
        let (candidates, slots) = split_roles();
        // x was chosen for Driver. Ask what happens if x takes Packing instead.
        let answer = answer(&candidates, &slots, "x", "s");
        assert!(answer.explanation.eligible);
        assert!(!answer.explanation.selected);
        let comparison = answer.comparison.expect("a counterfactual is offered");
        assert_eq!(comparison.filled_before, 2);
        assert_eq!(comparison.filled_after, 1);
        assert_eq!(comparison.required_filled_before, 2);
        assert_eq!(comparison.required_filled_after, 1);
        assert_eq!(
            comparison.becomes_uncovered,
            vec!["Driver on Food distribution"]
        );
        assert!(comparison.summary[0].contains("required seats filled 2 to 1"));
        assert!(comparison
            .changed_assignments
            .iter()
            .any(|change| change.kind == "lost" && change.role == "Driver"));
    }

    #[test]
    fn a_candidate_who_fails_a_requirement_is_told_which_one() {
        let candidates = vec![candidate("z", &["Tutoring"], &["sat:morning"])];
        let slots = vec![slot("s", "Packing", "Packing", "2026-10-17T09:00:00-04:00")];
        let answer = answer(&candidates, &slots, "z", "s");
        assert!(!answer.explanation.eligible);
        assert_eq!(answer.explanation.total_score, None);
        assert!(answer.comparison.is_none());
        assert!(answer
            .explanation
            .checks
            .iter()
            .any(|check| check.name == "Required skill" && !check.passed));
    }

    #[test]
    fn forcing_a_candidate_into_a_seat_nobody_else_wants_costs_nothing() {
        let best = candidate("a", &["Driver"], &["sat:morning"]);
        let mut weaker = candidate("b", &["Driver"], &["sat:morning"]);
        weaker.attendance_rate = 70;
        let candidates = vec![best, weaker];
        let slots = vec![slot("s", "Driver", "Driver", "2026-10-17T09:00:00-04:00")];

        let answer = answer(&candidates, &slots, "b", "s");
        let comparison = answer.comparison.expect("a counterfactual is offered");
        assert_eq!(comparison.filled_before, 1);
        assert_eq!(comparison.filled_after, 1);
        assert!(comparison.becomes_uncovered.is_empty());
        assert!(comparison
            .summary
            .iter()
            .any(|line| line == "No seat loses its volunteer"));
        assert!(comparison.changed_assignments.iter().any(|change| {
            change.kind == "moved"
                && change.from_candidate.as_deref() == Some("a")
                && change.to_candidate.as_deref() == Some("b")
        }));
    }

    #[test]
    fn an_unknown_candidate_or_seat_is_a_not_found_error() {
        let (candidates, slots) = split_roles();
        let policy = RosterPolicy::default();
        let options = RosterOptions::default();
        assert!(explain_candidate(&candidates, &slots, &policy, &options, "nobody", "s").is_err());
        assert!(explain_candidate(&candidates, &slots, &policy, &options, "x", "nowhere").is_err());
    }
}
