import { useEffect, useRef, useState } from "react";
import {
  Accessibility,
  Contrast,
  Eye,
  Keyboard,
  Languages,
  Monitor,
  Moon,
  RotateCcw,
  Sun,
  Type,
} from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  Page,
  PageHeader,
  SectionHeader,
  Toggle,
} from "../../components/ui";
import { useDisplayPreferences } from "../../lib/display";
import type { ThemePreference } from "../../lib/display";
import { LOCALES, t, useLocale } from "../../lib/i18n";
import { useWorkspace } from "../../lib/workspace/session";
import { DEFAULT_SETTINGS } from "../../lib/workspace/selectors";
import styles from "../records/Records.module.css";

const TEXT_OPTIONS = [
  { id: "standard", label: "Standard", sample: "Service that fits your week." },
  { id: "large", label: "Large", sample: "Service that fits your week." },
  { id: "larger", label: "Larger", sample: "Service that fits your week." },
] as const;

const THEME_OPTIONS: {
  id: ThemePreference;
  label: string;
  hint: string;
  icon: typeof Sun;
}[] = [
  { id: "light", label: "Light", hint: "Warm paper canvas", icon: Sun },
  { id: "dark", label: "Dark", hint: "Deep navy canvas", icon: Moon },
  { id: "system", label: "Match system", hint: "Follows your device", icon: Monitor },
];

const SHORTCUTS = [
  { keys: "⌘ K", description: "Open search and jump to any screen" },
  { keys: "Shift D", description: "Switch between light and dark" },
  { keys: "Tab", description: "Move forward through every control" },
  { keys: "Esc", description: "Close menus, dialogs, and the mobile drawer" },
];

export function AccessibilityPage() {
  const { session, actions } = useWorkspace();
  const { preferences, resolvedTheme, setPreference } = useDisplayPreferences();
  const { locale, meta, pending, setLocale } = useLocale();
  const [saved, setSaved] = useState("");
  const [showTable, setShowTable] = useState(false);
  const [showFocusSample, setShowFocusSample] = useState(false);
  const focusSampleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (showFocusSample) focusSampleRef.current?.focus();
  }, [showFocusSample]);

  function apply(patch: Parameters<typeof actions.updateSettings>[0], note: string) {
    actions.updateSettings(patch);
    setSaved(note);
  }

  function resetPreferences() {
    setPreference("theme", "light");
    setPreference("spacing", "standard");
    setPreference("alwaysShowFocus", false);
    setPreference("transparency", "standard");
    apply(
      {
        textScale: "standard",
        highContrast: false,
        reducedMotion: false,
        underlineLinks: false,
        colourIndependent: true,
      },
      "Display and accessibility preferences reset to their defaults.",
    );
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Comfort and access"
        title="Accessibility"
        description="Tune CivicFlow to how you see, read, and move through it. Every preference applies immediately and stays on this device."
        actions={
          <Button variant="secondary" icon={<RotateCcw size={13} />} onClick={resetPreferences}>
            Reset preferences
          </Button>
        }
      />

      <div className={styles.accessLayout}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Card>
            <SectionHeader
              title="Language"
              subtitle="Choose the language for menus, labels, dates, and every built-in screen."
              action={
                <Badge tone="neutral">
                  <Languages size={11} aria-hidden="true" /> {LOCALES.length} languages
                </Badge>
              }
            />
            <div className={styles.languageRow}>
              <label className={styles.languageField}>
                <span className={styles.languageLabel}>Interface language</span>
                <select
                  className={styles.languageSelect}
                  value={locale}
                  onChange={(event) => setLocale(event.target.value)}
                  aria-describedby="language-note"
                >
                  {LOCALES.map((option) => (
                    <option key={option.code} value={option.code} lang={option.code}>
                      {option.nativeName}
                    </option>
                  ))}
                </select>
              </label>
              <div className={styles.languageCurrent}>
                <span className={styles.languageLabel}>Current</span>
                <strong>{meta.nativeName}</strong>
              </div>
            </div>
            <p id="language-note" className={styles.languageNote}>
              Built-in interface copy is translated. Names, street addresses, program titles, and
              notes your team enters stay exactly as written, so referrals and printed records keep
              their original wording.
            </p>
            <p className={styles.languageStatus} role="status" aria-live="polite">
              {pending
                ? t("Loading this language…")
                : locale === "en"
                  ? t("English is the source language for this workspace.")
                  : `${meta.nativeName} ${t("is active across CivicFlow.")}`}
            </p>
          </Card>

          <Card>
            <SectionHeader
              title="Appearance"
              subtitle="Light, dark, or matched to your device."
              action={
                <Badge tone="neutral">
                  {preferences.theme === "system" ? `System · ${resolvedTheme}` : resolvedTheme}
                </Badge>
              }
            />
            <div className={styles.themeGrid} role="group" aria-label="Colour theme">
              {THEME_OPTIONS.map((option) => {
                const Icon = option.icon;
                const active = preferences.theme === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={`${styles.themeOption} ${active ? styles.optionActive : ""}`}
                    onClick={() => {
                      setPreference("theme", option.id);
                      setSaved(`Theme set to ${option.label.toLowerCase()}.`);
                    }}
                    aria-pressed={active}
                  >
                    <span
                      className={styles.themeSwatch}
                      data-theme-preview={option.id}
                      aria-hidden="true"
                    >
                      <Icon size={14} />
                    </span>
                    <span className={styles.optionTitle}>{t(option.label)}</span>
                    <span className={styles.themeHint}>{t(option.hint)}</span>
                  </button>
                );
              })}
            </div>
            <p style={{ marginTop: 9, fontSize: 12.5, color: "var(--text-muted)" }}>
              The toggle in the top bar switches instantly. Press <kbd>Shift</kbd> + <kbd>D</kbd>{" "}
              from anywhere outside a text field.
            </p>
          </Card>

          <Card>
            <SectionHeader
              title="Text size"
              subtitle="Scales every screen without hiding content behind fixed heights."
              action={<Badge tone="neutral">{session.settings.textScale}</Badge>}
            />
            <div className={styles.optionGrid}>
              {TEXT_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`${styles.optionCard} ${session.settings.textScale === option.id ? styles.optionActive : ""}`}
                  onClick={() =>
                    apply(
                      { textScale: option.id },
                      `Text size set to ${option.label.toLowerCase()}.`,
                    )
                  }
                  aria-pressed={session.settings.textScale === option.id}
                >
                  <div className={styles.optionTitle}>{t(option.label)}</div>
                  <div
                    className={styles.optionSample}
                    style={{
                      fontSize: option.id === "standard" ? 15 : option.id === "large" ? 18 : 21,
                    }}
                  >
                    {t(option.sample)}
                  </div>
                </button>
              ))}
            </div>
            <p style={{ marginTop: 9, fontSize: 12.5, color: "var(--text-muted)" }}>
              Text scaling is a browser-level setting. Charts also provide a table alternative at
              every size.
            </p>
          </Card>

          <Card>
            <SectionHeader
              title="Reading comfort"
              subtitle="Applies to every coordinator and volunteer screen"
            />
            <Toggle
              label="Higher contrast"
              hint="Stronger supporting text and border contrast. Colour is never the only status signal."
              checked={session.settings.highContrast}
              onChange={(checked) =>
                apply(
                  { highContrast: checked },
                  checked ? "Higher contrast enabled." : "Higher contrast disabled.",
                )
              }
            />
            <Toggle
              label="Comfortable spacing"
              hint="More room between lines and a touch more letter spacing for long passages."
              checked={preferences.spacing === "comfortable"}
              onChange={(checked) => {
                setPreference("spacing", checked ? "comfortable" : "standard");
                setSaved(
                  checked ? "Comfortable spacing enabled." : "Spacing returned to standard.",
                );
              }}
            />
            <Toggle
              label="Underline links"
              hint="Makes links identifiable without relying on colour perception."
              checked={session.settings.underlineLinks}
              onChange={(checked) =>
                apply(
                  { underlineLinks: checked },
                  checked ? "Links are underlined." : "Link underlines removed.",
                )
              }
            />
            <Toggle
              label="Text + shape status"
              hint="Status badges keep their text label and dot alongside colour."
              checked={session.settings.colourIndependent}
              onChange={(checked) =>
                apply(
                  { colourIndependent: checked },
                  checked
                    ? "Text and shape signals stay on."
                    : "Colour-independent signals are off.",
                )
              }
            />
            <Toggle
              label="Reduce motion"
              hint="Removes decorative transitions and animation. Focus and state feedback remain."
              checked={session.settings.reducedMotion}
              onChange={(checked) =>
                apply({ reducedMotion: checked }, checked ? "Motion reduced." : "Motion restored.")
              }
            />
            <Toggle
              label="Reduce transparency"
              hint="Turns off glass blur so panels stay fully opaque and easier to read."
              checked={preferences.transparency === "reduced"}
              onChange={(checked) => {
                setPreference("transparency", checked ? "reduced" : "standard");
                setSaved(checked ? "Transparency reduced." : "Glass surfaces restored.");
              }}
            />
          </Card>

          <Card>
            <SectionHeader
              title="Focus and keyboard"
              subtitle="Every control is reachable without a pointer."
              action={
                <Badge tone="cobalt">
                  <Keyboard size={11} aria-hidden="true" /> Keyboard ready
                </Badge>
              }
            />
            <Toggle
              label="Always show focus rings"
              hint="Keeps a strong focus outline visible even when you click instead of tab."
              checked={preferences.alwaysShowFocus}
              onChange={(checked) => {
                setPreference("alwaysShowFocus", checked);
                setSaved(
                  checked ? "Focus rings stay visible." : "Focus rings show for keyboard use.",
                );
              }}
            />
            <ul className={styles.shortcutList}>
              {SHORTCUTS.map((shortcut) => (
                <li key={shortcut.keys} className={styles.shortcutRow}>
                  <kbd className={styles.key}>{shortcut.keys}</kbd>
                  <span>{t(shortcut.description)}</span>
                </li>
              ))}
            </ul>
            <p
              style={{ marginTop: 9, fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.55 }}
            >
              The first Tab press reveals a “Skip to main content” link. Menus close with{" "}
              <kbd>Esc</kbd> and return focus to their trigger.
            </p>
          </Card>

          <Card>
            <SectionHeader
              title="Chart alternatives"
              subtitle="Every chart has a real data table"
            />
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--text-secondary)" }}>
              The weekly coverage chart, impact charts, and report previews each expose a “View as a
              table” disclosure. Screen readers can read the same values without the graphic.
            </p>
            <Button
              size="small"
              variant="secondary"
              style={{ marginTop: 9 }}
              onClick={() => setShowTable((value) => !value)}
            >
              {showTable ? "Hide sample table" : "Show sample table"}
            </Button>
            {showTable ? (
              <table
                style={{ width: "100%", marginTop: 10, borderCollapse: "collapse", fontSize: 13 }}
              >
                <caption
                  style={{
                    textAlign: "left",
                    fontSize: 12,
                    color: "var(--text-muted)",
                    paddingBottom: 5,
                  }}
                >
                  Weekly seat fill, October 12–18
                </caption>
                <thead>
                  <tr>
                    <th
                      scope="col"
                      style={{
                        textAlign: "left",
                        padding: "5px 6px",
                        borderBottom: "1px solid var(--border-soft)",
                      }}
                    >
                      Day
                    </th>
                    <th
                      scope="col"
                      style={{
                        textAlign: "right",
                        padding: "5px 6px",
                        borderBottom: "1px solid var(--border-soft)",
                      }}
                    >
                      Seat fill
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Mon 12", "100%"],
                    ["Tue 13", "92%"],
                    ["Wed 14", "100%"],
                    ["Thu 15", "83%"],
                    ["Fri 16", "76%"],
                    ["Sat 17", "62%"],
                    ["Sun 18", "90%"],
                  ].map(([day, value]) => (
                    <tr key={day}>
                      <td
                        style={{ padding: "5px 6px", borderBottom: "1px solid var(--border-soft)" }}
                      >
                        {day}
                      </td>
                      <td
                        style={{
                          padding: "5px 6px",
                          textAlign: "right",
                          borderBottom: "1px solid var(--border-soft)",
                        }}
                      >
                        {value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </Card>
        </div>

        <aside>
          <div className={styles.previewCard} aria-label="Live accessibility preview">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span className={styles.previewLabel}>Live preview</span>
              <Badge tone="lime" dot>
                Applies instantly
              </Badge>
            </div>
            <h2 className={styles.previewTitle}>Good afternoon, Praket.</h2>
            <p className={styles.previewCopy}>
              Three shifts need a hand this week. Review the Saturday driver gap before the pantry
              opens.
            </p>
            <div className={styles.previewBadges}>
              <Badge tone="red" dot>
                Driver missing
              </Badge>
              <Badge tone="green" dot>
                Coverage healthy
              </Badge>
              <Badge tone="neutral">Local data</Badge>
            </div>
            <div
              style={{
                display: "flex",
                gap: 7,
                marginTop: 12,
                padding: 10,
                borderRadius: 10,
                background: "var(--surface-canvas)",
                fontSize: 12.5,
              }}
            >
              <Accessibility
                size={14}
                style={{ flex: "none", color: "var(--action-primary)" }}
                aria-hidden="true"
              />
              Every interactive control has a visible focus ring. Try tabbing through this card.
            </div>
            <div style={{ display: "flex", gap: 7, marginTop: 10, flexWrap: "wrap" }}>
              <ButtonLink to="/coordinator/coverage" variant="primary" size="small">
                Review coverage
              </ButtonLink>
              <Button
                variant="secondary"
                size="small"
                icon={<Eye size={12} />}
                aria-pressed={showFocusSample}
                onClick={() => setShowFocusSample((value) => !value)}
              >
                Focus sample
              </Button>
            </div>
            {showFocusSample ? (
              <div className={styles.focusSample} role="group" aria-label="Focus ring sample">
                <span>Focus lands here with a visible ring:</span>
                <button
                  ref={focusSampleRef}
                  type="button"
                  className={styles.focusSampleButton}
                  onClick={() => setShowFocusSample(false)}
                >
                  Sample action
                </button>
              </div>
            ) : null}
            <p style={{ marginTop: 12, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
              <Type size={11} aria-hidden="true" style={{ marginRight: 4 }} />
              Preview uses the same type scale and tokens as the rest of the workspace. OS reduced
              motion is respected even before this setting.
            </p>
          </div>

          {saved ? (
            <div
              role="status"
              style={{
                marginTop: 10,
                padding: 11,
                borderRadius: 10,
                background: "var(--tone-green-soft)",
                color: "var(--tone-green-ink)",
                fontSize: 13,
              }}
            >
              {saved}
            </div>
          ) : null}

          <Card padding="compact" style={{ marginTop: 12 }} surface="dark">
            <p style={{ fontFamily: "var(--font-serif)", fontSize: 17, lineHeight: 1.35 }}>
              Accessibility is not a preference panel. It is how the product behaves by default.
            </p>
            <p style={{ marginTop: 8, fontSize: 12.5, color: "rgba(255,255,255,0.58)" }}>
              Defaults: {DEFAULT_SETTINGS.textScale} text, high-contrast off, motion on,
              colour-independent status on, system-agnostic light theme.
            </p>
            <p
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginTop: 10,
                fontSize: 12,
                color: "rgba(255,255,255,0.52)",
              }}
            >
              <Contrast size={12} aria-hidden="true" />
              Contrast is checked against WCAG 2.2 AA in both themes.
            </p>
          </Card>
        </aside>
      </div>
    </Page>
  );
}
