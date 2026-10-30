//! Deterministic, explainable assignment planning.
//!
//! Eligibility is a hard gate. Assignment is min-cost max-flow:
//!
//! ```text
//! source -> candidate-day (capacity 1) -> role slot (capacity 1) -> sink
//! ```
//!
//! Edge cost is `MAX_SCORE - score`; a required role carries a priority bonus.
//! The flow allows one slot per calendar day, so a second pass offers remaining
//! same-day slots to candidates with no time overlap.

use std::collections::{BTreeMap, HashMap, HashSet, VecDeque};

use chrono::{DateTime, Datelike, FixedOffset, NaiveDate, Timelike};
use serde::{Deserialize, Serialize};

use crate::policy::RosterPolicy;

pub const MAX_SCORE: i32 = 100;

/// Availability is a gate, so the points are constant; the policy weights
/// separate candidates. Default weights plus this constant reach `MAX_SCORE`.
pub const AVAILABILITY_POINTS: i32 = 25;

/// Applied once, so required roles fill before optional ones.
pub const MANDATORY_SLOT_BONUS: i32 = 20_000;

/// One score point in flow cost; tiebreaks stay below it.
const SCORE_UNIT: i32 = 100;

#[derive(Debug, Clone, PartialEq)]
pub struct TimeBlock {
    pub starts_at: DateTime<FixedOffset>,
    pub ends_at: DateTime<FixedOffset>,
}

/// Half-open overlap: a shift that ends exactly when the next one starts is not
/// a conflict.
fn overlaps(
    starts_at: DateTime<FixedOffset>,
    ends_at: DateTime<FixedOffset>,
    other_start: DateTime<FixedOffset>,
    other_end: DateTime<FixedOffset>,
) -> bool {
    starts_at < other_end && other_start < ends_at
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RosterOptions {
    #[serde(default)]
    pub prefer_spanish: bool,
    #[serde(default = "default_true")]
    pub block_conflicts: bool,
    #[serde(default)]
    pub cap_weekly: bool,
    #[serde(default)]
    pub include_waitlist: bool,
}

/// The omitted and constructed defaults must agree.
impl Default for RosterOptions {
    fn default() -> Self {
        Self {
            prefer_spanish: false,
            block_conflicts: true,
            cap_weekly: false,
            include_waitlist: false,
        }
    }
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, PartialEq)]
pub struct Credential {
    pub name: String,
    pub valid_through: NaiveDate,
}

#[derive(Debug, Clone)]
pub struct Candidate {
    pub id: String,
    pub name: String,
    pub initials: String,
    pub skills: Vec<String>,
    pub languages: Vec<String>,
    pub causes: Vec<String>,
    pub availability: HashSet<String>,
    pub birthdate: Option<NaiveDate>,
    pub attendance_rate: i64,
    pub events_completed: i64,
    pub credentials: Vec<Credential>,
    pub assigned_blocks: Vec<TimeBlock>,
    pub assigned_shift_ids: HashSet<String>,
    pub waitlisted_shift_ids: HashSet<String>,
    pub weekly_load: i64,
    /// Minutes already committed inside the next seven days, so a policy can cap
    /// time rather than only shifts.
    pub weekly_minutes: i64,
}

/// One hard requirement, evaluated and explained. A coordinator asking "why not
/// this volunteer?" gets the failed check rather than a single sentence.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConstraintCheck {
    pub name: String,
    pub passed: bool,
    pub detail: String,
}

/// One soft component of a match score.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ScoreComponent {
    pub label: String,
    pub awarded: i32,
    pub maximum: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MatchExplanation {
    pub candidate_id: String,
    pub candidate_name: String,
    pub candidate_initials: String,
    pub slot_id: String,
    pub shift_id: String,
    pub role: String,
    pub eligible: bool,
    pub checks: Vec<ConstraintCheck>,
    pub components: Vec<ScoreComponent>,
    pub total_score: Option<i32>,
    pub selected: bool,
    pub selection_reason: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Evaluation {
    pub eligible: bool,
    pub checks: Vec<ConstraintCheck>,
}

impl Evaluation {
    /// The first failed requirement, for a person to read.
    pub fn rejection(&self) -> Option<String> {
        self.checks
            .iter()
            .find(|check| !check.passed)
            .map(|check| format!("{}: {}", check.name, check.detail))
    }
}

/// Load this run added on top of the database's own seven-day window.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct RunLoad {
    pub shifts: i64,
    pub minutes: i64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Slot {
    pub id: String,
    pub shift_id: String,
    pub opportunity_id: String,
    pub shift_title: String,
    pub role: String,
    pub cause: String,
    pub day_key: String,
    pub starts_at: DateTime<FixedOffset>,
    pub ends_at: DateTime<FixedOffset>,
    pub required_skill: Option<String>,
    pub required_credential: Option<String>,
    pub minimum_age: Option<i64>,
    pub mandatory: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ScoreBreakdown {
    pub skill: i32,
    pub availability: i32,
    pub interest: i32,
    pub preference: i32,
    pub fairness: i32,
    pub reliability: i32,
    pub total: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlannedAssignment {
    pub shift_id: String,
    pub opportunity_id: String,
    pub shift_title: String,
    pub role: String,
    pub candidate_id: String,
    pub candidate_name: String,
    pub candidate_initials: String,
    pub starts_at: String,
    pub score: i32,
    pub breakdown: ScoreBreakdown,
    pub reasons: Vec<String>,
    pub promote_waitlist: bool,
    pub eligible_roles: Vec<String>,
    pub explanation: MatchExplanation,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UnfilledSlot {
    pub shift_id: String,
    pub role: String,
    pub reason: String,
    pub required_skill: Option<String>,
    pub required_credential: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RosterPlan {
    pub assignments: Vec<PlannedAssignment>,
    pub unfilled: Vec<UnfilledSlot>,
    pub total_score: i32,
    pub slots_considered: usize,
    pub candidates_considered: usize,
    pub deterministic_seed: u64,
    pub policy_version: i64,
    #[serde(default)]
    pub generated_at: String,
    /// Applying a plan against a moved revision would overwrite a newer decision.
    #[serde(default)]
    pub revision: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EvaluatedSlot {
    pub slot_id: String,
    pub shift_id: String,
    pub shift_title: String,
    pub role: String,
    pub starts_at: String,
    pub ends_at: String,
    pub eligible: bool,
    pub selected: bool,
    pub score: Option<i32>,
    pub checks: Vec<ConstraintCheck>,
    pub components: Vec<ScoreComponent>,
    pub selection_reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CandidateEvaluation {
    pub candidate_id: String,
    pub candidate_name: String,
    pub candidate_initials: String,
    pub eligible_roles: Vec<String>,
    pub best_score: Option<i32>,
    pub availability: String,
    pub conflict: Option<String>,
    pub weekly_shifts: i64,
    pub weekly_minutes: i64,
    pub waitlisted_shift_ids: Vec<String>,
    pub slots: Vec<EvaluatedSlot>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RosterEvaluation {
    pub generated_at: String,
    pub policy_version: i64,
    pub revision: i64,
    pub plan: RosterPlan,
    pub candidates: Vec<CandidateEvaluation>,
}

/// `unknown`: not stated; `partial`: free that day, not in this half of it.
pub fn availability_state(candidate: &Candidate, slot: &Slot) -> String {
    let key = format!("{}:{}", slot.day_key, period_for(slot.starts_at));
    if candidate.availability.is_empty() {
        return "unknown".into();
    }
    if candidate.availability.contains(&key) {
        return "available".into();
    }
    let day_prefix = format!("{}:", slot.day_key);
    if candidate
        .availability
        .iter()
        .any(|entry| entry.starts_with(&day_prefix))
    {
        return "partial".into();
    }
    "unavailable".into()
}

/// The single read model behind AutoRoster: the plan plus every evaluation.
pub fn evaluate_roster(
    candidates: &[Candidate],
    slots: &[Slot],
    policy: &RosterPolicy,
    options: &RosterOptions,
) -> RosterEvaluation {
    let plan = plan(candidates, slots, policy, options);
    let selected: std::collections::HashSet<(String, String)> = plan
        .assignments
        .iter()
        .map(|assignment| {
            (
                assignment.candidate_id.clone(),
                assignment.explanation.slot_id.clone(),
            )
        })
        .collect();

    let mut ordered_candidates: Vec<&Candidate> = candidates.iter().collect();
    ordered_candidates.sort_by(|a, b| a.id.cmp(&b.id));
    let mut ordered_slots: Vec<&Slot> = slots.iter().collect();
    ordered_slots.sort_by(|a, b| {
        a.starts_at
            .cmp(&b.starts_at)
            .then_with(|| a.shift_id.cmp(&b.shift_id))
            .then_with(|| a.id.cmp(&b.id))
    });

    let rows = ordered_candidates
        .into_iter()
        .map(|candidate| {
            let mut evaluations = Vec::new();
            for slot in &ordered_slots {
                let is_selected = selected.contains(&(candidate.id.clone(), slot.id.clone()));
                // A chosen seat reuses the plan's own explanation, which includes
                // the load this run assigned. Everything else is evaluated on the
                // database state alone.
                let explanation = if is_selected {
                    plan.assignments
                        .iter()
                        .find(|assignment| {
                            assignment.candidate_id == candidate.id
                                && assignment.explanation.slot_id == slot.id
                        })
                        .map(|assignment| assignment.explanation.clone())
                        .unwrap_or_else(|| {
                            explain_selection(candidate, slot, policy, options, true)
                        })
                } else {
                    explain_selection(candidate, slot, policy, options, false)
                };
                evaluations.push(EvaluatedSlot {
                    slot_id: slot.id.clone(),
                    shift_id: slot.shift_id.clone(),
                    shift_title: slot.shift_title.clone(),
                    role: slot.role.clone(),
                    starts_at: slot.starts_at.to_rfc3339(),
                    ends_at: slot.ends_at.to_rfc3339(),
                    eligible: explanation.eligible,
                    selected: is_selected,
                    score: explanation.total_score,
                    checks: explanation.checks.clone(),
                    components: explanation.components.clone(),
                    selection_reason: explanation.selection_reason.clone(),
                });
            }

            let mut eligible_roles: Vec<String> = evaluations
                .iter()
                .filter(|slot| slot.eligible)
                .map(|slot| slot.role.clone())
                .collect();
            eligible_roles.sort();
            eligible_roles.dedup();
            let best_score = evaluations
                .iter()
                .filter(|slot| slot.eligible)
                .filter_map(|slot| slot.score)
                .max();
            // A seat the candidate can actually take is the one whose
            // availability answers the question. Falling back to the first seat
            // would label someone unavailable because of a role they cannot do.
            let availability = evaluations
                .iter()
                .position(|slot| slot.eligible)
                .and_then(|index| ordered_slots.get(index))
                .or_else(|| ordered_slots.first())
                .map(|slot| availability_state(candidate, slot))
                .unwrap_or_else(|| "unknown".into());
            let conflict = evaluations.iter().find_map(|slot| {
                slot.checks
                    .iter()
                    .find(|check| check.name == "No overlapping shift" && !check.passed)
                    .map(|check| check.detail.clone())
            });
            let mut waitlisted: Vec<String> =
                candidate.waitlisted_shift_ids.iter().cloned().collect();
            waitlisted.sort();

            CandidateEvaluation {
                candidate_id: candidate.id.clone(),
                candidate_name: candidate.name.clone(),
                candidate_initials: candidate.initials.clone(),
                eligible_roles,
                best_score,
                availability,
                conflict,
                weekly_shifts: candidate.weekly_load,
                weekly_minutes: candidate.weekly_minutes,
                waitlisted_shift_ids: waitlisted,
                slots: evaluations,
            }
        })
        .collect();

    RosterEvaluation {
        generated_at: String::new(),
        policy_version: policy.version,
        revision: 0,
        plan,
        candidates: rows,
    }
}

#[derive(Debug, Clone)]
struct Edge {
    to: usize,
    rev: usize,
    capacity: i32,
    original_capacity: i32,
    cost: i32,
}

#[derive(Debug, Clone)]
struct Flow {
    graph: Vec<Vec<Edge>>,
}

impl Flow {
    fn new(nodes: usize) -> Self {
        Self {
            graph: vec![Vec::new(); nodes],
        }
    }

    fn add_edge(&mut self, from: usize, to: usize, capacity: i32, cost: i32) {
        let forward = Edge {
            to,
            rev: self.graph[to].len(),
            capacity,
            original_capacity: capacity,
            cost,
        };
        let reverse = Edge {
            to: from,
            rev: self.graph[from].len(),
            capacity: 0,
            original_capacity: 0,
            cost: -cost,
        };
        self.graph[from].push(forward);
        self.graph[to].push(reverse);
    }

    /// SPFA handles the negative edge costs a mandatory-role bonus produces.
    fn min_cost_max_flow(&mut self, source: usize, sink: usize) -> (i32, i32) {
        let nodes = self.graph.len();
        let mut total_flow = 0;
        let mut total_cost: i32 = 0;

        loop {
            let mut distance = vec![i32::MAX; nodes];
            let mut in_queue = vec![false; nodes];
            let mut previous: Vec<Option<(usize, usize)>> = vec![None; nodes];
            let mut queue = VecDeque::new();

            distance[source] = 0;
            queue.push_back(source);
            in_queue[source] = true;

            while let Some(node) = queue.pop_front() {
                in_queue[node] = false;
                let Some(node_distance) = distance.get(node).copied() else {
                    continue;
                };
                if node_distance == i32::MAX {
                    continue;
                }
                for (edge_index, edge) in self.graph[node].iter().enumerate() {
                    if edge.capacity <= 0 {
                        continue;
                    }
                    let next = edge.to;
                    let candidate_distance = node_distance.saturating_add(edge.cost);
                    if candidate_distance < distance[next] {
                        distance[next] = candidate_distance;
                        previous[next] = Some((node, edge_index));
                        if !in_queue[next] {
                            in_queue[next] = true;
                            queue.push_back(next);
                        }
                    }
                }
            }

            if distance[sink] == i32::MAX {
                break;
            }

            let mut node = sink;
            while node != source {
                let (from, edge_index) = previous[node].expect("augmenting path is complete");
                let edge = &self.graph[from][edge_index];
                let reverse_index = edge.rev;
                let capacity = edge.capacity;
                self.graph[from][edge_index].capacity = capacity - 1;
                self.graph[node][reverse_index].capacity += 1;
                node = from;
            }

            total_flow += 1;
            total_cost = total_cost.saturating_add(distance[sink]);
        }

        (total_flow, total_cost)
    }

    fn used_edges(&self, from: usize) -> Vec<usize> {
        self.graph[from]
            .iter()
            .enumerate()
            .filter(|(_, edge)| edge.original_capacity == 1 && edge.capacity == 0)
            .map(|(index, _)| index)
            .collect()
    }
}

fn period_for(starts_at: DateTime<FixedOffset>) -> &'static str {
    let hour = starts_at.hour();
    if hour < 12 {
        "morning"
    } else if hour < 17 {
        "afternoon"
    } else {
        "evening"
    }
}

pub fn day_key(date: NaiveDate) -> String {
    date.format("%a").to_string().to_lowercase()
}

pub fn age_on(birthdate: NaiveDate, on: NaiveDate) -> i64 {
    let mut age = on.year() as i64 - birthdate.year() as i64;
    if (on.month(), on.day()) < (birthdate.month(), birthdate.day()) {
        age -= 1;
    }
    age
}

fn has_skill(candidate: &Candidate, skill: &str) -> bool {
    candidate
        .skills
        .iter()
        .any(|value| value.eq_ignore_ascii_case(skill))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CredentialState {
    Current,
    Expired,
    Missing,
}

fn credential_state(candidate: &Candidate, credential: &str, on: NaiveDate) -> CredentialState {
    let mut expired = false;
    for value in &candidate.credentials {
        if !value.name.eq_ignore_ascii_case(credential) {
            continue;
        }
        if value.valid_through >= on {
            return CredentialState::Current;
        }
        expired = true;
    }
    if expired {
        CredentialState::Expired
    } else {
        CredentialState::Missing
    }
}

fn check(name: &str, passed: bool, detail: String) -> ConstraintCheck {
    ConstraintCheck {
        name: name.to_string(),
        passed,
        detail,
    }
}

fn minutes_between(starts_at: DateTime<FixedOffset>, ends_at: DateTime<FixedOffset>) -> i64 {
    (ends_at - starts_at).num_minutes().max(0)
}

fn block_label(block: &TimeBlock) -> String {
    format!(
        "{} to {}",
        block.starts_at.format("%a %-I:%M %p"),
        block.ends_at.format("%-I:%M %p")
    )
}

/// `committed` is the database's blocks plus this run's, so both passes share it.
fn evaluate(
    candidate: &Candidate,
    slot: &Slot,
    committed: &[TimeBlock],
    load: RunLoad,
    policy: &RosterPolicy,
    options: &RosterOptions,
) -> Evaluation {
    let mut checks = Vec::new();

    let same_shift = candidate.assigned_shift_ids.contains(&slot.shift_id);
    checks.push(check(
        "Already on this shift",
        !same_shift,
        if same_shift {
            "This volunteer is already registered for the shift".into()
        } else {
            "Not registered yet".into()
        },
    ));

    if options.block_conflicts {
        let conflicting = committed
            .iter()
            .find(|block| overlaps(block.starts_at, block.ends_at, slot.starts_at, slot.ends_at));
        checks.push(check(
            "No overlapping shift",
            conflicting.is_none(),
            match conflicting {
                Some(block) => format!("Already booked {}", block_label(block)),
                None => "No shift overlaps this time".into(),
            },
        ));

        let narrow_gap = committed.iter().find(|block| {
            !overlaps(block.starts_at, block.ends_at, slot.starts_at, slot.ends_at)
                && gap_minutes(block, slot) < policy.minimum_gap_minutes
        });

        checks.push(check(
            "Rest between shifts",
            narrow_gap.is_none(),
            match narrow_gap {
                Some(block) => format!(
                    "Only {} minutes after {}",
                    gap_minutes(block, slot),
                    block_label(block)
                ),
                None if policy.minimum_gap_minutes > 0 => {
                    format!(
                        "At least {} minutes either side",
                        policy.minimum_gap_minutes
                    )
                }
                None => "No minimum gap set".into(),
            },
        ));
    }

    // Caps apply even when conflict blocking is off.
    if policy.max_shifts_per_day.is_some() || policy.max_minutes_per_day.is_some() {
        let same_day = committed
            .iter()
            .filter(|block| block.starts_at.date_naive() == slot.starts_at.date_naive())
            .count() as i64;
        let day_limit = policy.max_shifts_per_day();
        checks.push(check(
            "Daily shift limit",
            same_day < day_limit,
            format!(
                "{} of {} that day",
                same_day + 1,
                if day_limit == crate::policy::NO_LIMIT {
                    "unlimited".to_string()
                } else {
                    day_limit.to_string()
                }
            ),
        ));

        let day_minutes: i64 = committed
            .iter()
            .filter(|block| block.starts_at.date_naive() == slot.starts_at.date_naive())
            .map(|block| minutes_between(block.starts_at, block.ends_at))
            .sum();
        let minute_limit = policy.max_minutes_per_day();
        checks.push(check(
            "Daily minute limit",
            day_minutes + minutes_between(slot.starts_at, slot.ends_at) <= minute_limit,
            format!(
                "{} of {} minutes that day",
                day_minutes + minutes_between(slot.starts_at, slot.ends_at),
                if minute_limit == crate::policy::NO_LIMIT {
                    "unlimited".to_string()
                } else {
                    minute_limit.to_string()
                }
            ),
        ));
    }

    // The week cap runs when either the coordinator asked for it or the policy
    // names a number, so a stored limit is never silently ignored.
    if options.cap_weekly
        || policy.max_shifts_per_week.is_some()
        || policy.max_minutes_per_week.is_some()
    {
        let shifts = candidate.weekly_load + load.shifts + 1;
        let limit = policy.max_shifts_per_week();
        checks.push(check(
            "Weekly shift limit",
            shifts <= limit,
            format!(
                "{shifts} of {} this week",
                if limit == crate::policy::NO_LIMIT {
                    "unlimited".to_string()
                } else {
                    limit.to_string()
                }
            ),
        ));

        let minutes =
            candidate.weekly_minutes + load.minutes + minutes_between(slot.starts_at, slot.ends_at);
        let limit = policy.max_minutes_per_week();
        checks.push(check(
            "Weekly minute limit",
            minutes <= limit,
            format!(
                "{minutes} of {} minutes this week",
                if limit == crate::policy::NO_LIMIT {
                    "unlimited".to_string()
                } else {
                    limit.to_string()
                }
            ),
        ));
    }

    let availability_key = format!("{}:{}", slot.day_key, period_for(slot.starts_at));
    if candidate.availability.is_empty() {
        checks.push(check(
            "Availability",
            false,
            "No availability on record".into(),
        ));
    } else {
        let available = candidate.availability.contains(&availability_key);
        checks.push(check(
            "Availability",
            available,
            if available {
                format!(
                    "Available {} {}",
                    slot.day_key.to_uppercase(),
                    period_for(slot.starts_at)
                )
            } else {
                format!(
                    "Not available {} {}",
                    slot.day_key.to_uppercase(),
                    period_for(slot.starts_at)
                )
            },
        ));
    }

    if let Some(required) = &slot.required_skill {
        let matched = has_skill(candidate, required);
        checks.push(check(
            "Required skill",
            matched,
            if matched {
                format!("{required} on the profile")
            } else {
                format!("Needs {required}")
            },
        ));
    }

    if let Some(required) = &slot.required_credential {
        let state = credential_state(candidate, required, slot.starts_at.date_naive());
        let (passed, detail) = match state {
            CredentialState::Current => (true, format!("{required} current")),
            CredentialState::Expired => (false, format!("{required} expired")),
            CredentialState::Missing => (false, format!("No {required} on record")),
        };
        // Only an organization that explicitly allows it may treat a missing or
        // lapsed record as good enough; the default blocks.
        let allowed = state != CredentialState::Current
            && policy.unknown_credential_behavior
                == crate::policy::MissingRequirementBehavior::Allow
            && state != CredentialState::Expired;
        checks.push(check(
            "Required credential",
            passed || allowed,
            if passed {
                detail
            } else if allowed {
                format!("{detail}; the policy allows this")
            } else {
                detail
            },
        ));
    }

    if let Some(minimum_age) = slot.minimum_age {
        let shift_date = slot.starts_at.date_naive();
        let (passed, detail) = match candidate.birthdate {
            Some(birthdate) => {
                let age = age_on(birthdate, shift_date);
                (
                    age >= minimum_age,
                    if age >= minimum_age {
                        format!("{age} on the shift date")
                    } else {
                        format!("{age} on the shift date, needs {minimum_age}")
                    },
                )
            }
            None => (
                policy.unknown_age_behavior == crate::policy::MissingRequirementBehavior::Allow,
                if policy.unknown_age_behavior == crate::policy::MissingRequirementBehavior::Allow {
                    "No birthdate on record; the policy allows this".to_string()
                } else {
                    "No birthdate on record".to_string()
                },
            ),
        };
        checks.push(check("Minimum age", passed, detail));
    }

    let eligible = checks.iter().all(|check| check.passed);
    Evaluation { eligible, checks }
}

fn gap_minutes(block: &TimeBlock, slot: &Slot) -> i64 {
    if block.ends_at <= slot.starts_at {
        (slot.starts_at - block.ends_at).num_minutes()
    } else {
        (block.starts_at - slot.ends_at).num_minutes()
    }
}

pub fn explain_selection(
    candidate: &Candidate,
    slot: &Slot,
    policy: &RosterPolicy,
    options: &RosterOptions,
    selected: bool,
) -> MatchExplanation {
    explain(
        candidate,
        slot,
        &candidate.assigned_blocks,
        RunLoad::default(),
        policy,
        options,
        selected,
    )
}

/// True when every hard requirement for this seat is met, using only what the
/// database already knows about the candidate's commitments.
pub fn is_eligible_explained(
    candidate: &Candidate,
    slot: &Slot,
    policy: &RosterPolicy,
    options: &RosterOptions,
) -> bool {
    evaluate(
        candidate,
        slot,
        &candidate.assigned_blocks,
        RunLoad::default(),
        policy,
        options,
    )
    .eligible
}

/// The verdict alone, with the rejection reason.
fn is_eligible(
    candidate: &Candidate,
    slot: &Slot,
    policy: &RosterPolicy,
    options: &RosterOptions,
) -> Result<(), String> {
    let evaluation = evaluate(
        candidate,
        slot,
        &candidate.assigned_blocks,
        RunLoad::default(),
        policy,
        options,
    );
    if evaluation.eligible {
        Ok(())
    } else {
        Err(evaluation
            .rejection()
            .unwrap_or_else(|| "Not eligible".into()))
    }
}

fn speaks_spanish(candidate: &Candidate) -> bool {
    candidate.languages.iter().any(|value| value == "Spanish") || has_skill(candidate, "Spanish")
}

fn share(weight: i32, numerator: i32, denominator: i32) -> i32 {
    (weight * numerator) / denominator
}

fn score_candidate(
    candidate: &Candidate,
    slot: &Slot,
    policy: &RosterPolicy,
    options: &RosterOptions,
) -> (ScoreBreakdown, Vec<ScoreComponent>) {
    let skill = match &slot.required_skill {
        Some(required) if has_skill(candidate, required) => policy.skill_weight,
        Some(_) => 0,
        // No requirement: a slightly smaller share than a matched skill.
        None => share(policy.skill_weight, 6, 7),
    };
    let availability = AVAILABILITY_POINTS;
    let interested = candidate.causes.iter().any(|cause| cause == &slot.cause);
    let interest = if interested {
        policy.interest_weight
    } else {
        0
    };
    let role_lower = slot.role.to_lowercase();
    let spanish = speaks_spanish(candidate);
    let preference = if role_lower.contains("spanish") && spanish {
        policy.language_weight
    } else if options.prefer_spanish && spanish {
        share(policy.language_weight, 8, 10)
    } else {
        share(policy.language_weight, 6, 10)
    };
    let fairness = share(
        policy.fairness_weight,
        10 - (candidate.weekly_load.min(4) * 2) as i32,
        10,
    );
    let reliability = if candidate.events_completed == 0 {
        share(policy.reliability_weight, 3, 5)
    } else {
        ((candidate.attendance_rate as f64 / 100.0) * policy.reliability_weight as f64).round()
            as i32
    };
    let total =
        (skill + availability + interest + preference + fairness + reliability).clamp(0, MAX_SCORE);
    (
        ScoreBreakdown {
            skill,
            availability,
            interest,
            preference,
            fairness,
            reliability,
            total,
        },
        vec![
            ScoreComponent {
                label: "Skill".into(),
                awarded: skill,
                maximum: policy.skill_weight,
            },
            ScoreComponent {
                label: "Availability".into(),
                awarded: availability,
                maximum: AVAILABILITY_POINTS,
            },
            ScoreComponent {
                label: "Interest".into(),
                awarded: interest,
                maximum: policy.interest_weight,
            },
            ScoreComponent {
                label: "Language".into(),
                awarded: preference,
                maximum: policy.language_weight,
            },
            ScoreComponent {
                label: "Fairness".into(),
                awarded: fairness,
                maximum: policy.fairness_weight,
            },
            ScoreComponent {
                label: "Reliability".into(),
                awarded: reliability,
                maximum: policy.reliability_weight,
            },
        ],
    )
}

/// The sentence a coordinator reads first: why this person, or why not.
fn selection_reason(
    candidate: &Candidate,
    slot: &Slot,
    evaluation: &Evaluation,
    score: Option<&ScoreBreakdown>,
) -> String {
    let Some(failed) = evaluation.checks.iter().find(|check| !check.passed) else {
        let mut parts = Vec::new();
        if let Some(required) = &slot.required_skill {
            if has_skill(candidate, required) {
                parts.push(format!("matches the required {required} skill"));
            }
        } else {
            parts.push("passes every requirement".to_string());
        }
        if candidate.causes.iter().any(|cause| cause == &slot.cause) {
            parts.push(format!("is interested in {}", slot.cause));
        }
        if let Some(score) = score {
            if score.reliability >= 4 {
                parts.push(format!("has {}% attendance", candidate.attendance_rate));
            }
        }
        return format!("{} {}", candidate.name, parts.join(", "));
    };
    format!(
        "{} failed one requirement — {}",
        candidate.name,
        failed.name.to_lowercase() + ": " + &failed.detail
    )
}

/// The full answer for one candidate and one slot.
#[allow(clippy::too_many_arguments)]
fn explain(
    candidate: &Candidate,
    slot: &Slot,
    committed: &[TimeBlock],
    load: RunLoad,
    policy: &RosterPolicy,
    options: &RosterOptions,
    selected: bool,
) -> MatchExplanation {
    let evaluation = evaluate(candidate, slot, committed, load, policy, options);
    let (breakdown, components) = score_candidate(candidate, slot, policy, options);
    let total_score = evaluation.eligible.then_some(breakdown.total);
    MatchExplanation {
        candidate_id: candidate.id.clone(),
        candidate_name: candidate.name.clone(),
        candidate_initials: candidate.initials.clone(),
        slot_id: slot.id.clone(),
        shift_id: slot.shift_id.clone(),
        role: slot.role.clone(),
        eligible: evaluation.eligible,
        checks: evaluation.checks.clone(),
        components,
        total_score,
        selected,
        selection_reason: selection_reason(candidate, slot, &evaluation, Some(&breakdown)),
    }
}

fn reasons(candidate: &Candidate, slot: &Slot, score: &ScoreBreakdown) -> Vec<String> {
    let mut result = Vec::new();
    if let Some(required) = &slot.required_skill {
        if has_skill(candidate, required) {
            result.push(format!("{required} skill matched"));
        }
    } else {
        result.push(format!(
            "{} skill fit",
            candidate
                .skills
                .first()
                .map(String::as_str)
                .unwrap_or("General")
        ));
    }
    result.push(format!(
        "Available {} {}",
        slot.day_key.to_uppercase(),
        period_for(slot.starts_at)
    ));
    if candidate.causes.iter().any(|cause| cause == &slot.cause) {
        result.push(format!("Interested in {}", slot.cause));
    }
    if score.reliability >= 4 {
        result.push(format!("{}% attendance", candidate.attendance_rate));
    }
    result.truncate(3);
    result
}

/// Shared by both passes so either source reports the same explanation.
#[allow(clippy::too_many_arguments)]
fn assignment_for(
    candidate: &Candidate,
    slot: &Slot,
    committed: &[TimeBlock],
    load: RunLoad,
    policy: &RosterPolicy,
    options: &RosterOptions,
    slots: &[&Slot],
) -> PlannedAssignment {
    let (score, _) = score_candidate(candidate, slot, policy, options);
    PlannedAssignment {
        shift_id: slot.shift_id.clone(),
        opportunity_id: slot.opportunity_id.clone(),
        shift_title: slot.shift_title.clone(),
        role: slot.role.clone(),
        candidate_id: candidate.id.clone(),
        candidate_name: candidate.name.clone(),
        candidate_initials: candidate.initials.clone(),
        starts_at: slot.starts_at.to_rfc3339(),
        score: score.total,
        breakdown: score.clone(),
        reasons: reasons(candidate, slot, &score),
        promote_waitlist: candidate.waitlisted_shift_ids.contains(&slot.shift_id),
        eligible_roles: slots
            .iter()
            .filter(|other| other.shift_id == slot.shift_id)
            .filter(|other| is_eligible(candidate, other, policy, options).is_ok())
            .map(|other| other.role.clone())
            .collect(),
        explanation: explain(candidate, slot, committed, load, policy, options, true),
    }
}

/// Fills slots the flow pass left open with same-day candidates who do not
/// overlap a decided booking.
#[allow(clippy::too_many_arguments)]
fn fill_same_day_slots(
    candidates: &[&Candidate],
    slots: &[&Slot],
    policy: &RosterPolicy,
    options: &RosterOptions,
    decided: &HashSet<&str>,
    committed: &mut HashMap<String, Vec<TimeBlock>>,
    assignments: &mut Vec<PlannedAssignment>,
    filled_slots: &mut HashSet<usize>,
) {
    if !options.block_conflicts {
        return;
    }
    let mut pending: Vec<usize> = slots
        .iter()
        .enumerate()
        .filter(|(index, _)| !filled_slots.contains(index))
        .map(|(index, _)| index)
        .collect();
    if pending.is_empty() {
        return;
    }

    let eligible_count = |index: usize| -> usize {
        candidates
            .iter()
            .filter(|candidate| !decided.contains(candidate.id.as_str()))
            .filter(|candidate| {
                let blocks = committed
                    .get(&candidate.id)
                    .map(Vec::as_slice)
                    .unwrap_or_default();
                evaluate(
                    candidate,
                    slots[index],
                    blocks,
                    RunLoad::default(),
                    policy,
                    options,
                )
                .eligible
            })
            .count()
    };
    pending.sort_by(|left, right| {
        let (left_slot, right_slot) = (slots[*left], slots[*right]);
        right_slot
            .mandatory
            .cmp(&left_slot.mandatory)
            .then_with(|| eligible_count(*left).cmp(&eligible_count(*right)))
            .then_with(|| left_slot.starts_at.cmp(&right_slot.starts_at))
            .then_with(|| left_slot.id.cmp(&right_slot.id))
    });

    let mut run_load: HashMap<String, RunLoad> = HashMap::new();
    for assignment in assignments.iter() {
        if let Some(slot) = slots
            .iter()
            .find(|slot| slot.role == assignment.role && slot.shift_id == assignment.shift_id)
        {
            let entry = run_load.entry(assignment.candidate_id.clone()).or_default();
            entry.shifts += 1;
            entry.minutes += minutes_between(slot.starts_at, slot.ends_at);
        }
    }

    for index in pending {
        let slot = slots[index];
        let mut chosen: Option<(&Candidate, i32, RunLoad)> = None;
        for candidate in candidates {
            if decided.contains(candidate.id.as_str()) {
                continue;
            }
            let load = run_load.get(&candidate.id).copied().unwrap_or_default();
            let blocks = committed
                .get(&candidate.id)
                .map(Vec::as_slice)
                .unwrap_or_default();
            if !evaluate(candidate, slot, blocks, load, policy, options).eligible {
                continue;
            }
            let (score, _) = score_candidate(candidate, slot, policy, options);
            // Ordered by id, so the first on a tie wins deterministically.
            let better = match &chosen {
                None => true,
                Some((_, best, _)) => score.total > *best,
            };
            if better {
                chosen = Some((candidate, score.total, load));
            }
        }
        let Some((candidate, _, load)) = chosen else {
            continue;
        };
        filled_slots.insert(index);
        committed
            .entry(candidate.id.clone())
            .or_default()
            .push(TimeBlock {
                starts_at: slot.starts_at,
                ends_at: slot.ends_at,
            });
        let entry = run_load.entry(candidate.id.clone()).or_default();
        entry.shifts += 1;
        entry.minutes += minutes_between(slot.starts_at, slot.ends_at);
        assignments.push(assignment_for(
            candidate,
            slot,
            &committed.get(&candidate.id).cloned().unwrap_or_default(),
            load,
            policy,
            options,
            slots,
        ));
    }
}

/// Fills slots first, then maximizes match quality. Deterministic for equal input.
pub fn plan(
    candidates: &[Candidate],
    slots: &[Slot],
    policy: &RosterPolicy,
    options: &RosterOptions,
) -> RosterPlan {
    plan_inner(candidates, slots, policy, options, &[])
}

/// The plan with these assignments fixed, for "why not that person?" comparisons.
pub fn plan_with_forced(
    candidates: &[Candidate],
    slots: &[Slot],
    policy: &RosterPolicy,
    options: &RosterOptions,
    forced: &[(String, String)],
) -> RosterPlan {
    plan_inner(candidates, slots, policy, options, forced)
}

fn plan_inner(
    candidates: &[Candidate],
    slots: &[Slot],
    policy: &RosterPolicy,
    options: &RosterOptions,
    forced: &[(String, String)],
) -> RosterPlan {
    let forced_slot_for = |candidate_id: &str| -> Option<&Slot> {
        forced
            .iter()
            .find(|(forced_candidate, _)| forced_candidate == candidate_id)
            .and_then(|(_, slot_id)| slots.iter().find(|slot| &slot.id == slot_id))
    };
    let is_forced = |candidate_id: &str, slot: &Slot| -> bool {
        forced.iter().any(|(forced_candidate, forced_slot)| {
            forced_candidate == candidate_id && forced_slot == &slot.id
        })
    };
    // A decided seat is out of the solver's pool entirely, and so is the person
    // already holding it. Otherwise the flow would hand the same seat to a second
    // volunteer, or give the fixed volunteer a second shift, and the plan would
    // no longer describe what the coordinator fixed.
    let forced_slot_ids: HashSet<&str> =
        forced.iter().map(|(_, slot_id)| slot_id.as_str()).collect();
    let forced_candidate_ids: HashSet<&str> = forced
        .iter()
        .map(|(candidate_id, _)| candidate_id.as_str())
        .collect();

    let mut ordered_candidates: Vec<&Candidate> = candidates.iter().collect();
    ordered_candidates.sort_by(|a, b| a.id.cmp(&b.id));

    let mut ordered_slots: Vec<&Slot> = slots.iter().collect();
    ordered_slots.sort_by(|a, b| {
        a.starts_at
            .cmp(&b.starts_at)
            .then_with(|| a.shift_id.cmp(&b.shift_id))
            .then_with(|| a.role.cmp(&b.role))
            .then_with(|| a.id.cmp(&b.id))
    });

    let source = 0;
    let mut nodes = 1;
    let mut day_nodes: BTreeMap<(String, String), usize> = BTreeMap::new();
    for candidate in &ordered_candidates {
        for slot in &ordered_slots {
            day_nodes
                .entry((candidate.id.clone(), slot.day_key.clone()))
                .or_insert_with(|| {
                    let node = nodes;
                    nodes += 1;
                    node
                });
        }
    }
    let slot_offset = nodes;
    nodes += ordered_slots.len();
    let sink = nodes;
    nodes += 1;

    // Forced assignments are decided before the solver runs.
    let mut assignments = Vec::new();
    let mut filled_slots: HashSet<usize> = HashSet::new();
    let mut committed: HashMap<String, Vec<TimeBlock>> = HashMap::new();
    for candidate in &ordered_candidates {
        if candidate.assigned_blocks.is_empty() {
            continue;
        }
        committed
            .entry(candidate.id.clone())
            .or_default()
            .extend(candidate.assigned_blocks.iter().cloned());
    }
    for candidate in &ordered_candidates {
        let Some(slot) = forced_slot_for(&candidate.id) else {
            continue;
        };
        let Some(index) = ordered_slots.iter().position(|other| other.id == slot.id) else {
            continue;
        };
        filled_slots.insert(index);
        committed
            .entry(candidate.id.clone())
            .or_default()
            .push(TimeBlock {
                starts_at: slot.starts_at,
                ends_at: slot.ends_at,
            });
        assignments.push(assignment_for(
            candidate,
            slot,
            &committed.get(&candidate.id).cloned().unwrap_or_default(),
            RunLoad::default(),
            policy,
            options,
            &ordered_slots,
        ));
    }

    let mut flow = Flow::new(nodes);
    for node in day_nodes.values() {
        flow.add_edge(source, *node, 1, 0);
    }

    let mut candidate_by_id: HashMap<&str, &Candidate> = HashMap::new();
    for candidate in &ordered_candidates {
        candidate_by_id.insert(candidate.id.as_str(), candidate);
    }
    for (slot_index, slot) in ordered_slots.iter().enumerate() {
        if forced_slot_ids.contains(slot.id.as_str()) {
            continue;
        }
        let slot_node = slot_offset + slot_index;
        let priority = if slot.mandatory {
            MANDATORY_SLOT_BONUS
        } else {
            0
        };
        flow.add_edge(slot_node, sink, 1, -priority);
        for ((candidate_id, day), node) in &day_nodes {
            if day != &slot.day_key {
                continue;
            }
            if forced_candidate_ids.contains(candidate_id.as_str()) {
                continue;
            }
            let Some(candidate) = candidate_by_id.get(candidate_id.as_str()) else {
                continue;
            };
            if is_forced(&candidate.id, slot) {
                continue;
            }
            if !evaluate(
                candidate,
                slot,
                &committed.get(&candidate.id).cloned().unwrap_or_default(),
                RunLoad::default(),
                policy,
                options,
            )
            .eligible
            {
                continue;
            }
            let (score, _) = score_candidate(candidate, slot, policy, options);
            let tie = (slot_index as i32) % SCORE_UNIT;
            let cost = (MAX_SCORE - score.total) * SCORE_UNIT + tie;
            flow.add_edge(*node, slot_node, 1, cost);
        }
    }

    flow.min_cost_max_flow(source, sink);

    for ((candidate_id, _), node) in &day_nodes {
        let Some(candidate) = candidate_by_id.get(candidate_id.as_str()) else {
            continue;
        };
        for index in flow.used_edges(*node) {
            let edge = &flow.graph[*node][index];
            if edge.to < slot_offset || edge.to >= slot_offset + ordered_slots.len() {
                continue;
            }
            let slot_index = edge.to - slot_offset;
            let slot = ordered_slots[slot_index];
            if is_forced(&candidate.id, slot) {
                continue;
            }
            filled_slots.insert(slot_index);
            assignments.push(assignment_for(
                candidate,
                slot,
                &committed.get(&candidate.id).cloned().unwrap_or_default(),
                RunLoad::default(),
                policy,
                options,
                &ordered_slots,
            ));
            committed
                .entry(candidate.id.clone())
                .or_default()
                .push(TimeBlock {
                    starts_at: slot.starts_at,
                    ends_at: slot.ends_at,
                });
        }
    }

    fill_same_day_slots(
        &ordered_candidates,
        &ordered_slots,
        policy,
        options,
        &forced_candidate_ids,
        &mut committed,
        &mut assignments,
        &mut filled_slots,
    );

    assignments.sort_by(|a, b| {
        a.starts_at
            .cmp(&b.starts_at)
            .then_with(|| a.shift_id.cmp(&b.shift_id))
            .then_with(|| a.role.cmp(&b.role))
            .then_with(|| a.candidate_id.cmp(&b.candidate_id))
    });

    let mut unfilled = Vec::new();
    for (index, slot) in ordered_slots.iter().enumerate() {
        if filled_slots.contains(&index) {
            continue;
        }
        let reason = if ordered_candidates.is_empty() {
            "No candidates supplied".to_string()
        } else if ordered_candidates
            .iter()
            .any(|candidate| is_eligible(candidate, slot, policy, options).is_ok())
        {
            "Eligible candidates were already assigned".to_string()
        } else {
            "No eligible candidate".to_string()
        };
        unfilled.push(UnfilledSlot {
            shift_id: slot.shift_id.clone(),
            role: slot.role.clone(),
            reason,
            required_skill: slot.required_skill.clone(),
            required_credential: slot.required_credential.clone(),
        });
    }
    unfilled.sort_by(|a, b| {
        a.shift_id
            .cmp(&b.shift_id)
            .then_with(|| a.role.cmp(&b.role))
    });

    let total_score = assignments.iter().map(|assignment| assignment.score).sum();
    RosterPlan {
        assignments,
        unfilled,
        total_score,
        slots_considered: ordered_slots.len(),
        candidates_considered: ordered_candidates.len(),
        deterministic_seed: 20_261_013,
        policy_version: policy.version,
        generated_at: String::new(),
        revision: 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn date(value: &str) -> DateTime<FixedOffset> {
        DateTime::parse_from_rfc3339(value).unwrap()
    }

    fn policy() -> RosterPolicy {
        RosterPolicy::default()
    }

    fn options() -> RosterOptions {
        RosterOptions::default()
    }

    fn candidate(id: &str, skills: &[&str], availability: &[&str]) -> Candidate {
        Candidate {
            id: id.into(),
            name: id.into(),
            initials: id.chars().take(2).collect::<String>().to_uppercase(),
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

    fn slot(id: &str, role: &str, skill: Option<&str>, starts_at: &str) -> Slot {
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
            required_skill: skill.map(|value| value.to_string()),
            required_credential: None,
            minimum_age: None,
            mandatory: skill.is_some(),
        }
    }

    #[test]
    fn fills_more_slots_than_a_greedy_first_pick() {
        let candidates = vec![
            candidate("a", &["Spanish"], &["sat:morning"]),
            candidate("b", &["Driver"], &["sat:morning"]),
        ];
        let slots = vec![
            slot(
                "s1",
                "Spanish Support",
                Some("Spanish"),
                "2026-10-17T09:00:00-04:00",
            ),
            slot("s2", "Driver", Some("Driver"), "2026-10-17T09:00:00-04:00"),
        ];
        let plan = plan(&candidates, &slots, &policy(), &options());
        assert_eq!(plan.assignments.len(), 2);
        assert!(plan.total_score >= 180);
        assert!(plan.unfilled.is_empty());
    }

    #[test]
    fn rejects_candidates_without_the_mandatory_skill() {
        let candidates = vec![candidate("a", &["Tutoring"], &["sat:morning"])];
        let slots = vec![slot(
            "s1",
            "Spanish Support",
            Some("Spanish"),
            "2026-10-17T09:00:00-04:00",
        )];
        let plan = plan(&candidates, &slots, &policy(), &options());
        assert!(plan.assignments.is_empty());
        assert_eq!(plan.unfilled.len(), 1);
        assert_eq!(plan.unfilled[0].required_skill.as_deref(), Some("Spanish"));
    }

    #[test]
    fn overlapping_shifts_cannot_share_a_volunteer() {
        let candidates = vec![candidate("a", &["Driver"], &["sat:morning"])];
        let slots = vec![
            slot("s1", "Driver", Some("Driver"), "2026-10-17T09:00:00-04:00"),
            slot("s2", "Driver", Some("Driver"), "2026-10-17T11:00:00-04:00"),
        ];
        let plan = plan(&candidates, &slots, &policy(), &options());
        assert_eq!(plan.assignments.len(), 1);
        assert_eq!(plan.unfilled.len(), 1);
    }

    #[test]
    fn two_shifts_on_one_day_fill_when_they_do_not_overlap() {
        let candidates = vec![candidate(
            "a",
            &["Driver"],
            &["sat:morning", "sat:afternoon"],
        )];
        let slots = vec![
            slot("s1", "Driver", Some("Driver"), "2026-10-17T09:00:00-04:00"),
            slot("s2", "Driver", Some("Driver"), "2026-10-17T14:00:00-04:00"),
        ];
        let plan = plan(&candidates, &slots, &policy(), &options());
        assert_eq!(plan.assignments.len(), 2);
        assert!(plan.unfilled.is_empty());
        assert!(plan
            .assignments
            .iter()
            .all(|assignment| assignment.candidate_id == "a"));
    }

    #[test]
    fn a_shift_that_starts_when_another_ends_is_not_a_conflict() {
        let candidates = vec![candidate(
            "a",
            &["Driver"],
            &["sat:morning", "sat:afternoon"],
        )];
        let slots = vec![
            slot("s1", "Driver", Some("Driver"), "2026-10-17T09:00:00-04:00"),
            slot("s2", "Driver", Some("Driver"), "2026-10-17T12:00:00-04:00"),
        ];
        let plan = plan(&candidates, &slots, &policy(), &options());
        assert_eq!(plan.assignments.len(), 2);
    }

    #[test]
    fn a_committed_shift_only_blocks_the_time_it_covers() {
        let mut busy = candidate("a", &["Driver"], &["sat:morning", "sat:afternoon"]);
        busy.assigned_blocks = vec![TimeBlock {
            starts_at: date("2026-10-17T09:00:00-04:00"),
            ends_at: date("2026-10-17T12:00:00-04:00"),
        }];

        let overlapping = vec![slot(
            "s1",
            "Driver",
            Some("Driver"),
            "2026-10-17T11:00:00-04:00",
        )];
        assert!(plan(
            std::slice::from_ref(&busy),
            &overlapping,
            &policy(),
            &options()
        )
        .assignments
        .is_empty());

        let later = vec![slot(
            "s2",
            "Driver",
            Some("Driver"),
            "2026-10-17T14:00:00-04:00",
        )];
        assert_eq!(
            plan(std::slice::from_ref(&busy), &later, &policy(), &options())
                .assignments
                .len(),
            1
        );
    }

    #[test]
    fn a_role_with_a_minimum_age_rejects_an_unknown_birthdate() {
        let mut unknown = candidate("a", &["Driver"], &["sat:morning"]);
        unknown.birthdate = None;
        let mut restricted = slot("s1", "Driver", Some("Driver"), "2026-10-17T09:00:00-04:00");
        restricted.minimum_age = Some(18);

        let reason = is_eligible(&unknown, &restricted, &policy(), &options()).unwrap_err();
        assert!(reason.contains("Minimum age"), "{reason}");
        assert!(reason.contains("No birthdate on record"), "{reason}");
        let plan = plan(&[unknown], &[restricted], &policy(), &options());
        assert!(plan.assignments.is_empty());
        assert_eq!(plan.unfilled.len(), 1);
    }

    #[test]
    fn the_age_boundary_is_the_shift_date() {
        let shift_date = NaiveDate::from_ymd_opt(2026, 10, 17).unwrap();
        let mut exact = candidate("a", &["Driver"], &["sat:morning"]);
        exact.birthdate = NaiveDate::from_ymd_opt(2008, 10, 17);
        let mut a_day_short = candidate("b", &["Driver"], &["sat:morning"]);
        a_day_short.birthdate = NaiveDate::from_ymd_opt(2008, 10, 18);
        let mut restricted = slot("s1", "Driver", Some("Driver"), "2026-10-17T09:00:00-04:00");
        restricted.minimum_age = Some(18);
        let options = RosterOptions::default();

        assert_eq!(age_on(exact.birthdate.unwrap(), shift_date), 18);
        assert_eq!(age_on(a_day_short.birthdate.unwrap(), shift_date), 17);
        assert!(is_eligible(&exact, &restricted, &policy(), &options).is_ok());
        assert!(is_eligible(&a_day_short, &restricted, &policy(), &options).is_err());
    }

    #[test]
    fn a_leap_day_birthday_ages_on_the_first_of_march() {
        let born = NaiveDate::from_ymd_opt(2008, 2, 29).unwrap();
        assert_eq!(
            age_on(born, NaiveDate::from_ymd_opt(2026, 2, 28).unwrap()),
            17
        );
        assert_eq!(
            age_on(born, NaiveDate::from_ymd_opt(2026, 3, 1).unwrap()),
            18
        );
    }

    #[test]
    fn a_required_credential_must_be_current() {
        let shift_date = NaiveDate::from_ymd_opt(2026, 10, 17).unwrap();
        let mut restricted = slot("s1", "Driver", Some("Driver"), "2026-10-17T09:00:00-04:00");
        restricted.required_credential = Some("Safe driver clearance".into());
        let options = RosterOptions::default();

        let unverified = candidate("a", &["Driver"], &["sat:morning"]);
        let missing = is_eligible(&unverified, &restricted, &policy(), &options).unwrap_err();
        assert!(missing.contains("Required credential"), "{missing}");
        assert!(missing.contains("No Safe driver clearance"), "{missing}");

        let mut expired = candidate("b", &["Driver"], &["sat:morning"]);
        expired.credentials = vec![Credential {
            name: "Safe driver clearance".into(),
            valid_through: shift_date - chrono::Duration::days(1),
        }];
        let lapsed = is_eligible(&expired, &restricted, &policy(), &options).unwrap_err();
        assert!(lapsed.contains("Required credential"), "{lapsed}");
        assert!(lapsed.contains("expired"), "{lapsed}");

        let mut current = candidate("c", &["Driver"], &["sat:morning"]);
        current.credentials = vec![Credential {
            name: "Safe driver clearance".into(),
            valid_through: shift_date,
        }];
        assert!(is_eligible(&current, &restricted, &policy(), &options).is_ok());

        let plan = plan(&[unverified, expired], &[restricted], &policy(), &options);
        assert!(plan.assignments.is_empty());
    }

    #[test]
    fn match_quality_still_decides_between_mandatory_slots() {
        let candidates = vec![candidate("a", &["Spanish"], &["sat:morning"])];
        let mut general = slot("s2", "General", None, "2026-10-17T09:00:00-04:00");
        general.mandatory = true;
        let slots = vec![
            slot(
                "s1",
                "Spanish Support",
                Some("Spanish"),
                "2026-10-17T09:00:00-04:00",
            ),
            general,
        ];
        let plan = plan(&candidates, &slots, &policy(), &options());
        assert_eq!(plan.assignments.len(), 1);
        assert_eq!(plan.assignments[0].role, "Spanish Support");
    }

    #[test]
    fn required_roles_fill_before_optional_roles() {
        let candidates = vec![candidate("a", &["Driver"], &["sat:morning"])];
        let mut optional = slot("s2", "General", None, "2026-10-17T09:00:00-04:00");
        optional.mandatory = false;
        let slots = vec![
            slot("s1", "Driver", Some("Driver"), "2026-10-17T09:00:00-04:00"),
            optional,
        ];
        let plan = plan(&candidates, &slots, &policy(), &options());
        assert_eq!(plan.assignments.len(), 1);
        assert_eq!(plan.assignments[0].role, "Driver");
    }

    struct BruteForce<'a> {
        candidates: &'a [Candidate],
        slots: &'a [Slot],
        options: &'a RosterOptions,
        used_slots: Vec<bool>,
        used_days: HashSet<(String, String)>,
        best: (usize, i32),
    }

    impl BruteForce<'_> {
        fn walk(&mut self, index: usize, count: usize, score: i32) {
            if index == self.candidates.len() {
                if count > self.best.0 || (count == self.best.0 && score > self.best.1) {
                    self.best = (count, score);
                }
                return;
            }
            self.walk(index + 1, count, score);
            let candidate = &self.candidates[index];
            for (slot_index, slot) in self.slots.iter().enumerate() {
                if self.used_slots[slot_index] {
                    continue;
                }
                let day = (candidate.id.clone(), slot.day_key.clone());
                if self.used_days.contains(&day) {
                    continue;
                }
                if is_eligible(candidate, slot, &policy(), self.options).is_err() {
                    continue;
                }
                let points = score_candidate(candidate, slot, &policy(), self.options)
                    .0
                    .total;
                self.used_slots[slot_index] = true;
                self.used_days.insert(day.clone());
                self.walk(index + 1, count + 1, score + points);
                self.used_days.remove(&day);
                self.used_slots[slot_index] = false;
            }
        }
    }

    fn brute_force(
        candidates: &[Candidate],
        slots: &[Slot],
        options: &RosterOptions,
    ) -> (usize, i32) {
        let mut search = BruteForce {
            candidates,
            slots,
            options,
            used_slots: vec![false; slots.len()],
            used_days: HashSet::new(),
            best: (0, 0),
        };
        search.walk(0, 0, 0);
        search.best
    }

    #[test]
    fn matches_the_brute_force_optimum_on_a_known_case() {
        let candidates = vec![
            candidate("a", &["Spanish", "Driver"], &["sat:morning"]),
            candidate("b", &["Spanish"], &["sat:morning"]),
            candidate("c", &["Driver"], &["sat:morning"]),
        ];
        let slots = vec![
            slot(
                "s1",
                "Spanish Support",
                Some("Spanish"),
                "2026-10-17T09:00:00-04:00",
            ),
            slot("s2", "Driver", Some("Driver"), "2026-10-17T13:00:00-04:00"),
            slot("s3", "General", None, "2026-10-17T13:00:00-04:00"),
        ];
        let options = RosterOptions::default();
        let plan = plan(&candidates, &slots, &policy(), &options);
        let oracle = brute_force(&candidates, &slots, &options);
        assert_eq!(plan.assignments.len(), oracle.0);
        assert_eq!(plan.total_score, oracle.1);
    }

    #[test]
    fn plan_is_deterministic_for_identical_inputs() {
        let candidates = vec![
            candidate("b", &["Spanish"], &["sat:morning"]),
            candidate("a", &["Spanish"], &["sat:morning"]),
        ];
        let slots = vec![slot(
            "s1",
            "Spanish Support",
            Some("Spanish"),
            "2026-10-17T09:00:00-04:00",
        )];
        let first = plan(&candidates, &slots, &policy(), &options());
        let second = plan(&candidates, &slots, &policy(), &options());
        assert_eq!(first, second);
        assert_eq!(first.assignments[0].candidate_id, "a");
    }

    fn policy_with(change: impl FnOnce(&mut RosterPolicy)) -> RosterPolicy {
        let mut policy = RosterPolicy::default();
        change(&mut policy);
        policy
    }

    #[test]
    fn a_daily_shift_cap_stops_a_second_shift_on_the_same_day() {
        let candidates = vec![candidate(
            "a",
            &["Driver"],
            &["sat:morning", "sat:afternoon"],
        )];
        let slots = vec![
            slot("s1", "Driver", Some("Driver"), "2026-10-17T09:00:00-04:00"),
            slot("s2", "Driver", Some("Driver"), "2026-10-17T14:00:00-04:00"),
        ];

        let one = policy_with(|policy| policy.max_shifts_per_day = Some(1));
        let capped = plan(&candidates, &slots, &one, &options());
        assert_eq!(capped.assignments.len(), 1);
        assert_eq!(capped.unfilled.len(), 1);

        let two = policy_with(|policy| policy.max_shifts_per_day = Some(2));
        let generous = plan(&candidates, &slots, &two, &options());
        assert_eq!(generous.assignments.len(), 2);
        assert!(generous.unfilled.is_empty());
    }

    #[test]
    fn a_daily_minute_cap_counts_time_rather_than_shifts() {
        let candidates = vec![candidate(
            "a",
            &["Driver"],
            &["sat:morning", "sat:afternoon"],
        )];
        let slots = vec![
            slot("s1", "Driver", Some("Driver"), "2026-10-17T09:00:00-04:00"),
            slot("s2", "Driver", Some("Driver"), "2026-10-17T14:00:00-04:00"),
        ];

        // Two three-hour shifts do not fit inside four hours.
        let four_hours = policy_with(|policy| policy.max_minutes_per_day = Some(240));
        assert_eq!(
            plan(&candidates, &slots, &four_hours, &options())
                .assignments
                .len(),
            1
        );

        let roomy = policy_with(|policy| policy.max_minutes_per_day = Some(960));
        assert_eq!(
            plan(&candidates, &slots, &roomy, &options())
                .assignments
                .len(),
            2
        );
    }

    #[test]
    fn a_weekly_shift_cap_counts_the_shifts_already_committed() {
        let mut loaded = candidate("a", &["Driver"], &["sat:morning"]);
        loaded.weekly_load = 2;
        let mut almost = candidate("b", &["Driver"], &["sat:morning"]);
        almost.weekly_load = 1;

        let slots = vec![slot(
            "s1",
            "Driver",
            Some("Driver"),
            "2026-10-17T09:00:00-04:00",
        )];
        let two = policy_with(|policy| policy.max_shifts_per_week = Some(2));
        let plan = plan(&[loaded, almost], &slots, &two, &options());
        assert_eq!(plan.assignments.len(), 1);
        assert_eq!(plan.assignments[0].candidate_id, "b");
    }

    #[test]
    fn a_weekly_minute_cap_counts_the_minutes_already_committed() {
        let mut loaded = candidate("a", &["Driver"], &["sat:morning"]);
        loaded.weekly_minutes = 540;
        let slots = vec![slot(
            "s1",
            "Driver",
            Some("Driver"),
            "2026-10-17T09:00:00-04:00",
        )];
        let ten_hours = policy_with(|policy| policy.max_minutes_per_week = Some(600));
        assert!(plan(&[loaded], &slots, &ten_hours, &options())
            .assignments
            .is_empty());
    }

    #[test]
    fn a_minimum_gap_keeps_a_shift_from_following_too_closely() {
        let mut rested = candidate("a", &["Driver"], &["sat:morning", "sat:afternoon"]);
        rested.assigned_blocks = vec![TimeBlock {
            starts_at: date("2026-10-17T09:00:00-04:00"),
            ends_at: date("2026-10-17T12:00:00-04:00"),
        }];
        let two_hours = policy_with(|policy| policy.minimum_gap_minutes = 120);

        let soon = vec![slot(
            "s1",
            "Driver",
            Some("Driver"),
            "2026-10-17T13:00:00-04:00",
        )];
        assert!(
            plan(std::slice::from_ref(&rested), &soon, &two_hours, &options())
                .assignments
                .is_empty()
        );

        let later = vec![slot(
            "s2",
            "Driver",
            Some("Driver"),
            "2026-10-17T15:00:00-04:00",
        )];
        assert_eq!(
            plan(
                std::slice::from_ref(&rested),
                &later,
                &two_hours,
                &options()
            )
            .assignments
            .len(),
            1
        );
    }

    #[test]
    fn an_unknown_age_may_be_allowed_by_policy() {
        let mut unknown = candidate("a", &["Driver"], &["sat:morning"]);
        unknown.birthdate = None;
        let mut restricted = slot("s1", "Driver", Some("Driver"), "2026-10-17T09:00:00-04:00");
        restricted.minimum_age = Some(18);

        assert!(is_eligible(&unknown, &restricted, &policy(), &options()).is_err());

        let permissive = policy_with(|policy| {
            policy.unknown_age_behavior = crate::policy::MissingRequirementBehavior::Allow
        });
        assert!(is_eligible(&unknown, &restricted, &permissive, &options()).is_ok());
    }

    #[test]
    fn a_missing_credential_may_be_allowed_by_policy_but_a_lapsed_one_never_is() {
        let mut required = slot("s1", "Driver", Some("Driver"), "2026-10-17T09:00:00-04:00");
        required.required_credential = Some("Safe driver clearance".into());
        let permissive = policy_with(|policy| {
            policy.unknown_credential_behavior = crate::policy::MissingRequirementBehavior::Allow
        });

        let missing = candidate("a", &["Driver"], &["sat:morning"]);
        assert!(is_eligible(&missing, &required, &permissive, &options()).is_ok());

        let mut expired = candidate("b", &["Driver"], &["sat:morning"]);
        expired.credentials = vec![Credential {
            name: "Safe driver clearance".into(),
            valid_through: NaiveDate::from_ymd_opt(2026, 10, 16).unwrap(),
        }];
        assert!(is_eligible(&expired, &required, &permissive, &options()).is_err());
    }

    #[test]
    fn a_plan_names_the_policy_version_it_followed() {
        let policy = policy_with(|policy| policy.version = 9);
        let candidates = vec![candidate("a", &["Driver"], &["sat:morning"])];
        let slots = vec![slot(
            "s1",
            "Driver",
            Some("Driver"),
            "2026-10-17T09:00:00-04:00",
        )];
        let plan = plan(&candidates, &slots, &policy, &options());
        assert_eq!(plan.policy_version, 9);
    }

    #[test]
    fn a_policy_weight_moves_the_score_without_moving_the_rules() {
        let candidates = vec![candidate("a", &["Driver"], &["sat:morning"])];
        let slots = vec![slot(
            "s1",
            "Driver",
            Some("Driver"),
            "2026-10-17T09:00:00-04:00",
        )];

        let shipped = plan(&candidates, &slots, &policy(), &options());
        assert_eq!(shipped.assignments[0].breakdown.skill, 35);

        let lowered = policy_with(|policy| policy.skill_weight = 15);
        let lowered_plan = plan(&candidates, &slots, &lowered, &options());
        assert_eq!(lowered_plan.assignments[0].breakdown.skill, 15);
        assert!(lowered_plan.assignments[0].score < shipped.assignments[0].score);
        assert_eq!(lowered_plan.assignments.len(), 1);
    }

    #[test]
    fn every_assignment_carries_the_checks_and_components_behind_it() {
        let mut required = slot("s1", "Driver", Some("Driver"), "2026-10-17T09:00:00-04:00");
        required.required_credential = Some("Safe driver clearance".into());
        let mut qualified = candidate("a", &["Driver"], &["sat:morning"]);
        qualified.credentials = vec![Credential {
            name: "Safe driver clearance".into(),
            valid_through: NaiveDate::from_ymd_opt(2027, 1, 1).unwrap(),
        }];

        let plan = plan(&[qualified], &[required], &policy(), &options());
        assert_eq!(plan.assignments.len(), 1);
        let explanation = &plan.assignments[0].explanation;
        assert!(explanation.eligible);
        assert!(explanation.selected);
        assert_eq!(explanation.total_score, Some(plan.assignments[0].score));
        assert!(explanation.checks.iter().all(|check| check.passed));
        assert!(explanation
            .checks
            .iter()
            .any(|check| check.name == "Required credential" && check.detail.contains("current")));
        let awarded: i32 = explanation.components.iter().map(|row| row.awarded).sum();
        assert_eq!(awarded, explanation.total_score.unwrap());
        assert!(explanation
            .selection_reason
            .contains("matches the required Driver skill"));
    }

    use proptest::prelude::*;

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(48))]

        #[test]
        fn random_small_cases_match_the_oracle(
            candidate_count in 1usize..=5,
            slot_count in 1usize..=5,
            flags in proptest::collection::vec(0u8..2, 10),
        ) {
            let mut candidates = Vec::new();
            for (index, flag) in flags.iter().take(candidate_count).enumerate() {
                let skill = if *flag == 0 { "Spanish" } else { "Driver" };
                candidates.push(candidate(
                    &format!("c{index}"),
                    &[skill],
                    &["sat:morning"],
                ));
            }
            let mut slots = Vec::new();
            for (index, flag) in flags
                .iter()
                .skip(candidate_count)
                .take(slot_count)
                .enumerate()
            {
                let skill = if *flag == 0 {
                    "Spanish"
                } else {
                    "Driver"
                };
                slots.push(slot(
                    &format!("s{index}"),
                    if skill == "Spanish" { "Spanish Support" } else { "Driver" },
                    Some(skill),
                    "2026-10-17T09:00:00-04:00",
                ));
            }
            let options = RosterOptions::default();
            let plan = plan(&candidates, &slots, &policy(), &options);
            let oracle = brute_force(&candidates, &slots, &options);
            prop_assert_eq!(plan.assignments.len(), oracle.0);
            prop_assert_eq!(plan.total_score, oracle.1);
            prop_assert!(plan
                .assignments
                .iter()
                .enumerate()
                .all(|(index, assignment)| plan.assignments[index + 1..]
                    .iter()
                    .all(|other| other.candidate_id != assignment.candidate_id)));
        }
    }

    #[test]
    fn performance_500_candidates_and_100_slots() {
        let mut candidates = Vec::new();
        for index in 0..500 {
            let mut candidate = candidate(
                &format!("vol-{index:03}"),
                if index % 2 == 0 {
                    &["Spanish"]
                } else {
                    &["Driver"]
                },
                &["sat:morning"],
            );
            candidate.attendance_rate = 80 + (index % 20) as i64;
            candidates.push(candidate);
        }
        let mut slots = Vec::new();
        for index in 0..100 {
            let mut slot = slot(
                &format!("slot-{index:03}"),
                if index % 2 == 0 {
                    "Spanish Support"
                } else {
                    "Driver"
                },
                Some(if index % 2 == 0 { "Spanish" } else { "Driver" }),
                "2026-10-17T09:00:00-04:00",
            );
            slot.shift_id = format!("shift-{}", index / 5);
            slots.push(slot);
        }
        let started = std::time::Instant::now();
        let plan = plan(&candidates, &slots, &policy(), &options());
        let elapsed = started.elapsed();
        assert_eq!(plan.assignments.len(), 100);
        assert!(elapsed.as_secs_f64() < 5.0, "planner took {elapsed:?}");
    }
}
