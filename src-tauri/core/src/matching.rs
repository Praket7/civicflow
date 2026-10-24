//! Deterministic, explainable assignment planning.
//!
//! Eligibility is a hard gate; only eligible candidate/day pairs get a graph
//! edge. Scoring is a separate, named soft objective. The assignment itself is a
//! min-cost max-flow problem:
//!
//! ```text
//! source -> candidate-day (capacity 1) -> role slot (capacity 1) -> sink
//! ```
//!
//! A candidate can serve at most one shift per calendar day, which prevents
//! overlapping assignments without giving up the global optimum for the supplied
//! slots. Edge cost is `MAX_SCORE - score`, so minimum cost is maximum match
//! quality. Required roles receive a large priority bonus so scarce candidates
//! fill mandatory gaps before optional ones.

use std::collections::{BTreeMap, HashMap, HashSet, VecDeque};

use chrono::{DateTime, Datelike, FixedOffset, NaiveDate, Timelike};
use serde::{Deserialize, Serialize};

pub const MAX_SCORE: i32 = 100;

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
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
    pub assigned_days: HashSet<String>,
    pub assigned_shift_ids: HashSet<String>,
    pub waitlisted_shift_ids: HashSet<String>,
    pub weekly_load: i64,
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

    /// Successive shortest augmenting paths with SPFA. The graph is small and
    /// edge costs may be negative because mandatory roles carry a bonus.
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

fn has_credential(candidate: &Candidate, credential: &str, on: NaiveDate) -> bool {
    candidate
        .credentials
        .iter()
        .any(|value| value.name.eq_ignore_ascii_case(credential) && value.valid_through >= on)
}

fn is_eligible(candidate: &Candidate, slot: &Slot, options: &RosterOptions) -> Result<(), String> {
    if candidate.assigned_shift_ids.contains(&slot.shift_id) {
        return Err("Already assigned to this shift".into());
    }
    if options.block_conflicts && candidate.assigned_days.contains(&slot.day_key) {
        return Err("Already assigned to another shift that day".into());
    }
    if options.cap_weekly && candidate.weekly_load >= 2 {
        return Err("Weekly assignment cap reached".into());
    }
    if candidate.availability.is_empty() {
        return Err("No availability on record".into());
    }
    let availability_key = format!("{}:{}", slot.day_key, period_for(slot.starts_at));
    if !candidate.availability.contains(&availability_key) {
        return Err("Not available for this day and time".into());
    }
    if let Some(required) = &slot.required_skill {
        if !has_skill(candidate, required) {
            return Err(format!("Missing required skill: {required}"));
        }
    }
    if let Some(required) = &slot.required_credential {
        if !has_credential(candidate, required, slot.starts_at.date_naive()) {
            return Err(format!("Missing or expired credential: {required}"));
        }
    }
    if let (Some(birthdate), Some(minimum_age)) = (candidate.birthdate, slot.minimum_age) {
        if age_on(birthdate, slot.starts_at.date_naive()) < minimum_age {
            return Err(format!("Must be at least {minimum_age} on the shift date"));
        }
    }
    Ok(())
}

fn score_candidate(candidate: &Candidate, slot: &Slot, options: &RosterOptions) -> ScoreBreakdown {
    let skill = match &slot.required_skill {
        Some(required) if has_skill(candidate, required) => 35,
        Some(_) => 0,
        None => 30,
    };
    let availability = 25;
    let interest = if candidate.causes.iter().any(|cause| cause == &slot.cause) {
        15
    } else {
        0
    };
    let role_lower = slot.role.to_lowercase();
    let preference = if role_lower.contains("spanish")
        && (candidate.languages.iter().any(|value| value == "Spanish")
            || has_skill(candidate, "Spanish"))
    {
        10
    } else if options.prefer_spanish && candidate.languages.iter().any(|value| value == "Spanish") {
        8
    } else {
        6
    };
    let fairness = 10 - (candidate.weekly_load.min(4) * 2) as i32;
    let reliability = if candidate.events_completed == 0 {
        3
    } else {
        ((candidate.attendance_rate as f64 / 100.0) * 5.0).round() as i32
    };
    let total =
        (skill + availability + interest + preference + fairness + reliability).clamp(0, 100);
    ScoreBreakdown {
        skill,
        availability,
        interest,
        preference,
        fairness,
        reliability,
        total,
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

/// Solve the supplied slots for the supplied candidates.
///
/// The returned assignments are deterministic for the same inputs. The solver
/// maximizes the number of filled slots first, then total match quality, while
/// required roles carry a large priority bonus when candidates are scarce.
pub fn plan(candidates: &[Candidate], slots: &[Slot], options: &RosterOptions) -> RosterPlan {
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

    let mut flow = Flow::new(nodes);
    for node in day_nodes.values() {
        flow.add_edge(source, *node, 1, 0);
    }

    let mut candidate_by_id: HashMap<&str, &Candidate> = HashMap::new();
    for candidate in &ordered_candidates {
        candidate_by_id.insert(candidate.id.as_str(), candidate);
    }
    for (slot_index, slot) in ordered_slots.iter().enumerate() {
        let slot_node = slot_offset + slot_index;
        let priority = if slot.mandatory { 20_000 } else { 0 };
        flow.add_edge(slot_node, sink, 1, -priority);
        for ((candidate_id, day), node) in &day_nodes {
            if day != &slot.day_key {
                continue;
            }
            let Some(candidate) = candidate_by_id.get(candidate_id.as_str()) else {
                continue;
            };
            if is_eligible(candidate, slot, options).is_err() {
                continue;
            }
            let score = score_candidate(candidate, slot, options);
            let tie = (slot_index as i32) * 2;
            let cost = (MAX_SCORE - score.total) * 100 + tie - priority;
            flow.add_edge(*node, slot_node, 1, cost);
        }
    }

    flow.min_cost_max_flow(source, sink);

    let mut assignments = Vec::new();
    let mut filled_slots: HashSet<usize> = HashSet::new();
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
            let score = score_candidate(candidate, slot, options);
            filled_slots.insert(slot_index);
            assignments.push(PlannedAssignment {
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
                eligible_roles: ordered_slots
                    .iter()
                    .filter(|other| other.shift_id == slot.shift_id)
                    .filter(|other| is_eligible(candidate, other, options).is_ok())
                    .map(|other| other.role.clone())
                    .collect(),
            });
        }
    }

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
            .any(|candidate| is_eligible(candidate, slot, options).is_ok())
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
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn date(value: &str) -> DateTime<FixedOffset> {
        DateTime::parse_from_rfc3339(value).unwrap()
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
            assigned_days: HashSet::new(),
            assigned_shift_ids: HashSet::new(),
            waitlisted_shift_ids: HashSet::new(),
            weekly_load: 0,
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
        let plan = plan(&candidates, &slots, &RosterOptions::default());
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
        let plan = plan(&candidates, &slots, &RosterOptions::default());
        assert!(plan.assignments.is_empty());
        assert_eq!(plan.unfilled.len(), 1);
        assert_eq!(plan.unfilled[0].required_skill.as_deref(), Some("Spanish"));
    }

    #[test]
    fn one_assignment_per_candidate_day_is_enforced() {
        let candidates = vec![candidate(
            "a",
            &["Driver"],
            &["sat:morning", "sat:afternoon"],
        )];
        let slots = vec![
            slot("s1", "Driver", Some("Driver"), "2026-10-17T09:00:00-04:00"),
            slot("s2", "Driver", Some("Driver"), "2026-10-17T13:00:00-04:00"),
        ];
        let plan = plan(&candidates, &slots, &RosterOptions::default());
        assert_eq!(plan.assignments.len(), 1);
        assert_eq!(plan.unfilled.len(), 1);
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
        let plan = plan(&candidates, &slots, &RosterOptions::default());
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
                if is_eligible(candidate, slot, self.options).is_err() {
                    continue;
                }
                let points = score_candidate(candidate, slot, self.options).total;
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
        let plan = plan(&candidates, &slots, &options);
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
        let first = plan(&candidates, &slots, &RosterOptions::default());
        let second = plan(&candidates, &slots, &RosterOptions::default());
        assert_eq!(first, second);
        assert_eq!(first.assignments[0].candidate_id, "a");
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
            let plan = plan(&candidates, &slots, &options);
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
        let plan = plan(&candidates, &slots, &RosterOptions::default());
        let elapsed = started.elapsed();
        assert_eq!(plan.assignments.len(), 100);
        assert!(elapsed.as_secs_f64() < 5.0, "planner took {elapsed:?}");
    }
}
