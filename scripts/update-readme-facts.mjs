/**
 * Rewrites the facts block in README.md from the code.
 *
 * Run straight after a schema or route change. `--check` compares without
 * writing so CI can fail when the README is stale.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const START = "<!-- CIVICFLOW_FACTS_START -->";
const END = "<!-- CIVICFLOW_FACTS_END -->";
const checkOnly = process.argv.includes("--check");

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const packageJson = JSON.parse(read("package.json"));
const db = read("src-tauri/core/src/db.rs");
const routeSource = read("src/app/routes.ts");

const schemaVersion = Number(db.match(/SCHEMA_VERSION: i64 = (\d+)/)?.[1]);
const migrationCount = readdirSync(new URL("../src-tauri/core/migrations", import.meta.url)).filter(
  (name) => name.endsWith(".sql"),
).length;
const tables = new Set();
for (const name of readdirSync(new URL("../src-tauri/core/migrations", import.meta.url))) {
  if (!name.endsWith(".sql")) continue;
  const sql = read(`src-tauri/core/migrations/${name}`);
  for (const match of sql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+([a-z_]+)/gi)) {
    tables.add(match[1]);
  }
}
const routeCount = (routeSource.match(/\n\s+number: \d+,/g) ?? []).length;

const block = [
  START,
  "| Fact | Value |",
  "| --- | --- |",
  `| Package version | \`${packageJson.version}\` |`,
  `| Registered routes | ${routeCount} |`,
  `| Migration files | ${migrationCount} |`,
  `| Database schema | v${schemaVersion} |`,
  `| Application tables | ${tables.size} |`,
  END,
].join("\n");

const readmePath = new URL("../README.md", import.meta.url);
const readme = readFileSync(readmePath, "utf8");
const start = readme.indexOf(START);
const end = readme.indexOf(END);
if (start === -1 || end === -1) {
  console.error(`README.md is missing the ${START} / ${END} markers.`);
  process.exit(1);
}
const next = `${readme.slice(0, start)}${block}${readme.slice(end + END.length)}`;

if (next === readme) {
  console.log("README facts are current.");
  process.exit(0);
}
if (checkOnly) {
  console.error("README facts are stale. Run `pnpm docs:update`.");
  process.exit(1);
}
writeFileSync(readmePath, next);
console.log("README facts updated.");
