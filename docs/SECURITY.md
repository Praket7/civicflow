# Security

CivicFlow is an offline, single-device desktop application. Accounts separate the
coordinator from each volunteer, and the Rust core enforces that separation on every IPC
command. This document records the trust boundaries, the controls that exist, and the risks
that remain so the model is not mistaken for a multi-user service.

## Assets

- Volunteer names, contact details, skills, availability, birthdates, and credentials.
- Shift registrations, waitlist entries, attendance events, hours decisions, and service
  verification codes.
- Coordinator settings, saved report views, and the audit trail.
- Password hashes and hashed session tokens in the local database.
- SQLite database and backup snapshots in the Tauri app-data directory.
- The integrity of derived numbers on Mission Control, coverage, reports, and the kiosk.

The most sensitive records are volunteer PII and the attendance/hours evidence used to issue
service verifications. The most important integrity property is that a displayed count or
status comes from a validated database write, not from browser state.

## Trust boundaries

```text
OS user session
  └── Tauri window (WebView)
        ├── sign-in screen ──► Argon2id check ──► opaque session token
        ├── React UI and local preview fallback
        └── IPC command + token ──► civicflow-core (Rust) ──► role and identity checks
                                      └──► SQLite + backup files
```

1. **OS account → application.** Anyone who can use the desktop account can open the window,
   but the workspace and every native command require a CivicFlow sign-in. File permissions
   on the app-data directory still protect the database at rest.
2. **WebView → Rust.** The frontend can call only the commands registered in
   `src-tauri/src/lib.rs`. Each workspace command takes the session token and resolves it
   before touching data. A missing, expired, revoked or unknown token returns
   `AUTH_REQUIRED`; a volunteer calling a coordinator command gets `FORBIDDEN`.
3. **Rust → filesystem.** The core reads and writes the SQLite database and backup files.
   Backup identifiers and export destinations are the two places where a path reaches the
   filesystem from IPC; both are validated.
4. **Application → network.** Fonts, images, and workspace data are bundled, so the local
   workspace never sends a request. The one optional boundary is hosted identity: when
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set, the sign-in screen exchanges
   credentials or a provider code with Supabase over HTTPS, and the packaged CSP allows that
   single origin. Workspace records never leave the device, and the hosted session is used
   only to verify the identity before a local session is issued.

## Accounts and sessions

- Passwords are hashed with Argon2id using a random salt, at the crate defaults
  (m=19 456 KiB, t=2, p=1), which match the current OWASP minimum. Plaintext passwords are
  never written to the database.
- A sign-in creates a 256-bit token from the OS random generator. Only its SHA-256 hash is
  stored in `auth_sessions`, so a copied database does not directly yield live session
  tokens. The hash is enough because the token is high-entropy, not user-chosen.
- Repeated failures are throttled per email in `auth_attempts`: five misses in a fifteen
  minute window are free, then the wait starts at 30 seconds and doubles per miss up to five
  minutes. A successful sign-in clears the row, and an unknown email is counted the same way
  and costs the same Argon2 work, so the form does not reveal which addresses exist. The
  form shows the remaining wait instead of a generic failure.
- A session expires after 12 hours, or 30 days when “keep me signed in” is chosen. Sign-out
  sets `revoked_at`. A coordinator password reset revokes every session for that account.
  When a stored token stops resolving, the app clears it and the sign-in screen says the
  session ended rather than dropping the person on a blank form.
- Passwords are at least 8 and at most 200 characters. A disabled account cannot sign in.
- `/create-account` is open on this device: it validates the name, email and password, refuses
  an email that already has an account, creates the volunteer roster profile when one is
  missing, and writes an `auth.account_created` audit event. The role is chosen at sign-up, so
  the trust boundary is the OS account, not the app. The first thing an operator should do on
  a shared computer is create the real coordinator account and disable or reset the demo one.
- The demo accounts are seeded with `civicflow-demo`. That password is public by design and
  must be changed in Settings → Accounts before the workspace holds real volunteer data.

## Role and row-level enforcement

The UI routes are guarded as a convenience, but the Rust layer is authoritative:

- Coordinator-only: Mission Control read model, AutoRoster planning and apply, applicant
  stage changes, waitlist promotion, hours review, opportunity creation, workspace settings
  (other than display preferences), reports and exports, account listing and resets, backups
  and restore, reset-to-seed, and the audit trail.
- Volunteer-or-coordinator: reading a snapshot, saving an opportunity, reading a shift's
  check-in code, registering, joining a waitlist, canceling, checking in and out, and
  changing display preferences.
- A volunteer command that names a `volunteer_id` must match the id attached to the session.
  A volunteer cannot act on another volunteer's record.
- The volunteer snapshot is redacted in `workflows::snapshot_for`: attendance, decisions,
  registrations, waitlist entries, credentials and verifications are limited to that
  volunteer; the applicant pipeline, audit trail, retention cohorts, impact metrics and saved
  report views are removed.
- Notifications are filtered by audience and, when present, by volunteer id. Marking another
  audience's notification read returns false without changing it.
- The preview repository mirrors these checks in the browser fallback. It is a preview, not
  the production boundary.

## Tauri capabilities

The capability file grants one window (`main`) `core:default`, `dialog:allow-save`, and the
deep-link defaults. There is no shell plugin, filesystem plugin, HTTP plugin, or process
plugin. The save dialog is the only native dialog permission; the frontend supplies the
chosen path back to `export_report`, where Rust validates it. `open_external_url` is the only
command that reaches outside the process, and it accepts an `https://` address only: the
scheme is checked in Rust before the OS browser is asked to open it, so the WebView cannot
hand the system a `file:` or custom-scheme target.

The main window is also the kiosk window. Kiosk is an authenticated coordinator route with a
focused UI, not a separate locked-down webview. A person at the keyboard can navigate away
from it. A production deployment would add a separate window label with a narrower command
allow-list and an operator-only way to leave kiosk mode.

The WebDriver plugin is linked only for debug builds. Release builds do not start its
server, and the release workflow builds without debug assertions.

## Content Security Policy

Production uses a bundled-asset policy with one optional API origin:

```text
default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none';
form-action 'self'; img-src 'self' data: asset: http://asset.localhost;
media-src 'self' blob:; style-src 'self' 'unsafe-inline'; font-src 'self';
script-src 'self';
connect-src ipc: http://ipc.localhost https://<project>.supabase.co
```

There is no remote script, style, font, or frame origin, and `object-src`, `base-uri` and
`form-action` are closed so a bundled page cannot load a plugin, rewrite its base URL, or
post a form elsewhere. `style-src` allows inline styles because the app uses React inline
style values and print rules; it does not allow inline script. `img-src` includes the Tauri
asset protocol so bundled media loads and `data:` so the QR code can render from a data URL.
`media-src` allows the camera stream's blob URL. `connect-src` names the hosted identity
project, and nothing else: a build without hosted auth configured never contacts it.

Development uses a separate `devCsp` that additionally allows the Vite origin
(`http://localhost:5173`) and its WebSocket for hot reload. The production policy does not
contain those origins, so a packaged build cannot connect to a local development server.

## Input and SQL handling

All application SQL uses `rusqlite` bound parameters (`?1`, `params![...]`) rather than
string interpolation. User-supplied values therefore remain values even when they contain
quotes, SQL keywords, or Unicode. Dynamic table names exist in one place, the backup row
counter, and come from `sqlite_master` rather than user input; the name is quoted before the
query. Report field selection is checked against an allow-list before a report is built.

The Rust core is authoritative for workflow rules. Registration, cancellation, waitlist
promotion, check-in, check-out, hours review, opportunity creation, and profile saves all
reject impossible transitions. IPC is a thin wrapper; hiding or bypassing a button in the
WebView does not bypass validation or authentication.

## IPC errors

Commands return a structured `AppError` with `code`, `message`, and optional `field` and
`action` (for example `SHIFT_FULL` with `JOIN_WAITLIST`). Authentication failures use
`AUTH_REQUIRED`, `FORBIDDEN`, `INVALID_CREDENTIALS`, `ACCOUNT_DISABLED`, and
`PASSWORD_NOT_SET`. The frontend can offer a recovery path instead of parsing prose.
Infrastructure failures are mapped to `DATABASE`, `WORKSPACE_BUSY`, or `INTERNAL` without
exposing SQL statements or file contents in normal UI copy.

## Backup and restore

Backups are written with SQLite's online backup API, not by copying a live file mid-write.
Before a snapshot is accepted, `backups::validate` checks:

- the SQLite application id matches CivicFlow;
- all required tables are present, including `auth_sessions`;
- the schema version is not newer than this build. An older snapshot is accepted and
  migrated forward during the restore, so an update does not orphan the snapshots a device
  already has; a snapshot from a newer build is refused because this build cannot know what
  it is missing;
- `PRAGMA integrity_check` returns `ok`;
- `PRAGMA foreign_key_check` returns no rows;
- the workspace clock setting exists.

Restore only accepts an id whose `file_name` equals the whole id, ends in `.db`, and exists
inside the app-data backup directory. `..`, absolute paths, nested paths, and foreign names
are rejected before any file is opened. A pre-restore safety snapshot is written and
protected from pruning, then the target is copied back into the live database and the
restore is appended to the audit trail.

A restored snapshot also restores the account and session tables from that point in time.
Sessions created after the snapshot cease to exist; the user signs in again.

Snapshot metadata includes a SHA-256 checksum, schema version, row counts, and integrity
status. The checksum identifies a file and supports manual comparison; it is not a signature
and restore does not treat it as proof of authenticity.

## Audit trail

Every workflow write appends an `audit_events` row with an action, entity, summary, actor,
and demo-clock timestamp in the same command that writes the state change. Sign-in,
sign-out, password reset and notification reads are audited under the acting account, not a
hard-coded coordinator. Restores add a `backup.restore` event naming both the target and the
safety snapshot.

Audit rows are ordinary database rows: a local administrator can edit them. There is no
append-only store, hash chain, or remote witness. The volunteer snapshot does not include the
audit trail.

## Secrets and credentials

The application stores no API keys or signing secrets. The only authentication secrets are
the Argon2id password hashes and the SHA-256 session-token hashes in SQLite. Volunteer
“credentials” shown in the UI are domain records (for example, a food-handling certificate and
expiry date), not application login secrets.

## Dependencies

CI runs the RustSec advisory database against both Rust lockfiles (`src-tauri` and
`src-tauri/core`) and `pnpm audit --prod` against the shipped JavaScript packages, so a newly
disclosed advisory fails the build rather than waiting for a release. Informational
advisories (unmaintained transitive crates) are reported by the action but do not fail it.

## Out of scope

The following are not provided:

- multi-user sync, a hosted server, or multi-tenant isolation;
- encryption at rest for the SQLite database or backups;
- transport security for workspace data, because workspace data never leaves the device.
  Hosted identity traffic relies on HTTPS and the provider's own certificate handling;
- code signing or notarization of the installers;
- protection from a malicious OS administrator, malware running as the same user, or a
  compromised operating system;
- a separate kiosk webview with its own capability allow-list.

## Residual risks and mitigations

| Risk                                                    | Current mitigation                                                                                                                     | Next step                                                                                    |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| The demo password is public                             | Settings → Accounts reset; the README and release notes tell the operator to change it before real data                                | Require a password change on first coordinator launch                                        |
| Anyone with the OS account can try a password           | Argon2id hashing; per-email throttle after five misses, growing to five minutes                                                        | Bind the wait to the device as well as the email, and log repeated misses to the audit trail |
| Database or backup is readable by another local account | Store under the per-user app-data directory; rely on OS permissions                                                                    | Enable full-disk encryption or SQLCipher for a shared machine                                |
| A copied backup exposes password and session hashes     | Passwords use Argon2id; session tokens are stored only as hashes                                                                       | Sign backups with a key held outside the workspace                                           |
| A crafted SQLite file is offered as a backup            | Application id, required tables, schema version, integrity, foreign keys, and clock check before restore                               | Sign snapshots with a key held outside the workspace                                         |
| A backup is silently replaced after validation          | Restore validates the file it is about to open; checksum is reported                                                                   | Compare the checksum to a separately recorded value                                          |
| Audit history is edited directly in SQLite              | Audit is written transactionally with each workflow and visible in the UI                                                              | Append-only external log or signed event batches                                             |
| Export writes to an unintended location                 | Native save dialog chooses the path; Rust requires an absolute path, an existing parent, and the right extension                       | Keep the save dialog as the only path source                                                 |
| Kiosk exposes more navigation than a public mode should | Authenticated coordinator route with a focused UI; no privileged native command beyond the shared workspace                            | Separate window and command allow-list                                                       |
| Development CSP could leak into a packaged build        | Production `csp` and `devCsp` are separate; the packaged policy has no localhost origins                                               | Add a release check that fails if the packaged config contains a dev origin                  |
| A debug build exposes the WebDriver server              | Plugin server starts only under `debug_assertions`; release builds are used for distribution                                           | Keep the release job on `tauri build` without debug assertions                               |
| Large or hostile text reaches SQLite                    | Bound parameters; Rust length and format validation on user-facing fields                                                              | Add explicit maximum lengths to every free-text command                                      |
| A report export is opened in a spreadsheet              | CSV cells beginning with `=`, `+`, `-`, `@`, tab or return are prefixed so they stay text                                              | Offer an xlsx writer with typed cells instead of raw CSV                                     |
| A crafted `civicflow://` URL starts a sign-in           | The callback must follow a hand-off this device started (24 h, single use); the URL is parsed against an exact scheme, path and length | Move desktop OAuth to PKCE with a loopback redirect per RFC 8252                             |

## Reporting a problem

This is a local project, not a deployed service. If it is adapted for real use, record a
security contact, a disclosure process, and a review of the threat model before accepting
volunteer data from the public.
