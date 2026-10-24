# CivicFlow — Product Vision and Competition Strategy

## 1. Product Summary

**CivicFlow** is an offline-first nonprofit volunteer operations and impact platform designed for the 2026–2027 FBLA Coding & Programming topic, **Serving the Community: Nonprofit Volunteer Management**.

Its purpose is not merely to store volunteer records. CivicFlow helps a nonprofit move from:

> “We need qualified volunteers for this service opportunity”

to:

> “The right people are scheduled, attendance is verified, service is recorded, the organization understands where coverage is weak, and community impact is measurable.”

The central idea is **Precision With Humanity**. CivicFlow combines serious operational software with an interface that continually reminds users that the data represents people, service, and real community outcomes.

---

## 2. Problem CivicFlow Solves

Volunteer programs frequently manage five interconnected problems:

1. **Recruitment** — attracting and onboarding the right volunteers.
2. **Scheduling** — assigning people to opportunities without conflicts.
3. **Coverage** — ensuring shifts are not only full, but have the correct skills and credentials.
4. **Participation records** — tracking attendance, hours, service verification, credentials, and history.
5. **Impact reporting** — translating service activity into understandable outcomes for nonprofit leaders.

A normal volunteer database or SignUpGenius-style scheduler addresses only part of this workflow. CivicFlow is designed as an integrated operations system.

---

## 3. Primary Users

### Volunteer

A volunteer can:

- create and maintain a profile
- define interests, skills, languages, availability, and credentials
- discover opportunities
- see explainable match percentages
- save opportunities
- register or join waitlists
- manage a personal schedule
- check in
- track verified service hours
- request service verification
- view personal impact
- receive notifications and schedule changes

### Coordinator

A nonprofit coordinator can:

- recruit and onboard volunteers
- create opportunities and recurring shifts
- define required roles and qualifications
- monitor coverage
- optimize staffing
- manage waitlists and cancellations
- operate attendance and kiosk flows
- approve or correct hours
- monitor expiring credentials
- generate reports
- review retention and participation
- restore data from backups
- inspect audit history

### Organization Leader / Administrator

An organization leader can:

- understand program health
- review staffing risks
- compare programs
- measure community impact
- verify records
- manage organization settings and access

---

## 4. Core Differentiator — Intelligent Volunteer Allocation

The technical centerpiece is **AutoRoster**, an explainable, constraint-aware staffing engine.

Instead of simply sorting volunteers by one score, CivicFlow treats volunteer staffing as an assignment problem.

### Hard constraints

The engine first removes impossible assignments, such as:

- volunteer is unavailable
- volunteer is under the role’s minimum age
- certification is missing or expired
- volunteer is already scheduled elsewhere
- assignment would exceed a configured workload limit
- role requires a language or credential the volunteer does not have

### Match scoring

Eligible volunteer-to-role edges receive a weighted score.

Example conceptual model:

```text
MatchScore =
0.35 * skill_fit
+ 0.25 * availability_fit
+ 0.15 * interest_fit
+ 0.10 * preference_fit
+ 0.10 * workload_fairness
+ 0.05 * reliability
```

The final production implementation can tune these weights and expose them in documentation.

### Assignment algorithm

The roster can be modeled as a weighted bipartite graph:

```text
Volunteers  ->  Required Shift Roles
```

CivicFlow can use weighted matching or minimum-cost maximum-flow style logic to optimize the **whole roster**, rather than greedily selecting the highest ranked individual for each role.

This demonstrates meaningful programming knowledge through:

- arrays and lists
- maps and sets
- graph modeling
- constraints
- scoring
- priority logic
- validation
- conditional workflows
- modular domain logic

### Explainability

Every recommendation must answer **why**.

Example:

```text
Maya Chen
94% match

+ Skills
+ Available at shift time
+ Spanish
+ Food handling credential valid
+ Strong food-security interest
+ No schedule conflict
+ Balanced weekly workload
```

A rejected assignment should also be understandable:

```text
Not eligible
Driver certification expires before this shift.
```

The matching system should remain useful even if no external AI service is available.

---

## 5. Coverage Intelligence

A full shift is not necessarily a usable shift.

CivicFlow distinguishes:

- seat coverage
- role coverage
- credential coverage
- language coverage
- schedule conflicts
- waitlist depth
- confirmation risk

Example:

```text
Food Distribution
Coverage Health 78%

General       6 / 6
Spanish       1 / 2
Driver        0 / 1

Critical gap:
Certified driver missing
```

The coordinator can select **Resolve Coverage** or **Optimize Staffing** to see qualified replacements.

---

## 6. Recovery Engine

CivicFlow reduces manual coordinator work after cancellations.

Example workflow:

```text
IF confirmed volunteer cancels
THEN recalculate shift coverage

IF shift has a waitlist
THEN evaluate waitlisted volunteers in order

IF candidate satisfies the missing role
THEN promote candidate

ELSE continue searching

IF no waitlist candidate qualifies
THEN run SmartMatch recommendations
```

This directly demonstrates meaningful if/then logic and saves user steps.

---

## 7. Intelligent Features

CivicFlow’s intelligent functionality should be distributed throughout the product instead of existing as a decorative chatbot.

### AutoRoster

Constraint-aware optimal staffing.

### Coverage Intelligence

Detects skill, capacity, credential, availability, and role gaps.

### Opportunity Recommendations

Ranks opportunities for volunteers and explains the match.

### Plain-Language Opportunity Planner

A coordinator can type:

> Need eight volunteers Saturday morning for food distribution, including one driver and two Spanish speakers.

CivicFlow parses this into editable opportunity fields.

### Ask CivicFlow

A deterministic or locally supported query interface can answer questions such as:

- Who can replace Maya Saturday?
- Which shifts are understaffed this weekend?
- Which volunteers have not served in 60 days?
- Which credentials expire soon?
- Which program has the lowest fill rate?

Results should always lead to actions.

---

## 8. Recruitment and Volunteer Lifecycle

Volunteer lifecycle:

```text
Applicant
-> Review
-> Onboarding
-> Active
-> Inactive
```

Profile data may include:

- contact information
- age eligibility
- skills
- languages
- interests
- causes
- availability
- accessibility preferences
- credentials
- attendance history
- hours
- service history
- internal notes where appropriate

Recommendations begin immediately after onboarding.

---

## 9. Scheduling

CivicFlow supports:

- one-time opportunities
- recurring opportunities
- individual shifts
- capacity limits
- role requirements
- qualification requirements
- calendar views
- agenda views
- volunteer availability
- conflict detection
- waitlists
- automatic promotion
- cancellation recovery
- calendar export

The Schedule experience must be optimized for desktop productivity and keyboard use.

---

## 10. Attendance and Check-In

CivicFlow supports:

- coordinator attendance screen
- kiosk mode
- event code check-in
- QR check-in
- check-out
- late / missing / no-show status
- manual corrections
- hour approval
- review requests
- attendance history

Successful check-in should feel fast, reassuring, and visually distinct.

---

## 11. Service Hours and Verification

Hours can originate from:

- kiosk attendance
- approved manual submissions
- coordinator corrections

CivicFlow should clearly distinguish:

- pending
- verified
- rejected
- corrected

Volunteers can generate verified service records and service verification documents.

Verification records can include:

- volunteer name
- organization
- service period
- verified hours
- verification ID
- issue date
- status

---

## 12. Impact Analytics

CivicFlow should move beyond “total volunteer hours.”

Opportunity outcomes can include:

- meals packed
- families served
- tutoring sessions
- students supported
- garden beds restored
- trees planted
- community events supported

Impact reporting connects:

```text
Volunteer participation
-> Program activity
-> Community outcome
```

This is one of CivicFlow’s key emotional and visual differentiators.

---

## 13. Reporting

Reports should be customizable rather than fixed screenshots.

Filters may include:

- date range
- organization
- program
- opportunity
- volunteer
- role
- cause
- attendance status
- credential
- age group
- volunteer group

Report types:

- Participation
- Coverage
- Attendance
- Retention
- Volunteer Hours
- Skills and Credentials
- Program Impact
- Custom Report

Exports:

- PDF
- CSV

The report builder should update immediately when filters or fields change.

---

## 14. Data Storage and Reliability

Recommended architecture from the original plan:

### Desktop shell

**Tauri 2**

### Front end

**React + TypeScript**

### Core/domain logic

**Rust**

### Database

**SQLite**, with encryption if practical for the competition build.

### Why this architecture

- standalone desktop application
- offline-capable demo
- strong type safety
- local reliability
- no dependence on venue internet
- appropriate relational storage
- technically defensible language selection
- native file and backup support

The exact implementation may be simplified if necessary, but the architectural rationale should remain clear.

---

## 15. Backup and Recovery

The rubric specifically rewards strong data storage and dynamic backup capability.

CivicFlow should provide rolling snapshots.

Possible triggers:

- application startup
- periodic backup after changes
- before bulk imports
- before destructive operations
- before restoration

Backup page should show:

- last backup
- number of snapshots
- snapshot time
- preview counts
- restore action

Example:

```text
Snapshot 3:45 PM

82 volunteers
14 opportunities
418 attendance/hour records
```

---

## 16. Audit Trail

Meaningful changes are logged.

Examples:

- opportunity created
- volunteer registered
- roster optimized
- waitlist promotion
- attendance edited
- hours corrected
- verification issued
- backup completed
- snapshot restored

Audit records should include:

- timestamp
- actor
- action
- affected entity
- relevant before/after data when useful

---

## 17. Semantic Validation

CivicFlow validates **meaning**, not only format.

Examples:

| Input           | Semantic rule                                   |
| --------------- | ----------------------------------------------- |
| Shift time      | end must be after start                         |
| Capacity        | cannot be below confirmed registrations         |
| Age             | volunteer must meet role age rule               |
| Credential      | must remain valid on event date                 |
| Assignment      | cannot overlap another confirmed shift          |
| Hours           | checkout must occur after check-in              |
| Email           | duplicate volunteer record should be detected   |
| Role assignment | volunteer must satisfy mandatory qualifications |

Errors should always explain:

1. what happened
2. why
3. how to fix it
4. the next action

---

## 18. Accessibility

Accessibility is a first-class requirement, not a presentation claim.

CivicFlow should support:

- keyboard navigation
- visible focus indicators
- large text scaling
- reduced motion
- high contrast
- screen-reader labels
- accessible forms
- status icons plus text
- no meaning communicated by color alone
- responsive layout at increased text sizes
- accessible chart descriptions

---

## 19. Help System

CivicFlow includes:

- searchable Help Center
- contextual help
- route-aware suggestions
- keyboard shortcut
- intelligent Q&A / Ask CivicFlow
- troubleshooting guidance
- algorithm explanation articles

Help content should make the program feel complete and intuitive.

---

## 20. Documentation

Competition documentation should include:

```text
README.md
ARCHITECTURE.md
DATA_MODEL.md
MATCHING_ENGINE.md
SECURITY.md
ACCESSIBILITY.md
TESTING.md
USER_GUIDE.md
OPEN_SOURCE_CREDITS.md
RUBRIC_MAP.md
DEMO.md
```

`RUBRIC_MAP.md` should map every rubric line to:

- feature
- screen
- source file
- test
- presentation moment

---

## 21. Testing Strategy

### Unit tests

- eligibility rules
- matching score
- waitlist order
- state transitions
- hour calculations
- report calculations
- backup rotation

### Integration tests

- database CRUD
- backup and restore
- signup to attendance to report
- cancellation to promotion

### UI tests

- onboarding
- scheduling
- registration
- check-in
- reporting
- validation errors

### Accessibility tests

- keyboard navigation
- focus visibility
- labels
- contrast
- reduced motion

A dedicated demo dataset should make the presentation deterministic.

---

## 22. Competition Presentation Story

The seven-minute demonstration should tell one coherent story.

Example:

1. Open Mission Control.
2. Show tomorrow’s food distribution shift missing required roles.
3. Open Coverage / AutoRoster.
4. Optimize staffing.
5. Explain why the selected volunteers were chosen.
6. Show a volunteer opportunity and match explanation.
7. Demonstrate semantic validation.
8. Check in a volunteer.
9. Show verified hours.
10. Generate or customize an impact report.
11. Briefly show backup and accessibility.
12. Show a small amount of actual algorithm code.
13. End on community impact.

Core closing idea:

> **CivicFlow turns volunteer time into reliable community impact.**

---

## 23. Competition Strategy

The project should prioritize:

- reliability over unnecessary integrations
- visible programming depth
- excellent interaction design
- understandable algorithms
- complete records
- offline functionality
- useful reports
- semantic validation
- accessibility
- backup and recovery
- documentation
- polish

Avoid spending competition time on:

- blockchain
- decorative AI
- unnecessary scraping
- social feeds
- complicated donation systems
- fragile third-party integrations
- features that cannot be demonstrated clearly

---

## 24. CivicFlow Product Identity

### Product promise

**People. Service. Real Change.**

### Design philosophy

**Precision With Humanity**

The application begins calm and operational.

As the user moves from:

```text
coordination
-> service
-> outcomes
```

the interface becomes progressively more expressive through photography, color, typography, and data visualization.

The software should feel capable enough for nonprofit operations while never losing sight of the human reason it exists.
