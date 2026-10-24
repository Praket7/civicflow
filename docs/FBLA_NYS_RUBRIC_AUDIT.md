# NYS FBLA SLC rubric audit — Coding & Programming

Audited against the **2026-27 New York State High School Competitive Events Guidelines**
(updated September 2026), event **Coding & Programming**, pages 47–51.

Sources:

- NYS FBLA SLC page: <https://www.nysfbla.org/conferences/slc/>
- NYS 2026-27 complete guidelines: <https://www.nysfbla.org/wp-content/uploads/2026/10/26-27-NYS-FBLA-Complete-Competitive-Events-Guidelines.pdf>
- National event page: <https://www.fbla.org/competitive-events/coding-programming/>

The event is a team of 1–3 with a **prejudged project URL (200 points)** and a **3-minute setup,
7-minute presentation, 3-minute Q&A (110 points)**. The topic is _Serving the Community:
Nonprofit Volunteer Management_. The app addresses recruiting, organizing, scheduling, records,
participation and reporting for both volunteers and organization leaders.

> The scores below are a self-audit against the top band of each row, with the evidence a judge
> can open. They are not an official award. Presentation delivery and the publicly viewable URL
> are release actions, not properties of the source tree.

## Prejudged asset — target 200/200

| Criterion                          | Top-band requirement                                                     | Points | Evidence                                                                                                                                                                                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------ | -----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Appropriate identifiers            | Identifiers show advanced knowledge; accurate in every instance          |     20 | Rust domain types (`WorkspaceSnapshot`, `RosterPlan`, `CoverageStatus`) and TypeScript command map in `src/lib/workspace/repository.ts`; no one-letter or ambiguous public identifiers.                                                                                            |
| Commentary                         | Comments assist the user through testing; logical and useful             |     20 | Module-level design notes in `src-tauri/core/src/{matching,workflows,domain,backups}.rs`, `src/lib/workspace/session.tsx`, and `src/features/schedule/SchedulePage.tsx`. Comments explain invariants, not syntax.                                                                  |
| Program documentation              | Error-free documentation that invites advanced features                  |     20 | [README](../README.md), [ARCHITECTURE](ARCHITECTURE.md), [DATA_MODEL](DATA_MODEL.md), [MATCHING_ENGINE](MATCHING_ENGINE.md), [METRICS](METRICS.md), [SECURITY](SECURITY.md), [TESTING](TESTING.md), [USER_GUIDE](USER_GUIDE.md), [DEMO](DEMO.md), plus in-app **Help** at `/help`. |
| Concise, no unnecessary complexity | No unnecessary steps; at least one if-then sequence saves the user steps |     20 | One `WorkspaceRepository` boundary; one read model; role coverage and seat fill are separate named rules. The kiosk accepts a live code, the help page routes directly to the next step, and the schedule defaults to the highest-risk selection instead of forcing a search.      |
| Data storage                       | Clear, secure, dynamic backup                                            |     20 | SQLite with 31 related tables, foreign keys, WAL, transaction-scoped writes, audit events, online backups, validation and restore. `pnpm db:verify` inspects the live file. See [DATA_MODEL](DATA_MODEL.md) and decision 013 in [DECISIONS](DECISIONS.md).                         |
| Logical program sequence           | Logical and error-free; if-then sequences                                |     20 | `register → cancel → waitlist promotion → check-in → check-out → hours approval → verification`; each transition validates the prior state in Rust before writing. `tests/lifecycle.rs` pins the sequence.                                                                         |
| Program use and navigation         | No navigation errors; interactive help                                   |     20 | Sidebar, command palette (`⌘K`), breadcrumb-free page headers, and a real `/help` page with coordinator and volunteer paths, shortcuts, FAQ and direct links. No dead Help link remains.                                                                                           |
| Program results                    | Results update dynamically and are error-free                            |     30 | Every workflow command returns a fresh snapshot; screens derive from it. 110 frontend tests and 49 Rust tests; 22 browser flows and 9 persistence checks passed.                                                                                                                   |
| Output reports                     | Reports customizable and analyzable                                      |     30 | Reports screen, custom report builder with allow-listed fields, CSV and PDF export, saved views, and Rust report tests.                                                                                                                                                            |

**Self-audit: 200/200 target band.**

## Presentation — target 110/110

| Criterion                          | Top-band requirement                                         | Points | Evidence / rehearsal note                                                                                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------ | -----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coding language selection          | Industry terminology and project-needs rationale             |      5 | Rust is the authority for constraints, matching and persistence; React/TypeScript is the UI; Tauri is the thin native shell. Rehearse the two-sentence “why,” not a language advertisement. |
| Comments, naming, formatting       | Logical, useful and complete during the demo                 |      5 | Same evidence as the commentary row; point to `matching.rs` and the repository command map.                                                                                                 |
| Modular design                     | Advanced knowledge of programming                            |     10 | Independent `civicflow-core` crate, thin IPC shell, repository seam, feature folders, shared primitives.                                                                                    |
| UX design and accessibility        | Design rationale, user journey and accessibility highlighted |     10 | [VISUAL_QA](VISUAL_QA.md), [ACCESSIBILITY](ACCESSIBILITY.md), the Accessibility studio, visible focus, text scaling, high contrast, reduced motion and table alternatives.                  |
| Intuitive interface / instructions | Intuitive with clear instructions                            |      5 | In-app Help, page descriptions, contextual empty states, kiosk instructions and schedule hints.                                                                                             |
| Navigation                         | Interactive help and no navigation errors                    |      5 | Sidebar, command palette, Help, mobile drawer, all 42 routes resolve.                                                                                                                       |
| Input validation                   | Syntactic and semantic validation                            |      5 | Rust validators reject impossible seats, roles, windows, minutes and transitions; form-level field errors; tested refusal paths.                                                            |
| Addresses the prompt               | Fully addresses the topic and explains the correlation       |     10 | Recruiting, opportunities, scheduling, attendance, hours, verification, records, reports, impact and backups all target nonprofit volunteer management.                                     |
| Presentable report                 | Customizable and analyzable                                  |     10 | Custom report builder, CSV/PDF, saved views, chart tables.                                                                                                                                  |
| Data storage                       | Arrays/lists and variable scope used appropriately           |      5 | Normalized tables, typed DTOs, ordered role arrays, deterministic waitlist positions, scoped Rust functions.                                                                                |
| Presentation delivery              | Organized, confident, accurate Q&A                           |     40 | [DEMO.md](DEMO.md) is the 3/7/3 beat sheet. This row can only be earned live; rehearse it on the competition machine.                                                                       |

**Self-audit: 110/110 target band, conditional on rehearsal and the live Q&A.**

## Gaps found by this audit and closed

1. **Help was a dead end.** The sidebar’s Help item pointed at `/welcome`. It now opens a real
   `/help` page with coordinator and volunteer journeys, keyboard shortcuts, data explanation,
   FAQ and direct routes.
2. **Schedule was visually flat and the calendar rhythm was weak.** Rebuilt around a five-band
   two-hour grid, a wider calendar, a live selected-shift rail, role-level coverage, a month
   navigator, real cause and role-gap filters, week totals, and a default selection of the next
   relevant shift.
3. **Database evidence was only in prose.** Added `pnpm db:verify`, a read-only check of the
   live SQLite file: integrity, schema version, 32 required tables, foreign keys and record
   counts.
4. **The demo clock was described as Monday.** October 13, 2026 is a Tuesday; corrected in
   [DEMO.md](DEMO.md), along with the exact Settings labels.
5. **The schema decision was implicit.** Added decision 013: SQLite is the production store;
   Supabase is deliberately not a second source of truth for an offline single-tenant app.

## Release gates that remain human actions

- **Public program URL.** NYS requires the prejudged project URL to be viewable by judges. The
  desktop app is the production build; the browser build is a functional preview over the same
  seed. A public deployment or a downloadable desktop package must be published and tested from
  a non-developer machine before submission. A URL that judges cannot open scores zero. This
  repository prepares the build; it does not silently publish to a third-party account.
- **Presentation delivery (40 points).** Rehearse the 3-minute setup, 7-minute story and 3-minute
  Q&A in [DEMO.md](DEMO.md). Do not read the screen; demonstrate one write and one recovery.
- **Venue machine.** Confirm the native app launches offline, the database file is writable, and
  the backup snapshot from the rehearsal is present.

## Evidence commands

```bash
pnpm verify       # typecheck, lint, format, 110 tests, web build, print audit, Rust gates
pnpm db:verify    # live desktop SQLite: integrity, schema, 32 tables, counts
pnpm test         # frontend tests only
cargo test --manifest-path src-tauri/core/Cargo.toml
```
