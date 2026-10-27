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

### Ask CivicFlow — `/ask`

Both roles can open the question box. It offers six questions and accepts typed ones in plain
language. Every answer is computed from the records saved on this device, so it never guesses:
it names the rows it read, shows how many, and links to the screen where you act.

- Coordinator questions: which shifts are short this week, who can replace a named volunteer,
  whose credentials expire soon, which program has the lowest fill rate, what needs attention
  today, how many hours were approved this month.
- Volunteer questions: the next shift, opportunities that match saved skills, hours served, and
  how to join another organization.
- A question outside those records returns a refusal plus the questions it can answer, and those
  rows are clickable.

### Coverage and AutoRoster — `/coordinator/coverage`, `/coordinator/autoroster`

**Coverage** shows where role slots and seats are thin across the selected date range. Open a
shift to see its roster or continue to AutoRoster.

**AutoRoster** plans unfilled roles for one shift:

1. Choose the shift.
2. Set options such as Spanish preference, conflict blocking, weekly cap, and whether the
   waitlist may be included.
3. Choose **Run optimizer**.
4. Review each suggested volunteer, the score breakdown, and the plain-language reasons.
5. Choose **Apply N assignments**. The core validates every seat and writes the whole plan in
   one transaction. If one assignment is invalid, none are applied.

A planned volunteer who is already waiting is promoted; everyone else is registered. The
result is visible immediately in Coverage, the live roster, Mission Control, and Audit.

Under each suggested seat, **Why this person?** lists every hard requirement the solver
checked with a pass or fail and the score components that built the number. **Ask why not**
offers the other people who could take that seat:

- someone who fails a requirement is shown the check that failed and nothing else;
- someone who was eligible but passed over gets a real answer — the assignment is decided,
  the plan is solved again, and the two plans are compared. It reads like
  "required seats filled 8 to 7" and names the seat that would go uncovered.

AutoRoster follows the organization's **matching policy** (Settings → Scheduling → Matching
policy): how many shifts or minutes one volunteer may take on per day and per week, the
minimum rest between shifts, what a missing age or credential means for a role that requires
one, and how much the skill, cause-interest, language, fairness and reliability components
weigh. Saving a change creates a version, recorded in the audit log, and every plan names the
version it used — so a roster can still be explained after the rules change.

### Schedule and live roster — `/coordinator/schedule`, `/coordinator/shifts/:id`

**Schedule** switches between week and list views, moves between weeks, filters by program or
role, and opens a shift. **Repeating series** lists every rule the workspace is running with
its generated shifts: **Add missing shifts** tops up the occurrences the calendar is not
holding yet, **Change the time** retimes either the next shift only or the whole series, and
**Remove series** deletes the rule with the shifts it made, refusing a shift somebody is
already registered for. The shift detail is the live roster: **Check in**, **Check out**,
mark a no-show, and **Promote** a waiting volunteer. Each action writes attendance or the
registration and records an audit event. A shift opens its check-in window 30 minutes before
the start.

When a shift has an open required seat, **Open seats** answers who should take it: the
ranking walks the waitlist in order and reports the first volunteer who still meets every
requirement for that role, naming anyone ahead who could not take the seat and the reason
(“no longer holds the required credential”). **Promote** puts that person on the roster, and
the card stops offering a seat that person already holds.

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
- `/coordinator/insights` shows retention cohorts and at-risk volunteers, plus **Retention
  signals**: one row per volunteer a rule fired for, with the rule's threshold in the reason,
  the history that produced it, and a suggested action.
- `/coordinator/reports` also carries **Decision readouts**: coverage decisions (late
  cancellations, waitlist promotions, promotion success, average sign-up lead), volunteer
  engagement (new volunteers, 30/60/90-day return, inactive, completed shifts, no-show rate),
  and credential readiness (current, expiring in 30 days, expired, future shifts at risk).
- `/coordinator/records` is the unified searchable ledger.
- `/coordinator/audit` lists every write with actor, action, entity, and time. Both Records and
  Audit export CSV.

### Backup, settings, and accessibility

**Backup & recovery** (`/coordinator/backup`) creates a transactionally consistent SQLite
snapshot. **Preview** inspects a snapshot before restoring. **Restore** arms the action and a
second **Confirm restore** applies it, keeping a safety snapshot first. The newest twenty
snapshots are retained.

**Settings** (`/coordinator/settings`) validates and saves organization identity, week start,
default shift length, digest cadence, and display preferences. **Reminder rules** switches the
deterministic reminders on and off and queues the ones that are due; each notification records
the rule that wrote it. Under **Scheduling**, the
**Matching policy** section edits what AutoRoster may do: workload limits, the minimum rest
between shifts, what an unknown age or credential means, and the five match priorities. Each
save appends a version, shows it beside the heading, and writes `policy.updated` to the audit
log. **Reset demo data** arms a confirmation and then restores the seed; this cannot be
undone.

**Accessibility** (`/coordinator/accessibility`) applies text scale, contrast, reduced motion,
and underlined links live. The same page documents keyboard and screen-reader support.

### Importing a volunteer spreadsheet — Settings → Local data

**Import a volunteer spreadsheet** takes a CSV of the roster a nonprofit already keeps. The
file is read row by row first and nothing is written until the whole file is clean: every
problem names the line number, the value that was rejected, and the accepted vocabulary, and a
file with any problem is refused whole, so a roster is never left half imported. A name and an
email are required; `Status` defaults to `onboarding`, because a spreadsheet says who exists,
not who has been screened. Skills, availability (`mon:morning; wed:evening`) and causes arrive
as semicolon-separated lists, and different skill or availability spellings on two rows are
reported rather than silently dropped. **Fill with the template** puts a header and one example
row in the paste area, **Export the roster** writes the current roster in exactly the columns
the import reads, and a finished import writes one `volunteers.imported` audit event with the
row counts.

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
It also shows **Recognition milestones**: verified hours, completed shifts, and years of
service as they are recorded, with the next one and what is still missing.
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
