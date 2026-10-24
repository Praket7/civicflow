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

# Phase 3 — Design System, App Shell, Navigation, and Accessibility Baseline

## Outcome

Build the **real CivicFlow UI foundation** from the approved 42-screen references before feature pages multiply.

By the end:

- app shell matches the design language
- desktop layout works at 1600×1000 and approximately 1024×720
- global routing/navigation exists
- design tokens are centralized
- reusable components exist
- keyboard and focus behavior is defined
- the 42 routes can render placeholders without inconsistent one-off styling
- accessibility tests are already blocking obvious regressions

---

## 1. Implement design tokens first

Create:

```text
src/styles/tokens.css
src/styles/global.css
```

Tokens from the approved spec:

```css
:root {
  --color-navy: #071b32;
  --color-navy-raised: #0d2947;
  --color-canvas: #f5f1e9;
  --color-paper: #fffdf8;

  --color-cobalt: #315cff;
  --color-lime: #c8ff45;
  --color-coral: #ff655a;
  --color-orange: #ff9a32;
  --color-yellow: #ffc83d;
  --color-violet: #7857ff;
  --color-teal: #18bfa7;
  --color-cyan: #45c9ff;

  --color-success: #21b66f;
  --color-critical: #ed4e4e;
}
```

Also create semantic aliases:

```css
--surface-canvas
--surface-paper
--surface-raised
--text-primary
--text-secondary
--action-primary
--status-success
--status-warning
--status-critical
```

Components should consume semantic tokens rather than littering literal hex values.

---

## 2. Typography

Use the approved pair:

```text
Geist Sans — UI
Source Serif 4 — editorial/impact headings
Geist Mono — technical IDs/codes
```

Bundle fonts with the application only if their licenses allow redistribution. Otherwise use suitable system/open alternatives and document the choice.

Create typography classes/tokens:

```text
display-xl
page-title
section-title
body
label
caption
metric
mono-code
```

Use tabular numerals for aligned metrics.

---

## 3. Build the desktop shell

Create:

```text
src/app/AppShell.tsx
src/components/navigation/Sidebar.tsx
src/components/navigation/TopBar.tsx
src/components/navigation/CommandPalette.tsx
src/components/layout/Inspector.tsx
```

Coordinator shell and volunteer shell should share primitives but expose different navigation.

The sidebar should be:

```text
220px expanded
~58px collapsed
```

Main content must use:

```css
min-width: 0;
overflow: auto;
```

Never let wide tables force the entire Tauri window off-screen.

---

## 4. Define routing

Create route groups:

```text
/volunteer/*
/coordinator/*
/system/*
```

Example:

```text
/volunteer/home
/volunteer/discover
/volunteer/schedule
/volunteer/hours

/coordinator/mission-control
/coordinator/schedule
/coordinator/volunteers
/coordinator/coverage
/coordinator/reports

/system/settings
/system/accessibility
```

Use route metadata:

```ts
{
  title,
  role,
  shortcut?,
  navigationSection,
  searchKeywords
}
```

The command palette can search this metadata later.

---

## 5. Component primitives

Implement these before page-specific clones:

```text
Button
IconButton
TextField
Select
Checkbox
Switch
Tabs
Dialog
Popover
Tooltip
SearchField
StatusBadge
Avatar
PersonChip
Metric
DataTable
FilterToken
PhotoCard
EmptyState
ErrorNotice
Toast
Inspector
Drawer
CoverageMeter
SmartExplanation
```

For complex interaction primitives, use a mature accessibility-focused primitive library if helpful, but CivicFlow owns:

```text
layout
color
spacing
typography
motion
visual identity
```

Do not import a full visual theme that makes the app look like every other SaaS project.

---

## 6. Accessibility is part of each primitive

Use semantic HTML first.

Tests should query by:

```text
role
name
label
text
```

not `data-testid` by default.

React Aria's testing guidance emphasizes semantic queries because accessibility semantics are more stable than DOM implementation details.

For every primitive:

```text
keyboard behavior
focus behavior
accessible name
disabled state
error state
high-contrast appearance
reduced-motion behavior
```

---

## 7. Add accessibility automation

Install/configure:

```text
jest-axe
```

Component test example:

```ts
const { baseElement } = render(<DialogExample />);
expect(await axe(baseElement)).toHaveNoViolations();
```

Important limitation:

`jest-axe` cannot guarantee accessibility and jsdom cannot reliably evaluate actual painted contrast.

Therefore CivicFlow uses three layers:

```text
1. semantic unit tests
2. real-browser/native E2E accessibility checks
3. manual keyboard + screen-reader + zoom review
```

Never claim "WCAG compliant" just because axe is green.

---

## 8. Build responsive desktop behavior

References are 1600×1000.

Production requirements:

```text
ideal: 1440–1600 wide
supported: approximately 1024×720 and above
```

For smaller desktop windows:

- inspector collapses into drawer
- sidebar can collapse
- table columns can hide secondary metadata
- main page scrolls
- fixed toolbars stay usable
- primary action remains visible

Do **not** shrink text to 9px to make everything fit.

---

## 9. Command palette

Implement `Cmd/Ctrl + K`.

Start with:

```text
route navigation
create opportunity
find volunteer
open settings
start kiosk
```

Later phases add data-backed results.

Keyboard requirements:

```text
Cmd/Ctrl + K opens
Escape closes
ArrowDown/ArrowUp moves
Enter selects
focus restores to prior element on close
```

---

## 10. Create route placeholders for all 42 planned views

This is not wasted work.

Each placeholder proves:

- route works
- navigation highlights correctly
- title metadata works
- shell does not break

Use a development-only page registry.

Do not build final page content yet.

---

## 11. Visual QA process

For each component/page:

1. run at 1600×1000
2. compare against approved reference
3. run at 1440×900
4. run at 1024×720
5. test 125% text scale
6. test high contrast
7. test reduced motion
8. test keyboard-only

Create:

```text
docs/VISUAL_QA.md
```

Record intentional deviations from mockups.

---

## 12. Debugging this phase

### UI looks inconsistent
Stop adding CSS. Identify whether the missing value should be a token.

### Focus disappears
Inspect `:focus-visible`. Never globally disable outlines without a replacement.

### Dialog keyboard trap
Use a proven primitive or fix focus management before continuing.

### Large text overlaps
Do not cap with fixed heights. Use content-driven sizing/scroll.

### Tauri window differs from browser
Test both. The system WebView is the competition runtime.

---

## 13. Phase 3 test gate

Automated:

```text
[ ] each primitive has behavioral tests
[ ] form controls have accessible labels
[ ] dialog Escape/focus behavior passes
[ ] command palette keyboard behavior passes
[ ] axe component checks pass
[ ] all 42 routes render
[ ] no route throws
[ ] no TypeScript errors
```

Manual:

```text
[ ] complete keyboard loop through shell
[ ] visible focus everywhere
[ ] 125% text scale
[ ] high contrast preview
[ ] reduced motion
[ ] 1600×1000 visual check
[ ] 1024×720 visual check
```

---

## 14. Definition of done

Do not proceed while pages are still inventing their own buttons, cards, tables, or status styles.

Tag:

```bash
git tag phase-03-design-system
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
