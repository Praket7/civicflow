//! Reminder rules.
//!
//! A rule is a trigger, an offset, an audience and a switch. Generating due
//! notifications is a deterministic pass over the schedule and the credential
//! register: no scheduler daemon, no email provider, and nothing that depends on
//! the network. Each notification records the rule that produced it, so a
//! coordinator asking "why did this appear?" gets a row rather than a guess, and
//! a rule that is switched off produces nothing at the next pass.
//!
//! Duplicates are impossible by construction: a notification is keyed by the
//! rule and the thing it is about, and a second pass finds the first one.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::auth::Account;
use crate::error::{CoreError, Result};
use crate::models::{NotificationItem, WorkspaceSnapshot};
use crate::services::now;
use crate::workflows::{append_actor_audit, snapshot};

/// The triggers the product actually sends. Each one answers a question a
/// volunteer or a coordinator would otherwise ask by hand.
pub const TRIGGERS: [&str; 4] = [
    "shift_reminder",
    "checkin_soon",
    "missed_shift_follow_up",
    "credential_expiring",
];

/// The rules a new organization starts with: the two a volunteer needs, the
/// follow-up a coordinator needs, and the credential warning that keeps a
/// schedule honest.
pub const DEFAULT_RULES: [(&str, i64, &str); 4] = [
    ("shift_reminder", 1440, "volunteer"),
    ("checkin_soon", 120, "volunteer"),
    ("missed_shift_follow_up", 60, "coordinator"),
    ("credential_expiring", 43200, "coordinator"),
];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NotificationRule {
    pub id: String,
    pub trigger_type: String,
    pub offset_minutes: i64,
    pub audience: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderRun {
    pub created: Vec<NotificationItem>,
    pub skipped: i64,
    pub snapshot: WorkspaceSnapshot,
}

fn organization_id(conn: &Connection) -> Result<String> {
    // Rules belong to the organization being worked in. Falling back to the
    // oldest row keeps a single-organization workspace behaving as before.
    crate::scope::current(conn)?
        .or(conn
            .query_row(
                "SELECT id FROM organizations ORDER BY created_at, id LIMIT 1",
                [],
                |row| row.get(0),
            )
            .optional()?)
        .ok_or_else(|| CoreError::NotFound("the workspace organization".into()))
}

/// Writes the default rules the first time the workspace is read, so a
/// coordinator sees a working reminder set instead of an empty table.
pub fn ensure_defaults(conn: &Connection) -> Result<()> {
    let Some(organization_id) = organization_id(conn).ok() else {
        return Ok(());
    };
    let existing: i64 = conn.query_row(
        "SELECT COUNT(*) FROM notification_rules WHERE organization_id = ?1",
        params![organization_id],
        |row| row.get(0),
    )?;
    if existing > 0 {
        return Ok(());
    }
    let transaction = conn.unchecked_transaction()?;
    for (trigger, offset, audience) in DEFAULT_RULES {
        transaction.execute(
            "INSERT INTO notification_rules
             (id, organization_id, trigger_type, offset_minutes, audience, enabled, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6)",
            params![
                format!("rule-{trigger}-{audience}"),
                organization_id,
                trigger,
                offset,
                audience,
                now(conn)?.to_rfc3339()
            ],
        )?;
    }
    transaction.commit()?;
    Ok(())
}

pub fn list_rules(conn: &Connection) -> Result<Vec<NotificationRule>> {
    ensure_defaults(conn)?;
    let organization_id = organization_id(conn)?;
    let mut statement = conn.prepare(
        "SELECT id, trigger_type, offset_minutes, audience, enabled
         FROM notification_rules WHERE organization_id = ?1
         ORDER BY trigger_type, audience",
    )?;
    let rows = statement
        .query_map(params![organization_id], |row| {
            Ok(NotificationRule {
                id: row.get(0)?,
                trigger_type: row.get(1)?,
                offset_minutes: row.get(2)?,
                audience: row.get(3)?,
                enabled: row.get::<_, i64>(4)? == 1,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

/// Turns one rule on or off, or changes when it fires.
pub fn update_rule(
    conn: &Connection,
    actor: &Account,
    rule_id: &str,
    patch: &RulePatch,
) -> Result<Vec<NotificationRule>> {
    let current: Option<(String, i64, String, i64)> = conn
        .query_row(
            "SELECT trigger_type, offset_minutes, audience, enabled
             FROM notification_rules WHERE id = ?1",
            params![rule_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .optional()?;
    let Some((trigger, offset, audience, enabled)) = current else {
        return Err(CoreError::NotFound("that reminder rule".into()));
    };
    let next_offset = patch.offset_minutes.unwrap_or(offset);
    if !(0..=43_200).contains(&next_offset) {
        return Err(CoreError::Validation(
            "A reminder fires between now and 30 days before the shift".into(),
        ));
    }
    let next_enabled = patch.enabled.unwrap_or(enabled == 1);
    if patch.offset_minutes.is_none() && patch.enabled.is_none() {
        return list_rules(conn);
    }
    let transaction = conn.unchecked_transaction()?;
    transaction.execute(
        "UPDATE notification_rules SET offset_minutes = ?1, enabled = ?2 WHERE id = ?3",
        params![next_offset, i64::from(next_enabled), rule_id],
    )?;
    append_actor_audit(
        &transaction,
        "coordinator",
        &actor.name,
        "notification_rule.update",
        "organization",
        &organization_id(conn)?,
        format!(
            "{} the {trigger} reminder for {audience}s",
            if next_enabled { "Enabled" } else { "Disabled" }
        ),
        Some(format!("Fires {next_offset} minutes before the shift")),
    )?;
    transaction.commit()?;
    list_rules(conn)
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RulePatch {
    #[serde(default)]
    pub offset_minutes: Option<i64>,
    #[serde(default)]
    pub enabled: Option<bool>,
}

/// Generates every notification that is due right now. Running it twice in a
/// row creates nothing the second time.
pub fn generate_due(conn: &Connection, actor: Option<&Account>) -> Result<ReminderRun> {
    let rules = list_rules(conn)?;
    let now = now(conn)?;
    let mut created: Vec<NotificationItem> = Vec::new();
    let mut skipped = 0i64;

    for rule in rules.iter().filter(|rule| rule.enabled) {
        let due = now + chrono::Duration::minutes(rule.offset_minutes);
        match rule.trigger_type.as_str() {
            "shift_reminder" | "checkin_soon" => {
                let window = chrono::Duration::minutes(30);
                let kind = if rule.trigger_type == "shift_reminder" {
                    "SHIFT_REMINDER"
                } else {
                    "CHECKIN_SOON"
                };
                for row in upcoming_registrations(conn, now, due, window)? {
                    match insert_once(conn, &rule.id, kind, &row)? {
                        Some(item) => created.push(item),
                        None => skipped += 1,
                    }
                }
            }
            "missed_shift_follow_up" => {
                for row in missed_assignments(conn, now, rule.offset_minutes)? {
                    match insert_once(conn, &rule.id, "MISSED_SHIFT", &row)? {
                        Some(item) => created.push(item),
                        None => skipped += 1,
                    }
                }
            }
            "credential_expiring" => {
                let days = (rule.offset_minutes / 1440).max(1);
                for row in expiring_credentials(conn, now, days)? {
                    match insert_once(conn, &rule.id, "CREDENTIAL_EXPIRING", &row)? {
                        Some(item) => created.push(item),
                        None => skipped += 1,
                    }
                }
            }
            other => {
                return Err(CoreError::Validation(format!(
                    "Unknown reminder trigger: {other}"
                )))
            }
        }
    }

    if let Some(actor) = actor {
        if !created.is_empty() {
            append_actor_audit(
                conn,
                "coordinator",
                &actor.name,
                "notification.generate",
                "organization",
                &organization_id(conn)?,
                format!("Queued {} reminders", created.len()),
                Some(format!("{skipped} were already queued")),
            )?;
        }
    }

    Ok(ReminderRun {
        created,
        skipped,
        snapshot: snapshot(conn)?,
    })
}

/// One due reminder, before it is written: who it is for and what it is about.
#[derive(Debug, Clone)]
struct Due {
    volunteer_id: Option<String>,
    title: String,
    body: String,
    href: String,
    subject: String,
}

fn upcoming_registrations(
    conn: &Connection,
    now: chrono::DateTime<chrono::FixedOffset>,
    due: chrono::DateTime<chrono::FixedOffset>,
    window: chrono::Duration,
) -> Result<Vec<Due>> {
    let mut statement = conn.prepare(
        "SELECT r.shift_id, r.volunteer_id, v.name, o.title, s.starts_at, r.role
         FROM registrations r
         JOIN shifts s ON s.id = r.shift_id
         JOIN opportunities o ON o.id = s.opportunity_id
         JOIN volunteers v ON v.id = r.volunteer_id
         WHERE r.status = 'registered' AND s.status = 'scheduled'
           AND s.starts_at > ?1 AND s.starts_at <= ?2
         ORDER BY s.starts_at, v.name",
    )?;
    let rows = statement
        .query_map(
            params![now.to_rfc3339(), (due + window).to_rfc3339()],
            |row| {
                let shift_id: String = row.get(0)?;
                let volunteer_id: String = row.get(1)?;
                let name: String = row.get(2)?;
                let title: String = row.get(3)?;
                let starts_at: String = row.get(4)?;
                let role: String = row.get(5)?;
                let start = chrono::DateTime::parse_from_rfc3339(&starts_at).unwrap_or(now);
                Ok(Due {
                    volunteer_id: Some(volunteer_id),
                    title: format!("{title} starts soon"),
                    body: format!(
                        "{name}, your {role} shift at {title} begins {}.",
                        start.format("%A at %-I:%M %p")
                    ),
                    href: format!("/volunteer/shifts/{shift_id}"),
                    subject: shift_id,
                })
            },
        )?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

fn missed_assignments(
    conn: &Connection,
    now: chrono::DateTime<chrono::FixedOffset>,
    offset_minutes: i64,
) -> Result<Vec<Due>> {
    let since = now - chrono::Duration::minutes(offset_minutes);
    let mut statement = conn.prepare(
        "SELECT r.shift_id, v.name, o.title, s.starts_at, r.role
         FROM registrations r
         JOIN shifts s ON s.id = r.shift_id
         JOIN opportunities o ON o.id = s.opportunity_id
         JOIN volunteers v ON v.id = r.volunteer_id
         LEFT JOIN attendance_ledger a ON a.shift_id = r.shift_id AND a.volunteer_id = r.volunteer_id
         WHERE r.status = 'registered' AND s.status <> 'canceled'
           AND s.starts_at < ?1 AND s.starts_at >= ?2
           AND a.id IS NULL
         ORDER BY s.starts_at, v.name",
    )?;
    let rows = statement
        .query_map(params![now.to_rfc3339(), since.to_rfc3339()], |row| {
            let shift_id: String = row.get(0)?;
            let name: String = row.get(1)?;
            let title: String = row.get(2)?;
            let role: String = row.get(4)?;
            Ok(Due {
                volunteer_id: None,
                title: format!("{name} did not check in"),
                body: format!(
                    "{name} was registered as {role} for {title} and has no check-in on file. Follow up or record a no-show."
                ),
                href: "/coordinator/attendance".into(),
                subject: shift_id,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

fn expiring_credentials(
    conn: &Connection,
    now: chrono::DateTime<chrono::FixedOffset>,
    days: i64,
) -> Result<Vec<Due>> {
    let today = now.date_naive();
    let horizon = (today + chrono::Duration::days(days)).to_string();
    let mut statement = conn.prepare(
        "SELECT ct.name, v.id, v.name, vc.valid_through
         FROM volunteer_credentials vc
         JOIN credential_types ct ON ct.id = vc.credential_type_id
         JOIN volunteers v ON v.id = vc.volunteer_id
         WHERE v.status = 'active' AND vc.valid_through >= ?1 AND vc.valid_through <= ?2
         ORDER BY vc.valid_through, v.name",
    )?;
    let rows = statement
        .query_map(params![today.to_string(), horizon], |row| {
            let credential: String = row.get(0)?;
            let volunteer_id: String = row.get(1)?;
            let name: String = row.get(2)?;
            let valid_through: String = row.get(3)?;
            Ok(Due {
                volunteer_id: Some(volunteer_id.clone()),
                title: format!("{name}'s {credential} expires soon"),
                body: format!(
                    "{name}'s {credential} is valid through {valid_through}. Renew it before it blocks a future shift."
                ),
                href: "/coordinator/credentials".into(),
                subject: format!("{volunteer_id}:{credential}"),
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

/// Writes one notification unless the same rule already produced one for the
/// same subject. The notification id carries the rule and the subject, so a
/// second pass finds the first row and writes nothing.
fn insert_once(
    conn: &Connection,
    rule_id: &str,
    kind: &str,
    due: &Due,
) -> Result<Option<NotificationItem>> {
    let id = format!(
        "{}-{}-{}",
        kind.to_lowercase(),
        subject_key(rule_id),
        subject_key(&due.subject)
    );
    let existing: i64 = conn.query_row(
        "SELECT COUNT(*) FROM notifications WHERE id = ?1",
        params![id],
        |row| row.get(0),
    )?;
    if existing > 0 {
        return Ok(None);
    }
    let audience = if due.volunteer_id.is_some() {
        "volunteer"
    } else {
        "coordinator"
    };
    let created_at = now(conn)?.to_rfc3339();
    conn.execute(
        "INSERT INTO notifications
         (id, kind, title, body, priority, created_at, read_at, href, audience, volunteer_id, rule_id)
         VALUES (?1, ?2, ?3, ?4, 'normal', ?5, NULL, ?6, ?7, ?8, ?9)",
        params![
            id,
            kind,
            due.title,
            due.body,
            created_at,
            due.href,
            audience,
            due.volunteer_id,
            rule_id,
        ],
    )?;
    Ok(Some(NotificationItem {
        id,
        kind: kind.to_string(),
        title: due.title.clone(),
        body: due.body.clone(),
        priority: "normal".into(),
        created_at,
        read_at: None,
        href: due.href.clone(),
    }))
}

/// A subject becomes part of the notification id, so it has to be safe there.
fn subject_key(subject: &str) -> String {
    subject
        .chars()
        .map(|value| {
            if value.is_ascii_alphanumeric() || value == '-' || value == '_' {
                value
            } else {
                '-'
            }
        })
        .collect()
}
