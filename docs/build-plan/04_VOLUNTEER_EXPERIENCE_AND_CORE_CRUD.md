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

# Phase 4 — Volunteer Experience and Core CRUD

## Outcome

Deliver the first complete end-to-end product slice:

```text
Volunteer onboarding
→ profile
→ discover opportunity
→ opportunity detail
→ save/register
→ schedule
→ hours/impact read views
```

This phase proves that:

- React ↔ Tauri ↔ Rust ↔ SQLite works
- user actions persist
- validation is real
- data changes appear across screens
- the volunteer experience is visually polished

---

## 1. Implement volunteer domain services

Backend service methods:

```text
create_volunteer
update_volunteer_profile
set_volunteer_skills
set_volunteer_availability
set_volunteer_interests
get_volunteer_detail
list_volunteers
```

Do not expose database rows directly.

Return DTOs designed for UI.

---

## 2. Onboarding

Implement:

```text
Profile
Skills
Availability
Interests / preferences
```

Client-side Zod catches obvious problems:

```text
missing name
invalid email
invalid availability range
```

Rust revalidates authoritative rules.

When onboarding finishes:

1. save profile in one transaction
2. save skills
3. save availability
4. save preferences
5. write audit event
6. query initial opportunity matches
7. display count

Test rollback by intentionally failing step 4 in an integration test and verifying steps 1–3 did not persist.

---

## 3. Opportunity discovery query

Backend query should accept:

```rust
struct OpportunitySearch {
    query: Option<String>,
    start: Option<DateTime<Utc>>,
    end: Option<DateTime<Utc>>,
    causes: Vec<CauseId>,
    skill_ids: Vec<SkillId>,
    max_distance: Option<f64>,
    available_only: bool,
}
```

For competition/demo mode, distance can use stored coordinates and a local Haversine calculation. No online map service should be required for core functionality.

Return:

```text
opportunity summary
next shift
remaining capacity
matching cause
basic match score
```

AutoRoster-level matching comes in Phase 6.

---

## 4. Opportunity detail

Load:

```text
organization
hero image reference
description
location
shifts
roles
requirements
capacity
registered count
waitlist count
volunteer match explanation
```

No hardcoded counts.

If another test action registers Maya, capacity must immediately update after query invalidation.

---

## 5. Registration state machine

Define explicit states:

```text
registered
waitlisted
canceled
completed
no_show
```

Do not use unrelated booleans such as:

```text
is_registered
is_waitlisted
is_canceled
```

for mutually exclusive status.

Registration rules:

```text
shift exists
registration window open
volunteer active
no duplicate registration
volunteer meets mandatory signup constraints
capacity available OR waitlist enabled
```

---

## 6. Semantic validation

Implement now:

### Time overlap

Two intervals conflict when:

```text
existing.start < candidate.end
AND
candidate.start < existing.end
```

Test exact boundary behavior.

### Age

Evaluate age on the date of the shift, not simply "age today."

### Credentials

Credential expiration must be:

```text
valid_through >= shift.start_date
```

### Capacity

Capacity cannot be changed below already-confirmed count.

### Duplicate

Database unique constraint plus service-level friendly error.

---

## 7. Saved opportunities

Use a simple relation:

```text
saved_opportunities(volunteer_id, opportunity_id, created_at)
```

Tests:

```text
save
duplicate save is idempotent
unsave
saved list
opportunity archived after save
```

Archived opportunity remains visible in history but no longer sign-up capable.

---

## 8. Volunteer schedule

Query:

```text
registered shifts
waitlisted shifts
training requirements
availability overlay
```

Build agenda first, then month/week display.

Agenda view is the easiest to make correct and test.

Schedule must show status using:

```text
text + icon + color
```

never color alone.

---

## 9. My Hours read model

At this phase, hours can be seeded/demo data.

Build query and screen for:

```text
verified hours
pending hours
organization breakdown
cause breakdown
history table
```

Writes and review workflow arrive in Phase 7.

---

## 10. Personal impact read model

Compute from real DB rows:

```text
hours
events
organizations
impact outcomes
cause mix
```

Do not hardcode:

```text
327 people reached
```

Store an impact metric/outcome that produces it.

---

## 11. Query invalidation

Use TanStack Query keys consistently:

```ts
["volunteer", id]
["opportunities", filter]
["opportunity", id]
["schedule", volunteerId]
["hours", volunteerId]
["impact", volunteerId]
```

After register:

```text
invalidate opportunity
invalidate search
invalidate schedule
invalidate volunteer summary if needed
```

This prevents stale counts across pages.

---

## 12. Tests

### Rust unit

```text
age validation
credential date
time overlap
registration state transition
capacity
```

### Rust integration

```text
complete onboarding transaction
search filters
register
waitlist
cancel
save/unsave
```

### React

```text
onboarding keyboard flow
validation message association
discovery filters
opportunity signup
waitlist state
schedule display
```

### Native smoke

With demo DB:

```text
launch
open volunteer
discover
open opportunity
register
schedule now contains shift
restart app
registration still exists
```

---

## 13. Debugging

A stale UI almost always means:

```text
mutation succeeded
but query was not invalidated
```

A rule that differs between frontend/backend means:

```text
frontend duplicated business logic
instead of only mirroring it for UX
```

An inconsistent count means:

```text
two pages use different SQL aggregation semantics
```

Create one backend read model for shared metrics.

---

## 14. Definition of done

You should be able to reset demo data and record one uninterrupted video of:

```text
onboard Maya
→ find Food Distribution
→ inspect match
→ register
→ see it on schedule
→ restart app
→ registration remains
```

All automated tests green.

Tag:

```bash
git tag phase-04-volunteer-core
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
