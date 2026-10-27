# AutoRoster matching engine

AutoRoster answers one question: given the open role slots in a set of future shifts and
the active volunteer pool, which eligible volunteer should fill each seat? The answer is
computed in Rust, not in the React screen. This document describes the implementation in
`src-tauri/core/src/matching.rs`, the organization policy in
`src-tauri/core/src/policy.rs`, the answer to "why not that person?" in
`src-tauri/core/src/explain.rs`, and the database adapter in `src-tauri/core/src/roster.rs`.

The engine separates four concerns that are easy to mix up:

1. **Policy** is the organization's own rulebook: what an unknown age or credential means,
   how much work one volunteer may take on, and which match qualities matter.
2. **Eligibility** is a hard gate. An ineligible volunteer never gets an edge in the graph.
3. **Scoring** ranks eligible matches with named, bounded components.
4. **Assignment** is a min-cost max-flow problem over candidate-day nodes and role-slot
   nodes, so the result is optimal for the supplied inputs rather than greedy per gap.

## The organization policy

`organization_roster_policies` holds one versioned policy per organization (see
[DATA_MODEL.md](DATA_MODEL.md)). A workspace with no row follows `RosterPolicy::default()`,
which is the behavior the engine had before the policy existed: no cap of its own on shifts
or minutes, no required rest between shifts, unknown age and unknown credential block, and
the documented weights. An organization opts in to a limit rather than discovering one.

A coordinator edits the policy in Settings → Scheduling → Matching policy. The screen offers
named priorities — none, low, medium, high, top — which `PRIORITY_LEVELS` maps to 0, 5, 10,
15 and 35. A coordinator never types an optimizer constant. `RosterPolicy::validate` rejects
a limit outside its range, a weight that is not one of the offered levels, a negative rest
gap over 24 hours, and any set of weights that adds up past a perfect match. Validation runs
on every save, so a stored policy is always one the planner can follow.

Saving appends a new version rather than overwriting: `policy.updated` is written to the audit
trail with a one-line summary, and every generated plan reports the `policyVersion` that
produced it. That is what makes an old roster explainable after the rules changed.

## Problem statement

Inputs:

- every open seat on the selected shifts, expanded into unit-capacity role slots;
- every active volunteer, with skills, availability, credentials, history, and existing
  registrations;
- the organization's matching policy: four optional workload limits, a rest gap, what an
  unknown age or credential means, and five weights;
- four options: prefer Spanish, block conflicting times, cap weekly load, and include
  waitlisted volunteers. Respecting conflicts is the default for both a constructed
  `RosterOptions` and a deserialized one.

Outputs (`RosterPlan`):

- `assignments`: one `PlannedAssignment` per filled seat, including the score breakdown,
  deterministic explanation strings, and a full `MatchExplanation`;
- `unfilled`: every seat the engine could not fill, with a reason and any required skill or
  credential;
- `totalScore`, `slotsConsidered`, `candidatesConsidered`, `deterministicSeed`, and
  `policyVersion` for the UI summary.

## Hard eligibility constraints

`evaluate` returns every check with a pass or fail and a detail sentence; a candidate-day
pair gets a graph edge only when all of them pass. `Evaluation::rejection` names the first
failed check. The checks are:

| Constraint             | Rule                                                                                                                                                                                                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Same shift             | A volunteer already registered for the shift is rejected.                                                                                                                                                                                                         |
| Overlapping time       | With `blockConflicts` on, a volunteer with an assignment whose start and end overlap the shift is rejected. A shift that begins when another ends is not a conflict.                                                                                              |
| Rest between shifts    | With `blockConflicts` on, a non-overlapping assignment closer than `minimum_gap_minutes` on either side is rejected. 0 turns the rule off.                                                                                                                        |
| Daily shift limit      | When the policy sets `max_shifts_per_day`, the candidate's committed blocks on that date plus this one must fit.                                                                                                                                                  |
| Daily minute limit     | When the policy sets `max_minutes_per_day`, the committed minutes on that date plus this shift must fit.                                                                                                                                                          |
| Weekly shift limit     | When the policy sets `max_shifts_per_week`, or when the coordinator turns on the weekly cap, `weekly_load + this run + 1` must fit.                                                                                                                               |
| Weekly minute limit    | The same, counted in minutes.                                                                                                                                                                                                                                     |
| Availability on record | An empty availability set is rejected.                                                                                                                                                                                                                            |
| Day and period         | The candidate must contain `"<day>:<period>"`, where period is `morning` before 12:00, `afternoon` before 17:00, otherwise `evening`.                                                                                                                             |
| Required skill         | Case-insensitive skill match on the role requirement.                                                                                                                                                                                                             |
| Required credential    | Fails closed. Current when a credential with the required name has `valid_through` on or after the shift date; expired when it lapsed; missing when there is no record. The detail names which. A missing record may be allowed by policy; a lapsed one never is. |
| Minimum age            | Fails closed. A role minimum age is only satisfied by a birthdate that puts the volunteer at or over the minimum on the shift date. An unknown birthdate blocks unless the policy allows it.                                                                      |

The workload limits belong to the policy rather than the conflict toggle, so an organization
that turns off conflict blocking still gets its caps. The weekly checks run when either the
policy names a number or the coordinator asked for the cap, so a stored limit is never
silently ignored.

The database loader adds two more filters before matching: only volunteers with status
`active` are loaded, and unless `includeWaitlist` is true, anyone with a `waiting` waitlist
entry is excluded. Role capacity is enforced structurally: `load_open_slots` emits
`required - filled` slots for each role, never a negative count, and only for shifts whose
status is `scheduled` and whose start is after the demo clock.

## Score components

Every eligible edge receives the same six named components, capped at 100. The maximum of
each is the policy weight, so the table below shows the shipped defaults:

| Component      | Default maximum | Exact rule                                                                                                                                                                 |
| -------------- | --------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skill`        |              35 | The full weight when a required skill matches; `6/7` of it when the role has no required skill; 0 otherwise (unreachable because of the gate).                             |
| `availability` |              25 | Always 25 for an eligible pair; availability is a hard constraint, not a gradient.                                                                                         |
| `interest`     |              15 | The full weight when the candidate's causes include the opportunity's cause, else 0.                                                                                       |
| `preference`   |              10 | The full weight for a Spanish-named role when the candidate speaks Spanish or has the Spanish skill; `8/10` for a Spanish speaker when `preferSpanish` is on; else `6/10`. |
| `fairness`     |              10 | `weight * (10 - min(weekly_load, 4) * 2) / 10`, giving the full weight, then 80 %, 60 %, 40 % or 20 % of it.                                                               |
| `reliability`  |               5 | `3/5` of the weight for a volunteer with no completed events (neutral baseline); otherwise `round(attendance_rate / 100 * weight)`.                                        |

`total = clamp(skill + availability + interest + preference + fairness + reliability, 0, 100)`.
The same six components are returned with each assignment as `ScoreComponent` pairs, so the
UI shows why a match won without recomputing anything, and moving a policy weight moves the
score without changing a single rule.

## Graph construction

`plan` sorts candidates by ID and slots by start time, shift ID, role, then slot ID. It then
builds this network:

```text
source
  → candidate-day node      capacity 1, cost 0
  → role-slot node          capacity 1, cost = (100 - score) * 100 + tie
  → sink                    capacity 1, cost = -priority
```

A candidate-day node exists once per candidate and calendar day. Its single unit of source
capacity is what keeps the flow pass at one shift per volunteer per day without needing
pairwise overlap edges. A candidate can therefore appear in several day nodes but only once
on any given day.

Only eligible candidate-day nodes on the slot's day are connected to that slot. The
candidate-day slice is built from every candidate/slot pair, so a day node exists only when
there is a slot on that day.

## Same-day slots after the flow pass

One slot per candidate per day is safe but stricter than the real rule, which is about
time overlap: a volunteer free from 2pm can take a 2pm shift after a 9am one. Arbitrary
interval conflicts cannot be represented in a single-commodity flow, so `fill_same_day_slots`
offers the slots the flow pass left unfilled, scarcest slot first:

- mandatory slots before optional ones;
- then the slot fewest eligible candidates can take;
- then earliest start, then slot ID.

Within a slot, the best-scoring candidate wins, and candidates are compared in ID order so
an exact tie is deterministic. A candidate is offered the slot only when their committed
time — the assignments the flow pass just made plus the assignments already on record — does
not overlap it. The pass runs only when conflicts are being respected, so it can never add
an overlapping pair, and it never touches a decided candidate (see "Counterfactual" below).

### Cost formula and priority

`MAX_SCORE` is `100`. Base cost is:

```text
(MAX_SCORE - score.total) * 100
```

so one score point is worth 100 cost units and a perfect match costs 0. The extra terms are:

- `tie = slot_index % 100`, a deterministic tie-breaker in canonical slot order, always
  smaller than one score point so it can never outweigh match quality;
- `priority = MANDATORY_SLOT_BONUS` (20,000) when the slot is mandatory, otherwise 0.

A slot is `mandatory` when it has a required skill or a required credential. The bonus is
applied once, on the edge that fills the slot, so a mandatory seat carries 20,000 units of
advantage — twice the 10,000-unit range of a full score swing. That is why scarce volunteers
fill required roles before optional ones. Because priority is negative cost, the network
contains negative edges; the solver uses SPFA rather than Dijkstra.

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
- `explanation`, a typed `MatchExplanation` holding every `ConstraintCheck` the gate ran
  with its detail sentence, the six `ScoreComponent` pairs, the total, whether the person was
  selected, and a `selectionReason` sentence;
- `eligibleRoles` for the chosen shift, recomputed through the same eligibility function;
- `promoteWaitlist`, true when the candidate has a waiting entry for that shift.

The AutoRoster screen renders these values as "Why this person?" under each seat. Checks
read `PASS` or `FAIL` with their detail, the components show as the score bars, and every
word comes from the engine. No prose is generated by a model.

## Counterfactual: "why not that person?"

`explain::explain_candidate` answers the question a coordinator actually asks about the
person the plan did not choose. It returns a `CandidateAnswer`:

- when the candidate fails a requirement, `explanation` names the failed check and there is
  no counterfactual, because the question is already answered;
- when the candidate was eligible but the seat went to somebody else, `comparison` holds a
  `ForcedComparison` produced by a real experiment rather than an estimate.

The experiment is `plan_with_forced`: the questioned assignment is decided before the solver
runs. Its seat leaves the pool entirely and the candidate is not offered anything else, which
is the only way the second plan describes what the coordinator asked. The two plans are then
compared on filled seats, required seats filled, total score, and the assignments that
changed. A seat that was filled in the first plan and is not filled in the second is reported
by name, which is how the answer can say "this would leave the Driver seat uncovered"
instead of quoting two numbers.

The comparison is deterministic for the same inputs, and the wording is fixed templates:

```text
Forcing Maya into Spanish Support: required seats filled 8 to 7
Total match score 684 to 642
Uncovered: Driver on Food Distribution
```

`compare_forced` is also usable on its own for a candidate who already holds a different
seat, which is the "why are they on Driver and not on Packing?" question.

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

| Test                                                                                   | What it proves                                                                               |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `fills_more_slots_than_a_greedy_first_pick`                                            | Global flow fills two complementary seats; a greedy first pick would leave one gap.          |
| `rejects_candidates_without_the_mandatory_skill`                                       | An ineligible candidate gets no edge and the slot is reported with its required skill.       |
| `overlapping_shifts_cannot_share_a_volunteer`                                          | Two overlapping seats for one volunteer: exactly one is filled.                              |
| `two_shifts_on_one_day_fill_when_they_do_not_overlap`                                  | The second pass fills a later same-day seat for a volunteer who is free then.                |
| `a_shift_that_starts_when_another_ends_is_not_a_conflict`                              | Half-open overlap, so back-to-back shifts are allowed.                                       |
| `a_committed_shift_only_blocks_the_time_it_covers`                                     | An existing 9–12 booking blocks 11:00 and not 14:00.                                         |
| `a_role_with_a_minimum_age_rejects_an_unknown_birthdate`                               | A missing birthdate fails closed and the seat is reported unfilled.                          |
| `the_age_boundary_is_the_shift_date`, `a_leap_day_birthday_ages_on_the_first_of_march` | Age is computed on the shift date, including February 29.                                    |
| `a_required_credential_must_be_current`                                                | Missing and lapsed credentials are named separately and neither is assigned.                 |
| `required_roles_fill_before_optional_roles`                                            | With one scarce candidate, the mandatory Driver seat wins over an optional General seat.     |
| `match_quality_still_decides_between_mandatory_slots`                                  | Between two mandatory seats, the better-scoring match wins.                                  |
| `a_daily_shift_cap_stops_a_second_shift_on_the_same_day`                               | A cap of 1 fills one seat where a cap of 2 fills both.                                       |
| `a_daily_minute_cap_counts_time_rather_than_shifts`                                    | Two three-hour shifts do not fit inside four hours.                                          |
| `a_weekly_shift_cap_counts_the_shifts_already_committed`                               | A volunteer already at the cap is skipped in favor of one who is not.                        |
| `a_weekly_minute_cap_counts_the_minutes_already_committed`                             | Nine committed hours plus a three-hour shift bust a ten-hour cap.                            |
| `a_minimum_gap_keeps_a_shift_from_following_too_closely`                               | A two-hour rest rule blocks a shift one hour later and allows one three hours later.         |
| `an_unknown_age_may_be_allowed_by_policy`                                              | The policy can relax an unknown age.                                                         |
| `a_missing_credential_may_be_allowed_by_policy_but_a_lapsed_one_never_is`              | The policy can relax a missing credential but never an expired one.                          |
| `a_plan_names_the_policy_version_it_followed`                                          | The plan reports the version of the policy that produced it.                                 |
| `a_policy_weight_moves_the_score_without_moving_the_rules`                             | Lowering a weight lowers the score and still fills the seat.                                 |
| `every_assignment_carries_the_checks_and_components_behind_it`                         | Every check passed, the components sum to the total, and the reason names the matched skill. |
| `matches_the_brute_force_optimum_on_a_known_case`                                      | Three candidates and three slots match an exhaustive oracle on count and total score.        |
| `plan_is_deterministic_for_identical_inputs`                                           | Reversing candidate input order still assigns the lower ID.                                  |
| `random_small_cases_match_the_oracle` (proptest, 48 cases)                             | Random 1–5 candidate and 1–5 slot cases match the oracle and never assign a candidate twice. |
| `performance_500_candidates_and_100_slots`                                             | A 500-candidate, 100-slot case fills all 100 seats within a 5-second test gate.              |

The counterfactual has its own unit tests in `explain.rs`:

| Test                                                              | What it proves                                                                    |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `a_selected_candidate_is_explained_without_a_counterfactual`      | The person holding the seat gets their reason and no hypothetical.                |
| `a_candidate_holding_another_seat_is_told_what_moving_would_cost` | Moving the only driver leaves the Driver seat uncovered: 2 seats filled become 1. |
| `a_candidate_who_fails_a_requirement_is_told_which_one`           | A failed skill check is named and no counterfactual is offered.                   |
| `forcing_a_candidate_into_a_seat_nobody_else_wants_costs_nothing` | A swap that keeps the seats filled reports the move and that no seat is lost.     |
| `an_unknown_candidate_or_seat_is_a_not_found_error`               | A question about records that do not exist is an error, not a guess.              |

Two integration suites run the same code over the seeded workspace: `tests/policy.rs`
(defaults, versioning, the audit line, refusal, the policy version on a plan, and that a
tighter daily cap never fills more seats than a looser one) and `tests/explain.rs` (the holder
of a seat, a volunteer left out, and an unknown seat).

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

- The flow pass is exact for its own rule (one slot per candidate per day) but on a very
  crowded day the second pass is a scarcity-ordered greedy, not a second optimization: it
  can fill fewer same-day extras than an exhaustive search would. It never double-books.
- The brute-force oracle validates count and score, not the mandatory-priority objective,
  and it models one slot per candidate per day, so it is an oracle for the flow pass only.
- A forced comparison answers one decision at a time. Forcing two assignments together is
  not exposed, because the answer would stop being a single question a coordinator asked.
- The policy covers workload, missing-requirement behavior, and weights. Relationship rules
  such as "these two volunteers should not be on the same shift" are not part of it.
- The counterfactual reports the comparison it computed. It does not attempt to find the
  smallest change that would make the questioned assignment free, which would be a different
  and much larger problem.
- The planner requires at least one shift ID; the comment in `plan_roster` mentions every
  future shift, but the implementation intentionally returns a validation error for an
  empty list.
- `includeWaitlist = false` excludes every volunteer with a waiting entry, even if the
  waitlist is for a different shift.
- Applying a plan is scoped to one shift per command. A multi-shift plan is not applied in
  one transaction.
- The solver is implemented for clarity, not compressed: one slot node per open seat and
  SPFA rather than a potentials-based Dijkstra variant.
