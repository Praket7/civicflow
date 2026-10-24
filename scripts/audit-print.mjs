#!/usr/bin/env node
/**
 * Print audit: proves the certificate and the impact report still print content.
 *
 * A stylesheet that hid `body *` used to blank every page except the certificate.
 * jsdom cannot evaluate print CSS, so this check runs the real app in headless
 * Chrome under print media, asserts the key surfaces are visible with their text
 * intact, and renders a PDF that must clear a size floor no blank page can reach.
 *
 * Usage:
 *   pnpm audit:print                    # starts a private Vite server on :5199
 *   pnpm audit:print -- --base http://localhost:5173
 *   pnpm audit:print -- --best-effort  # skip when Chrome is unavailable (verify.sh)
 *
 * Flags: --base <url> --port <cdp port> --out <dir> --best-effort
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
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
const CDP_PORT = Number(flag("port", "9344"));
const SERVER_PORT = Number(flag("server-port", "5199"));
const OUT = flag("out", path.join(os.tmpdir(), `civicflow-print-audit-${process.pid}`));

const CHROME_CANDIDATES = [
  process.env.CHROME,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);
const chromePath = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));

if (!chromePath) {
  const message = "Print audit needs headless Chrome (set CHROME to its binary).";
  if (bestEffort) {
    console.warn(`Skipping: ${message}`);
    process.exit(0);
  }
  console.error(message);
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function assertCivicFlow(base) {
  const response = await fetch(base);
  const html = await response.text();
  if (!html.includes("CivicFlow")) {
    throw new Error(`${base} is responding but is not the CivicFlow app`);
  }
}

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

// ---------------------------------------------------------------- Vite server

let server = null;
async function ensureServer() {
  if (explicitBase) {
    const base = explicitBase.replace(/\/$/, "");
    if (!(await waitForHttp(base, 1000))) {
      throw new Error(`No app responding at ${base}. Start the dev server or omit --base.`);
    }
    await assertCivicFlow(base);
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
  const exited = new Promise((resolve) => server.once("exit", resolve));
  const ready = await Promise.race([
    waitForHttp(base, 30_000).then((ok) => (ok ? "ready" : "timeout")),
    exited.then(() => "exited"),
  ]);
  if (ready !== "ready") {
    throw new Error(`Vite did not start on ${base} (${ready})`);
  }
  await assertCivicFlow(base);
  return base;
}

// ---------------------------------------------------------------------- Chrome

async function waitForDevtools(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (response.ok) return;
    } catch {
      // Chrome is still starting.
    }
    await sleep(250);
  }
  throw new Error(`Chrome never opened the DevTools port on ${CDP_PORT}`);
}

const chromeProfile = path.join(os.tmpdir(), `civicflow-print-profile-${process.pid}`);

// ------------------------------------------------------------------ Print checks

// A blank Chromium page prints about 1.3 kB; the certificate carries embedded
// fonts and the report carries photography and runs to megabytes.
const MIN_PDF_BYTES = 12_000;

const checks = [
  {
    name: "service certificate",
    path: "/volunteer/verification",
    selector: '[class*="paper"]',
    phrase: "This certifies that",
    gate: "verification",
  },
  {
    name: "impact report",
    path: "/coordinator/reports/preview",
    selector: '[class*="reportPaper"]',
    phrase: "Where the hours went",
    gate: null,
  },
];

function surfaceReport(selector, phrase) {
  return `(() => {
    const surface = document.querySelector(${JSON.stringify(selector)});
    if (!surface) return { missing: true };
    const ownText = (node) =>
      [...node.childNodes].some((child) => child.nodeType === 3 && child.textContent.trim().length > 0);
    const visible = [...surface.querySelectorAll("*")].filter((node) => {
      if (!ownText(node)) return false;
      const style = getComputedStyle(node);
      if (style.visibility === "hidden" || style.display === "none") return false;
      const box = node.getBoundingClientRect();
      return box.width > 1 && box.height > 1;
    }).length;
    const style = getComputedStyle(surface);
    const box = surface.getBoundingClientRect();
    const text = (surface.textContent || "").replace(/\\s+/g, " ").trim();
    return {
      missing: false,
      gate: document.body.dataset.printView ?? null,
      visibility: style.visibility,
      display: style.display,
      width: Math.round(box.width),
      height: Math.round(box.height),
      textLength: text.length,
      hasPhrase: text.includes(${JSON.stringify(phrase)}),
      visibleTextNodes: visible,
    };
  })()`;
}

let failures = 0;
const pdfs = [];

function check(condition, label, detail) {
  if (condition) return;
  failures += 1;
  console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
}

try {
  await fs.mkdir(OUT, { recursive: true });
  const base = await ensureServer();
  console.log(`Print audit against ${base}`);

  const chrome = spawn(
    chromePath,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--window-size=1600,1000",
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${chromeProfile}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  try {
    await waitForDevtools(20_000);
    const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    const page = targets.find((item) => item.type === "page");
    if (!page) throw new Error("Chrome opened no page target");

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", reject, { once: true });
    });

    let nextId = 1;
    const pending = new Map();
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !pending.has(message.id)) return;
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    });
    const send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    const evaluate = async (expression) => {
      const { result, exceptionDetails } = await send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (exceptionDetails) throw new Error(JSON.stringify(exceptionDetails));
      return result.value;
    };

    await send("Emulation.setDeviceMetricsOverride", {
      width: 1600,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });

    await send("Page.navigate", { url: base });
    await sleep(700);

    for (const target of checks) {
      console.log(`\n${target.name}`);
      await send("Runtime.evaluate", {
        expression: `localStorage.setItem("civicflow.auth.token", "${
          target.path.startsWith("/volunteer")
            ? "preview:user-maya:demo"
            : "preview:user-praket:demo"
        }"); void 0`,
      });
      await send("Page.navigate", { url: base + target.path });
      await sleep(1200);
      await send("Emulation.setEmulatedMedia", { media: "print" });
      await sleep(250);

      const surface = await evaluate(surfaceReport(target.selector, target.phrase));
      if (surface.missing) {
        failures += 1;
        console.error(`  FAIL ${target.selector} rendered nothing`);
        await send("Emulation.setEmulatedMedia", { media: "screen" });
        continue;
      }

      check(
        surface.gate === target.gate,
        "print gate",
        `expected ${target.gate}, got ${surface.gate}`,
      );
      check(
        surface.visibility !== "hidden" && surface.display !== "none",
        "surface visible under print media",
        `visibility ${surface.visibility}, display ${surface.display}`,
      );
      check(
        surface.width > 200 && surface.height > 200,
        "surface has print layout",
        `${surface.width}×${surface.height}`,
      );
      check(surface.hasPhrase, `contains “${target.phrase}”`);
      check(surface.textLength > 200, "substantial text", `${surface.textLength} characters`);
      check(
        surface.visibleTextNodes >= 8,
        "text nodes visible",
        `${surface.visibleTextNodes} visible`,
      );

      const { data } = await send("Page.printToPDF", {
        printBackground: true,
        preferCSSPageSize: true,
      });
      const pdf = Buffer.from(data, "base64");
      const file = path.join(OUT, `${target.name.replace(/\s+/g, "-")}.pdf`);
      await fs.writeFile(file, pdf);
      pdfs.push(file);
      check(
        pdf.length > MIN_PDF_BYTES,
        "PDF has printable content",
        `${pdf.length} bytes (floor ${MIN_PDF_BYTES})`,
      );
      console.log(
        `  ${surface.gate ? `gate=${surface.gate}` : "no gate"}, ${surface.visibleTextNodes} visible text nodes, ${pdf.length} byte PDF`,
      );

      await send("Emulation.setEmulatedMedia", { media: "screen" });
    }

    ws.close();
  } finally {
    chrome.kill();
  }
} catch (error) {
  failures += 1;
  console.error(`\nPrint audit could not run: ${error instanceof Error ? error.message : error}`);
} finally {
  if (server) {
    server.kill("SIGTERM");
    await sleep(300);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
  await fs.rm(chromeProfile, { recursive: true, force: true }).catch(() => {});
}

if (failures > 0) {
  console.error(`\n${failures} print check(s) failed. Output: ${OUT}`);
  process.exit(1);
}
console.log(`\nPrint audit passed: certificate and report both print content. Output: ${OUT}`);
