//! Who takes an opened seat.
//!
//! Waitlist order is the fairness rule, not the qualification rule. Ranking
//! walks the line in order and asks the same eligibility gates a registration
//! goes through, so the person promoted is the first person who can actually
//! take the role with the credential it requires on the day it is needed. The
//! skipped entries keep the reason they were skipped, because "why was I passed
//! over?" deserves a sentence and not a shrug.
//!
//! The recommendation is what a coordinator sees; promotion still goes through
//! [`crate::workflows::promote_waitlist`], which refuses an ineligible volunteer
//! rather than trusting the caller.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::workflows::validate_registration;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WaitlistCandidate {
    pub volunteer_id: String,
    pub name: String,
    pub initials: String,
    pub position: i64,
    pub eligible: bool,
    /// Why this person can take the seat, or why they cannot.
    pub reason: String,
    pub attendance_rate: i64,
    pub joined_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ReplacementRecommendation {
    pub shift_id: String,
    pub shift_title: String,
    pub role: String,
    pub starts_at: String,
    /// The first eligible person in line, if the line has one.
    pub recommended: Option<WaitlistCandidate>,
    pub ranked: Vec<WaitlistCandidate>,
    /// The sentence a coordinator reads, including who was passed over.
    pub summary: String,
}

/// Ranks the waiting line for one role on one shift.
pub fn rank(conn: &Connection, shift_id: &str, role: &str) -> Result<ReplacementRecommendation> {
    let (shift_title, starts_at): (String, String) = conn.query_row(
        "SELECT o.title, s.starts_at
         FROM shifts s JOIN opportunities o ON o.id = s.opportunity_id
         WHERE s.id = ?1",
        params![shift_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;

    let mut statement = conn.prepare(
        "SELECT w.volunteer_id, v.name, v.initials, w.position, w.created_at, v.attendance_rate
         FROM waitlist_entries w
         JOIN volunteers v ON v.id = w.volunteer_id
         WHERE w.shift_id = ?1 AND w.status = 'waiting'
         ORDER BY w.position, w.created_at, w.id",
    )?;
    let rows = statement
        .query_map(params![shift_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, i64>(5)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let waiting = rows.len();
    let mut checked: Vec<WaitlistCandidate> = Vec::with_capacity(waiting);
    for (volunteer_id, name, initials, position, joined_at, attendance_rate) in rows {
        let eligible = validate_registration(conn, shift_id, &volunteer_id, role).is_ok();
        checked.push(WaitlistCandidate {
            volunteer_id,
            name,
            initials,
            position,
            eligible,
            reason: String::new(),
            attendance_rate,
            joined_at,
        });
    }

    // The first person who can take the seat, and the people in front of them
    // who could not. Whoever comes after the recommendation is not this seat's
    // business, so their reasons are recorded but not read out.
    let first_eligible = checked.iter().position(|row| row.eligible);
    let mut ranked: Vec<WaitlistCandidate> = Vec::with_capacity(waiting);
    for (index, mut row) in checked.into_iter().enumerate() {
        if row.eligible {
            row.reason = if Some(index) == first_eligible {
                "First eligible volunteer on the waitlist, and still meets every requirement for this role."
                    .to_string()
            } else {
                "Eligible, but behind someone who is also eligible.".to_string()
            };
        } else {
            // The eligibility gate already writes the sentence a person would
            // say: "This role needs a valid Food safety handler on the shift
            // date." Asking again and keeping the answer is what makes the skip
            // reasons honest.
            row.reason = validate_registration(conn, shift_id, &row.volunteer_id, role)
                .err()
                .map(|error| error.to_string())
                .unwrap_or_else(|| "Not eligible for this role".into());
        }
        ranked.push(row);
    }

    let recommended = first_eligible.map(|index| ranked[index].clone());
    let skipped: Vec<String> = match first_eligible {
        Some(index) => ranked[..index]
            .iter()
            .filter(|row| !row.eligible)
            .map(|row| format!("{} ({})", row.name, row.reason))
            .collect(),
        None => ranked
            .iter()
            .filter(|row| !row.eligible)
            .map(|row| format!("{} ({})", row.name, row.reason))
            .collect(),
    };

    let summary = match (&recommended, waiting) {
        (Some(person), 1) => format!(
            "{} is the only volunteer waiting and meets every requirement for {}.",
            person.name, role
        ),
        (Some(person), _) if skipped.is_empty() => format!(
            "{} was first in line on the waitlist and meets every requirement for {}.",
            person.name, role
        ),
        (Some(person), _) => format!(
            "{} was first eligible on the waitlist. {} ahead in line could not take the seat: {}.",
            person.name,
            if skipped.len() == 1 {
                "1 person".to_string()
            } else {
                format!("{} people", skipped.len())
            },
            skipped.join("; ")
        ),
        (None, 0) => format!("Nobody is waiting for {role} on {shift_title}."),
        (None, _) => format!(
            "None of the {waiting} waiting volunteers can take {role} right now: {}.",
            skipped.join("; ")
        ),
    };

    Ok(ReplacementRecommendation {
        shift_id: shift_id.to_string(),
        shift_title,
        role: role.to_string(),
        starts_at,
        recommended,
        ranked,
        summary,
    })
}
