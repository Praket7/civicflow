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

# Phase 1 — Repository and Engineering Foundation

## Outcome

At the end of this phase, CivicFlow is a real Tauri 2 desktop repository that:

- launches on the development machine
- builds both the React frontend and Rust backend
- has deterministic tooling
- has lint, format, typecheck, frontend tests, Rust tests, and a release-build smoke check
- has a clean Git history and a CI workflow
- contains the product/design documents already created
- has no application features yet beyond a verified shell

This phase is deliberately boring. A competition project becomes fragile when feature work starts before the toolchain is stable.

---

## 1. Create the repository

Create a new GitHub repository named:

```text
civicflow
```

Recommended visibility while developing:

```text
private
```

You can make it public later if desired.

Clone it locally and enter the directory.

Use the official Tauri scaffolder:

```bash
pnpm create tauri-app
```

Choose:

```text
Project name: civicflow
Frontend language: TypeScript / JavaScript
Package manager: pnpm
UI template: React
UI flavor: TypeScript
```

The Tauri docs recommend Vite for SPA frameworks such as React, which is the correct fit for CivicFlow's local desktop architecture.

Immediately run:

```bash
pnpm install
pnpm tauri dev
```

Do not continue until the native desktop window opens.

### First commit

```bash
git add .
git commit -m "chore: scaffold Tauri React TypeScript app"
```

Keep the generated `Cargo.lock`. Tauri explicitly recommends committing the application Cargo lockfile for deterministic builds.

Do **not** commit:

```text
node_modules/
dist/
src-tauri/target/
*.db
*.db-wal
*.db-shm
coverage/
test-results/
playwright-report/
wdio-logs/
```

---

## 2. Lock the development environment

Create:

```text
.node-version
rust-toolchain.toml
```

Use the current Node LTS you actually install and stable Rust.

Example:

```text
.node-version
24
```

Example:

```toml
# rust-toolchain.toml
[toolchain]
channel = "stable"
components = ["rustfmt", "clippy"]
```

Then record:

```bash
node --version
pnpm --version
rustc --version
cargo --version
pnpm tauri info
```

Paste the output into:

```text
docs/ENVIRONMENT.md
```

This is useful when a judge asks what environment you used and invaluable if a dependency breaks later.

---

## 3. Establish the repository structure

Move toward this structure immediately:

```text
civicflow/
├── .github/
│   └── workflows/
├── docs/
├── src/
│   ├── app/
│   ├── components/
│   ├── features/
│   ├── hooks/
│   ├── lib/
│   ├── routes/
│   ├── styles/
│   ├── test/
│   └── types/
├── src-tauri/
│   ├── capabilities/
│   ├── migrations/
│   └── src/
│       ├── commands/
│       ├── database/
│       ├── domain/
│       ├── services/
│       └── lib.rs
├── tests/
│   └── e2e/
├── package.json
├── pnpm-lock.yaml
└── README.md
```

Do not create empty directories just for aesthetics. Create them as the phase needs them.

Copy the existing planning documents into `docs/`:

```text
CIVICFLOW_PRODUCT_VISION.md
CIVICFLOW_UI_SYSTEM_AND_42_PAGE_SPEC.md
```

Also create:

```text
docs/DECISIONS.md
```

Use it as an Architecture Decision Record-lite file. Every time you make a meaningful technical choice, document:

```md
## YYYY-MM-DD — Decision title

**Decision:** ...
**Reason:** ...
**Alternatives considered:** ...
**Tradeoff:** ...
```

This becomes excellent judge evidence.

---

## 4. Add frontend quality tooling

Install the current compatible versions of:

```text
eslint
typescript-eslint
eslint-plugin-react-hooks
eslint-plugin-jsx-a11y
prettier
vitest
@testing-library/react
@testing-library/user-event
@testing-library/jest-dom
jsdom
```

Configure scripts:

```json
{
  "scripts": {
    "dev": "vite",
    "tauri": "tauri",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "format": "prettier --check .",
    "format:fix": "prettier --write .",
    "test": "vitest run",
    "test:watch": "vitest",
    "build:web": "tsc && vite build",
    "verify:web": "pnpm typecheck && pnpm lint && pnpm format && pnpm test && pnpm build:web"
  }
}
```

Create one test proving the harness works.

Example target:

```ts
it("renders the CivicFlow application shell", () => {
  render(<App />);
  expect(screen.getByRole("main")).toBeInTheDocument();
});
```

The exact test can change after routing is introduced.

---

## 5. Add Rust quality gates

From `src-tauri`:

```bash
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test
```

Create one small domain module and test so `cargo test` is not an empty ceremony.

Example:

```rust
pub fn app_name() -> &'static str {
    "CivicFlow"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_name_is_stable() {
        assert_eq!(app_name(), "CivicFlow");
    }
}
```

Later phases replace this trivial test with real domain tests.

---

## 6. Establish a single verification command

Add a root-level script that runs everything feasible locally.

Example `scripts/verify.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

pnpm typecheck
pnpm lint
pnpm format
pnpm test
pnpm build:web

pushd src-tauri >/dev/null
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test
popd >/dev/null
```

Add:

```json
"verify": "bash scripts/verify.sh"
```

On Windows, provide a PowerShell equivalent or invoke the individual commands.

The rule for the remainder of the project:

```text
No phase is complete until pnpm verify passes.
```

---

## 7. Create CI on day one

Create:

```text
.github/workflows/ci.yml
```

Jobs should eventually include:

```text
frontend-quality
rust-quality
build-smoke
```

Initial CI:

1. checkout
2. install Node LTS
3. enable pnpm cache
4. install Rust stable
5. install platform dependencies required by Tauri
6. `pnpm install --frozen-lockfile`
7. `pnpm typecheck`
8. `pnpm lint`
9. `pnpm test`
10. `cargo fmt --check`
11. `cargo clippy`
12. `cargo test`
13. Tauri debug/release build smoke test

The official `tauri-action` repository documents using the action to test Tauri build pipelines and later upload release artifacts. Use that official action rather than inventing a custom release pipeline.

Do not make CI multi-platform on the first hour if it blocks progress. Start with your development OS plus Ubuntu if convenient. Expand to Windows/macOS in Phase 9.

---

## 8. Create issue and branch conventions

Use issues even if you are the only developer.

Labels:

```text
feature
bug
testing
a11y
algorithm
database
design
competition
P0
P1
P2
```

Branch naming:

```text
feat/volunteer-profile
feat/autoroster
fix/overlapping-shifts
test/backup-restore
```

Commit prefixes:

```text
feat:
fix:
test:
refactor:
docs:
chore:
```

Avoid giant commits. A judge inspecting your repository should see an understandable development history.

---

## 9. Debugging procedure for Phase 1

If `pnpm tauri dev` fails:

### A. Frontend starts but Tauri does not
Run:

```bash
pnpm tauri info
cargo check --manifest-path src-tauri/Cargo.toml
```

Read the first compiler error, not the final cascade.

### B. Blank native window
Check:

```text
Vite dev server URL
tauri.conf frontend devUrl
browser console
terminal Rust logs
```

### C. Rust rebuild loop
Ensure Vite ignores `src-tauri/**` as recommended by Tauri's frontend guidance.

### D. CI differs from local
Compare:

```text
Node version
pnpm version
Rust toolchain
lockfiles
system packages
environment variables
```

Never "fix" CI by disabling a test you do not understand.

---

## 10. Phase 1 tests

Required:

```text
[ ] React test harness passes
[ ] TypeScript typecheck passes
[ ] ESLint passes
[ ] formatting check passes
[ ] cargo fmt passes
[ ] cargo clippy has zero warnings
[ ] cargo test passes
[ ] Vite production build passes
[ ] Tauri development app opens
[ ] Tauri build smoke test passes
[ ] CI passes from a fresh checkout
```

Manual:

```text
[ ] Resize window to 1600×1000
[ ] Resize to approximately 1024×720
[ ] App does not crash
[ ] DevTools opens in development
[ ] No console errors on boot
```

---

## 11. Definition of done

Phase 1 is done only when:

- repository can be cloned to a clean machine and built from instructions
- `pnpm verify` is green
- CI is green
- lockfiles are committed
- product/design docs live in the repo
- no CivicFlow business feature has been prematurely hacked into `App.tsx`

Create tag:

```bash
git tag phase-01-foundation
```

Then begin Phase 2.
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
