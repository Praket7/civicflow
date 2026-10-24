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

# Phase 5 — Coordinator Operations, Opportunities, Scheduling, and Recruitment

## Outcome

The coordinator can now manage the volunteer program:

```text
organization
volunteers
recruitment
opportunities
shifts
roles
requirements
credentials
schedule
```

Coverage is calculated, but the optimization engine waits for Phase 6.

---

## 1. Organization setup

Implement create/update:

```text
organization name
mission
cause areas
location
timezone
contact
image metadata
```

Store media paths or app-owned asset identifiers, not raw base64 images in normal table fields.

Validate:

```text
timezone
required organization name
URL format
contact email
```

---

## 2. Recruitment pipeline

Use explicit applicant stages:

```text
applied
review
onboarding
active
inactive
rejected
```

Keep history:

```text
volunteer_stage_history
```

Do not overwrite without trace.

Activation checks:

```text
required profile complete
mandatory waiver/training complete if configured
required age information present
```

The UI can drag cards between columns, but Rust decides whether the transition is allowed.

---

## 3. Credentials and skills

Create reference tables:

```text
credential_types
skills
```

Volunteer credential:

```text
issued_at
valid_from
valid_through
identifier
verified_at
verified_by
notes
```

Credential expiry queries should use shift date.

Build "expiring soon" as:

```text
today <= valid_through <= today + configurable window
```

---

## 4. Create Opportunity

Backend transaction:

```text
create opportunity
create shifts
create shift roles
create skill requirements
create credential requirements
create impact metric definitions
write audit event
```

If any required piece fails, transaction rolls back.

Do not create half an opportunity.

---

## 5. Plain-language planner

Implement a deterministic parser before considering an LLM.

Support phrases like:

```text
Need 8 volunteers Saturday morning
one driver
two Spanish speakers
food distribution
```

Parser output:

```json
{
  "capacity": 8,
  "roles": [
    {"name":"Driver","count":1},
    {"name":"Spanish Support","count":2}
  ]
}
```

User must confirm/edit before save.

This keeps the competition demo offline and proves your own programming.

---

## 6. Schedule model

Separate:

```text
Opportunity = program/event concept
Shift = dated instance
Role = capacity/qualification need within shift
```

Do not overload one table with all three concepts.

Recurring creation can generate concrete shifts for a finite range.

Example:

```text
Every Saturday for 8 weeks
```

Generate 8 shifts.

---

## 7. Coordinator schedule

Implement:

```text
agenda
week
month
coverage view
```

Start with a normalized backend query returning a consistent schedule DTO.

Drag assignment:

1. user drags volunteer
2. frontend requests assignment preview
3. backend validates
4. UI shows allowed/rejected state
5. drop calls create assignment
6. query invalidation updates schedule and coverage

Do not run critical eligibility only after drop.

---

## 8. Coverage baseline

Before optimization, calculate:

```text
seat coverage
role coverage
required skill coverage
required credential coverage
language/skill gaps
confirmed vs waitlist
```

Coverage health should be derived from explicit components.

Document the formula in:

```text
docs/COVERAGE_HEALTH.md
```

Avoid a mysterious "78%" with no explanation.

---

## 9. Semantic validation suite

Required tests:

```text
shift end after start
role count <= shift capacity where appropriate
capacity >= confirmed count
recurrence produces expected dates
overlapping assignment rejected
expired credential rejected
age requirement rejected
volunteer unavailable rejected
skill requirement rejected
```

Use human-readable error codes.

---

## 10. Coordinator data tables

Implement reusable table behavior:

```text
sort
filter
keyboard focus
row inspector
empty state
error state
loading
bulk selection where useful
```

Never build separate one-off table implementations for:

```text
volunteers
opportunities
credentials
records
```

---

## 11. Tests

### Backend

```text
opportunity transaction rollback
recurring shift generation
role requirement persistence
credential validity
pipeline transitions
coverage calculation
assignment preview
```

### Frontend

```text
create opportunity wizard
field validation
role editor
live preview
schedule filters
drag/drop keyboard alternative
recruitment stage validation
```

### E2E demo

```text
create opportunity
add roles
publish
see shift in schedule
assign eligible volunteer
attempt ineligible volunteer
see meaningful rejection
```

---

## 12. Debugging

If coverage is wrong, inspect each subcomponent separately.

Example:

```text
capacity: 10
confirmed: 8
required roles: driver 1, Spanish 2
filled: driver 0, Spanish 1
```

Do not debug a combined score until raw inputs are proven correct.

If recurrence creates DST errors:

- calculate in organization-local timezone
- persist canonical UTC instants
- test daylight-saving boundary dates explicitly

---

## 13. Definition of done

A coordinator can build a complete opportunity without editing the database.

Tag:

```bash
git tag phase-05-coordinator-ops
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
