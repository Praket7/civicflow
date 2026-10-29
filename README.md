# CivicFlow

CivicFlow is a desktop volunteer coordination app for small nonprofits. Coordinators plan
shifts, staff open roles, run the check-in desk, review hours, and report outcomes. Volunteers
find service, register, check in, and keep a record of what they contributed.

The application runs on a local SQLite database. Scheduling, reporting, check-in, and
AutoRoster work without a network connection. Accounts and organization membership are
enforced by the Rust core, not by hiding screens in the browser.

<!-- CIVICFLOW_FACTS_START -->
| Fact | Value |
| --- | --- |
| Package version | `0.1.1` |
| Registered routes | 50 |
| Migration files | 13 |
| Database schema | v13 |
| Application tables | 46 |
<!-- CIVICFLOW_FACTS_END -->

## Product

The coordinator workspace has six primary areas:

- **Home** answers what needs attention now. It shows the next shift, a weekly staffing
  summary, AutoRoster coverage, and one queue for coverage gaps, hours waiting for review,
  applications, and expiring credentials.
- **AutoRoster** builds a staffing plan for the next seven days. Every assignment can be
  explained, compared with an alternative, and reviewed before it is written.
- **Schedule** holds the calendar, shift rosters, attendance, and the check-in kiosk.
- **Opportunities** holds programs, their shifts, roles, and capacity.
- **People** groups volunteers, applications, credentials, hours review, and service records.
  Each is a tab inside one work area rather than a separate destination.
- **Reports** groups the report library, impact analytics, engagement signals, the custom
  builder, and the printable impact report.

Settings, the audit log, backups, accessibility, help, and photo credits live in the workspace
menu so they do not compete with daily work.

Volunteer navigation is five areas: Home, Discover, Schedule, Hours and Impact, and Profile.
Saved opportunities are a tab inside Discover. Verification is a tab inside Hours and Impact.
Notifications stay in the top bar.

Every screen is still reachable from the command palette (`Cmd/Ctrl+K`). Search covers every
registered route and the main coordinator actions, so an experienced user does not have to
walk through the six areas.

### Core journeys

1. Create an organization, add an opportunity, invite a volunteer, and publish a shift.
2. Open Home, see the staffing gaps, run AutoRoster for the week, review the evidence, and
   apply the plan.
3. Run an event: open the next shift, launch the kiosk, check people in, and record no-shows.
4. Find a volunteer: search People, open a profile, check credentials, and look at upcoming
   assignments.
5. Report impact: choose a period, preview the result, and export a PDF or CSV.

## Architecture

```text
React 19 + TypeScript + Vite
        |
        v
WorkspaceRepository
        |
        v
Tauri commands
        |
        v
civicflow-core (Rust)
        |
        v
SQLite workspace
```

- `src-tauri/core` is an independent crate. It owns the schema, migrations, seeded demo data,
  authorization, workflow rules, matching, reporting, backups, and audit events. It has no Tauri
  dependency and is tested with `cargo test`.
- `src-tauri/src/lib.rs` exposes thin Tauri commands. Each command resolves the session token
  through the core before it reads or writes workspace data.
- `src/lib/workspace/repository.ts` is the single boundary between React and the native
  commands. `previewRepository.ts` implements the same contract in the browser with the shared
  demo data. The desktop build never selects the preview repository.
- React reads one snapshot from the core. `src/lib/workspace/selectors.ts` derives display
  values from that snapshot. Screens do not keep private copies of workspace records.
- The database applies migrations in order and records each version in `schema_migrations`.
  Backups check the application id, schema version, foreign keys, and table set before restore.

### Local first

Writes go to local SQLite first and the UI refreshes from the returned snapshot. Nothing on a
normal screen waits for a network request. Hosted sign-in is optional and only used to prove an
identity. The workspace itself remains on the device.

### Demo mode

A fresh installation starts empty. The demo workspace is created only when someone chooses
**Explore the demo** on the welcome screen. Demo records live in `shared/demo-workspace.json`
and are loaded by both the Rust seeder and the browser preview. A demo organization is marked
with `is_demo`, and the workspace clock is fixed for authored demo dates. Production
workspaces use the system clock and the organization timezone.

## Organization and access

An account proves an identity. Access comes from an organization membership row.

Roles are `owner`, `coordinator`, and `volunteer`. A person can be an owner in one
organization, a coordinator in another, and a volunteer in a third. There is no global
coordinator role and no role stored in hosted-auth metadata.

Membership rules:

- The first person to create an organization becomes its owner.
- An owner can invite coordinators and volunteers, change roles, disable a membership, and
  transfer ownership.
- A coordinator can run operations and invite volunteers when policy allows.
- An organization always keeps at least one active owner. The last owner cannot be removed,
  demoted, or disabled.
- Invitations are one-time, expiring, revocable, and bound to a role. Tokens are stored hashed.
- Every role or status change increments `membership_epoch`. A queued privileged operation
  created under an older epoch is rejected when it reaches the authority.

The organization switcher changes the active membership, not the account role. A person with
no membership can only reach the create-or-join screens.

## AutoRoster

AutoRoster is a deterministic min-cost flow solver in `src-tauri/core/src/matching.rs`. React
does not score candidates or decide eligibility. The core returns the plan together with every
candidate evaluation, score component, hard check, and selection reason. The screen formats
those values.

The default scope is the next seven days across every shift with a required-role gap. A
single-shift review remains available. The engine respects:

- required skill and credential validity through the shift date;
- stated availability;
- overlapping assignments;
- daily and weekly shift limits;
- assignment locks;
- waitlist membership and capacity.

A plan carries its base workspace revision and policy version. Applying checks both again and
returns `PLAN_STALE` rather than writing a plan that another change invalidated. A reviewed
plan is applied in one SQLite transaction. Every assignment is rechecked, each assignment gets
an audit event, and the plan gets one summary event. If any assignment fails, the batch rolls
back.

The explanation model is contrastive. Each proposed person has **Why this person?**, and other
eligible people can be asked about with **Why not?**. The answer lists failed hard checks or
shows what forcing that person into the seat would do to the rest of the plan.

Coverage recovery uses the same solver and the same explanation model. It is not a separate
scoring system.

## Data model

The schema is defined by the numbered migrations in `src-tauri/core/migrations`. All migrations
are additive and idempotent on upgrade. Foreign keys are enabled.

The main records are:

- organizations, memberships, invitations, contacts, and updates;
- accounts, sessions, auth attempts, and hosted handoffs;
- volunteers, skills, availability rules, and credentials;
- opportunities, shifts, shift roles, role requirements, and shift series;
- registrations, waitlist entries, attendance events, and the attendance ledger;
- hour entries, service verifications, and impact results;
- notifications, notification rules, activity events, audit events, and saved views;
- roster policies, assignment locks, workspace revisions, sync conflicts, and replica metadata;
- backups and schema migration bookkeeping.

Counts shown to people are derived from registrations, attendance events, and approved hour
records. The shift's cached `confirmed` or role `filled` values are materialized inside the
transaction that changes the underlying rows, not treated as independent truth.

The current build is a single local workspace. Each organization in the switcher has its own
membership and profile, and the domain snapshot is loaded through the active membership.

## Security

- Passwords use Argon2id. Session tokens are random, stored hashed, and expire.
- Every Tauri command that touches workspace data calls `require_user` first. Coordinator-only
  commands call `require_coordinator`. A volunteer command that names a volunteer checks the
  membership between the account and that volunteer.
- Volunteer snapshots are redacted before they cross the IPC bridge. A volunteer receives
  their own profile, registrations, hours, credentials, and notifications, not the coordinator
  directory or the audit log.
- Hosted identity is accepted only after Supabase verifies the user. The app then opens or
  creates the matching local account. Hosted metadata never grants a workspace role.
- Invitation tokens are random, hashed at rest, single-use, and expire. Reusable coordinator
  codes do not exist.
- The content security policy, capability file, deep-link handling, and URL allowlist are in
  `src-tauri/tauri.conf.json` and `src-tauri/capabilities/default.json`.
- Reports and exports are generated in Rust and written through the native save dialog. The
  browser never receives a filesystem path.

## Accessibility

- Semantic landmarks, one `h1` per screen, a skip link, visible focus, and labeled controls.
- Status is never carried by color alone. Charts have a table alternative.
- Reduced motion, high contrast, text scaling, underlined links, and right-to-left layout are
  supported.
- The automated accessibility tree audit visits every registered route and requires names on
  every interactive control. The zoom audit renders at 200 percent and fails on horizontal
  overflow or a missing heading. The contrast audit checks both themes.
- A human VoiceOver or NVDA pass on a packaged build is still on the release checklist.

## Testing

```bash
pnpm verify          # typecheck, lint, format, copy, hardcodes, generated data, tests, build,
                     # browser audits, Rust fmt, clippy, and cargo test
pnpm test            # frontend tests
cargo test --manifest-path src-tauri/core/Cargo.toml
pnpm test:native     # WebdriverIO against the built macOS app
```

The frontend suite covers the route registry, accessibility on every screen, selectors,
coverage maths, preview repository behavior, hosted identity parsing, print styles, and the
Ask CivicFlow matcher. The Rust suite covers migrations, foreign keys, accounts, membership
and invitations, ownership invariants, role refusal, snapshot redaction, registrations,
waitlists, attendance, hours, credentials, recurrence, recovery, reports, exports, AutoRoster
against a brute-force oracle, plan staleness, and backup restore.

Generated checks:

- `pnpm check:generated` rebuilds the demo data and translation catalog and fails on drift.
- `pnpm check:hardcodes` rejects fixture ids and ISO dates in production code.
- `pnpm docs:check` verifies README links and generated facts.
- `pnpm db:verify` opens the live desktop database read-only and reports integrity, schema
  version, foreign keys, and record counts.

## Build and run

```bash
pnpm install
pnpm dev              # browser preview at http://localhost:5173
pnpm tauri dev        # native desktop window
pnpm tauri build      # installers for the current platform
pnpm docs:update      # refresh the generated facts block
```

Demo accounts after choosing **Explore the demo**:

- `praket@feedmorewny.org` / `civicflow-demo` (coordinator)
- `maya.chen@gmail.com` / `civicflow-demo` (volunteer)

Hosted sign-in is optional. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to enable
Google and email links. Without both keys the app makes no hosted-auth request.

### Releases

Pushing a `v*` tag runs `.github/workflows/release.yml`. It builds macOS (Apple silicon and
Intel), Windows x64, and Linux x64 installers, attaches them to the GitHub release, and
publishes SHA-256 checksums.

Unsigned macOS builds are ad-hoc signed so Gatekeeper offers **Open Anyway** instead of
reporting a damaged app. Windows builds without a certificate are unsigned, so SmartScreen
offers **More info** then **Run anyway**.

Signing secrets, when available, are repository secrets:

| Secret                         | Platform | Purpose                                  |
| ------------------------------ | -------- | ---------------------------------------- |
| `APPLE_CERTIFICATE`            | macOS    | Base64 Developer ID Application `.p12`   |
| `APPLE_CERTIFICATE_PASSWORD`   | macOS    | Password for the exported certificate    |
| `APPLE_ID`                     | macOS    | Apple ID for notarization                |
| `APPLE_PASSWORD`               | macOS    | App-specific password                    |
| `APPLE_TEAM_ID`                | macOS    | Apple Developer team id                  |
| `APPLE_API_KEY`                | macOS    | Alternate App Store Connect key id       |
| `APPLE_API_ISSUER`             | macOS    | Alternate issuer id                      |
| `APPLE_API_KEY_CONTENT`        | macOS    | Base64 `.p8` key                         |
| `WINDOWS_CERTIFICATE`          | Windows  | Base64 code-signing `.pfx`               |
| `WINDOWS_CERTIFICATE_PASSWORD` | Windows  | Password for the `.pfx`                  |
| `WINDOWS_TIMESTAMP_URL`        | Windows  | Optional RFC 3161 timestamp service      |

Use either the Apple ID trio or the API key trio. Never commit a certificate or password.

## Credits

All bundled photography is free-licensed. Images were cropped and resized for layout. The
impact skyline is color-graded and scrimmed. Those changes do not alter the license.

| Asset                                                                      | Creator / source                                     | License       |
| -------------------------------------------------------------------------- | ---------------------------------------------------- | ------------- |
| `hero-community.jpg`, `opp-food-distribution.jpg`, `community-strip-1.jpg` | Pexels 6646918                                       | Pexels        |
| `opp-pantry.jpg`                                                           | Pexels 6646862                                       | Pexels        |
| `opp-community-garden.jpg`, `community-strip-3.jpg`                        | Pexels 39779034                                      | Pexels        |
| `opp-library-tutoring.jpg`, `community-strip-2.jpg`                        | Pexels 8342411                                       | Pexels        |
| `opp-park-cleanup.jpg`                                                     | Pexels 39037905                                      | Pexels        |
| `opp-animal-shelter.jpg`                                                   | Pexels 35231854                                      | Pexels        |
| `opp-senior-meals.jpg`                                                     | Pexels 6647037                                       | Pexels        |
| `welcome-volunteer.jpg`                                                    | Pexels 6646930                                       | Pexels        |
| `signin-volunteers.jpg`                                                    | Pexels 6995298                                       | Pexels        |
| `opp-community-event.jpg`                                                  | Irvin Parco Sto. Tomas, Wikimedia Commons            | CC BY-SA 4.0  |
| `buffalo-skyline.jpg`                                                      | Peter S, Wikimedia Commons                           | CC BY-SA 4.0  |
| `volunteers/olive-carter.jpg`                                              | Pexels 40062802                                      | Pexels        |
| `volunteers/rafael-martin.jpg`                                             | Pexels 13120070                                      | Pexels        |
| `volunteers/jasmine-bennett.jpg`                                           | Pexels 6976400                                       | Pexels        |
| `volunteers/diego-weber.jpg`                                               | Pexels 19285927                                      | Pexels        |
| `volunteers/nico-carter.jpg`                                               | Pexels 8151688                                       | Pexels        |
| `volunteers/gloria-weber.jpg`                                              | Pexels 30004320                                      | Pexels        |

Pexels images use the [Pexels License](https://www.pexels.com/license/). Wikimedia images use
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The in-app photo credits page
reads the same list from `src/data/credits.ts`.

Bundled fonts: Geist Variable, Geist Mono Variable, and Source Serif 4 Variable, all under the
SIL Open Font License 1.1.

Main libraries: React, React Router, TanStack Query, date-fns, Lucide, Tauri, rusqlite,
chrono, serde, uuid, thiserror, Vitest, Testing Library, and jest-axe. The AutoRoster flow
algorithm was implemented from published descriptions rather than copied code.

## Known limits

- A workspace is local to one device. Accounts and organization roles are enforced locally,
  but there is no live multi-device sync in this build. Sharing a file means using a backup or
  an export.
- Organization switching is scoped by membership in the UI and core, but all organizations in
  one installation share the same SQLite file. A future workspace manager will split them into
  per-organization databases.
- Kiosk mode is a coordinator route in the main window, not a separate OS-level kiosk.
- QR scanning needs camera permission. The six-digit code is the fallback.
- Code signing and notarization require certificates that are not in the repository.
- The accessibility audits are automated. A recorded screen-reader pass on the packaged build
  is still pending.
