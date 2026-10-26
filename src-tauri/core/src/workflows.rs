//! Authoritative workflow state and commands.
//!
//! Every write the screens perform is a function here: it validates the
//! transition, changes SQLite, appends an audit event in the same connection,
//! and returns the fresh snapshot. The React session layer is only a cache of
//! that snapshot.

use std::collections::BTreeMap;

use chrono::{Datelike, Timelike};
use rusqlite::{params, Connection, OptionalExtension};

use crate::db::WORKFLOW_SEED;
use crate::error::{CoreError, Result};
use crate::matching::{age_on, day_key};
use crate::models::{
    Applicant, AttendanceEntry, AuditEvent, AvailabilitySlot, CheckinCode, CreateOpportunityResult,
    CredentialRecord, HoursDecision, ImpactMetric, NewOpportunityInput, OpportunityRecord,
    Registration, RetentionCohort, SavedView, SeedWorkflow, ServiceVerification, SettingsPatch,
    WaitlistEntry, WorkspaceSettings, WorkspaceSnapshot,
};

const COORDINATOR_ACTOR: &str = "Praket Gauri";
const APPLICATION_STAGES: [&str; 4] = ["applied", "review", "onboarding", "active"];
const CAUSES: [&str; 6] = [
    "food",
    "education",
    "environment",
    "health",
    "community",
    "animals",
];

fn setting(conn: &Connection, key: &str) -> Result<Option<String>> {
    Ok(conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .optional()?)
}

fn required_setting(conn: &Connection, key: &str) -> Result<String> {
    setting(conn, key)?.ok_or_else(|| CoreError::Validation(format!("Missing setting: {key}")))
}

fn demo_now(conn: &Connection) -> Result<String> {
    required_setting(conn, "demo_now")
}

fn current_volunteer_id(conn: &Connection) -> Result<String> {
    required_setting(conn, "current_volunteer_id")
}

fn coordinator_name(conn: &Connection) -> Result<String> {
    Ok(setting(conn, "coordinator_name")?.unwrap_or_else(|| COORDINATOR_ACTOR.to_string()))
}

pub(crate) fn append_audit(
    conn: &Connection,
    action: &str,
    entity_type: &str,
    entity_id: &str,
    summary: String,
    detail: Option<String>,
) -> Result<()> {
    conn.execute(
        "INSERT INTO audit_events
         (id, timestamp, actor_type, actor_id, action, entity_type, entity_id, summary, detail)
         VALUES (?1, ?2, 'coordinator', ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            uuid::Uuid::new_v4().to_string(),
            demo_now(conn)?,
            coordinator_name(conn)?,
            action,
            entity_type,
            entity_id,
            summary,
            detail,
        ],
    )?;
    Ok(())
}

fn default_settings() -> Result<WorkspaceSettings> {
    Ok(SeedWorkflow::parse(WORKFLOW_SEED)?.settings)
}

fn flag(conn: &Connection, key: &str, fallback: bool) -> Result<bool> {
    Ok(setting(conn, key)?
        .map(|value| value == "true")
        .unwrap_or(fallback))
}

fn number(conn: &Connection, key: &str, fallback: i64) -> Result<i64> {
    match setting(conn, key)? {
        Some(value) => value
            .parse()
            .map_err(|_| CoreError::Validation(format!("Setting {key} is not a number"))),
        None => Ok(fallback),
    }
}

fn text(conn: &Connection, key: &str, fallback: &str) -> Result<String> {
    Ok(setting(conn, key)?.unwrap_or_else(|| fallback.to_string()))
}

fn load_settings(conn: &Connection) -> Result<WorkspaceSettings> {
    let defaults = default_settings()?;
    let (organization_name, contact_email, timezone): (String, String, String) = conn
        .query_row(
            "SELECT name, email, timezone FROM organizations LIMIT 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?
        .unwrap_or((
            defaults.organization_name.clone(),
            defaults.contact_email.clone(),
            defaults.timezone.clone(),
        ));
    Ok(WorkspaceSettings {
        organization_name,
        contact_email,
        timezone,
        week_starts_on: text(conn, "setting.week_starts_on", &defaults.week_starts_on)?,
        default_shift_length: number(
            conn,
            "setting.default_shift_length",
            defaults.default_shift_length,
        )?,
        auto_promote_waitlist: flag(
            conn,
            "setting.auto_promote_waitlist",
            defaults.auto_promote_waitlist,
        )?,
        hours_require_approval: flag(
            conn,
            "setting.hours_require_approval",
            defaults.hours_require_approval,
        )?,
        email_digest: text(conn, "setting.email_digest", &defaults.email_digest)?,
        text_scale: text(conn, "setting.text_scale", &defaults.text_scale)?,
        high_contrast: flag(conn, "setting.high_contrast", defaults.high_contrast)?,
        reduced_motion: flag(conn, "setting.reduced_motion", defaults.reduced_motion)?,
        underline_links: flag(conn, "setting.underline_links", defaults.underline_links)?,
        colour_independent: flag(
            conn,
            "setting.colour_independent",
            defaults.colour_independent,
        )?,
    })
}

fn load_saved_opportunities(conn: &Connection) -> Result<Vec<String>> {
    let volunteer = current_volunteer_id(conn)?;
    let mut statement = conn.prepare(
        "SELECT opportunity_id FROM saved_opportunities
         WHERE volunteer_id = ?1 ORDER BY rowid",
    )?;
    let mut rows = statement.query(params![volunteer])?;
    let mut items = Vec::new();
    while let Some(row) = rows.next()? {
        items.push(row.get(0)?);
    }
    Ok(items)
}

fn load_attendance(conn: &Connection) -> Result<BTreeMap<String, Vec<AttendanceEntry>>> {
    let mut statement = conn.prepare(
        "SELECT volunteer_id, shift_id, role, status, checked_in_at, checked_out_at
         FROM attendance_events ORDER BY shift_id, rowid",
    )?;
    let mut rows = statement.query([])?;
    let mut map: BTreeMap<String, Vec<AttendanceEntry>> = BTreeMap::new();
    while let Some(row) = rows.next()? {
        let entry = AttendanceEntry {
            volunteer_id: row.get(0)?,
            shift_id: row.get(1)?,
            role: row.get(2)?,
            status: row.get(3)?,
            checked_in_at: row.get(4)?,
            checked_out_at: row.get(5)?,
        };
        map.entry(entry.shift_id.clone()).or_default().push(entry);
    }
    Ok(map)
}

fn load_hours_decisions(conn: &Connection) -> Result<BTreeMap<String, HoursDecision>> {
    let mut statement = conn.prepare(
        "SELECT id, status, approved_minutes, review_reason, reviewed_at
         FROM hour_entries WHERE reviewed_at IS NOT NULL ORDER BY reviewed_at DESC",
    )?;
    let mut rows = statement.query([])?;
    let mut map = BTreeMap::new();
    while let Some(row) = rows.next()? {
        let id: String = row.get(0)?;
        map.insert(
            id,
            HoursDecision {
                status: row.get(1)?,
                approved_minutes: row.get(2)?,
                reason: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                reviewed_at: row.get(4)?,
            },
        );
    }
    Ok(map)
}

fn load_applications(conn: &Connection) -> Result<Vec<Applicant>> {
    let mut statement = conn.prepare(
        "SELECT id, name, email, initials, tone, stage, applied_at, source, cause,
                skills_json, note
         FROM applications ORDER BY rowid",
    )?;
    let mut rows = statement.query([])?;
    let mut items = Vec::new();
    while let Some(row) = rows.next()? {
        let skills: String = row.get(9)?;
        items.push(Applicant {
            id: row.get(0)?,
            name: row.get(1)?,
            email: row.get(2)?,
            initials: row.get(3)?,
            tone: row.get(4)?,
            stage: row.get(5)?,
            applied_at: row.get(6)?,
            source: row.get(7)?,
            cause: row.get(8)?,
            skills: serde_json::from_str(&skills)?,
            note: row.get(10)?,
        });
    }
    Ok(items)
}

fn load_waitlist(conn: &Connection) -> Result<Vec<WaitlistEntry>> {
    let mut statement = conn.prepare(
        "SELECT id, shift_id, volunteer_id, created_at, status, position, eligible_role
         FROM waitlist_entries ORDER BY shift_id, position",
    )?;
    let mut rows = statement.query([])?;
    let mut items = Vec::new();
    while let Some(row) = rows.next()? {
        items.push(WaitlistEntry {
            id: row.get(0)?,
            shift_id: row.get(1)?,
            volunteer_id: row.get(2)?,
            created_at: row.get(3)?,
            status: row.get(4)?,
            position: row.get(5)?,
            eligible_role: row.get(6)?,
        });
    }
    Ok(items)
}

fn load_registrations(conn: &Connection) -> Result<Vec<Registration>> {
    let mut statement = conn.prepare(
        "SELECT shift_id, volunteer_id, role, status
         FROM registrations ORDER BY created_at, rowid",
    )?;
    let mut rows = statement.query([])?;
    let mut items = Vec::new();
    while let Some(row) = rows.next()? {
        items.push(Registration {
            shift_id: row.get(0)?,
            volunteer_id: row.get(1)?,
            role: row.get(2)?,
            status: row.get(3)?,
        });
    }
    Ok(items)
}

fn load_credentials(conn: &Connection) -> Result<Vec<CredentialRecord>> {
    let today: String = demo_now(conn)?;
    let today = today.get(..10).unwrap_or(&today).to_string();
    let expiring_cutoff = chrono::NaiveDate::parse_from_str(&today, "%Y-%m-%d")
        .map(|date| {
            (date + chrono::Duration::days(45))
                .format("%Y-%m-%d")
                .to_string()
        })
        .unwrap_or_else(|_| today.clone());
    let mut statement = conn.prepare(
        "SELECT vc.id, vc.volunteer_id, ct.name, vc.identifier, vc.issued_at, vc.valid_from,
                vc.valid_through, vc.verified_at, vc.verified_by, vc.notes
         FROM volunteer_credentials vc
         JOIN credential_types ct ON ct.id = vc.credential_type_id
         ORDER BY vc.valid_through, vc.id",
    )?;
    let mut rows = statement.query([])?;
    let mut items = Vec::new();
    while let Some(row) = rows.next()? {
        let valid_through: String = row.get(6)?;
        let status = if valid_through.as_str() < today.as_str() {
            "expired"
        } else if valid_through.as_str() <= expiring_cutoff.as_str() {
            "expiring"
        } else {
            "current"
        };
        items.push(CredentialRecord {
            id: row.get(0)?,
            volunteer_id: row.get(1)?,
            name: row.get(2)?,
            identifier: row.get(3)?,
            issued_at: row.get(4)?,
            valid_from: row.get(5)?,
            valid_through,
            status: status.into(),
            verified_at: row.get(7)?,
            verified_by: row.get(8)?,
            notes: row.get(9)?,
        });
    }
    Ok(items)
}

fn load_verifications(conn: &Connection) -> Result<Vec<ServiceVerification>> {
    let mut statement = conn.prepare(
        "SELECT id, code, volunteer_id, organization_id, date_start, date_end, total_minutes,
                issued_at, issued_by
         FROM service_verifications ORDER BY issued_at DESC, code",
    )?;
    let mut rows = statement.query([])?;
    let mut items = Vec::new();
    while let Some(row) = rows.next()? {
        items.push(ServiceVerification {
            id: row.get(0)?,
            code: row.get(1)?,
            volunteer_id: row.get(2)?,
            organization_id: row.get(3)?,
            date_start: row.get(4)?,
            date_end: row.get(5)?,
            total_minutes: row.get(6)?,
            issued_at: row.get(7)?,
            issued_by: row.get(8)?,
        });
    }
    Ok(items)
}

fn load_impact_metrics(conn: &Connection) -> Result<Vec<ImpactMetric>> {
    let mut statement = conn.prepare(
        "SELECT d.id, d.opportunity_id, d.metric_key, d.name, d.unit,
                COALESCE(SUM(r.value), 0), MAX(r.recorded_at)
         FROM impact_metric_definitions d
         LEFT JOIN impact_results r ON r.definition_id = d.id
         GROUP BY d.id
         ORDER BY d.name",
    )?;
    let mut rows = statement.query([])?;
    let mut items = Vec::new();
    while let Some(row) = rows.next()? {
        items.push(ImpactMetric {
            id: row.get(0)?,
            opportunity_id: row.get(1)?,
            metric_key: row.get(2)?,
            name: row.get(3)?,
            unit: row.get(4)?,
            value: row.get(5)?,
            recorded_at: row.get::<_, Option<String>>(6)?.unwrap_or_default(),
        });
    }
    Ok(items)
}

fn load_saved_views(conn: &Connection) -> Result<Vec<SavedView>> {
    let mut statement = conn.prepare(
        "SELECT id, scope, name, filters_json, created_at
         FROM report_saved_views ORDER BY created_at, name",
    )?;
    let mut rows = statement.query([])?;
    let mut items = Vec::new();
    while let Some(row) = rows.next()? {
        items.push(SavedView {
            id: row.get(0)?,
            scope: row.get(1)?,
            name: row.get(2)?,
            filters_json: row.get(3)?,
            created_at: row.get(4)?,
        });
    }
    Ok(items)
}

fn load_retention(conn: &Connection) -> Result<Vec<RetentionCohort>> {
    let demo_now: String = demo_now(conn)?;
    let Ok(now) = chrono::DateTime::parse_from_rfc3339(&demo_now) else {
        return Ok(Vec::new());
    };
    let today = now.date_naive();
    // A cohort is eligible only when every member's 30-day observation window
    // has fully elapsed; otherwise the denominator would punish recent starters.
    let observation_cutoff = today - chrono::Duration::days(30);
    let mut statement = conn.prepare(
        "SELECT volunteer_id, date FROM hour_entries
         WHERE status IN ('verified', 'pending')
         ORDER BY date, volunteer_id",
    )?;
    let mut rows = statement.query([])?;
    let mut dates: BTreeMap<String, Vec<chrono::NaiveDate>> = BTreeMap::new();
    while let Some(row) = rows.next()? {
        let volunteer: String = row.get(0)?;
        let raw: String = row.get(1)?;
        if let Ok(date) = chrono::NaiveDate::parse_from_str(&raw, "%Y-%m-%d") {
            dates.entry(volunteer).or_default().push(date);
        }
    }
    let mut cohorts = Vec::new();
    for offset in (0_i32..6).rev() {
        let total_month = today.year() * 12 + today.month0() as i32 - offset;
        let year = total_month.div_euclid(12);
        let month = total_month.rem_euclid(12) as u32 + 1;
        let month_start = chrono::NaiveDate::from_ymd_opt(year, month, 1).unwrap_or(today);
        let next_month = if month == 12 {
            chrono::NaiveDate::from_ymd_opt(year + 1, 1, 1)
        } else {
            chrono::NaiveDate::from_ymd_opt(year, month + 1, 1)
        }
        .unwrap_or(month_start);
        let month_end = next_month - chrono::Duration::days(1);
        let mut eligible = 0;
        let mut returned = 0;
        for events in dates.values() {
            let mut unique = events.clone();
            unique.sort();
            unique.dedup();
            let first = unique
                .iter()
                .copied()
                .find(|date| *date >= month_start && *date <= month_end);
            let Some(first) = first else { continue };
            if first > observation_cutoff {
                continue;
            }
            eligible += 1;
            if unique
                .iter()
                .any(|date| *date > first && *date <= first + chrono::Duration::days(30))
            {
                returned += 1;
            }
        }
        let rate = if eligible == 0 {
            0
        } else {
            ((returned as f64 / eligible as f64) * 100.0).round() as i64
        };
        cohorts.push(RetentionCohort {
            label: month_start.format("%b").to_string(),
            eligible,
            returned,
            rate,
        });
    }
    Ok(cohorts)
}

/// Retention is a cohort calculation, never a synthetic series. Exposed for
/// the report service so the screen and exported report use one formula.
pub fn retention_cohorts(conn: &Connection) -> Result<Vec<RetentionCohort>> {
    load_retention(conn)
}

fn load_audit(conn: &Connection) -> Result<Vec<AuditEvent>> {
    let actor_name = coordinator_name(conn)?;
    let mut statement = conn.prepare(
        "SELECT id, timestamp,
                CASE WHEN actor_id = 'user-praket' THEN ?1 ELSE actor_id END,
                action, entity_type, entity_id, summary, detail
         FROM audit_events
         WHERE action <> 'demo_seeded'
         ORDER BY timestamp DESC, rowid DESC",
    )?;
    let mut rows = statement.query(params![actor_name])?;
    let mut items = Vec::new();
    while let Some(row) = rows.next()? {
        items.push(AuditEvent {
            id: row.get(0)?,
            at: row.get(1)?,
            actor: row.get(2)?,
            action: row.get(3)?,
            entity_type: row.get(4)?,
            entity_id: row.get(5)?,
            summary: row.get(6)?,
            detail: row.get(7)?,
        });
    }
    Ok(items)
}

fn load_created_opportunities(conn: &Connection) -> Result<Vec<OpportunityRecord>> {
    let mut statement = conn.prepare(
        "SELECT id, slug, title, cause, organization_name, image, image_alt, description,
                address, distance_miles, coordinator, capacity, duration, training_json,
                requirements_json, impact_metric
         FROM opportunities WHERE created_at IS NOT NULL
         ORDER BY created_at DESC, rowid DESC",
    )?;
    let mut rows = statement.query([])?;
    let mut items = Vec::new();
    while let Some(row) = rows.next()? {
        let training: String = row.get(13)?;
        let requirements: String = row.get(14)?;
        items.push(OpportunityRecord {
            id: row.get(0)?,
            slug: row.get(1)?,
            title: row.get(2)?,
            cause: row.get(3)?,
            organization: row.get(4)?,
            image: row.get(5)?,
            image_alt: row.get(6)?,
            description: row.get(7)?,
            address: row.get(8)?,
            distance_miles: row.get(9)?,
            coordinator: row.get(10)?,
            capacity: row.get(11)?,
            duration: row.get(12)?,
            training: serde_json::from_str(&training)?,
            requirements: serde_json::from_str(&requirements)?,
            impact_metric: row.get(15)?,
        });
    }
    Ok(items)
}

fn load_volunteer_profile(conn: &Connection) -> Result<crate::models::VolunteerProfile> {
    let volunteer_id = current_volunteer_id(conn)?;
    let (availability_json, completed_onboarding, phone, interests, causes_json, photo): (
        String,
        i64,
        String,
        String,
        String,
        String,
    ) = conn
        .query_row(
            "SELECT availability_json, onboarding_completed, phone, interests, causes_json, photo
             FROM volunteers WHERE id = ?1",
            params![volunteer_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                ))
            },
        )
        .optional()?
        .ok_or_else(|| CoreError::NotFound("Current volunteer".into()))?;
    let causes: Vec<String> = serde_json::from_str(&causes_json).unwrap_or_default();
    let raw: Vec<String> = serde_json::from_str(&availability_json)?;
    let availability = raw
        .into_iter()
        .filter_map(|value| {
            value.split_once(':').map(|(day, period)| AvailabilitySlot {
                day: day.to_string(),
                period: period.to_string(),
            })
        })
        .collect();
    let mut statement =
        conn.prepare("SELECT skill FROM volunteer_skills WHERE volunteer_id = ?1 ORDER BY rowid")?;
    let mut rows = statement.query(params![volunteer_id])?;
    let mut skills = Vec::new();
    while let Some(row) = rows.next()? {
        skills.push(row.get(0)?);
    }
    Ok(crate::models::VolunteerProfile {
        skills,
        availability,
        completed_onboarding: completed_onboarding == 1,
        phone,
        interests,
        causes,
        photo,
    })
}

pub fn snapshot(conn: &Connection) -> Result<WorkspaceSnapshot> {
    Ok(WorkspaceSnapshot {
        saved_opportunity_ids: load_saved_opportunities(conn)?,
        attendance: load_attendance(conn)?,
        hours_decisions: load_hours_decisions(conn)?,
        applications: load_applications(conn)?,
        waitlist: load_waitlist(conn)?,
        settings: load_settings(conn)?,
        created_opportunities: load_created_opportunities(conn)?,
        registrations: load_registrations(conn)?,
        audit: load_audit(conn)?,
        volunteer_profile: load_volunteer_profile(conn)?,
        credentials: load_credentials(conn)?,
        verifications: load_verifications(conn)?,
        impact_metrics: load_impact_metrics(conn)?,
        saved_views: load_saved_views(conn)?,
        retention: load_retention(conn)?,
        checkin_code: None,
    })
}

/// The snapshot a signed-in volunteer is allowed to read. Coordinator-only
/// records (the applicant pipeline, the audit trail, retention cohorts, saved
/// report views) are removed, and every volunteer-owned row is limited to the
/// signed-in person. A coordinator gets the unredacted snapshot.
pub fn snapshot_for(conn: &Connection, volunteer_id: Option<&str>) -> Result<WorkspaceSnapshot> {
    let mut snapshot = snapshot(conn)?;
    let Some(volunteer_id) = volunteer_id else {
        return Ok(snapshot);
    };

    snapshot.attendance.retain(|_, entries| {
        entries.retain(|entry| entry.volunteer_id == volunteer_id);
        !entries.is_empty()
    });

    let mut hour_statement = conn.prepare("SELECT id FROM hour_entries WHERE volunteer_id = ?1")?;
    let hour_ids: Vec<String> = hour_statement
        .query_map(params![volunteer_id], |row| row.get(0))?
        .collect::<rusqlite::Result<Vec<String>>>()?;
    snapshot
        .hours_decisions
        .retain(|entry_id, _| hour_ids.iter().any(|id| id == entry_id));

    snapshot
        .waitlist
        .retain(|row| row.volunteer_id == volunteer_id);
    snapshot
        .registrations
        .retain(|row| row.volunteer_id == volunteer_id);
    snapshot
        .credentials
        .retain(|row| row.volunteer_id == volunteer_id);
    snapshot
        .verifications
        .retain(|row| row.volunteer_id == volunteer_id);

    snapshot.applications.clear();
    snapshot.audit.clear();
    snapshot.impact_metrics.clear();
    snapshot.saved_views.clear();
    snapshot.retention.clear();
    Ok(snapshot)
}

fn volunteer_name(conn: &Connection, volunteer_id: &str) -> Result<String> {
    conn.query_row(
        "SELECT name FROM volunteers WHERE id = ?1",
        params![volunteer_id],
        |row| row.get(0),
    )
    .optional()?
    .ok_or_else(|| CoreError::NotFound(format!("Volunteer {volunteer_id}")))
}

fn volunteer_role(conn: &Connection, volunteer_id: &str) -> Result<String> {
    Ok(conn
        .query_row(
            "SELECT skill FROM volunteer_skills WHERE volunteer_id = ?1 ORDER BY rowid LIMIT 1",
            params![volunteer_id],
            |row| row.get(0),
        )
        .optional()?
        .unwrap_or_else(|| "General support".to_string()))
}

fn ensure_shift(conn: &Connection, shift_id: &str) -> Result<()> {
    let found: Option<String> = conn
        .query_row(
            "SELECT id FROM shifts WHERE id = ?1",
            params![shift_id],
            |row| row.get(0),
        )
        .optional()?;
    found
        .map(|_| ())
        .ok_or_else(|| CoreError::NotFound(format!("Shift {shift_id}")))
}

struct NotificationTarget<'a> {
    audience: &'a str,
    volunteer_id: Option<&'a str>,
}

fn append_notification(
    conn: &Connection,
    kind: &str,
    title: &str,
    body: &str,
    priority: &str,
    href: &str,
    target: NotificationTarget<'_>,
) -> Result<()> {
    conn.execute(
        "INSERT INTO notifications
         (id, kind, title, body, priority, created_at, read_at, href, audience, volunteer_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7, ?8, ?9)",
        params![
            uuid::Uuid::new_v4().to_string(),
            kind,
            title,
            body,
            priority,
            demo_now(conn)?,
            href,
            target.audience,
            target.volunteer_id,
        ],
    )?;
    Ok(())
}

#[derive(Debug, Clone)]
pub(crate) struct ShiftRules {
    starts_at: chrono::DateTime<chrono::FixedOffset>,
    ends_at: chrono::DateTime<chrono::FixedOffset>,
    capacity: i64,
    confirmed: i64,
    status: String,
    title: String,
    opportunity_id: String,
}

fn shift_rules(conn: &Connection, shift_id: &str) -> Result<ShiftRules> {
    let (starts_at, ends_at, capacity, confirmed, status, title, opportunity_id): (
        String,
        String,
        i64,
        i64,
        String,
        String,
        String,
    ) = conn
        .query_row(
            "SELECT s.starts_at, s.ends_at, s.capacity, s.confirmed,
                    s.status, o.title, s.opportunity_id
             FROM shifts s JOIN opportunities o ON o.id = s.opportunity_id
             WHERE s.id = ?1",
            params![shift_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                ))
            },
        )
        .optional()?
        .ok_or_else(|| CoreError::NotFound(format!("Shift {shift_id}")))?;
    Ok(ShiftRules {
        starts_at: chrono::DateTime::parse_from_rfc3339(&starts_at)?,
        ends_at: chrono::DateTime::parse_from_rfc3339(&ends_at)?,
        capacity,
        confirmed,
        status,
        title,
        opportunity_id,
    })
}

fn demo_now_datetime(conn: &Connection) -> Result<chrono::DateTime<chrono::FixedOffset>> {
    Ok(chrono::DateTime::parse_from_rfc3339(&demo_now(conn)?)?)
}

fn shift_availability_key(conn: &Connection, shift_id: &str) -> Result<String> {
    let shift_start: String = conn.query_row(
        "SELECT starts_at FROM shifts WHERE id = ?1",
        params![shift_id],
        |row| row.get(0),
    )?;
    let start = chrono::DateTime::parse_from_rfc3339(&shift_start)?;
    let day = day_key(start.date_naive());
    let period = if start.hour() < 12 {
        "morning"
    } else if start.hour() < 17 {
        "afternoon"
    } else {
        "evening"
    };
    Ok(format!("{day}:{period}"))
}

fn volunteer_status(conn: &Connection, volunteer_id: &str) -> Result<String> {
    conn.query_row(
        "SELECT status FROM volunteers WHERE id = ?1",
        params![volunteer_id],
        |row| row.get(0),
    )
    .optional()?
    .ok_or_else(|| CoreError::NotFound(format!("Volunteer {volunteer_id}")))
}

fn role_requirement(
    conn: &Connection,
    shift_id: &str,
    role: &str,
) -> Result<(Option<String>, Option<String>, Option<i64>)> {
    let row = conn
        .query_row(
            "SELECT rr.skill, ct.name, rr.minimum_age
             FROM role_requirements rr
             LEFT JOIN credential_types ct ON ct.id = rr.credential_type_id
             WHERE rr.shift_id = ?1 AND rr.role_name = ?2",
            params![shift_id, role],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?;
    Ok(row.unwrap_or((None, None, None)))
}

fn has_skill(conn: &Connection, volunteer_id: &str, skill: &str) -> Result<bool> {
    Ok(conn
        .query_row(
            "SELECT 1 FROM volunteer_skills WHERE volunteer_id = ?1 AND lower(skill) = lower(?2)",
            params![volunteer_id, skill],
            |_| Ok(()),
        )
        .optional()?
        .is_some())
}

fn has_credential(
    conn: &Connection,
    volunteer_id: &str,
    credential: &str,
    on_date: &str,
) -> Result<bool> {
    Ok(conn
        .query_row(
            "SELECT 1 FROM volunteer_credentials vc
             JOIN credential_types ct ON ct.id = vc.credential_type_id
             WHERE vc.volunteer_id = ?1 AND ct.name = ?2 AND vc.valid_through >= ?3",
            params![volunteer_id, credential, on_date],
            |_| Ok(()),
        )
        .optional()?
        .is_some())
}

fn volunteer_age(
    conn: &Connection,
    volunteer_id: &str,
    on_date: chrono::NaiveDate,
) -> Result<Option<i64>> {
    let raw: Option<String> = conn.query_row(
        "SELECT birthdate FROM volunteers WHERE id = ?1",
        params![volunteer_id],
        |row| row.get(0),
    )?;
    let Some(raw) = raw else { return Ok(None) };
    let Ok(birthdate) = chrono::NaiveDate::parse_from_str(&raw, "%Y-%m-%d") else {
        return Ok(None);
    };
    Ok(Some(age_on(birthdate, on_date)))
}

fn ensure_available(conn: &Connection, volunteer_id: &str, shift_id: &str) -> Result<()> {
    let key = shift_availability_key(conn, shift_id)?;
    let has_rules: i64 = conn.query_row(
        "SELECT COUNT(*) FROM availability_rules WHERE volunteer_id = ?1",
        params![volunteer_id],
        |row| row.get(0),
    )?;
    if has_rules > 0 {
        let matched: i64 = conn.query_row(
            "SELECT COUNT(*) FROM availability_rules
             WHERE volunteer_id = ?1
               AND day = ?2 AND period = ?3",
            params![
                volunteer_id,
                key.split(':').next().unwrap_or_default(),
                key.split(':').nth(1).unwrap_or_default()
            ],
            |row| row.get(0),
        )?;
        if matched == 0 {
            return Err(CoreError::rule(
                "VOLUNTEER_UNAVAILABLE",
                "This volunteer is not available for that day and time.",
                Some("availability".into()),
                Some("EDIT_AVAILABILITY".into()),
            ));
        }
    }
    Ok(())
}

fn ensure_no_overlap(conn: &Connection, volunteer_id: &str, shift_id: &str) -> Result<()> {
    let starts_at: String = conn.query_row(
        "SELECT starts_at FROM shifts WHERE id = ?1",
        params![shift_id],
        |row| row.get(0),
    )?;
    let ends_at: String = conn.query_row(
        "SELECT ends_at FROM shifts WHERE id = ?1",
        params![shift_id],
        |row| row.get(0),
    )?;
    let candidate_start = chrono::DateTime::parse_from_rfc3339(&starts_at)?;
    let candidate_end = chrono::DateTime::parse_from_rfc3339(&ends_at)?;
    let mut statement = conn.prepare(
        "SELECT s.starts_at, s.ends_at, o.title
         FROM registrations r
         JOIN shifts s ON s.id = r.shift_id
         JOIN opportunities o ON o.id = s.opportunity_id
         WHERE r.volunteer_id = ?1 AND r.status = 'registered' AND r.shift_id <> ?2",
    )?;
    let mut rows = statement.query(params![volunteer_id, shift_id])?;
    while let Some(row) = rows.next()? {
        let existing_start: String = row.get(0)?;
        let existing_end: String = row.get(1)?;
        let title: String = row.get(2)?;
        let Ok(existing_start) = chrono::DateTime::parse_from_rfc3339(&existing_start) else {
            continue;
        };
        let Ok(existing_end) = chrono::DateTime::parse_from_rfc3339(&existing_end) else {
            continue;
        };
        if existing_start < candidate_end && candidate_start < existing_end {
            return Err(CoreError::rule(
                "SHIFT_TIME_CONFLICT",
                format!("This volunteer is already assigned to {title} during that time."),
                Some("shiftId".into()),
                Some("FIND_REPLACEMENT".into()),
            ));
        }
    }
    Ok(())
}

pub(crate) fn validate_registration(
    conn: &Connection,
    shift_id: &str,
    volunteer_id: &str,
    role: &str,
) -> Result<ShiftRules> {
    let shift = shift_rules(conn, shift_id)?;
    if shift.status != "scheduled" {
        return Err(CoreError::rule(
            "SHIFT_CLOSED",
            "This shift is no longer accepting registrations.",
            Some("shiftId".into()),
            None,
        ));
    }
    if shift.starts_at <= demo_now_datetime(conn)? {
        return Err(CoreError::rule(
            "REGISTRATION_CLOSED",
            "Registration closed when the shift began.",
            Some("shiftId".into()),
            Some("FIND_ANOTHER_SHIFT".into()),
        ));
    }
    if volunteer_status(conn, volunteer_id)? != "active" {
        return Err(CoreError::rule(
            "VOLUNTEER_INACTIVE",
            "Only active volunteers can register for shifts.",
            Some("volunteerId".into()),
            Some("FINISH_ONBOARDING".into()),
        ));
    }

    let role_row: Option<(i64, i64)> = conn
        .query_row(
            "SELECT required, filled FROM shift_roles WHERE shift_id = ?1 AND name = ?2",
            params![shift_id, role],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;
    let Some((required, filled)) = role_row else {
        return Err(CoreError::rule(
            "ROLE_NOT_FOUND",
            "That role is not part of this shift.",
            Some("role".into()),
            Some("CHOOSE_ROLE".into()),
        ));
    };
    if filled >= required {
        return Err(CoreError::rule(
            "ROLE_FULL",
            "That role is already filled.",
            Some("role".into()),
            Some("JOIN_WAITLIST".into()),
        ));
    }

    let (skill, credential, minimum_age) = role_requirement(conn, shift_id, role)?;
    if let Some(skill) = &skill {
        if !has_skill(conn, volunteer_id, skill)? {
            return Err(CoreError::rule(
                "MISSING_SKILL",
                format!("This role requires the {skill} skill."),
                Some("role".into()),
                Some("CHOOSE_ANOTHER_ROLE".into()),
            ));
        }
    }
    if let Some(credential) = &credential {
        let valid_through = shift.starts_at.format("%Y-%m-%d").to_string();
        if !has_credential(conn, volunteer_id, credential, &valid_through)? {
            return Err(CoreError::rule(
                "CREDENTIAL_EXPIRED",
                format!("This role needs a valid {credential} on the shift date."),
                Some("credentials".into()),
                Some("RENEW_CREDENTIAL".into()),
            ));
        }
    }
    if let Some(minimum_age) = minimum_age {
        match volunteer_age(conn, volunteer_id, shift.starts_at.date_naive())? {
            Some(age) if age >= minimum_age => {}
            Some(_) => {
                return Err(CoreError::rule(
                    "AGE_REQUIREMENT",
                    format!(
                    "This role requires volunteers to be {minimum_age} or older on the shift date."
                ),
                    Some("birthdate".into()),
                    None,
                ))
            }
            None => {
                return Err(CoreError::rule(
                    "BIRTHDATE_REQUIRED",
                    "Add a birthdate to confirm this volunteer meets the role's age requirement.",
                    Some("birthdate".into()),
                    Some("EDIT_PROFILE".into()),
                ))
            }
        }
    }
    ensure_available(conn, volunteer_id, shift_id)?;
    ensure_no_overlap(conn, volunteer_id, shift_id)?;

    if shift.confirmed >= shift.capacity {
        return Err(CoreError::rule(
            "SHIFT_FULL",
            "This shift is full.",
            Some("shiftId".into()),
            Some("JOIN_WAITLIST".into()),
        ));
    }
    Ok(shift)
}

pub fn save_report_view(
    conn: &Connection,
    name: &str,
    scope: &str,
    filters_json: &str,
) -> Result<WorkspaceSnapshot> {
    let name = name.trim();
    if name.chars().count() < 2 || name.chars().count() > 80 {
        return Err(CoreError::Validation(
            "Saved view names must be 2–80 characters.".into(),
        ));
    }
    if !["records", "reports"].contains(&scope) {
        return Err(CoreError::Validation("Unknown saved-view scope.".into()));
    }
    let filters: serde_json::Value = serde_json::from_str(filters_json)?;
    if !filters.is_object() {
        return Err(CoreError::Validation(
            "Saved view filters must be a JSON object.".into(),
        ));
    }
    let owner = current_volunteer_id(conn)?;
    conn.execute(
        "INSERT INTO report_saved_views (id, owner_id, scope, name, filters_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(owner_id, scope, name) DO UPDATE SET filters_json = excluded.filters_json",
        params![
            uuid::Uuid::new_v4().to_string(),
            owner,
            scope,
            name,
            filters_json,
            demo_now(conn)?,
        ],
    )?;
    append_audit(
        conn,
        "report.view_saved",
        "system",
        name,
        format!("Saved report view {name}"),
        Some(format!("Scope: {scope}")),
    )?;
    snapshot(conn)
}

pub fn set_saved_opportunity(
    conn: &Connection,
    opportunity_id: &str,
    saved: bool,
) -> Result<WorkspaceSnapshot> {
    let title: String = conn
        .query_row(
            "SELECT title FROM opportunities WHERE id = ?1",
            params![opportunity_id],
            |row| row.get(0),
        )
        .optional()?
        .ok_or_else(|| CoreError::NotFound(format!("Opportunity {opportunity_id}")))?;
    let volunteer_id = current_volunteer_id(conn)?;
    let changed = if saved {
        conn.execute(
            "INSERT OR IGNORE INTO saved_opportunities
             (volunteer_id, opportunity_id, saved_at) VALUES (?1, ?2, ?3)",
            params![volunteer_id, opportunity_id, demo_now(conn)?],
        )? > 0
    } else {
        conn.execute(
            "DELETE FROM saved_opportunities WHERE volunteer_id = ?1 AND opportunity_id = ?2",
            params![volunteer_id, opportunity_id],
        )? > 0
    };
    if changed {
        append_audit(
            conn,
            if saved {
                "opportunity.save"
            } else {
                "opportunity.unsave"
            },
            "opportunity",
            opportunity_id,
            if saved {
                format!("Saved {title}")
            } else {
                format!("Removed {title} from saved opportunities")
            },
            None,
        )?;
    }
    snapshot(conn)
}

pub fn set_application_stage(
    conn: &Connection,
    application_id: &str,
    stage: &str,
) -> Result<WorkspaceSnapshot> {
    if !APPLICATION_STAGES.contains(&stage) {
        return Err(CoreError::Validation(format!(
            "Unknown application stage: {stage}"
        )));
    }
    let (name, current): (String, String) = conn
        .query_row(
            "SELECT name, stage FROM applications WHERE id = ?1",
            params![application_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?
        .ok_or_else(|| CoreError::NotFound(format!("Application {application_id}")))?;
    if current == stage {
        return snapshot(conn);
    }
    conn.execute(
        "UPDATE applications SET stage = ?1 WHERE id = ?2",
        params![stage, application_id],
    )?;
    conn.execute(
        "INSERT INTO volunteer_stage_history
         (id, application_id, from_stage, to_stage, changed_at, changed_by, note)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL)",
        params![
            uuid::Uuid::new_v4().to_string(),
            application_id,
            &current,
            stage,
            demo_now(conn)?,
            coordinator_name(conn)?,
        ],
    )?;
    let label = match stage {
        "applied" => "Applied",
        "review" => "Review",
        "onboarding" => "Onboarding",
        "active" => "Active",
        _ => stage,
    };
    append_audit(
        conn,
        "application.stage",
        "volunteer",
        application_id,
        format!("Moved {name} to {label}"),
        Some(format!("Previously {current}")),
    )?;
    snapshot(conn)
}

pub fn get_checkin_code(conn: &Connection, shift_id: &str) -> Result<CheckinCode> {
    ensure_shift(conn, shift_id)?;
    let now = demo_now_datetime(conn)?;
    if let Some(row) = conn
        .query_row(
            "SELECT code, token, issued_at, expires_at FROM checkin_codes
             WHERE shift_id = ?1 AND active = 1",
            params![shift_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            },
        )
        .optional()?
    {
        if let Ok(expires) = chrono::DateTime::parse_from_rfc3339(&row.3) {
            if expires > now {
                return Ok(CheckinCode {
                    shift_id: shift_id.into(),
                    code: row.0,
                    token: row.1.clone(),
                    issued_at: row.2,
                    expires_at: row.3,
                    payload: format!("civicflow://checkin/{}", row.1),
                });
            }
        }
    }

    conn.execute(
        "UPDATE checkin_codes SET active = 0 WHERE shift_id = ?1 AND active = 1",
        params![shift_id],
    )?;
    // Demo mode is deterministic but still per-shift and per-rotation window.
    // The code is not one global constant: two shifts never share it, and it
    // changes when the 15-minute window rolls over.
    let window = now.timestamp() / (15 * 60);
    let code = demo_checkin_code(shift_id, window);
    let token = uuid::Uuid::new_v4().to_string();
    let issued_at = now.to_rfc3339();
    let expires_at = (now + chrono::Duration::minutes(15)).to_rfc3339();
    conn.execute(
        "INSERT INTO checkin_codes
         (id, shift_id, code, token, issued_at, expires_at, consumed_at, created_by, active)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7, 1)",
        params![
            uuid::Uuid::new_v4().to_string(),
            shift_id,
            code,
            token,
            issued_at,
            expires_at,
            coordinator_name(conn)?,
        ],
    )?;
    Ok(CheckinCode {
        shift_id: shift_id.into(),
        code,
        payload: format!("civicflow://checkin/{token}"),
        token,
        issued_at,
        expires_at,
    })
}

fn demo_checkin_code(shift_id: &str, window: i64) -> String {
    let seed = format!("{shift_id}:{window}");
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in seed.bytes() {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{:06}", hash % 1_000_000)
}

fn code_matches(conn: &Connection, shift_id: &str, code: &str) -> Result<bool> {
    let row: Option<(String, String, String)> = conn
        .query_row(
            "SELECT code, token, expires_at FROM checkin_codes
             WHERE shift_id = ?1 AND active = 1 ORDER BY issued_at DESC LIMIT 1",
            params![shift_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?;
    let Some((expected, token, expires_at)) = row else {
        return Ok(false);
    };
    let supplied = code.trim();
    let token_supplied = supplied
        .strip_prefix("civicflow://checkin/")
        .unwrap_or(supplied);
    if expected != supplied && token != token_supplied {
        return Ok(false);
    }
    let expires = chrono::DateTime::parse_from_rfc3339(&expires_at)?;
    Ok(expires >= demo_now_datetime(conn)?)
}

fn validate_checkin_window(conn: &Connection, shift: &ShiftRules) -> Result<()> {
    let now = demo_now_datetime(conn)?;
    if now < shift.starts_at - chrono::Duration::minutes(30) {
        return Err(CoreError::rule(
            "CHECKIN_TOO_EARLY",
            "Check-in opens 30 minutes before the shift starts.",
            Some("shiftId".into()),
            Some("WAIT_FOR_WINDOW".into()),
        ));
    }
    if now > shift.ends_at {
        return Err(CoreError::rule(
            "CHECKIN_CLOSED",
            "This shift has ended and can no longer accept check-ins.",
            Some("shiftId".into()),
            Some("MANUAL_CORRECTION".into()),
        ));
    }
    Ok(())
}

pub fn check_in(
    conn: &Connection,
    shift_id: &str,
    volunteer_id: &str,
    code: Option<&str>,
) -> Result<WorkspaceSnapshot> {
    let name = volunteer_name(conn, volunteer_id)?;
    let shift = shift_rules(conn, shift_id)?;
    validate_checkin_window(conn, &shift)?;
    if let Some(code) = code {
        if !code_matches(conn, shift_id, code)? {
            return Err(CoreError::rule(
                "INVALID_CHECKIN_CODE",
                "That code is not active for this shift.",
                Some("code".into()),
                Some("ASK_SHIFT_LEAD".into()),
            ));
        }
    }

    let existing: Option<(String, String)> = conn
        .query_row(
            "SELECT role, status FROM attendance_events
             WHERE shift_id = ?1 AND volunteer_id = ?2",
            params![shift_id, volunteer_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;
    if let Some((_, status)) = &existing {
        if status != "expected" {
            return snapshot(conn);
        }
    }

    let registration: Option<String> = conn
        .query_row(
            "SELECT role FROM registrations
             WHERE shift_id = ?1 AND volunteer_id = ?2 AND status = 'registered'",
            params![shift_id, volunteer_id],
            |row| row.get(0),
        )
        .optional()?;
    let Some(role) = registration else {
        return Err(CoreError::rule(
            "NOT_REGISTERED",
            "This volunteer is not registered for that shift.",
            Some("shiftId".into()),
            Some("REGISTER_FIRST".into()),
        ));
    };

    let now = demo_now(conn)?;
    let transaction = conn.unchecked_transaction()?;
    transaction.execute(
        "INSERT INTO attendance_events
         (shift_id, volunteer_id, role, status, checked_in_at, checked_out_at, recorded_at)
         VALUES (?1, ?2, ?3, 'checked_in', ?4, NULL, ?4)
         ON CONFLICT(shift_id, volunteer_id) DO UPDATE SET
           role = excluded.role,
           status = 'checked_in',
           checked_in_at = excluded.checked_in_at,
           checked_out_at = NULL,
           recorded_at = excluded.recorded_at",
        params![shift_id, volunteer_id, role, now],
    )?;
    transaction.execute(
        "INSERT INTO attendance_ledger (id, shift_id, volunteer_id, event_type, actor, note, at)
         VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6)",
        params![
            uuid::Uuid::new_v4().to_string(),
            shift_id,
            volunteer_id,
            if code.is_some() {
                "check_in"
            } else {
                "manual_check_in"
            },
            coordinator_name(conn)?,
            now,
        ],
    )?;
    append_audit(
        &transaction,
        if code.is_some() {
            "shift.checkin"
        } else {
            "shift.manual_checkin"
        },
        "shift",
        shift_id,
        format!("Checked in {name}"),
        Some(format!("Role: {role}")),
    )?;
    transaction.commit()?;
    snapshot(conn)
}

fn issue_verification(
    conn: &Connection,
    entry_id: &str,
    volunteer_id: &str,
    date: &str,
    minutes: i64,
) -> Result<String> {
    let year = date.get(..4).unwrap_or("2026");
    let code = format!(
        "CFV-{}-{:06}",
        year,
        uuid::Uuid::new_v4().as_u128() % 1_000_000
    );
    let organization_id: String =
        conn.query_row("SELECT id FROM organizations LIMIT 1", [], |row| row.get(0))?;
    conn.execute(
        "INSERT INTO service_verifications
         (id, code, volunteer_id, organization_id, date_start, date_end, total_minutes,
          issued_at, issued_by)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?6, ?7, ?8)",
        params![
            uuid::Uuid::new_v4().to_string(),
            code,
            volunteer_id,
            organization_id,
            date,
            minutes,
            demo_now(conn)?,
            coordinator_name(conn)?,
        ],
    )?;
    conn.execute(
        "UPDATE hour_entries SET verification_id = ?1 WHERE id = ?2",
        params![code, entry_id],
    )?;
    Ok(code)
}

pub fn check_out(
    conn: &Connection,
    shift_id: &str,
    volunteer_id: &str,
) -> Result<WorkspaceSnapshot> {
    let name = volunteer_name(conn, volunteer_id)?;
    let shift = shift_rules(conn, shift_id)?;
    let existing: Option<(String, String, Option<String>)> = conn
        .query_row(
            "SELECT role, status, checked_in_at FROM attendance_events
             WHERE shift_id = ?1 AND volunteer_id = ?2",
            params![shift_id, volunteer_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?;
    let Some((_role, status, checked_in_at)) = existing else {
        return Err(CoreError::rule(
            "CHECKOUT_BEFORE_CHECKIN",
            "Check this volunteer in before checking them out.",
            Some("shiftId".into()),
            None,
        ));
    };
    if status == "completed" {
        return snapshot(conn);
    }
    if status != "checked_in" {
        return Err(CoreError::rule(
            "CHECKOUT_BEFORE_CHECKIN",
            "Check this volunteer in before checking them out.",
            Some("shiftId".into()),
            None,
        ));
    }
    let now_dt = demo_now_datetime(conn)?;
    let now = now_dt.to_rfc3339();
    let checked_in = checked_in_at
        .as_deref()
        .and_then(|raw| chrono::DateTime::parse_from_rfc3339(raw).ok())
        .unwrap_or(now_dt);
    let calculated_minutes = (now_dt - checked_in).num_minutes().clamp(1, 1440);
    let scheduled_minutes = (shift.ends_at - shift.starts_at)
        .num_minutes()
        .clamp(1, 1440);

    let transaction = conn.unchecked_transaction()?;
    transaction.execute(
        "UPDATE attendance_events
         SET status = 'completed', checked_out_at = ?1, recorded_at = ?1
         WHERE shift_id = ?2 AND volunteer_id = ?3",
        params![&now, shift_id, volunteer_id],
    )?;
    transaction.execute(
        "INSERT INTO attendance_ledger (id, shift_id, volunteer_id, event_type, actor, note, at)
         VALUES (?1, ?2, ?3, 'check_out', ?4, NULL, ?5)",
        params![
            uuid::Uuid::new_v4().to_string(),
            shift_id,
            volunteer_id,
            coordinator_name(conn)?,
            &now,
        ],
    )?;

    let existing_entry: Option<String> = transaction
        .query_row(
            "SELECT id FROM hour_entries WHERE source_shift_id = ?1 AND volunteer_id = ?2",
            params![shift_id, volunteer_id],
            |row| row.get(0),
        )
        .optional()?;
    let requires_approval = flag(conn, "setting.hours_require_approval", true)?;
    let mut entry_id = existing_entry.clone();
    if existing_entry.is_none() {
        let id = uuid::Uuid::new_v4().to_string();
        let date = now.get(..10).unwrap_or_default().to_string();
        transaction.execute(
            "INSERT INTO hour_entries
             (id, volunteer_id, opportunity_id, date, minutes, status, verification_id,
              scheduled_minutes, calculated_minutes, source_shift_id, note)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7, ?8, ?9, ?10)",
            params![
                id,
                volunteer_id,
                shift.opportunity_id,
                date,
                calculated_minutes,
                if requires_approval {
                    "pending"
                } else {
                    "verified"
                },
                scheduled_minutes,
                calculated_minutes,
                shift_id,
                "Calculated from check-in and check-out",
            ],
        )?;
        if !requires_approval {
            issue_verification(&transaction, &id, volunteer_id, &date, calculated_minutes)?;
        }
        entry_id = Some(id);
    }
    append_audit(
        &transaction,
        "shift.checkout",
        "shift",
        shift_id,
        format!("Checked out {name}"),
        Some(format!("{} calculated minutes", calculated_minutes)),
    )?;
    transaction.commit()?;

    if let Some(entry_id) = entry_id {
        if requires_approval {
            append_notification(
                conn,
                "HOURS_SUBMITTED",
                "Hours need review",
                &format!("{} submitted {}", name, format_minutes(calculated_minutes)),
                "normal",
                "/coordinator/hours",
                NotificationTarget {
                    audience: "coordinator",
                    volunteer_id: None,
                },
            )?;
            let _ = entry_id;
        } else {
            append_notification(
                conn,
                "HOURS_APPROVED",
                "Hours verified",
                &format!(
                    "{} of service was verified for {}.",
                    format_minutes(calculated_minutes),
                    name
                ),
                "normal",
                "/volunteer/hours",
                NotificationTarget {
                    audience: "volunteer",
                    volunteer_id: Some(volunteer_id),
                },
            )?;
        }
    }
    snapshot(conn)
}

fn format_minutes(minutes: i64) -> String {
    format!("{}h {:02}m", minutes / 60, minutes % 60)
}

pub fn mark_no_show(
    conn: &Connection,
    shift_id: &str,
    volunteer_id: &str,
) -> Result<WorkspaceSnapshot> {
    ensure_shift(conn, shift_id)?;
    let name = volunteer_name(conn, volunteer_id)?;
    let role: Option<String> = conn
        .query_row(
            "SELECT role FROM attendance_events WHERE shift_id = ?1 AND volunteer_id = ?2",
            params![shift_id, volunteer_id],
            |row| row.get(0),
        )
        .optional()?;
    let role = role.unwrap_or(volunteer_role(conn, volunteer_id)?);
    conn.execute(
        "INSERT INTO attendance_events
         (shift_id, volunteer_id, role, status, checked_in_at, checked_out_at, recorded_at)
         VALUES (?1, ?2, ?3, 'no_show', NULL, NULL, ?4)
         ON CONFLICT(shift_id, volunteer_id) DO UPDATE SET
           role = excluded.role,
           status = 'no_show',
           checked_in_at = NULL,
           checked_out_at = NULL,
           recorded_at = excluded.recorded_at",
        params![shift_id, volunteer_id, role, demo_now(conn)?],
    )?;
    append_audit(
        conn,
        "shift.no_show",
        "shift",
        shift_id,
        format!("Marked {name} as a no-show"),
        None,
    )?;
    snapshot(conn)
}

pub fn promote_waitlist(
    conn: &Connection,
    shift_id: &str,
    volunteer_id: &str,
) -> Result<WorkspaceSnapshot> {
    ensure_shift(conn, shift_id)?;
    let name = volunteer_name(conn, volunteer_id)?;
    let entry: Option<(String, String, String)> = conn
        .query_row(
            "SELECT id, status, eligible_role FROM waitlist_entries
             WHERE shift_id = ?1 AND volunteer_id = ?2",
            params![shift_id, volunteer_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?;
    let Some((entry_id, status, role)) = entry else {
        return Err(CoreError::NotFound(format!(
            "Waitlist entry for {volunteer_id} on {shift_id}"
        )));
    };
    if status != "waiting" {
        return snapshot(conn);
    }
    validate_registration(conn, shift_id, volunteer_id, &role)?;
    let transaction = conn.unchecked_transaction()?;
    transaction.execute(
        "UPDATE waitlist_entries SET status = 'promoted' WHERE id = ?1",
        params![entry_id],
    )?;
    transaction.execute(
        "INSERT INTO registrations (shift_id, volunteer_id, role, created_at, status, updated_at)
         VALUES (?1, ?2, ?3, ?4, 'registered', ?4)
         ON CONFLICT(shift_id, volunteer_id) DO UPDATE SET
           role = excluded.role, status = 'registered', updated_at = excluded.updated_at",
        params![shift_id, volunteer_id, role, demo_now(conn)?],
    )?;
    transaction.execute(
        "UPDATE shifts SET confirmed = confirmed + 1 WHERE id = ?1",
        params![shift_id],
    )?;
    transaction.execute(
        "UPDATE shift_roles SET filled = filled + 1
         WHERE shift_id = ?1 AND name = ?2 AND filled < required",
        params![shift_id, role],
    )?;
    append_audit(
        &transaction,
        "waitlist.promote",
        "shift",
        shift_id,
        format!("Promoted {name} from the waitlist"),
        Some(format!("Role: {role}")),
    )?;
    transaction.commit()?;
    append_notification(
        conn,
        "WAITLIST_PROMOTED",
        "You are off the waitlist",
        &format!("A seat opened for {name}. The shift is now confirmed."),
        "high",
        "/volunteer/schedule",
        NotificationTarget {
            audience: "volunteer",
            volunteer_id: Some(volunteer_id),
        },
    )?;
    snapshot(conn)
}

pub fn review_hours(
    conn: &Connection,
    entry_id: &str,
    status: &str,
    approved_minutes: Option<i64>,
    reason: &str,
) -> Result<WorkspaceSnapshot> {
    if status != "verified" && status != "rejected" {
        return Err(CoreError::Validation(format!(
            "Hours review must be verified or rejected, not {status}"
        )));
    }
    let reason = reason.trim();
    if reason.is_empty() {
        return Err(CoreError::Validation(
            "A review note is required for hours decisions".into(),
        ));
    }
    let (current, volunteer_id, entry_date): (String, String, String) = conn
        .query_row(
            "SELECT status, volunteer_id, date FROM hour_entries WHERE id = ?1",
            params![entry_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?
        .ok_or_else(|| CoreError::NotFound(format!("Hour entry {entry_id}")))?;
    if current != "pending" {
        return Err(CoreError::Validation(
            "Only pending hours can be reviewed".into(),
        ));
    }
    let approved = match status {
        "verified" => {
            let minutes = approved_minutes.ok_or_else(|| {
                CoreError::Validation("Approved hours need an approved minute value".into())
            })?;
            if !(1..=1440).contains(&minutes) {
                return Err(CoreError::Validation(
                    "Approved minutes must be between 1 and 1440".into(),
                ));
            }
            Some(minutes)
        }
        _ => None,
    };
    let reviewer = coordinator_name(conn)?;
    conn.execute(
        "UPDATE hour_entries
         SET status = ?1, approved_minutes = ?2, reviewed_at = ?3, reviewer = ?4,
             review_reason = ?5
         WHERE id = ?6",
        params![
            status,
            approved,
            demo_now(conn)?,
            reviewer,
            reason,
            entry_id
        ],
    )?;
    let volunteer = volunteer_name(conn, &volunteer_id)?;
    if status == "verified" {
        issue_verification(
            conn,
            entry_id,
            &volunteer_id,
            &entry_date,
            approved.unwrap_or_default(),
        )?;
        append_notification(
            conn,
            "HOURS_APPROVED",
            "Hours approved",
            &format!(
                "{} of service was approved for {}.",
                format_minutes(approved.unwrap_or_default()),
                volunteer
            ),
            "normal",
            "/volunteer/hours",
            NotificationTarget {
                audience: "volunteer",
                volunteer_id: Some(&volunteer_id),
            },
        )?;
    } else {
        append_notification(
            conn,
            "HOURS_ADJUSTED",
            "Hours need another look",
            &format!("{}'s submission was not approved: {}", volunteer, reason),
            "normal",
            "/volunteer/hours",
            NotificationTarget {
                audience: "volunteer",
                volunteer_id: Some(&volunteer_id),
            },
        )?;
    }
    append_audit(
        conn,
        if status == "verified" {
            "hours.approve"
        } else {
            "hours.reject"
        },
        "hours",
        entry_id,
        if status == "verified" {
            format!(
                "Approved {} minutes for {volunteer}",
                approved.unwrap_or_default()
            )
        } else {
            format!("Rejected submitted hours for {volunteer}")
        },
        Some(reason.to_string()),
    )?;
    snapshot(conn)
}

fn validate_settings(settings: &WorkspaceSettings) -> Result<()> {
    if settings.organization_name.trim().is_empty() {
        return Err(CoreError::Validation(
            "Organization name is required".into(),
        ));
    }
    if !settings.contact_email.contains('@') {
        return Err(CoreError::Validation("Enter a valid contact email".into()));
    }
    if !["monday", "sunday"].contains(&settings.week_starts_on.as_str()) {
        return Err(CoreError::Validation("Unknown week start".into()));
    }
    if !(30..=600).contains(&settings.default_shift_length) {
        return Err(CoreError::Validation(
            "Default shift length must be between 30 and 600 minutes".into(),
        ));
    }
    if !["daily", "weekly", "off"].contains(&settings.email_digest.as_str()) {
        return Err(CoreError::Validation("Unknown email digest".into()));
    }
    if !["standard", "large", "larger"].contains(&settings.text_scale.as_str()) {
        return Err(CoreError::Validation("Unknown text scale".into()));
    }
    if settings.timezone.trim().is_empty() {
        return Err(CoreError::Validation("Timezone is required".into()));
    }
    Ok(())
}

fn write_setting(conn: &Connection, key: &str, value: String) -> Result<()> {
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

pub fn update_settings(conn: &Connection, patch: SettingsPatch) -> Result<WorkspaceSnapshot> {
    let mut settings = load_settings(conn)?;
    if let Some(value) = patch.organization_name {
        settings.organization_name = value.trim().to_string();
    }
    if let Some(value) = patch.contact_email {
        settings.contact_email = value.trim().to_string();
    }
    if let Some(value) = patch.timezone {
        settings.timezone = value.trim().to_string();
    }
    if let Some(value) = patch.week_starts_on {
        settings.week_starts_on = value;
    }
    if let Some(value) = patch.default_shift_length {
        settings.default_shift_length = value;
    }
    if let Some(value) = patch.auto_promote_waitlist {
        settings.auto_promote_waitlist = value;
    }
    if let Some(value) = patch.hours_require_approval {
        settings.hours_require_approval = value;
    }
    if let Some(value) = patch.email_digest {
        settings.email_digest = value;
    }
    if let Some(value) = patch.text_scale {
        settings.text_scale = value;
    }
    if let Some(value) = patch.high_contrast {
        settings.high_contrast = value;
    }
    if let Some(value) = patch.reduced_motion {
        settings.reduced_motion = value;
    }
    if let Some(value) = patch.underline_links {
        settings.underline_links = value;
    }
    if let Some(value) = patch.colour_independent {
        settings.colour_independent = value;
    }
    validate_settings(&settings)?;

    conn.execute(
        "UPDATE organizations SET name = ?1, email = ?2, timezone = ?3",
        params![
            settings.organization_name,
            settings.contact_email,
            settings.timezone
        ],
    )?;
    let pairs = [
        ("setting.week_starts_on", settings.week_starts_on.clone()),
        (
            "setting.default_shift_length",
            settings.default_shift_length.to_string(),
        ),
        (
            "setting.auto_promote_waitlist",
            settings.auto_promote_waitlist.to_string(),
        ),
        (
            "setting.hours_require_approval",
            settings.hours_require_approval.to_string(),
        ),
        ("setting.email_digest", settings.email_digest.clone()),
        ("setting.text_scale", settings.text_scale.clone()),
        ("setting.high_contrast", settings.high_contrast.to_string()),
        (
            "setting.reduced_motion",
            settings.reduced_motion.to_string(),
        ),
        (
            "setting.underline_links",
            settings.underline_links.to_string(),
        ),
        (
            "setting.colour_independent",
            settings.colour_independent.to_string(),
        ),
    ];
    for (key, value) in pairs {
        write_setting(conn, key, value)?;
    }
    append_audit(
        conn,
        "settings.update",
        "settings",
        "workspace",
        "Updated workspace settings".into(),
        None,
    )?;
    snapshot(conn)
}

fn slugify(title: &str) -> String {
    let mut slug = String::new();
    let mut last_dash = true;
    for character in title.chars() {
        if character.is_ascii_alphanumeric() {
            slug.push(character.to_ascii_lowercase());
            last_dash = false;
        } else if !last_dash {
            slug.push('-');
            last_dash = true;
        }
    }
    let slug = slug.trim_matches('-').to_string();
    if slug.is_empty() {
        "program".to_string()
    } else {
        slug
    }
}

fn unique_slug(conn: &Connection, title: &str) -> Result<String> {
    let base = slugify(title);
    let exists: Option<String> = conn
        .query_row(
            "SELECT slug FROM opportunities WHERE slug = ?1",
            params![base],
            |row| row.get(0),
        )
        .optional()?;
    if exists.is_none() {
        return Ok(base);
    }
    let suffix = &uuid::Uuid::new_v4().to_string()[..6];
    Ok(format!("{base}-{suffix}"))
}

pub fn create_opportunity(
    conn: &Connection,
    input: NewOpportunityInput,
) -> Result<CreateOpportunityResult> {
    let title = input.title.trim();
    if title.is_empty() {
        return Err(CoreError::Validation("Give the opportunity a name".into()));
    }
    if input.description.trim().len() < 20 {
        return Err(CoreError::Validation(
            "Write at least one sentence about what volunteers will do".into(),
        ));
    }
    if !(1..=200).contains(&input.capacity) {
        return Err(CoreError::Validation(
            "Capacity must be between 1 and 200 volunteers".into(),
        ));
    }
    if input.address.trim().is_empty() {
        return Err(CoreError::Validation(
            "Add the location where volunteers should arrive".into(),
        ));
    }
    if !CAUSES.contains(&input.cause.as_str()) {
        return Err(CoreError::Validation(format!(
            "Unknown cause: {}",
            input.cause
        )));
    }
    let organization_id: String =
        conn.query_row("SELECT id FROM organizations LIMIT 1", [], |row| row.get(0))?;
    let organization_name: String =
        conn.query_row("SELECT name FROM organizations LIMIT 1", [], |row| {
            row.get(0)
        })?;
    let coordinator = coordinator_name(conn)?;
    let image = "/media/opp-community-event.jpg".to_string();
    let image_alt = format!("{title} volunteers at work");
    let id = format!("opp-new-{}", uuid::Uuid::new_v4());
    let slug = unique_slug(conn, title)?;
    let training = vec!["Orientation on arrival".to_string()];
    let requirements: Vec<String> = input
        .requirements
        .into_iter()
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .collect();
    let impact_metric = "New program — impact will be tracked after the first shift".to_string();
    let record = OpportunityRecord {
        id: id.clone(),
        slug,
        title: title.to_string(),
        cause: input.cause.clone(),
        organization: organization_name.clone(),
        image,
        image_alt,
        description: input.description.trim().to_string(),
        address: input.address.trim().to_string(),
        distance_miles: 2.4,
        coordinator: coordinator.clone(),
        capacity: input.capacity,
        duration: input.duration.trim().to_string(),
        training: training.clone(),
        requirements: requirements.clone(),
        impact_metric: impact_metric.clone(),
    };
    conn.execute(
        "INSERT INTO opportunities
         (id, organization_id, slug, title, cause, organization_name, image, image_alt,
          description, address, distance_miles, coordinator, capacity, duration,
          training_json, requirements_json, impact_metric, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16,
                 ?17, ?18)",
        params![
            record.id,
            organization_id,
            record.slug,
            record.title,
            record.cause,
            record.organization,
            record.image,
            record.image_alt,
            record.description,
            record.address,
            record.distance_miles,
            record.coordinator,
            record.capacity,
            record.duration,
            serde_json::to_string(&record.training)?,
            serde_json::to_string(&record.requirements)?,
            record.impact_metric,
            demo_now(conn)?,
        ],
    )?;
    append_audit(
        conn,
        "opportunity.create",
        "opportunity",
        &record.id,
        format!("Created {}", record.title),
        Some(format!("Capacity: {}", record.capacity)),
    )?;
    Ok(CreateOpportunityResult {
        opportunity: record,
        snapshot: snapshot(conn)?,
    })
}

pub fn register_for_shift(
    conn: &Connection,
    shift_id: &str,
    volunteer_id: &str,
    role: &str,
) -> Result<WorkspaceSnapshot> {
    let name = volunteer_name(conn, volunteer_id)?;
    let role = if role.trim().is_empty() {
        volunteer_role(conn, volunteer_id)?
    } else {
        role.trim().to_string()
    };

    let existing: Option<String> = conn
        .query_row(
            "SELECT status FROM registrations WHERE shift_id = ?1 AND volunteer_id = ?2",
            params![shift_id, volunteer_id],
            |row| row.get(0),
        )
        .optional()?;
    if existing.as_deref() == Some("registered") {
        return snapshot(conn);
    }

    let shift = validate_registration(conn, shift_id, volunteer_id, &role)?;
    let transaction = conn.unchecked_transaction()?;
    transaction.execute(
        "INSERT INTO registrations (shift_id, volunteer_id, role, created_at, status, updated_at)
         VALUES (?1, ?2, ?3, ?4, 'registered', ?4)
         ON CONFLICT(shift_id, volunteer_id) DO UPDATE SET
           role = excluded.role, status = 'registered', updated_at = excluded.updated_at",
        params![shift_id, volunteer_id, role, demo_now(conn)?],
    )?;
    transaction.execute(
        "UPDATE shifts SET confirmed = confirmed + 1 WHERE id = ?1",
        params![shift_id],
    )?;
    transaction.execute(
        "UPDATE shift_roles SET filled = filled + 1
         WHERE shift_id = ?1 AND name = ?2 AND filled < required",
        params![shift_id, role],
    )?;
    append_audit(
        &transaction,
        "shift.register",
        "shift",
        shift_id,
        format!("Registered {name} as {role}"),
        Some(format!("Shift starts {}", shift.starts_at)),
    )?;
    transaction.commit()?;
    snapshot(conn)
}

pub fn join_waitlist(
    conn: &Connection,
    shift_id: &str,
    volunteer_id: &str,
    role: &str,
) -> Result<WorkspaceSnapshot> {
    let name = volunteer_name(conn, volunteer_id)?;
    let role = if role.trim().is_empty() {
        volunteer_role(conn, volunteer_id)?
    } else {
        role.trim().to_string()
    };
    let shift = shift_rules(conn, shift_id)?;
    if shift.starts_at <= demo_now_datetime(conn)? {
        return Err(CoreError::rule(
            "REGISTRATION_CLOSED",
            "This shift has already started.",
            Some("shiftId".into()),
            None,
        ));
    }
    let (skill, credential, minimum_age) = role_requirement(conn, shift_id, &role)?;
    if let Some(skill) = &skill {
        if !has_skill(conn, volunteer_id, skill)? {
            return Err(CoreError::rule(
                "MISSING_SKILL",
                format!("This role requires the {skill} skill."),
                Some("role".into()),
                None,
            ));
        }
    }
    if let Some(credential) = &credential {
        let valid_through = shift.starts_at.format("%Y-%m-%d").to_string();
        if !has_credential(conn, volunteer_id, credential, &valid_through)? {
            return Err(CoreError::rule(
                "CREDENTIAL_EXPIRED",
                format!("This role needs a valid {credential} on the shift date."),
                Some("credentials".into()),
                Some("RENEW_CREDENTIAL".into()),
            ));
        }
    }
    if let Some(minimum_age) = minimum_age {
        if volunteer_age(conn, volunteer_id, shift.starts_at.date_naive())?.unwrap_or(0)
            < minimum_age
        {
            return Err(CoreError::rule(
                "AGE_REQUIREMENT",
                format!("This role requires volunteers to be {minimum_age} or older."),
                Some("birthdate".into()),
                None,
            ));
        }
    }
    let position: i64 = conn.query_row(
        "SELECT COALESCE(MAX(position), 0) + 1 FROM waitlist_entries WHERE shift_id = ?1",
        params![shift_id],
        |row| row.get(0),
    )?;
    conn.execute(
        "INSERT INTO waitlist_entries
         (id, shift_id, volunteer_id, created_at, status, position, eligible_role)
         VALUES (?1, ?2, ?3, ?4, 'waiting', ?5, ?6)
         ON CONFLICT(shift_id, volunteer_id) DO UPDATE SET
           status = 'waiting', position = excluded.position, eligible_role = excluded.eligible_role",
        params![
            uuid::Uuid::new_v4().to_string(),
            shift_id,
            volunteer_id,
            demo_now(conn)?,
            position,
            role
        ],
    )?;
    append_audit(
        conn,
        "waitlist.join",
        "shift",
        shift_id,
        format!("Added {name} to the waitlist as {role}"),
        Some(format!("Position {position}")),
    )?;
    append_notification(
        conn,
        "COVERAGE_REQUEST",
        "Waitlist joined",
        &format!("{name} is waiting for a {} seat.", shift.title),
        "normal",
        "/coordinator/schedule",
        NotificationTarget {
            audience: "coordinator",
            volunteer_id: None,
        },
    )?;
    snapshot(conn)
}

pub fn cancel_registration(
    conn: &Connection,
    shift_id: &str,
    volunteer_id: &str,
    reason: &str,
) -> Result<WorkspaceSnapshot> {
    let name = volunteer_name(conn, volunteer_id)?;
    let shift = shift_rules(conn, shift_id)?;
    let role: String = conn
        .query_row(
            "SELECT role FROM registrations
             WHERE shift_id = ?1 AND volunteer_id = ?2 AND status = 'registered'",
            params![shift_id, volunteer_id],
            |row| row.get(0),
        )
        .optional()?
        .ok_or_else(|| {
            CoreError::rule(
                "REGISTRATION_NOT_FOUND",
                "That volunteer is not registered for this shift.",
                Some("shiftId".into()),
                None,
            )
        })?;

    let auto_promote = flag(conn, "setting.auto_promote_waitlist", true)?;
    let transaction = conn.unchecked_transaction()?;
    transaction.execute(
        "UPDATE registrations SET status = 'canceled', updated_at = ?1
         WHERE shift_id = ?2 AND volunteer_id = ?3",
        params![demo_now(conn)?, shift_id, volunteer_id],
    )?;
    transaction.execute(
        "UPDATE shifts SET confirmed = MAX(confirmed - 1, 0) WHERE id = ?1",
        params![shift_id],
    )?;
    transaction.execute(
        "UPDATE shift_roles SET filled = MAX(filled - 1, 0)
         WHERE shift_id = ?1 AND name = ?2",
        params![shift_id, role],
    )?;
    append_audit(
        &transaction,
        "shift.cancel",
        "shift",
        shift_id,
        format!("Canceled {name}'s registration"),
        Some(if reason.trim().is_empty() {
            "Volunteer cancellation".to_string()
        } else {
            reason.trim().to_string()
        }),
    )?;
    transaction.commit()?;

    let mut promoted = false;
    if auto_promote {
        if let Ok(Some(candidate)) = next_waitlist_candidate(conn, shift_id, &role) {
            // The seat that opened belongs to the canceled role. Keep the
            // waitlist entry's declared preference aligned with the role it is
            // actually being promoted into.
            conn.execute(
                "UPDATE waitlist_entries SET eligible_role = ?1
                 WHERE shift_id = ?2 AND volunteer_id = ?3",
                params![role, shift_id, candidate],
            )?;
            promote_waitlist(conn, shift_id, &candidate)?;
            promoted = true;
        }
    }
    if !promoted {
        let open = shift.capacity - (shift.confirmed - 1);
        append_notification(
            conn,
            "COVERAGE_REQUEST",
            "Coverage needed",
            &format!(
                "{} now has {} open seat(s) after a cancellation.",
                shift.title,
                open.max(0)
            ),
            "high",
            "/coordinator/coverage",
            NotificationTarget {
                audience: "coordinator",
                volunteer_id: None,
            },
        )?;
    }
    let _ = shift.opportunity_id;
    snapshot(conn)
}

fn next_waitlist_candidate(
    conn: &Connection,
    shift_id: &str,
    role: &str,
) -> Result<Option<String>> {
    let mut statement = conn.prepare(
        "SELECT volunteer_id, id FROM waitlist_entries
         WHERE shift_id = ?1 AND status = 'waiting'
         ORDER BY position, created_at, id",
    )?;
    let mut rows = statement.query(params![shift_id])?;
    while let Some(row) = rows.next()? {
        let volunteer_id: String = row.get(0)?;
        let entry_id: String = row.get(1)?;
        if validate_registration(conn, shift_id, &volunteer_id, role).is_ok() {
            return Ok(Some(volunteer_id));
        }
        let _ = entry_id;
    }
    Ok(None)
}

pub fn save_volunteer_profile(
    conn: &Connection,
    patch: crate::models::VolunteerProfilePatch,
) -> Result<WorkspaceSnapshot> {
    let crate::models::VolunteerProfilePatch {
        skills,
        availability,
        completed_onboarding,
        phone,
        interests,
        causes,
        photo,
    } = patch;
    if skills.is_empty() {
        return Err(CoreError::Validation(
            "Choose at least one skill so matches stay explainable".into(),
        ));
    }
    if availability.is_empty() {
        return Err(CoreError::Validation(
            "Add at least one availability window".into(),
        ));
    }
    let volunteer_id = current_volunteer_id(conn)?;
    let availability_json = serde_json::to_string(
        &availability
            .iter()
            .map(|slot| format!("{}:{}", slot.day, slot.period))
            .collect::<Vec<_>>(),
    )?;
    let transaction = conn.unchecked_transaction()?;
    transaction.execute(
        "DELETE FROM volunteer_skills WHERE volunteer_id = ?1",
        params![volunteer_id],
    )?;
    for skill in &skills {
        let skill = skill.trim();
        if skill.is_empty() {
            continue;
        }
        transaction.execute(
            "INSERT OR IGNORE INTO volunteer_skills (volunteer_id, skill) VALUES (?1, ?2)",
            params![volunteer_id, skill],
        )?;
    }
    let causes_json = serde_json::to_string(&causes)?;
    transaction.execute(
        "UPDATE volunteers
            SET availability_json = ?1, onboarding_completed = ?2, phone = ?3,
                interests = ?4, causes_json = ?5, photo = ?6
          WHERE id = ?7",
        params![
            availability_json,
            i64::from(completed_onboarding),
            phone.trim(),
            interests.trim(),
            causes_json,
            photo,
            volunteer_id
        ],
    )?;
    transaction.execute(
        "DELETE FROM availability_rules WHERE volunteer_id = ?1",
        params![volunteer_id],
    )?;
    for slot in &availability {
        transaction.execute(
            "INSERT OR IGNORE INTO availability_rules (id, volunteer_id, day, period)
             VALUES (?1, ?2, ?3, ?4)",
            params![
                format!("avail-{}-{}-{}", volunteer_id, slot.day, slot.period),
                volunteer_id,
                slot.day,
                slot.period,
            ],
        )?;
    }
    transaction.commit()?;
    append_audit(
        conn,
        "volunteer.profile_update",
        "volunteer",
        &volunteer_id,
        "Updated skills and availability".into(),
        Some(format!(
            "{} skills · {} windows",
            skills.len(),
            availability.len()
        )),
    )?;
    snapshot(conn)
}
