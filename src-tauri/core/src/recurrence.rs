//! Recurring shift series.
//!
//! A series owns the rule and the shifts it generated. Nothing is cloned without
//! parentage: each generated shift carries its `series_id` and the date it stands
//! for, so an edit can reach exactly the instances a coordinator meant and a
//! top-up can tell which occurrences already exist without comparing timestamps.
//!
//! Expansion is a pure function over the rule, which is what makes it testable:
//! same rule, same dates, every time. The rule is deliberately small — no repeat
//! or weekly every N weeks on chosen weekdays, ended by a date or a count — and
//! it is refused rather than truncated when it would generate an unreasonable
//! number of shifts.

use std::collections::HashSet;

use chrono::{DateTime, Datelike, Duration, FixedOffset, NaiveDate, NaiveTime};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::auth::Account;
use crate::error::{CoreError, Result};
use crate::models::WorkspaceSnapshot;
use crate::services::now;
use crate::workflows::{append_actor_audit, snapshot};

/// A series longer than this is a data-entry mistake, not a schedule. The cap
/// keeps one click from writing hundreds of shifts nobody asked to staff.
pub const MAX_INSTANCES: usize = 60;

/// Sunday is 0, so the numbering matches JavaScript's `getDay` and the seed's
/// day keys never have to be converted twice.
pub const WEEKDAY_NAMES: [&str; 7] = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RecurrenceKind {
    None,
    Weekly,
}

impl RecurrenceKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Weekly => "weekly",
        }
    }

    fn parse(value: &str) -> Result<Self> {
        match value {
            "none" => Ok(Self::None),
            "weekly" => Ok(Self::Weekly),
            other => Err(CoreError::Validation(format!(
                "Unknown repeat setting: {other}"
            ))),
        }
    }
}

/// The rule a coordinator filled in. `ends_on` and `occurrence_count` are
/// mutually exclusive; providing neither is a validation error, not an
/// invitation to generate forever.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecurrenceRule {
    pub kind: RecurrenceKind,
    #[serde(default = "one")]
    pub interval_weeks: i64,
    #[serde(default)]
    pub weekdays: Vec<u32>,
    /// "HH:MM" in the organization's own clock.
    pub starts_local_time: String,
    pub duration_minutes: i64,
    /// "YYYY-MM-DD": the first day an occurrence may fall on.
    pub starts_on: String,
    #[serde(default)]
    pub ends_on: Option<String>,
    #[serde(default)]
    pub occurrence_count: Option<i64>,
}

fn one() -> i64 {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ShiftSeriesRecord {
    pub id: String,
    pub opportunity_id: String,
    pub opportunity_title: String,
    pub timezone: String,
    pub kind: RecurrenceKind,
    pub interval_weeks: i64,
    pub weekdays: Vec<u32>,
    pub starts_local_time: String,
    pub duration_minutes: i64,
    pub starts_on: String,
    pub ends_on: Option<String>,
    pub occurrence_count: Option<i64>,
    /// Shifts this series has actually produced, which is what a coordinator sees.
    pub generated: i64,
    pub roles: Vec<SeriesRole>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SeriesRole {
    pub name: String,
    pub required: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SeriesShift {
    pub id: String,
    pub occurrence_date: String,
    pub starts_at: String,
    pub ends_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeriesResult {
    pub series: ShiftSeriesRecord,
    pub shifts: Vec<SeriesShift>,
    pub snapshot: WorkspaceSnapshot,
}

/// Every date the rule produces, in order.
pub fn occurrences(rule: &RecurrenceRule) -> Result<Vec<NaiveDate>> {
    let starts_on = parse_date(&rule.starts_on, "start date")?;
    if !(15..=1440).contains(&rule.duration_minutes) {
        return Err(CoreError::Validation(
            "A shift has to last between 15 minutes and 24 hours".into(),
        ));
    }
    local_time(&rule.starts_local_time)?;

    let ends_on = match rule.ends_on.as_deref() {
        Some(value) if !value.trim().is_empty() => Some(parse_date(value, "end date")?),
        _ => None,
    };
    if ends_on.is_some() && rule.occurrence_count.is_some() {
        return Err(CoreError::Validation(
            "Choose either an end date or an occurrence count, not both".into(),
        ));
    }
    if ends_on.is_none() && rule.occurrence_count.is_none() {
        return Err(CoreError::Validation(
            "Give the series an end date or an occurrence count".into(),
        ));
    }
    if let Some(count) = rule.occurrence_count {
        if !(1..=MAX_INSTANCES as i64).contains(&count) {
            return Err(CoreError::Validation(format!(
                "A series can hold between 1 and {MAX_INSTANCES} shifts"
            )));
        }
    }
    if let Some(end) = ends_on {
        if end < starts_on {
            return Err(CoreError::Validation(
                "The series ends before it starts".into(),
            ));
        }
    }

    match rule.kind {
        RecurrenceKind::None => Ok(vec![starts_on]),
        RecurrenceKind::Weekly => {
            if !(1..=8).contains(&rule.interval_weeks) {
                return Err(CoreError::Validation("Repeat every 1 to 8 weeks".into()));
            }
            let mut weekdays: Vec<u32> = rule.weekdays.clone();
            weekdays.sort_unstable();
            weekdays.dedup();
            if weekdays.is_empty() {
                return Err(CoreError::Validation(
                    "Choose at least one weekday to repeat on".into(),
                ));
            }
            let mut dates: Vec<NaiveDate> = Vec::new();
            // The week the series starts in, aligned to Sunday, is week zero.
            let anchor =
                starts_on - Duration::days(starts_on.weekday().num_days_from_sunday() as i64);
            let mut week = 0i64;
            // A year of week-steps is far more than the cap allows; the loop
            // bound only keeps a bad end date from spinning.
            while week < 260 {
                for weekday in &weekdays {
                    let date = anchor
                        + Duration::days(week * 7 * rule.interval_weeks)
                        + Duration::days(i64::from(*weekday));
                    if date < starts_on {
                        continue;
                    }
                    if let Some(end) = ends_on {
                        if date > end {
                            continue;
                        }
                    }
                    if !dates.contains(&date) {
                        dates.push(date);
                    }
                }
                dates.sort_unstable();
                if let Some(end) = ends_on {
                    if anchor
                        + Duration::days(week * 7 * rule.interval_weeks)
                        + Duration::days(7 * rule.interval_weeks)
                        > end
                    {
                        break;
                    }
                }
                if let Some(count) = rule.occurrence_count {
                    if dates.len() as i64 >= count {
                        break;
                    }
                }
                week += 1;
            }
            dates.truncate(match rule.occurrence_count {
                Some(count) => count as usize,
                None => dates.len(),
            });
            if dates.is_empty() {
                return Err(CoreError::Validation("That rule produces no shifts".into()));
            }
            if dates.len() > MAX_INSTANCES {
                return Err(CoreError::Validation(format!(
                    "That rule would create {} shifts. Shorten the series to {MAX_INSTANCES} or fewer.",
                    dates.len()
                )));
            }
            Ok(dates)
        }
    }
}

/// Builds the timestamp an occurrence starts at, using the workspace clock's own
/// offset so a generated shift looks exactly like a seeded one.
pub fn instance_window(
    date: NaiveDate,
    rule: &RecurrenceRule,
    offset: FixedOffset,
) -> Result<(DateTime<FixedOffset>, DateTime<FixedOffset>)> {
    let time = local_time(&rule.starts_local_time)?;
    let naive = date.and_time(time);
    let starts = naive
        .and_local_timezone(offset)
        .single()
        .ok_or_else(|| CoreError::Validation("That start time is not usable".into()))?;
    Ok((starts, starts + Duration::minutes(rule.duration_minutes)))
}

fn parse_date(value: &str, label: &str) -> Result<NaiveDate> {
    NaiveDate::parse_from_str(value.trim(), "%Y-%m-%d")
        .map_err(|_| CoreError::Validation(format!("That {label} is not a date")))
}

fn local_time(value: &str) -> Result<NaiveTime> {
    NaiveTime::parse_from_str(value.trim(), "%H:%M")
        .map_err(|_| CoreError::Validation("Use a start time like 09:00".into()))
}

fn weekday_name(day: u32) -> &'static str {
    WEEKDAY_NAMES[(day as usize).min(6)]
}

/// Schedules a series: one transaction, one audit event, one rule.
pub fn create_series(
    conn: &Connection,
    actor: &Account,
    opportunity_id: &str,
    rule: &RecurrenceRule,
    roles: &[SeriesRole],
) -> Result<SeriesResult> {
    let now = now(conn)?;
    let (organization_id, title, capacity): (String, String, i64) = conn
        .query_row(
            "SELECT organization_id, title, capacity FROM opportunities WHERE id = ?1",
            params![opportunity_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?
        .ok_or_else(|| CoreError::NotFound("that opportunity".into()))?;

    if roles.is_empty() {
        return Err(CoreError::Validation(
            "Give the series at least one role to fill".into(),
        ));
    }
    let mut seen = HashSet::new();
    for role in roles {
        let name = role.name.trim();
        if name.is_empty() {
            return Err(CoreError::Validation("Every role needs a name".into()));
        }
        if role.required < 1 {
            return Err(CoreError::Validation(format!(
                "{name} needs at least one seat"
            )));
        }
        if !seen.insert(name.to_lowercase()) {
            return Err(CoreError::Validation(format!("{name} is listed twice")));
        }
    }
    let needed: i64 = roles.iter().map(|role| role.required).sum();
    if needed > capacity {
        return Err(CoreError::Validation(format!(
            "These roles need {needed} volunteers, but {title} is listed for {capacity}"
        )));
    }

    let dates = occurrences(rule)?;
    let offset = *now.offset();
    let series_id = format!("series-{}", uuid::Uuid::new_v4());
    let transaction = conn.unchecked_transaction()?;
    transaction.execute(
        "INSERT INTO shift_series
         (id, organization_id, opportunity_id, timezone, recurrence_kind, interval_weeks,
          weekdays_json, starts_local_time, duration_minutes, starts_on, ends_on,
          occurrence_count, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        params![
            series_id,
            organization_id,
            opportunity_id,
            conn.query_row(
                "SELECT timezone FROM organizations WHERE id = ?1",
                params![organization_id],
                |row| row.get::<_, String>(0)
            )?,
            rule.kind.as_str(),
            rule.interval_weeks,
            serde_json::to_string(&rule.weekdays)?,
            rule.starts_local_time.trim(),
            rule.duration_minutes,
            rule.starts_on.trim(),
            rule.ends_on.as_deref().map(str::trim),
            rule.occurrence_count,
            now.to_rfc3339(),
        ],
    )?;
    for role in roles {
        transaction.execute(
            "INSERT INTO shift_series_roles (series_id, name, required) VALUES (?1, ?2, ?3)",
            params![series_id, role.name.trim(), role.required],
        )?;
    }

    let mut shifts: Vec<SeriesShift> = Vec::new();
    for date in &dates {
        let (starts_at, ends_at) = instance_window(*date, rule, offset)?;
        let id = format!("sh-series-{}", uuid::Uuid::new_v4());
        transaction.execute(
            "INSERT INTO shifts
             (id, opportunity_id, starts_at, ends_at, capacity, confirmed, waitlisted, status,
              series_id, occurrence_date)
             VALUES (?1, ?2, ?3, ?4, ?5, 0, 0, 'scheduled', ?6, ?7)",
            params![
                id,
                opportunity_id,
                starts_at.to_rfc3339(),
                ends_at.to_rfc3339(),
                needed,
                series_id,
                date.to_string()
            ],
        )?;
        for role in roles {
            transaction.execute(
                "INSERT INTO shift_roles (shift_id, name, required, filled)
                 VALUES (?1, ?2, ?3, 0)",
                params![id, role.name.trim(), role.required],
            )?;
        }
        shifts.push(SeriesShift {
            id,
            occurrence_date: date.to_string(),
            starts_at: starts_at.to_rfc3339(),
            ends_at: ends_at.to_rfc3339(),
        });
    }

    append_actor_audit(
        &transaction,
        "coordinator",
        &actor.name,
        "series.create",
        "opportunity",
        opportunity_id,
        format!(
            "Scheduled {} for {title}",
            recurrence_summary(rule, shifts.len())
        ),
        Some(format!(
            "Series {series_id}: {} roles, {needed} volunteers per shift",
            roles.len()
        )),
    )?;
    transaction.commit()?;

    Ok(SeriesResult {
        series: load_series(conn, &series_id)?
            .ok_or_else(|| CoreError::NotFound("the new series".into()))?,
        shifts,
        snapshot: snapshot(conn)?,
    })
}

/// Adds the occurrences the rule asks for that the series has not produced yet.
/// Idempotent: running it twice writes nothing the second time.
pub fn generate_instances(
    conn: &Connection,
    actor: &Account,
    series_id: &str,
) -> Result<SeriesResult> {
    let record =
        load_series(conn, series_id)?.ok_or_else(|| CoreError::NotFound("that series".into()))?;
    let rule = rule_of(&record);
    let dates = occurrences(&rule)?;
    let now = now(conn)?;
    let offset = *now.offset();
    let existing: HashSet<String> = {
        let mut statement = conn.prepare(
            "SELECT occurrence_date FROM shifts WHERE series_id = ?1 AND occurrence_date IS NOT NULL",
        )?;
        let rows = statement.query_map(params![series_id], |row| row.get::<_, String>(0))?;
        rows.collect::<rusqlite::Result<HashSet<String>>>()?
    };

    let transaction = conn.unchecked_transaction()?;
    let mut added: Vec<SeriesShift> = Vec::new();
    for date in &dates {
        let key = date.to_string();
        if existing.contains(&key) {
            continue;
        }
        let (starts_at, ends_at) = instance_window(*date, &rule, offset)?;
        let id = format!("sh-series-{}", uuid::Uuid::new_v4());
        transaction.execute(
            "INSERT INTO shifts
             (id, opportunity_id, starts_at, ends_at, capacity, confirmed, waitlisted, status,
              series_id, occurrence_date)
             VALUES (?1, ?2, ?3, ?4, ?5, 0, 0, 'scheduled', ?6, ?7)",
            params![
                id,
                record.opportunity_id,
                starts_at.to_rfc3339(),
                ends_at.to_rfc3339(),
                record.roles.iter().map(|role| role.required).sum::<i64>(),
                series_id,
                key
            ],
        )?;
        for role in &record.roles {
            transaction.execute(
                "INSERT INTO shift_roles (shift_id, name, required, filled)
                 VALUES (?1, ?2, ?3, 0)",
                params![id, role.name, role.required],
            )?;
        }
        added.push(SeriesShift {
            id,
            occurrence_date: key,
            starts_at: starts_at.to_rfc3339(),
            ends_at: ends_at.to_rfc3339(),
        });
    }
    if !added.is_empty() {
        append_actor_audit(
            &transaction,
            "coordinator",
            &actor.name,
            "series.generate",
            "opportunity",
            &record.opportunity_id,
            format!(
                "Added {} to {}",
                plural(added.len(), "shift"),
                record.opportunity_title
            ),
            Some(format!("Series {series_id}")),
        )?;
    }
    transaction.commit()?;

    Ok(SeriesResult {
        series: load_series(conn, series_id)?
            .ok_or_else(|| CoreError::NotFound("that series".into()))?,
        shifts: added,
        snapshot: snapshot(conn)?,
    })
}

/// Retimes a series. `scope` is `"instance"` for one shift, or `"series"` for
/// the rule and every shift it generated.
pub fn retime(
    conn: &Connection,
    actor: &Account,
    series_id: &str,
    starts_local_time: &str,
    duration_minutes: i64,
    scope: &str,
) -> Result<WorkspaceSnapshot> {
    let record =
        load_series(conn, series_id)?.ok_or_else(|| CoreError::NotFound("that series".into()))?;
    if !matches!(scope, "series" | "instance") {
        return Err(CoreError::Validation(
            "Choose whether this change applies to one shift or the series".into(),
        ));
    }
    let mut rule = rule_of(&record);
    rule.starts_local_time = starts_local_time.trim().to_string();
    rule.duration_minutes = duration_minutes;
    local_time(&rule.starts_local_time)?;
    if !(15..=1440).contains(&rule.duration_minutes) {
        return Err(CoreError::Validation(
            "A shift has to last between 15 minutes and 24 hours".into(),
        ));
    }
    let now = now(conn)?;
    let offset = *now.offset();

    let transaction = conn.unchecked_transaction()?;
    let mut statement = transaction.prepare(
        "SELECT id, occurrence_date FROM shifts WHERE series_id = ?1 AND status = 'scheduled'
           AND occurrence_date IS NOT NULL
         ORDER BY occurrence_date",
    )?;
    let rows = statement
        .query_map(params![series_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?
        .collect::<rusqlite::Result<Vec<(String, String)>>>()?;
    drop(statement);

    let mut changed = 0i64;
    for (id, occurrence_date) in rows {
        if occurrence_date < now.date_naive().to_string() {
            continue;
        }
        let date = parse_date(&occurrence_date, "occurrence date")?;
        let (starts_at, ends_at) = instance_window(date, &rule, offset)?;
        transaction.execute(
            "UPDATE shifts SET starts_at = ?1, ends_at = ?2 WHERE id = ?3",
            params![starts_at.to_rfc3339(), ends_at.to_rfc3339(), id],
        )?;
        changed += 1;
        if scope == "instance" {
            break;
        }
    }
    if scope == "series" {
        transaction.execute(
            "UPDATE shift_series
             SET starts_local_time = ?1, duration_minutes = ?2
             WHERE id = ?3",
            params![rule.starts_local_time, rule.duration_minutes, series_id],
        )?;
    }
    append_actor_audit(
        &transaction,
        "coordinator",
        &actor.name,
        "series.retime",
        "opportunity",
        &record.opportunity_id,
        format!(
            "Moved {} to {} for {}",
            plural(changed as usize, "shift"),
            rule.starts_local_time,
            record.opportunity_title
        ),
        Some(if scope == "instance" {
            "Applied to this shift only".into()
        } else {
            "Applied to the whole series".to_string()
        }),
    )?;
    transaction.commit()?;
    snapshot(conn)
}

/// Deletes a series and the shifts it generated. A shift somebody is already
/// registered for is refused rather than silently emptied.
pub fn delete_series(
    conn: &Connection,
    actor: &Account,
    series_id: &str,
) -> Result<WorkspaceSnapshot> {
    let record =
        load_series(conn, series_id)?.ok_or_else(|| CoreError::NotFound("that series".into()))?;
    let booked: i64 = conn.query_row(
        "SELECT COUNT(*) FROM shifts WHERE series_id = ?1 AND confirmed > 0",
        params![series_id],
        |row| row.get(0),
    )?;
    if booked > 0 {
        return Err(CoreError::rule(
            "SERIES_HAS_VOLUNTEERS",
            format!(
                "{} of these shifts already have volunteers. Remove them first, or cancel the series from the schedule.",
                plural(booked as usize, "shift")
            ),
            Some("seriesId".into()),
            None,
        ));
    }
    let transaction = conn.unchecked_transaction()?;
    transaction.execute(
        "DELETE FROM shift_roles WHERE shift_id IN (SELECT id FROM shifts WHERE series_id = ?1)",
        params![series_id],
    )?;
    let removed = transaction.execute(
        "DELETE FROM shifts WHERE series_id = ?1",
        params![series_id],
    )?;
    transaction.execute("DELETE FROM shift_series WHERE id = ?1", params![series_id])?;
    append_actor_audit(
        &transaction,
        "coordinator",
        &actor.name,
        "series.delete",
        "opportunity",
        &record.opportunity_id,
        format!(
            "Removed {} from {}",
            plural(removed, "shift"),
            record.opportunity_title
        ),
        Some("The series and its shifts were deleted together".into()),
    )?;
    transaction.commit()?;
    snapshot(conn)
}

pub fn list_series(
    conn: &Connection,
    opportunity_id: Option<&str>,
) -> Result<Vec<ShiftSeriesRecord>> {
    let mut statement = conn.prepare(
        "SELECT s.id FROM shift_series s
         WHERE ?1 IS NULL OR s.opportunity_id = ?1
         ORDER BY s.created_at DESC",
    )?;
    let ids = statement
        .query_map(params![opportunity_id], |row| row.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<String>>>()?;
    let mut records = Vec::new();
    for id in ids {
        if let Some(record) = load_series(conn, &id)? {
            records.push(record);
        }
    }
    Ok(records)
}

fn load_series(conn: &Connection, series_id: &str) -> Result<Option<ShiftSeriesRecord>> {
    let row = conn
        .query_row(
            "SELECT s.id, s.opportunity_id, o.title, s.timezone, s.recurrence_kind,
                    s.interval_weeks, s.weekdays_json, s.starts_local_time, s.duration_minutes,
                    s.starts_on, s.ends_on, s.occurrence_count,
                    (SELECT COUNT(*) FROM shifts sh WHERE sh.series_id = s.id)
             FROM shift_series s
             JOIN opportunities o ON o.id = s.opportunity_id
             WHERE s.id = ?1",
            params![series_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, i64>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, String>(7)?,
                    row.get::<_, i64>(8)?,
                    row.get::<_, String>(9)?,
                    row.get::<_, Option<String>>(10)?,
                    row.get::<_, Option<i64>>(11)?,
                    row.get::<_, i64>(12)?,
                ))
            },
        )
        .optional()?;
    let Some((
        id,
        opportunity_id,
        opportunity_title,
        timezone,
        kind,
        interval_weeks,
        weekdays_json,
        starts_local_time,
        duration_minutes,
        starts_on,
        ends_on,
        occurrence_count,
        generated,
    )) = row
    else {
        return Ok(None);
    };
    let mut role_statement = conn.prepare(
        "SELECT name, required FROM shift_series_roles WHERE series_id = ?1 ORDER BY id",
    )?;
    let roles = role_statement
        .query_map(params![series_id], |row| {
            Ok(SeriesRole {
                name: row.get(0)?,
                required: row.get(1)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<SeriesRole>>>()?;
    Ok(Some(ShiftSeriesRecord {
        id,
        opportunity_id,
        opportunity_title,
        timezone,
        kind: RecurrenceKind::parse(&kind)?,
        interval_weeks,
        weekdays: serde_json::from_str(&weekdays_json)?,
        starts_local_time,
        duration_minutes,
        starts_on,
        ends_on,
        occurrence_count,
        generated,
        roles,
    }))
}

fn rule_of(record: &ShiftSeriesRecord) -> RecurrenceRule {
    RecurrenceRule {
        kind: record.kind,
        interval_weeks: record.interval_weeks,
        weekdays: record.weekdays.clone(),
        starts_local_time: record.starts_local_time.clone(),
        duration_minutes: record.duration_minutes,
        starts_on: record.starts_on.clone(),
        ends_on: record.ends_on.clone(),
        occurrence_count: record.occurrence_count,
    }
}

fn plural(count: usize, noun: &str) -> String {
    if count == 1 {
        format!("{count} {noun}")
    } else {
        format!("{count} {noun}s")
    }
}

/// The sentence a coordinator reads in the audit trail and on the series card.
pub fn recurrence_summary(rule: &RecurrenceRule, generated: usize) -> String {
    match rule.kind {
        RecurrenceKind::None => format!("a single shift: {}", plural(generated, "shift")),
        RecurrenceKind::Weekly => {
            let days: Vec<&str> = rule.weekdays.iter().map(|day| weekday_name(*day)).collect();
            let every = if rule.interval_weeks == 1 {
                "every week".to_string()
            } else {
                format!("every {} weeks", rule.interval_weeks)
            };
            format!(
                "{every} on {}: {}",
                days.join(", "),
                plural(generated, "shift")
            )
        }
    }
}
