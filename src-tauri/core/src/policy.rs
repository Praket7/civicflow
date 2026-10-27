//! The organization's roster policy: the operating rules AutoRoster follows.
//!
//! Hard limits (how much one volunteer may take on, and what an unknown age or
//! credential means) and the soft weights live in one versioned document, because
//! the planner loads them as a unit and every plan records the version it used.
//! Weights are numbers here; the screens offer named levels from
//! `priority_levels`, so a coordinator never edits an optimizer constant.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::auth::Account;
use crate::error::{CoreError, Result};
use crate::matching::MAX_SCORE;
use crate::workflows::append_actor_audit;

/// What a role requirement means when the volunteer's record cannot confirm it.
/// Blocking is the default: a safety requirement is not satisfied by silence.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum MissingRequirementBehavior {
    Block,
    Allow,
}

impl MissingRequirementBehavior {
    fn as_str(self) -> &'static str {
        match self {
            Self::Block => "block",
            Self::Allow => "allow",
        }
    }
}

/// A named level a coordinator picks, and the weight it becomes. Defined here so
/// the mapping is one table rather than a number repeated in the interface.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PriorityLevel {
    pub key: String,
    pub weight: i32,
}

pub const PRIORITY_LEVELS: [(&str, i32); 5] = [
    ("none", 0),
    ("low", 5),
    ("medium", 10),
    ("high", 15),
    ("top", 35),
];

pub fn priority_levels() -> Vec<PriorityLevel> {
    PRIORITY_LEVELS
        .iter()
        .map(|(key, weight)| PriorityLevel {
            key: (*key).to_string(),
            weight: *weight,
        })
        .collect()
}

/// Higher than any achievable total, so "no limit" is a single representation
/// rather than an `Option` threaded through the checks.
pub const NO_LIMIT: i64 = i64::MAX;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RosterPolicy {
    /// Increments with every accepted change, so a plan can name the rules it used.
    pub version: i64,
    pub max_shifts_per_day: Option<i64>,
    pub max_minutes_per_day: Option<i64>,
    pub max_shifts_per_week: Option<i64>,
    pub max_minutes_per_week: Option<i64>,
    pub minimum_gap_minutes: i64,
    pub unknown_age_behavior: MissingRequirementBehavior,
    pub unknown_credential_behavior: MissingRequirementBehavior,
    pub skill_weight: i32,
    pub interest_weight: i32,
    pub language_weight: i32,
    pub fairness_weight: i32,
    pub reliability_weight: i32,
    pub waitlist_preference: bool,
}

impl Default for RosterPolicy {
    /// The shipped behavior: no cap of its own on any of the four limits, no
    /// required rest between shifts, unknown age and credential block, and the
    /// weights the scoring table documents. Leaving the limits unset keeps the
    /// planner's behavior identical to the engine before this policy existed —
    /// time conflicts, not a count, are what stop a second shift on one day — so
    /// an organization opts in to a cap rather than discovering one.
    fn default() -> Self {
        Self {
            version: 1,
            max_shifts_per_day: None,
            max_minutes_per_day: None,
            max_shifts_per_week: None,
            max_minutes_per_week: None,
            minimum_gap_minutes: 0,
            unknown_age_behavior: MissingRequirementBehavior::Block,
            unknown_credential_behavior: MissingRequirementBehavior::Block,
            skill_weight: 35,
            interest_weight: 15,
            language_weight: 10,
            fairness_weight: 10,
            reliability_weight: 5,
            waitlist_preference: false,
        }
    }
}

impl RosterPolicy {
    pub fn max_shifts_per_day(&self) -> i64 {
        self.max_shifts_per_day.unwrap_or(NO_LIMIT).max(1)
    }

    pub fn max_minutes_per_day(&self) -> i64 {
        self.max_minutes_per_day.unwrap_or(NO_LIMIT).max(1)
    }

    pub fn max_shifts_per_week(&self) -> i64 {
        self.max_shifts_per_week.unwrap_or(NO_LIMIT).max(1)
    }

    pub fn max_minutes_per_week(&self) -> i64 {
        self.max_minutes_per_week.unwrap_or(NO_LIMIT).max(1)
    }

    /// Rejects values a coordinator could not have meant. Called on every write,
    /// so a stored policy is always one the planner can follow.
    pub fn validate(&self) -> Result<()> {
        let limits = [
            ("maxShiftsPerDay", self.max_shifts_per_day, 1, 12),
            ("maxShiftsPerWeek", self.max_shifts_per_week, 1, 40),
            ("maxMinutesPerDay", self.max_minutes_per_day, 15, 1_440),
            ("maxMinutesPerWeek", self.max_minutes_per_week, 60, 10_080),
        ];
        for (field, value, low, high) in limits {
            if let Some(value) = value {
                if value < low || value > high {
                    return Err(CoreError::rule(
                        "POLICY_OUT_OF_RANGE",
                        format!("Keep that limit between {low} and {high}."),
                        Some(field.into()),
                        None,
                    ));
                }
            }
        }
        if self.minimum_gap_minutes < 0 || self.minimum_gap_minutes > 1_440 {
            return Err(CoreError::rule(
                "POLICY_OUT_OF_RANGE",
                "Keep the minimum time between shifts under 24 hours.",
                Some("minimumGapMinutes".into()),
                None,
            ));
        }
        let weights = [
            ("skillWeight", self.skill_weight),
            ("interestWeight", self.interest_weight),
            ("languageWeight", self.language_weight),
            ("fairnessWeight", self.fairness_weight),
            ("reliabilityWeight", self.reliability_weight),
        ];
        for (field, weight) in weights {
            let known = PRIORITY_LEVELS.iter().any(|(_, value)| *value == weight);
            if !known {
                return Err(CoreError::rule(
                    "POLICY_OUT_OF_RANGE",
                    "Choose one of the offered match priorities.",
                    Some(field.into()),
                    None,
                ));
            }
        }
        if self.total_weight() > MAX_SCORE {
            return Err(CoreError::rule(
                "POLICY_OUT_OF_RANGE",
                "Those priorities add up past a perfect match. Lower one of them.",
                None,
                None,
            ));
        }
        Ok(())
    }

    pub fn total_weight(&self) -> i32 {
        self.skill_weight
            + self.interest_weight
            + self.language_weight
            + self.fairness_weight
            + self.reliability_weight
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredPolicy {
    #[serde(flatten)]
    policy: RosterPolicy,
}

/// The policy in force for an organization: the highest version on record, or the
/// defaults when a coordinator has never changed anything.
pub fn current_policy(conn: &Connection, organization_id: &str) -> Result<RosterPolicy> {
    let stored: Option<String> = conn
        .query_row(
            "SELECT policy_json FROM organization_roster_policies
             WHERE organization_id = ?1
             ORDER BY version DESC LIMIT 1",
            params![organization_id],
            |row| row.get(0),
        )
        .optional()?;
    let Some(stored) = stored else {
        return Ok(RosterPolicy::default());
    };
    let parsed: StoredPolicy = serde_json::from_str(&stored)?;
    Ok(parsed.policy)
}

/// Appends a new version. History is kept because a plan names the version it
/// used, and a coordinator may reasonably ask what changed.
pub fn save_policy(
    conn: &Connection,
    actor: &Account,
    organization_id: &str,
    policy: &RosterPolicy,
) -> Result<RosterPolicy> {
    policy.validate()?;
    let current = current_policy(conn, organization_id)?;
    let version = current.version.max(policy.version) + 1;
    let next = RosterPolicy {
        version,
        ..policy.clone()
    };
    let json = serde_json::to_string(&next)?;
    let now = crate::services::demo_now(conn)?.to_rfc3339();
    let transaction = conn.unchecked_transaction()?;
    transaction.execute(
        "INSERT INTO organization_roster_policies
         (organization_id, version, policy_json, updated_at, updated_by)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![organization_id, version, json, now, actor.id],
    )?;
    append_actor_audit(
        &transaction,
        "coordinator",
        &actor.id,
        "policy.updated",
        "organization",
        organization_id,
        format!("Matching policy updated to version {version}"),
        Some(describe(&next)),
    )?;
    transaction.commit()?;
    Ok(next)
}

/// A one-line summary for the audit trail, so a later reader does not have to
/// diff two JSON documents to see what changed.
pub fn describe(policy: &RosterPolicy) -> String {
    let daily = match policy.max_shifts_per_day {
        Some(limit) => format!("{limit}/day"),
        None => "no daily limit".to_string(),
    };
    let weekly = match policy.max_shifts_per_week {
        Some(limit) => format!("{limit}/week"),
        None => "no weekly limit".to_string(),
    };
    format!(
        "shifts {daily}, {weekly}, gap {} min, unknown age {}, unknown credential {}",
        policy.minimum_gap_minutes,
        policy.unknown_age_behavior.as_str(),
        policy.unknown_credential_behavior.as_str()
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_default_policy_reproduces_the_documented_weights() {
        let policy = RosterPolicy::default();
        assert_eq!(policy.skill_weight, 35);
        assert_eq!(policy.interest_weight, 15);
        assert_eq!(policy.language_weight, 10);
        assert_eq!(policy.fairness_weight, 10);
        assert_eq!(policy.reliability_weight, 5);
        assert_eq!(policy.total_weight(), 75);
        assert!(policy.validate().is_ok());
    }

    #[test]
    fn a_weight_that_is_not_an_offered_priority_is_refused() {
        let policy = RosterPolicy {
            skill_weight: 33,
            ..RosterPolicy::default()
        };
        assert_eq!(
            rule_code(policy.validate().unwrap_err()),
            "POLICY_OUT_OF_RANGE"
        );
    }

    #[test]
    fn priorities_may_not_add_up_past_a_perfect_match() {
        let policy = RosterPolicy {
            skill_weight: 35,
            interest_weight: 35,
            language_weight: 35,
            fairness_weight: 15,
            reliability_weight: 15,
            ..RosterPolicy::default()
        };
        assert_eq!(
            rule_code(policy.validate().unwrap_err()),
            "POLICY_OUT_OF_RANGE"
        );
    }

    #[test]
    fn a_limit_outside_its_range_is_refused() {
        let policy = RosterPolicy {
            max_shifts_per_day: Some(50),
            ..RosterPolicy::default()
        };
        assert_eq!(
            rule_code(policy.validate().unwrap_err()),
            "POLICY_OUT_OF_RANGE"
        );

        let policy = RosterPolicy {
            minimum_gap_minutes: -30,
            ..RosterPolicy::default()
        };
        assert_eq!(
            rule_code(policy.validate().unwrap_err()),
            "POLICY_OUT_OF_RANGE"
        );
    }

    #[test]
    fn a_limit_of_none_means_no_limit() {
        let policy = RosterPolicy {
            max_shifts_per_day: None,
            max_minutes_per_day: None,
            max_shifts_per_week: None,
            max_minutes_per_week: None,
            ..RosterPolicy::default()
        };
        assert_eq!(policy.max_shifts_per_day(), NO_LIMIT);
        assert_eq!(policy.max_minutes_per_week(), NO_LIMIT);
    }

    fn rule_code(error: CoreError) -> String {
        match error {
            CoreError::Rule { code, .. } => code,
            other => panic!("expected a rule error, got {other:?}"),
        }
    }
}
