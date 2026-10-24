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

# Phase 9 — Hardening, Security, Accessibility, E2E Testing, and CI

## Outcome

Convert a feature-complete CivicFlow into a dependable competition application.

Nothing in this phase should make the feature list longer.

It should make failure less likely.

---

## 1. Threat model

CivicFlow is a local desktop application.

Primary risks:

```text
frontend compromise invoking powerful Tauri commands
accidental file access
bad/invalid database state
destructive coordinator actions
malformed imports
dependency compromise
sensitive data leaking into logs
```

Write:

```text
docs/SECURITY.md
```

Do not claim enterprise-grade security.

Describe what you actually protect.

---

## 2. Tauri capabilities

Tauri 2 capabilities provide granular permission control for windows/webviews.

Review:

```text
src-tauri/capabilities/
```

Give the main window only the permissions it needs.

Kiosk window should have fewer capabilities than coordinator window.

Example principle:

```text
kiosk can check in
kiosk cannot restore backups
kiosk cannot export files
kiosk cannot mutate credentials
```

Do not leave broad default permissions because development was easier.

---

## 3. CSP and remote content

Set a strict Content Security Policy appropriate to the bundled application.

Avoid remote script execution.

Prefer bundling:

```text
fonts
icons
UI assets
critical photos used in demo
```

Do not load third-party JavaScript from random CDNs.

If external links exist, open them deliberately through an allowed mechanism.

---

## 4. Logging

Development logs can be detailed.

Production logs should not include:

```text
passwords
private tokens
full sensitive profile payloads
database encryption keys
```

Structured log levels:

```text
error
warn
info
debug
trace
```

Demo build should default to useful but not noisy logs.

---

## 5. Native E2E

Tauri currently documents WebdriverIO's Tauri integration as the recommended route for WebDriver-based desktop tests, including an embedded provider that supports macOS.

Use it for native flows.

Test binary should be debug/test only.

Do not ship testing plugins enabled in production.

Critical native E2E flows:

```text
launch
volunteer registration
coordinator opportunity creation
semantic validation failure
AutoRoster
cancellation recovery
check-in
hours approval
report export
backup restore
settings persistence
```

---

## 6. Test pyramid

### Rust unit/property
Fastest and deepest for domain logic.

Target:

```text
hundreds of small tests acceptable
```

### React component
Behavior and accessibility.

### Integration
Real temp SQLite + services.

### Native E2E
Only high-value user journeys.

Do not create hundreds of slow E2E tests.

---

## 7. Accessibility hardening

Automated checks:

```text
semantic queries
jest-axe
real-browser/native axe where feasible
```

Manual checklist:

```text
keyboard only
125% text
200% zoom where practical
screen reader
high contrast
differentiate without color
reduced motion
focus visible
dialog focus restoration
live region announcements
```

Remember `jest-axe` itself warns automated testing does not guarantee accessibility.

Create:

```text
docs/ACCESSIBILITY.md
```

Record:

```text
supported features
tests used
manual test date
known limitations
```

---

## 8. Performance budget

Measure, don't guess.

Record:

```text
cold start
database startup/migrations
Mission Control load
volunteer search
AutoRoster 100/250/500 volunteers
report generation
backup creation
```

Possible targets:

```text
normal UI action < 100 ms perceived response where possible
search/filter feels immediate
AutoRoster well under demo-tolerance
no blocking main-thread database work
```

Do not promise numbers until benchmarked.

---

## 9. Failure injection

Create deliberate failure tests:

```text
missing database
read-only data directory
invalid backup
corrupt backup
failed PDF destination
duplicate registration
expired credential
empty candidate pool
zero available role assignment
very long names
Unicode names
large text
```

A winner-caliber project handles failure gracefully.

---

## 10. CI matrix

Expand GitHub Actions.

Recommended jobs:

```text
frontend
rust
integration
native-build-macos
native-build-windows
native-build-linux
```

If native E2E on every OS is too slow:

```text
PR: frontend + Rust + integration + one native platform
main/nightly: full platform matrix
```

Use official `tauri-action` for build artifact validation.

Upload:

```text
test reports
coverage
native bundles from tagged releases
```

---

## 11. Coverage philosophy

Do not chase 100% line coverage.

Require 100% **behavioral coverage** for:

```text
eligibility rules
AutoRoster constraints
hours math
state transitions
backup/restore
report totals
```

Aim for high coverage elsewhere, but code coverage is evidence, not the goal.

---

## 12. Bug triage

Before competition, every bug gets:

```text
P0 — demo/data loss/crash
P1 — rubric feature wrong
P2 — UX annoyance
P3 — polish
```

Rules:

```text
no open P0
no known reproducible P1 in demo paths
P2 fixed if time
P3 only after reliability
```

---

## 13. Regression protocol

For every bug:

1. reproduce
2. write failing automated test if feasible
3. fix
4. prove test green
5. run relevant suite
6. run `pnpm verify`
7. commit

Never fix the symptom without a regression test when the failure is testable.

---

## 14. Phase 9 release candidate gate

Required:

```text
[ ] frontend tests green
[ ] cargo tests green
[ ] property tests green
[ ] database integration green
[ ] native E2E green
[ ] no axe serious/critical violations
[ ] manual keyboard audit complete
[ ] backup/restore drill complete
[ ] release build launches
[ ] demo DB reset works
[ ] no P0/P1 bugs
[ ] build works without internet
```

Tag:

```bash
git tag rc-1
```

Then stop changing architecture.

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
