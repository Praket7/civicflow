//! Bringing an existing volunteer spreadsheet into CivicFlow.
//!
//! The import runs in two steps on purpose. `preview` reads the file and reports
//! what every row would become without writing anything; `apply` refuses the whole
//! file while any row has a problem. A coordinator therefore never ends up with
//! half a roster and a list of errors to reconcile by hand, and the write itself
//! is one transaction with one audit event.
//!
//! The columns are fixed rather than guessed, and `export_roster` writes exactly
//! the headers this module reads. A workspace can be exported, edited in a
//! spreadsheet, and imported back without anyone deciding which column is which.

use std::collections::{BTreeMap, HashSet};

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::auth::{initials_for, normalize_email, normalize_name, Account};
use crate::error::{CoreError, Result};
use crate::reports::csv_cell;
use crate::workflows::{append_actor_audit, demo_now};

/// Read order and the header the export writes. A file may name its columns in
/// any order; the header is what decides, not the position.
const COLUMNS: [(&str, &str); 8] = [
    ("name", "Name"),
    ("email", "Email"),
    ("phone", "Phone"),
    ("status", "Status"),
    ("skills", "Skills"),
    ("availability", "Availability"),
    ("interests", "Interests"),
    ("causes", "Causes"),
];

const REQUIRED_COLUMNS: [&str; 2] = ["name", "email"];
const CAUSES: [&str; 6] = [
    "food",
    "education",
    "environment",
    "health",
    "community",
    "animals",
];
const DAYS: [&str; 7] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const PERIODS: [&str; 3] = ["morning", "afternoon", "evening"];
const STATUSES: [&str; 3] = ["active", "onboarding", "inactive"];
/// A spreadsheet says who exists, not who has been screened. Arriving as
/// `onboarding` keeps a new name out of the roster the planner may fill from
/// until a coordinator activates the profile.
const DEFAULT_STATUS: &str = "onboarding";
const EXAMPLE_ROW: [&str; 8] = [
    "Maya Chen",
    "maya.chen@example.org",
    "(716) 555-0142",
    "onboarding",
    "Food handling; Tutoring",
    "mon:morning; wed:evening",
    "Weekend pantry shifts, school tutoring",
    "food; education",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RowOutcome {
    /// The row would add one volunteer.
    Create,
    /// The row has at least one problem and blocks the whole file.
    Invalid,
}

/// One line of the file, with what was understood and what needs a decision.
/// The field list is the profile the row would create, so the screen can show a
/// file's effect without the rows having been inserted yet.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportRow {
    /// The line number as a person sees it in their spreadsheet editor.
    pub line: usize,
    pub name: String,
    pub email: String,
    pub phone: String,
    pub status: String,
    pub skills: Vec<String>,
    pub availability: Vec<String>,
    pub interests: String,
    pub causes: Vec<String>,
    pub outcome: RowOutcome,
    /// Anything that stops the row being written.
    pub problems: Vec<String>,
    /// True of the row but not an error, such as a missing skill list.
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreview {
    /// Headers found in the file, in file order, so the screen can show what was
    /// read rather than what was assumed.
    pub columns: Vec<String>,
    /// Labels of the columns a usable file must contain.
    pub required: Vec<String>,
    /// A file with one example row, built from the same column list this module
    /// reads. The screen offers it so nobody has to guess the headers.
    pub template: String,
    pub total: usize,
    pub valid: usize,
    pub invalid: usize,
    /// Problems with the file itself, such as a missing header column.
    pub problems: Vec<String>,
    pub rows: Vec<ImportRow>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    pub created: usize,
    pub created_ids: Vec<String>,
    pub preview: ImportPreview,
}

/// Splits a cell that holds several values. A comma is accepted for causes and
/// interests because that is how people type them; skills and availability use
/// the semicolon form the export writes.
fn split_list(value: &str, comma: bool) -> Vec<String> {
    value
        .split(|character: char| {
            character == ';' || character == '|' || (comma && character == ',')
        })
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .map(str::to_string)
        .collect()
}

/// A minimal RFC 4180 reader: a quoted cell may contain commas, newlines and a
/// doubled quote. It returns raw cells; deciding what they mean happens later so
/// the parser stays the one place that knows about quoting.
fn parse_rows(text: &str) -> Vec<Vec<String>> {
    let mut rows = Vec::new();
    let mut row: Vec<String> = Vec::new();
    let mut cell = String::new();
    let mut quoted = false;
    let mut characters = text.trim_start_matches('\u{feff}').chars().peekable();

    while let Some(character) = characters.next() {
        match character {
            '"' if quoted => {
                if characters.peek() == Some(&'"') {
                    characters.next();
                    cell.push('"');
                } else {
                    quoted = false;
                }
            }
            '"' => quoted = true,
            ',' if !quoted => row.push(std::mem::take(&mut cell)),
            '\r' if !quoted => {
                if characters.peek() == Some(&'\n') {
                    characters.next();
                }
                row.push(std::mem::take(&mut cell));
                rows.push(std::mem::take(&mut row));
            }
            '\n' if !quoted => {
                row.push(std::mem::take(&mut cell));
                rows.push(std::mem::take(&mut row));
            }
            other => cell.push(other),
        }
    }
    if !cell.trim().is_empty() || !row.is_empty() {
        row.push(cell);
        rows.push(row);
    }
    // A blank separator line is not a volunteer.
    rows.retain(|cells| cells.iter().any(|value| !value.trim().is_empty()));
    rows
}

/// The header a file must carry, and the example row the screen offers.
pub fn template_csv() -> String {
    let header = COLUMNS
        .iter()
        .map(|(_, label)| csv_cell(label))
        .collect::<Vec<_>>()
        .join(",");
    let example = EXAMPLE_ROW
        .iter()
        .map(|value| csv_cell(value))
        .collect::<Vec<_>>()
        .join(",");
    format!("{header}\r\n{example}\r\n")
}

/// Which cell holds which column. A renamed or reordered header is fine; a
/// missing required column is not, and is reported before any row is read.
fn header_indexes(header: &[String]) -> (BTreeMap<String, usize>, Vec<String>) {
    let mut indexes = BTreeMap::new();
    let mut seen = Vec::new();
    for (position, cell) in header.iter().enumerate() {
        let cleaned = cell.trim().to_lowercase();
        if cleaned.is_empty() {
            continue;
        }
        seen.push(cell.trim().to_string());
        if let Some((key, _)) = COLUMNS
            .iter()
            .find(|(key, label)| *key == cleaned || label.to_lowercase() == cleaned)
        {
            indexes.entry((*key).to_string()).or_insert(position);
        }
    }
    (indexes, seen)
}

fn cell<'a>(cells: &'a [String], indexes: &BTreeMap<String, usize>, key: &str) -> &'a str {
    indexes
        .get(key)
        .and_then(|position| cells.get(*position))
        .map(|value| value.trim())
        .unwrap_or("")
}

/// The roster holds one row per email, so a duplicate is a file problem rather
/// than something to overwrite quietly.
fn roster_owner(conn: &Connection, email: &str) -> Result<Option<String>> {
    Ok(conn
        .query_row(
            "SELECT organization_id FROM volunteers WHERE lower(email) = ?1",
            params![email],
            |row| row.get(0),
        )
        .optional()?)
}

fn validate_row(
    conn: &Connection,
    organization_id: &str,
    line: usize,
    raw: &[String],
    indexes: &BTreeMap<String, usize>,
    seen: &mut HashSet<String>,
) -> Result<ImportRow> {
    let mut problems = Vec::new();
    let mut notes = Vec::new();

    let name = match normalize_name(cell(raw, indexes, "name")) {
        Ok(name) => name,
        Err(error) => {
            problems.push(error.to_string());
            cell(raw, indexes, "name").to_string()
        }
    };
    let email = match normalize_email(cell(raw, indexes, "email")) {
        Ok(email) => email,
        Err(error) => {
            problems.push(error.to_string());
            cell(raw, indexes, "email").to_string()
        }
    };
    if !email.is_empty() {
        if !seen.insert(email.clone()) {
            problems.push(format!("Two rows use {email}."));
        } else if let Some(owner) = roster_owner(conn, &email)? {
            problems.push(if owner == organization_id {
                format!("{email} is already on this roster.")
            } else {
                format!("{email} belongs to another organization's roster.")
            });
        }
    }

    let status_cell = cell(raw, indexes, "status").to_lowercase();
    let status = if status_cell.is_empty() {
        DEFAULT_STATUS.to_string()
    } else if STATUSES.contains(&status_cell.as_str()) {
        status_cell
    } else {
        problems.push(format!(
            "\"{status_cell}\" is not a status. Use active, onboarding or inactive."
        ));
        DEFAULT_STATUS.to_string()
    };

    let skills = split_list(cell(raw, indexes, "skills"), false);
    if skills.is_empty() {
        notes.push("No skills listed yet.".into());
    }

    let mut availability = Vec::new();
    for token in split_list(cell(raw, indexes, "availability"), false) {
        let slot = token.to_lowercase();
        let (day, period) = slot.split_once(':').unwrap_or((slot.as_str(), ""));
        if DAYS.contains(&day) && PERIODS.contains(&period) {
            availability.push(format!("{day}:{period}"));
        } else {
            problems.push(format!(
                "\"{token}\" needs a day and a period, like mon:morning."
            ));
        }
    }
    if availability.is_empty()
        && !problems
            .iter()
            .any(|problem| problem.contains("mon:morning"))
    {
        notes.push("No availability windows listed yet.".into());
    }

    let mut causes = Vec::new();
    for cause in split_list(cell(raw, indexes, "causes"), true) {
        let cause = cause.to_lowercase();
        if CAUSES.contains(&cause.as_str()) {
            causes.push(cause);
        } else {
            problems.push(format!(
                "\"{cause}\" is not a cause. Use food, education, environment, health, community or animals."
            ));
        }
    }

    let outcome = if problems.is_empty() {
        RowOutcome::Create
    } else {
        RowOutcome::Invalid
    };
    Ok(ImportRow {
        line,
        name,
        email,
        phone: cell(raw, indexes, "phone").to_string(),
        status,
        skills,
        availability,
        interests: cell(raw, indexes, "interests").to_string(),
        causes,
        outcome,
        problems,
        notes,
    })
}

/// Reads a file and reports what every row would do. Nothing is written, so the
/// screen can show the outcome of a file a coordinator is still editing.
pub fn preview(conn: &Connection, organization_id: &str, text: &str) -> Result<ImportPreview> {
    let mut preview = ImportPreview {
        columns: Vec::new(),
        required: REQUIRED_COLUMNS
            .iter()
            .filter_map(|key| {
                COLUMNS
                    .iter()
                    .find(|(id, _)| id == key)
                    .map(|(_, label)| (*label).to_string())
            })
            .collect(),
        template: template_csv(),
        total: 0,
        valid: 0,
        invalid: 0,
        problems: Vec::new(),
        rows: Vec::new(),
    };

    let mut lines = parse_rows(text).into_iter();
    let Some(header) = lines.next() else {
        preview
            .problems
            .push("Choose a CSV file or paste its rows first.".into());
        return Ok(preview);
    };
    let (indexes, columns) = header_indexes(&header);
    preview.columns = columns;

    let missing: Vec<&str> = REQUIRED_COLUMNS
        .iter()
        .copied()
        .filter(|key| !indexes.contains_key(*key))
        .collect();
    if !missing.is_empty() {
        let labels: Vec<String> = missing
            .iter()
            .filter_map(|key| {
                COLUMNS
                    .iter()
                    .find(|(id, _)| id == key)
                    .map(|(_, label)| (*label).to_string())
            })
            .collect();
        preview.problems.push(format!(
            "The first row must name these columns: {}. No rows were read.",
            labels.join(", ")
        ));
        return Ok(preview);
    }

    let mut seen = HashSet::new();
    for (offset, raw) in lines.enumerate() {
        let row = validate_row(conn, organization_id, offset + 2, &raw, &indexes, &mut seen)?;
        preview.total += 1;
        match row.outcome {
            RowOutcome::Create => preview.valid += 1,
            RowOutcome::Invalid => preview.invalid += 1,
        }
        preview.rows.push(row);
    }
    if preview.total == 0 {
        preview
            .problems
            .push("The file has a header but no volunteer rows yet.".into());
    }
    Ok(preview)
}

fn insert_row(
    conn: &Connection,
    organization_id: &str,
    row: &ImportRow,
    now: &str,
) -> Result<String> {
    let id = format!("vol-{}", uuid::Uuid::new_v4());
    let first_name = row
        .name
        .split_whitespace()
        .next()
        .unwrap_or(row.name.as_str())
        .to_string();
    let availability_json = serde_json::to_string(&row.availability)?;
    let causes_json = serde_json::to_string(&row.causes)?;
    conn.execute(
        "INSERT INTO volunteers
         (id, organization_id, name, first_name, initials, role, email, phone, joined_at,
          status, tone, languages_json, causes_json, hours_verified, attendance_rate,
          events_completed, interests, availability_json)
         VALUES (?1, ?2, ?3, ?4, ?5, 'Volunteer', ?6, ?7, ?8, ?9, 'violet', '[]', ?10, 0, 0, 0,
                 ?11, ?12)",
        params![
            id,
            organization_id,
            row.name,
            first_name,
            initials_for(&row.name),
            row.email,
            row.phone,
            now,
            row.status,
            causes_json,
            row.interests,
            availability_json,
        ],
    )?;
    for skill in &row.skills {
        conn.execute(
            "INSERT OR IGNORE INTO volunteer_skills (volunteer_id, skill) VALUES (?1, ?2)",
            params![id, skill],
        )?;
    }
    for slot in &row.availability {
        let (day, period) = slot.split_once(':').unwrap_or((slot.as_str(), ""));
        conn.execute(
            "INSERT OR IGNORE INTO availability_rules (id, volunteer_id, day, period)
             VALUES (?1, ?2, ?3, ?4)",
            params![format!("avail-{id}-{day}-{period}"), id, day, period],
        )?;
    }
    Ok(id)
}

/// Writes the file as one transaction. The audit event commits with the rows, so
/// the trail can never claim an import that did not happen.
pub fn apply(
    conn: &Connection,
    actor: &Account,
    organization_id: &str,
    text: &str,
) -> Result<ImportSummary> {
    let preview = preview(conn, organization_id, text)?;
    if !preview.problems.is_empty() {
        return Err(CoreError::rule(
            "IMPORT_REJECTED",
            preview.problems.join(" "),
            None,
            Some("FIX_IMPORT_FILE".into()),
        ));
    }
    if preview.invalid > 0 {
        return Err(CoreError::rule(
            "IMPORT_REJECTED",
            format!(
                "{} of {} rows need a fix before anything is written.",
                preview.invalid, preview.total
            ),
            None,
            Some("FIX_IMPORT_FILE".into()),
        ));
    }
    if preview.valid == 0 {
        return Err(CoreError::Validation(
            "This file has no volunteer rows to add.".into(),
        ));
    }

    let now = demo_now(conn)?;
    let transaction = conn.unchecked_transaction()?;
    let mut created_ids = Vec::with_capacity(preview.valid);
    for row in &preview.rows {
        created_ids.push(insert_row(&transaction, organization_id, row, &now)?);
    }
    append_actor_audit(
        &transaction,
        "coordinator",
        &actor.name,
        "volunteers.imported",
        "organization",
        organization_id,
        format!(
            "Imported {} volunteer{} from a spreadsheet",
            created_ids.len(),
            if created_ids.len() == 1 { "" } else { "s" }
        ),
        Some(format!(
            "{} rows read · {} added",
            preview.total,
            created_ids.len()
        )),
    )?;
    transaction.commit()?;

    Ok(ImportSummary {
        created: created_ids.len(),
        created_ids,
        preview,
    })
}

/// The roster in the exact shape `preview` reads, so an export can be edited and
/// imported back. Skills, availability and causes travel as the same
/// semicolon-separated cells the importer accepts.
pub fn export_roster(conn: &Connection, organization_id: &str) -> Result<String> {
    let mut statement = conn.prepare(
        "SELECT id, name, email, phone, status, interests, causes_json, availability_json
         FROM volunteers WHERE organization_id = ?1 ORDER BY name COLLATE NOCASE",
    )?;
    let mut rows = statement.query(params![organization_id])?;
    let mut lines = vec![COLUMNS
        .iter()
        .map(|(_, label)| csv_cell(label))
        .collect::<Vec<_>>()
        .join(",")];

    let mut skills_statement = conn.prepare(
        "SELECT skill FROM volunteer_skills WHERE volunteer_id = ?1 ORDER BY skill COLLATE NOCASE",
    )?;
    while let Some(row) = rows.next()? {
        let id: String = row.get(0)?;
        let name: String = row.get(1)?;
        let email: String = row.get(2)?;
        let phone: String = row.get(3)?;
        let status: String = row.get(4)?;
        let interests: String = row.get(5)?;
        let causes: Vec<String> = serde_json::from_str(&row.get::<_, String>(6)?)?;
        let availability: Vec<String> = serde_json::from_str(&row.get::<_, String>(7)?)?;

        let mut skills = Vec::new();
        let mut skill_rows = skills_statement.query(params![id])?;
        while let Some(skill) = skill_rows.next()? {
            skills.push(skill.get::<_, String>(0)?);
        }

        let cells = [
            name,
            email,
            phone,
            status,
            skills.join("; "),
            availability.join("; "),
            interests,
            causes.join("; "),
        ];
        lines.push(
            cells
                .iter()
                .map(|value| csv_cell(value))
                .collect::<Vec<_>>()
                .join(","),
        );
    }
    Ok(format!("\u{feff}{}\r\n", lines.join("\r\n")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    #[test]
    fn quoted_cells_survive_commas_quotes_and_newlines() {
        let rows =
            parse_rows("Name,Notes\r\n\"Chen, Maya\",\"She said \"\"hello\"\"\r\ntwice\"\r\n");
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[1][0], "Chen, Maya");
        assert_eq!(rows[1][1], "She said \"hello\"\r\ntwice");
    }

    #[test]
    fn blank_lines_are_not_rows() {
        let rows = parse_rows("Name,Email\n\nMaya,maya@example.org\n\n");
        assert_eq!(rows.len(), 2);
    }

    #[test]
    fn the_template_round_trips_through_the_parser() {
        let parsed = parse_rows(&template_csv());
        let (indexes, columns) = header_indexes(&parsed[0]);
        assert_eq!(columns.len(), COLUMNS.len());
        for (key, _) in COLUMNS {
            assert!(indexes.contains_key(key), "missing {key}");
        }
        // The example row is itself a valid row, so the template can be filled in
        // and imported without removing anything.
        assert_eq!(cell(&parsed[1], &indexes, "email"), "maya.chen@example.org");
        assert_eq!(cell(&parsed[1], &indexes, "name"), "Maya Chen");
    }

    #[test]
    fn a_header_that_omits_a_required_column_reads_no_rows() {
        let database = Database::in_memory().expect("database");
        let preview =
            preview(database.connection(), "org-1", "Email\nmaya@example.org\n").expect("preview");
        assert_eq!(preview.total, 0);
        assert!(preview.problems[0].contains("Name"));
        assert!(preview.rows.is_empty());
    }
}
