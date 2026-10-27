# Metrics and formulas

This document defines every number the app shows: where it comes from, how it is
calculated, and whether it is stored or derived. “Stored” means a SQLite value is read
back as-is. “Derived” means the number is recomputed from stored rows every time it is
read. The demo clock is the `demo_now` setting, not the computer clock, except where a
query explicitly uses SQLite’s `date('now')` (noted below).

The rule behind the split is simple: facts that people enter or workflows produce live in
tables; percentages, health statuses and cohort rates are derived so they cannot go stale.
When a screen instead reads a bundled seed field, that is called out.

## 1. Coverage

Coverage is two measures, not one number with a color. The metric card reports role coverage
(filled role slots over required role slots) and the weekly chart reports seat fill (confirmed
seats over capacity). They are allowed to differ, because a shift can have every role slot
filled and still have open general seats. One rule set drives the card, the chart, the footer,
and the Rust tests, so the numbers agree everywhere and can be explained live.

### Role coverage

`role_coverage_percent` in `src-tauri/core/src/domain.rs` and
`roleCoveragePercent` in `src/lib/workspace/compute.ts` use the same formula over shifts
that have **not started yet**:

```text
filled_slots  = Σ shift.roles[].filled
required_slots = Σ shift.roles[].required
role coverage = round(filled_slots / required_slots × 100)
```

If `required_slots` is 0, the result is 100 % (an empty denominator means there is no
unfilled role to report). A role is filled from `shift_roles.filled`; it is updated by
registration, waitlist promotion and AutoRoster apply, all inside the core. This is the
percentage on Mission Control and the report coverage summary.

### Seat fill

Seat fill is a different measure and must not be substituted for role coverage:

```text
seat fill = round(shift.confirmed / shift.capacity × 100)
```

`fillPercent` in `selectors.ts` returns 0 when capacity is 0. The weekly chart sums
`confirmed` and `capacity` per day before dividing, rather than averaging daily
percentages. A shift can have every role slot filled and still have open general seats,
which is why Mission Control labels the card “role coverage” and the bars “seat fill”.
The shipped design showed a 91 % card above bars that averaged about 86 %; rather than
bend one number to flatter the other, each got a precise definition and a label that says
which one it is. A 75 % seat fill is normal pipeline, not an alarm, which is why the
attention rule escalates a missing role first and only then open seats.

### Weekly coverage

`weeklyCoverage` in `compute.ts` takes the Monday–Sunday week containing `demoNow`, sums
all shifts whose `starts_at` date falls on each day, and returns:

```text
capacity  = Σ shift.capacity
confirmed = Σ shift.confirmed
percent   = capacity == 0 ? 0 : round(confirmed / capacity × 100)
```

The Rust equivalent, `coverage_days`, does the same for seven days starting on the Monday
of the demo date. It does not exclude shifts that have already started; it is a calendar
view of the whole week. The table under the chart repeats the same capacity, confirmed and
percentage values, so the chart has a text alternative.

### Attention items

`derive_attention` (Rust) and `deriveAttention` (TypeScript) are intended to be the same
rule. For each shift that starts after the demo clock and no more than 14 calendar days
away:

1. Find the **first** role with `filled < required`.
2. If one exists, emit one item for that role. Missing count is
   `required − filled`. Severity is `critical` when the shift is 5 or fewer calendar days
   away, otherwise `warning`. No separate seat item is emitted for that shift.
3. Only when every role is filled, look at seats. If `capacity − confirmed > 0` and
   `confirmed / capacity < 75 %`, emit a `warning` seat item.
4. Sort by shift start ascending, then truncate to the requested limit (3 on Mission
   Control).

The horizon is deliberately short: a role gap 15 days out is not an attention item. A
single open seat on a shift that is at least 75 % full is also not an item, even if a role
is technically filled.

Mission Control’s attention count is the length of that truncated list, not a count of all
gaps in the database. The badge and the list therefore agree by construction.

### Coverage page status

`getCoverageRows` in `selectors.ts` assigns a per-shift status:

```text
critical  = at least one open role AND seat fill < 70 %
at-risk   = otherwise, seat fill < 86 %
healthy   = otherwise
```

`getRoleRisk` aggregates upcoming shifts by role name (`filled / required`) and sorts the
lowest percentage first. Both are derived from the same shift/role rows as role coverage.

## 2. Hours, review and verification

### Integer minutes

All durations are integer minutes. The database stores `minutes`,
`scheduled_minutes`, `calculated_minutes` and `approved_minutes` as integers; only display
helpers divide by 60. `formatMinutes` renders `195` as `3h 15m`. No floating-point hours
are stored, so totals cannot drift by rounding.

### Attendance to request

On check-out, `check_out` in `src-tauri/core/src/workflows.rs` computes:

```text
calculated_minutes = clamp(checked_out_at − checked_in_at, 1, 1440)
scheduled_minutes  = clamp(shift.ends_at − shift.starts_at, 1, 1440)
```

The check-out timestamp is the demo clock. If the calculated duration is zero or negative
it becomes 1 minute; anything over 24 hours is capped at 1440. The hour entry is inserted
with:

```text
minutes           = calculated_minutes
status            = pending   if setting.hours_require_approval is true
                  = verified  otherwise
calculated_minutes = calculated_minutes
scheduled_minutes  = scheduled_minutes
source_shift_id    = the shift
note               = "Calculated from check-in and check-out"
```

If approval is not required, a verification record is issued immediately. Otherwise an
`HOURS_SUBMITTED` notification points the coordinator at the review queue. Check-out is
idempotent: a second check-out does not create a second entry.

### Review

`review_hours` only accepts a `pending` entry, requires a non-empty review note, and
accepts either:

- `verified` with `approved_minutes` in 1–1440; or
- `rejected` with no approved minutes (the stored value is cleared).

Approval issues a verification from the approved minutes. Rejection creates an
`HOURS_ADJUSTED` notification. Both write an audit event (`hours.approve` or
`hours.reject`) with the note.

### Displayed hour totals

`getHourRows` in `selectors.ts` turns each hour entry into one row. Its effective value is:

```text
approvedMinutes = decision.approvedMinutes
                  ?? (entry.status == "verified" ? entry.minutes : null)

displayed value = approvedMinutes ?? requestedMinutes
```

`getHoursSummary` then produces:

```text
totalMinutes    = Σ (approvedMinutes ?? requestedMinutes) for all of the volunteer’s rows
verifiedMinutes = Σ (approvedMinutes ?? requestedMinutes) for rows whose displayed status is verified
pendingMinutes  = Σ requestedMinutes for rows whose displayed status is pending
thisMonthMinutes= Σ (approvedMinutes ?? requestedMinutes) for rows in the demo month
events          = number of distinct opportunity IDs in those rows
certificates    = 1 if the volunteer has at least one verified row, else 0
```

Pending rows contribute their requested minutes to the total, but only verified rows
contribute to “verified”. A reviewed row uses the reviewer’s approved minutes even when
those differ from the requested value.

The volunteer directory, retention at-risk table and records export read the stored
`volunteers.hours_verified` field instead. That field is seeded/updated as a stored
summary, not recomputed by `getHoursSummary`; the two can differ after a new approval.
`docs/IMPLEMENTATION_STATUS.md` records this as a display limitation.

### Verification records

`issue_verification` creates one `service_verifications` row per approved hour entry:

```text
code          = CFV-<year of service date>-<six random digits>
volunteer_id  = entry volunteer
date_start    = date_end = entry date
total_minutes = approved minutes
issued_at     = demo clock
issued_by     = coordinator name
```

It also writes the code back to `hour_entries.verification_id`. The code is unique in the
table. Seed data groups a volunteer’s historical entries under one verification code, but
new approvals create one record per approval; the certificate screen reads the
`service_verifications` table, not a recomputed sum.

### Mission Control hours this month

`get_mission_control` in `services.rs` calculates:

```text
minutes_this_month = SUM(COALESCE(approved_minutes, minutes))
                     WHERE substr(date, 1, 7) = demo YYYY-MM
                       AND status <> 'rejected'
hours_this_month   = minutes_this_month / 60
```

The division is integer truncation. Reviewed adjustments are respected because an approved
entry contributes its `approved_minutes`; unreviewed entries contribute their requested
minutes, and rejected rows are excluded. The card therefore agrees with the hours credited
by the review workflow.

## 3. Impact outcomes

### Stored outcome records

Impact is not inferred from volunteer hours. `impact_metric_definitions` names a metric per
opportunity; `impact_results` stores each recorded value with a date and recorder. The core
groups results by definition (`load_impact_metrics`) and sums per definition. Mission
Control additionally groups across opportunities by `metric_key`:

```text
meals_packed       = round(Σ impact_results.value where key = meals_packed)
tutoring_sessions  = round(Σ value where key = tutoring_sessions)
trees_planted      = round(Σ value where key = trees_planted)
families_served    = round(Σ value where key = families_served)
```

Unknown metric keys are ignored by that four-key switch, though they still appear in the
Impact report, which lists every definition/result.

`getImpactOutcomes` in `selectors.ts` performs the same grouping over
`session.impactMetrics` for the React impact screens. The report preview takes the four
values from that map and falls back to 0 when a key has no records. “Families served this
year” is a year-to-date outcome: there is no month predicate, and the UI label matches that
scope.

### Annual and monthly totals

The organization totals (`hoursYtd`, `uniqueVolunteersYtd`, `shiftsCompleted`,
`attendanceRate`, and the outcome fallback fields) live in the single `impact_totals` row.
Mission Control reads that row for the annual cards. The React Impact Analytics and Impact
Report screens read `workspace.impact`, which is the bundled
`shared/demo-workspace.json` copy of the same values; they do not reread `impact_totals`
after a workflow write. Because no workflow edits annual impact totals, both paths show the
same seeded numbers today.

### Trend chart

`getHoursTrend` on Reports and Impact Analytics reads the hour ledger for the twelve months
ending with the demo month. Rejected entries are excluded, and each row contributes
`COALESCE(approved_minutes, minutes)`. Entries are bucketed by their service date and
the buckets are converted to whole hours:

```text
month key   = demo month − (11 − index)
minutes[m]  = Σ effective minutes for rows whose date starts with month key
hours[m]    = round(minutes[m] / 60)
```

This is a measured monthly series from stored entries, not a weighted allocation of an
annual total.

### Personal impact

`getVolunteerImpact` uses `getHoursSummary` for the volunteer’s recorded, verified, pending
and this-month minutes, then groups the same rows by opportunity cause:

```text
cause minutes = Σ (approvedMinutes ?? requestedMinutes)
cause percent = round(cause minutes / total minutes × 100)
```

`events` is the distinct opportunity count. There is no per-volunteer meals/families
conversion; those outcomes are organization-level records, not hours multiplied by a
factor.

## 4. Retention

`load_retention` in `workflows.rs` reads all `hour_entries` with status `verified` or
`pending` and builds six monthly cohorts ending with the current demo month. For each
month:

```text
observation_cutoff = demo date − 30 days
eligible = volunteers whose first service date in that month satisfies
           first_date <= observation_cutoff
returned = eligible volunteers with another service date in
           (first_date, first_date + 30 days]
rate     = eligible == 0 ? 0 : round(returned / eligible × 100)
```

Only the earliest date inside the month counts as the cohort entry; duplicate service
dates are removed first. Eligibility requires the full 30-day observation window to have
elapsed, so volunteers who started less than 30 days before the demo date do not inflate
the denominator. `retention_cohorts` exposes the same rows to the report service, so the
screen and report cannot disagree. The UI subtitle and the report both say 30 days. The
report summary is a weighted aggregate (`Σ returned / Σ eligible`), not the mean of the
monthly rates.

`RetentionPage` shows the unweighted mean of the six cohort rates as “Average return
rate”. The report shows the weighted aggregate. For that chart the mean is a display
summary only; do not compare it directly with the report’s average.

### At-risk volunteers

`getAtRiskVolunteers` in `selectors.ts` filters the bundled volunteer rows:

```text
attendanceRate < 85 OR eventsCompleted < 5
```

then sorts by attendance ascending and keeps six. It uses the seeded/stored summary fields
on `volunteers`, not a live attendance computation, and reads `demoWorkspace` rather than
the session snapshot. The card’s count is therefore a static catalog of low-engagement
profiles, not a count of everyone who missed a shift.

## 5. Reports

Every report is generated in Rust (`src-tauri/core/src/reports.rs`). `generate` validates
the template against a fixed list, validates `YYYY-MM-DD` dates, and requires
`start <= end`. The default range is January 1 of the end year through the demo date. The
chosen period is printed on every document even when a template ignores it.

### Participation (`custom` also uses this)

Source: `hour_entries` joined to volunteer, opportunity and (optionally) registration.
Filtered by service date and optional cause. Columns come from an eight-field allow-list
(`volunteer`, `program`, `date`, `hours`, `status`, `verification`, `cause`, `role`).
Effective minutes are `COALESCE(approved_minutes, minutes)`.

```text
Records            = number of returned rows
Approved or recorded = Σ effective minutes over all rows (pending included)
Verified           = Σ effective minutes where status = verified
Volunteers         = distinct volunteers among verified rows
```

Grouping by cause or program only sorts the rows; it does not aggregate them.

### Coverage

Source: `shift_roles` joined to shifts and opportunities, restricted to shifts starting at
or after the demo clock and optional cause. Each row shows required, filled and
`MAX(required − filled, 0)`. Summary:

```text
Required role slots = Σ required
Filled slots        = Σ filled
Role coverage       = required == 0 ? 100 : round(filled / required × 100)
```

The request date range is not applied to this template; the period label is descriptive
only.

### Attendance

Source: `attendance_events` joined to shifts, opportunities and volunteers, filtered by
shift date and optional cause. Counts are row counts by status:

```text
Arrivals  = COUNT(status = checked_in)
Completed = COUNT(status = completed)
No-shows  = COUNT(status = no_show)
```

`expected` rows are listed but count in none of the three summary values.

### Retention

Uses the cohort rows above. Summary totals are `Σ eligible`, `Σ returned`, and the weighted
rate `round(Σ returned / Σ eligible × 100)`. The request date range is ignored.

### Skills and credentials

Source: `volunteer_skills` joined to volunteers and left-joined to credentials. Status is:

```text
no credential  = no credential row
expired        = valid_through < date('now')
expiring       = valid_through <= date('now', '+45 days')
current        = otherwise
```

These comparisons use SQLite’s real clock, not `demo_now`; on a machine whose date differs
from the demo date, the expiry bucket can differ from the badge on the Credentials screen.
A volunteer with multiple credentials produces multiple skill rows, so “Skill rows” is row
count, not a unique volunteer count. “Expiring or expired” counts those rows.

### Impact

Source: every `impact_results` row joined to its definition and opportunity. No date or
cause filter is applied. Values are printed with no decimal when integral, otherwise one
decimal. “Outcome records” is the row count.

### Export

CSV and PDF are built by Rust and written through the Tauri save dialog. CSV quotes every
cell and escapes quotes. PDF is a small one-face Helvetica writer with a summary block and
repeated headers per page. Neither export recalculates a metric; both serialize the
`ReportDocument` the preview already showed.

## 6. Record and audit counts

### Records

`RecordsPage` builds rows from three sources and counts them:

```text
volunteers  = one row per volunteer
shifts      = one row per shift
hours       = one row per hour entry (bulk entries plus Maya’s curated entries)
verifications = hour rows that carry a verification_id
all         = volunteers + shifts + hours
```

The tab counts are row counts after deduplication of Maya’s ledger (her curated entries
replace bulk entries for the same person), not distinct people or distinct programs. The
table’s “records” caption is the filtered row count.

### Audit

`load_audit` reads `audit_events` ordered by timestamp descending, maps the demo
coordinator’s actor id to the coordinator name, and excludes only the seeding event
(`demo_seeded`). Every workflow command appends one event in the same transaction as its
write. The Audit page count and export are the length of that list after actor/entity/
search filters. Audit rows are append-only by workflow convention; there is no hash chain
or signature, despite the “tamper-evident” badge.

## 7. Stored versus derived

| Number                                            | Kind                               | Source                                          |
| ------------------------------------------------- | ---------------------------------- | ----------------------------------------------- |
| Role coverage %                                   | derived                            | `shift_roles.filled/required` for future shifts |
| Seat fill %                                       | derived                            | `shifts.confirmed/capacity`                     |
| Weekly capacity, confirmed, %                     | derived                            | shifts in the selected week                     |
| Attention count                                   | derived                            | future shifts within 14 days, limit 3           |
| Checked-in / completed / no-show counts           | derived                            | `attendance_events.status`                      |
| Calculated minutes                                | stored                             | written at check-out                            |
| Requested minutes                                 | stored                             | `hour_entries.minutes`                          |
| Approved minutes                                  | stored                             | reviewer decision                               |
| Verified / pending hour totals                    | derived                            | hour rows and decisions                         |
| Verification code                                 | stored                             | `service_verifications.code`                    |
| Meals, tutoring, trees, families                  | stored outcomes                    | `impact_results` summed by key                  |
| Annual hours, unique volunteers, shifts completed | stored totals                      | `impact_totals`                                 |
| Hours this month (Mission Control)                | derived                            | `SUM(hour_entries.minutes)`                     |
| Trend chart months                                | display allocation                 | annual total × fixed weights                    |
| Retention eligible/returned/rate                  | derived                            | `hour_entries` service dates                    |
| At-risk count                                     | derived from stored profile fields | `volunteers.attendance_rate/events_completed`   |
| Report rows and summaries                         | derived                            | SQL over workflow tables                        |
| Directory “verified hours”                        | stored summary                     | `volunteers.hours_verified`                     |
| Retention signals                                 | derived                            | `insights.rs` rules over service rows           |
| Milestones (hours, shifts, service years)         | derived                            | verified hour entries and completed shifts      |
| Engagement metrics (return 30/60/90, no-show %)   | derived                            | registrations, attendance, waitlist promotions  |
| Credential readiness (current/expiring/expired)   | derived                            | `volunteer_credentials` against the demo date   |
| Replacement recommendation                        | derived                            | waitlist order plus `validate_registration`     |
| Recovery plan cost and coverage change            | derived                            | the planner's own comparison, per plan          |

### Decision readouts

`insights.rs` is the source for the numbers a coordinator decides with, and each one is a
count or a rate over stored rows. Nothing is a model output:

```text
new_volunteers        volunteers whose first service date is within 90 days
return_30/60/90       percentage of new starters with another service date in the window
inactive_volunteers   no completed shift in 90 days
no_show_rate          no-show attendance rows / registrations for shifts that started
late_cancellation     cancellations within 48 hours of the shift start
waitlist_promotions   waitlist entries moved to promoted
promotion_rate        promotions that ended in a completed shift
credential_readiness  credentials valid today / expiring in 30 days / already expired
assignments_at_risk   future assignments whose credential lapses before the shift starts
```

Percentages are rounded to whole numbers for display, and a denominator of zero reads as
zero rather than as a fabricated baseline. The Reports screen renders the same fields the
report service reads, so the card and a report cannot disagree.

## 8. Known inconsistencies

These are deliberately recorded rather than hidden:

1. The volunteer directory’s verified hours are a stored snapshot and can differ from the
   personal ledger after new approvals.
2. Credential expiry in the report uses the real clock; the Credentials screen uses the
   demo clock.
3. Reports that do not use the date range still print the requested period.
4. The current month is included in the retention chart, but its cohort has no fully
   observed volunteers yet, so its rate is 0 % by definition. Read it as “not enough data”
   rather than a drop in retention.
