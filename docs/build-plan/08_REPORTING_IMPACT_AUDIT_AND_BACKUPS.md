# CivicFlow Build Plan

> Goal: build CivicFlow as a reliable, standalone, offline-first FBLA Coding & Programming project whose implementation matches the approved product vision and 42-screen UI system.

## Non-negotiable engineering rules

1. **Never move to the next phase with red tests.**
2. **No fake UI.** If a button is visible in the final demo path, it works.
3. **Rust owns authoritative domain rules.** Frontend validation improves UX, but backend validation decides what is valid.
4. **Every write is testable and auditable.**
5. **Every complex feature has a deterministic demo case.**
6. **No internet dependency for the competition demo.**
7. **The 1600×1000 design references are targets, not fixed page heights.** Long real pages scroll inside the desktop window.
8. **Do not add major features after Phase 8.** Phases 9–10 are for hardening, evidence, and presentation.

## Locked technical direction

| Layer | Choice |
|---|---|
| Desktop shell | Tauri 2 |
| Frontend | React + TypeScript + Vite |
| Package manager | pnpm |
| Core/domain backend | Rust |
| Local database | SQLite through Rust (`rusqlite`) |
| Routing | React Router |
| Data cache | TanStack Query |
| Forms | React Hook Form + Zod for client-side UX validation |
| Charts | Recharts with accessible text/table fallbacks |
| Dates | `date-fns` on frontend, `chrono` in Rust |
| IDs | UUIDs generated in Rust |
| Unit/component tests | Vitest + React Testing Library + `user-event` |
| Accessibility tests | semantic queries + `jest-axe`; real-browser/manual checks for contrast, focus, and screen-reader behavior |
| Rust tests | `cargo test`, `proptest`, `tempfile` |
| Native E2E | WebdriverIO Tauri service / embedded WebDriver |
| CI | GitHub Actions |
| Release build | Tauri build + `tauri-apps/tauri-action` |

Do not blindly pin versions from this document. At repository creation, install the **current stable compatible versions**, commit both JavaScript and Cargo lockfiles, and do not casually upgrade dependencies in the final month before competition.

# Phase 8 — Reporting, Impact, Audit, Backup, and Recovery

## Outcome

Complete the parts of CivicFlow that make the application feel like professional operational software:

- report builder
- PDF/CSV export
- impact metrics
- retention
- records
- audit log
- rolling SQLite backups
- backup preview
- restore with integrity validation

After this phase, **feature scope freezes**.

---

## 1. Reporting read models

Do not let the frontend build complex business aggregations from raw rows.

Create Rust report services:

```text
participation_report
coverage_report
attendance_report
retention_report
skills_report
impact_report
custom_report
```

Input:

```text
date range
program
opportunity
volunteer
role
cause
attendance status
credential
```

Output is a typed report model.

---

## 2. Custom report builder

Frontend lets users select:

```text
fields
filters
grouping
chart type
```

Send normalized request to Rust.

Example:

```json
{
  "fields": ["volunteer_name", "hours", "program"],
  "groupBy": ["program"],
  "filters": {
    "dateStart": "...",
    "dateEnd": "..."
  }
}
```

Backend validates allowed fields.

Never concatenate user-selected column names directly into unsafe SQL.

Map enum → known SQL expression.

---

## 3. CSV export

CSV should be straightforward and reliable.

Rust:

- run report
- serialize rows
- choose destination with Tauri Dialog plugin
- write file
- return export metadata

Test:

```text
headers
escaping commas
quotes
Unicode
empty report
large report
canceled save dialog
```

---

## 4. PDF export

Use a maintained Rust PDF library appropriate at implementation time.

Do not make the PDF export depend on an external browser being installed.

Export:

```text
organization branding
report period
summary metrics
tables
chart images
source/footnotes if needed
generated timestamp
```

The Organization Impact Report Preview should match the structure of the PDF, even if typography differs slightly.

If charts are rendered in the frontend, export a high-resolution chart image/data representation to the Rust report service.

Keep an accessible table representation in the application regardless of the PDF.

---

## 5. Impact metrics

Define metrics per opportunity/program.

Example:

```text
MEALS_PACKED
STUDENTS_TUTORED
TUTORING_SESSIONS
TREES_PLANTED
FAMILIES_SERVED
GARDEN_BEDS_RESTORED
```

Store:

```text
metric definition
unit
value
shift/opportunity
recorded_at
recorded_by
```

Avoid pretending volunteer hours directly equal people served.

Impact results need explicit records.

---

## 6. Retention

Define exact calculation.

Example:

```text
30-day return:
volunteers with a second completed service event within 30 days
/
volunteers whose first event was sufficiently long ago to observe the window
```

Write the formula in:

```text
docs/METRICS.md
```

Use cohort eligibility to avoid misleading denominators.

---

## 7. Audit log

Create a central `AuditService`.

Do not let each feature invent logging format.

Audit event:

```text
id
timestamp
actor_type
actor_id
action
entity_type
entity_id
summary
before_json?
after_json?
```

Avoid putting secrets in audit JSON.

Important events:

```text
assignment changed
hours changed
credential verified
opportunity changed
waitlist promoted
backup created
restore performed
```

---

## 8. Rolling backups

Use SQLite-aware backup APIs.

The `rusqlite` backup module exposes SQLite's online backup API and supports backing up a source connection while it remains in use.

Triggers:

```text
startup if previous backup old enough
every N minutes after meaningful writes
before import
before restore
before destructive bulk action
manual backup
```

Do not back up on every tiny keystroke.

---

## 9. Backup metadata and checksum

For each snapshot:

```text
id
path
created_at
trigger
database_size
sha256
schema_version
volunteer_count
opportunity_count
record_count
```

After backup:

1. open snapshot separately
2. `PRAGMA integrity_check`
3. calculate checksum
4. record metadata
5. rotate old snapshots

Retention example:

```text
last 10 automatic
last 5 manual
always keep newest known-good pre-restore snapshot
```

---

## 10. Restore

Restore flow:

1. user selects snapshot
2. CivicFlow displays preview
3. user confirms
4. app creates safety backup of current DB
5. verify selected snapshot integrity
6. restore using SQLite-aware mechanism
7. reopen DB
8. run migrations if required
9. run integrity check
10. refresh all frontend queries
11. audit restore

Test restore failure without corrupting live data.

---

## 11. Records

Unified records page reads from real persisted data.

Do not build a duplicate "records database."

It is a read/search interface across:

```text
volunteers
hours
attendance
opportunities
impact
```

Saved views contain filters, not copied rows.

---

## 12. Tests

### Reports

```text
date boundaries
empty report
grouping
filter combinations
correct totals
CSV escaping
PDF file exists/nonzero
```

### Impact

```text
metrics aggregate correctly
no double counting
archived opportunity remains historical
```

### Retention

```text
cohort denominator
boundary day
one-event volunteer
multiple events same day
```

### Backup

```text
backup active DB
backup checksum
integrity check
rotation policy
preview counts
restore
restore failure
migration after restore
```

Use temporary SQLite files.

---

## 13. Debugging

Never debug a report from its chart first.

Compare:

```text
SQL/read model rows
aggregated result
frontend chart series
```

Backup debugging:

```text
do not use raw fs copy of active WAL DB
verify connections/transactions
use SQLite backup API
open snapshot and integrity-check it
```

---

## 14. Feature freeze

At the end of Phase 8:

```text
NO major new features
```

Create a backlog for "after competition."

From here on, work is:

```text
bugs
tests
accessibility
performance
security
documentation
presentation
```

Tag:

```bash
git tag phase-08-feature-complete
```
## Research anchors used for this plan

- Tauri 2 Create Project: https://v2.tauri.app/start/create-project/
- Tauri Frontend Configuration: https://v2.tauri.app/start/frontend/
- Tauri Tests / WebDriver: https://v2.tauri.app/develop/tests/
- Tauri Capabilities: https://v2.tauri.app/security/capabilities/
- Tauri HTTP headers / CSP: https://v2.tauri.app/security/http-headers/
- Tauri Dialog plugin: https://v2.tauri.app/plugin/dialog/
- Official create-tauri-app repository: https://github.com/tauri-apps/create-tauri-app
- Official tauri-action repository: https://github.com/tauri-apps/tauri-action
- `rusqlite` backup API: https://docs.rs/rusqlite/latest/rusqlite/backup/
- SQLx migrations reference used for migration design comparison: https://docs.rs/sqlx/latest/sqlx/migrate/struct.Migrator.html
- Google OR-Tools assignment-as-min-cost-flow explanation: https://developers.google.com/optimization/flow/assignment_min_cost_flow
- Princeton/Algorithms bipartite matching via max flow: https://algs4.cs.princeton.edu/65reductions/
- Stanford network-flow/bipartite matching notes: https://theory.stanford.edu/~trevisan/cs261/lecture14.pdf
- React Aria testing guidance: https://react-aria.adobe.com/.well-known/skills/react-aria/references/guides/testing.md
- `jest-axe`: https://github.com/NickColley/jest-axe
