import { spawnSync } from "node:child_process";

/**
 * Builds the binary the native suite drives. The suite covers the local account
 * flow — the six-digit code printed in the app — so hosted auth has to be off.
 * CI has no .env.local and gets that for free; a developer machine with the
 * Supabase keys does not, and the sign-up test then waits for a code panel the
 * hosted path never renders. Empty variables win over .env.local in Vite.
 */
const result = spawnSync(
  process.platform === "win32" ? "pnpm.cmd" : "pnpm",
  ["exec", "tauri", "build", "--debug", "--no-bundle"],
  {
    stdio: "inherit",
    env: { ...process.env, VITE_SUPABASE_ANON_KEY: "" },
  },
);

process.exit(result.status ?? 1);
