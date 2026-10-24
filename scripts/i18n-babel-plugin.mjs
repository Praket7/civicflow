import {
  hasLetters,
  keepsBoundarySpace,
  normalizeJsxText,
  shouldSkipElement,
} from "./i18n-normalize.mjs";

const TRANSLATE_MODULE = "@i18n";
const TRANSLATE_CALLEE = "__cfT";

/** Props that are always interface copy when they receive a string literal. */
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

function openingName(node) {
  const name = node.openingElement?.name;
  return name?.type === "JSXIdentifier" ? name.name : null;
}

function insideSkippedElement(path) {
  let current = path.parentPath;
  while (current) {
    if (current.isJSXElement() && shouldSkipElement(openingName(current.node))) return true;
    current = current.parentPath;
  }
  return false;
}

function hasTranslateImport(program) {
  return program.node.body.some(
    (node) =>
      node.type === "ImportDeclaration" &&
      node.source.value === TRANSLATE_MODULE &&
      node.specifiers.some(
        (specifier) =>
          specifier.type === "ImportSpecifier" &&
          specifier.imported.name === "t" &&
          specifier.local.name === TRANSLATE_CALLEE,
      ),
  );
}

function translateCall(types, value) {
  return types.callExpression(types.identifier(TRANSLATE_CALLEE), [types.stringLiteral(value)]);
}

/**
 * Compile-time copy extraction: static JSX text and known copy props are
 * replaced with `__cfT("...")`. Dynamic values and workspace records are left
 * alone, because volunteer names, addresses and program descriptions should
 * never be machine-translated.
 */
export default function civicflowI18nPlugin({ types }) {
  return {
    name: "civicflow-i18n",
    visitor: {
      Program: {
        enter(program, state) {
          const filename = state.filename ?? state.file?.opts?.filename ?? "";
          state.i18nEnabled =
            filename.endsWith(".tsx") &&
            !filename.includes(".test.") &&
            !filename.includes("/lib/i18n/");
          state.i18nChanged = false;
        },
        exit(program, state) {
          if (!state.i18nChanged || hasTranslateImport(program)) return;
          program.unshiftContainer(
            "body",
            types.importDeclaration(
              [types.importSpecifier(types.identifier(TRANSLATE_CALLEE), types.identifier("t"))],
              types.stringLiteral(TRANSLATE_MODULE),
            ),
          );
        },
      },
      JSXText(path, state) {
        if (!state.i18nEnabled || insideSkippedElement(path)) return;
        const raw = path.node.value;
        const key = normalizeJsxText(raw);
        if (!key || !hasLetters(key)) return;

        const siblings = path.parent.children ?? [];
        const index = siblings.indexOf(path.node);
        const { leading, trailing } = keepsBoundarySpace(
          raw,
          siblings[index - 1],
          siblings[index + 1],
        );

        const nodes = [];
        if (leading) nodes.push(types.jsxExpressionContainer(types.stringLiteral(" ")));
        nodes.push(types.jsxExpressionContainer(translateCall(types, key)));
        if (trailing) nodes.push(types.jsxExpressionContainer(types.stringLiteral(" ")));

        path.replaceWithMultiple(nodes);
        state.i18nChanged = true;
      },
      JSXAttribute(path, state) {
        if (!state.i18nEnabled) return;
        const name = path.node.name;
        if (name.type !== "JSXIdentifier" || !COPY_ATTRIBUTES.has(name.name)) return;
        const value = path.node.value;
        if (!value || value.type !== "StringLiteral") return;
        const key = value.value.trim();
        if (!key || !hasLetters(key)) return;

        path.node.value = types.jsxExpressionContainer(translateCall(types, key));
        state.i18nChanged = true;
      },
    },
  };
}
