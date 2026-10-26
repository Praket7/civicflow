# Visual QA

## Method

Every screen shares `src/styles/tokens.css`, the primitives in `src/components/ui`, and the
same type scale (serif display, Geist UI text, tabular numerals). The review target is
1600 × 1000; content scrolls inside the desktop window when a screen needs more room.

Photography is licensed Pexels and Wikimedia imagery under `public/media`; see
`OPEN_SOURCE_CREDITS.md`.

## Evidence in this pass

- **The 50-route sweep was re-run on 2026-10-23 at 1600 × 1000, 1280 × 800, and 1024 × 720.**
  All three passes recorded no console errors, failed images, missing `h1`/`main` landmarks, or
  horizontal page scroll. The only HTTP error in the first run was a missing favicon request,
  fixed by adding `public/favicon.svg`. The 1280 pass is the full sweep the earlier notes had
  only sampled; the 1024 pass covers the short-window launch and welcome canvases.
- **Every route was rendered in the running Vite app at 1600 × 1000** and reviewed as six-up
  contact sheets plus full-size checks of the densest screens (kiosk, check-in, coverage,
  roster, hours review, schedule, reports). No route rendered blank or overflowed the window
  horizontally.
- **Mission Control** holds one composition: hero photo + greeting, inset quote, four metric
  cards, weekly seat-fill chart, attention list, community strip, recent activity, suggested
  action, and the dark sidebar.
- Interaction checks (kiosk → attendance, roster waitlist promotion, hours approval,
  accessibility text scale) are recorded in [TESTING.md](TESTING.md).
- Reference-specific CSS modules are used throughout; screens share primitives but not one
  generic template.
- After the sweep, the demo clock was made consistent: demo-day arrivals only count when the
  check-in window is open, so the volunteer check-in rail, coordinator attendance, roster,
  and kiosk now agree. Waitlist ids became volunteer-stable after a promotion was observed
  transferring status to the next candidate.

## Final polish pass (2026-10-24)

The last pass treated the whole product as one surface rather than a set of screens.

- **Geometry.** Card corners moved from 16 px to **6 px** and hero corners from 20 px to
  **4 px**, so panels read as printed blocks instead of generic rounded web cards. Chips use
  3 px corners; the pill radius is now reserved for status tags and circular controls.
- **Type and spacing.** Section eyebrows, card headers, table cells, and empty states were
  checked against the same 4 px spacing scale. The shared page header, stat card, and dialog
  now set the rhythm that route-level CSS follows instead of re-inventing.
- **Launch screen.** The oversized decorative orb that intentionally overflowed the viewport
  was removed. The startup checklist now sits on the canvas without an element that causes
  scroll or needs a clipping mask.
- **Coverage.** The selected-shift panel names itself: the default card says “Highest-risk
  shift”, and a card opened from the table says “Selected shift”. Without that line, a
  Saturday card above a Tuesday list looked like a sorting bug.
- **Schedule.** The bland three-band calendar was rebuilt as a five-band, two-hour grid with a
  wider canvas, week totals, real cause and role-gap filters, role-level coverage in the rail,
  a working month navigator, and an honest no-service week state. Role gap and seat fill are
  named separately so “75% full” no longer reads as “covered”.
- **Help.** The sidebar Help item opened `/welcome`, which asked the reader to choose a role
  again. It now opens a real `/help` page with coordinator and volunteer journeys, shortcuts,
  data notes, FAQ and working deep links.
- **Reporting.** The custom report trend grouped display labels in insertion order, so its
  axis jumped between dates. It now groups by ISO date, sorts before slicing, and the preview
  table is newest-first. A unit test pins the ordering.
- **Verification.** `pnpm verify` passes: typecheck, ESLint, Prettier, **180 tests** in 18
  files, the production web build, and the Rust workspace tests. The 50 registered routes plus
  `/help` were swept at 1600 × 1000, 1280 × 800, 1024 × 720, 820 × 1180 and 390 × 844 with no
  overflow, console errors or blank renders. Axe reported no findings on the 50 routes
  registered today; the
  rendered-pixel contrast sweep reported no text violations in light or dark theme. **22**
  scripted interaction checks and **9** persistence checks passed, including save/reload,
  hours approval, kiosk check-in, CSV export, and demo reset. `pnpm db:verify` reads the live
  desktop file and checks integrity, schema v6, 32 tables, foreign keys and record counts.

## Collapsed navigation rail

Below 1180 px, and whenever the reader collapses it, the navigation is a 72 px icon rail. On
pointer hover or keyboard focus the rail grows to its full 232 px width by animating the shell
column, not by floating an overlay panel: measured at 1600, 1100, and 900 px, the rail's right
edge and the content's left edge stay at exactly the same x, so no page text is ever covered.
A short cast-shadow gradient and a glass lift on the rail keep the “pops out” read, and the
pin button turns the expansion into a permanent preference (stored in `localStorage`).
On phones the rail stays a drawer with a scrim; hover expansion is disabled there.

## Design defects corrected

These came from the original designs; the implementation fixes them rather than
reproducing them.

1. **Mission Control (screen 01):** the hero is a composite of overlapping screenshots with
   duplicated headline text, a stray nav rail inside the photo, and clipped stats. Rebuilt
   as one photo, one greeting, an impact quote, and derived metrics.
2. **Coverage card vs bars (screens 01 and 19):** a 91 % card sat above bars averaging roughly 86 %. The
   card is now **role coverage** (filled required slots / required slots) and the bars are
   **seat fill** (confirmed / capacity), each labeled and documented in `COVERAGE_HEALTH.md`.
3. **Screenshots standing in for photography (screens 04, 16, 17, 20, 37):** replaced with licensed community
   photos. App screenshots never stand in for people or programs.
4. **Ghosted or duplicated headings (screens 05, 07, 12, 13, 15, 21, 29):** one title block per page,
   metrics in their own row, no overlap with the hero portrait.
5. **Volunteer profile (screens 07 and 29):** the design stacks three portraits and overlaps metric chips.
   There is no portrait for that profile in the licensed set; the implementation uses a
   dignified initials avatar and a single identity band. This is a deliberate substitution,
   not an omission. AutoRoster has separate licensed portraits for its six visible
   candidates.
6. **Kiosk (screen 33):** “CHECK IN” appears twice at different sizes and two conflicting codes
   (481276 / 4812766) are shown. Rebuilt as one heading, one six-digit entry, one documented
   demo code, and a live count. QR is a fallback disclosure because the demo must not depend
   on camera permission.
7. **Hours and impact totals (screens 03, 12 and 13):** the designs mix 84.5, 327, 82, 73, and 418 without
   saying which is year-to-date, active, or this month. Every screen now labels the scope and
   reads from one record. “Unique volunteers this year” and “currently active” are separate.
8. **Color-only status:** all statuses pair color with text and a dot/icon.
9. **Fixed 1000 px pages:** 1600 × 1000 remains the review target; screens with more content
   scroll inside the window rather than shrinking type below readable sizes.

## Contrast and focus

Text tokens target at least 4.5:1 on the warm canvas and paper surfaces
(`--color-ink #0f1c2e`, `--color-ink-soft #55617a`, `--color-ink-muted #606b7f` on
`#f5f1e9` / `#fffdf8`). Muted text is used for secondary metadata, not body copy. Focus is a
3 px cobalt outline with 2 px offset. The accessibility screen offers higher contrast and
underlined links for anyone who needs more.

Tinted statuses use ink/soft pairs rather than the raw signal color: `--tone-green-ink`,
`--tone-amber-ink`, `--tone-red-ink`, `--tone-cobalt-ink`, `--tone-violet-ink`,
`--tone-cyan-ink`, and `--tone-teal-ink` each clear 4.5:1 on their own soft surface in both
themes. Inline `--color-green`/`--color-red`/`--color-orange` are reserved for fills, dots,
and bars, never for text.

Two Chrome DevTools Protocol sweeps computed contrast for every text-bearing element on all
50 registered routes plus `/help` in light and dark theme (2026-10-24). `scripts/audit-contrast.mjs` composites each
element over its computed ancestor background stack; the stricter pass samples the rendered
PNG only where the glyphs actually paint, by diffing the frame against the same frame with
text hidden, so decoration, rounded-badge corners, and disclosure content cannot produce
false readings. Both report no violations outside photography.

That pass found and fixed hard-coded light-theme inks that leaked into dark mode, a hero
scrim tinted with `--ink-rgb` (which flips light in dark theme, turning white text gray),
photo badges using translucent tints, muted table headers on tinted rows, small white
metadata at 40–66 % opacity over photography, and several green/amber/red numbers drawn in
raw signal colors. It also caught the AutoRoster and Check-In “worlds”, which paint cream
panes but inherit theme tokens: they are now pinned with `data-theme="light"` on their root,
so both the pane and its ink stay in the same palette in either app theme. Overlapping
avatar stacks no longer clip initials, kiosk exit links are 44 px targets, and the
verification certificate’s print stylesheet is gated on `body[data-print-view]` so it no
longer hides every other page when printed.

Badges that sit on a photo use `<Badge onMedia>`, which swaps the translucent tint for a
solid `--scrim-rgb` glass, so the label stays legible whatever the image is doing.

jsdom cannot evaluate composited contrast, so the axe test disables the contrast rule; the
CDP sweep above is the automated evidence for color, and this document records the token
decision behind it.

## Print and kiosk verification

Chromium print output was rendered to PDF on 2026-10-23: the service certificate is one
page, and the impact report and personal impact screen print their full content with the app
shell removed. The certificate stylesheet no longer leaks into other routes. WebKit print
(Tauri on macOS) still needs a manual pass; the rules use standard `@page`, `break-inside`,
and visibility declarations, but no automated WebKit printer is available here.

`src/app/print.test.tsx` is the regression guard: it mounts all 50 routes, checks the
certificate sets and clears its print gate, checks the impact report still renders the
sections it prints, and asserts the certificate's print-hiding selector stays scoped to that
gate. jsdom does not evaluate `@media print`, so the rendered-PDF result above remains the
end-to-end evidence.

`pnpm audit:print` reproduces that evidence in headless Chrome: it renders the certificate
and report under print media, requires each surface to stay visible with its text and eight
visible text nodes, and fails when the PDF falls to a blank-page size. `scripts/verify.sh`
runs it with `--best-effort`, so a machine without Chrome skips it rather than failing the
whole verification.

The kiosk was measured at 1600 × 1000, 1280 × 800, 1024 × 720, and portrait 820 × 1180: the
code entry is 68 px tall with a six-digit numeric field, names stay shortened, there is no
horizontal scroll, and every control except the logo link clears 44 px. The physical touch
screen and on-screen keyboard were not available to test.

## Open visual tasks

1. Verify print output for Service Verification and Impact Report in WebKit (Tauri/WKWebView)
   on macOS; Chromium output is verified above.
2. Re-check the kiosk on a physical touch display at arm’s length, including the on-screen
   keyboard and privacy masking in the venue lighting.
