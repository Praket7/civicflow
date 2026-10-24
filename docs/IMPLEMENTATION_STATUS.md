# Implementation status

Last reviewed 2026-10-24. This page describes what is in the repository now, not what the
build plan hoped for. Screens are real routes with working controls. Workflow writes go
through `civicflow-core`, which validates them, stores them in SQLite, and appends an audit
event before returning a fresh snapshot.

## What is complete

### Foundation

- Tauri 2 desktop shell, React 19 + TypeScript + Vite, Rust core crate, SQLite through
  `rusqlite`.
- Embedded migrations at schema version 4, deterministic seed, foreign keys, integrity
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
- Kiosk is a coordinator-authenticated route. It is still the same webview, not a separate
  capability-scoped window.

### Domain engine

- AutoRoster is Rust: eligibility gates, six-component score, candidate-day to role-slot
  min-cost max-flow, deterministic ordering, explanation strings, brute-force oracle,
  proptest, and a 500-candidate/100-slot performance gate.
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
- Reports, CSV, and PDF are generated in Rust from stored rows.

### Screens

All 42 registered routes resolve to built screens. The main working surfaces:

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

- 117 frontend tests, 54 Rust tests, typecheck, lint, format, web build, contrast audit,
  print audit, accessibility-tree audit, and 200% zoom audit.
- The accessibility-tree audit reads Chromium's accessibility tree on all 42 routes and
  requires a main landmark, one level-one heading, and a name on every interactive control.
- The zoom audit renders an 800 × 500 CSS viewport (a 1600 × 1000 window at 200%) and fails
  on horizontal overflow or a lost heading.
- `pnpm test:native` runs WebdriverIO against the embedded WebDriver server inside the real
  macOS window. It signs a coordinator in, reaches Mission Control, refuses the volunteer
  workspace, signs out, signs the volunteer in, and refuses coordinator routes. The suite
  uses a throwaway `CIVICFLOW_DATA_DIR`.
- `README.md`, `ARCHITECTURE.md`, `DATA_MODEL.md`, `MATCHING_ENGINE.md`,
  `COVERAGE_HEALTH.md`, `METRICS.md`, `SECURITY.md`, `ACCESSIBILITY.md`, `TESTING.md`,
  `USER_GUIDE.md`, `RUBRIC_MAP.md`, `FBLA_NYS_RUBRIC_AUDIT.md`, `DEMO.md`, `ENVIRONMENT.md`,
  `DECISIONS.md`, and `OPEN_SOURCE_CREDITS.md`.
- Reference comparisons, visual QA notes, and 42 route captures under `screenshots/`.
- `pnpm db:verify` reads the running desktop database and checks integrity, schema v4, 32
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

- Role coverage and seat fill are different numbers with different labels. The reference
  card and its bars disagreed; the implementation defines both instead of forcing agreement.
- Impact outcomes are stored `impact_results`, not volunteer hours multiplied by a factor.
- Retention is a 30-day cohort calculation with an eligibility cutoff so recent starters do
  not distort the denominator. The demo seed includes six months of service history for it.
- Historical mock imagery is replaced with licensed Pexels and Wikimedia photography,
  credited in `OPEN_SOURCE_CREDITS.md`.
- Status is never colour-only. Every badge carries text and a shape or icon.
