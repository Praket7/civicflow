const SKIP_ELEMENTS = new Set(["code", "kbd", "pre", "samp", "script", "style", "textarea"]);

/** Collapse JSX's formatting whitespace without changing the visible sentence. */
export function normalizeJsxText(raw) {
  return raw.replace(/\s+/g, " ").trim();
}

export function hasLetters(text) {
  return /\p{L}/u.test(text);
}

export function isInlineNode(node) {
  if (!node) return false;
  return (
    node.type === "JSXElement" ||
    node.type === "JSXFragment" ||
    node.type === "JSXExpressionContainer"
  );
}

/**
 * JSX text nodes next to an inline element need their boundary space kept.
 * Formatting-only whitespace at the start or end of a block does not.
 */
export function keepsBoundarySpace(raw, previous, next) {
  // A literal space inside an only-child text node (`<span> families`) is part
  // of the sentence even though the span itself is the inline neighbour. Keep
  // it; indentation that starts with a newline is formatting and is dropped.
  return {
    leading: raw.startsWith(" ") && (isInlineNode(previous) || !previous),
    trailing: raw.endsWith(" ") && (isInlineNode(next) || !next),
  };
}

export function shouldSkipElement(elementName) {
  return Boolean(elementName && SKIP_ELEMENTS.has(elementName));
}
