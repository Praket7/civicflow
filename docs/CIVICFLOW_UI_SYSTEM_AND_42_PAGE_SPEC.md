# CivicFlow — Complete UI System and 42-Page Screen Specification

## 1. Design North Star

### **Precision With Humanity**

CivicFlow should not resemble a generic nonprofit admin portal or a default SaaS dashboard.

The product combines:

- strong desktop productivity patterns
- editorial nonprofit storytelling
- dense operational data
- distinctive community photography
- expressive typography
- vivid but controlled color
- accessible interaction
- clear data visualization

The interface becomes visually richer as the user moves from administration toward community impact.

```text
Operations -> Service -> Impact
calm          human      expressive
```

---

# 2. Locked Visual Language

## Structural color

### Midnight Navy

`#071B32`

Primary use:

- sidebar
- dark impact surfaces
- kiosk environments
- high-contrast navigation
- dark-mode foundation

### Deep Navy Raised

`#0D2947`

Primary use:

- selected dark navigation
- elevated dark panels
- secondary dark surfaces

---

## Primary action color

### Electric Cobalt

`#315CFF`

Primary use:

- primary buttons
- links
- selected tabs
- focused controls
- command highlights

Use cobalt consistently for **action**, not decoration.

---

## Signature brand accent

### Pulse Lime

`#C8FF45`

Primary use:

- optimization success
- hand-drawn emphasis
- selected editorial underline
- signature wave accents
- perfect coverage moments
- high-value positive emphasis

Pulse Lime is punctuation. It should never become the default button color.

---

## Human-impact color

### Community Coral

`#FF655A`

Use:

- human-impact graphics
- attention states when appropriate
- photography accents
- expressive charts

### Warm Orange

`#FF9A32`

Use:

- pending states
- schedule risk
- service categories
- secondary graph series

### Sun Yellow

`#FFC83D`

Use:

- warnings
- light editorial illustrations
- optimistic accents

---

## Supporting expressive colors

### Civic Violet

`#7857FF`

Use:

- education
- volunteer milestones
- analytics series
- personal progress

### Service Teal

`#18BFA7`

Use:

- environment
- verification
- availability
- successful process states

### Sky Cyan

`#45C9FF`

Use:

- informational series
- gradient transitions
- scheduling graphics

### Success Green

`#21B66F`

Use:

- verified
- fully staffed
- confirmed
- successful validation

### Critical Red

`#ED4E4E`

Use:

- missing mandatory role
- destructive action
- failed validation
- urgent staffing risk

Never use red without an icon and text label.

---

## Light surfaces

### Warm Canvas

`#F5F1E9`

### Paper

`#FFFDF8`

### Elevated Paper

`#FFFFFF`

### Soft Border

`rgba(7,27,50,0.10)`

The canvas should feel warm rather than sterile white.

---

# 3. Typography

## Display / editorial font

**Source Serif 4**

Use for:

- major page headlines
- community impact statements
- editorial numbers
- hero messaging

Examples:

```text
Real people.
Lasting change.
```

```text
1,847
hours given back to the community.
```

Do not use serif typography inside dense controls or tables.

## UI font

**Geist Sans Variable**

Use for:

- navigation
- buttons
- labels
- forms
- tables
- body copy
- charts

Suggested weights:

| Purpose       | Weight |
| ------------- | -----: |
| Hero sans     |    650 |
| Page heading  |    600 |
| Section title |    550 |
| Button        |    520 |
| Label         |    500 |
| Body          |    430 |
| Secondary     |    420 |

## Mono

**Geist Mono**

Use only for:

- verification IDs
- kiosk codes
- request IDs
- technical logs
- timestamps where alignment matters
- keyboard shortcuts

Use tabular figures for metrics and table numbers.

---

# 4. Shape and Spacing

Base spacing:

```text
4 / 8 / 12 / 16 / 24 / 32 / 48
```

Radii:

```text
8px   compact controls
12px  standard panels
16px  major containers
20px  editorial/photo surfaces
```

Avoid “card soup.”

Use:

- typography
- alignment
- subtle separators
- background shifts
- split layouts

before adding another card.

---

# 5. Signature Graphic Motif

CivicFlow uses a layered **flow ribbon / wave**.

Colors can transition through:

```text
cobalt
cyan
teal
lime
yellow
orange
coral
violet
```

Use it:

- near hero imagery
- in onboarding
- at the bottom of Check In
- around impact moments
- behind empty states
- around personal milestones

Never put the wave behind dense table text.

---

# 6. Photography

Photography is functional content.

Preferred subjects:

- food distribution
- tutoring
- gardens
- community cleanup
- animal care
- volunteer teams
- local service
- authentic community settings

Photo treatment:

- warm natural light
- real environments
- candid interaction
- moderate depth of field
- minimal stock-photo posing

Dark overlays may be used for text legibility.

All licensed/open-source photography used in the final build must be documented.

---

# 7. Navigation

## Coordinator navigation

### WORK

- Mission Control
- Schedule
- Volunteers
- Opportunities
- Coverage
- Attendance

### UNDERSTAND

- Reports
- Impact
- Insights

### ORGANIZE

- Applications
- Records
- Notifications

Bottom:

- Help
- Settings
- Profile
- Saved locally

## Volunteer navigation

### EXPLORE

- Home
- Discover
- My Schedule
- My Hours
- My Impact
- Saved
- Notifications

### COMMUNITY

- Opportunities
- Organizations

Navigation should recede visually behind the work surface.

---

# 8. Global Command Palette

Shortcut:

```text
Cmd/Ctrl + K
```

Search:

- volunteers
- opportunities
- shifts
- organizations
- help
- reports
- actions
- settings

Examples:

```text
Create opportunity
Optimize Saturday staffing
Start kiosk
Find Maya Chen
Generate monthly report
```

---

# 9. Motion

Suggested timings:

```text
hover           100ms
press            90ms
menu            140ms
drawer          180ms
page transition 200ms
celebration     350–500ms
```

Use spring-like movement only for:

- roster assignment
- drag and drop
- successful check-in
- waitlist promotion
- AutoRoster optimization

Reduced Motion should replace movement with short fades.

---

# 10. Accessibility

Every production screen should support:

- full keyboard navigation
- visible focus
- semantic labels
- scalable text
- high contrast
- reduced motion
- status through text/icon + color
- descriptive validation
- large-text layout adaptation
- chart text alternatives
- comfortable pointer targets

---

# 11. Common Components

Core component library:

```text
Button
IconButton
SearchField
CommandPalette
DataTable
StatusBadge
PersonChip
Metric
CoverageMeter
Timeline
SegmentedControl
Inspector
Drawer
Modal
EmptyState
ErrorNotice
Toast
Chart
PhotoCard
SmartExplanation
FilterToken
Shortcut
Avatar
CauseChip
CredentialBadge
```

---

# 12. Page Specifications

There are **42 planned primary views**.

---

## 01. Launch Screen

### Purpose

Reliable standalone startup.

### Content

- CivicFlow mark
- product name
- short statement
- version
- local database status

### Startup checks

- database integrity
- schema/migrations
- configuration
- backup availability

### Visual

Dark navy canvas with restrained flowing lime/cobalt mark.

---

## 02. Welcome

### Purpose

Choose user journey.

### Layout

Split-screen.

Left:

- large service photograph
- editorial statement

Right:

- Coordinator
- Volunteer
- Sign in

### Hero line

**Every hour has somewhere to matter.**

---

## 03. Sign In

### Purpose

Fast account entry and competition demo switching.

### Content

- email
- password
- Continue
- demo coordinator
- demo volunteer

### Validation

Friendly inline explanations rather than raw errors.

---

## 04. Volunteer Onboarding

### Steps

1. Profile
2. Skills
3. Availability
4. Interests

### Special UX

Live profile preview and recommendation count.

### Signature element

Visual availability grid.

---

## 05. Organization Setup

### Content

- organization name
- mission
- causes
- location
- website
- contact
- logo
- cover image
- timezone

### Right side

Live public-profile preview.

### Completion

Workspace checklist and first automatic backup.

---

## 06. Volunteer Home

### Hero

Next confirmed shift with photography.

### Metrics

- hours
- events
- attendance

### Sections

- recommended opportunities
- upcoming shifts
- personal impact
- notifications

---

## 07. Discover Opportunities

### Purpose

Search and discovery.

### Hero

Editorial image plus:
**Find your next impact.**

### Controls

- search
- For You
- This Week
- Nearby
- Cause
- Skills
- Duration
- More Filters
- Grid / List

### Opportunity cards

- photo
- cause
- title
- organization
- date
- distance
- match %
- remaining spots
- save

### Right rail

- match profile
- recommendations
- map if enabled

---

## 08. Opportunity Detail

### Hero

Large service photograph.

### Content

- title
- organization
- verified state
- date/time
- distance/location
- Sign Up
- Save
- Share

### Tabs

- Overview
- Roles & Requirements
- Location
- Organization
- Impact
- Reviews / Photos

### Match panel

Explainable match percentage.

### Capacity panel

Seats and role availability.

---

## 09. Saved Opportunities

### Sections

- high match
- upcoming
- saved for later
- closed / unavailable

### Interactions

- quick register
- remove
- compare
- sort

---

## 10. My Schedule

### Views

- Upcoming
- Calendar
- Week
- Month
- Agenda

### Content

- shifts
- training
- availability
- waitlists
- conflicts

### Visual

Structured-style chronological clarity with CivicFlow color system.

---

## 11. Volunteer Shift Detail

### Purpose

Prepare for a registered shift.

### Content

- arrival time
- location
- coordinator
- checklist
- what to bring
- training requirements
- check-in status

### Actions

- Get ready
- Add to calendar
- Cancel registration
- Contact coordinator

---

## 12. Check In

### Purpose

Fast attendance entry.

### Primary

Six-digit code.

### Secondary

QR scan.

### Success state

- volunteer name
- opportunity
- check-in time
- confirmation

### Visual

Photography + glass-like entry surface + colorful CivicFlow ribbons.

---

## 13. My Hours

### Purpose

Personal service record.

### Hero

Personal service photography with:
**Time today. A stronger tomorrow.**

### Metrics

- verified hours
- events
- organizations
- people reached

### Main chart

Hours over time.

### Tabs

- All Hours
- Pending Approval
- Verified
- By Organization
- By Cause

### Table

- date
- opportunity
- organization
- hours
- status
- verification ID

### Actions

- Download report
- Request verification

---

## 14. Personal Impact

### Purpose

Translate hours into meaning.

### Hero metrics

- total hours
- events
- organizations
- people reached

### Outcomes

- meals packed
- tutoring sessions
- trees planted
- other mission-specific measures

### Content

- cause breakdown
- impact timeline
- annual story
- service photography

No competitive leaderboard.

---

## 15. Service Verification

### Purpose

Create and manage official service records.

### List

Issued verification documents.

### Document preview

- volunteer name
- organization
- service period
- hours
- verification code
- issue date
- signer
- status

### Actions

- Download PDF
- Share
- Verify code

---

## 16. Volunteer Profile

### Hero

Volunteer photo, name, status, summary metrics.

### Tabs

- Overview
- Schedule
- Hours
- Skills
- Credentials
- Interests
- Notes
- History

### Content

- contact
- availability
- skills
- credentials
- causes
- recommendations
- recent activity

---

## 17. Notifications

### Tabs

- Priority
- All

### High-value alerts

- promoted from waitlist
- shift changed
- credential expires
- hours approved
- event canceled

Every notification should contain a next action.

---

## 18. Mission Control

### Purpose

Coordinator operating overview.

### Hero

Editorial community photograph and mission message.

### Metrics

- active volunteers
- coverage
- monthly hours
- upcoming opportunities

### Main sections

- weekly coverage
- Needs Attention
- upcoming events
- recent activity
- community impact
- quick actions

This is a flagship demo screen.

---

## 19. Coverage Command Center

### Purpose

Find staffing risk quickly.

### Hero metric

Coverage Health.

### Shift rows

- capacity
- role gaps
- credential gaps
- language gaps

### Action

**Resolve Gap**

Status must use pattern/icon/text as well as color.

---

## 20. AutoRoster

### Purpose

Explainable optimized staffing.

### Three columns

1. Available Volunteers
2. Optimization Engine
3. Required Roles / Recommended Roster

### Candidate row

- portrait
- match %
- key credentials
- distance or availability
- conflict state

### Result

Before -> after coverage improvement.

### Explainability

Why each person was chosen.

---

## 21. Schedule

### Purpose

Coordinator shift planning.

### Views

- Week
- Month
- Agenda
- Coverage

### Layout

- mini calendar
- filters
- time grid
- staffing cards
- attention summary

### Interactions

- drag assignment
- create shift
- keyboard assignment
- conflict prevention

---

## 22. Opportunities

### Purpose

Coordinator opportunity management.

### Default

Dense sortable table.

Columns:

- opportunity
- next shift
- fill
- cause
- status

### Controls

- search
- filters
- view
- New Opportunity

---

## 23. Create Opportunity

### Structure

Guided multi-step workflow:

1. Basics
2. Roles
3. Requirements
4. Schedule
5. Location
6. Impact
7. Publish

### Intelligent planner

Plain-language description input.

Example:

> Need eight volunteers Saturday morning for food distribution, including one driver and two Spanish speakers.

### Templates

- food distribution
- tutoring
- cleanup
- garden
- event support
- mentorship

### Right rail

Live preview.

---

## 24. Opportunity Management

### Header

Photo + title + status.

### Metrics

- applications
- fill rate
- attendance
- hours
- outcome

### Tabs

- Overview
- Shifts
- Volunteers
- Impact
- Settings

---

## 25. Shift Detail / Live Roster

### Header

- opportunity
- date/time
- confirmed / capacity
- coverage

### Main

Roster table.

### Side panel

Required roles.

### Sections

- confirmed
- waitlist
- check-in
- coverage

### Actions

- Optimize
- Open kiosk
- Message roster

---

## 26. Volunteers

### Purpose

Coordinator volunteer database.

### Summary

- active
- new
- needs attention

### Filters

- skills
- availability
- reliability
- cause
- credentials
- hours

### Views

- Table
- People

---

## 27. Volunteer Detail

### Header

- portrait
- name
- status
- attendance
- hours
- events

### Tabs

- Overview
- Schedule
- Hours
- Skills
- Credentials
- Notes
- History

### Right rail

Best matching opportunities.

---

## 28. Recruitment Pipeline

### Stages

- Applied
- Review
- Onboarding
- Active

### Layout

Kanban.

### Card

- avatar
- name
- date
- strong skills
- match
- missing requirements

Activation is blocked if mandatory onboarding items remain incomplete.

---

## 29. Credentials & Skills

### Main visualization

Skills supply vs demand.

Example:

```text
Drivers      Have 2   Need 6
Spanish      Have 8   Need 5
Tutors       Have 10  Need 8
CPR          Have 3   Need 11
```

### Sections

- expiring credentials
- missing qualifications
- recruitment suggestions

---

## 30. Attendance

### Modes

- Live event
- History

### Live metrics

- expected
- checked in
- late
- missing

### Main

Attendance table.

### Actions

- check in
- check out
- edit attendance
- finalize

---

## 31. Check-In Kiosk

### Environment

Simplified public-facing mode.

### Content

- organization
- opportunity
- event time
- QR
- rotating / temporary code
- checked-in count

### Success

Volunteer photo/name briefly appears.

---

## 32. Hours Review

### Tabs

- Needs Review
- Approved
- Rejected

### Request comparison

- requested hours
- scheduled hours
- reason
- attendance context

### Actions

- Approve
- Adjust
- Reject

---

## 33. Reports Hub

### Templates

- Participation
- Coverage
- Impact
- Attendance
- Retention
- Skills

### Entry point

Custom Report.

### Hero

Impact statement plus reporting period.

---

## 34. Custom Report Builder

### Three columns

1. Fields
2. Report Canvas
3. Filters

### Visual options

- Table
- Bar
- Line
- Area
- Donut

### Export

- PDF
- CSV

Updates immediately.

---

## 35. Impact Analytics

### Visual mode

Most expressive analytics page.

### Hero

Large community image / Buffalo skyline.

### Metrics

- hours
- volunteers
- meals
- tutoring sessions
- trees
- other outcomes

### Visualizations

- impact by cause
- time series
- organization contribution
- event gallery

This is a flagship demo screen.

---

## 36. Retention & Engagement

### Main

Retention / return-rate visualization.

### Sections

- cohort retention
- repeat participation
- inactive volunteers
- engagement risk

### Explainability

Example:

> Maya normally volunteers every three weeks and has not participated for 51 days.

---

## 37. Organization Impact Report Preview

### Experience

Minimal app chrome.

Looks like the PDF users will export.

### Sections

- cover
- period
- mission
- volunteer participation
- impact outcomes
- photographs
- charts
- closing statement

---

## 38. Records

### Tabs

- Volunteers
- Hours
- Attendance
- Opportunities
- Impact

### Features

- universal search
- advanced filters
- saved views
- bulk selection
- export

---

## 39. Audit Log

### Layout

Chronological timeline / table hybrid.

### Record

- timestamp
- user
- action
- object
- summary

### Filters

- user
- action
- entity
- date

Technical IDs appear only when expanded.

---

## 40. Backup & Recovery

### Hero

**Your data is protected.**

### Metrics

- last backup
- snapshot count
- database size

### Snapshot timeline

Choose snapshot -> Preview.

### Preview

- volunteers
- opportunities
- records

### Action

Restore snapshot with explicit confirmation.

---

## 41. Settings

### Categories

- General
- Appearance
- Accessibility
- Notifications
- Organization
- Team
- Data
- Privacy
- About

Use a desktop-native settings hierarchy.

---

## 42. Accessibility

### Text

- size
- bold / readability options

### Appearance

- high contrast
- differentiate without color

### Motion

- reduced motion

### Navigation

- always-visible focus
- underline links

### Right side

Live preview.

---

# 13. Interaction Rules

## Drawers vs pages

Use a 360–420px inspector when the user needs quick contextual detail without losing their place.

Examples:

- volunteer preview
- shift requirement
- report filter details

Use a full page when the user is:

- creating
- analyzing
- editing many fields
- working with a complete workflow

---

# 14. Error Pattern

Every meaningful error answers:

```text
What happened?
Why?
How do I fix it?
What can I do now?
```

Example:

> **Maya cannot be assigned to this role.**
> Her driver certification expires before the event.
> Update the credential or choose another eligible volunteer.
>
> [Find replacement]

---

# 15. Empty-State Pattern

Every empty state contains:

- custom CivicFlow illustration
- one human sentence
- one primary action

Example:

> **Give your volunteers somewhere to start.**
> Create your first opportunity and CivicFlow can begin matching volunteers to it.
>
> [Create opportunity]

---

# 16. Toast Pattern

Bottom-center.

Example:

```text
✓ Maya assigned to Saturday        Undo
```

Important errors persist until dismissed.

---

# 17. Image and Asset Documentation

Every non-original asset used in the competition build should have:

- filename
- creator
- source
- license
- source URL
- date accessed
- where used

Maintain this in:

```text
OPEN_SOURCE_CREDITS.md
```

---

# 18. Competition UI Quality Checklist

Before any page is considered complete:

- [ ] one obvious visual hierarchy
- [ ] no unnecessary cards
- [ ] primary action is obvious
- [ ] keyboard interaction works
- [ ] focus state exists
- [ ] loading state exists
- [ ] empty state exists
- [ ] error state exists
- [ ] disabled state exists
- [ ] semantic validation exists where relevant
- [ ] no status depends on color alone
- [ ] large text does not break layout
- [ ] dark mode remains legible
- [ ] Reduce Motion works
- [ ] image alt text exists
- [ ] chart has accessible description
- [ ] consistent spacing/tokens
- [ ] source files use design tokens, not scattered literal colors

---

# 19. Implementation Token Direction

Example token families:

```text
surface.canvas
surface.paper
surface.raised
surface.dark

text.primary
text.secondary
text.inverse

action.primary
action.hover
action.pressed

status.success
status.warning
status.critical
status.info

cause.food
cause.education
cause.environment
cause.health
cause.community
cause.animals

accent.lime
accent.coral
accent.violet
accent.teal
accent.orange

radius.control
radius.panel
radius.hero

space.1
space.2
space.3
space.4
space.6
space.8
space.12

motion.instant
motion.fast
motion.standard
motion.celebration
```

The final implementation should use semantic tokens rather than hard-coded colors throughout components.
