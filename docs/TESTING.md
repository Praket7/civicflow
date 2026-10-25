# Verification evidence

Run in this workspace on 2026-10-22 with the toolchain in [ENVIRONMENT.md](ENVIRONMENT.md).
The browser workflow checks and the Rust read-back were re-run on 2026-10-23; the final
schedule, help, report and database checks were re-run on 2026-10-24. Copy the commands to
reproduce.

## Frontend

```bash
pnpm typecheck    # tsc --noEmit, 0 errors
pnpm lint         # eslint ., 0 problems
pnpm format       # prettier --check, clean
pnpm test         # 124 tests, 12 files
pnpm build:web    # tsc && vite build
pnpm audit:print  # headless Chrome; certificate and report must print content
pnpm audit:a11y   # Chromium accessibility tree, all 43 routes
pnpm audit:zoom   # 800 × 500 CSS viewport (200% zoom), all 43 routes
pnpm test:native  # WebdriverIO inside the real macOS window
```

| Suite                      | What it proves                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compute.test.ts`          | Weekly seat fill is derived per day; role coverage ignores started shifts; 75 % is not an attention item; missing roles outrank open seats; critical within 5 days; demo totals 91 %, 3 items, 418 hours                                                                                                                                                                                                                                                                      |
| `selectors.test.ts`        | Maya's ledger is counted once (18.5 h recorded, 9.5 h verified, 9 h pending); she has three upcoming shifts; demo-day arrivals only count once the check-in window opens; a snapshot check-in appears in the roster used by attendance and the kiosk; a promoted waitlist entry appears in the same snapshot; an applicant stage change survives the read model                                                                                                               |
| `repository.test.ts`       | The browser fallback is selected without a native host; each desktop write maps to its Rust command with camelCase arguments and the signed-in session token; bulk AutoRoster apply is one command; preview cancellation promotes the next eligible waitlist candidate; preview writes stay in one snapshot; a preview snapshot restores the workflows and records the restore; unknown or malformed snapshots are refused; preview snapshots are capped at the twenty newest |
| `MissionControl.test.tsx`  | Renders the `h1`, 91 % and 418, the missing driver, the seven-row chart table, and no serious/critical axe violations                                                                                                                                                                                                                                                                                                                                                         |
| `HelpPage.test.tsx`        | Renders both role journeys, the keyboard reference and a working route link, with no serious or critical axe violations                                                                                                                                                                                                                                                                                                                                                       |
| `CustomReportPage.test.ts` | Groups report rows by ISO date and orders the trend axis chronologically, even when the ledger arrives out of order                                                                                                                                                                                                                                                                                                                                                           |
| `accessibility.test.tsx`   | Mounts every registered route, waits for its content, and runs axe on each one; fails on serious or critical ARIA, landmark, list, or control violations                                                                                                                                                                                                                                                                                                                      |
| `print.test.tsx`           | Mounts all 43 registered routes and asserts each renders content; the certificate sets `body[data-print-view="verification"]` only while mounted and clears it on unmount; the impact report renders its printed sections without that gate; the certificate's print-hiding selector is scoped to that attribute                                                                                                                                                              |

The axe suite disables the `color-contrast` rule because jsdom cannot compute composited
colours. Colour is verified in a real engine instead:

```bash
pnpm dev               # leaves the app on localhost:5173
pnpm audit:contrast    # headless Chrome, all 43 routes, light + dark
```

`scripts/audit-contrast.mjs` launches headless Chrome over the DevTools protocol, walks every
element that draws text, composites it over its ancestor background stack, and fails the run
for anything under 4.5:1 (3:1 for large text). It sets both themes per route and writes a
report with selectors, colours, and ratios. The last run reported no violations outside
photography, where the background cannot be computed; those panels were checked visually.
The token decisions behind the result are recorded in [VISUAL_QA.md](VISUAL_QA.md).

`scripts/audit-print.mjs` (`pnpm audit:print`) is the print counterpart. It starts a private
Vite server unless `--base` is given, renders `/volunteer/verification` and
`/coordinator/reports/preview` under print media in headless Chrome, asserts each surface is
visible with its text and at least eight visible text nodes, and renders a PDF that must
exceed 12 kB (a blank page prints about 1.3 kB). It exits non-zero on a hidden surface, lost
phrasing, or a blank PDF. `scripts/verify.sh` runs it with `--best-effort`, which skips only
when no Chrome binary is installed. The suite in `src/app/print.test.tsx` guards the same
contract without a browser.

`scripts/audit-accessibility-tree.mjs` (`pnpm audit:a11y`) is the screen-reader-facing
check. It enables Chromium Accessibility, navigates all 43 routes with the preview tokens,
reads the full accessibility tree, and fails when a route has no `main` landmark, no level-one
heading, or an interactive control with no accessible name. The last run passed 42/42.
`scripts/audit-zoom.mjs` (`pnpm audit:zoom`) emulates a 1600 × 1000 window at 200% browser
zoom (an 800 × 500 CSS viewport), loads every route, and fails on horizontal overflow or a
lost heading. The last run passed 42/42. Both scripts start a private Vite server when
`--base` is absent and accept `--best-effort` for machines without Chrome.

## Browser checks (Vite preview, 1600 × 1000)

Exercised in the running app, not inferred from a successful build. The preview uses the
fallback repository, which mirrors the same snapshot contract.

1. **Volunteer browse and save.** Opened `/volunteer/discover`, saved Community Food
   Distribution, and saw the shortlist count change from 4 to 5. Local storage gained
   `opp-food`, the audit log gained `opportunity.save`, and `/volunteer/saved` listed it.
2. **Kiosk → attendance.** Opened `/coordinator/kiosk`, selected Maya C., read the current
   six-digit code from the kiosk, submitted it, and saw the success state.
   `/coordinator/attendance` then showed Maya as checked in and the attendance ring at 75%
   (three of four seats).
3. **Live roster.** Opened `/coordinator/shifts/sh-sat-food`, promoted Finn Kaur from the
   waitlist, and saw the row switch to `Promoted`, Finn appear on the roster as Confirmed,
   and the audit event `waitlist.promote` written.
4. **Hours review.** Approved Darius Rossi's pending request; the queue dropped from seven
   to six, the approved total showed 6h 53m, and the audit event recorded 413 minutes.
5. **Recruitment.** Moved Renée Alvarez from Applied to Review; Applied fell from three to
   two, Review rose from two to three, and the new stage survived the read model.
6. **Settings persistence.** Changed the organization name in `/coordinator/settings`, saved,
   reloaded, and read the saved value back from both the form and local storage. The change
   also appeared in the audit log.
7. **Audit.** `/coordinator/audit` showed the save, check-in, waitlist promotion, hours
   approval, stage move, and settings update as attributed events at the demo clock.
8. **Backup and restore.** On `/coordinator/backup`, created a manual snapshot (195 rows,
   6 KB), saved Community Food Distribution on Discover (Saved 4 → 5), returned, armed
   Restore, and confirmed. The page reported 195 rows restored with a safety snapshot kept;
   Discover read Saved (4) again and Audit listed `backup.restore` with the safety id.
9. **All 43 routes.** Captured at 1600 × 1000, checked for console errors, failed images,
   blank renders, missing `h1`/`main` landmarks, and horizontal overflow. All 42 rendered
   primary content with no console errors and no failed images. The sweep found one missing
   favicon request, two standalone setup pages without a `main` landmark, and one live-roster
   hero using `h2`; those were fixed and the sweep re-ran clean. The defect and correction
   list is in [VISUAL_QA.md](VISUAL_QA.md).

## Native host

On 2026-10-24 the native window is automated on macOS with WebdriverIO and
`tauri-plugin-wdio-webdriver`. The plugin embeds a W3C WebDriver server in the debug build,
so no external `tauri-driver` or accessibility permission is required. The suite runs against
a throwaway `CIVICFLOW_DATA_DIR` and clears the WebKit storage directory first.

```bash
pnpm build:native:test   # debug app with the embedded WebDriver server
pnpm test:native         # 5 scenarios, about 3 minutes
```

The recorded run passed five scenarios in the real window:

1. the sign-in screen appears when no session exists;
2. the coordinator signs in and reaches Mission Control with “Praket” in the greeting;
3. a coordinator who navigates to `/volunteer/home` is returned to Mission Control;
4. sign-out returns to the sign-in form, the volunteer signs in, and volunteer home renders;
5. a volunteer who navigates to `/coordinator/coverage` is returned to volunteer home.

The suite is part of `.github/workflows/ci.yml` on `macos-latest`. It covers a real sign-out,
session persistence, route guards, and the render path of both roles. It does not click a
camera permission dialog or exercise the QR scanner with a physical camera; the payload
format and validation are covered by `tests/checkin_qr.rs`.

Earlier runs also started `pnpm tauri dev` against an existing Vite server, migrated a v1
database to the current schema, and drove every workflow command through a temporary
in-webview harness. That harness was removed; the WebdriverIO suite replaced it.

## Live desktop database

`pnpm db:verify` opens the app-data file created by the running desktop app in SQLite
read-only mode. It does not write, reset or migrate anything. Run on 2026-10-24 against
`~/Library/Application Support/org.feedmore.civicflow/civicflow.db`:

```text
CivicFlow database
  integrity       ok
  schema          v3 (3 migrations)
  foreign keys    ok
  tables          31/31
  records
    volunteers     82
    opportunities  8
    shifts         15
    hourEntries    62
    auditEvents    39
    backups        1
Database verification passed.
```

The file grows through WAL until a checkpoint, so its byte size is not the record size. The
check reads through the WAL and validates the live schema, not a copy. The Rust integration
suite is the write-side proof: `data_survives_close_and_reopen` and
`every_workflow_write_survives_reopen` perform real workflow writes, close the connection and
reopen the same file before asserting the rows and audit trail.

## Workflow read-back

After the native harness, the app-data database again showed `FeedMore WNY`, four saved
opportunities, no attendance or registrations, and the default 180-minute shift length. The
native window stayed open on the restored snapshot; no test rows were left behind.

## Backup restore through the running app

The debug app (`pnpm tauri build --debug --no-bundle`) was launched against app-data SQLite
with a temporary bundled harness. The harness called the same `WorkspaceRepository` methods
the Backup page calls, so the Tauri IPC bridge and the Rust commands ran, not a browser fallback:
`create_backup`, `set_saved_opportunity`, `update_workspace_settings`, `restore_backup`, and
`get_workspace_snapshot`. Window automation was not used: macOS had refused assistive access
in the earlier pass, and no click-through is implied here.

Direct `sqlite3` inspection showed the target snapshot with `FeedMore WNY`, four saved
opportunities, 180-minute shifts, and no restore event. The pre-restore safety copy held the
changed state: three saved opportunities and 240-minute shifts. After restore, the live
database matched the target, and `audit_events` held one `backup.restore` row naming both the
target and the safety snapshot. The harness was removed, the app rebuilt and launched again
without it, and the app data deleted and reseeded; the clean launch wrote `FeedMore WNY`, four
saved opportunities, no attendance or registrations, 180-minute shifts, eleven audit rows, and
one initial automatic snapshot, with an empty stderr log.

## Rust

```bash
cd src-tauri/core
cargo test      # 62 tests: 18 unit + 44 integration
cargo clippy --all-targets -- -D warnings
cargo fmt --check
cd ..
cargo check     # Tauri shell compiles
```

| Suite                 | What it proves                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `domain` unit tests   | Coverage percentages; attention ordering and severity; 75 % threshold; weekly sums; date filtering                                                                                                                                                                                                                                                                                                                                                                                 |
| `matching` unit tests | Flow solver fills more than a greedy pass; mandatory roles win scarce candidates; one assignment per candidate-day; required skill and capacity gates; deterministic ordering; a brute-force oracle on a known case; 48 proptest cases against the oracle; 500-candidate/100-slot performance gate within five seconds                                                                                                                                                             |
| `reports` unit tests  | Report validation, field allow-list, CSV escaping, PDF structure, and empty-report exports                                                                                                                                                                                                                                                                                                                                                                                         |
| `tests/workspace.rs`  | Migration idempotence; 82 / 8 / 15 / 80 / 3 counts; foreign keys; 91 % role coverage; 14 upcoming shifts; Saturday-first attention; notification audit and persistence; data survives reopen; impossible writes rejected                                                                                                                                                                                                                                                           |
| `tests/workflows.rs`  | Snapshot seeds every workflow owner; saved toggle; application stage and validation; check-in/out/no-show; waitlist promotion; hours approval and rejection rules; settings validation and persistence; created program survives reopen; registration and profile updates; every write and audit event survives reopen; reset restores the seed                                                                                                                                    |
| `tests/lifecycle.rs`  | Cancellation promotes the first eligible waitlist candidate and notifies; an approved AutoRoster plan applies as one audited write; Maya → Iris cancellation, check-in, check-out, approved hours, and a verification record all survive a reopen                                                                                                                                                                                                                                  |
| `tests/reports.rs`    | Participation, coverage, retention, skills, impact, and custom reports derive from stored rows; date validation and unknown templates are refused; CSV and PDF exports are non-empty                                                                                                                                                                                                                                                                                               |
| `tests/backups.rs`    | A SQLite snapshot captures the database; after several workflow writes, restore returns every workflow to the snapshot point and audits the restore with the safety snapshot; foreign, corrupt, incomplete, wrong-schema, unknown, and traversal ids are refused without touching the workspace; retention keeps the newest twenty and still restores the oldest retained snapshot                                                                                                 |
| `tests/auth.rs`       | Sign-in rejects a wrong password and accepts a case-insensitive email; sign-out and password reset revoke sessions; a volunteer cannot list accounts, reset a password, or call the coordinator guard; a volunteer snapshot excludes applications and audit events and contains only that volunteer's attendance, decisions, registrations, waitlist, credentials and verifications; notifications are scoped by audience and volunteer, and another audience cannot mark one read |
| `tests/checkin_qr.rs` | A scanned `civicflow://checkin/<token>` payload checks a volunteer in; the six-digit code also works; a token issued for another shift and a forged token are refused                                                                                                                                                                                                                                                                                                              |

## Known limitations

- The native suite drives the real window on macOS, but the CI job runs only on macOS.
  Windows and Linux packaging is handled by the release workflow; their UI is not yet in a
  native E2E matrix.
- Print output for Service Verification and Impact Report is only checked in Chromium.
- jsdom axe covers every registered route. It does not evaluate colour contrast; the
  Chromium audit covers that in both themes.
- The accessibility-tree audit proves structure and names, not whether a spoken
  announcement makes sense. A human VoiceOver or NVDA pass is still required.
