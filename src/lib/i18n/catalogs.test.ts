import { describe, expect, it } from "vitest";
import locales from "./locales.json";
import polished from "./polish.json";
import strings from "./strings.json";

const catalogs = import.meta.glob<Record<string, string>>("./catalogs/*.json", {
  eager: true,
  import: "default",
});

const placeholderPattern = /\{[^}]+\}/g;

describe("interface catalogs", () => {
  it("ships a complete catalog for every non-English locale", () => {
    for (const locale of locales) {
      if (locale.code === "en") continue;
      const catalog = catalogs[`./catalogs/${locale.code}.json`];
      expect(catalog, `${locale.code} catalog`).toBeDefined();
      const missing = strings.filter((key) => !(key in catalog));
      expect(missing, `${locale.code} missing keys`).toEqual([]);
    }
  });

  it("keeps every interpolation placeholder in the translation", () => {
    for (const [path, catalog] of Object.entries(catalogs)) {
      for (const [key, value] of Object.entries(catalog)) {
        const source = [...(key.match(placeholderPattern) ?? [])].sort();
        const translated = [...(value.match(placeholderPattern) ?? [])].sort();
        expect(translated, `${path}: ${key}`).toEqual(source);
      }
    }

    for (const [locale, overrides] of Object.entries(polished)) {
      for (const [key, value] of Object.entries(overrides as Record<string, string>)) {
        const source = [...(key.match(placeholderPattern) ?? [])].sort();
        const translated = [...(value.match(placeholderPattern) ?? [])].sort();
        expect(translated, `polish/${locale}: ${key}`).toEqual(source);
      }
    }
  });
});
