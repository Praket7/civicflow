import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type ThemePreference = "light" | "dark" | "system";
export type SpacingPreference = "standard" | "comfortable";
export type TransparencyPreference = "standard" | "reduced";

export interface DisplayPreferences {
  theme: ThemePreference;
  spacing: SpacingPreference;
  alwaysShowFocus: boolean;
  transparency: TransparencyPreference;
}

export const DEFAULT_DISPLAY_PREFERENCES: DisplayPreferences = {
  theme: "light",
  spacing: "standard",
  alwaysShowFocus: false,
  transparency: "standard",
};

const STORAGE_KEY = "civicflow.display";

function readStored(): DisplayPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_DISPLAY_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<DisplayPreferences>;
    return {
      theme:
        parsed.theme === "dark" || parsed.theme === "system"
          ? parsed.theme
          : DEFAULT_DISPLAY_PREFERENCES.theme,
      spacing: parsed.spacing === "comfortable" ? "comfortable" : "standard",
      alwaysShowFocus: parsed.alwaysShowFocus === true,
      transparency: parsed.transparency === "reduced" ? "reduced" : "standard",
    };
  } catch {
    return DEFAULT_DISPLAY_PREFERENCES;
  }
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolveTheme(theme: ThemePreference, systemDark: boolean): "light" | "dark" {
  return theme === "system" ? (systemDark ? "dark" : "light") : theme;
}

export function applyDisplayPreferences(
  preferences: DisplayPreferences,
  resolvedTheme: "light" | "dark",
) {
  const root = document.documentElement;
  root.dataset.theme = resolvedTheme;
  root.dataset.themePreference = preferences.theme;
  root.dataset.spacing = preferences.spacing;
  root.dataset.focusRings = preferences.alwaysShowFocus ? "always" : "auto";
  root.dataset.transparency = preferences.transparency;
  root.style.colorScheme = resolvedTheme;
}

interface DisplayContextValue {
  preferences: DisplayPreferences;
  resolvedTheme: "light" | "dark";
  setPreference<K extends keyof DisplayPreferences>(key: K, value: DisplayPreferences[K]): void;
  toggleTheme(): void;
}

const DisplayContext = createContext<DisplayContextValue | null>(null);

export function DisplayPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<DisplayPreferences>(readStored);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);
  const resolvedTheme = resolveTheme(preferences.theme, systemDark);

  useEffect(() => {
    applyDisplayPreferences(preferences, resolvedTheme);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // Preferences still apply for this session when storage is unavailable.
    }
  }, [preferences, resolvedTheme]);

  useEffect(() => {
    if (preferences.theme !== "system" || !window.matchMedia) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    function onChange() {
      setSystemDark(media.matches);
    }
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preferences.theme]);

  const setPreference = useCallback(
    <K extends keyof DisplayPreferences>(key: K, value: DisplayPreferences[K]) => {
      setPreferences((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const toggleTheme = useCallback(() => {
    setPreferences((current) => ({
      ...current,
      theme: resolveTheme(current.theme, systemDark) === "dark" ? "light" : "dark",
    }));
  }, [systemDark]);

  const value = useMemo<DisplayContextValue>(
    () => ({ preferences, resolvedTheme, setPreference, toggleTheme }),
    [preferences, resolvedTheme, setPreference, toggleTheme],
  );

  return <DisplayContext.Provider value={value}>{children}</DisplayContext.Provider>;
}

export function useDisplayPreferences(): DisplayContextValue {
  const value = useContext(DisplayContext);
  if (!value) {
    throw new Error("useDisplayPreferences must be used inside DisplayPreferencesProvider");
  }
  return value;
}
