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

# Phase 10 — NLC Release, Documentation, Rubric Evidence, and Presentation

## Outcome

Turn the engineering project into a competition submission that judges can understand in minutes.

A great codebase can lose if its strongest work is invisible.

This phase makes every important technical decision easy to demonstrate.

---

## 1. Final documentation set

Complete:

```text
README.md
docs/
  ARCHITECTURE.md
  DATA_MODEL.md
  MATCHING_ENGINE.md
  COVERAGE_HEALTH.md
  METRICS.md
  SECURITY.md
  ACCESSIBILITY.md
  TESTING.md
  USER_GUIDE.md
  OPEN_SOURCE_CREDITS.md
  RUBRIC_MAP.md
  DEMO.md
  ENVIRONMENT.md
  DECISIONS.md
```

Documentation should describe the implemented project, not aspirational features.

---

## 2. README structure

Recommended:

```text
CivicFlow
one-sentence problem/solution

Screenshots
3 flagship screens

Why CivicFlow
problem
technical differentiator

Features
brief

Architecture
React/TS → Tauri → Rust → SQLite

AutoRoster
diagram

Setup
commands

Testing
commands + latest result summary

Accessibility

Data/backup

Credits
```

Avoid a 50-page README.

Use dedicated docs.

---

## 3. MATCHING_ENGINE.md

This is one of the most important files.

Include:

```text
problem statement
hard constraints
score formula
graph construction
min-cost max-flow explanation
pseudocode
complexity discussion
tie-breaking
fairness
new-volunteer baseline
correctness tests
brute-force oracle strategy
benchmark table
known limitations
```

Include one small worked example judges can follow.

---

## 4. RUBRIC_MAP.md

For every rubric line:

```text
Requirement
Feature
Screen
Code location
Test
Demo moment
```

Example:

```md
### Semantic input validation

Feature:
Shift assignment validator

Screen:
Coordinator Schedule / AutoRoster

Source:
src-tauri/src/domain/eligibility.rs

Tests:
eligibility_tests::rejects_expired_credential
eligibility_tests::rejects_overlap

Demo:
Attempt to assign a volunteer whose driver credential expires before the shift.
```

This prevents losing points because evidence is hidden.

---

## 5. Open-source credits

Document:

```text
React
Tauri
Rust crates
icons
fonts
charts
photography
any copied/adapted algorithm references
```

For photography:

```text
file
creator
source
license
URL
where used
```

Do not imply third-party code is yours.

Your value comes from integration and your own domain/algorithm implementation.

---

## 6. Demo database reset

Create a safe command or hidden development/demo action:

```text
Reset Demo Workspace
```

It must:

1. create safety backup if applicable
2. recreate deterministic demo DB
3. seed exact known dataset
4. reset app settings required for demo
5. confirm success

Practice resetting immediately before every rehearsal.

---

## 7. Seven-minute presentation

Recommended visual story:

### 0:00–0:35 — Problem
Open Mission Control.

Explain:

> Tomorrow's food distribution shift looks almost full, but CivicFlow detects that it still cannot operate because a required driver and Spanish-support role are missing.

### 0:35–1:15 — Coverage
Open Coverage Command Center.

Show:

```text
capacity
required roles
skill gaps
```

### 1:15–2:30 — AutoRoster
Click Optimize.

Show:

```text
72% → 100%
```

Open "Why this match?"

Explain graph model in one sentence.

### 2:30–3:15 — Volunteer side
Open opportunity.

Show match explanation and registration.

### 3:15–3:50 — Semantic validation
Attempt invalid assignment/registration.

Show meaningful reason.

### 3:50–4:35 — Check-in
Use event code.

Attendance updates live.

### 4:35–5:20 — Reporting
Open custom report.

Change filter.

Export/report preview.

### 5:20–5:50 — Backup + accessibility
Very fast proof.

### 5:50–6:30 — Actual code
Show:
- eligibility rule
- graph construction
- one algorithm loop
- one correctness test

### 6:30–7:00 — Impact
End on Impact Analytics.

Closing idea:

> CivicFlow turns volunteer time into reliable community impact.

---

## 8. Source-code views prepared in advance

Do not scroll through the repository randomly.

Prepare exact files/lines for:

```text
eligibility.rs
scoring.rs
min_cost_flow.rs
backup_service.rs
report_service.rs
one semantic validation test
one property test
```

Use IDE bookmarks.

Never rely on internet GitHub pages during the demo.

---

## 9. Judge Q&A preparation

Prepare concise answers.

### Why Rust?
- safe native backend
- appropriate for graph algorithm/data layer
- Tauri integration
- performance
- type safety

### Why SQLite?
- standalone/offline
- relational domain
- reliable transactions
- portable local storage
- online backup API

### Why not AI/LLM for matching?
- deterministic
- explainable
- works offline
- judge can inspect algorithm
- constraints are guaranteed

### What makes AutoRoster optimal?
Explain flow objective and correctness tests.

### How do you know it works?
Show:

```text
unit tests
property tests
brute-force oracle comparison
E2E
```

### Accessibility?
Explain automated + manual testing, not just "we used ARIA."

### Security?
Explain Tauri capabilities and local data boundary without exaggerating.

---

## 10. Competition machine rehearsal

Test on the actual laptop you will present with.

Do:

```text
airplane mode
restart computer
launch CivicFlow cold
reset demo
run full 7-minute script
export a report
create backup
run AutoRoster
close/reopen app
```

Also test:

```text
projector 1920×1080
laptop scaling
external display duplication
sound muted
notification suppression
```

---

## 11. Emergency kit

Bring:

```text
release build installed
portable installer/bundle if rules permit
source repo local clone
demo DB backup
presentation script PDF
screenshots of key screens
short prerecorded fallback only if competition rules allow it
charger
adapter
```

The application should not need cloud login.

---

## 12. Final release process

From clean Git state:

```bash
git status
pnpm install --frozen-lockfile
pnpm verify
# run native E2E
pnpm tauri build
```

Run the built application, not only `tauri dev`.

Create:

```text
v1.0.0-nlc-rc
```

Then freeze dependencies.

If a bug appears:

```text
fix only the bug
add regression test
re-run full release gate
```

---

## 13. Final release gate

### Functionality

```text
[ ] all demo buttons work
[ ] no placeholder text
[ ] no fake metrics
[ ] no hardcoded demo result that should be computed
[ ] all filters function
[ ] exported files open
[ ] restart preserves state
```

### Algorithm

```text
[ ] optimizer deterministic
[ ] no invalid assignments
[ ] explanation totals correct
[ ] brute-force oracle suite green
[ ] benchmarks recorded
```

### Data

```text
[ ] integrity_check ok
[ ] foreign_key_check clean
[ ] backup succeeds
[ ] restore succeeds
[ ] demo reset succeeds
```

### Accessibility

```text
[ ] keyboard-only demo path
[ ] visible focus
[ ] high contrast
[ ] text scaling
[ ] reduced motion
[ ] screen-reader spot check
```

### Presentation

```text
[ ] 6:30–6:50 rehearsal average
[ ] no dead time
[ ] no internet
[ ] source-code bookmarks ready
[ ] rubric evidence mapped
```

---

## 14. What not to do in the final weeks

Do not:

```text
switch frameworks
rewrite AutoRoster
replace SQLite
upgrade every dependency
add a chatbot because it looks impressive
add cloud authentication
add social media
redesign all 42 screens
```

Reliability compounds.

---

## 15. Final definition of done

CivicFlow is ready when:

- every critical claim can be demonstrated live
- every critical rule has a test
- the application survives airplane mode
- one click can reset the exact demo
- the release build is the version rehearsed
- documentation proves technical depth without judges having to infer it
- you understand every important algorithm and architectural decision well enough to explain it without notes

Tag the final release:

```bash
git tag v1.0.0
```

At this point, stop building and rehearse.
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
