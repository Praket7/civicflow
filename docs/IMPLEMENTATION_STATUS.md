# Implementation status

Last reviewed 2026-10-25. This page describes what is in the repository now. Screens are real routes with working controls. Workflow writes go
through `civicflow-core`, which validates them, stores them in SQLite, and appends an audit
event before returning a fresh snapshot.

## What is complete

### Foundation

- Tauri 2 desktop shell, React 19 + TypeScript + Vite, Rust core crate, SQLite through
  `rusqlite`.
- Embedded migrations at schema version 11, deterministic seed, foreign keys, integrity
  checks, and reset-to-seed.
- Structured IPC errors with `code`, `message`, `field`, and optional `action`.
- One `WorkspaceRepository` boundary with a desktop implementation and a browser fallback
  selected only when no native host exists. The desktop implementation attaches the
  signed-in session token to every workspace command.
- CI for frontend checks, Rust checks, and the native WebdriverIO suite on macOS.
- A tag-triggered release workflow that builds macOS (arm64 and x64), Windows x64 and Linux
  x64 installers and attaches them to a GitHub release.

### Accounts and roles

- Local accounts stored in SQLite. Passwords are Argon2id hashes; session tokens are opaque
  and only their SHA-256 hash is stored. Sessions last 12 hours, or 30 days with “keep me
  signed in”, and a password reset revokes every existing session for that account.
- Coordinator and volunteer roles are enforced in Rust, not only by the router. Every
  workspace command resolves the token before touching data.
- Organization membership is a database row. `organization_memberships` records who belongs to
  an organization and in what role, `organization_invites` holds single-use expiring
  invitations that store only a token hash, and `authorization::require_membership` /
  `require_coordinator` decide access from the resolved session. The account's own role is
  still what the older workspace commands read, so a newly created account keeps the access
  level it asked for until the signup path moves to invitations (see `DECISIONS.md` 019).
- A coordinator may read and write the whole workspace. A volunteer receives a redacted
  snapshot containing only their own registrations, attendance, hours decisions,
  credentials, service verifications and profile. The applicant pipeline, audit trail,
  retention cohorts and saved report views are absent from that snapshot.
- Volunteer writes must name the signed-in volunteer. A volunteer cannot check in, register,
  cancel or edit a profile for someone else.
- Notifications carry an audience and an optional volunteer id. The feed and read command
  filter on both, so a coordinator does not see volunteer alerts and a volunteer does not
  see another volunteer's alert.
- Settings → Accounts lists the local accounts and lets a coordinator reset a password.
- Settings → Local data offers the roster import: choose or paste a CSV, check it row by row,
  add the accepted rows, fill the field from the template, or export the roster in the columns the
  import reads. A coordinator-only section, like the rest of the workspace-level operations.
- Kiosk is a coordinator-authenticated route. It is still the same webview, not a separate
  capability-scoped window.

### Hosted accounts

Hosted auth is optional and configured only through `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY`. When both are set, `/sign-in` and `/create-account` also offer
Google and emailed confirmation and recovery. Supabase verifies the identity, the Rust
command `sign_in_with_hosted` opens (or creates) the matching local account, and every
workspace command still resolves the local token. The role chosen on the form decides the
access level of a newly created account. In the desktop app the provider page opens in the
system browser and answers on the `civicflow://` scheme, so Google's consent screen never
loads inside the webview. With the keys absent the app behaves exactly as before and makes
no account request. See [AUTH.md](AUTH.md).

### Domain engine

- AutoRoster is Rust: an organization's versioned matching policy (workload caps, a rest
  gap, what an unknown age or credential means, and five weighted match priorities),
  eligibility gates that report every check, a six-component score, candidate-day to
  role-slot min-cost max-flow, deterministic ordering, brute-force oracle, proptest, and a
  500-candidate/100-slot performance gate.
- Every assignment carries a typed explanation: the constraint checks with pass or fail and
  a detail sentence, the score components, the total, and a selection reason. Settings →
  Scheduling → Matching policy edits the policy, each save creates a version audited as
  `policy.updated`, and every plan records the `policyVersion` it followed.
- "Why not that person?" is a real counterfactual: the questioned assignment is decided
  before the solver runs and the two plans are compared on filled seats, required seats
  filled, total score and the assignments that changed. The AutoRoster screen shows it per
  seat, and names any seat the forced decision would leave uncovered.
- A coordinator schedules a repeating rule once: `shift_series` owns the rule and the shifts
  it generated, so a top-up adds only the occurrences the calendar is missing, a retime
  reaches the next shift or the whole series, and a delete refuses a series somebody is
  already registered for.
- When a seat opens, `waitlist.rs` ranks the line: waitlist order is the fairness rule and
  the eligibility gate is the qualification rule, so the recommendation is the first person
  who can actually take the role — with everyone passed over named and the reason stated.
  **Open seats** on the shift roster shows that answer and promotes from it; the promotion
  still runs through `promote_waitlist`, which re-checks rather than trusting the caller.
- Disruption recovery: `recovery.rs` detects open required seats and credentials that lapse
  before a shift starts, then plans a repair ranked by coverage, the fewest disturbed
  assignments, and match quality. A locked assignment is never moved, the review screen is
  per-change, and applying writes one audit event per accepted change.
- Reminder rules are deterministic rows: a trigger, an offset, an audience, and a switch.
  Each notification records the rule that wrote it, so the feed can explain itself, and a
  disabled rule stops writing rather than hiding.
- Registration validates active status, shift window, duplicate state, role capacity,
  required skill, credential expiry, minimum age, weekly availability, and time overlap.
- An approved AutoRoster plan applies in one transaction and cannot overfill a role or a
  shift.
- Cancellation decrements shift and role counts, audits the change, and promotes the first
  eligible waiting volunteer for the opened role. If nobody is eligible, it creates a
  coverage notification instead.
- Check-in uses a core-issued six-digit code with a 30-minute arrival window, idempotent
  duplicate handling, and a shift check. The same command accepts the
  `civicflow://checkin/<token>` payload from a scanned QR code and refuses a token issued for
  another shift. Check-out writes calculated minutes into a pending hour entry.
- Hours review accepts only pending entries, requires a note, enforces 1–1440 approved
  minutes, and issues a `service_verifications` record from approved minutes only.
- Reports, CSV, and PDF are generated in Rust from stored rows. The Reports screen also
  reads the decision models directly: coverage decisions, volunteer engagement (30/60/90-day
  return, no-show rate, inactive), and credential readiness with future shifts at risk.
- Retention signals, recognition milestones, engagement metrics, and credential readiness all
  come from `insights.rs` as rules over the service record. None of them is a prediction or a
  stored score, and each signal carries the history that produced it and the action it
  suggests.
- A volunteer roster arrives from a spreadsheet: `imports.rs` reads a fixed column set, checks
  every row (required name and email, a status and cause vocabulary, `mon:morning` availability
  windows, duplicates inside the file and against the stored roster), and refuses the whole file
  while any row has a problem. An accepted file is one transaction that inserts the volunteers,
  their skills and their availability windows and appends a `volunteers.imported` audit event.
  `export_roster` writes the same columns, so an export can be edited and imported back.
- `WorkspaceSnapshot.roster` is the roster as SQLite holds it, so people added since the seed
  authored the bundled roster — an account created here, an imported file — reach the roster
  screens. A coordinator receives every record and a volunteer only their own row.

### Screens

All 50 registered routes resolve to built screens. The main working surfaces:

- **Coordinator:** Mission Control, Coverage, AutoRoster, Schedule, Opportunities, Create
  Opportunity, Opportunity Management, Live Roster, Volunteers, Volunteer Detail,
  Recruitment, Credentials, Attendance, Kiosk, Hours Review, Reports, Custom Report, Impact
  Analytics, Retention, Impact Report, Records, Audit, Backup, Settings, Accessibility,
  Organization Setup.
- **Volunteer:** Home, Discover, Opportunity Detail, Saved, Schedule, Shift Detail, Check In,
  My Hours, Personal Impact, Service Verification, Notifications, Profile, Onboarding.
- **Public:** Launch, Welcome, Sign In, Credits, and the in-app guide at `/help`.

Check-in renders a real QR code from the shift token. The kiosk opens the camera through
`@zxing/browser`, validates that the payload is a CivicFlow token, and falls back to the
six-digit code when a camera is unavailable or permission is denied.

Cross-screen reads come from the same snapshot. A check-in appears in Attendance, Live
Roster, Volunteer Detail, Activity, and Mission Control. An approval appears in My Hours,
Personal Impact, Volunteer Detail, Reports, and the Impact Report.

### Evidence and documentation

- 184 frontend tests, 172 Rust tests, typecheck, lint, format, web build, contrast audit,
  print audit, accessibility-tree audit, and 200% zoom audit.
- The accessibility-tree audit reads Chromium's accessibility tree on all 50 routes and
  requires a main landmark, one level-one heading, and a name on every interactive control.
- The zoom audit renders an 800 × 500 CSS viewport (a 1600 × 1000 window at 200%) and fails
  on horizontal overflow or a lost heading.
- `pnpm test:native` runs WebdriverIO against the embedded WebDriver server inside the real
  macOS window. It signs a coordinator in, reaches Mission Control, refuses the volunteer
  workspace, signs out, signs the volunteer in, and refuses coordinator routes. The suite
  uses a throwaway `CIVICFLOW_DATA_DIR`.
- `README.md`, `ARCHITECTURE.md`, `AUTH.md`, `DATA_MODEL.md`, `MATCHING_ENGINE.md`,
  `METRICS.md`, `SECURITY.md`, `SIGNING.md`, `ACCESSIBILITY.md`, `TESTING.md`,
  `USER_GUIDE.md`, `ENVIRONMENT.md`, `DECISIONS.md`, and `OPEN_SOURCE_CREDITS.md`.
- Visual QA notes and the full route sweep are in [VISUAL_QA.md](VISUAL_QA.md).
- `pnpm db:verify` reads the running desktop database and checks integrity, schema v11, 42
  tables, foreign keys and record counts.

### Release artifacts

`pnpm tauri build` produced `CivicFlow.app`, `CivicFlow_0.1.0_aarch64.dmg` and the release
binary from this workspace. The release workflow at `.github/workflows/release.yml` builds
the Windows and Linux installers on their own runners; those binaries cannot be produced by
cross-compiling from macOS.

## What remains manual or external

- Code signing and notarization: no Apple Developer ID or Windows certificate is configured.
  Builds are functional but show an unidentified-developer warning.
- Windows and Linux installers require the release workflow to run on GitHub's runners.
  Pushing the tag is the only step this workspace cannot perform by itself.
- A human VoiceOver or NVDA pass on the packaged build. The accessibility tree is audited,
  but reading order and announcement quality still need a person.
- Camera permission and venue lighting for QR scanning. The payload path is tested in Rust;
  a physical camera scan is a rehearsal step.
- Kiosk mode is not a separate webview. It is authenticated and focused, but a person at the
  keyboard can still leave it.

## Deliberate data choices

- Role coverage and seat fill are different numbers with different labels. The card and its
  bars disagree; the implementation defines both instead of forcing agreement.
- Impact outcomes are stored `impact_results`, not volunteer hours multiplied by a factor.
- Retention is a 30-day cohort calculation with an eligibility cutoff so recent starters do
  not distort the denominator. The demo seed includes six months of service history for it.
- Historical mock imagery is replaced with licensed Pexels and Wikimedia photography,
  credited in `OPEN_SOURCE_CREDITS.md`.
- Status is never color-only. Every badge carries text and a shape or icon.
