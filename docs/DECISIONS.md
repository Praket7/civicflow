# Decision log

Short entries, newest last. Each records the alternative that was rejected, because that
is what a maintainer will ask about.

## 001 — Tauri 2 instead of a web-only app

**Decision:** ship a Tauri 2 desktop app with a Rust core.
**Rejected:** Electron (bundles Chromium, ~100 MB, heavier memory) and a hosted web app
(a venue wifi failure ends the demo).
**Why:** offline-first is a product requirement, and a real backend keeps the rules
testable. Rust is also where coverage rules are tested, so the UI cannot invent numbers.

## 002 — Browser preview reuses the committed seed

**Decision:** a `WorkspaceRepository` seam with two implementations (Tauri IPC, browser
preview) over one JSON seed at `shared/demo-workspace.json`.
**Rejected:** a fixture file in `src/` plus handmade preview numbers.
**Why:** the design review runs in a browser; if it used different data from the desktop
app, pixel work would be validated against a fiction. One seed, two readers.

## 003 — Mission Control derives attention instead of storing it

**Decision:** attention items come from shift rows through `domain::attention_items` /
`buildMissionControl`.
**Rejected:** a hand-written “attention” array in the fixture.
**Why:** a stored list goes stale the moment a seat fills. Derivation keeps the badge, the
list, and the empty state consistent, and gives the Rust tests something meaningful.

## 004 — Role coverage and seat fill are separate numbers

**Decision:** the top metric is role coverage (filled role slots / required role slots for
upcoming shifts). The chart is seat fill (confirmed seats / capacity per day).
**Rejected:** deriving the card from the bars so the card could say 86 %.
**Why:** the card's 91 % figure does not match its own bars. Rather than fake agreement,
each number gets a precise definition and a label that says which it is. The defect is
recorded in [VISUAL_QA.md](VISUAL_QA.md).

## 005 — Chart rendered with CSS bars, not Recharts

**Decision:** the weekly coverage chart is a CSS grid of labeled bars with a details table.
**Rejected:** Recharts for this one visual.
**Why:** seven labeled values need no scale library, and CSS keeps the visual exactly on
the reference while shipping a real table alternative. Recharts remains the plan's choice
for the reporting phase, where axes and tooltips earn their weight.

## 006 — Notifications persist read state, not just UI state

**Decision:** `mark_notification_read` writes `read_at` and an `audit_events` row in one
transaction; the browser preview mirrors this in localStorage.
**Rejected:** a `useState` toggle.
**Why:** a coordinator reopening the app should not see handled alerts again, and every
write must be auditable.

## 007 — No page-level scrollbar on Mission Control at 1600×1000

**Decision:** the flagship screen is laid out at two lines of content with a 40px bottom
gutter, so it does not scroll at the reference height.
**Rejected:** treating 1000px as a fixed page height for every future screen.
**Why:** the plan calls 1600×1000 a target, not a container. Other screens may exceed it and
scroll inside the window; this one is tuned to fit, which is what “no page scroll” means for
a dashboard.

## 008 — Bundled variable fonts, no static weight files

**Decision:** ship Geist and Geist Mono for UI text, and Source Serif 4 for display, as
variable Fontsource packages. The scale uses intermediate weights (560–740) rather than
rounding every label to 400/500/600/700.
**Rejected:** Archivo and Inter with fixed weights, or the system display face.
**Why:** variable fonts let the scale keep its optical weight at each size without loading
one file per weight, and they stay bundled and offline. The display face carries the
editorial tone instead of a generic platform sans.

## 009 — Hash history inside Tauri only

**Decision:** `createHashRouter` when `window.__TAURI_INTERNALS__` exists, browser router in
the preview.
**Rejected:** hash routing everywhere (ugly public URLs) or browser routing everywhere
(deep links 404 against the asset protocol).
**Why:** each environment gets the routing it can actually support.

## 010 — Availability comes from SQLite, not the bundled seed at runtime

**Decision:** on first launch the seed is inserted into SQLite; reads always hit the DB.
**Rejected:** reading JSON from the asset bundle on each launch.
**Why:** SQL constraints and transactions are part of what is being demonstrated. The seed is
still the source for the initial rows, so the demo is deterministic.

## 011 — Workflow state has one owner: the Rust core

**Decision:** every workflow write — saved opportunities, attendance, waitlist promotion,
registrations, hours review, applicant stages, settings, program creation, and volunteer
profile — is a `civicflow-core` command that writes SQLite and appends its audit event, then
returns a full `WorkspaceSnapshot`. The React provider caches that snapshot and serializes
write responses.
**Rejected:** keeping the localStorage session as a second writer alongside Mission Control
and notifications. That made a reload resurrect stale local copies and split the audit trail
between two stores.
**Why:** the core is authoritative and every change has to be auditable. A single snapshot also makes cross-screen consistency testable in one place.

## 012 — Browser fallback is a separate, selected module

**Decision:** `previewRepository.ts` mirrors the snapshot contract over the shared seeds and
localStorage, and `getWorkspaceRepository()` returns it only when `isTauri()` is false.
**Rejected:** feature-detecting native commands inside the session provider, or shipping a
mock layer that screens import directly.
**Why:** the preview still needs to run and be reviewed without a desktop build, but the
fallback must never be an alternative writer in the desktop app. One environment check keeps
the boundary explicit and the desktop path unchanged.

## 013 — The desktop database is the only production store

**Decision:** keep SQLite, opened by `civicflow-core`, as the authoritative database for the
submitted app. `pnpm db:verify` inspects the live file after the app has run; the Rust test
suites open temporary files, write, close and reopen them to prove persistence. A Supabase
project is not part of the build.
**Rejected:** adding a hosted Postgres project beside SQLite. It would create two sources of
truth, require credentials and network access at a venue where wifi may fail, and need an
auth/RLS model the product does not have. None of that improves a single-tenant offline demo.
**Why:** the schema already has 32 related tables, foreign keys, transactions, audit events,
validated backups and a restore path. The local database supplies secure storage and backups without a network dependency.
The browser preview remains an explicitly selected fallback, never a second writer inside the
desktop shell.

## 014 — Interface copy is translated at build time, not at runtime

**Decision:** a Babel pre-plugin rewrites static JSX text and copy props to `t("English")`
keys, and the app loads one committed JSON catalog for the chosen locale. Dates come from
date-fns or an Intl fallback; document direction flips for Arabic, Hebrew, Persian, and Urdu.
**Rejected:** translating in the browser on every load, or wrapping only a handful of
navigation labels and calling the product localised.
**Why:** runtime translation needs a network at a venue where wifi may fail, adds latency to
every render, and produces different copy for the same screen on different runs. Build-time
catalogs are deterministic, reviewable in the repository, and keep proper nouns, addresses,
and user-entered notes untouched. The 60 catalogs ship inside the bundle, so the language
switch works offline.

## 015 — Local accounts are enforced in Rust, not just in the router

**Decision:** every workspace IPC command takes a session token; the core resolves it and
checks the role. A volunteer snapshot is redacted to that volunteer's own rows.
**Rejected:** keeping the route guard as the only access control, or trusting a `role`
argument supplied by the frontend.
**Why:** a hidden button is not a security boundary. The WebView can invoke any registered
command from its own console, so the command has to refuse an unauthenticated or
wrong-role caller. Redacting the snapshot also stops a volunteer from reading other
volunteers' PII through devtools, which is the difference between a demo and a workspace
that could hold real records.

## 016 — Native E2E uses the embedded WebDriver server

**Decision:** `tauri-plugin-wdio-webdriver` runs a W3C WebDriver server inside the debug
build, and `@wdio/tauri-service` drives it with `driverProvider: "embedded"`.
**Rejected:** `tauri-driver`, which does not support macOS, and AppleScript/System Events,
which needs assistive-access permission and cannot reliably read the WebView.
**Why:** the plugin works on macOS, Windows and Linux without an external driver or a
system permission prompt, so the real window can be clicked in local runs and in CI. The
plugin is compiled out of release builds, and the suite points the app at a throwaway
`CIVICFLOW_DATA_DIR` so it never touches the real workspace.

## 017 — Hosted accounts sit in front of the local workspace

**Decision:** Supabase Auth is an optional identity provider. It verifies the person, and
`sign_in_with_hosted` then opens or creates the local account that owns the workspace data.
Provider URLs open in the system browser; the answer returns on the `civicflow://` scheme.
**Rejected:** moving workspace data to Postgres, and loading Google's consent screen inside
the Tauri webview.
**Why:** the product rests on a local-first, offline workspace, and the Rust core needs a
local account to enforce roles against. Keeping identity hosted and records
local means email confirmation, password reset by email, and Google sign-in work without
turning the app into a thin client. Google blocks OAuth inside embedded webviews, so the
hand-off has to leave the app. With no keys configured, nothing changes and no account
request leaves the device.

## 018 — Public screens name no organization

**Decision:** `/welcome`, `/sign-in`, `/create-account`, the callback screens, and the auth
portrait describe the product, not one partner organization. In-app screens read the current
organization's name from the workspace snapshot instead of printing it.
**Rejected:** keeping the partner's name on the entry screens, and leaving literal
organization names in the kiosk, notifications, invite mail, and impact report.
**Why:** the same build is demoed for several kinds of organization, and a new coordinator
who creates an organization should never see someone else's name in their workspace. The
bundled sample organization keeps its own name because that is demo data, not interface copy.

## 019 — Organization membership is authoritative in the database

**Decision:** who belongs to an organization, and in what role, is a row in
`organization_memberships`. Every protected operation resolves the session to an account and
asks `authorization::require_membership` or `require_coordinator` for the membership it needs.
**Rejected:** keeping membership in a frontend list, and trusting the organization id a screen
sends without checking it.
**Why:** a frontend list is a claim, not a fact: an account could point itself at an
organization it never joined, and signup accepted the role the client asked for. The same
account may also coordinate one organization and volunteer at another, which a single global
role cannot express. Hiding a route is still useful, but it is now a convenience rather than
the control.

## 020 — Invitations are hashed, single-use and expiring

**Decision:** `organization_invites` stores the SHA-256 hash of a random 256-bit token, an
expiry, and the account that redeemed it. The token is shown once, when a coordinator issues
it. Only a coordinator can issue one, and redeeming an invitation cannot revive a membership a
coordinator disabled.
**Rejected:** the reusable plaintext coordinator and volunteer codes the app used to print.
**Why:** a short shared code ends up in chat threads and screenshots, never expires, and cannot
be tied to one person. A hashed single-use token limits the damage of a leaked database and
makes "who joined with this link" answerable.

## 021 — AutoRoster conflicts are measured in time, not in days

**Decision:** a volunteer is unavailable only for the time another shift covers. The flow
model still gives each candidate one slot per day, which is safe; a second pass then offers
the remaining same-day slots to candidates whose committed time does not overlap them,
scarcest slot first.
**Rejected:** equating "same calendar day" with "conflict", and forcing arbitrary interval
conflicts into the min-cost flow model.
**Why:** a volunteer booked from 9am to noon is genuinely free at 2pm, and refusing the second
shift loses coverage the organization has. Pairwise interval conflicts are not representable in
a single-commodity flow — a slot has to be filled by exactly one candidate while a candidate
has to stay un-double-booked — so the exact part (nothing overlaps) is enforced where it can be
and the remaining choice is a deterministic, explainable pass. Replacing the flow solver with a
greedy loop was rejected too: the flow fills more seats, which is the property the tests pin.

## 022 — Missing eligibility data fails closed

**Decision:** a role with a minimum age rejects a volunteer with no birthdate, and a required
credential rejects a volunteer with no record of it or one that lapsed, each with its own
reason string. The automated planner and the registration path agree on this.
**Rejected:** treating an absent value as "no objection" in the planner.
**Why:** the two paths disagreed: registering refused a missing birthdate while the planner
quietly treated it as eligible, so the plan offered a volunteer whose assignment the apply step
then refused. For a role that exists because of a safety requirement, unknown is not the same
as satisfied.

## 023 — Generated data is labeled and reproducible

**Decision:** the demo workspace and the locale catalogs are marked `linguist-generated` in
`.gitattributes`, and `pnpm check:generated` regenerates them and fails on any diff.
**Rejected:** reading them as hand-maintained source, and moving them to new paths mid-project.
**Why:** a reviewer should be able to tell authored code from generated data at a glance, and a
catalog that no longer matches its generator is a defect CI can catch for free. Paths stay put
so no import has to change for a labeling decision.

## 024 — The stack is not being rebuilt

**Decision:** CivicFlow keeps React 19, Vite, and Tauri 2 with the Rust core. Work goes into
unifying the data path and hardening the rules.
**Rejected:** a "carbon copy rebuild" in the same stack, and moving the core to TypeScript.
**Why:** a rebuild would reproduce the same screens and throw away what is hardest to redo —
the security hardening, the passing test suites, the accessibility audits, and the browser
preview that runs without an install. A rebuild is an onboarding answer to an architecture
question, and the architecture question is answered by this log.

## 025 — The matching policy is versioned data, not optimizer constants

**Decision:** what AutoRoster may do is an organization's own versioned document
(`organization_roster_policies`, migration 8): four optional workload limits, a rest gap, what
an unknown age or credential means, and five weights. The screen offers named priorities
(none/low/medium/high/top) that map to 0/5/10/15/35, validation runs on every save, the change
is audited as `policy.updated`, and every plan records the `policyVersion` that produced it.
**Rejected:** leaving the caps and weights as constants in the solver, and exposing raw
optimizer numbers in the interface.
**Why:** a nonprofit's staffing rules are its own — one organization caps a volunteer at one
shift a day, another has no cap at all — and a rule that cannot be seen cannot be defended
when a coordinator asks why the plan did what it did. Recording the version on each plan is
what keeps an old roster explainable after the rules change. Weight validation prevents the
one configuration that would make the score meaningless: priorities that add up past a perfect
match. A missing policy row means the shipped defaults, so an upgrade changes no behavior.

## 026 — "Why not?" is a counterfactual the solver runs, not a paragraph written about it

**Decision:** `explain::explain_candidate` answers a question about one seat by deciding the
questioned assignment before the solver runs (`plan_with_forced`) and comparing the two plans
on filled seats, required seats filled, total score and changed assignments.
**Rejected:** generating the answer with a language model, and hardening the smaller option of
reporting the two scores side by side.
**Why:** "Diego was eligible, but assigning him here would leave the Driver seat uncovered:
the plan fills 8 of 8 required seats instead of 7" is only true if the second plan was actually
solved. It is also deterministic, inspectable, and testable, which a generated sentence is not.
A forced seat is removed from the solver's pool entirely — otherwise the flow hands the same
seat to a second volunteer — and the volunteer who was moved is not offered anything else,
because the question is about one decision.

## 027 — A spreadsheet import is checked in full before it is written

**Decision:** `imports::preview` reads the file and reports what each row would do, and
`imports::apply` re-checks the file and refuses it whole while any row has a problem. Valid
rows are inserted in one transaction that also appends the `volunteers.imported` audit event.
**Rejected:** importing the good rows and returning the bad ones as a list to fix later, and
importing row by row so a coordinator can watch progress.
**Why:** a roster that is 80% of the file is worse than no roster, because nothing in the data
says which 20% is missing. Refusing the whole file also makes the operation idempotent from a
coordinator's point of view: fix the two bad lines, import the file again, and the accepted rows
appear exactly once. Preview and apply run the same code path, so what the screen shows is what
the write does.

## 028 — The roster read model travels in the snapshot, not in a second store

**Decision:** `WorkspaceSnapshot` carries a `roster` list read from SQLite, and the workspace
provider merges it into the volunteer list a screen renders, skipping anyone the authored seed
already describes.
**Rejected:** keeping imported volunteers only in the browser store, and writing a separate
frontend store of locally added people.
**Why:** the bundled seed authors the demo organization's people, including their service
history, while SQLite owns everyone added since — an account created on this device, and now an
imported file. Two sources already existed, so the fix is that the database's half reaches the
same screens rather than a third place to look. A seeded person keeps the seed's richer record;
anyone else reads as "nothing recorded yet" instead of borrowing another volunteer's numbers.

## 029 — A series owns the shifts it generated

**Decision:** a repeating shift is a `shift_series` row plus the shifts it produced, each
carrying `series_id` and the occurrence date it stands for. Topping up adds only the
occurrences the calendar is missing, and a retime is scoped to the next shift or to the rule
and every shift it made.
**Rejected:** cloning a shift N times with no parentage, and matching instances by comparing
timestamps when a rule changes.
**Why:** "this week's shift moved, the rest did not" and "we added a week" are normal
coordinator requests, and both are unanswerable without parentage. Timestamps move; an
occurrence date does not, so a top-up can tell which weeks already exist instead of
generating a second copy of them. Deleting the series deletes its shifts together and refuses
a series somebody is already registered for.

## 030 — Waitlist order is the fairness rule, eligibility is the qualification rule

**Decision:** the replacement recommendation walks the waiting line in order and returns the
first person who passes the same registration gate a sign-up goes through. Skipped people keep
the reason they were skipped, and that sentence is shown and audited.
**Rejected:** ranking by suitability score, and promoting the first entry that happens to be
eligible without saying who was passed over.
**Why:** a waitlist is a promise about order, so quietly reordering it by preference would make
the queue meaningless. Qualification still has to come first — a lapsed credential means a seat
cannot be filled by that person — so the two rules are separated and the outcome is explained
rather than asserted. Promotion itself still goes through the workflow command, which re-checks
instead of trusting the caller.

## 031 — A locked assignment is never moved by a plan

**Decision:** `registrations.locked` is set by a coordinator and read by recovery and
AutoRoster. The lock records who set it and when.
**Rejected:** warning about a move after the fact, and keeping locks only in the browser.
**Why:** the optimizer's job is to be helpful, not to overrule a person who already decided
something about a specific volunteer. A lock has to survive a reload and reach the planner, so
it lives on the row. Both planners treat it as fixed and report the seats they could not fill
because of it.

## 032 — Reminders are rules with an audit trail, not messages

**Decision:** reminders are `notification_rules` rows — trigger, offset, audience, switch — and
every notification records the rule that produced it. Running the generation pass twice writes
the due reminder once.
**Rejected:** a scheduler daemon, and an email/SMS integration.
**Why:** the product is a standalone desktop application, so "did this alert have a reason?" has
to be answerable from the database rather than from a queue. A rule a coordinator turned off
stops writing, which is different from hiding rows that were already written. Idempotence keeps
the feed from filling with duplicates when the pass runs again.

## 033 — Read models describe rules; they do not predict people

**Decision:** retention signals, engagement metrics, credential readiness, and milestones are
computed in Rust as counts and rates over stored rows. Each signal names its threshold in the
reason it carries, along with the history that produced it and a suggested action.
**Rejected:** a fitted "attrition risk" score, a leaderboard, and an opaque ranking.
**Why:** "Nico has not served in 94 days and completed 7 food-access shifts, so send the
food-access opportunities" is something a coordinator can act on and defend. A score would be
a number nobody can explain, and the rubric rewards decisions a judge can trace.
