# CivicFlow demo script

Seven minutes, one laptop, no network. The demo runs in the native Tauri window. The
browser preview is the fallback, but it does not run the Rust workflow commands, so say
that plainly if you have to switch.

## Before the room opens

1. Launch the app with `pnpm tauri dev` or the release bundle. Wait for Mission Control to
   load, not just the window border.
2. Open **Settings → Local data** at `/coordinator/settings` and choose **Reset demo workspace**
   twice (the second click confirms). Wait for “Demo workspace reset.”
3. Open **Backup & recovery** at `/coordinator/backup` and create one snapshot named for
   the event. This is the emergency rollback point.
4. Check that the demo clock reads **Tuesday, October 13, 2026, 7:45 AM**. The pantry shift
   starts at 8:00, so check-in is open.
5. Set the window to 1600 × 1000. Turn off notifications, screen savers, and automatic
   updates. Disconnect Wi-Fi after the app has launched if the venue network is unreliable;
   CivicFlow makes no runtime requests.
6. Have a second terminal open with `pnpm tauri dev` ready, plus the Vite preview
   (`pnpm dev`) as the fallback. Do not start both against the same window.

Demo identities:

- Volunteer: **Maya Chen**, the current volunteer profile.
- Coordinator: **Praket Gauri**, the current coordinator profile.
- Today’s check-in code is shown on the kiosk and changes every 15 minutes. Read it there
  before switching to the volunteer check-in screen; do not memorize a code from an older
  rehearsal.

## The seven-minute beat sheet

| Time | Route                                            | What you say                                                                                                                                                         | What you click                                                                                       | What the room sees                                                                     |
| ---- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 0:00 | `/coordinator/mission-control`                   | “This is one local workspace, not a dashboard over mock JSON. Every number below is read from SQLite.”                                                               | Point at role coverage, the weekly bars, and the attention list.                                     | 91 % role coverage, 418 hours, three attention items.                                  |
| 0:35 | `/coordinator/autoroster`                        | “AutoRoster is a min-cost max-flow assignment over candidate-days and role slots, not a per-gap greedy pick.”                                                        | Choose **Community Food Distribution**, then **Optimize**.                                           | Suggested candidates with score explanations, unfilled slots, before/after coverage.   |
| 1:15 | Same                                             | “Eligibility is a hard gate: skills, credentials, age, availability, conflicts, and capacity. The score only ranks people who already pass.”                         | Hover or open one candidate explanation.                                                             | Named reasons, not a black-box score.                                                  |
| 1:45 | Same                                             | “Apply is one transaction. The plan cannot half-write a roster.”                                                                                                     | Press **Apply plan**.                                                                                | Applied state, coverage change, audit event.                                           |
| 2:15 | `/coordinator/shifts/sh-sat-food`                | “The waitlist is ordered and deterministic. A cancellation asks the core for the next eligible person for the role that opened.”                                     | Show the waitlist rail. Press **Promote** on the first eligible entry.                               | Row becomes Promoted, volunteer appears on the roster, audit event `waitlist.promote`. |
| 2:45 | `/volunteer/schedule`                            | “Now switch to the volunteer side. This is the same database, not a second demo app.”                                                                                | Open today’s pantry shift, then **Shift detail**.                                                    | Maya’s upcoming shifts and the 8:00 pantry shift.                                      |
| 3:05 | `/volunteer/shifts/sh-tue-pantry`                | “A volunteer can cancel from here. The core recalculates coverage and, when a waitlist exists for that role, promotes the next eligible person automatically.”       | Point at the cancellation control but do not cancel the shift used for the rest of the story.        | Cancel control and shift preparation checklist.                                        |
| 3:25 | `/coordinator/kiosk`, then `/volunteer/check-in` | “Check-in is the real arrival path. The code is issued by the core, expires, and is checked against the shift window.”                                               | Read the code on the kiosk, open the volunteer check-in screen, enter that code, press **Check In**. | Success state with arrival time, role, and check-out time.                             |
| 4:00 | `/coordinator/attendance`                        | “The volunteer’s arrival is already visible to the coordinator. Attendance is an event ledger, not a status flag invented by the UI.”                                | Find Maya’s row, press **Check out**.                                                                | Status changes to completed and a calculated hours entry appears.                      |
| 4:25 | `/coordinator/hours`                             | “Hours are not typed in by the coordinator. The system calculated the duration from check-in and check-out; the volunteer’s request is compared with that evidence.” | Select Maya’s pending entry. Read requested vs scheduled vs attendance.                              | Approve / adjust / reject controls with the evidence panel.                            |
| 4:45 | Same                                             | “Approval requires a decision and a note. A rejection or adjustment needs a reason.”                                                                                 | Press **Approve**.                                                                                   | Queue count falls, notification is generated, audit event `hours.approve`.             |
| 5:05 | `/volunteer/verification`                        | “Only approved hours become a verification record. Pending attendance never appears on the certificate.”                                                             | Select the new record, press **Copy** and then **Print**.                                            | Verification code, date range, total minutes, printable certificate.                   |
| 5:35 | Same                                             | “The code is stable and checkable. The certificate is not a screenshot.”                                                                                             | Paste the code into the checker and submit.                                                          | Valid result with the matching record.                                                 |
| 6:00 | `/coordinator/audit`                             | “Every write above left an attributed audit event. This is the evidence layer.”                                                                                      | Filter by entity or search `hours.approve`.                                                          | Check-in, check-out, approval, promotion, and AutoRoster events.                       |
| 6:25 | `/coordinator/backup`                            | “A snapshot is a transactionally consistent SQLite copy taken with the backup API. Restore validates first and keeps a safety copy.”                                 | Point at the pre-demo snapshot. Do not restore during the demo unless asked.                         | Snapshot history, row count, size, retention note.                                     |
| 6:50 | Any                                              | “That is the whole loop: plan, assign, arrive, verify, report, recover. All of it is local.”                                                                         | Stop.                                                                                                | —                                                                                      |

### The question beat (40 seconds, any point after Mission Control)

Open `/ask` and press **Which shifts are short this week?**. The answer names each shift, the
role that is short, and the rows it read; the last line links to the schedule.

Say: “This is the same snapshot, read by a fixed rule. There is no model and no network, so it
cannot invent a shift. Ask something it does not cover and it says so.”

If a judge wants the hard version, ask **Who can replace Maya on Saturday?**. The ranking
explains availability, conflicts, skills and attendance, and each name opens that volunteer.

## The service lifecycle story

Use this as the spoken spine, even when the clock forces you to skip a click:

1. **Maya is scheduled.** Her registration is a row, not a UI state. The shift detail reads
   the same registration the coordinator roster reads.
2. **A seat opens.** Cancellation marks the registration canceled, decrements the shift and
   role counts, and audits the change in one transaction. If the `auto_promote_waitlist`
   setting is on, the core scans waiting entries by position, skips anyone who fails
   eligibility for the open role, and promotes the first person who passes.
3. **Recovery is visible.** The promoted volunteer gets a registration and the waitlist row
   becomes promoted. If nobody is eligible, the core creates a `COVERAGE_REQUEST`
   notification instead of leaving a silent gap.
4. **Arrival is authoritative.** Check-in validates the shift window, the volunteer’s
   registration, the six-digit code, and the one-time state. Duplicate check-in is
   idempotent; a code from another shift is rejected.
5. **Check-out creates the hours request.** The core stores check-in and check-out
   timestamps, calculates integer minutes, and writes a pending hour entry. The
   coordinator sees requested minutes, scheduled minutes, and attendance evidence.
6. **Approval issues verification.** `review_hours` accepts only pending entries, validates
   1–1440 approved minutes, writes the decision and audit event, and links the entry to a
   `service_verifications` record built from approved minutes only.
7. **The record is checkable.** The certificate code is unique, stable, and searchable on
   the verification screen. The volunteer’s hours and impact read models update from the
   same rows.

The seed does not currently put a waiting entry on Maya’s 8:00 pantry shift. The UI beat at
2:15 therefore demonstrates promotion on the Saturday food shift, where the seed has a real
waitlist. The automatic cancellation path is covered by the Rust tests
`cancellation_promotes_the_first_eligible_waitlist_candidate` and
`maya_iris_lifecycle_produces_hours_and_a_verification_record` in
`src-tauri/core/tests/lifecycle.rs`. Say that instead of pretending the browser has a
waitlist the seed does not contain.

## If a judge asks

- **“Is the optimizer real?”** Open `src-tauri/core/src/matching.rs`. The flow graph,
  scoring, min-cost flow, brute-force oracle, proptest, and 500-candidate performance test
  are all there. `docs/MATCHING_ENGINE.md` has the worked example.
- **“Can the UI invent a number?”** The workflow commands in `src-tauri/core/src/workflows.rs`
  validate and write before returning a snapshot. The React layer caches that snapshot; it
  does not own domain rules.
- **“What happens if two coordinators click at once?”** The Tauri state holds one SQLite
  connection behind a mutex, and each workflow runs in a transaction. This is a local
  single-workspace app, so there is no multi-user merge story.
- **“Where is the audit trail?”** `audit_events` is written in the same transaction as the
  change. `/coordinator/audit` reads it.
- **“Can I see the schema?”** `docs/DATA_MODEL.md` and
  `src-tauri/core/migrations/0001_initial.sql` through `0006_auth_attempts.sql`.
- **“Is the question box an AI?”** No. `src/lib/ask/answers.ts` is a keyword matcher over a
  small intent registry; every number comes from the same selectors the screens use, and each
  answer prints the count of records it read. That is deliberate: a judge can check it.
- **“What is not finished?”** Multi-user sync, code signing, and a separate kiosk webview.
  Accounts and role checks are implemented in Rust; the QR payload is a real
  `civicflow://checkin/<token>` value that the core validates. Say both without hedging.

## Failure contingencies

- **Native window will not launch.** Run `pnpm dev` and use the browser preview at
  `http://localhost:5173`. It mirrors the snapshot contract in local storage but not the
  Rust validation. Use it for screens and reporting, and show the Rust tests for the
  lifecycle claims.
- **The check-in code is rejected.** Confirm the demo clock is 7:45 AM on October 13, the
  shift is the 8:00 pantry shift, and you typed the code currently shown on the kiosk. A
  stale 15-minute code is refused. If the arrival window has passed, use the coordinator’s
  manual attendance path and explain that the code is time-bound.
- **The camera or QR path is unavailable.** It is not required. Use the six-digit code at
  `/volunteer/check-in`. The kiosk is a coordinator-authenticated surface in the same window.
- **A demo write goes wrong.** Go to `/coordinator/backup`, select the pre-demo snapshot,
  arm **Restore**, and confirm. Wait for the safety-snapshot message, then re-open Mission
  Control. Do not reset the database by deleting files.
- **The app data is stale from a previous run.** Use **Settings → Local data → Reset demo workspace**.
  This deletes user writes and restores the deterministic seed. It is faster and safer than
  editing SQLite by hand.
- **A chart or route looks blank.** Reload once. If it persists, switch to the pre-demo
  backup and continue with the remaining beat; do not debug in front of judges.

## After the demo

1. Reset the demo workspace from **Settings → Data**.
2. Create one final snapshot if the next presenter uses the same machine.
3. Close the native window and any Vite server you started.
4. Leave the pre-demo snapshot in place; it is the recovery point for the next run.

## What is deliberately manual

- The demo accounts are `praket@feedmorewny.org` and `maya.chen@gmail.com`, both with
  `civicflow-demo`. Tell the audience to change that password before real volunteer data is
  entered; Settings → Accounts does it.
- The demo date is fixed at October 13, 2026, 7:45 AM. Time-dependent copy is honest about
  that window.
- A physical camera scan is not required for the demo. The volunteer screen renders a real
  QR code and the kiosk can scan it, but the six-digit code is the fallback when camera
  permission is unavailable. The payload validation is covered by Rust tests.
- PDF output is the browser’s print-to-PDF dialog from the verification certificate, not a
  separate server-side renderer. `pnpm audit:print` checks that the certificate prints
  content.
