//! Retention, recognition, and the numbers a coordinator makes decisions with.
//!
//! None of this predicts anything. Every signal is a rule a coordinator could
//! have written down themselves, and each one carries the history that produced
//! it plus the action it suggests. That is the difference between "Nico is at
//! risk" and "Nico has not served in 94 days but completed 7 food-access shifts,
//! so send the food-access opportunities".
//!
//! Milestones are the other half: recognition is the cheapest retention tool a
//! volunteer program has, and it only works when somebody can see who has
//! reached one.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::services::now;

/// Verified hours and completed shifts a volunteer can see on their own impact
/// page. Deliberately small and reachable: a leaderboard is not the point.
pub const HOUR_MILESTONES: [i64; 3] = [10, 25, 50];
pub const SHIFT_MILESTONES: [i64; 1] = [10];
pub const SERVICE_YEAR_DAYS: i64 = 365;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RetentionSignal {
    pub volunteer_id: String,
    pub name: String,
    pub initials: String,
    /// The rule that fired, in the coordinator's words.
    pub signal: SignalKind,
    pub reason: String,
    pub history: Vec<String>,
    pub suggested_action: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SignalKind {
    /// No completed shift in the last 90 days.
    Inactive,
    /// Registered for the first two shifts and canceled or missed both.
    NewVolunteerAtRisk,
    /// Four or more completed shifts in the last 60 days.
    HighlyEngaged,
    /// Wants to serve but a requirement blocks the role they are suited to.
    CredentialBlocker,
}

impl SignalKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Inactive => "inactive",
            Self::NewVolunteerAtRisk => "new_volunteer_at_risk",
            Self::HighlyEngaged => "highly_engaged",
            Self::CredentialBlocker => "credential_blocker",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Milestone {
    pub key: String,
    pub label: String,
    pub earned: bool,
    /// What is still missing, so the next one is visible rather than implied.
    pub remaining: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VolunteerInsight {
    pub volunteer_id: String,
    pub name: String,
    pub verified_hours: i64,
    pub completed_shifts: i64,
    pub milestones: Vec<Milestone>,
    /// The next milestone a coordinator can recognize at the next shift.
    pub next: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EngagementMetrics {
    pub new_volunteers: i64,
    pub return_30: i64,
    pub return_60: i64,
    pub return_90: i64,
    pub inactive_volunteers: i64,
    pub completed_shifts: i64,
    pub no_show_rate: i64,
    pub late_cancellation_rate: i64,
    pub average_lead_days: i64,
    pub waitlist_promotions: i64,
    pub waitlist_promotion_rate: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CredentialReadiness {
    pub current: i64,
    pub expiring_soon: i64,
    pub expired: i64,
    /// Assignments on future shifts whose credential lapses before the shift.
    pub assignments_at_risk: i64,
}

/// One volunteer's rule evaluation, from the rows rather than from a score.
fn completed_shift_count(conn: &Connection, volunteer_id: &str) -> Result<i64> {
    Ok(conn.query_row(
        "SELECT COUNT(DISTINCT r.shift_id)
         FROM registrations r
         JOIN shifts s ON s.id = r.shift_id
         WHERE r.volunteer_id = ?1 AND r.status = 'registered'
           AND (s.status = 'completed' OR s.ends_at < ?2)
           AND EXISTS (
             SELECT 1 FROM attendance_ledger a
             WHERE a.shift_id = r.shift_id AND a.volunteer_id = r.volunteer_id
               AND a.event_type IN ('check_in', 'check_out', 'manual_check_in', 'manual_check_out')
           )",
        params![volunteer_id, now(conn)?.to_rfc3339()],
        |row| row.get(0),
    )?)
}

fn last_served(conn: &Connection, volunteer_id: &str) -> Result<Option<String>> {
    let raw: Option<String> = conn
        .query_row(
            "SELECT MAX(a.at) FROM attendance_ledger a
             WHERE a.volunteer_id = ?1
               AND a.event_type IN ('check_in', 'check_out', 'manual_check_in', 'manual_check_out')",
            params![volunteer_id],
            |row| row.get(0),
        )
        .unwrap_or(None);
    Ok(raw)
}

fn completed_programs(conn: &Connection, volunteer_id: &str) -> Result<Vec<(String, i64)>> {
    let mut statement = conn.prepare(
        "SELECT o.cause, COUNT(DISTINCT r.shift_id)
         FROM registrations r
         JOIN shifts s ON s.id = r.shift_id
         JOIN opportunities o ON o.id = s.opportunity_id
         WHERE r.volunteer_id = ?1 AND r.status = 'registered'
         GROUP BY o.cause
         ORDER BY COUNT(DISTINCT r.shift_id) DESC",
    )?;
    let rows = statement
        .query_map(params![volunteer_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

/// Each reason names its threshold, so one sentence fits both audiences.
pub fn retention_signals(conn: &Connection) -> Result<Vec<RetentionSignal>> {
    let now = now(conn)?;
    let today = now.date_naive();
    let mut statement = conn.prepare(
        "SELECT id, name, initials FROM volunteers
         WHERE status = 'active' AND (?1 IS NULL OR organization_id = ?1)
         ORDER BY name",
    )?;
    let people = statement
        .query_map(params![crate::scope::current(conn)?], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let mut signals: Vec<RetentionSignal> = Vec::new();
    for (volunteer_id, name, initials) in people {
        let completed = completed_shift_count(conn, &volunteer_id)?;
        let last = last_served(conn, &volunteer_id)?;
        let last_date = last
            .as_deref()
            .and_then(|value| chrono::DateTime::parse_from_rfc3339(value).ok())
            .map(|value| value.date_naive());
        let idle_days = last_date
            .map(|date| (today - date).num_days())
            .unwrap_or(i64::MAX);

        // Settled and quiet for three months.
        if idle_days >= 90 && completed > 0 {
            let programs = completed_programs(conn, &volunteer_id)?;
            let history: Vec<String> = programs
                .iter()
                .take(3)
                .map(|(cause, count)| format!("{count} {} shift(s)", friendly_cause(cause)))
                .collect();
            let interested = programs
                .first()
                .map(|(cause, _)| friendly_cause(cause).to_string())
                .unwrap_or_else(|| "their usual".into());
            signals.push(RetentionSignal {
                volunteer_id: volunteer_id.clone(),
                name: name.clone(),
                initials: initials.clone(),
                signal: SignalKind::Inactive,
                reason: format!(
                    "No completed shift in {idle_days} days, but {completed} on record"
                ),
                history,
                suggested_action: format!("Send upcoming {interested} opportunities"),
            });
            continue;
        }

        if last.is_none() && completed == 0 {
            // Registered early, then canceled or missed the first two.
            let (registered, lost): (i64, i64) = conn.query_row(
                "SELECT
                   (SELECT COUNT(*) FROM registrations WHERE volunteer_id = ?1),
                   (SELECT COUNT(*) FROM registrations WHERE volunteer_id = ?1 AND status = 'canceled')",
                params![volunteer_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )?;
            let no_shows: i64 = conn.query_row(
                "SELECT COUNT(*) FROM attendance_ledger
                 WHERE volunteer_id = ?1 AND event_type = 'marked_no_show'",
                params![volunteer_id],
                |row| row.get(0),
            )?;
            if registered >= 1 && lost + no_shows >= 2 {
                signals.push(RetentionSignal {
                    volunteer_id: volunteer_id.clone(),
                    name: name.clone(),
                    initials: initials.clone(),
                    signal: SignalKind::NewVolunteerAtRisk,
                    reason: format!(
                        "{} registration(s) ended in a cancellation or a missed shift and no shift has been completed",
                        lost + no_shows
                    ),
                    history: vec![format!("{registered} registration(s) in total")],
                    suggested_action:
                        "Offer a shorter or better-supported first shift, or a call from the coordinator"
                            .into(),
                });
                continue;
            }
        }

        let recent: i64 = conn.query_row(
            "SELECT COUNT(DISTINCT r.shift_id) FROM registrations r
             JOIN shifts s ON s.id = r.shift_id
             JOIN attendance_ledger a ON a.shift_id = r.shift_id AND a.volunteer_id = r.volunteer_id
             WHERE r.volunteer_id = ?1 AND a.at >= ?2
               AND a.event_type IN ('check_in', 'check_out', 'manual_check_in', 'manual_check_out')",
            params![
                volunteer_id,
                (now - chrono::Duration::days(60)).to_rfc3339()
            ],
            |row| row.get(0),
        )?;
        if recent >= 4 {
            signals.push(RetentionSignal {
                volunteer_id: volunteer_id.clone(),
                name: name.clone(),
                initials: initials.clone(),
                signal: SignalKind::HighlyEngaged,
                reason: format!("{recent} completed shifts in the last 60 days"),
                history: vec![format!("{completed} completed shifts in total")],
                suggested_action: "Ask them to mentor a new volunteer or lead a shift".into(),
            });
            continue;
        }

        let blockers: Vec<String> = {
            let mut statement = conn.prepare(
                "SELECT DISTINCT ct.name, vc.valid_through
                 FROM volunteer_credentials vc
                 JOIN credential_types ct ON ct.id = vc.credential_type_id
                 WHERE vc.volunteer_id = ?1 AND vc.valid_through < ?2",
            )?;
            let names = statement
                .query_map(params![volunteer_id, today.to_string()], |row| {
                    Ok(format!(
                        "{} (lapsed {})",
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?
                    ))
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            names
        };
        if !blockers.is_empty() {
            let interested: Option<String> = conn
                .query_row(
                    "SELECT o.cause FROM saved_opportunities s
                     JOIN opportunities o ON o.id = s.opportunity_id
                     WHERE s.volunteer_id = ?1 LIMIT 1",
                    params![volunteer_id],
                    |row| row.get(0),
                )
                .ok();
            signals.push(RetentionSignal {
                volunteer_id: volunteer_id.clone(),
                name: name.clone(),
                initials: initials.clone(),
                signal: SignalKind::CredentialBlocker,
                reason: format!(
                    "An expired {} blocks the roles that need it",
                    blockers.join(", ")
                ),
                history: interested
                    .clone()
                    .map(|cause| vec![format!("Saved {} opportunities", friendly_cause(&cause))])
                    .unwrap_or_default(),
                suggested_action: "Send the renewal steps and hold a seat for the next shift"
                    .into(),
            });
        }
    }
    Ok(signals)
}

fn friendly_cause(cause: &str) -> &str {
    match cause {
        "food" => "food access",
        "education" => "education",
        "environment" => "environment",
        "health" => "health",
        "seniors" => "senior support",
        other => other,
    }
}

/// One volunteer's milestones, earned and next.
pub fn volunteer_insight(conn: &Connection, volunteer_id: &str) -> Result<VolunteerInsight> {
    let (name, joined_at): (String, String) = conn.query_row(
        "SELECT name, joined_at FROM volunteers WHERE id = ?1",
        params![volunteer_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    let verified_minutes: i64 = conn.query_row(
        "SELECT COALESCE(SUM(minutes), 0) FROM hour_entries
         WHERE volunteer_id = ?1 AND status = 'verified'",
        params![volunteer_id],
        |row| row.get(0),
    )?;
    let verified_hours = verified_minutes / 60;
    let completed = completed_shift_count(conn, volunteer_id)?;
    let joined = chrono::DateTime::parse_from_rfc3339(&joined_at)
        .map(|value| value.date_naive())
        .unwrap_or_else(|_| now(conn).map(|now| now.date_naive()).unwrap_or_default());
    let years_of_service = (now(conn)?.date_naive() - joined).num_days() / SERVICE_YEAR_DAYS;

    let mut milestones: Vec<Milestone> = Vec::new();
    for hours in HOUR_MILESTONES {
        milestones.push(Milestone {
            key: format!("hours-{hours}"),
            label: format!("{hours} verified hours"),
            earned: verified_hours >= hours,
            remaining: format!("{} hour(s) to go", (hours - verified_hours).max(0)),
        });
    }
    for shifts in SHIFT_MILESTONES {
        milestones.push(Milestone {
            key: format!("shifts-{shifts}"),
            label: format!("{shifts} completed shifts"),
            earned: completed >= shifts,
            remaining: format!("{} shift(s) to go", (shifts - completed).max(0)),
        });
    }
    milestones.push(Milestone {
        key: "service-year-1".into(),
        label: "One year of service".into(),
        earned: years_of_service >= 1,
        remaining: format!(
            "{} day(s) to go",
            (SERVICE_YEAR_DAYS - (now(conn)?.date_naive() - joined).num_days()).max(0)
        ),
    });

    let next = milestones
        .iter()
        .find(|milestone| !milestone.earned)
        .map(|milestone| format!("{} — {}", milestone.label, milestone.remaining));

    Ok(VolunteerInsight {
        volunteer_id: volunteer_id.to_string(),
        name,
        verified_hours,
        completed_shifts: completed,
        milestones,
        next,
    })
}

/// The numbers behind the engagement report, computed from rows.
pub fn engagement_metrics(conn: &Connection) -> Result<EngagementMetrics> {
    let now = now(conn)?;
    let organization = crate::scope::current(conn)?;
    let year_start = format!("{}-01-01", now.format("%Y"));
    let new_volunteers: i64 = conn.query_row(
        "SELECT COUNT(*) FROM volunteers
         WHERE substr(joined_at, 1, 10) >= ?1
           AND (?2 IS NULL OR organization_id = ?2)",
        params![year_start, organization],
        |row| row.get(0),
    )?;
    let inactive_volunteers: i64 = conn.query_row(
        "SELECT COUNT(*) FROM volunteers v
         WHERE v.status = 'active'
           AND (?2 IS NULL OR v.organization_id = ?2)
           AND NOT EXISTS (
             SELECT 1 FROM attendance_ledger a
             WHERE a.volunteer_id = v.id AND a.at >= ?1
               AND a.event_type IN ('check_in', 'manual_check_in')
           )",
        params![
            (now - chrono::Duration::days(90)).to_rfc3339(),
            organization
        ],
        |row| row.get(0),
    )?;
    let completed_shifts: i64 = conn.query_row(
        "SELECT COUNT(*) FROM shifts s
         JOIN opportunities o ON o.id = s.opportunity_id
         WHERE (s.status = 'completed' OR s.ends_at < ?1)
           AND (?2 IS NULL OR o.organization_id = ?2)",
        params![now.to_rfc3339(), organization],
        |row| row.get(0),
    )?;
    // Arrival and no-show counts are read through the shift they happened on;
    // the ledger row itself carries no organization.
    let (arrivals, no_shows): (i64, i64) = conn.query_row(
        "SELECT
           (SELECT COUNT(*) FROM attendance_ledger a
             JOIN shifts s ON s.id = a.shift_id
             JOIN opportunities o ON o.id = s.opportunity_id
             WHERE a.event_type IN ('check_in', 'manual_check_in')
               AND (?1 IS NULL OR o.organization_id = ?1)),
           (SELECT COUNT(*) FROM attendance_ledger a
             JOIN shifts s ON s.id = a.shift_id
             JOIN opportunities o ON o.id = s.opportunity_id
             WHERE a.event_type = 'marked_no_show'
               AND (?1 IS NULL OR o.organization_id = ?1))",
        params![organization],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    let no_show_rate = percent(no_shows, arrivals + no_shows);

    // Return rates: of the volunteers whose first shift was far enough back to
    // be measured, how many served again inside the window.
    let mut return_rates = [0i64; 3];
    for (index, window) in [30i64, 60, 90].into_iter().enumerate() {
        // A volunteer is measurable once their first arrival is old enough for
        // the window to have closed: measuring a 90-day return on somebody who
        // started last week would only drag the rate down.
        let summary: (i64, i64) = conn.query_row(
            "SELECT
               COUNT(*),
               SUM(CASE WHEN arrivals.next_at IS NOT NULL
                          AND CAST(julianday(arrivals.next_at) - julianday(arrivals.first_at) AS INTEGER) <= ?1
                        THEN 1 ELSE 0 END)
             FROM (
               SELECT a.volunteer_id,
                      MIN(a.at) AS first_at,
                      MIN(CASE WHEN a.at > (SELECT MIN(b.at) FROM attendance_ledger b
                                            WHERE b.volunteer_id = a.volunteer_id
                                              AND b.event_type IN ('check_in', 'manual_check_in'))
                               THEN a.at END) AS next_at
               FROM attendance_ledger a
               JOIN shifts s ON s.id = a.shift_id
               JOIN opportunities o ON o.id = s.opportunity_id
               WHERE a.event_type IN ('check_in', 'manual_check_in')
                 AND (?3 IS NULL OR o.organization_id = ?3)
               GROUP BY a.volunteer_id
             ) arrivals
             WHERE arrivals.first_at <= ?2",
            params![
                window,
                (now - chrono::Duration::days(window)).to_rfc3339(),
                organization
            ],
            |row| Ok((row.get(0)?, row.get::<_, Option<i64>>(1)?.unwrap_or(0))),
        )?;
        let (measured, returned) = summary;
        return_rates[index] = percent(returned, measured.max(1));
    }

    let (late, registrations): (i64, i64) = conn.query_row(
        "SELECT
           (SELECT COUNT(*) FROM registrations r
             JOIN shifts s ON s.id = r.shift_id
             JOIN opportunities o ON o.id = s.opportunity_id
             WHERE r.status = 'canceled' AND r.updated_at IS NOT NULL
               AND s.starts_at > r.updated_at
               AND CAST((julianday(s.starts_at) - julianday(r.updated_at)) * 24 AS INTEGER) < 48
               AND (?1 IS NULL OR o.organization_id = ?1)),
           (SELECT COUNT(*) FROM registrations r
             JOIN shifts s ON s.id = r.shift_id
             JOIN opportunities o ON o.id = s.opportunity_id
             WHERE (?1 IS NULL OR o.organization_id = ?1))",
        params![organization],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    let average_lead_days: i64 = conn.query_row(
        "SELECT COALESCE(CAST(AVG(julianday(s.starts_at) - julianday(r.created_at)) AS INTEGER), 0)
         FROM registrations r
         JOIN shifts s ON s.id = r.shift_id
         JOIN opportunities o ON o.id = s.opportunity_id
         WHERE r.status = 'registered'
           AND (?1 IS NULL OR o.organization_id = ?1)",
        params![organization],
        |row| row.get(0),
    )?;
    let (promoted, waiting): (i64, i64) = conn.query_row(
        "SELECT
           (SELECT COUNT(*) FROM waitlist_entries w
             JOIN shifts s ON s.id = w.shift_id
             JOIN opportunities o ON o.id = s.opportunity_id
             WHERE w.status = 'promoted' AND (?1 IS NULL OR o.organization_id = ?1)),
           (SELECT COUNT(*) FROM waitlist_entries w
             JOIN shifts s ON s.id = w.shift_id
             JOIN opportunities o ON o.id = s.opportunity_id
             WHERE (?1 IS NULL OR o.organization_id = ?1))",
        params![organization],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;

    Ok(EngagementMetrics {
        new_volunteers,
        return_30: return_rates[0],
        return_60: return_rates[1],
        return_90: return_rates[2],
        inactive_volunteers,
        completed_shifts,
        no_show_rate,
        late_cancellation_rate: percent(late, registrations.max(1)),
        average_lead_days,
        waitlist_promotions: promoted,
        waitlist_promotion_rate: percent(promoted, waiting.max(1)),
    })
}

/// Credential readiness: how many are usable, how many are about to lapse, how
/// many have lapsed, and which future assignments depend on one that lapsed.
pub fn credential_readiness(conn: &Connection) -> Result<CredentialReadiness> {
    let today = now(conn)?.date_naive();
    let horizon = (today + chrono::Duration::days(30)).to_string();
    let organization = crate::scope::current(conn)?;
    let (current, expiring_soon, expired): (i64, i64, i64) = conn.query_row(
        "SELECT
           (SELECT COUNT(*) FROM volunteer_credentials vc
             JOIN volunteers v ON v.id = vc.volunteer_id
             WHERE vc.valid_through > ?1 AND (?3 IS NULL OR v.organization_id = ?3)),
           (SELECT COUNT(*) FROM volunteer_credentials vc
             JOIN volunteers v ON v.id = vc.volunteer_id
             WHERE vc.valid_through >= ?2 AND vc.valid_through <= ?1
               AND (?3 IS NULL OR v.organization_id = ?3)),
           (SELECT COUNT(*) FROM volunteer_credentials vc
             JOIN volunteers v ON v.id = vc.volunteer_id
             WHERE vc.valid_through < ?2 AND (?3 IS NULL OR v.organization_id = ?3))",
        params![horizon, today.to_string(), organization],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )?;
    let assignments_at_risk: i64 = conn.query_row(
        "SELECT COUNT(*) FROM registrations r
         JOIN shifts s ON s.id = r.shift_id
         JOIN opportunities o ON o.id = s.opportunity_id
         JOIN role_requirements rr ON rr.shift_id = r.shift_id AND rr.role_name = r.role
         JOIN credential_types ct ON ct.id = rr.credential_type_id
         WHERE r.status = 'registered' AND s.status = 'scheduled' AND s.starts_at > ?1
           AND (?2 IS NULL OR o.organization_id = ?2)
           AND NOT EXISTS (
             SELECT 1 FROM volunteer_credentials vc
             WHERE vc.volunteer_id = r.volunteer_id AND vc.credential_type_id = ct.id
               AND vc.valid_through >= substr(s.starts_at, 1, 10)
           )",
        params![now(conn)?.to_rfc3339(), organization],
        |row| row.get(0),
    )?;
    Ok(CredentialReadiness {
        current,
        expiring_soon,
        expired,
        assignments_at_risk,
    })
}

fn percent(part: i64, whole: i64) -> i64 {
    if whole <= 0 {
        return 0;
    }
    ((part as f64 / whole as f64) * 100.0).round() as i64
}
