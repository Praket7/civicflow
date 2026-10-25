# CivicFlow user guide

CivicFlow is a local-first volunteer-coordination workspace for organizations that run on
volunteers. The bundled sample organization is a food bank in Buffalo, but the same screens
work for a pantry, a garden, a library, or a tutoring program. It runs as a Tauri desktop app
with SQLite on your machine, and as a browser preview backed by the same seed and local
storage. It needs no network connection or cloud service to run.

Accounts can live in this device's database, or in Supabase Auth when the build is configured
for it. A local build signs in with an email and password; a hosted build also offers Google
and emailed links. Either way the workspace records stay on the device.

## Start here

1. Open `/launch`. The screen shows the bundled workspace checks. Choose **Open workspace**.
2. On `/welcome`, choose **Sign in** for an existing account or **Create an account** for a new
   coordinator or volunteer. The account type is chosen on the create-account screen.
3. Enter the details and continue. A hosted build emails a confirmation link that reopens the
   app and finishes the account; **Continue with Google** skips the form when Google is
   enabled. A local-only build shows the six-digit verification code on the screen instead,
   and writes the account only after the code is entered.
4. A coordinator lands on `/coordinator/start`: join a team with the 10-digit coordinator
   code, or create an organization. Creating one asks for the public profile (description,
   website, address, contact email, photo, public or private) and returns a 10-digit
   coordinator code plus a 6-digit volunteer code.
5. A volunteer lands on `/volunteer/start`: join a public organization near you, or enter the
   6-digit volunteer code. Private organizations do not appear in the list.
6. The workspace menu under the organization name lists every organization you belong to,
   offers **Discover organizations**, and switches the current workspace. Coordinators also
   get a shortcut to create another organization.
7. Sign out from the sidebar to switch accounts. A coordinator cannot open volunteer routes,
   and a volunteer cannot open coordinator routes.

The demo accounts are `praket@feedmorewny.org` (coordinator) and
`maya.chen@gmail.com` (volunteer), both with `civicflow-demo`. **Open demo workspace** fills
those credentials for the selected role.

The browser preview stores its workspace in localStorage. The desktop app stores it in the
Tauri app-data directory as SQLite. Both read the same deterministic demo seed, so the
numbers match unless one has been edited. Passwords and session tokens are hashed in the
database; the demo password is public, so reset it in Settings → Accounts before entering
real volunteer information. A coordinator can create accounts and reset passwords from that
page as well. In a hosted build, **Forgot password?** emails a reset link instead, and the
coordinator reset remains the fallback for local accounts.

## Coordinator tour

The coordinator sidebar is grouped into **Work**, **Understand**, **Organize**, and
**Workspace**.

### Mission Control — `/coordinator/mission-control`

Start here for the operating picture: role coverage, weekly seat fill, upcoming attention
items, live arrivals, and recent activity. Every card links to the surface that owns the
underlying record. The bell in the top bar opens notifications; unread items also appear as a
badge in the sidebar.

### Coverage and AutoRoster — `/coordinator/coverage`, `/coordinator/autoroster`

**Coverage** shows where role slots and seats are thin across the selected date range. Open a
shift to see its roster or continue to AutoRoster.

**AutoRoster** plans unfilled roles for one shift:

1. Choose the shift.
2. Set options such as Spanish preference, conflict blocking, weekly cap, and whether the
   waitlist may be included.
3. Choose **Generate plan**.
4. Review each suggested volunteer, the score breakdown, and the plain-language reasons.
5. Choose **Apply N assignments**. The core validates every seat and writes the whole plan in
   one transaction. If one assignment is invalid, none are applied.

A planned volunteer who is already waiting is promoted; everyone else is registered. The
result is visible immediately in Coverage, the live roster, Mission Control, and Audit.

### Schedule and live roster — `/coordinator/schedule`, `/coordinator/shifts/:id`

**Schedule** switches between week and list views, moves between weeks, filters by program or
role, and opens a shift. The shift detail is the live roster: **Check in**, **Check out**,
mark a no-show, and **Promote** a waiting volunteer. Each action writes attendance or the
registration and records an audit event. A shift opens its check-in window 30 minutes before
the start.

### Attendance and kiosk — `/coordinator/attendance`, `/coordinator/kiosk`

**Attendance** is the coordinator's live event view. It shows expected, checked-in, completed,
and no-show rows and lets you check people in or out.

**Kiosk** is the coordinator-run check-in surface. The shift's six-digit event code is
displayed below the entry field for the demo. Select a shortened name, enter the code, and
choose **Check in**. **Scan QR** opens the camera and accepts a volunteer's
`civicflow://checkin/<token>` code. The kiosk shows shortened names; the full record is in
Attendance. If the camera is unavailable, the six-digit code is the fallback.

### Hours review — `/coordinator/hours`

Check-out creates a pending hours entry from the attendance timestamps. Hours are stored as
whole minutes. For each request the reviewer sees the requested amount, the scheduled shift,
and the attendance evidence.

- **Approve submitted** accepts the request.
- **Adjust minutes** requires a reason.
- **Reject** requires a reason.

Approving or adjusting an entry attaches it to a service-verification record. Only approved
minutes count toward reports and certificates.

### Programs, volunteers, and recruitment

- `/coordinator/opportunities` lists programs; `/coordinator/opportunities/new` creates one
  with a title, cause, description, address, capacity, duration, and requirements.
- `/coordinator/opportunities/:id` manages one program and its shifts.
- `/coordinator/volunteers` searches the volunteer database; `/coordinator/volunteers/:id`
  shows history, credentials, hours, and upcoming assignments.
- `/coordinator/applications` moves applicants through Applied, Review, Onboarding, and Active.
- `/coordinator/credentials` shows credential coverage and expiring credentials.

### Reports, impact, and records

- `/coordinator/reports` opens the reporting templates.
- `/coordinator/reports/custom` builds a report from an allow-listed field set.
- `/coordinator/reports/preview` is the printable impact report.
- `/coordinator/impact` shows approved-hours impact by cause.
- `/coordinator/insights` shows retention cohorts and at-risk volunteers.
- `/coordinator/records` is the unified searchable ledger.
- `/coordinator/audit` lists every write with actor, action, entity, and time. Both Records and
  Audit export CSV.

### Backup, settings, and accessibility

**Backup & recovery** (`/coordinator/backup`) creates a transactionally consistent SQLite
snapshot. **Preview** inspects a snapshot before restoring. **Restore** arms the action and a
second **Confirm restore** applies it, keeping a safety snapshot first. The newest twenty
snapshots are retained.

**Settings** (`/coordinator/settings`) validates and saves organization identity, week start,
default shift length, digest cadence, and display preferences. **Reset demo data** arms a
confirmation and then restores the seed; this cannot be undone.

**Accessibility** (`/coordinator/accessibility`) applies text scale, contrast, reduced motion,
and underlined links live. The same page documents keyboard and screen-reader support.

## Volunteer tour

### Home and discovery — `/volunteer/home`, `/volunteer/discover`

Home shows the next shift, a check-in shortcut when the window is open, recommendations, and
recent notices. Discover filters opportunities by cause, skill, day, and format. Use the save
control on a card to add it to the shortlist.

### Opportunity detail and saved — `/volunteer/opportunities/:slug`, `/volunteer/saved`

Choose an upcoming shift and a preferred role, then choose **Sign up for this shift**. If the
shift is full, **Join the waitlist** records your place; a coordinator promotion turns it into
a seat. The saved page filters, sorts, and removes shortlisted opportunities.

### Schedule and shift preparation — `/volunteer/schedule`, `/volunteer/shifts/:id`

My Schedule switches between calendar and list views. Open a shift to see arrival details,
the preparation checklist, and actions:

- **Add to calendar** downloads an `.ics` file.
- **Copy address** copies the service location.
- **Cancel my spot**, then **Confirm cancellation**, releases the seat. The core then promotes
  the first eligible waitlist volunteer and notifies the coordinator.

### Check in — `/volunteer/check-in`

The volunteer check-in page opens 30 minutes before the shift and closes 15 minutes after the
start. Enter the six-digit code posted at the check-in table, or expand **Show QR code for the
door scanner** and let the kiosk scan it. A successful check-in is idempotent: returning to
the page shows **You're checked in** instead of asking again.

### Hours and verification — `/volunteer/hours`, `/volunteer/verification`

My Hours separates pending, approved, and rejected service and exports the ledger as CSV.
Pending rows become approved only after coordinator review.

Service Verification lists approved records, lets you copy a verification code, and checks a
code against the local record. Printing the selected certificate produces the official
one-page document; the app does not claim a code that is not in the database.

### Impact and profile — `/volunteer/impact`, `/volunteer/profile`

Personal Impact turns approved hours into program outcomes and provides a copyable summary.
Profile shows skills, availability, credentials, and match links. Use **Edit profile** to
return to onboarding (`/volunteer/onboarding`) and choose **Save & continue** there.

## Demo check-in

The demo event is the Tuesday pantry shift. The kiosk and volunteer check-in page request the
active code from the core and display it on the kiosk for demonstration. The code is derived
from the shift and the current 15-minute window, stored in `checkin_codes`, and expires. It is
not a global hard-coded constant.

The volunteer must appear on the expected roster and the check-in window must be open. Invalid,
expired, duplicate, early, and unregistered check-ins are refused by the Rust core with a
structured error.

## Backup, restore, and reset

- Snapshots are local. In the desktop app they are SQLite copies; in the browser preview they
  are validated JSON snapshots in localStorage.
- Restore validates the artifact and schema before touching the live workspace, then keeps a
  safety snapshot named for the restore.
- **Reset demo data** in Settings restores the seed and discards demo writes. Practice a reset
  before a presentation, then create one fresh snapshot as the baseline.

## Troubleshooting

- **The app opens with different numbers.** Confirm you are in the same environment (desktop
  vs browser) and that you have not restored an older snapshot.
- **A volunteer cannot sign up.** The core refuses inactive volunteers, full shifts, full
  roles, expired credentials, missing skills, age requirements, time conflicts, and shifts
  that have already started. Read the error and use the suggested action.
- **Check-in is refused.** The window may be closed, the code may have rotated, the volunteer
  may not be on the roster, or the person may already be checked in.
- **A plan will not apply.** Re-plan after any registration change; a stale plan is validated
  against current capacity and will be rejected rather than overfilling the shift.
- **The browser preview looks reset.** Preview data is scoped to localStorage for that origin.
  Clearing site data removes preview writes and snapshots.
- **Print output is blank.** Use Chromium for print-to-PDF. The project's print audit checks
  the certificate and impact report in headless Chrome.

For implementation details and test commands, see [ARCHITECTURE.md](ARCHITECTURE.md),
[DATA_MODEL.md](DATA_MODEL.md), [MATCHING_ENGINE.md](MATCHING_ENGINE.md), and
[TESTING.md](TESTING.md).
