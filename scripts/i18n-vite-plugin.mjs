import { transformSync } from "@babel/core";
import civicflowI18nPlugin from "./i18n-babel-plugin.mjs";

/**
 * The React plugin in this project uses Oxc rather than Babel, so the copy
 * transform runs as its own pre-plugin. It parses JSX/TypeScript, swaps static
 * text for `__cfT(...)`, and leaves the rest of the source untouched for Oxc.
 */
export default function civicflowI18nVitePlugin() {
  return {
    name: "civicflow-i18n-transform",
    enforce: "pre",
    transform(code, id) {
      const filename = id.split("?")[0];
      if (!filename.endsWith(".tsx")) return null;
      if (
        filename.includes("/node_modules/") ||
        filename.includes(".test.") ||
        filename.includes("/lib/i18n/")
      ) {
        return null;
      }

      const result = transformSync(code, {
        filename,
        sourceMaps: true,
        configFile: false,
        babelrc: false,
        parserOpts: { sourceType: "module", plugins: ["typescript", "jsx"] },
        plugins: [civicflowI18nPlugin],
      });

      if (!result?.code) return null;
      return { code: result.code, map: result.map };
    },
  };
}
