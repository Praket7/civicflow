# Rebuild assessment: React, Vite, Tauri

Written 2026-10-25, before anyone spends a weekend rebuilding a stack the app is
already on.

## Verdict

Do not rebuild. CivicFlow is already a React + Vite + Tauri application, in
TypeScript, with a Rust core. A "carbon copy rebuild" would produce the same
stack, the same screens, and the same features, and would throw away the parts
that are hardest to get right: the security hardening, the 210 tests, the
accessibility audits, and the browser preview that judges use to look at the app
without installing anything.

If the real goal is "my teammate knows React and Vite and should be able to work
on this", that is an onboarding problem, not a rewrite problem. The handoff plan
is below. If the real goal is "less code", the ranked reductions are below too,
with measured line counts.

## What is already there

Measured from the tree, not from memory.

| Layer      | Choice                            | Version | Where                                    |
| ---------- | --------------------------------- | ------- | ---------------------------------------- |
| UI         | React                             | 19.3.1  | `src/main.tsx`, `src/features/`          |
| Build      | Vite                              | 8.3.5   | `vite.config.ts`                         |
| Language   | TypeScript, `strict`              | 6.0.3   | `tsconfig.json`                          |
| Desktop    | Tauri                             | 2.12.4  | `src-tauri/`                             |
| Routing    | React Router                      | 7.18.4  | `src/app/router.tsx`, 50 screens         |
| Server     | TanStack Query                    | 5.104.5 | `src/lib/workspace/queries.ts`           |
| Forms      | Controlled inputs, typed          | n/a     | sign-in, sign-up, create organization    |
| Charts     | Hand-built SVG and CSS bars       | n/a     | `src/components/ui/Charts.tsx`           |
| Styling    | CSS Modules over design tokens    | n/a     | `src/styles/tokens.css`, 50 module files |
| Storage    | SQLite through Rust (`rusqlite`)  | 0.37    | `src-tauri/core/src/db.rs`               |
| Fallback   | localStorage over the shared seed | n/a     | `src/lib/workspace/previewRepository.ts` |
| Tests      | Vitest, Testing Library, jest-axe | 5.0.5   | 180 tests in 18 files                    |
| Rust tests | `cargo test`                      | n/a     | 30 tests across six suites               |
| End to end | WebdriverIO + Tauri service       | 9.32.0  | `tests/e2e/`, macOS CI job               |

Every requirement in the request is met by the current code: React (19), Vite
(8), Tauri (2), one codebase, and the features already shipped.

## What a rebuild would cost

Hand-written lines in the tree today:

| Area                              | Files |     Lines |
| --------------------------------- | ----: | --------: |
| TypeScript and TSX under `src/`   |   129 |    34,462 |
| CSS Modules under `src/`          |    50 |    25,404 |
| Rust core and Tauri shell         |    14 |     8,909 |
| Rust test suites                  |     8 |     2,029 |
| Interface strings, 59 locales     |    59 | generated |
| Registered screens                |    50 |         — |
| Automated tests (frontend + Rust) |     — |       210 |

The locale catalogs are generated translation data, not authored code, so they
should not be held up as a complexity cost.

Effort to reach feature parity, honestly estimated:

- One developer, full time: three to four months for the screens, then another
  two to three weeks to rebuild the test, accessibility, and security coverage
  to the same level. Roughly 60,000 lines at 300 to 600 lines a day once review,
  tests, and fixes are counted.
- A team of three splitting UI, CSS, and Rust: six to eight weeks, with the same
  risk of divergence described below.

Gains at the end: none on the stack axis, because the stack does not change.

Risks, all of them on the surface this competition scores:

- **Security.** Argon2id hashing, a per-email lockout with a visible wait,
  32-byte OS-random session tokens, the `civicflow://` hand-off check, the
  packaged CSP, CSV formula neutralization, and backup validation were built and
  reviewed over several commits. A rewrite re-opens each one, and the first
  version of any of them is usually wrong.
- **Judged defects.** The last four commits fixed a sign-in that stranded users,
  setup screens that looked like a sign-out, a browser callback that could be
  replayed, and exports that a spreadsheet would execute. Those fixes live in the
  code that would be deleted.
- **Accessibility.** 180 tests include axe sweeps over the primary screens, plus
  print, 200% zoom, and accessibility-tree audits in CI. A fresh codebase starts
  at zero on all of them.
- **The demo path.** The browser build runs the same seed as the desktop app, so
  a judge can open a URL and see the real app. A native-only rebuild loses that,
  which is exactly what `DECISIONS.md` entry 002 was written to avoid.

One more thing worth saying plainly: the rubric's complexity point does not
reward a low line count. It rewards a product whose complexity is justified. A
rewrite reduces nothing a judge measures and risks several things a judge does.

## When a rewrite would be the right call

A rewrite is justified when at least one of these is true. None of them are true
here.

- The stack cannot be hired for, or cannot be run by the team that maintains it.
- The framework is out of support, or a dependency blocks a required feature.
- The build or test loop is so slow that changes cannot be shipped.
- There are no tests, so behavior cannot be protected during a migration.

If a rewrite ever does happen, the safe shape is a strangler, one route at a
time, behind the existing router. Keep `civicflow-core` and its tests, because
the Rust rules are the part the UI cannot fake, and keep the test suites as the
specification for each screen before it is ported.

## What "least code" means here

Ranked by lines saved against risk. The first item is already done.

1. **Dead and duplicated code, done.** About 680 unreachable lines removed, three
   initials helpers collapsed into `src/lib/initials.ts`, five cause palettes
   into `src/lib/causes.ts`, and one retired locale deleted.
2. **CSS is the real weight.** 25,404 lines across 50 modules is roughly 508
   lines per screen. The same card, table, empty-state, and toolbar rules are
   re-declared in several feature modules. Moving the shared shapes into
   `src/components/ui/ui.module.css` could remove an estimated 2,000 to 4,000
   lines. It is a medium-risk change: every screen needs a visual diff at 1280
   and 390 before it merges.
3. **The dual data layer stays.** `previewRepository.ts` is 1,527 lines that
   mirror the Rust reads over localStorage. It is also what lets the app run in a
   plain browser for design review and for judges. Removing it saves lines and
   costs the demo path. Keep it, and keep the boundary documented.
4. **The locale catalogs stay.** They are generated, they are a rubric win, and
   trimming them saves no authored code.
5. **The Rust tests stay.** 2,029 lines that prove coverage rules, auth, backups,
   and workflows. They are the security story in the pitch.

A dependency pass found four packages declared but never imported
(`recharts`, `react-hook-form`, `@hookform/resolvers`, `zod`). They are gone,
which removes about 40 transitive packages and one large chart library from the
install and the audit surface.

Realistic ceiling for a code-reduction pass without changing what the app does:
about 5% to 10% of authored lines, mostly CSS. That is a week of careful work,
not a rebuild.

## Handoff plan for a React + Vite teammate

Five days, no Rust toolchain required until day four.

**Day 1: run it.** `pnpm install`, then `pnpm dev`, then open
`http://localhost:5173`. The browser path uses the committed seed and
localStorage, so every screen works without the desktop build. Sign in as the
seeded coordinator to see the full navigation.

**Day 2: read eight files, in this order.** Each one answers a question the rest
of the app assumes.

| File                                                  | Answers                                         |
| ----------------------------------------------------- | ----------------------------------------------- |
| `src/main.tsx`                                        | What mounts, and which providers wrap it        |
| `src/app/router.tsx`                                  | How a URL becomes a screen, and who may see it  |
| `src/app/routes.ts`                                   | The single registry of screens, roles, keywords |
| `src/lib/workspace/repository.ts`                     | Where data comes from, and the one fork         |
| `src/lib/workspace/session.tsx`                       | How writes are serialized and re-rendered       |
| `src/lib/workspace/selectors.ts`                      | Every number the UI shows, as a pure function   |
| `src/components/ui/ui.module.css`                     | The shape of every button, card, and table      |
| `src/features/mission-control/MissionControlPage.tsx` | A full screen, start to finish                  |

**Day 3: change one thing end to end.** Pick a feature folder, follow page →
selector → action, and ship a small edit. The rule that keeps this simple: a
screen may read selectors and call actions, and may not keep its own copy of
workspace state.

**Day 4: learn the boundary.** React never talks to SQLite. It calls a repository
method; the Tauri shell resolves the session and role, then delegates to
`civicflow-core`.

| Task                     | Touch                                          |
| ------------------------ | ---------------------------------------------- |
| Copy, layout, new screen | `src/features/`, `src/components/`             |
| New derived number       | `src/lib/workspace/selectors.ts`               |
| New write                | `workflows.rs`, then the repository method     |
| New table or column      | a new migration in `src-tauri/core/migrations` |
| Sign-in or session rule  | `auth.rs`, then `src/lib/auth/`                |

**Day 5: ship a pull request.** `pnpm verify` runs typecheck, lint, Prettier, the
copy gate, the tests, the web build, and the three browser audits. CI adds the
Rust checks, the dependency audit, and a macOS end-to-end run. A change is ready
when those are green and the screen has been checked at 1280 and 390.

Suggested ownership while both of you work:

- Teammate: `src/features/`, `src/components/`, CSS modules, copy.
- You: `src-tauri/`, `src/lib/workspace/repository.ts`, auth, CI, release build.

That split keeps merge conflicts rare because the boundary is one file wide.

## Recommendation

Keep the codebase. Spend the rebuild time on the two things that still move the
score: a timed demo script and a judge-facing one-pager. If the code still feels
heavy after that, do the CSS consolidation in item 2 above, one feature folder
per pull request, with a visual diff on every screen.
