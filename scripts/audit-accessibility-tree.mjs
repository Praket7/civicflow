#!/usr/bin/env node
/**
 * Accessibility-tree audit.
 *
 * Screen readers consume Chromium's accessibility tree, not the DOM. This script
 * loads every route, reads the full AX tree over the DevTools protocol, and
 * fails when a route has no main landmark or level-one heading, or exposes an
 * interactive control with no accessible name.
 *
 * Usage:
 *   pnpm dev
 *   pnpm audit:a11y
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const bestEffort = args.includes("--best-effort");
const explicitBase = flag("base", null);
const OUT = flag("out", "accessibility-tree-report.json");
const PORT = Number(flag("port", "9335"));
const SERVER_PORT = Number(flag("server-port", "5201"));
const CHROME_CANDIDATES = [
  process.env.CHROME,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);
const CHROME = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));

if (!CHROME) {
  const message = "Accessibility-tree audit needs headless Chrome (set CHROME to its binary).";
  if (bestEffort) {
    console.warn(`Skipping: ${message}`);
    process.exit(0);
  }
  console.error(message);
  process.exit(1);
}

const routes = [
  ["01", "/coordinator/mission-control", "coordinator"],
  ["02", "/coordinator/autoroster", "coordinator"],
  ["03", "/coordinator/impact", "coordinator"],
  ["04", "/volunteer/discover", "volunteer"],
  ["05", "/volunteer/opportunities/community-food-distribution", "volunteer"],
  ["06", "/volunteer/schedule", "volunteer"],
  ["07", "/volunteer/profile", "volunteer"],
  ["08", "/volunteer/check-in", "volunteer"],
  ["09", "/coordinator/reports", "coordinator"],
  ["10", "/coordinator/opportunities/new", "coordinator"],
  ["11", "/coordinator/schedule", "coordinator"],
  ["12", "/volunteer/hours", "volunteer"],
  ["13", "/volunteer/impact", "volunteer"],
  ["14", "/volunteer/verification", "volunteer"],
  ["15", "/volunteer/shifts/sh-sat-food", "volunteer"],
  ["16", "/volunteer/saved", "volunteer"],
  ["17", "/volunteer/home", "volunteer"],
  ["18", "/volunteer/notifications", "volunteer"],
  ["19", "/coordinator/coverage", "coordinator"],
  ["20", "/coordinator/opportunities", "coordinator"],
  ["21", "/coordinator/opportunities/opp-food", "coordinator"],
  ["22", "/coordinator/shifts/sh-sat-food", "coordinator"],
  ["23", "/launch", "public"],
  ["24", "/welcome", "public"],
  ["25", "/sign-in", "public"],
  ["26", "/volunteer/onboarding", "volunteer"],
  ["27", "/coordinator/organization/setup", "coordinator"],
  ["28", "/coordinator/volunteers", "coordinator"],
  ["29", "/coordinator/volunteers/vol-maya", "coordinator"],
  ["30", "/coordinator/applications", "coordinator"],
  ["31", "/coordinator/credentials", "coordinator"],
  ["32", "/coordinator/attendance", "coordinator"],
  ["33", "/coordinator/kiosk", "coordinator"],
  ["34", "/coordinator/hours", "coordinator"],
  ["35", "/coordinator/reports/custom", "coordinator"],
  ["36", "/coordinator/insights", "coordinator"],
  ["37", "/coordinator/reports/preview", "coordinator"],
  ["38", "/coordinator/records", "coordinator"],
  ["39", "/coordinator/audit", "coordinator"],
  ["40", "/coordinator/backup", "coordinator"],
  ["41", "/coordinator/settings", "coordinator"],
  ["42", "/coordinator/accessibility", "coordinator"],
];

const INTERACTIVE = new Set([
  "button",
  "link",
  "textbox",
  "searchbox",
  "combobox",
  "checkbox",
  "radio",
  "switch",
  "tab",
  "menuitem",
  "slider",
  "spinbutton",
]);

async function waitForDevtools() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (response.ok) return;
    } catch {
      // Chrome is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Chrome never opened the DevTools port on ${PORT}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {
      // Not listening yet.
    }
    await sleep(250);
  }
  return false;
}

let server = null;
async function ensureServer() {
  if (explicitBase) {
    const base = explicitBase.replace(/\/$/, "");
    if (!(await waitForHttp(base, 1000))) {
      throw new Error(`No app responding at ${base}. Start the dev server or omit --base.`);
    }
    return base;
  }
  const base = `http://127.0.0.1:${SERVER_PORT}`;
  if (await waitForHttp(base, 800)) return base;
  server = spawn(
    "pnpm",
    ["exec", "vite", "--host", "127.0.0.1", "--port", String(SERVER_PORT), "--strictPort"],
    {
      cwd: root,
      stdio: "ignore",
      env: { ...process.env, CI: "1" },
    },
  );
  if (!(await waitForHttp(base, 30_000))) {
    throw new Error(`Vite did not start on ${base}`);
  }
  return base;
}

let BASE;
let chrome = null;

try {
  BASE = await ensureServer();
  chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--window-size=1600,1000",
      ...(process.env.CI ? ["--no-sandbox", "--disable-dev-shm-usage"] : []),
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=/tmp/civicflow-a11y-${process.pid}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", process.env.CI ? "inherit" : "ignore"] },
  );
  await waitForDevtools();
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const target = targets.find((item) => item.type === "page");
  if (!target) throw new Error("No page target");

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  await send("Accessibility.enable");
  await send("Page.navigate", { url: BASE });
  await sleep(700);

  async function waitForHeading(timeoutMs = 8000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const { result } = await send("Runtime.evaluate", {
        expression: '(document.querySelector("main h1, body > h1")?.textContent || "").trim()',
        returnByValue: true,
      });
      if (result.value) return;
      await sleep(200);
    }
  }

  const report = {};
  let failures = 0;

  for (const [number, path, role] of routes) {
    if (role !== "public") {
      await send("Runtime.evaluate", {
        expression: `localStorage.setItem("civicflow.auth.token", "${
          role === "volunteer" ? "preview:user-maya:demo" : "preview:user-praket:demo"
        }"); void 0`,
      });
    }
    await send("Page.navigate", { url: BASE + path });
    await waitForHeading();
    await sleep(250);

    const { nodes } = await send("Accessibility.getFullAXTree");
    const visible = nodes.filter((node) => !node.ignored);
    const hasMain = visible.some((node) => node.role?.value === "main");
    const heading = visible.find(
      (node) =>
        node.role?.value === "heading" &&
        node.properties?.some(
          (property) => property.name === "level" && property.value?.value === 1,
        ),
    );
    const unnamed = visible
      .filter((node) => INTERACTIVE.has(node.role?.value ?? ""))
      .filter((node) => !String(node.name?.value ?? "").trim())
      .slice(0, 10)
      .map((node) => ({ role: node.role?.value, nodeId: node.nodeId }));

    const bad = !hasMain || !heading || unnamed.length > 0;
    if (bad) {
      failures += 1;
      report[number] = { path, hasMain, heading: heading?.name?.value ?? null, unnamed };
    }
    process.stdout.write(
      `${number} ${bad ? "FAIL" : "ok"} main=${hasMain} h1=${heading ? "yes" : "no"} unnamed=${unnamed.length}\n`,
    );
  }

  await fs.writeFile(OUT, JSON.stringify(report, null, 1));
  ws.close();

  if (failures > 0) {
    console.error(`\n${failures} route(s) failed the accessibility-tree audit. See ${OUT}.`);
    process.exitCode = 1;
  } else {
    console.log(`\nEvery route exposes a main landmark, an h1 and named controls. Report: ${OUT}`);
  }
} finally {
  chrome?.kill();
  server?.kill();
}
