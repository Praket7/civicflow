import fs from "node:fs";
import path from "node:path";

const appBinary = path.resolve("src-tauri/target/debug/civicflow");

// The native suite runs against a throwaway workspace. Pointing the app at this
// directory is preferable to deleting the real app-data folder, which holds the
// user's own demo work.
const dataDir = path.resolve(".wdio-data");
process.env.CIVICFLOW_DATA_DIR = dataDir;

// The webview store is shared with the installed app, so the suite must not
// delete it: doing so signs the real app out and can erase a sign-in hand-off
// that was in flight while the tests ran. A fresh database is enough to keep
// the "no session" assertion honest — a token from the old run no longer
// resolves, so the app still lands on the sign-in screen.

export const config = {
  runner: "local",
  specs: ["./tests/e2e/**/*.spec.mjs"],
  maxInstances: 1,
  capabilities: [
    {
      browserName: "tauri",
      "tauri:options": {
        application: appBinary,
      },
    },
  ],
  services: [
    [
      "@wdio/tauri-service",
      {
        driverProvider: "embedded",
        appBinaryPath: appBinary,
        // The app's own stderr is the only place a Rust panic shows up.
        captureBackendLogs: true,
      },
    ],
  ],
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: {
    // Every element lookup and click waits out the driver's 5s window-state
    // probe, which never answers in this app. The longest flow — create an
    // account, answer setup, join an organization, sign out, sign back in —
    // runs a hundred of those probes, so it needs several minutes of its own.
    timeout: 480_000,
  },
  waitforTimeout: 15_000,
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 1,
  onPrepare() {
    fs.rmSync(dataDir, { recursive: true, force: true });
  },
};
