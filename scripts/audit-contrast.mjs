#!/usr/bin/env node
/**
 * WCAG contrast audit for every route, in light and dark theme.
 *
 * jsdom cannot composite colors, so the axe test in vitest disables the
 * color-contrast rule. This script does the compositing for real: it loads the
 * app in headless Chrome, walks every element that draws text, composites it
 * over its ancestor background stack, and reports anything below 4.5:1
 * (3:1 for text at 24px or 18.66px bold).
 *
 * Usage:
 *   pnpm audit:contrast                    # starts a private Vite server on :5202
 *   pnpm audit:contrast -- --base http://localhost:5173
 *   pnpm audit:contrast -- --best-effort   # skip when Chrome is unavailable
 *
 * Flags: --base <url> --out <file> --port <cdp port> --server-port <port> --best-effort
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
const OUT = flag("out", "contrast-report.json");
const PORT = Number(flag("port", "9333"));
const SERVER_PORT = Number(flag("server-port", "5202"));
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
  const message = "Contrast audit needs headless Chrome (set CHROME to its binary).";
  if (bestEffort) {
    console.warn(`Skipping: ${message}`);
    process.exit(0);
  }
  console.error(message);
  process.exit(1);
}

const routes = [
  ["01", "/coordinator/mission-control"],
  ["02", "/coordinator/autoroster"],
  ["03", "/coordinator/impact"],
  ["04", "/volunteer/discover"],
  ["05", "/volunteer/opportunities/community-food-distribution"],
  ["06", "/volunteer/schedule"],
  ["07", "/volunteer/profile"],
  ["08", "/volunteer/check-in"],
  ["09", "/coordinator/reports"],
  ["10", "/coordinator/opportunities/new"],
  ["11", "/coordinator/schedule"],
  ["12", "/volunteer/hours"],
  ["13", "/volunteer/impact"],
  ["14", "/volunteer/verification"],
  ["15", "/volunteer/shifts/sh-sat-food"],
  ["16", "/volunteer/saved"],
  ["17", "/volunteer/home"],
  ["18", "/volunteer/notifications"],
  ["19", "/coordinator/coverage"],
  ["20", "/coordinator/opportunities"],
  ["21", "/coordinator/opportunities/opp-food"],
  ["22", "/coordinator/shifts/sh-sat-food"],
  ["23", "/launch"],
  ["24", "/welcome"],
  ["25", "/sign-in"],
  ["43", "/create-account"],
  ["26", "/volunteer/onboarding"],
  ["28", "/coordinator/volunteers"],
  ["29", "/coordinator/volunteers/vol-maya"],
  ["30", "/coordinator/applications"],
  ["31", "/coordinator/credentials"],
  ["32", "/coordinator/attendance"],
  ["33", "/coordinator/kiosk"],
  ["34", "/coordinator/hours"],
  ["35", "/coordinator/reports/custom"],
  ["36", "/coordinator/insights"],
  ["37", "/coordinator/reports/preview"],
  ["38", "/coordinator/records"],
  ["39", "/coordinator/audit"],
  ["40", "/coordinator/backup"],
  ["41", "/coordinator/settings"],
  ["42", "/coordinator/accessibility"],
];

const AUDIT = String.raw`(() => {
  const parse = (value) => {
    const match = value && value.match(/rgba?\(([^)]+)\)/);
    if (!match) return null;
    const parts = match[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  const lum = (c) => {
    const channel = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
  };
  const ratio = (a, b) => {
    const l1 = lum(a);
    const l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  const describe = (el) => {
    const bits = [];
    let node = el;
    let depth = 0;
    while (node && node.nodeType === 1 && depth < 4) {
      const cls = (node.getAttribute("class") || "").split(" ").filter(Boolean).slice(0, 2).join(".");
      bits.unshift(node.tagName.toLowerCase() + (cls ? "." + cls : ""));
      node = node.parentElement;
      depth += 1;
    }
    return bits.join(" > ");
  };

  const results = [];
  const seen = new Set();
  for (const el of document.querySelectorAll("body *")) {
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none") continue;
    if (Number(style.opacity) === 0) continue;
    if (!el.offsetParent && style.position !== "fixed") continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    if (el.closest("[aria-hidden='true']") || el.closest(".visually-hidden")) continue;

    let text = "";
    for (const child of el.childNodes) {
      if (child.nodeType === 3) text += child.textContent;
    }
    text = text.replace(/\s+/g, " ").trim();
    if (text.length < 2) continue;
    if (style.textShadow !== "none" && style.textShadow.includes("rgb")) continue;

    const fg = parse(style.color);
    if (!fg) continue;

    const stack = [];
    let hasMedia = false;
    let node = el;
    while (node && node.nodeType === 1) {
      const s = getComputedStyle(node);
      if (s.backgroundImage && s.backgroundImage !== "none") hasMedia = true;
      // Hero panels layer a cover <img> plus a shade element as siblings, so the
      // background stack alone cannot see the photo behind the text.
      if (node.querySelector(":scope > img")) hasMedia = true;
      const parsed = parse(s.backgroundColor);
      if (parsed && parsed.a > 0) stack.push(parsed);
      if (parsed && parsed.a >= 0.99) break;
      node = node.parentElement;
    }
    let bg = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = stack.length - 1; i >= 0; i -= 1) bg = over(stack[i], bg);

    const size = parseFloat(style.fontSize);
    const weight = Number(style.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const min = large ? 3 : 4.5;
    const value = ratio(over(fg, bg), bg);
    if (value + 0.02 >= min) continue;

    const key = describe(el) + "|" + style.color + "|" + Math.round(value * 10) / 10;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      selector: describe(el),
      text: text.slice(0, 60),
      ratio: Math.round(value * 100) / 100,
      min,
      color: style.color,
      bg: "rgb(" + Math.round(bg.r) + "," + Math.round(bg.g) + "," + Math.round(bg.b) + ")",
      size,
      weight,
      hasMedia,
    });
  }
  return results;
})()`;

async function waitForDevtools() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
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
      if ((await fetch(url)).ok) return true;
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
  // Run Vite's own entrypoint rather than `pnpm exec vite`: the package-manager
  // wrapper stays alive through a signal and would leave the server behind.
  server = spawn(
    process.execPath,
    [
      path.join(root, "node_modules", "vite", "bin", "vite.js"),
      "--host",
      "127.0.0.1",
      "--port",
      String(SERVER_PORT),
      "--strictPort",
    ],
    {
      cwd: root,
      stdio: "ignore",
      env: { ...process.env, CI: "1" },
    },
  );
  if (!(await waitForHttp(base, 30_000))) throw new Error(`Vite did not start on ${base}`);
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
      `--user-data-dir=/tmp/civicflow-contrast-${process.pid}`,
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

  await send("Page.navigate", { url: BASE });
  await sleep(700);

  const report = {};
  let violations = 0;

  for (const theme of ["light", "dark"]) {
    for (const [number, routePath] of routes) {
      await send("Runtime.evaluate", {
        expression: `localStorage.setItem("civicflow.auth.token", "${
          routePath.startsWith("/volunteer") ? "preview:user-maya:demo" : "preview:user-praket:demo"
        }"); void 0`,
      });
      await send("Page.navigate", { url: BASE + routePath });
      await sleep(900);
      await send("Runtime.evaluate", {
        expression: `document.documentElement.dataset.theme = "${theme}"; void 0`,
      });
      await sleep(250);
      const { result } = await send("Runtime.evaluate", {
        expression: AUDIT,
        returnByValue: true,
      });
      const found = result.value ?? [];
      const text = found.filter((item) => !item.hasMedia);
      const media = found.filter((item) => item.hasMedia);
      violations += text.length;
      if (found.length)
        report[`${number}-${theme}`] = { number, path: routePath, theme, text, media };
      process.stdout.write(`${number} ${theme} ${text.length}/${media.length}\n`);
    }
  }

  await fs.writeFile(OUT, JSON.stringify(report, null, 1));
  ws.close();

  if (violations > 0) {
    console.error(
      `\n${violations} text/background pair(s) below WCAG AA. See ${OUT} for selectors.`,
    );
    process.exitCode = 1;
  } else {
    console.log(`\nNo contrast violations outside photography. Report: ${OUT}`);
  }
} finally {
  chrome?.kill();
  server?.kill();
}
