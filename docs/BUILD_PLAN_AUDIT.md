# CivicFlow build-plan audit

Audited 2026-10-23 against all ten phases in `docs/build-plan/`, the 42-screen spec,
and the non-negotiable engineering rules. This is an assessment only: no feature code
was changed. The temporary probe used to exercise the Rust boundary was removed.

> **Status update, 2026-10-24.** Several findings below have since been fixed: local
> accounts and role enforcement, QR check-in, native WebdriverIO coverage, automated
> accessibility-tree and 200% zoom audits, and packaged macOS plus cross-platform release
> builds. The audit is kept as the record of the 23rd; see
> [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for the current state.
>
> **Read the counts as of 2026-10-23.** Every number in this document describes the tree on
> that date (42 routes, 17 tables, 65 frontend and 30 Rust tests). The current tree has 50
> routes, a 32-table schema at version 6, 180 frontend tests and 71 Rust tests. The findings
> are the record; [TESTING.md](TESTING.md) is the live gate.

## Verdict

**No. CivicFlow is not finished against the build plan.**

The screen layer is essentially complete: all 42 registered routes resolve to real screens, the
design system is coherent, `pnpm verify` is green, and there are working SQLite writes,
audit events, backups and restores. That is a strong competition demo surface.

The plan's engineering spine is not complete. Three phases miss their defining outcome
(6, 7 and 10), and the remaining seven are partial. Most importantly:

- AutoRoster is a client-side greedy picker, not the planned Rust min-cost max-flow
  optimizer, and has no invariants, brute-force oracle, property tests or benchmark.
- The Rust core does not enforce registration eligibility, capacity or timing.
- The service lifecycle stops at check-out: no hours request is created, no verification
  record is issued, no notification is generated, and cancellation/recovery does not exist.
- Several rubric-facing numbers are synthesised in the frontend rather than stored:
  credentials, attendance, retention cohorts, meals and families served.

For a rubric that rewards a real domain engine and verified data, these are not polish
items. They are the evidence the plan asks the project to demonstrate.

## Scorecard

| Phase                        | Outcome                                                           | Status      | Main gap                                                                                           |
| ---------------------------- | ----------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------- |
| 1. Repository and foundation | Tauri/React/Rust repo with deterministic gates, clean history, CI | Partial     | No commits or tags, no `.github/`, no E2E, no release build, no toolchain pins                     |
| 2. Data foundation           | Normalised schema, migrations, typed errors, rich seed            | Partial     | 17 tables instead of the planned ~30; string errors; seed edge cases missing                       |
| 3. Design system             | Tokens, shell, primitives, 42 routes, a11y baseline               | Partial     | Half the primitives are page-local; per-primitive tests and manual viewport pass incomplete        |
| 4. Volunteer core            | Onboarding → discovery → save/register → schedule → hours         | Partial     | No registration state machine or backend validation; impact outcomes synthesised                   |
| 5. Coordinator ops           | Programs, recruitment, credentials, schedule, coverage            | Partial     | Credentials are derived UI data; no stage history, role requirements or assignment validation      |
| 6. AutoRoster                | Rust min-cost max-flow, explainable, proven optimal               | **Not met** | Greedy frontend scoring only; no flow, oracle, proptest or benchmark                               |
| 7. Service lifecycle         | Cancellation → waitlist → check-in → hours → verification         | **Not met** | No cancellation engine, QR/token, authoritative check-in, hours generation or verification records |
| 8. Reporting and records     | Rust reports, CSV/PDF, impact, retention, audit, backups          | Partial     | Reports/exports are frontend; impact and retention are synthetic; no PDF renderer or checksum      |
| 9. Hardening                 | Threat model, window permissions, E2E, CI, performance            | Partial     | No E2E, CI, SECURITY/ACCESSIBILITY docs, benchmarks or kiosk isolation                             |
| 10. Release                  | Documentation set, rubric map, demo, release tags                 | **Not met** | Eight required docs missing; no tags, release bundle, presentation or rubric evidence              |

No phase currently meets its full definition of done.

## Phase findings

### Phase 1 — Repository and engineering foundation

**Exists**

- Tauri 2, React 19, TypeScript, Vite, pnpm, Rust core crate, SQLite through `rusqlite`.
- Typecheck, lint, format, Vitest, web build, `cargo fmt`, Clippy and `cargo test` are
  wired into `scripts/verify.sh`, and the whole command passes.
- The repository has the expected `src/`, `src-tauri/`, `docs/`, `shared/` layout.

**Missing**

- The repository has **no commits at all** (`git log` reports no commits). All phase tags
  (`phase-02-data-foundation` … `v1.0.0`) and the "clean Git history" outcome are absent.
- No `.github/workflows/ci.yml`; the Phase 1 CI gate and Phase 9 matrix do not exist.
- No `.node-version` or `rust-toolchain.toml`.
- `scripts/verify.sh` does not build the native app. No release bundle exists under
  `src-tauri/target/release/bundle`, so the "release build launches" gate is unproven.
- No `tests/e2e/` directory or WebdriverIO setup.

### Phase 2 — Architecture, database, migrations and demo data

**Exists**

- Tracked migrations with `schema_migrations`, foreign keys, an initial schema and a workflow
  migration.
- Deterministic seed, integrity/foreign-key health checks, in-memory and temp-file tests,
  idempotent seeding and reopen tests.
- Thin Tauri commands over a separate core crate.

**Missing**

- The schema is materially smaller than the plan's starting model. It has 17 tables; the
  plan calls for users, volunteer profiles, credential types/instances, availability rules,
  role skill/credential requirements, assignments, service verifications, impact metric
  definitions/results, report saved views and backup snapshots. Current stand-ins:
  - skills and availability live in JSON columns on `volunteers`;
  - roles live in `shift_roles` with no requirement tables;
  - credentials do not exist in SQLite at all;
  - verification IDs are seed strings on `hour_entries`;
  - impact is a single `impact_totals` row, not metric records.
- `CoreError` carries strings, and IPC returns `Result<T, String>`. The planned structured
  error (`code`, `field`, `action`) is not implemented, so the frontend cannot branch on
  `SHIFT_TIME_CONFLICT` or offer `FIND_REPLACEMENT`.
- Demo breadth is short of the plan: 8 opportunities (plan: 15–20), 15 shifts (plan: 30–50).
  Underage, expired-credential, inactive and no-history edge cases are absent; age and
  credential expiry cannot even be represented.
- No documented ADRs for the schema reductions. `docs/DECISIONS.md` covers other choices.

### Phase 3 — Design system, shell and accessibility baseline

**Exists**

- Central tokens, bundled Geist/Source Serif fonts, coordinator/volunteer/public shells,
  route metadata, command palette, skip link, labeled controls, text+icon statuses,
  reduced motion, high contrast, text scaling and chart tables.
- All 42 registered screens are built; the route registry has 42 views plus a fallback.
- Contrast and print audits run against real Chromium; the print audit is part of `verify`.

**Missing**

- The planned primitive set is incomplete as shared primitives. `Button`, `Card`, `Badge`,
  `Avatar`, `Tabs`, `DataTable`, `Form`, `Page` and `Charts` exist; `Dialog`, `Popover`,
  `Tooltip`, `PersonChip`, `Metric`, `FilterToken`, `PhotoCard`, `ErrorNotice`, `Toast`,
  `Inspector`, `Drawer`, `CoverageMeter` and `SmartExplanation` are not reusable components.
  Pages solve these patterns locally.
- The gate "each primitive has behavioral tests" is not met. There are 65 frontend tests,
  but 45 are route/print checks; only Mission Control has an axe check. Command-palette
  keyboard behavior, focus restoration, dialogs and tables have no focused tests.
- The manual visual gate is incomplete by the project's own notes: 1600×1000 is reviewed,
  1280/1024 and 125% text are not fully swept, and WebKit print output is still manual.

### Phase 4 — Volunteer experience and core CRUD

**Exists**

- Onboarding saves skills and availability through the core in a transaction, then audits.
- Discovery, detail, saved shortlist, schedule, hours and personal impact screens exist.
- Saved opportunities are persisted and idempotent.

**Missing**

- `register_for_shift` performs no semantic validation: no shift window, active-volunteer
  check, duplicate policy, time-overlap check, age check, credential check, capacity check
  or waitlist decision. It simply upserts a registration.
- The registrations table has no status, so the explicit `registered / waitlisted /
canceled / completed / no_show` state machine does not exist.
- Registration does not update `shifts.confirmed` or `shift_roles.filled`. Coverage,
  capacity and Mission Control continue to read the seeded counts, so the required
  cross-screen capacity update does not happen.
- Discovery filtering and matching run over the bundled snapshot in the browser, not a
  Rust `OpportunitySearch` query.
- Age and credential-expiry validation are impossible with the current schema.
- Personal impact is not computed from stored impact outcomes: meals and families are
  `hours × 18` and `hours × 0.6`. This is exactly the "hours do not equal people served"
  rule the plan forbids.
- No rollback test proves the onboarding transaction leaves no partial profile.

### Phase 5 — Coordinator operations and scheduling

**Exists**

- Organization setup persists name, contact and timezone with validation.
- Recruitment stages are persisted and audited; schedule, program management, coverage,
  live roster, hours review and plain-language opportunity planning are present.
- Coverage is split into seat and role coverage and documented in `COVERAGE_HEALTH.md`.

**Missing**

- Credentials are fabricated in `src/lib/workspace/selectors.ts`: a credential is invented
  for every sixth volunteer with an expiry computed from the volunteer's array index. There
  is no credential type/instance table and no verification workflow. The Credentials screen
  is therefore a display of generated data, not persisted records.
- No `volunteer_stage_history`; stage changes overwrite the application row.
- No role skill/credential requirements, so eligibility cannot be evaluated against a role.
- No assignment-preview command; the UI assigns directly and the core never rejects
  overlap, unavailability, missing skill or expired credential.
- No backend tests for the plan's semantic validation suite (recurrence, overlap, expired
  credential, age, skill, availability, assignment preview).
- Recurring shift generation is not exposed as a creation option.

### Phase 6 — AutoRoster and coverage intelligence

**Not met.** This is the plan's technical centerpiece.

- The optimizer is implemented in `src/features/coverage/AutoRosterPage.tsx`, in
  TypeScript. The Rust crate has no `matching/`, eligibility, scoring, flow or explain
  module.
- `suggestedPlan` walks each gap and takes the highest-scoring remaining candidate. That is
  a greedy per-gap heuristic, not a whole-roster min-cost max-flow assignment.
- There is no role-slot graph, residual network, objective priority, lexicographic penalty
  or global optimum proof.
- Eligibility is a small frontend predicate (`roleEligible`) using skills/languages; it does
  not check age, credential validity, maximum concurrent assignments, mandatory role
  requirements or role capacity.
- There are no invariants, hand-calculated cases, greedy-failure case, brute-force oracle or
  `proptest` suite.
- There is no benchmark for 100/250/500 volunteers; `MATCHING_ENGINE.md` does not exist.
- Applying a plan fires one registration/promotion command per candidate. Registrations are
  serialized by the session queue, but there is no single transaction and no capacity check,
  so a full shift can be overfilled.

### Phase 7 — Attendance, waitlist recovery, hours and verification

**Not met.**

- **Cancellation/recovery is absent.** No UI action cancels a registration, and no core
  service performs the required transaction: cancel → recalculate coverage → find the
  unfilled role → inspect waitlist order → promote/notify. The `auto_promote_waitlist`
  setting is stored but never read by a workflow.
- **Check-in is not authoritative.** The kiosk compares a hard-coded `DEMO_CODE = "481276"`
  in the browser. The Rust `check_in` command takes no code and does not check shift
  eligibility, start time or registration. A probe confirmed a volunteer can be registered
  onto a **full 20/20 shift**, then checked in **11 days before** it, with no code and no
  timing check.
- **QR is decorative.** `CheckInPage` draws a fixed module grid; there is no
  `civicflow://checkin/<token>` payload, signing or backend token validation. The kiosk's
  "Show QR code" control cannot scan.
- The kiosk claims the code "rotates every 15 minutes"; it never rotates.
- **Hours are not produced by attendance.** Check-out records a timestamp but creates no
  hour entry, no calculated duration and no requested minutes. The hours queue is entirely
  seeded data, so the promised lifecycle ends at check-out.
- **Verification records are absent.** There is no `service_verifications` table, no issued
  code, range, issuer or issued timestamp. Approved entries keep their seeded
  `verification_id`; a newly approved entry gets none and never appears on the certificate.
- **Notifications are not generated.** Workflows append audit events but never insert
  notification rows. `WAITLIST_PROMOTED`, `HOURS_APPROVED`, `SHIFT_CHANGED` and the rest
  exist only as seeded examples. The UI promises a notification on hours approval anyway.
- Attendance is one mutable row per shift/volunteer, not the planned event ledger with
  `manual_check_in`, late, correction and no-show events.
- The roster itself is partly synthetic: `getRoster` fills `shift.confirmed` seats with
  hash-selected volunteers and invents checked-in timestamps and statuses for demo day.
  Attendance and live-roster screens therefore show states that were never persisted.
- No E2E test automates the required Maya → Jordan → hours → verification scenario.
- No cross-page integration tests cover check-in or approval propagation.

### Phase 8 — Reporting, impact, audit, backup and recovery

**Exists**

- A central `append_audit` helper, audit screen, actor/entity filters and CSV.
- SQLite online backup API, validate-on-preview, safety backup before restore, restore
  audit, rotation and demo reset.
- Unified records screen over real rows; saved-view filters from the seed.

**Missing**

- No Rust report services. Participation, coverage, attendance, retention, skills, impact
  and custom reports are aggregated in `selectors.ts`/React over the snapshot.
- CSV export is built and downloaded in the browser with a Blob anchor. It does not use the
  Tauri dialog plugin or write through Rust, so the save-dialog/canceled-save behavior and
  path handling required by the plan are absent.
- PDF export is browser print-to-PDF (Chromium audited, WebKit untested). There is no Rust
  PDF renderer or file output, which the plan explicitly requires.
- Impact metrics are not stored per opportunity/shift. The organization totals are one
  seeded row; volunteer impact meals/families are arithmetic estimates.
- Retention is fabricated: `getRetentionRows` returns `18 + (index * 7) % 26` eligible and
  `58 + (index * 13) % 23` percent returned, not a cohort calculation. `METRICS.md` does not
  exist, so the denominator rule is undocumented.
- Backup metadata has no SHA-256, schema version or integrity result in the snapshot model;
  `BackupSnapshot` exposes only id, time, kind, bytes, rows, note and counts.
- Audit events have no before/after payload, only a summary string.
- Saved views are seeded constants, not persisted user filters.
- No report/impact/retention test suite. The existing Rust tests cover backup and workflows,
  not report totals, CSV escaping or retention cohorts.

### Phase 9 — Hardening, security, accessibility, E2E and CI

**Exists**

- Strict-ish CSP without remote scripts; bundled fonts and images; only `core:default`
  capability on the main window.
- Contrast sweep in Chromium, print audit, reduced motion, high contrast, text scaling,
  keyboard styling and semantic landmarks.
- Failure tests for invalid/corrupt backups and impossible DB writes.

**Missing**

- No `docs/SECURITY.md`, threat model, logging policy or structured logging. There are no
  log statements in the Rust core.
- No kiosk window with reduced capabilities; kiosk is a route in the same window as the
  coordinator shell. The capability file grants one window.
- CSP still allows `http://localhost:5173` and its WebSocket in the shipped configuration.
- No native E2E (WebdriverIO/Tauri) at all; native clicks were only done manually.
- No CI workflow or platform build matrix.
- No performance measurements for cold start, Mission Control, search, AutoRoster, reports
  or backups.
- No `docs/ACCESSIBILITY.md` recording supported features, manual date and limitations.
- Failure injection is partial: no read-only data directory, missing DB, failed PDF
  destination, long/Unicode data or large-text tests.
- No coverage evidence organized around the required behavioral areas.

### Phase 10 — NLC release, documentation and presentation

**Not met.**

- Required docs present: `ARCHITECTURE.md`, `COVERAGE_HEALTH.md`, `TESTING.md`,
  `OPEN_SOURCE_CREDITS.md`, `ENVIRONMENT.md`, `DECISIONS.md`.
- Required docs missing: `DATA_MODEL.md`, `MATCHING_ENGINE.md`, `METRICS.md`,
  `SECURITY.md`, `ACCESSIBILITY.md`, `USER_GUIDE.md`, `RUBRIC_MAP.md`, `DEMO.md`.
- README test counts are stale (says 19 frontend / 29 Rust; actual is 65 frontend /
  30 Rust). It claims all 42 surfaces are implemented, which is true, but does not surface
  the synthetic metrics or missing engine.
- No 7-minute presentation, source-code walkthrough, judge Q&A, competition-machine
  rehearsal or emergency kit.
- No release tag, versioned bundle or `v1.0.0-nlc-rc`; no `git tag` at all.

## Non-negotiable rules

| Rule                                                | Status       | Evidence                                                                                                                  |
| --------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Never move on with red tests                        | Met today    | `pnpm verify` exits 0; 65 frontend and 30 Rust tests pass                                                                 |
| No fake UI                                          | **Not met**  | Generated credentials; synthetic roster/attendance; fixed check-in code; inert auto-promote setting; notification promise |
| Rust owns authoritative rules                       | **Not met**  | Registration and check-in accept invalid states; AutoRoster scoring in TypeScript                                         |
| Every write testable and auditable                  | Partial      | Workflow writes audit; AutoRoster bulk apply is multi-call, no transaction; no report/verification writes                 |
| Every complex feature has a deterministic demo case | Partial      | Fixed demo code and seed help; cancellation, verification and hours generation cases do not exist                         |
| No internet dependency                              | Met          | Fonts/images bundled, local data, no runtime network calls                                                                |
| References are targets, not fixed heights           | Met          | Pages scroll; shell constrained                                                                                           |
| No major features after Phase 8                     | Not followed | Phases 6–7 features are still missing, while later polish was added; no phase gates existed                               |

## What is genuinely strong

- **42/42 screens exist and are visually coherent.** The design tokens, shells and route
  metadata are consistent; this is not a placeholder-heavy prototype.
- **The verification workflow is real.** `bash scripts/verify.sh` passes typecheck, lint,
  format, 65 frontend tests, web build, headless print audit, Clippy and 30 Rust tests.
- **Backup and restore are thoughtfully built.** Online backup API, integrity validation,
  pre-restore safety snapshot, restore audit and rotation are better than typical student
  projects.
- **Auditability is consistent for implemented writes.** Each workflow command validates
  its transition, writes SQLite and appends an audit event in one path.
- **Accessibility is a first-class concern** in the shell and charts, even though the
  documentation and automated coverage are incomplete.
- **Offline behavior is credible.** Bundled assets and local SQLite make the demo
  network-independent.

These are worth protecting while the plan gaps are closed.

## Recommended closing order

1. **Stop calling it feature-complete.** Record the current state honestly in README and
   IMPLEMENTATION_STATUS so the demo does not promise verification, notifications or
   AutoRoster behavior that is not there.
2. **Build the AutoRoster core in Rust** (eligibility, scoring, role slots, min-cost flow,
   explanation, invariants, brute-force oracle, proptest, benchmark). This is the largest
   rubric differentiator.
3. **Make the Rust boundary authoritative** for registration and check-in: capacity, shift
   window, duplicate, overlap, active status, role requirements, credential dates and
   one-time check-in codes. Add the missing state machine and event ledger.
4. **Complete the service lifecycle**: cancellation → deterministic waitlist recovery →
   notifications → check-out creates a requested/calculated hours entry → approval assigns
   a verification record. Automate the plan's Maya/Jordan E2E as a core integration test.
5. **Persist the remaining rubric data**: credentials, role requirements, impact outcomes,
   retention cohorts and saved views. Delete the generated substitutes.
6. **Move report generation and CSV/PDF output into Rust**, add checksum metadata to
   backups, and record the retention formula in `METRICS.md`.
7. **Create the evidence layer**: initial commit, phase tags, CI, native E2E, performance
   measurements, SECURITY/ACCESSIBILITY docs, RUBRIC_MAP/DEMO and the release build.
8. **Correct the docs** to match reality and re-run `pnpm verify` after every step.

## How this audit was checked

- Read all ten build-plan phases and the 42-screen specification.
- Inspected the Rust schema, migrations, services, workflows, backups, Tauri commands,
  capabilities and CSP.
- Inspected the frontend route registry, selectors, session layer, AutoRoster, kiosk,
  verification, reports, credentials, retention, records and settings.
- Ran `bash scripts/verify.sh`: exit 0.
- Ran a temporary Rust probe against the core: it confirmed (a) a registration is accepted
  for a full 20/20 shift, (b) the confirmed count stays at 20, and (c) check-in succeeds 11
  days before the shift with no code and no timing check. The probe was deleted afterwards.
- Confirmed `git log` has no commits and no CI, E2E or release bundle exists.
