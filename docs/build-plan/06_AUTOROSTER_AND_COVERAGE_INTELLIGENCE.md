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

# Phase 6 — AutoRoster and Coverage Intelligence

## Outcome

This phase creates CivicFlow's technical centerpiece.

At completion:

- hard eligibility constraints are explicit
- candidate scores are explainable
- AutoRoster optimizes the **whole roster**
- results are deterministic
- the engine can prove its own invariants through tests
- coverage changes update the real application
- judges can see and understand the algorithm

This phase deserves disproportionate time.

---

## 1. Separate eligibility from scoring

Create:

```text
matching/eligibility.rs
matching/scoring.rs
matching/flow.rs
matching/explain.rs
```

First answer:

```text
Can this volunteer fill this role?
```

Only then answer:

```text
How good is the match?
```

### Hard constraints

Examples:

```text
availability
time overlap
minimum age
mandatory skill
mandatory credential
credential validity date
inactive volunteer
maximum concurrent assignment
role capacity
```

An ineligible volunteer gets **no graph edge**.

Do not compensate for ineligibility with a bad score.

---

## 2. Scoring model

Use named components.

Example:

```text
skill_fit          0–35
availability_fit   0–25
interest_fit       0–15
preference_fit     0–10
workload_fairness  0–10
reliability        0–5
```

Total:

```text
0–100
```

New volunteers without attendance history receive a neutral reliability baseline. They are not penalized for missing history.

Store scoring weights in configuration or code constants with documentation.

Do not allow judges to think the numbers are arbitrary.

---

## 3. Why min-cost max-flow

The research supports modeling assignment as a flow network.

Conceptually:

```text
source
  ↓
volunteers
  ↓ weighted eligible edges
role slots
  ↓
sink
```

Each volunteer-to-role-slot edge has:

```text
capacity = 1
cost = transformed match score
```

Because min-cost flow minimizes cost:

```text
cost = MAX_SCORE - match_score
```

or an equivalent transformation.

Google OR-Tools documents assignment as a minimum-cost-flow problem using source → worker → task → sink edges. Princeton/Stanford materials explain the underlying bipartite matching ↔ flow relationship.

For CivicFlow, flow is preferable to a simple one-to-one Hungarian assignment because roles can require multiple people and future constraints can be represented through capacities.

---

## 4. Implement the algorithm yourself

For competition value, do not call a black-box cloud optimizer.

Implement the core flow algorithm in Rust.

Suggested path:

```text
successive shortest augmenting path
with residual graph
integer capacities
integer costs
```

Keep it small and documented.

Core types:

```rust
struct Edge {
    to: usize,
    rev: usize,
    capacity: i32,
    cost: i32,
    original_capacity: i32,
}
```

Use:

```text
Vec<Vec<Edge>>
BinaryHeap
Vec<i32>
Vec<Option<(node, edge)>>
```

This visibly demonstrates data structures and graph algorithms.

---

## 5. Build role slots

If a role needs:

```text
General: 6
Spanish Support: 2
Driver: 1
```

Generate slots:

```text
general-1 ... general-6
spanish-1 ... spanish-2
driver-1
```

This keeps capacity unit-sized and explainable.

Later you can compress the graph, but the competition dataset is small enough that clarity is more valuable.

---

## 6. Objective priority

Optimization should prefer:

1. fill mandatory roles
2. maximize overall coverage
3. maximize total match quality
4. avoid unfair workload concentration

One implementation approach is lexicographic weighting.

Example:

```text
unfilled mandatory role penalty >> any match score difference
```

Be extremely careful with penalty magnitudes.

Document why one objective cannot accidentally overpower another.

---

## 7. Explainability

The flow algorithm decides assignments.

The explanation layer reports the already-computed score components and eligibility facts.

Example:

```text
Maya Chen — 94

Skills            35/35
Availability      25/25
Interests         15/15
Preferences        8/10
Fairness           7/10
Reliability        4/5

No conflicts
Food credential valid through Dec 2026
Spanish requirement satisfied
```

Do not generate vague AI prose.

Use deterministic templates.

---

## 8. Correctness tests

This is where CivicFlow becomes exceptional.

### Invariants

For every solution:

```text
a volunteer appears in at most one conflicting slot
a slot has at most one volunteer
every assignment edge was eligible
role capacity is not exceeded
total flow equals number of assignments
reported total cost equals chosen edges
```

### Known examples

Hand-calculate small cases and assert exact result.

### Greedy failure case

Create a case where greedy choosing the highest score first produces a worse overall roster.

AutoRoster must find the global optimum.

### Brute-force oracle

For tiny cases:

```text
<= 6 volunteers
<= 6 role slots
```

enumerate every feasible assignment and compute the true best objective.

Generate random small cases and assert AutoRoster equals brute-force optimum.

This is one of the strongest tests you can show judges.

---

## 9. Property-based tests

Use `proptest`.

Generate:

```text
random volunteers
random role slots
random eligible edges
random scores
```

Assert invariants.

Keep seeds/repro information when a failure occurs.

---

## 10. Performance benchmark

Competition size target:

```text
100–500 volunteers
10–100 role slots
```

Benchmark several cases.

Goal:

```text
optimization feels instantaneous
```

Record benchmark results in:

```text
docs/MATCHING_ENGINE.md
```

Do not claim speed without measurement.

---

## 11. UI integration

Coverage Command Center:

```text
current gaps
candidate pool
critical role indicator
```

AutoRoster:

```text
before coverage
Optimize
animation
after coverage
recommended assignments
```

Click candidate/assignment:

```text
Why this match?
```

The UI should never animate before the backend result returns.

---

## 12. Debugging algorithm failures

When solution looks wrong, dump a development-only diagnostic:

```text
eligible edges
score breakdown
graph nodes
graph edges
chosen augmenting paths
final assignments
objective components
```

Build:

```rust
#[cfg(debug_assertions)]
```

diagnostic helpers so production UI is not flooded.

Debug in this order:

1. eligibility
2. score
3. graph construction
4. shortest path
5. residual update
6. extraction
7. explanation

---

## 13. Phase 6 test gate

Required:

```text
[ ] every hard constraint unit tested
[ ] score component boundaries tested
[ ] greedy-failure scenario passes
[ ] brute-force oracle randomized tests pass
[ ] proptest invariants pass
[ ] deterministic ordering/tie-breaks tested
[ ] no assignments use ineligible edges
[ ] performance benchmark recorded
[ ] UI before/after coverage matches backend
[ ] explainability values sum correctly
```

---

## 14. Definition of done

A judge should be able to ask:

> Why did CivicFlow assign Maya instead of Jordan?

and you can answer with:

1. the eligibility rules
2. score breakdown
3. graph model
4. actual Rust source
5. a correctness test

Tag:

```bash
git tag phase-06-autoroster
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
