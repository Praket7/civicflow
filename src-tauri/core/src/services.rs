use chrono::DateTime;
use rusqlite::{params, Connection};

use crate::domain::{coverage_days, derive_attention, role_coverage_percent, ShiftView};
use crate::error::{CoreError, Result};
use crate::models::{
    ActivityItem, AttentionItem, ImpactSummary, MissionControlSummary, NotificationItem,
};

const PHOTOS: [&str; 3] = [
    "/media/community-strip-1.jpg",
    "/media/community-strip-2.jpg",
    "/media/community-strip-3.jpg",
];

fn setting(conn: &Connection, key: &str) -> Result<String> {
    conn.query_row(
        "SELECT value FROM app_settings WHERE key = ?1",
        params![key],
        |row| row.get(0),
    )
    .map_err(CoreError::from)
}

/// The workspace clock. Kept as a re-export so existing read models do not
/// need to know whether the time is pinned for a demo or read from the system.
pub use crate::clock::now;

pub fn load_shifts(conn: &Connection) -> Result<Vec<ShiftView>> {
    let mut statement = conn.prepare(
        "SELECT s.id, s.opportunity_id, o.title, o.cause, s.starts_at, s.capacity, s.confirmed
         FROM shifts s
         JOIN opportunities o ON o.id = s.opportunity_id
         ORDER BY s.starts_at, s.id",
    )?;
    let mut rows = statement.query([])?;
    let mut shifts: Vec<ShiftView> = Vec::new();

    while let Some(row) = rows.next()? {
        let starts_raw: String = row.get(4)?;
        shifts.push(ShiftView {
            id: row.get(0)?,
            opportunity_id: row.get(1)?,
            opportunity_title: row.get(2)?,
            cause: row.get(3)?,
            starts_at: DateTime::parse_from_rfc3339(&starts_raw)?,
            capacity: row.get(5)?,
            confirmed: row.get(6)?,
            roles: Vec::new(),
        });
    }

    let mut role_statement =
        conn.prepare("SELECT name, required, filled FROM shift_roles WHERE shift_id = ?1")?;
    for shift in &mut shifts {
        let mut role_rows = role_statement.query(params![shift.id])?;
        while let Some(role) = role_rows.next()? {
            shift.roles.push(crate::domain::RoleView {
                name: role.get(0)?,
                required: role.get(1)?,
                filled: role.get(2)?,
            });
        }
    }

    Ok(shifts)
}

fn activity(conn: &Connection) -> Result<Vec<ActivityItem>> {
    let mut statement = conn.prepare(
        "SELECT id, volunteer_id, name, action, detail, tone, at
         FROM activity_events ORDER BY at DESC LIMIT 3",
    )?;
    let mut rows = statement.query([])?;
    let mut items = Vec::new();
    while let Some(row) = rows.next()? {
        items.push(ActivityItem {
            id: row.get(0)?,
            volunteer_id: row.get(1)?,
            name: row.get(2)?,
            action: row.get(3)?,
            detail: row.get(4)?,
            tone: row.get(5)?,
            at: row.get(6)?,
        });
    }
    Ok(items)
}

pub fn get_mission_control(conn: &Connection, audience: &str) -> Result<MissionControlSummary> {
    let now = now(conn)?;
    let shifts = load_shifts(conn)?;
    let attention: Vec<AttentionItem> = derive_attention(&shifts, now, 3);
    let upcoming = shifts.iter().filter(|shift| shift.starts_at > now).count() as i64;

    let organization_name: String =
        conn.query_row("SELECT name FROM organizations LIMIT 1", [], |row| {
            row.get(0)
        })?;

    let active_volunteers: i64 = conn.query_row(
        "SELECT COUNT(*) FROM volunteers WHERE status = 'active'",
        [],
        |row| row.get(0),
    )?;

    let month_prefix = now.format("%Y-%m").to_string();
    let minutes_this_month: i64 = conn.query_row(
        "SELECT COALESCE(SUM(COALESCE(approved_minutes, minutes)), 0) FROM hour_entries
         WHERE substr(date, 1, 7) = ?1 AND status <> 'rejected'",
        params![month_prefix],
        |row| row.get(0),
    )?;

    let unread_notifications: i64 = conn.query_row(
        "SELECT COUNT(*) FROM notifications
         WHERE read_at IS NULL AND audience IN (?1, 'all')",
        params![audience],
        |row| row.get(0),
    )?;

    let (hours_ytd, unique_volunteers_ytd, shifts_completed, attendance_rate): (
        i64,
        i64,
        i64,
        i64,
    ) = conn.query_row(
        "SELECT hours_ytd, unique_volunteers_ytd, shifts_completed, attendance_rate
             FROM impact_totals LIMIT 1",
        [],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    )?;

    // People served are not derived from volunteer hours: they are explicit
    // outcome records attached to an opportunity. Sum the latest records by
    // metric key so a missing record reads as zero rather than an estimate.
    let mut outcome_statement = conn.prepare(
        "SELECT d.metric_key, SUM(r.value)
         FROM impact_results r
         JOIN impact_metric_definitions d ON d.id = r.definition_id
         GROUP BY d.metric_key",
    )?;
    let mut outcome_rows = outcome_statement.query([])?;
    let mut meals_packed = 0;
    let mut tutoring_sessions = 0;
    let mut trees_planted = 0;
    let mut families_served = 0;
    while let Some(row) = outcome_rows.next()? {
        let key: String = row.get(0)?;
        let value: f64 = row.get(1)?;
        match key.as_str() {
            "meals_packed" => meals_packed = value.round() as i64,
            "tutoring_sessions" => tutoring_sessions = value.round() as i64,
            "trees_planted" => trees_planted = value.round() as i64,
            "families_served" => families_served = value.round() as i64,
            _ => {}
        }
    }

    Ok(MissionControlSummary {
        coordinator_name: setting(conn, "coordinator_name")?,
        first_name: setting(conn, "coordinator_first_name")?,
        organization_name,
        now: now.to_rfc3339(),
        active_volunteers,
        coverage_percent: role_coverage_percent(&shifts, now),
        hours_this_month: minutes_this_month / 60,
        upcoming_shifts: upcoming,
        attention_count: attention.len(),
        coverage_days: coverage_days(&shifts, now, 7),
        attention,
        recent_activity: activity(conn)?,
        impact: ImpactSummary {
            hours_ytd,
            hours_this_month: minutes_this_month / 60,
            unique_volunteers_ytd,
            active_volunteers,
            meals_packed,
            tutoring_sessions,
            trees_planted,
            families_served_this_month: families_served,
            shifts_completed,
            attendance_rate,
        },
        unread_notifications: unread_notifications as usize,
        photos: PHOTOS.iter().map(|photo| photo.to_string()).collect(),
    })
}

pub fn list_notifications(
    conn: &Connection,
    audience: &str,
    volunteer_id: Option<&str>,
) -> Result<Vec<NotificationItem>> {
    let mut statement = conn.prepare(
        "SELECT id, kind, title, body, priority, created_at, read_at, href
         FROM notifications
         WHERE audience IN (?1, 'all')
           AND (volunteer_id IS NULL OR volunteer_id = ?2)
         ORDER BY rowid",
    )?;
    let mut rows = statement.query(params![audience, volunteer_id])?;
    let mut items = Vec::new();
    while let Some(row) = rows.next()? {
        items.push(NotificationItem {
            id: row.get(0)?,
            kind: row.get(1)?,
            title: row.get(2)?,
            body: row.get(3)?,
            priority: row.get(4)?,
            created_at: row.get(5)?,
            read_at: row.get(6)?,
            href: row.get(7)?,
        });
    }
    Ok(items)
}

/// Marks one notification read and records an audit event. Returns false when the
/// id does not exist, so the caller never reports a phantom success.
pub fn mark_notification_read(
    conn: &Connection,
    id: &str,
    audience: &str,
    volunteer_id: Option<&str>,
    actor_role: &str,
    actor_name: &str,
) -> Result<bool> {
    let title: Option<String> = conn
        .query_row(
            "SELECT title FROM notifications
             WHERE id = ?1 AND audience IN (?2, 'all')
               AND (volunteer_id IS NULL OR volunteer_id = ?3)",
            params![id, audience, volunteer_id],
            |row| row.get(0),
        )
        .ok();

    let Some(title) = title else {
        return Ok(false);
    };

    let timestamp = chrono::Utc::now().to_rfc3339();
    let changed = conn.execute(
        "UPDATE notifications SET read_at = ?1 WHERE id = ?2 AND read_at IS NULL",
        params![timestamp, id],
    )?;

    if changed > 0 {
        conn.execute(
            "INSERT INTO audit_events
             (id, timestamp, actor_type, actor_id, action, entity_type, entity_id, summary)
             VALUES (?1, ?2, ?3, ?4, 'notification_read', 'notification', ?5, ?6)",
            params![
                uuid::Uuid::new_v4().to_string(),
                timestamp,
                actor_role,
                actor_name,
                id,
                format!("Read notification: {title}"),
            ],
        )?;
    }
    Ok(changed > 0)
}
