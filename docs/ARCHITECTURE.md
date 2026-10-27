# Architecture

## Layers

```text
UI (React) ── session provider ── WorkspaceRepository ──┬── Tauri IPC ── core workflows ── SQLite
                                                       └── preview fallback (no native host)
```

The desktop shell has one state owner: `civicflow-core` over SQLite. The React provider
caches a snapshot of that state and never applies a write rule of its own. The browser
fallback exists because the Vite preview has no IPC host; it is selected in one function and
mirrors the same snapshot contract.

### Rust core (`src-tauri/core`)

| Module             | Responsibility                                                                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `db.rs`            | Connection setup (`foreign_keys = ON`, WAL, busy timeout), versioned migrations, deterministic workspace and workflow seed, demo reset, integrity checks                                                     |
| `domain.rs`        | Authoritative coverage rules: role coverage, attention derivation, weekly seat aggregation; unit tests for each rule                                                                                         |
| `auth.rs`          | Argon2id password hashing, session issuance and revocation, coordinator/volunteer guards, account seeding                                                                                                    |
| `organizations.rs` | Organization records, contacts, memberships, and the invitation lifecycle (issue, redeem, join, member list)                                                                                                 |
| `authorization.rs` | `require_membership` and `require_coordinator`: the one place that decides whether an account may act on an organization                                                                                     |
| `policy.rs`        | The organization's versioned matching policy: workload limits, missing-requirement behavior, the named priority levels, validation and history                                                               |
| `matching.rs`      | The AutoRoster engine: eligibility checks with their details, the named score breakdown, the min-cost-flow planner, and forced (decided) assignments                                                         |
| `explain.rs`       | "Why this person?" and "why not that one?": the typed explanation plus the counterfactual comparison between the plan and the plan with one decision forced                                                  |
| `roster.rs`        | Adapter that loads candidates, slots, and committed time from SQLite, applies an approved plan in one transaction, and answers the why/why-not question for one candidate and one seat                       |
| `recovery.rs`      | Disruption detection (open required seats, credentials that lapse before a shift starts), the recovery plan ranked by coverage/disturbance/quality, per-change review, and the coordinator's assignment lock |
| `recurrence.rs`    | Repeating shift series: rule validation, occurrence expansion, instance generation, retime by scope, and delete that refuses a booked shift                                                                  |
| `waitlist.rs`      | Ranking the waiting line for one seat: waitlist order as the fairness rule, the registration gate as the qualification rule, and the sentence naming who was passed over and why                             |
| `insights.rs`      | Retention signals, recognition milestones, engagement metrics, and credential readiness — rules over stored rows, with no model or stored score                                                              |
| `notifications.rs` | Reminder rules (trigger, offset, audience, switch) and the due-generation pass that writes each reminder once and records the rule behind it                                                                 |
| `imports.rs`       | Volunteer spreadsheet import: row-by-row checking, all-or-nothing apply in one transaction, and the matching export                                                                                          |
| `reports.rs`       | Report templates, query and aggregation, CSV and PDF rendering                                                                                                                                               |
| `services.rs`      | Read models (Mission Control, notification inbox) and the audited notification write, scoped by audience and volunteer                                                                                       |
| `workflows.rs`     | The single snapshot read model and every workflow command: saved opportunities, applications, attendance, waitlist, registrations, hours review, settings, opportunity creation, profile                     |
| `backups.rs`       | Online-backup snapshots, artifact validation (application id, schema, integrity, foreign keys), pre-restore safety copy, and restore with an audit event                                                     |
| `models.rs`        | Serialized DTOs (`camelCase` for the TS client) and seed structs                                                                                                                                             |
| `error.rs`         | Validation, not-found, and infrastructure errors; commands stringify at the boundary                                                                                                                         |

Each workflow command validates the transition, writes the row, appends its audit event,
and returns the new `WorkspaceSnapshot`. Commands never return a partial success.

### Code ownership map

When two layers could plausibly implement something, this table says who owns it. It exists so
a future change does not add a second copy of a rule that already has a home.

| Concern                  | Owner                                                             |
| ------------------------ | ----------------------------------------------------------------- |
| Authentication           | Rust core (`auth.rs`)                                             |
| Authorization            | Rust core (`authorization.rs`)                                    |
| Organization membership  | Rust core + SQLite (`organizations.rs`)                           |
| Business workflows       | Rust core (`workflows.rs`)                                        |
| AutoRoster matching      | Rust core (`policy.rs`, `matching.rs`, `explain.rs`, `roster.rs`) |
| Reports and exports      | Rust core (`reports.rs`)                                          |
| Coverage and attention   | Rust core (`domain.rs`)                                           |
| Disruptions and rescue   | Rust core (`recovery.rs`)                                         |
| Repeating schedules      | Rust core (`recurrence.rs`)                                       |
| Seat replacement         | Rust core (`waitlist.rs`)                                         |
| Retention and milestones | Rust core (`insights.rs`)                                         |
| Reminder rules           | Rust core (`notifications.rs`)                                    |
| Browser demo             | TypeScript (`previewRepository.ts`)                               |
| View state and layout    | React (`src/features`, `src/components`)                          |
| Generated translations   | `scripts/i18n-*.mjs`                                              |
| Generated demo data      | `scripts/generate-demo-data.mjs`                                  |
| Durable data             | SQLite                                                            |

### Tauri shell (`src-tauri`)

The command layer resolves the app-data database (or `CIVICFLOW_DATA_DIR` when a test
runner sets it), opens and seeds it once, guards it with a `Mutex`, resolves the session
token on every workspace command, checks the role, and delegates to `workflows` and
`backups`. Backup files live in `app_data/backups`; an initial automatic snapshot is written
when that directory is empty. No SQL or business rule lives in the shell beyond the access
check.

### Ask CivicFlow (`src/lib/ask`)

The question box is a read-only view over the same snapshot. `answers.ts` holds a small
registry of intents: each declares the keywords that select it, the roles that may ask it,
and a function that computes the answer from `DemoWorkspace` and `SessionSnapshot` through
the shared selectors. The matcher scores keywords, requires three points before it claims an
answer, and falls back to a refusal that lists the questions it can answer. Answers carry the
records they read and a route to act on, and the page renders them without a network call or
a model.

### Frontend (`src`)

```text
src/app/                 router, 50-screen registry, shell, credits
src/components/          navigation and UI primitives
src/features/            one folder per surface
src/lib/workspace/
  repository.ts          WorkspaceRepository contract, desktop IPC, environment selection
  previewRepository.ts   browser-only fallback over shared/session-seed.json + localStorage
  session.tsx            provider: load snapshot, apply snapshots in write order, expose actions
  selectors.ts           pure read model over workspace + snapshot
  queries.ts             TanStack Query hooks for Mission Control and notifications
src/types/               domain and snapshot types
```

`WorkspaceSessionProvider` loads the snapshot once, applies write responses through a serial
queue (AutoRoster can submit several registrations at once), and re-exposes the document
accessibility attributes from saved settings. Screens call selectors and actions; they do not
persist their own copies.

## State ownership

| State                                | Owner table                          | Read by                                       |
| ------------------------------------ | ------------------------------------ | --------------------------------------------- |
| Saved opportunities                  | `saved_opportunities`                | Discover, Home, Saved, audit                  |
| Attendance / no-shows / check-out    | `attendance_events`                  | Kiosk, Attendance, Live Roster, My Schedule   |
| Waitlist position and promotion      | `waitlist_entries`                   | Live Roster, AutoRoster, audit                |
| Shift registrations                  | `registrations`                      | Live Roster, AutoRoster, volunteer schedules  |
| Hours review                         | `hour_entries` (`reviewed_at`, etc.) | Hours Review, My Hours, Records, verification |
| Recruitment stages                   | `applications`                       | Recruitment, Opportunity Management           |
| Workspace and accessibility settings | `app_settings` + `organizations`     | Settings, Accessibility, organization profile |
| Created programs                     | `opportunities` (`created_at`)       | Opportunities, management, reports            |
| Notifications                        | `notifications`                      | Inbox, Mission Control badge                  |
| Audit trail                          | `audit_events`                       | Audit, Activity, confirmation copy            |

Seed-only catalogs (volunteers, shifts, roles, opportunities, impact totals, curated hours)
remain in `shared/demo-workspace.json`; mutable state starts in `shared/session-seed.json`.
Both are loaded by the Rust seeder and the browser fallback.

## Data flow: a workflow write

1. A screen calls `actions.checkIn(shiftId, volunteerId)` (or another action).
2. The provider queues the call and invokes the repository with the signed-in session token.
3. Desktop: Tauri resolves the token, refuses a volunteer acting on someone else's record,
   locks the database, and calls `workflows::check_in`.
4. `check_in` validates the shift and volunteer, upserts `attendance_events`, appends an
   `audit_events` row at the demo clock, and returns a snapshot. A volunteer receives the
   redacted snapshot; a coordinator receives the full one.
5. The provider replaces its snapshot and invalidates the Mission Control and notification
   queries.
6. Every screen reading that snapshot shows the same result; reloading reads SQLite again.

## Data flow: Mission Control

1. `useMissionControl()` asks the repository for a summary.
2. Desktop: `get_mission_control` reads SQLite and computes role coverage and attention.
3. Preview: `buildMissionControl` derives the same values from the shared seed.
4. TanStack Query caches under `["mission-control"]`.
5. Every workflow write invalidates the summary, so settings and notification changes do not
   leave a stale header.

## Design tokens

`src/styles/tokens.css` owns every color and type decision. Components consume semantic
aliases (`--surface-paper`, `--action-primary`, `--cause-food`) rather than raw hex.

## Navigation and routing

The 42 primary surfaces live in `src/app/routes.ts` with number, title, role, spec summary,
and search keywords. `CommandPalette` reuses that registry. URLs use browser history in the
preview and hash history inside Tauri, because the bundled asset protocol does not guarantee
deep-link rewrites.

## Current limits

- Backup snapshots are written with SQLite's online backup API into `app_data/backups`.
  Restore refuses anything that is not a complete, current CivicFlow database, keeps a
  pre-restore safety snapshot, and logs the restore before returning the fresh snapshot.
  The newest 20 snapshots are retained; older ones are pruned, while a restore target is
  protected until the copy back to the live database is complete.
- Report export is CSV and print-to-PDF; there is no server-side PDF renderer or email.
- Notifications carry an audience and optional volunteer id. The Rust read model filters on
  both, so each account sees only its own feed.
- Accounts are local to this device. There is no multi-user sync, remote identity provider,
  or encryption at rest; passwords and session tokens are hashed in SQLite.
- The native window is driven end to end by WebdriverIO through the embedded WebDriver
  server on macOS. Windows and Linux installers are built by the release workflow, but their
  native UI is not in an E2E matrix yet.
