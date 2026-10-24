import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const appBinary = path.resolve("src-tauri/target/debug/civicflow");

// The native suite runs against a throwaway workspace. Pointing the app at this
// directory is preferable to deleting the real app-data folder, which holds the
// user's own demo work.
const dataDir = path.resolve(".wdio-data");
process.env.CIVICFLOW_DATA_DIR = dataDir;

// WebKit stores localStorage outside the app-data folder. Clearing it before
// launch keeps the "no session" assertion deterministic between runs.
const webkitData = path.join(os.homedir(), "Library", "WebKit", "org.feedmore.civicflow");

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
      },
    ],
  ],
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: {
    timeout: 90_000,
  },
  waitforTimeout: 15_000,
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 1,
  onPrepare() {
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(webkitData, { recursive: true, force: true });
  },
};
