/**
 * Copy gate: American spelling, common typos, doubled words.
 *
 * Interface copy and documentation are read as part of the product, so a misspelling
 * costs credibility even when every test passes. A spell checker that
 * needs a system dictionary does not run on every machine, so this gate encodes
 * the two failure modes that actually happen here: British spellings creeping
 * back in, and typos in copy that no test would otherwise read.
 *
 * Scope: interface copy, screen source, and Markdown. Other locales are skipped
 * because their catalogs legitimately contain non-English words. The gate does
 * not check general spelling; it catches the drift a dictionary cannot see:
 * mixed dialect and typos in copy no test would otherwise read.
 *
 * Usage:
 *   node scripts/check-copy.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";

/** [British form, American form]. Matched on a word boundary. */
const SPELLINGS = [
  ["colour", "color"],
  ["colours", "colors"],
  ["coloured", "colored"],
  ["colourful", "colorful"],
  ["optimise", "optimize"],
  ["optimised", "optimized"],
  ["optimiser", "optimizer"],
  ["optimising", "optimizing"],
  ["optimisation", "optimization"],
  ["organise", "organize"],
  ["organised", "organized"],
  ["organising", "organizing"],
  ["organisation", "organization"],
  ["organisations", "organizations"],
  ["prioritise", "prioritize"],
  ["prioritised", "prioritized"],
  ["recognise", "recognize"],
  ["recognised", "recognized"],
  ["summarise", "summarize"],
  ["summarised", "summarized"],
  ["minimise", "minimize"],
  ["maximise", "maximize"],
  ["personalise", "personalize"],
  ["personalised", "personalized"],
  ["customise", "customize"],
  ["customised", "customized"],
  ["serialise", "serialize"],
  ["serialised", "serialized"],
  ["standardise", "standardize"],
  ["analyse", "analyze"],
  ["analysed", "analyzed"],
  ["analysing", "analyzing"],
  ["cancelled", "canceled"],
  ["cancelling", "canceling"],
  ["behaviour", "behavior"],
  ["behaviours", "behaviors"],
  ["behavioural", "behavioral"],
  ["favour", "favor"],
  ["favourite", "favorite"],
  ["favourites", "favorites"],
  ["centre", "center"],
  ["centres", "centers"],
  ["licence", "license"],
  ["programme", "program"],
  ["programmes", "programs"],
  ["catalogue", "catalog"],
  ["catalogues", "catalogs"],
  ["whilst", "while"],
  ["towards", "toward"],
  ["modelling", "modeling"],
  ["labelled", "labeled"],
  ["travelling", "traveling"],
  ["apologise", "apologize"],
  ["utilise", "utilize"],
  ["defence", "defense"],
  ["grey", "gray"],
  ["judgement", "judgment"],
  ["enrolment", "enrollment"],
  ["fulfil", "fulfill"],
  ["skillful", "skilful"],
  ["practise", "practice"],
];

/** Words that are wrong in any dialect. */
const TYPOS = [
  "recieve",
  "recieved",
  "seperate",
  "seperated",
  "occured",
  "occuring",
  "definately",
  "accomodate",
  "accomodation",
  "untill",
  "neccessary",
  "necesary",
  "sucessful",
  "successfull",
  "adress",
  "adressen",
  "teh",
  "wich",
  "thier",
  "comittee",
  "volunter",
  "volunters",
  "coordinater",
  "calender",
  "scedule",
  "shedule",
  "oppurtunity",
  "oppurtunities",
  "availible",
  "availabilty",
  "verifcation",
  "notifcation",
];

/**
 * Tokens that are code, not copy: the settings key is stored in the database and
 * the dataset attribute is read by CSS, so renaming either would be a migration.
 */
const CODE_TOKENS = ["colourindependent", "colour_independent", "colour-independent"];

const ROOTS = ["src", "docs", "shared", "scripts", "tests"];
const EXTRA_FILES = ["README.md", "index.html"];
const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".css",
  ".md",
  ".json",
  ".html",
  ".mjs",
  ".rs",
  ".sql",
]);
const SKIP_PATHS = [
  "node_modules",
  "/dist/",
  "/target/",
  "/catalogs/",
  "polish.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "scripts/check-copy.mjs",
];

function files() {
  const found = [];
  const walk = (path) => {
    const stat = statSync(path);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(path)) walk(join(path, entry));
      return;
    }
    if (!TEXT_EXTENSIONS.has(extname(path))) return;
    if (SKIP_PATHS.some((skip) => path.includes(skip))) return;
    found.push(path);
  };
  for (const root of ROOTS) {
    try {
      walk(root);
    } catch {
      // A missing optional folder is not a failure.
    }
  }
  for (const file of EXTRA_FILES) {
    try {
      walk(file);
    } catch {
      // Optional.
    }
  }
  return found;
}

const problems = [];

/** Only prose is punctuation-checked; code has its own punctuation. */
function isProse(file) {
  return (
    file.endsWith(".md") || file.includes("i18n/strings.json") || file.includes("manual-strings")
  );
}

for (const file of files()) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    const lower = line.toLowerCase();
    const masked = CODE_TOKENS.reduce((text, token) => text.split(token).join(""), lower);

    for (const [uk] of SPELLINGS) {
      if (new RegExp(`\\b${uk}\\b`).test(masked)) {
        problems.push(`${file}:${index + 1}  “${uk}” is British; use the American spelling.`);
      }
    }
    for (const typo of TYPOS) {
      if (new RegExp(`\\b${typo}\\b`).test(masked)) {
        problems.push(`${file}:${index + 1}  “${typo}” looks misspelled.`);
      }
    }
    // CSS values such as "3px 3px" are not copy, so this runs on prose only.
    if (isProse(file)) {
      const doubled = /\b([a-z]{3,})\s+\1\b/i.exec(line);
      if (doubled) {
        problems.push(`${file}:${index + 1}  doubled word “${doubled[1]} ${doubled[1]}”.`);
      }
    }
  });
}

if (problems.length > 0) {
  console.error(`${problems.length} copy problem${problems.length === 1 ? "" : "s"}:\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("\nRun `node scripts/check-copy.mjs` after fixing to confirm.");
  process.exit(1);
}

console.log("Copy check passed: American spelling, no known typos, no doubled words.");
