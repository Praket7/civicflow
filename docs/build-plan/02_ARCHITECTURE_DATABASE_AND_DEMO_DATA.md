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

# Phase 2 — Architecture, Database, Migrations, and Demo Data

## Outcome

At the end of this phase, CivicFlow has a real backend foundation:

- typed Rust domain models
- normalized SQLite schema
- migrations
- repository/service layers
- deterministic demo seed data
- database integrity checks
- no business logic hidden inside Tauri command handlers
- automated database tests using temporary files

Do not build 42 screens against mock JSON. Build the data foundation first.

---

## 1. Establish backend boundaries

Use four backend layers.

```text
Tauri command
    ↓
application service
    ↓
domain rules
    ↓
repository/database
```

Example:

```text
commands/volunteers.rs
services/volunteer_service.rs
domain/volunteer.rs
database/volunteer_repository.rs
```

A command should look conceptually like:

```rust
#[tauri::command]
pub async fn create_volunteer(
    state: State<'_, AppState>,
    input: CreateVolunteerInput,
) -> Result<VolunteerDto, AppError> {
    state.volunteer_service.create(input).await
}
```

It should **not** contain a 100-line SQL query plus validation plus audit logic.

---

## 2. Choose SQLite access deliberately

Use Rust-side SQLite via `rusqlite`.

Why for CivicFlow:

- simple local desktop database
- no network server
- direct access to SQLite's online backup API
- easy temporary-database tests
- SQL remains visible and judge-explainable
- avoids exposing direct SQL execution to the frontend

Enable only the crate features you need, including SQLite bundling/backup according to the current crate documentation.

Keep database access behind your own repository types so you can change the crate later without rewriting the UI.

---

## 3. Database initialization

On app startup:

1. determine Tauri app-data directory
2. create CivicFlow data directory if needed
3. open SQLite database
4. enable foreign keys
5. configure journal mode
6. run migrations
7. run lightweight schema check
8. create demo dataset only when explicitly in demo mode

Recommended connection initialization:

```sql
PRAGMA foreign_keys = ON;
```

Evaluate WAL mode during implementation:

```sql
PRAGMA journal_mode = WAL;
```

WAL can improve concurrent reads/writes, but backups must use SQLite-aware mechanisms rather than naively copying an active database file.

The SQLite/rusqlite documentation supports the online backup API. Use it later for snapshots instead of `std::fs::copy` on a live WAL database.

---

## 4. Create migration infrastructure

Create:

```text
src-tauri/migrations/
  0001_initial.sql
  0002_seed_reference_data.sql
```

Track applied migration versions in:

```text
schema_migrations
```

Migration runner rules:

- run in order
- each migration runs in a transaction when SQLite permits it
- never edit a migration after it has been committed and used
- add a new migration instead
- startup failure from a migration must show a recoverable error, not silently continue

Test migration from an empty database every CI run.

Also test migration from at least one previous schema version after Phase 3.

---

## 5. Initial relational schema

A strong starting schema:

```text
organizations
users
volunteer_profiles
skills
volunteer_skills
credentials
volunteer_credentials
availability_rules

opportunities
shifts
shift_roles
role_skill_requirements
role_credential_requirements

registrations
waitlist_entries
assignments

attendance_events
hour_entries
service_verifications

impact_metric_definitions
impact_results

notifications
audit_events

report_saved_views
backup_snapshots
app_settings
```

### Important relationship examples

```text
organization 1 -> many opportunities
opportunity 1 -> many shifts
shift 1 -> many roles
volunteer many <-> many skills
volunteer many <-> many credentials
shift role many <-> many skill requirements
volunteer many <-> many registrations
```

Use foreign keys everywhere that represents a real relationship.

Use unique constraints for invariants such as:

```text
one registration per volunteer per shift
one skill name per organization/reference set
one credential record per volunteer + credential instance
unique service verification code
```

Do not make every field nullable "just in case."

---

## 6. Domain IDs and timestamps

Use UUIDs generated in Rust, not random frontend strings.

Store UTC timestamps in a consistent representation.

The UI can render in the organization's timezone.

Example domain fields:

```rust
struct VolunteerId(Uuid);
struct ShiftId(Uuid);
```

You do not have to wrap every ID in a newtype if it makes the code unreadable, but typed IDs are excellent for preventing accidental mixups in algorithm-heavy code.

---

## 7. Centralized errors

Create:

```rust
enum AppError {
    Validation(ValidationError),
    NotFound { entity: String, id: String },
    Conflict(ConflictError),
    Database(DatabaseError),
    Backup(BackupError),
    Export(ExportError),
    Internal { code: String },
}
```

Return structured errors to TypeScript:

```json
{
  "code": "SHIFT_TIME_CONFLICT",
  "message": "Maya is already assigned from 2:00 PM to 5:00 PM.",
  "field": "shiftId",
  "action": "FIND_REPLACEMENT"
}
```

This enables the rubric-quality error UX planned in the designs.

---

## 8. Create the demo dataset

The demo database is part of the competition product.

Create a deterministic seed containing approximately:

```text
1 organization
80–100 volunteers
15–20 opportunities
30–50 future/past shifts
10–15 skill types
6–10 credential types
several registrations per shift
waitlists
attendance history
hour history
impact outcomes
notifications
audit events
```

The demo should include intentional edge cases:

```text
underage volunteer
expired credential
volunteer with overlapping availability
volunteer with no history
full shift with waitlist
shift missing one critical driver
shift missing Spanish coverage
inactive volunteer
hours requiring review
```

Use fixed IDs in the demo seed where useful so tests can reference known records.

---

## 9. Backend test factory

Create test helpers:

```text
TestDatabase::empty()
TestDatabase::with_demo_seed()
VolunteerBuilder
OpportunityBuilder
ShiftBuilder
```

Tests should never touch your real CivicFlow database.

Use `tempfile` to create isolated SQLite files.

For each repository:

```text
create
read
update
delete/archive
constraint failure
not found
transaction rollback
```

---

## 10. Database integrity tests

Automate:

```sql
PRAGMA foreign_key_check;
PRAGMA integrity_check;
```

Required CI test:

1. create empty temp DB
2. apply all migrations
3. insert seed
4. run foreign key check
5. run integrity check
6. close DB
7. reopen DB
8. verify expected counts

Test invalid writes:

```text
duplicate registration
role referencing missing shift
attendance referencing missing volunteer
negative service hours
orphaned impact result
```

The database must reject what should be impossible even if a UI bug attempts it.

---

## 11. Frontend IPC wrapper

Do not sprinkle raw `invoke()` calls throughout React components.

Create:

```text
src/lib/tauri/
  client.ts
  volunteers.ts
  opportunities.ts
  scheduling.ts
```

Example:

```ts
export async function listVolunteers(
  filter: VolunteerFilter
): Promise<VolunteerSummary[]> {
  return invoke("list_volunteers", { filter });
}
```

Later, TanStack Query wraps these functions.

This makes mocking much easier.

---

## 12. Debugging this phase

### Database is locked
Check:

- transactions left open
- multiple connections
- long-running writes
- backup running incorrectly

### Foreign keys appear ignored
Verify every connection executes:

```sql
PRAGMA foreign_keys = ON;
```

### Migration fails halfway
Migration must be transactional where possible. Reproduce in a fresh temp DB.

### Rust command returns opaque frontend error
Log the full internal error in development, but return a safe structured `AppError` to UI.

### Demo seed is flaky
Never use random current timestamps without a fixed demo clock.

---

## 13. Phase 2 test gate

Required Rust tests:

```text
[ ] migrations apply to empty DB
[ ] migrations are idempotently tracked
[ ] demo seed loads
[ ] foreign_key_check returns no rows
[ ] integrity_check returns "ok"
[ ] every main repository CRUD path passes
[ ] database uniqueness constraints are tested
[ ] failed transaction rolls back
[ ] database reopen preserves data
```

Frontend:

```text
[ ] typed IPC client can be mocked
[ ] Tauri command success maps to TS types
[ ] structured Rust errors map to UI error object
```

Manual:

```text
[ ] delete local demo database
[ ] app recreates schema
[ ] launch demo mode
[ ] data is exactly the same each reset
```

---

## 14. Definition of done

Do not proceed until:

```bash
pnpm verify
```

is green and the database can be deleted, recreated, seeded, closed, and reopened without manual intervention.

Commit:

```bash
git commit -m "feat: add domain architecture and SQLite persistence"
git tag phase-02-data-foundation
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
