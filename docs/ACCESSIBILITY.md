# Accessibility

CivicFlow targets WCAG 2.2 AA for a local desktop app. Accessibility is part of the shared
shell and primitives, not a separate mode. The Accessibility screen
(`/coordinator/accessibility`) lets a reader change appearance and motion at runtime, and
every preference persists with the workspace settings or the display-preference store.

This document records what is implemented and what has actually been verified. Where a
check is manual or not yet performed, it says so.

## Contract

| Requirement            | Implementation                                                                                                                                                                                                                   | Evidence                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Page landmarks         | `AppShell` renders one `<main id="main-content">` around every route; navigation is a labelled `<aside aria-label="Primary">` with a `<nav>`; the top bar is a `<header>`; setup screens use `SetupShell` with its own `<main>`. | 42-route sweep looked for a missing `h1`/`main`; `print.test.tsx` mounts every route. |
| One page title         | Each screen owns one visible `h1` through `PageHeader` or its art-directed header. Decorative headings use `h2`.                                                                                                                 | Visual sweep and `print.test.tsx` content assertions.                                 |
| Skip link              | First focusable element is “Skip to main content”, targeting `#main-content`; `main` has `tabIndex={-1}` so focus moves there.                                                                                                   | `src/app/AppShell.tsx`.                                                               |
| Keyboard reachability  | All controls are native buttons, links, inputs, selects, checkboxes, switches and dialogs. Custom row actions add Enter/Space handling.                                                                                          | `DataTable` row keyboard handler; command palette arrow-key navigation.               |
| Visible focus          | `:focus-visible` draws a 3 px cobalt outline with 2 px offset; the accessibility setting can show rings on every focus.                                                                                                          | `src/styles/global.css`.                                                              |
| Search dialog          | Native `<dialog>` with `showModal()`, a labelled combobox, `aria-controls`, `aria-activedescendant`, a listbox, arrow keys, Enter, Escape and focus restoration to the trigger.                                                  | `src/components/navigation/CommandPalette.tsx`.                                       |
| Menus                  | The workspace menu closes on outside pointer-down and Escape; Escape returns focus to its trigger. The mobile drawer closes on Escape or navigation.                                                                             | `Sidebar.tsx`, `AppShell.tsx`.                                                        |
| Form labels and errors | `TextField`, `TextareaField` and `SelectField` generate ids, bind `<label htmlFor>`, set `aria-invalid`, and render errors in a `role="alert"` paragraph. Search fields use a visually hidden label.                             | `src/components/ui/Form.tsx`.                                                         |
| Switch semantics       | Appearance toggles are `role="switch"` with `aria-checked` and an accessible name.                                                                                                                                               | `Toggle` in `Form.tsx`; Accessibility screen toggles.                                 |
| Status not by colour   | Status badges always carry text plus a dot or icon. Inline signal colours are reserved for fills and bars; tinted text uses the `--tone-*-ink` pairs.                                                                            | `Badge.tsx`; `VISUAL_QA.md` records the colour-only defects that were fixed.          |
| Tables                 | `DataTable` requires a caption, uses `scope="col"`, and gives clickable rows keyboard entry. Bespoke tables in credentials and availability also carry captions or row headers.                                                  | `src/components/ui/DataTable.tsx`; page modules.                                      |
| Chart alternatives     | `BarChart`, `DonutChart` and `AreaChart` include a `<details>` table of the same values. Mission Control’s weekly card and Impact Analytics also ship visually hidden tables with captions.                                      | `src/components/ui/Charts.tsx`; `WeekCoverageCard.tsx`; `ImpactAnalyticsPage.tsx`.    |
| Reduced motion         | The OS `prefers-reduced-motion` rule disables animation and transitions immediately; the in-app “Reduce motion” setting applies the same rule through `html[data-reduced-motion="true"]`. Focus and state feedback remain.       | `src/styles/global.css`.                                                              |
| Reduced transparency   | The OS preference and the in-app setting remove `backdrop-filter` and substitute opaque glass tokens.                                                                                                                            | `global.css`, `tokens.css`, display preferences.                                      |
| High contrast          | `html[data-high-contrast="true"]` strengthens supporting text and border tokens in both themes.                                                                                                                                  | `tokens.css`, `global.css`.                                                           |
| Text scaling           | Standard, Large (1.08×) and Larger (1.16×) use CSS `zoom` on `body`, so fixed-pixel type scales too. Layouts scroll instead of clipping content.                                                                                 | `global.css`; Accessibility screen.                                                   |
| Underlined links       | An optional setting underlines links inside `main` and unclassed links, so links do not rely on colour alone.                                                                                                                    | `global.css`.                                                                         |
| Colour contrast        | Semantic ink tokens target at least 4.5:1 on canvas and paper; tinted status text uses ink/soft pairs.                                                                                                                           | CDP contrast audit below.                                                             |
| Print                  | Service Verification and Impact Report print without the app shell. The certificate’s hiding rule is scoped to `body[data-print-view="verification"]`.                                                                           | `print.test.tsx`, `pnpm audit:print`, Chromium PDF render.                            |

## Runtime preferences

The Accessibility screen changes these immediately:

- Interface language: 60 languages, with native names, translated dates, and right-to-left layout for Arabic, Hebrew, Persian, and Urdu.
- Theme: light, dark, or match system.
- Text size: Standard / Large / Larger.
- Higher contrast, comfortable spacing, underlined links, text + shape status.
- Reduce motion and reduce transparency.
- Always show focus rings, plus a live focus sample.

Theme, spacing, transparency, focus-ring visibility and sidebar collapse live in the display
preference store. Text scale, high contrast, reduced motion, link underlines and
colour-independent status persist as workspace settings through the Rust core. The reset
button returns both stores to their defaults and announces the result in a `role="status"`
message.

## Interface language

The language picker lives at the top of the Accessibility screen. It lists 60 languages by
native name, stores the choice with the display preferences, and applies it to menus, page
copy, labels, dates, and status text without reloading the app. A short loading status is
announced while a catalogue is fetched.

Interface copy is translated at build time. `scripts/i18n-babel-plugin.mjs` replaces static
JSX text and known copy props with `t("...")`, and `scripts/i18n-extract.mjs` writes the
resulting keys to `src/lib/i18n/strings.json`. The catalogues in `src/lib/i18n/catalogs` are
generated by `scripts/i18n-translate.py` and hold roughly two thousand interface strings per
language. Names, addresses, program titles, descriptions, and notes stored in the demo
workspace stay as written, so printed records and referrals keep their original wording.
Dates use date-fns locales where one exists and an Intl-backed locale otherwise, so weekday
and month names follow the selected language.

```bash
node scripts/i18n-extract.mjs                 # refresh strings.json after copy changes
python3 scripts/i18n-translate.py             # translate missing keys in every catalogue
python3 scripts/i18n-translate.py --locale de # or refresh just one language
```

The extractor rewrites the source key list; the translator is resumable and only fills keys
that are absent unless `--force` is passed. Manual wording for the most visible labels lives
in `src/lib/i18n/polish.json` and overrides the generated catalogue at runtime. A test
(`src/lib/i18n/catalogs.test.ts`) fails when a locale is missing or drops an interpolation
placeholder.

## Verification

Automated:

```bash
pnpm test                 # route render + print contract, axe on all 43 routes
pnpm dev                  # in one terminal
pnpm audit:contrast       # headless Chrome, 43 routes, light and dark
pnpm audit:print          # certificate and report under print media
```

- `scripts/audit-contrast.mjs` opens every registered route in headless Chromium, composites
  each text element over its ancestor background stack, and fails below 4.5:1 (3:1 for large
  text). The last recorded run reported no violations outside photography, where a computed
  background is unavailable; those panels were checked visually. The stricter rendered-pixel
  pass described in `VISUAL_QA.md` produced the same result.
- `jest-axe` runs on every registered route and fails serious or critical violations. The
  `color-contrast` rule is disabled because jsdom cannot composite colours; Chromium covers
  that separately in both themes.
- `print.test.tsx` mounts all 43 routes, checks that content renders, and guards the
  certificate’s print gate. `audit-print.mjs` renders the certificate and impact report to
  PDF and fails on a blank page.
- `scripts/audit-accessibility-tree.mjs` reads Chromium’s full accessibility tree for all 43
  routes and fails a route without a `main` landmark, a level-one heading, or a name on every
  interactive control. This is the same tree a screen reader consumes.
- `scripts/audit-zoom.mjs` renders an 800 × 500 CSS viewport (a 1600 × 1000 window at 200%
  browser zoom) and fails on horizontal overflow or a lost heading.
- `tests/e2e/auth-and-roles.spec.mjs` drives the real macOS window, including the sign-in
  form and both role journeys, so the labelled controls are exercised outside jsdom.

Manual:

- The 42-route visual sweep at 1600 × 1000, 1280 × 800 and 1024 × 720 found no horizontal
  page scroll, missing `main`/`h1`, or failed images.
- Keyboard paths exercised: skip link, command palette arrows/Enter/Escape, sidebar menu
  Escape with focus return, tab order through forms and tables, and the focus sample.
- Contrast tokens and the status palette were reviewed after the dark-theme defects recorded
  in `VISUAL_QA.md` were fixed.

## Known gaps

- No human screen-reader pass (VoiceOver/NVDA) has been recorded on the packaged build. The
  accessibility tree is audited automatically, but reading order and whether an announcement
  makes sense in context still need a person.
- Automated axe coverage stops at ARIA and structure. The accessibility-tree audit adds main
  landmarks, headings and control names; none of it judges the quality of an announcement.
- Print output has been verified in Chromium, not in WebKit/WKWebView on macOS.
- The kiosk has not been tested on a physical touch display, with an on-screen keyboard, or
  under venue lighting.
- Text scaling is a fixed 1.08×/1.16× choice, not a continuous control. The longest
  translated strings were checked at 1280 and 820 pixels in the twelve most visible
  languages; the remaining catalogues are generated and may need shorter wording in a few
  dense table headers.
- `prefers-contrast` is not wired to the high-contrast tokens automatically; the reader must
  choose “Higher contrast” in the app.
