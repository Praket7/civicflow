import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { setDefaultOptions } from "date-fns";
import type { Locale } from "date-fns";
import { enUS } from "date-fns/locale";
import localeData from "./locales.json";
import polished from "./polish.json";

export interface LocaleMeta {
  code: string;
  name: string;
  nativeName: string;
  dir: "ltr" | "rtl";
}

export const LOCALES = localeData as LocaleMeta[];

type Catalog = Record<string, string>;

const STORAGE_KEY = "civicflow.locale";

/** date-fns export names, where they exist, for weekdays and month names. */
const DATE_LOCALES: Record<string, string> = {
  af: "af",
  ar: "ar",
  az: "az",
  be: "be",
  bg: "bg",
  bn: "bn",
  cs: "cs",
  de: "de",
  el: "el",
  es: "es",
  fa: "faIR",
  fr: "fr",
  gu: "gu",
  he: "he",
  hi: "hi",
  ht: "ht",
  hu: "hu",
  id: "id",
  it: "it",
  ja: "ja",
  km: "km",
  kn: "kn",
  ko: "ko",
  ms: "ms",
  nl: "nl",
  pl: "pl",
  pt: "pt",
  ro: "ro",
  ru: "ru",
  sr: "sr",
  sv: "sv",
  ta: "ta",
  te: "te",
  th: "th",
  tr: "tr",
  uk: "uk",
  uz: "uz",
  vi: "vi",
  "zh-CN": "zhCN",
  "zh-TW": "zhTW",
};
const catalogModules = import.meta.glob("./catalogs/*.json") as Record<
  string,
  () => Promise<{ default: Catalog }>
>;

let activeLocale = "en";
let activeCatalog: Catalog = {};
const VERBATIM = new Set(["⌘ K", "⌘K", "Esc", "Tab", "Shift D", "Shift+D", "↵", "↑", "↓"]);

/**
 * Translate one interface string. The JSX transform calls this during render,
 * and the provider remounts the app once a catalog has loaded so every call
 * reads the new locale. English returns the source string unchanged.
 */
export function t(text: string, values?: Record<string, string | number>): string {
  let translated = text;
  if (activeLocale !== "en" && !VERBATIM.has(text)) {
    // Record prefixes, CSV/PDF/CPR-style acronyms and short IDs stay literal.
    if (!/^[A-Z0-9][A-Z0-9-]{1,8}$/.test(text)) translated = activeCatalog[text] ?? text;
  }
  if (values) {
    for (const [key, value] of Object.entries(values)) {
      translated = translated.replaceAll(`{${key}}`, String(value));
    }
  }
  return translated;
}

function findLocale(code: string): LocaleMeta | undefined {
  return LOCALES.find((locale) => locale.code === code);
}

/** The catalog currently in memory. Used by date and number formatters. */
export function activeLocaleCode(): string {
  return activeLocale;
}

function readStoredLocale(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored && findLocale(stored) ? stored : "en";
  } catch {
    return "en";
  }
}

async function loadCatalog(code: string): Promise<Catalog> {
  if (code === "en") return {};
  const loader = catalogModules[`./catalogs/${code}.json`];
  if (!loader) return {};
  try {
    const module = await loader();
    const overrides = (polished as Record<string, Record<string, string>>)[code] ?? {};
    return { ...module.default, ...overrides };
  } catch {
    // A missing or broken catalog falls back to English instead of blank UI.
    return {};
  }
}

/*
 * date-fns ships hand-written locales for about forty of the sixty interface
 * languages. For the rest, build the small surface `format` needs from Intl so
 * weekdays, months, and AM/PM still follow the selected language instead of
 * quietly falling back to English.
 */
const monthCache = new Map<string, string[]>();
const dayCache = new Map<string, string[]>();

function intlNames(
  code: string,
  kind: "month" | "weekday",
  width: Intl.DateTimeFormatOptions["month"],
): string[] {
  const cache = kind === "month" ? monthCache : dayCache;
  const key = `${code}:${kind}:${width}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const values = Array.from({ length: kind === "month" ? 12 : 7 }, (_, index) => {
    // 2020-01-01 is a Wednesday; 2021-08-01 is a Sunday.
    const date =
      kind === "month"
        ? new Date(Date.UTC(2020, index, 15, 12))
        : new Date(Date.UTC(2021, 7, 1 + index, 12));
    return new Intl.DateTimeFormat(code, {
      [kind === "month" ? "month" : "weekday"]: width,
      timeZone: "UTC",
    }).format(date);
  });
  cache.set(key, values);
  return values;
}

function intlDayPeriod(code: string, period: string): string {
  if (period === "am" || period === "pm") {
    const hour = period === "am" ? 9 : 21;
    const parts = new Intl.DateTimeFormat(code, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "UTC",
    }).formatToParts(new Date(Date.UTC(2020, 0, 1, hour)));
    const value = parts.find((part) => part.type === "dayPeriod")?.value;
    if (value) return value;
    return period.toUpperCase();
  }
  if (period === "noon") return intlDayPeriod(code, "pm");
  if (period === "midnight") return intlDayPeriod(code, "am");
  return period;
}

function intlLocale(code: string): Locale {
  const month = (value: number, options?: { width?: string }) => {
    const width =
      options?.width === "narrow" ? "narrow" : options?.width === "wide" ? "long" : "short";
    return intlNames(code, "month", width)[value] ?? "";
  };
  const day = (value: number, options?: { width?: string }) => {
    const width =
      options?.width === "narrow" ? "narrow" : options?.width === "wide" ? "long" : "short";
    return intlNames(code, "weekday", width)[value] ?? "";
  };
  return {
    code,
    formatDistance: (token, count) => `${count} ${token}`,
    formatRelative: (token) => token,
    localize: {
      ordinalNumber: (value) => String(value),
      era: (value) => (value === 0 ? "BC" : "AD"),
      quarter: (value) => `Q${value}`,
      month: (value, options) => month(value, options),
      day: (value, options) => day(value, options),
      dayPeriod: (value) => intlDayPeriod(code, value),
    },
    formatLong: {
      date: () => "MM/dd/yyyy",
      time: () => "h:mm a",
      dateTime: () => "MM/dd/yyyy h:mm a",
    },
    match: {
      ordinalNumber: () => null,
      era: () => null,
      quarter: () => null,
      month: () => null,
      day: () => null,
      dayPeriod: () => null,
    },
    options: { weekStartsOn: 1, firstWeekContainsDate: 1 },
  } as Locale;
}

async function applyDateLocale(code: string) {
  if (code === "en") {
    setDefaultOptions({ locale: enUS });
    return;
  }
  const exportName = DATE_LOCALES[code];
  if (!exportName) {
    setDefaultOptions({ locale: intlLocale(code) });
    return;
  }
  try {
    const module = await import("date-fns/locale");
    const locale = (module as unknown as Record<string, unknown>)[exportName];
    setDefaultOptions({ locale: (locale ?? intlLocale(code)) as typeof enUS });
  } catch {
    setDefaultOptions({ locale: intlLocale(code) });
  }
}

function applyDocumentLocale(locale: LocaleMeta) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale.code;
  document.documentElement.dir = locale.dir;
}

interface LocaleContextValue {
  locale: string;
  meta: LocaleMeta;
  pending: boolean;
  /** Bumped after a catalog lands so visible copy can rerender. */
  version: number;
  setLocale(code: string): void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState(readStoredLocale);
  const [pending, setPending] = useState(locale !== "en");
  const [version, setVersion] = useState(0);
  const loadedLocale = useRef("en");

  useEffect(() => {
    let aborted = false;
    const meta = findLocale(locale);
    if (!meta) return;

    async function apply() {
      const catalog = await loadCatalog(locale);
      await applyDateLocale(locale);
      if (aborted) return;
      activeLocale = locale;
      activeCatalog = catalog;
      applyDocumentLocale(meta as LocaleMeta);
      setPending(false);

      if (loadedLocale.current !== locale) {
        loadedLocale.current = locale;
        setVersion((value) => value + 1);
      }
    }

    void apply();
    return () => {
      aborted = true;
    };
  }, [locale]);

  const setLocale = useCallback((code: string) => {
    const meta = findLocale(code);
    if (!meta) return;
    setPending(code !== "en");
    setLocaleState(code);
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch {
      // The language still applies for this session when storage is blocked.
    }
  }, []);

  const value = useMemo<LocaleContextValue>(() => {
    const meta = findLocale(locale) ?? LOCALES[0];
    return { locale, meta, pending, version, setLocale };
  }, [locale, pending, version, setLocale]);

  // The app shell keys its chrome and page frame on `version`, so translated
  // copy is applied without remounting the workspace session or its data.
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useLocale must be used inside LocaleProvider");
  return value;
}

/**
 * Remounts pages that call `t()` without subscribing to the locale context.
 * Standalone screens (launch, welcome, sign-in, onboarding, setup) sit outside
 * AppShell, so without this frame an asynchronously loaded catalog would leave
 * their first English render in place.
 */
export function LocaleFrame({ children }: { children: ReactNode }) {
  const { version } = useLocale();
  return <Fragment key={version}>{children}</Fragment>;
}
