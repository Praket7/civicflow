//! Database adapter for the pure matching engine.

use std::collections::{HashMap, HashSet};

use chrono::{DateTime, FixedOffset, NaiveDate};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Deserialize;

use crate::clock::now as clock_now;
use crate::error::{CoreError, Result};
use crate::matching::{
    day_key, plan, Candidate, Credential, RosterOptions, RosterPlan, Slot, TimeBlock,
};
use crate::models::WorkspaceSnapshot;
use crate::workflows::{append_audit, snapshot, validate_registration};

fn parse_date(raw: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(raw.get(..10).unwrap_or(raw), "%Y-%m-%d").ok()
}

fn parse_datetime(raw: &str) -> Option<DateTime<FixedOffset>> {
    DateTime::parse_from_rfc3339(raw).ok()
}

/// One role on one shift, with how many of its seats are still open. Recovery
/// needs the role itself — the seat a move would vacate — while AutoRoster only
/// ever wants the open seats, so both read this one query.
pub(crate) struct RoleRow {
    pub slot: Slot,
    pub open: i64,
}

/// One registration in force, with the coordinator's lock on it.
#[derive(Debug, Clone)]
pub(crate) struct Assignment {
    pub shift_id: String,
    pub volunteer_id: String,
    pub role: String,
    pub locked: bool,
}

/// Volunteers who took themselves out of these shifts. Recovery does not offer a
/// seat back to somebody who has just canceled or not turned up: they are not
/// available, and re-adding them would only produce another gap.
pub(crate) fn declined_on(conn: &Connection, shift_ids: &[String]) -> Result<HashSet<String>> {
    let mut statement = conn.prepare(
        "SELECT DISTINCT volunteer_id, shift_id FROM registrations
         WHERE status IN ('canceled', 'no_show')",
    )?;
    let mut rows = statement.query([])?;
    let mut declined = HashSet::new();
    while let Some(row) = rows.next()? {
        let shift_id: String = row.get(1)?;
        if shift_ids.contains(&shift_id) {
            declined.insert(row.get::<_, String>(0)?);
        }
    }
    Ok(declined)
}

pub(crate) fn current_assignments(conn: &Connection) -> Result<Vec<Assignment>> {
    let mut statement = conn.prepare(
        "SELECT shift_id, volunteer_id, role, locked FROM registrations
         WHERE status = 'registered'
         ORDER BY shift_id, volunteer_id",
    )?;
    let mut rows = statement.query([])?;
    let mut assignments = Vec::new();
    while let Some(row) = rows.next()? {
        assignments.push(Assignment {
            shift_id: row.get(0)?,
            volunteer_id: row.get(1)?,
            role: row.get(2)?,
            locked: row.get::<_, i64>(3)? == 1,
        });
    }
    Ok(assignments)
}

pub(crate) fn load_role_rows(
    conn: &Connection,
    shift_ids: &[String],
    now: DateTime<FixedOffset>,
) -> Result<Vec<RoleRow>> {
    let mut statement = conn.prepare(
        "SELECT s.id, s.opportunity_id, o.title, o.cause, s.starts_at, s.ends_at,
                sr.name, sr.required, sr.filled,
                rr.skill, ct.name, rr.minimum_age
         FROM shifts s
         JOIN opportunities o ON o.id = s.opportunity_id
         JOIN shift_roles sr ON sr.shift_id = s.id
         LEFT JOIN role_requirements rr
                ON rr.shift_id = s.id AND rr.role_name = sr.name
         LEFT JOIN credential_types ct ON ct.id = rr.credential_type_id
         WHERE s.status = 'scheduled'
         ORDER BY s.starts_at, s.id, sr.rowid",
    )?;
    let mut rows = statement.query([])?;
    let mut roles = Vec::new();
    while let Some(row) = rows.next()? {
        let shift_id: String = row.get(0)?;
        if !shift_ids.is_empty() && !shift_ids.contains(&shift_id) {
            continue;
        }
        let starts_raw: String = row.get(4)?;
        let Some(starts_at) = parse_datetime(&starts_raw) else {
            continue;
        };
        if starts_at <= now {
            continue;
        }
        let ends_at = row
            .get::<_, String>(5)
            .ok()
            .and_then(|raw| parse_datetime(&raw))
            .unwrap_or(starts_at + chrono::Duration::hours(3));
        let required: i64 = row.get(7)?;
        let filled: i64 = row.get(8)?;
        let open = (required - filled).max(0);
        let role: String = row.get(6)?;
        let skill: Option<String> = row.get(9)?;
        let credential: Option<String> = row.get(10)?;
        roles.push(RoleRow {
            slot: Slot {
                id: format!("{}-{}", shift_id, role),
                shift_id: shift_id.clone(),
                opportunity_id: row.get(1)?,
                shift_title: row.get(2)?,
                role: role.clone(),
                cause: row.get(3)?,
                day_key: day_key(starts_at.date_naive()),
                starts_at,
                ends_at,
                mandatory: skill.is_some() || credential.is_some(),
                required_skill: skill,
                required_credential: credential,
                minimum_age: row.get(11)?,
            },
            open,
        });
    }
    Ok(roles)
}

/// The open required seats, one entry per seat rather than per role.
pub(crate) fn load_open_slots(
    conn: &Connection,
    shift_ids: &[String],
    now: DateTime<FixedOffset>,
) -> Result<Vec<Slot>> {
    let mut slots = Vec::new();
    for row in load_role_rows(conn, shift_ids, now)? {
        for index in 1..=row.open {
            slots.push(Slot {
                id: format!("{}-{}", row.slot.id, index),
                ..row.slot.clone()
            });
        }
    }
    Ok(slots)
}

/// The seat one role holds, whether or not it is filled. A recovery move needs
/// the seat it vacates, which is by definition not open.
pub(crate) fn find_role_slot(
    conn: &Connection,
    shift_id: &str,
    role: &str,
    now: DateTime<FixedOffset>,
) -> Result<Option<Slot>> {
    Ok(load_role_rows(conn, &[shift_id.to_string()], now)?
        .into_iter()
        .find(|row| row.slot.role == role)
        .map(|row| row.slot))
}

pub(crate) fn load_candidates(
    conn: &Connection,
    now: DateTime<FixedOffset>,
    options: &RosterOptions,
) -> Result<Vec<Candidate>> {
    let mut skills: HashMap<String, Vec<String>> = HashMap::new();
    {
        let mut statement =
            conn.prepare("SELECT volunteer_id, skill FROM volunteer_skills ORDER BY rowid")?;
        let mut rows = statement.query([])?;
        while let Some(row) = rows.next()? {
            skills.entry(row.get(0)?).or_default().push(row.get(1)?);
        }
    }

    let mut availability: HashMap<String, HashSet<String>> = HashMap::new();
    {
        let mut statement =
            conn.prepare("SELECT volunteer_id, day, period FROM availability_rules")?;
        let mut rows = statement.query([])?;
        while let Some(row) = rows.next()? {
            let volunteer: String = row.get(0)?;
            let day: String = row.get(1)?;
            let period: String = row.get(2)?;
            availability
                .entry(volunteer)
                .or_default()
                .insert(format!("{day}:{period}"));
        }
    }

    let mut credentials: HashMap<String, Vec<Credential>> = HashMap::new();
    {
        let mut statement = conn.prepare(
            "SELECT vc.volunteer_id, ct.name, vc.valid_through
             FROM volunteer_credentials vc
             JOIN credential_types ct ON ct.id = vc.credential_type_id",
        )?;
        let mut rows = statement.query([])?;
        while let Some(row) = rows.next()? {
            let volunteer: String = row.get(0)?;
            let name: String = row.get(1)?;
            let raw: String = row.get(2)?;
            if let Some(valid_through) = parse_date(&raw) {
                credentials.entry(volunteer).or_default().push(Credential {
                    name,
                    valid_through,
                });
            }
        }
    }

    // Committed time, not committed days: a volunteer booked from 9am to noon
    // is still free at 2pm, and only an overlapping shift is a conflict.
    let mut assigned_blocks: HashMap<String, Vec<TimeBlock>> = HashMap::new();
    let mut assigned_shifts: HashMap<String, HashSet<String>> = HashMap::new();
    let mut weekly_load: HashMap<String, i64> = HashMap::new();
    let mut weekly_minutes: HashMap<String, i64> = HashMap::new();
    {
        let mut statement = conn.prepare(
            "SELECT r.volunteer_id, r.shift_id, s.starts_at, s.ends_at
             FROM registrations r
             JOIN shifts s ON s.id = r.shift_id
             WHERE r.status = 'registered'",
        )?;
        let mut rows = statement.query([])?;
        while let Some(row) = rows.next()? {
            let volunteer: String = row.get(0)?;
            let shift: String = row.get(1)?;
            let (Some(starts), Some(ends)) = (
                parse_datetime(&row.get::<_, String>(2)?),
                parse_datetime(&row.get::<_, String>(3)?),
            ) else {
                continue;
            };
            assigned_shifts
                .entry(volunteer.clone())
                .or_default()
                .insert(shift);
            assigned_blocks
                .entry(volunteer.clone())
                .or_default()
                .push(TimeBlock {
                    starts_at: starts,
                    ends_at: ends,
                });
            if starts >= now && starts <= now + chrono::Duration::days(7) {
                *weekly_load.entry(volunteer.clone()).or_insert(0) += 1;
                *weekly_minutes.entry(volunteer).or_insert(0) +=
                    (ends - starts).num_minutes().max(0);
            }
        }
    }

    let mut waitlisted: HashMap<String, HashSet<String>> = HashMap::new();
    {
        let mut statement = conn.prepare(
            "SELECT volunteer_id, shift_id FROM waitlist_entries WHERE status = 'waiting'",
        )?;
        let mut rows = statement.query([])?;
        while let Some(row) = rows.next()? {
            waitlisted
                .entry(row.get(0)?)
                .or_default()
                .insert(row.get(1)?);
        }
    }

    let mut statement = conn.prepare(
        "SELECT id, name, initials, status, birthdate, attendance_rate, events_completed,
                languages_json, causes_json, availability_json
         FROM volunteers ORDER BY id",
    )?;
    let mut rows = statement.query([])?;
    let mut candidates = Vec::new();
    while let Some(row) = rows.next()? {
        let status: String = row.get(3)?;
        if status != "active" {
            continue;
        }
        let id: String = row.get(0)?;
        let waitlist = waitlisted.remove(&id).unwrap_or_default();
        if !options.include_waitlist && !waitlist.is_empty() {
            continue;
        }
        let birthdate = row
            .get::<_, Option<String>>(4)?
            .and_then(|raw| parse_date(&raw));
        let languages: Vec<String> = serde_json::from_str(&row.get::<_, String>(7)?)?;
        let causes: Vec<String> = serde_json::from_str(&row.get::<_, String>(8)?)?;
        let mut available = availability.remove(&id).unwrap_or_default();
        if available.is_empty() {
            if let Ok(raw) = row.get::<_, String>(9) {
                if let Ok(slots) = serde_json::from_str::<Vec<String>>(&raw) {
                    available.extend(slots);
                }
            }
        }
        candidates.push(Candidate {
            name: row.get(1)?,
            initials: row.get(2)?,
            skills: skills.remove(&id).unwrap_or_default(),
            languages,
            causes,
            availability: available,
            birthdate,
            attendance_rate: row.get(5)?,
            events_completed: row.get(6)?,
            credentials: credentials.remove(&id).unwrap_or_default(),
            assigned_blocks: assigned_blocks.remove(&id).unwrap_or_default(),
            assigned_shift_ids: assigned_shifts.remove(&id).unwrap_or_default(),
            waitlisted_shift_ids: waitlist,
            weekly_load: weekly_load.remove(&id).unwrap_or(0),
            weekly_minutes: weekly_minutes.remove(&id).unwrap_or(0),
            id,
        });
    }
    Ok(candidates)
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RosterApplyAssignment {
    pub candidate_id: String,
    pub role: String,
    #[serde(default)]
    pub promote_waitlist: bool,
}

/// One assignment in a weekly plan, which may span several shifts.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeeklyAssignment {
    pub shift_id: String,
    pub candidate_id: String,
    pub role: String,
    #[serde(default)]
    pub promote_waitlist: bool,
}

/// The workspace revision a plan was generated from. Every roster-changing
/// write bumps it, so a stale plan is detected before anything is applied.
pub fn workspace_revision(conn: &Connection) -> Result<i64> {
    Ok(conn
        .query_row(
            "SELECT revision FROM workspace_revision WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .optional()?
        .unwrap_or(0))
}

/// Applies an approved AutoRoster plan in one transaction so a partially
/// applied roster can never reach the database.
pub fn apply_roster_plan(
    conn: &Connection,
    shift_id: &str,
    assignments: &[RosterApplyAssignment],
) -> Result<WorkspaceSnapshot> {
    let weekly: Vec<WeeklyAssignment> = assignments
        .iter()
        .map(|assignment| WeeklyAssignment {
            shift_id: shift_id.to_string(),
            candidate_id: assignment.candidate_id.clone(),
            role: assignment.role.clone(),
            promote_waitlist: assignment.promote_waitlist,
        })
        .collect();
    apply_roster_week(conn, None, &weekly)
}

/// Applies a whole reviewed week atomically. Every hard invariant is re-checked
/// against the database first, then all assignments commit together: a plan
/// cannot half-apply because one seat filled while the coordinator was reading.
pub fn apply_roster_week(
    conn: &Connection,
    expected_revision: Option<i64>,
    assignments: &[WeeklyAssignment],
) -> Result<WorkspaceSnapshot> {
    if assignments.is_empty() {
        return Err(CoreError::Validation(
            "Select at least one suggested assignment to apply".into(),
        ));
    }
    if let Some(expected) = expected_revision {
        let current = workspace_revision(conn)?;
        if current != expected {
            return Err(CoreError::rule(
                "PLAN_STALE",
                "The roster changed after this plan was generated. Rebuild the plan so nobody is double-booked.",
                None,
                Some("REBUILD_PLAN".into()),
            ));
        }
    }

    // Group by shift so capacity, role counts and duplicate people are checked
    // against the shift they actually belong to.
    let mut per_shift: HashMap<&str, Vec<&WeeklyAssignment>> = HashMap::new();
    for assignment in assignments {
        per_shift
            .entry(assignment.shift_id.as_str())
            .or_default()
            .push(assignment);
    }

    let mut names: HashMap<String, String> = HashMap::new();
    for (shift_id, rows) in &per_shift {
        let (status, capacity, confirmed): (String, i64, i64) = conn.query_row(
            "SELECT status, capacity, confirmed FROM shifts WHERE id = ?1",
            params![shift_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )?;
        if status != "scheduled" {
            return Err(CoreError::rule(
                "SHIFT_CLOSED",
                "A shift in this plan is no longer accepting assignments.",
                Some("shiftId".into()),
                Some("REBUILD_PLAN".into()),
            ));
        }
        if confirmed + rows.len() as i64 > capacity {
            return Err(CoreError::rule(
                "SHIFT_FULL",
                "A shift in this plan filled while you were reviewing it.",
                Some("shiftId".into()),
                Some("REBUILD_PLAN".into()),
            ));
        }

        let mut seen = HashSet::new();
        let mut per_role: HashMap<&str, i64> = HashMap::new();
        for assignment in rows {
            if !seen.insert(assignment.candidate_id.clone()) {
                return Err(CoreError::Validation(
                    "A volunteer appears twice in the same shift".into(),
                ));
            }
            *per_role.entry(assignment.role.as_str()).or_insert(0) += 1;
        }
        for (role, count) in &per_role {
            let row: Option<(i64, i64)> = conn
                .query_row(
                    "SELECT required, filled FROM shift_roles WHERE shift_id = ?1 AND name = ?2",
                    params![shift_id, role],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .optional()?;
            let Some((required, filled)) = row else {
                return Err(CoreError::Validation(format!(
                    "{role} is not part of this shift"
                )));
            };
            if filled + count > required {
                return Err(CoreError::rule(
                    "ROLE_FULL",
                    format!("The plan assigns more {role} volunteers than the shift needs."),
                    Some("role".into()),
                    Some("REBUILD_PLAN".into()),
                ));
            }
        }

        for assignment in rows {
            validate_registration(conn, shift_id, &assignment.candidate_id, &assignment.role)?;
            // A lock is a coordinator's decision, so a plan may not quietly move
            // the seat it protects. Filling an open seat is still allowed.
            let locked: Option<String> = conn
                .query_row(
                    "SELECT role FROM registrations
                     WHERE shift_id = ?1 AND volunteer_id = ?2 AND locked = 1",
                    params![shift_id, assignment.candidate_id],
                    |row| row.get(0),
                )
                .optional()?;
            if let Some(role) = locked {
                if role != assignment.role {
                    return Err(CoreError::rule(
                        "ASSIGNMENT_LOCKED",
                        format!(
                            "That volunteer's seat is locked as {role}. Unlock it before replanning."
                        ),
                        Some("role".into()),
                        Some("REBUILD_PLAN".into()),
                    ));
                }
            }
            let name: String = conn.query_row(
                "SELECT name FROM volunteers WHERE id = ?1",
                params![assignment.candidate_id],
                |row| row.get(0),
            )?;
            names.insert(assignment.candidate_id.clone(), name);
        }
    }

    let now = crate::clock::now(conn)?.to_rfc3339();
    let transaction = conn.unchecked_transaction()?;
    for assignment in assignments {
        let name = &names[&assignment.candidate_id];
        if assignment.promote_waitlist {
            transaction.execute(
                "UPDATE waitlist_entries SET status = 'promoted'
                 WHERE shift_id = ?1 AND volunteer_id = ?2 AND status = 'waiting'",
                params![assignment.shift_id, assignment.candidate_id],
            )?;
        }
        transaction.execute(
            "INSERT INTO registrations (shift_id, volunteer_id, role, created_at, status, updated_at)
             VALUES (?1, ?2, ?3, ?4, 'registered', ?4)
             ON CONFLICT(shift_id, volunteer_id) DO UPDATE SET
               role = excluded.role, status = 'registered', updated_at = excluded.updated_at",
            params![
                assignment.shift_id,
                assignment.candidate_id,
                assignment.role,
                now
            ],
        )?;
        transaction.execute(
            "UPDATE shifts SET confirmed = confirmed + 1 WHERE id = ?1",
            params![assignment.shift_id],
        )?;
        transaction.execute(
            "UPDATE shift_roles SET filled = filled + 1
             WHERE shift_id = ?1 AND name = ?2 AND filled < required",
            params![assignment.shift_id, assignment.role],
        )?;
        append_audit(
            &transaction,
            if assignment.promote_waitlist {
                "waitlist.promote"
            } else {
                "autoroster.apply"
            },
            "shift",
            &assignment.shift_id,
            format!("AutoRoster assigned {name} as {}", assignment.role),
            Some("Applied from an approved AutoRoster plan".into()),
        )?;
    }
    append_audit(
        &transaction,
        "autoroster.apply_week",
        "workspace",
        "roster",
        format!(
            "Applied a weekly AutoRoster plan: {} assignment(s) across {} shift(s)",
            assignments.len(),
            per_shift.len()
        ),
        Some("The reviewed plan was applied atomically".into()),
    )?;
    transaction.commit()?;
    snapshot(conn)
}

/// Plans the requested shifts (or every future scheduled shift when the list is
/// empty) against the active volunteer pool, following the organization's
/// current matching policy.
pub fn plan_roster(
    conn: &Connection,
    shift_ids: &[String],
    options: &RosterOptions,
) -> Result<RosterPlan> {
    if shift_ids.is_empty() {
        return Err(CoreError::Validation(
            "Choose at least one shift for AutoRoster".into(),
        ));
    }
    let now = clock_now(conn)?;
    let policy = policy_for_workspace(conn)?;
    let slots = load_open_slots(conn, shift_ids, now)?;
    let candidates = load_candidates(conn, now, options)?;
    let mut roster = plan(&candidates, &slots, &policy, options);
    roster.generated_at = now.to_rfc3339();
    roster.revision = workspace_revision(conn)?;
    Ok(roster)
}

/// The plan and every candidate evaluation behind it, generated together. The
/// AutoRoster screen reads this and formats it; it derives no eligibility or
/// score of its own.
pub fn evaluate_roster_candidates(
    conn: &Connection,
    shift_ids: &[String],
    options: &RosterOptions,
) -> Result<crate::matching::RosterEvaluation> {
    if shift_ids.is_empty() {
        return Err(CoreError::Validation(
            "Choose at least one shift for AutoRoster".into(),
        ));
    }
    let now = clock_now(conn)?;
    let policy = policy_for_workspace(conn)?;
    let slots = load_open_slots(conn, shift_ids, now)?;
    let candidates = load_candidates(conn, now, options)?;
    let mut evaluation = crate::matching::evaluate_roster(&candidates, &slots, &policy, options);
    evaluation.generated_at = now.to_rfc3339();
    evaluation.revision = workspace_revision(conn)?;
    evaluation.plan.generated_at = evaluation.generated_at.clone();
    evaluation.plan.revision = evaluation.revision;
    Ok(evaluation)
}

/// The organization this workspace belongs to. One organization lives in a
/// database, so the oldest row is the workspace itself.
pub fn workspace_organization_id(conn: &Connection) -> Result<Option<String>> {
    Ok(conn
        .query_row(
            "SELECT id FROM organizations ORDER BY created_at LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()?)
}

/// The policy of the organization this workspace belongs to. A workspace that
/// has never been configured follows the shipped defaults.
pub fn policy_for_workspace(conn: &Connection) -> Result<crate::policy::RosterPolicy> {
    match workspace_organization_id(conn)? {
        Some(id) => crate::policy::current_policy(conn, &id),
        None => Ok(crate::policy::RosterPolicy::default()),
    }
}

/// The full answer to "why this person?" or "why not that one?" for one
/// candidate and one open seat.
pub fn explain_candidate(
    conn: &Connection,
    shift_ids: &[String],
    options: &RosterOptions,
    candidate_id: &str,
    slot_id: &str,
) -> Result<crate::explain::CandidateAnswer> {
    let now = clock_now(conn)?;
    let policy = policy_for_workspace(conn)?;
    let slots = load_open_slots(conn, shift_ids, now)?;
    let candidates = load_candidates(conn, now, options)?;
    crate::explain::explain_candidate(&candidates, &slots, &policy, options, candidate_id, slot_id)
}
