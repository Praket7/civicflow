# Data model

CivicFlow stores its workspace in one local SQLite database. The React app never opens the
file; `civicflow-core` owns every read and write, and the screens receive JSON snapshots over
Tauri IPC. The browser preview mirrors the same shape in `localStorage` and is not a second
database.

## Where the database lives

- Native app: `app_data_dir()/civicflow.db`, created by `src-tauri/src/lib.rs` at startup.
  Backups live beside it in `app_data_dir()/backups/`.
- Ownership: `AppState` holds one `Mutex<Database>`; each Tauri command locks it, calls a
  `civicflow-core` function, and returns the fresh snapshot. There is no SQL in React.
- Connection settings: WAL journal mode, `foreign_keys = ON`, a 5-second busy timeout, and
  `application_id = 0x43494656` (`CIFV`) so a foreign SQLite file can be rejected.
- Migrations are embedded in the binary from `src-tauri/core/migrations/` and applied in
  order. `SCHEMA_VERSION` is 3 and is also written to `PRAGMA user_version`.

## Migration ledger

`schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)` records applied
migrations. On open, `Database::migrate` creates the ledger if needed, then checks each
version before running it:

| Version | File                         | Adds                                                                                                                             |
| ------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1       | `0001_initial.sql`           | Organization, people, programs, shifts, hours, audit, impact totals                                                              |
| 2       | `0002_workflows.sql`         | Saved opportunities, applicants, waitlist, registrations, attendance                                                             |
| 3       | `0003_service_lifecycle.sql` | Credentials, role requirements, attendance ledger, check-in, verification, outcomes, saved views, stage history, backup metadata |

Each new migration runs inside a transaction and inserts its version only after the SQL
succeeds. Existing rows are preserved by nullable/defaulted `ALTER TABLE` columns. A database
that reports a higher or lower schema version is refused by backup restore rather than
silently upgraded.

## Tables by concern

### Organization, identity, and configuration

| Table                | Purpose and important columns                                                                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `organizations`      | The single seeded organization: name, initials, mission, address, website, email, timezone. Parent of volunteers, opportunities, and impact totals.                                                                            |
| `app_settings`       | Key/value store for runtime settings: the demo clock (`demo_now`), coordinator identity, current volunteer id, schema version, workflow-seed marker, backup note/time, and the workspace settings edited in Settings.          |
| `users`              | Local sign-in identity: name, unique email, role (`coordinator` or `volunteer`), optional `volunteer_id`, Argon2id `password_hash`, `status`, and `last_login_at`. A volunteer account is linked to exactly one volunteer row. |
| `auth_sessions`      | Opaque session records: user id, SHA-256 token hash, creation and expiry, and `revoked_at`. A password reset revokes every live session for the account.                                                                       |
| `report_saved_views` | Persisted report filters keyed by owner, scope, and name. `filters_json` is a JSON object; owner is deliberately not a foreign key so reports survive staff changes.                                                           |
| `backup_snapshots`   | Metadata for snapshots written into the backup directory: path, trigger, bytes, SHA-256, schema version, integrity, and a JSON count summary. The authoritative backup is the `.db` file, not this row.                        |

### People and eligibility

| Table                   | Purpose and important columns                                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `volunteers`            | Person record: name/initials, contact details, status (`active`, `onboarding`, `inactive`), joined date, verified hours, attendance rate, events completed, birthdate. Unique email. |
| `volunteer_skills`      | Normalized skills, primary key `(volunteer_id, skill)`. Used by matching and role requirements.                                                                                      |
| `availability_rules`    | Normalized weekly availability: `(volunteer_id, day, period)`, constrained to seven days and morning/afternoon/evening. New profile saves write here.                                |
| `credential_types`      | Credential definitions and validity period in months (driver clearance, food safety, tutoring, CPR/AED, garden tools, team lead).                                                    |
| `volunteer_credentials` | Issued credentials with identifier, issue/valid dates, verifier, and notes. Unique per volunteer, type, and identifier. Used by matching and expiry warnings.                        |

`volunteers` still carries `languages_json`, `causes_json`, and `availability_json` copied
from the authored seed. Languages and causes are read from JSON; availability is read from
`availability_rules` first and falls back to `availability_json` for seeded records that were
never edited. The normalized tables are the forward path, and `volunteer_skills` is written
by onboarding.

### Programs and scheduling

| Table               | Purpose and important columns                                                                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `opportunities`     | Program/listing: slug (unique), title, cause, description, address, distance, coordinator, capacity, duration, `training_json`, `requirements_json`, impact metric.                    |
| `shifts`            | Scheduled service window: start/end timestamps, capacity, confirmed seats, waitlist count, status (`scheduled`, `completed`, `canceled`). Checks confirmed ≤ capacity and end > start. |
| `shift_roles`       | Required and filled count per role, unique per shift and role, with `filled ≤ required`. These counters drive coverage and registration validation.                                    |
| `role_requirements` | Optional per-role gates: required skill, credential type, and minimum age, unique per shift and role. Seeded deterministically from the role name.                                     |

The demo authoring step derives role requirements from names such as “Driver”, “Spanish
Support”, “Tutor”, “Food handling”, and “Garden”. A role with no mapping is open to any
eligible volunteer. `training_json` and `requirements_json` stay JSON because they are
ordered display lists, not records queried independently.

### Participation and recruitment

| Table                     | Purpose and important columns                                                                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `saved_opportunities`     | Volunteer shortlist, primary key `(volunteer_id, opportunity_id)`, plus `saved_at`.                                                                                                                                 |
| `applications`            | Recruitment pipeline row with stage (`applied`, `review`, `onboarding`, `active`), source, cause, note, and `skills_json`.                                                                                          |
| `volunteer_stage_history` | Immutable stage transitions for an application: from/to stage, time, actor, note. Exists so stage changes are not just overwrites.                                                                                  |
| `registrations`           | A volunteer’s place on a shift: role, created/updated time, and status (`registered` by default; canceled, completed, and no-show are written by workflows). Status is enforced in Rust, not by a CHECK constraint. |
| `waitlist_entries`        | Ordered recovery queue: shift, volunteer, created time, status (`waiting`, `promoted`, `declined`, `expired`, `removed`), positive position, and eligible role. Unique per shift and volunteer.                     |

Waitlist order is deterministic: `(shift_id, position)`, and promotion checks the role
requirement before moving an entry to `promoted` and creating its registration in the same
transaction.

### Attendance, check-in, and hours

| Table               | Purpose and important columns                                                                                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `attendance_events` | Current attendance summary, one row per shift and volunteer: role, status (`expected`, `checked_in`, `completed`, `no_show`), check-in and check-out timestamps, recorded time. Used by rosters and attendance screens.                     |
| `attendance_ledger` | Append-only event history for the same participation: `check_in`, `check_out`, `manual_check_in`, `manual_check_out`, `marked_late`, `marked_no_show`, `correction`, with actor, note, and timestamp.                                       |
| `checkin_codes`     | Short-lived kiosk codes: numeric code, opaque token (unique), issue/expiry/consumed times, creator, active flag. A partial unique index allows only one active code per shift.                                                              |
| `hour_entries`      | Hour ledger for a volunteer and opportunity: requested `minutes` (0–1440), approved minutes, status (`verified`, `pending`, `rejected`), reviewer/time/reason, scheduled and calculated minutes, source shift, note, and `verification_id`. |

Check-out writes a pending hour entry with system-calculated minutes; it does not trust a
typed number. Approval writes `approved_minutes`, records the reviewer, and links the entry
to a service verification. The attendance summary and the ledger are intentionally separate:
the summary is fast to read, the ledger explains how it got there.

### Verification and impact

| Table                       | Purpose and important columns                                                                                                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `service_verifications`     | Issued certificate: unique code, volunteer, organization, date range, total approved minutes, issue time, issuer. Only approved hours are included.                                          |
| `impact_totals`             | Seeded organization-level totals: hours YTD, unique volunteers, shifts completed, attendance rate, and legacy outcome counters.                                                              |
| `impact_metric_definitions` | Named outcome metric per opportunity: key, display name, unit, creation time. Unique per opportunity and key.                                                                                |
| `impact_results`            | Recorded outcome values for a definition, optionally tied to a shift, with recorder and timestamp. People-served totals are summed from these records, never estimated from volunteer hours. |

Mission Control uses `impact_results` for meals, tutoring sessions, trees, and families
served. It still reads hours YTD, unique volunteers, shifts completed, and attendance rate
from the seeded `impact_totals` row; those are organization facts rather than per-shift
outcomes.

### Activity, notifications, and audit

| Table             | Purpose and important columns                                                                                                                                                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `notifications`   | Local alert: domain kind, title, body, priority (`high`/`normal`), created/read times, href, `audience` (`coordinator`, `volunteer`, `all`), and optional `volunteer_id`. Read state is persisted, not just component state. The read model filters on both columns. |
| `activity_events` | Short human-readable feed shown on Mission Control: volunteer, name, action, detail, tone, time. Separate from the compliance audit.                                                                                                                                 |
| `audit_events`    | Append-only audit trail: time, actor type/id, action, entity type/id, summary, and optional detail. The UI relabels the seeded actor id with the current coordinator name.                                                                                           |

## Relationships and delete behavior

The schema uses SQLite foreign keys; mismatches are rejected at write time.

- `organizations` cascades to `volunteers`, `opportunities`, and `impact_totals`.
- `volunteers` cascades to skills, saved opportunities, availability, credentials, waitlist
  entries, registrations, both attendance tables, ledger rows, and verifications.
- `opportunities` cascades to shifts, saved opportunities, and impact definitions.
- `shifts` cascades to roles, role requirements, waitlist entries, registrations, attendance
  rows, ledger rows, and check-in codes.
- `applications` cascades to stage history; `impact_metric_definitions` cascades to results.
- `hour_entries.opportunity_id` and `volunteer_credentials.credential_type_id` use
  `RESTRICT`, protecting history from a referenced parent deletion.
- `hour_entries.source_shift_id`, `role_requirements.credential_type_id`, and
  `impact_results.shift_id` use `SET NULL`.

`notifications`, `activity_events`, `audit_events`, `report_saved_views`, and
`backup_snapshots` have no foreign keys: they are logs or metadata that should outlive the
record they describe. `applications` is also standalone because recruitment can precede a
volunteer record.

## Indexes

| Index                                                             | Supports                                              |
| ----------------------------------------------------------------- | ----------------------------------------------------- |
| `idx_shifts_starts_at`, `idx_shifts_opportunity`                  | Upcoming-shift scans and program drill-downs          |
| `idx_hours_volunteer`                                             | A volunteer’s hour ledger                             |
| `idx_notifications_created`                                       | Newest-first notification lists                       |
| `idx_waitlist_shift`                                              | Deterministic promotion order                         |
| `idx_registrations_shift`, `idx_attendance_shift`                 | Roster and attendance reads                           |
| `idx_audit_at`                                                    | Newest-first audit screen                             |
| `volunteer_credentials_volunteer`, `volunteer_credentials_expiry` | Credential lookup and expiring-soon warnings          |
| `one_active_code_per_shift`                                       | Partial unique index enforcing one live check-in code |
| `attendance_ledger_shift`                                         | Event history for a shift/volunteer                   |
| `service_verifications_volunteer`                                 | A volunteer’s certificates                            |
| `impact_results_definition`                                       | Outcome rollups                                       |
| `volunteer_stage_history_application`                             | Recruitment history                                   |

Unique constraints also cover opportunity slugs, volunteer and user emails, saved-view
names, credential identifiers, verification codes, check-in tokens, registrations, and
waitlist entries.

## Derived read models

Stored tables are not sent raw. The core assembles these models on every command response:

- **`WorkspaceSnapshot`** — the app’s single mutable read model. It combines saved
  opportunity ids, attendance summaries grouped by shift, hours decisions keyed by entry,
  applicants, waitlist, settings, created opportunities, registrations, audit events, the
  current volunteer profile, credentials, verifications, impact metrics, saved views,
  retention cohorts, and an optional check-in code. `checkin_code` is `None` in the generic
  snapshot; the kiosk calls a dedicated command for the live code.
- **`MissionControlSummary`** — derived from upcoming shifts and roles, hour entries,
  unread notifications, `impact_totals`, `impact_results`, and the activity feed. Attention
  items are computed from gaps, not stored.
- **Retention cohorts** — six monthly cohorts computed from `hour_entries` dates, where a
  volunteer is eligible if their first recorded service in the month is at least 30 days
  before the demo date, so the full return window has elapsed. No synthetic cohort table
  exists.
- **Reports and coverage** — generated on demand in `reports.rs` from the same tables;
  exports are rendered from the generated document, not from the screen.
- **`WorkspaceHealth`** — counts, schema version, demo clock, timezone, and integrity
  results for diagnostics.

This keeps a single source of truth: changing a registration changes coverage, Mission
Control, attendance, and reports on the next read without a cache to invalidate.

## JSON columns

| Column(s)                                                       | Why JSON                                                                                             |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `volunteers.languages_json`, `causes_json`, `availability_json` | Ordered seed lists; languages/causes are display-only, availability has a normalized table for edits |
| `opportunities.training_json`, `requirements_json`              | Ordered prose lists shown as-is                                                                      |
| `applications.skills_json`                                      | Applicant-entered skill list before a volunteer profile exists                                       |
| `report_saved_views.filters_json`                               | Arbitrary, validated report filter object                                                            |
| `backup_snapshots.counts_json`                                  | Compact backup counts that are read as a whole, not joined                                           |

## Health, backups, and reset

- `Database::integrity_check()` runs `PRAGMA integrity_check`;
  `foreign_key_violations()` runs `PRAGMA foreign_key_check`.
- A backup is created with SQLite’s online backup API, then validated: `application_id`,
  all 32 required tables including `auth_sessions`, maximum migration = 4, integrity `ok`,
  no foreign-key violations, and a `demo_now` setting. Restore creates a safety snapshot
  first and audits its own action. Sessions created after the snapshot cease to exist.
- The live `backup_snapshots` table records metadata, but `backups::list` rebuilds the list
  from the actual files, so a stale metadata row cannot present a missing file as restorable.
- Seeding is idempotent: the workspace is inserted only when `volunteers` is empty, and
  workflow defaults are inserted once behind `app_settings.workflow_seed_version`. Reset
  deletes all tables in dependency order, then re-runs both seeds without dropping the schema
  or the migration ledger.
- At startup the app creates an automatic “Initial workspace snapshot” if the backup
  directory is empty. Retention keeps the twenty newest valid snapshots, protecting the
  snapshot being written and the target of an in-progress restore.
