# AutoRoster matching engine

AutoRoster answers one question: given the open role slots in a set of future shifts and
the active volunteer pool, which eligible volunteer should fill each seat? The answer is
computed in Rust, not in the React screen. This document describes the implementation in
`src-tauri/core/src/matching.rs` and its database adapter in
`src-tauri/core/src/roster.rs`.

The engine separates three concerns that are easy to mix up:

1. **Eligibility** is a hard gate. An ineligible volunteer never gets an edge in the graph.
2. **Scoring** ranks eligible matches with named, bounded components.
3. **Assignment** is a min-cost max-flow problem over candidate-day nodes and role-slot
   nodes, so the result is optimal for the supplied inputs rather than greedy per gap.

## Problem statement

Inputs:

- every open seat on the selected shifts, expanded into unit-capacity role slots;
- every active volunteer, with skills, availability, credentials, history, and existing
  registrations;
- four options: prefer Spanish, block same-day conflicts, cap weekly load, and include
  waitlisted volunteers.

Outputs (`RosterPlan`):

- `assignments`: one `PlannedAssignment` per filled seat, including the score breakdown and
  deterministic explanation strings;
- `unfilled`: every seat the engine could not fill, with a reason and any required skill or
  credential;
- `totalScore`, `slotsConsidered`, `candidatesConsidered`, and `deterministicSeed` for the
  UI summary.

## Hard eligibility constraints

`is_eligible` returns `Err(reason)` before scoring. A slot and candidate pair gets a graph
edge only when every check passes:

| Constraint             | Rule                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Same shift             | A volunteer already registered for the shift is rejected.                                                                             |
| Same day               | With `blockConflicts` on, a volunteer with another assignment that calendar day is rejected.                                          |
| Weekly cap             | With `capWeekly` on, a volunteer with `weekly_load >= 2` in the next seven days is rejected.                                          |
| Availability on record | An empty availability set is rejected.                                                                                                |
| Day and period         | The candidate must contain `"<day>:<period>"`, where period is `morning` before 12:00, `afternoon` before 17:00, otherwise `evening`. |
| Required skill         | Case-insensitive skill match on the role requirement.                                                                                 |
| Required credential    | A credential with the required name whose `valid_through` is on or after the shift date.                                              |
| Minimum age            | When both a birthdate and a role minimum age exist, age on the shift date must meet the minimum.                                      |

The database loader adds two more filters before matching: only volunteers with status
`active` are loaded, and unless `includeWaitlist` is true, anyone with a `waiting` waitlist
entry is excluded. Role capacity is enforced structurally: `load_open_slots` emits
`required - filled` slots for each role, never a negative count, and only for shifts whose
status is `scheduled` and whose start is after the demo clock.

## Score components

Every eligible edge receives the same six named components, capped at 100:

| Component      | Maximum | Exact rule                                                                                                                                          |
| -------------- | ------: | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skill`        |      35 | 35 when a required skill matches; 30 when the role has no required skill; 0 otherwise (unreachable because of the gate).                            |
| `availability` |      25 | Always 25 for an eligible pair; availability is a hard constraint, not a gradient.                                                                  |
| `interest`     |      15 | 15 when the candidate's causes include the opportunity's cause, else 0.                                                                             |
| `preference`   |      10 | 10 for a Spanish-named role when the candidate speaks Spanish or has the Spanish skill; 8 for a Spanish speaker when `preferSpanish` is on; else 6. |
| `fairness`     |      10 | `10 - min(weekly_load, 4) * 2`, giving 10, 8, 6, 4 or 2.                                                                                            |
| `reliability`  |       5 | 3 for a volunteer with no completed events (neutral baseline); otherwise `round(attendance_rate / 100 * 5)`.                                        |

`total = clamp(skill + availability + interest + preference + fairness + reliability, 0, 100)`.
The breakdown is returned with each assignment, so the UI can show why a match won without
recomputing anything.

## Graph construction

`plan` sorts candidates by ID and slots by start time, shift ID, role, then slot ID. It then
builds this network:

```text
source
  → candidate-day node      capacity 1, cost 0
  → role-slot node          capacity 1, cost = (100 - score) * 100 + tie - priority
  → sink                    capacity 1, cost = -priority
```

A candidate-day node exists once per candidate and calendar day. Its single unit of source
capacity is what enforces "at most one shift per volunteer per day" without needing pairwise
overlap edges. A candidate can therefore appear in several day nodes but only once on any
given day.

Only eligible candidate-day nodes on the slot's day are connected to that slot. The
candidate-day slice is built from every candidate/slot pair, so a day node exists only when
there is a slot on that day.

### Cost formula and priority

`MAX_SCORE` is `100`. Base cost is:

```text
(MAX_SCORE - score.total) * 100
```

so one score point is worth 100 cost units and a perfect match costs 0. The extra terms are:

- `tie = slot_index * 2`, a deterministic tie-breaker in canonical slot order;
- `priority = 20_000` when the slot is mandatory, otherwise 0.

A slot is `mandatory` when it has a required skill or a required credential. Priority is
applied twice, once on the candidate-to-slot edge and once on the slot-to-sink edge, so a
mandatory seat carries 40,000 units of advantage. That is four times the 10,000-unit range
of a full score swing, which is why scarce volunteers fill required roles before optional
ones. Because priority is negative cost, the network contains negative edges; the solver
uses SPFA rather than Dijkstra.

## Min-cost max-flow

`Flow::min_cost_max_flow` is an in-crate implementation of successive shortest augmenting
paths:

1. Find the shortest source-to-sink path in the residual graph with SPFA, which tolerates
   negative costs.
2. If no path exists, stop.
3. Augment one unit along the path and update residual capacities.
4. Add the path distance to the total cost.
5. Repeat.

The objective is lexicographic in practice: maximize the number of filled seats first
(max flow), then minimize cost (maximum total match quality, with mandatory-role priority).
This is why a greedy "best candidate for this gap" loop can fill fewer seats than the flow
solution.

## Determinism and tie-breaking

The same candidate set, slot set, and options always produce the same plan:

- candidates are ordered by `id`;
- slots are ordered by `starts_at`, `shift_id`, `role`, then slot `id`;
- day nodes live in a `BTreeMap`, so graph construction order is stable;
- the `tie` term gives earlier canonical slots a small cost advantage when scores are equal;
- the returned assignments are sorted again by start time, shift, role, then candidate ID;
- `deterministicSeed` is `20_261_013`. It is metadata for the demo, not a random seed: the
  engine uses no randomness.

## Worked example

Two volunteers and two mandatory seats on the same Saturday morning:

```text
Slot A: Spanish Support, requires Spanish
Slot B: Driver, requires Driver
Candidate a: Spanish skill, available sat:morning, food interest, no prior load
Candidate b: Driver skill, available sat:morning, food interest, no prior load
```

Both candidates pass every eligibility gate. Candidate `a` scores 35 for skill A, 25 for
availability, 15 for food interest, 10 for the Spanish role, 10 for fairness, and 5 for
reliability (95% attendance rounds to 5): 100. Candidate `b` scores the same path against
slot B: 100.

The graph has one day node per candidate. Candidate `a` connects only to slot A because it
lacks the Driver skill; candidate `b` connects only to slot B. Two units of flow are
augmented, both seats fill, `totalScore` is 200, and `unfilled` is empty. The unit test
`fills_more_slots_than_a_greedy_first_pick` uses exactly this shape and asserts two
assignments, at least 180 total score, and no unfilled slots.

If a third high-scoring candidate could fill either seat but only one seat exists, the
priority and score costs decide which slot survives; the losing slot appears in `unfilled`
with `"Eligible candidates were already assigned"` or `"No eligible candidate"`.

## Explainability

`PlannedAssignment` carries the data a reviewer can inspect:

- `score` and the full `ScoreBreakdown` (skill, availability, interest, preference,
  fairness, reliability, total);
- `reasons`, deterministic templates truncated to three entries, such as
  `"Spanish skill matched"`, `"Available SAT morning"`, `"Interested in food"`, and
  `"95% attendance"`;
- `eligibleRoles` for the chosen shift, recomputed through the same eligibility function;
- `promoteWaitlist`, true when the candidate has a waiting entry for that shift.

The AutoRoster screen renders these values as the "why this match" explanation. No prose is
generated by a model.

## Applying a plan

Planning is read-only. `apply_roster_plan(shift_id, assignments)` commits an approved plan
for one shift in a single SQLite transaction:

1. Reject an empty plan, a non-scheduled shift, or a plan that would exceed
   `shifts.confirmed + assignments > capacity`.
2. Reject duplicate candidates in the same plan.
3. Reject a plan that would exceed any role's `filled + count > required`.
4. Run the same `validate_registration` gate used by normal registration for every
   assignment, including active status, registration window, role requirements, age,
   availability, overlap, and current capacity.
5. In one transaction: mark waiting entries `promoted`, upsert the registration as
   `registered`, increment `shifts.confirmed` and `shift_roles.filled`, and append an
   `autoroster.apply` or `waitlist.promote` audit event per assignment.
6. Commit and return the fresh snapshot.

Because all validation happens before the transaction opens and every write shares that
transaction, an invalid plan cannot leave half a roster behind. The frontend calls this one
command instead of one registration command per candidate.

## Test strategy

The matching module's tests are the evidence that the solver is correct, not just
plausible:

| Test                                                       | What it proves                                                                               |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `fills_more_slots_than_a_greedy_first_pick`                | Global flow fills two complementary seats; a greedy first pick would leave one gap.          |
| `rejects_candidates_without_the_mandatory_skill`           | An ineligible candidate gets no edge and the slot is reported with its required skill.       |
| `one_assignment_per_candidate_day_is_enforced`             | One candidate, two same-day slots: exactly one assignment.                                   |
| `required_roles_fill_before_optional_roles`                | With one scarce candidate, the mandatory Driver seat wins over an optional General seat.     |
| `matches_the_brute_force_optimum_on_a_known_case`          | Three candidates and three slots match an exhaustive oracle on count and total score.        |
| `plan_is_deterministic_for_identical_inputs`               | Reversing candidate input order still assigns the lower ID.                                  |
| `random_small_cases_match_the_oracle` (proptest, 48 cases) | Random 1–5 candidate and 1–5 slot cases match the oracle and never assign a candidate twice. |
| `performance_500_candidates_and_100_slots`                 | A 500-candidate, 100-slot case fills all 100 seats within a 5-second test gate.              |

The brute-force oracle (`brute_force`) walks every candidate, recursively tries skipping it
or assigning it to each unused eligible slot, forbids a second assignment on the same
candidate-day, and keeps the best `(count, score)` pair. It is exponential and is used only
for tiny cases. It currently compares count and score; mandatory priority is covered by the
separate hand case rather than by the oracle.

The lifecycle integration tests add `an_approved_auto_roster_plan_applies_as_one_audited_write`,
which plans `sh-sat-food`, applies the plan through the transaction, asserts every expected
registration exists, counts one audit event per assignment, and verifies `confirmed`
increased by the plan size.

## Complexity and performance

Let `C` be candidates, `S` slots, `D` distinct candidate-day pairs, and `E` eligible edges.
The graph has `O(D + S)` nodes and `O(C·S)` candidate-slot checks during construction.
Successive shortest paths performs at most `F <= min(C, S)` augmentations, and each SPFA
pass is `O(V·E)` worst case, so the conservative bound is `O(F·V·E)`. Realistic
inputs are small; the 500 × 100 test is the performance gate. The test asserts completion
under five seconds and exactly 100 assignments. The repository records the gate, not a
fabricated timing claim for another machine.

## Known limitations

- A volunteer may serve at most one shift per **calendar day**, not one arbitrary overlap
  window. This is stricter than a pure time-overlap check for split shifts on the same day.
- The age constraint is skipped when a candidate has no birthdate in the matching engine.
  Normal registration rejects a missing birthdate for an age-gated role, so the apply step
  still refuses the assignment; the preview can show the candidate as eligible first.
- The tie term can outweigh a one- or two-point score difference for later slots. It is
  deterministic but not score-neutral at extremely small score gaps.
- The brute-force oracle validates count and score, not the mandatory-priority objective.
- The planner requires at least one shift ID; the comment in `plan_roster` mentions every
  future shift, but the implementation intentionally returns a validation error for an
  empty list.
- `includeWaitlist = false` excludes every volunteer with a waiting entry, even if the
  waitlist is for a different shift.
- Applying a plan is scoped to one shift per command. A multi-shift plan is not applied in
  one transaction.
- The solver is implemented for clarity, not compressed: one slot node per open seat and
  SPFA rather than a potentials-based Dijkstra variant.
