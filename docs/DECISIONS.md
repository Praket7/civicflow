# Decision log

Short entries, newest last. Each records the alternative that was rejected, because that
is what a judge or maintainer will ask about.

## 001 — Tauri 2 instead of a web-only app

**Decision:** ship a Tauri 2 desktop app with a Rust core.
**Rejected:** Electron (bundles Chromium, ~100 MB, heavier memory) and a hosted web app
(a venue wifi failure ends the demo).
**Why:** the build plan's offline-first requirement and the Coding & Programming rubric's
emphasis on a real backend. Rust is also where coverage rules are tested, so the UI cannot
invent numbers.

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
**Why:** the reference mock's 91 % card does not match its own bars. Rather than fake
agreement, each number gets a precise definition and a label that says which it is. Defect
recorded in [VISUAL_QA.md](VISUAL_QA.md).

## 005 — Chart rendered with CSS bars, not Recharts

**Decision:** the weekly coverage chart is a CSS grid of labelled bars with a details table.
**Rejected:** Recharts for this one visual.
**Why:** seven labelled values need no scale library, and CSS keeps the visual exactly on
the reference while shipping a real table alternative. Recharts remains the plan's choice
for the reporting phase, where axes and tooltips earn their weight.

## 006 — Notifications persist read state, not just UI state

**Decision:** `mark_notification_read` writes `read_at` and an `audit_events` row in one
transaction; the browser preview mirrors this in localStorage.
**Rejected:** a `useState` toggle.
**Why:** a coordinator reopening the app should not see handled alerts again, and every
write must be auditable (build-plan rule 4).

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
returns a full `WorkspaceSnapshot`. The React provider caches that snapshot and serialises
write responses.
**Rejected:** keeping the localStorage session as a second writer alongside Mission Control
and notifications. That made a reload resurrect stale local copies and split the audit trail
between two stores.
**Why:** the build plan requires the core to be authoritative and every change to be
auditable. A single snapshot also makes cross-screen consistency testable in one place.

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
**Why:** the schema already has 31 related tables, foreign keys, transactions, audit events,
validated backups and a restore path. The NYS rubric scores appropriate, secure data storage
and a dynamic backup feature; the local database supplies both without a network dependency.
The browser preview remains an explicitly selected fallback, never a second writer inside the
desktop shell.

## 014 — Interface copy is translated at build time, not at runtime

**Decision:** a Babel pre-plugin rewrites static JSX text and copy props to `t("English")`
keys, and the app loads one committed JSON catalogue for the chosen locale. Dates come from
date-fns or an Intl fallback; document direction flips for Arabic, Hebrew, Persian, and Urdu.
**Rejected:** translating in the browser on every load, or wrapping only a handful of
navigation labels and calling the product localised.
**Why:** runtime translation needs a network at a venue where wifi may fail, adds latency to
every render, and produces different copy for the same screen on different runs. Build-time
catalogues are deterministic, reviewable in the repository, and keep proper nouns, addresses,
and user-entered notes untouched. The 60 catalogues ship inside the bundle, so the language
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
**Why:** the rubric and the product both rest on a local-first, offline workspace, and the
Rust core needs a local account to enforce roles against. Keeping identity hosted and records
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
