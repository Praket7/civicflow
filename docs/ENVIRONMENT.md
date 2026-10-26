# Environment

Recorded from this machine at the end of the foundation pass.

| Tool      | Version                        | Note                                                |
| --------- | ------------------------------ | --------------------------------------------------- |
| macOS     | 26.6.2 (25G089)                | arm64                                               |
| Node      | v26.7.2                        | `.node-version` pins 24 (.nvmrc 24, engines `>=22`) |
| pnpm      | 10.34.7                        | `packageManager` pins 10.34.7                       |
| Rust      | 1.99.0 (2026-07-21)            | stable, aarch64-apple-darwin                        |
| Cargo     | 1.99.0                         |                                                     |
| Tauri CLI | 2.12.x (npm `@tauri-apps/cli`) |                                                     |
| SQLite    | via `rusqlite` 0.37 (bundled)  | no system sqlite required                           |
| Xcode CLT | installed                      | required to link the desktop binary                 |

Dependency versions are resolved by `pnpm-lock.yaml` and `src-tauri/Cargo.lock`; both are
committed. Do not upgrade them casually before a release.

## Reproduce from scratch

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm verify
cd src-tauri/core && cargo test && cd ..
```

`pnpm verify` chains typecheck → lint → format check → vitest → web build → `cargo test`.
It fails on the first red check. `scripts/verify.sh` is the single command a reviewer or CI
runner needs.

## Offline demo

The app needs no network to run: fonts and photography are bundled under `public/fonts`
and `public/images`, and the database is local. The one exception is opt-in: a build with
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set sends sign-in, password-reset and
email-link requests to Supabase. Leave both empty for a local-only build and the app makes
no runtime request at all.
