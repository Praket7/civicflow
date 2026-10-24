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

# Phase 7 — Attendance, Check-In, Waitlist Recovery, Hours, and Verification

## Outcome

Turn scheduled service into verified participation.

Complete:

```text
registration
→ cancellation/recovery
→ check-in
→ attendance
→ check-out
→ hours
→ review
→ verification
```

This phase is important because it proves CivicFlow is a connected operational system, not a collection of screens.

---

## 1. Waitlist model

Waitlist entries need:

```text
volunteer
shift
created_at
priority/order
status
```

Statuses:

```text
waiting
promoted
declined
expired
removed
```

Ordering must be deterministic.

If policy is FIFO:

```text
created_at
then stable ID tie-break
```

If requirements matter, FIFO is the search order, but ineligible candidates are skipped.

---

## 2. Cancellation recovery engine

Implement event-driven service logic.

On confirmed cancellation:

1. transaction marks registration canceled
2. coverage recalculates
3. identify newly unfilled role(s)
4. inspect waitlist in order
5. find first eligible candidate for required role
6. promote if found
7. otherwise request SmartMatch candidates
8. create notification/audit records
9. commit

Do not perform pieces as unrelated frontend API calls.

One backend transaction/service orchestration prevents partial state.

---

## 3. Notifications

Create domain notification types:

```text
WAITLIST_PROMOTED
SHIFT_CHANGED
SHIFT_CANCELED
HOURS_APPROVED
HOURS_ADJUSTED
CREDENTIAL_EXPIRING
COVERAGE_REQUEST
```

Notifications are stored locally.

A notification contains:

```text
title
body
entity link
priority
created_at
read_at
action kind
```

---

## 4. Check-in code

For competition mode:

- generate random numeric event code
- store only active code metadata
- expiration/rotation time
- validate shift is currently check-in eligible

Do not use a single hardcoded code.

You can keep demo mode deterministic through a fixed seed or special demo code that is clearly documented.

---

## 5. QR check-in

QR payload should not contain sensitive volunteer information.

It can encode:

```text
civicflow://checkin/<short-lived-token>
```

Backend validates token.

Manual event code provides fallback when camera/QR scanning is unavailable.

The demo cannot depend on camera permissions to succeed.

---

## 6. Attendance events

Store events rather than only final status:

```text
check_in
check_out
manual_check_in
manual_check_out
marked_late
marked_no_show
correction
```

Then derive summary:

```text
checked_in
completed
late
no_show
```

This improves auditability.

---

## 7. Hours calculation

Do not simply trust submitted number.

Possible system-calculated duration:

```text
checkout - checkin
```

Round according to a documented policy.

Store:

```text
calculated_minutes
requested_minutes
approved_minutes
status
reviewer
reviewed_at
reason
```

Use integer minutes internally, not floating-point hours.

Convert for display:

```text
195 minutes = 3h 15m
```

This avoids floating precision bugs.

---

## 8. Hours review

Coordinator sees:

```text
requested
scheduled
attendance evidence
volunteer explanation
```

Actions:

```text
approve
adjust
reject
```

Every decision writes an audit event.

Adjusted hours require a reason.

---

## 9. Service verification

Generate a unique verification record:

```text
verification_code
volunteer
organization
date range
total verified minutes
issued_at
issued_by
```

Verification must be generated from **approved** hours only.

Never calculate directly from unreviewed attendance.

---

## 10. Cross-page consistency

After check-in, all of these update:

```text
Attendance
Live Roster
Volunteer Detail
Recent Activity
Mission Control
```

After hours approval:

```text
My Hours
Personal Impact
Volunteer Detail
Reports
Organization Impact
```

Design integration tests specifically around this.

---

## 11. Tests

### Waitlist

```text
FIFO
ineligible candidate skipped
promote correct candidate
full shift blocks promotion
duplicate waitlist rejected
cancel promoted volunteer triggers next candidate
```

### Attendance

```text
invalid code
expired code
too-early check-in
duplicate check-in
checkout before check-in rejected
manual correction
no-show
```

### Hours

```text
integer minute math
overnight shift
DST boundary
requested vs calculated
approve
adjust with reason
reject
```

### Verification

```text
only approved hours
stable total
unique verification code
regeneration policy
```

---

## 12. Debugging

If hours differ:

inspect raw timestamps and timezone conversion before UI formatting.

If waitlist promotion seems wrong:

log each candidate:

```text
position
eligible yes/no
reason
role fit
```

If dashboard count is stale:

verify transaction committed before query invalidation.

---

## 13. E2E scenario

Automate:

```text
Maya registered
→ Maya cancels
→ Jordan promoted
→ Jordan checks in
→ Jordan checks out
→ calculated hours appear
→ coordinator approves
→ volunteer hours update
→ verification generated
```

This one test proves a large portion of the app.

---

## 14. Definition of done

No manual database edits are required to complete the entire service lifecycle.

Tag:

```bash
git tag phase-07-service-lifecycle
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
