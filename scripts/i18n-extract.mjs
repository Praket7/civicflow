import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import { hasLetters, normalizeJsxText, shouldSkipElement } from "./i18n-normalize.mjs";

const COPY_ATTRIBUTES = new Set([
  "alt",
  "aria-description",
  "aria-label",
  "backLabel",
  "caption",
  "centerLabel",
  "description",
  "empty",
  "eyebrow",
  "hint",
  "label",
  "legend",
  "meta",
  "placeholder",
  "subtitle",
  "summary",
  "title",
]);

function collectFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "i18n" || entry.name === "node_modules") continue;
      files.push(...collectFiles(path));
    } else if (entry.name.endsWith(".tsx") && !entry.name.includes(".test.")) {
      files.push(path);
    }
  }
  return files;
}

function elementName(node) {
  const name = node.openingElement?.name;
  return name?.type === "JSXIdentifier" ? name.name : null;
}

function insideSkippedElement(path) {
  let current = path.parentPath;
  while (current) {
    if (current.isJSXElement() && shouldSkipElement(elementName(current.node))) return true;
    current = current.parentPath;
  }
  return false;
}

const strings = new Set();
for (const file of collectFiles("src")) {
  const source = readFileSync(file, "utf8");
  let ast;
  try {
    ast = parse(source, { sourceType: "module", plugins: ["typescript", "jsx"] });
  } catch (error) {
    console.warn(`skip ${file}: ${error.message}`);
    continue;
  }

  traverse(ast, {
    // Copy is not only JSX: labels, empty states, and question text are also
    // passed straight to t(). Collect those literals so the worklist matches
    // what the interface can actually render.
    CallExpression(path) {
      const callee = path.node.callee;
      if (callee.type !== "Identifier" || callee.name !== "t") return;
      const [first] = path.node.arguments;
      if (!first || first.type !== "StringLiteral") return;
      const text = first.value.trim();
      if (text && hasLetters(text)) strings.add(text);
    },
    JSXText(path) {
      if (insideSkippedElement(path)) return;
      const value = normalizeJsxText(path.node.value);
      if (value && hasLetters(value)) strings.add(value);
    },
    JSXAttribute(path) {
      const name = path.node.name;
      if (name.type !== "JSXIdentifier" || !COPY_ATTRIBUTES.has(name.name)) return;
      const value = path.node.value;
      if (!value || value.type !== "StringLiteral") return;
      const text = value.value.trim();
      if (text && hasLetters(text)) strings.add(text);
    },
  });
}

for (const value of JSON.parse(readFileSync("src/lib/i18n/manual-strings.json", "utf8"))) {
  if (typeof value === "string" && value.trim()) strings.add(value.trim());
}

const sorted = [...strings].sort((a, b) => a.localeCompare(b, "en"));
writeFileSync("src/lib/i18n/strings.json", `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`${sorted.length} interface strings`);
