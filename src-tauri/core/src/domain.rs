use chrono::{DateTime, Datelike, FixedOffset, NaiveDate};

use crate::models::{AttentionItem, CoverageDay};

#[derive(Debug, Clone)]
pub struct RoleView {
    pub name: String,
    pub required: i64,
    pub filled: i64,
}

#[derive(Debug, Clone)]
pub struct ShiftView {
    pub id: String,
    pub opportunity_id: String,
    pub opportunity_title: String,
    pub cause: String,
    pub starts_at: DateTime<FixedOffset>,
    pub capacity: i64,
    pub confirmed: i64,
    pub roles: Vec<RoleView>,
}

/// Coverage health = filled required role slots / required role slots across
/// shifts that have not started yet. Seat fill is charted separately so the two
/// measures are never conflated. See docs/COVERAGE_HEALTH.md.
pub fn role_coverage_percent(shifts: &[ShiftView], now: DateTime<FixedOffset>) -> u8 {
    let (filled, required) = shifts.iter().filter(|shift| shift.starts_at > now).fold(
        (0_i64, 0_i64),
        |(filled, required), shift| {
            let required_slots: i64 = shift.roles.iter().map(|role| role.required).sum();
            let filled_slots: i64 = shift.roles.iter().map(|role| role.filled).sum();
            (filled + filled_slots, required + required_slots)
        },
    );

    if required == 0 {
        return 100;
    }
    ((filled as f64 / required as f64) * 100.0).round() as u8
}

fn day_label(starts_at: DateTime<FixedOffset>) -> String {
    starts_at.format("%a %-I:%M %p").to_string()
}

pub fn derive_attention(
    shifts: &[ShiftView],
    now: DateTime<FixedOffset>,
    limit: usize,
) -> Vec<AttentionItem> {
    let today = now.date_naive();
    let mut items: Vec<AttentionItem> = Vec::new();

    for shift in shifts {
        if shift.starts_at <= now {
            continue;
        }
        let days_out = (shift.starts_at.date_naive() - today).num_days();
        if days_out > 14 {
            continue;
        }

        if let Some(role) = shift.roles.iter().find(|role| role.filled < role.required) {
            let missing = role.required - role.filled;
            let detail = if missing == 1 {
                format!("{} missing · {}", role.name, day_label(shift.starts_at))
            } else {
                format!(
                    "{} {} slots open · {}",
                    missing,
                    role.name,
                    day_label(shift.starts_at)
                )
            };
            items.push(AttentionItem {
                id: format!("{}-{}", shift.id, role.name),
                opportunity_id: shift.opportunity_id.clone(),
                title: shift.opportunity_title.clone(),
                detail,
                cause: shift.cause.clone(),
                severity: if days_out <= 5 { "critical" } else { "warning" }.into(),
                href: format!("/coordinator/coverage?shift={}", shift.id),
                sort_key: shift.starts_at.to_rfc3339(),
            });
            continue;
        }

        let seats_open = shift.capacity - shift.confirmed;
        let fill_percent = if shift.capacity == 0 {
            100.0
        } else {
            (shift.confirmed as f64 / shift.capacity as f64) * 100.0
        };
        if seats_open > 0 && fill_percent < 75.0 {
            items.push(AttentionItem {
                id: format!("{}-seats", shift.id),
                opportunity_id: shift.opportunity_id.clone(),
                title: shift.opportunity_title.clone(),
                detail: format!(
                    "{} {} open · {}",
                    seats_open,
                    if seats_open == 1 { "spot" } else { "spots" },
                    day_label(shift.starts_at)
                ),
                cause: shift.cause.clone(),
                severity: "warning".into(),
                href: format!("/coordinator/coverage?shift={}", shift.id),
                sort_key: shift.starts_at.to_rfc3339(),
            });
        }
    }

    items.sort_by(|a, b| a.sort_key.cmp(&b.sort_key));
    items.truncate(limit);
    items
}

fn weekday_key(date: NaiveDate) -> String {
    date.format("%a").to_string().to_lowercase()
}

pub fn coverage_days(
    shifts: &[ShiftView],
    now: DateTime<FixedOffset>,
    days: i64,
) -> Vec<CoverageDay> {
    let today = now.date_naive();
    let start = today - chrono::Duration::days(today.weekday().num_days_from_monday() as i64);
    (0..days)
        .map(|offset| {
            let date = start + chrono::Duration::days(offset);
            let matching: Vec<&ShiftView> = shifts
                .iter()
                .filter(|shift| shift.starts_at.date_naive() == date)
                .collect();
            let capacity: i64 = matching.iter().map(|shift| shift.capacity).sum();
            let confirmed: i64 = matching.iter().map(|shift| shift.confirmed).sum();
            let percent = if capacity == 0 {
                0
            } else {
                ((confirmed as f64 / capacity as f64) * 100.0).round() as u8
            };
            CoverageDay {
                key: weekday_key(date),
                label: date.format("%a %-d").to_string(),
                capacity,
                confirmed,
                percent,
            }
        })
        .collect()
}

/// Used by the seed integrity test and by calendar diagnostics.
pub fn month_prefix(date: NaiveDate) -> String {
    format!("{:04}-{:02}", date.year(), date.month())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn role(name: &str, required: i64, filled: i64) -> RoleView {
        RoleView {
            name: name.into(),
            required,
            filled,
        }
    }

    fn shift(
        id: &str,
        starts_at: &str,
        capacity: i64,
        confirmed: i64,
        roles: Vec<RoleView>,
    ) -> ShiftView {
        ShiftView {
            id: id.into(),
            opportunity_id: "opp-food".into(),
            opportunity_title: "Community Food Distribution".into(),
            cause: "food".into(),
            starts_at: DateTime::parse_from_rfc3339(starts_at).unwrap(),
            capacity,
            confirmed,
            roles,
        }
    }

    fn now() -> DateTime<FixedOffset> {
        DateTime::parse_from_rfc3339("2026-10-13T07:45:00-04:00").unwrap()
    }

    #[test]
    fn coverage_only_counts_future_role_slots() {
        let shifts = vec![
            shift(
                "past",
                "2026-10-12T09:00:00-04:00",
                10,
                10,
                vec![role("Driver", 1, 1)],
            ),
            shift(
                "future",
                "2026-10-17T09:00:00-04:00",
                16,
                10,
                vec![role("Driver", 1, 0), role("General", 2, 2)],
            ),
        ];
        assert_eq!(role_coverage_percent(&shifts, now()), 67);
    }

    #[test]
    fn full_coverage_is_one_hundred() {
        let shifts = vec![shift(
            "s1",
            "2026-10-17T09:00:00-04:00",
            10,
            10,
            vec![role("Driver", 1, 1)],
        )];
        assert_eq!(role_coverage_percent(&shifts, now()), 100);
    }

    #[test]
    fn attention_reports_missing_role_before_open_seats() {
        let shifts = vec![shift(
            "sat",
            "2026-10-17T09:00:00-04:00",
            16,
            10,
            vec![role("Driver", 1, 0), role("Spanish Support", 2, 1)],
        )];
        let items = derive_attention(&shifts, now(), 3);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].detail, "Driver missing · Sat 9:00 AM");
        assert_eq!(items[0].severity, "critical");
    }

    #[test]
    fn attention_skips_thin_but_acceptable_seat_gaps() {
        let shifts = vec![shift(
            "thu",
            "2026-10-15T14:00:00-04:00",
            12,
            10,
            vec![role("General", 2, 2)],
        )];
        assert!(derive_attention(&shifts, now(), 3).is_empty());
    }

    #[test]
    fn attention_includes_severe_seat_gap() {
        let shifts = vec![shift(
            "sat-garden",
            "2026-10-17T13:00:00-04:00",
            5,
            3,
            vec![role("Gardener", 2, 2)],
        )];
        let items = derive_attention(&shifts, now(), 3);
        assert_eq!(items[0].detail, "2 spots open · Sat 1:00 PM");
        assert_eq!(items[0].severity, "warning");
    }

    #[test]
    fn attention_ignores_shifts_beyond_two_weeks() {
        let shifts = vec![shift(
            "far",
            "2026-10-30T09:00:00-04:00",
            10,
            2,
            vec![role("Driver", 2, 0)],
        )];
        assert!(derive_attention(&shifts, now(), 3).is_empty());
    }

    #[test]
    fn coverage_days_aggregate_two_shifts_on_the_same_day() {
        let shifts = vec![
            shift("a", "2026-10-17T09:00:00-04:00", 16, 10, vec![]),
            shift("b", "2026-10-17T13:00:00-04:00", 5, 3, vec![]),
        ];
        let days = coverage_days(&shifts, now(), 7);
        let saturday = days.iter().find(|day| day.label == "Sat 17").unwrap();
        assert_eq!(saturday.capacity, 21);
        assert_eq!(saturday.confirmed, 13);
        assert_eq!(saturday.percent, 62);
    }
}
