export type ShellRole = "coordinator" | "volunteer" | "public";

export interface RouteMeta {
  id: string;
  /** Registry order. Reference numbers live in docs/SCREEN_MAP.md. */
  number: number;
  title: string;
  path: string;
  role: ShellRole;
  spec: string;
  keywords: string[];
  /** Every registered route resolves to a built screen. */
  built?: boolean;
}

export const routes: RouteMeta[] = [
  {
    id: "launch",
    number: 1,
    title: "Launch Screen",
    path: "/launch",
    role: "public",
    spec: "Startup checks",
    keywords: ["startup", "database", "launch"],
  },
  {
    id: "welcome",
    number: 2,
    title: "Welcome",
    path: "/welcome",
    role: "public",
    spec: "Choose your workspace",
    keywords: ["welcome", "role", "get started"],
  },
  {
    id: "sign-in",
    number: 3,
    title: "Sign In",
    path: "/sign-in",
    role: "public",
    spec: "Account entry",
    keywords: ["sign in", "login", "demo"],
  },
  {
    id: "volunteer-onboarding",
    number: 4,
    title: "Volunteer Onboarding",
    path: "/volunteer/onboarding",
    role: "volunteer",
    spec: "Profile, skills, availability",
    keywords: ["onboarding", "skills", "availability"],
  },
  {
    id: "organization-setup",
    number: 5,
    title: "Organization Setup",
    path: "/coordinator/organization/setup",
    role: "coordinator",
    spec: "Workspace profile",
    keywords: ["organization", "setup", "mission"],
  },
  {
    id: "volunteer-home",
    number: 6,
    title: "Home",
    path: "/volunteer/home",
    role: "volunteer",
    spec: "Next shift and recommendations",
    keywords: ["home", "volunteer", "next shift"],
  },
  {
    id: "discover",
    number: 7,
    title: "Discover Opportunities",
    path: "/volunteer/discover",
    role: "volunteer",
    spec: "Search and matching",
    keywords: ["discover", "opportunities", "search", "match"],
  },
  {
    id: "opportunity-detail",
    number: 8,
    title: "Opportunity Detail",
    path: "/volunteer/opportunities/:slug",
    role: "volunteer",
    spec: "Sign up and match",
    keywords: ["opportunity", "sign up", "roles"],
  },
  {
    id: "saved",
    number: 9,
    title: "Saved Opportunities",
    path: "/volunteer/saved",
    role: "volunteer",
    spec: "Shortlist",
    keywords: ["saved", "shortlist"],
  },
  {
    id: "my-schedule",
    number: 10,
    title: "My Schedule",
    path: "/volunteer/schedule",
    role: "volunteer",
    spec: "Upcoming service",
    keywords: ["schedule", "calendar", "shifts"],
  },
  {
    id: "volunteer-shift",
    number: 11,
    title: "Shift Detail",
    path: "/volunteer/shifts/:id",
    role: "volunteer",
    spec: "Prepare for a shift",
    keywords: ["shift", "checklist", "arrival"],
  },
  {
    id: "check-in",
    number: 12,
    title: "Check In",
    path: "/volunteer/check-in",
    role: "volunteer",
    spec: "Event code entry",
    keywords: ["check in", "code", "attendance"],
  },
  {
    id: "my-hours",
    number: 13,
    title: "My Hours",
    path: "/volunteer/hours",
    role: "volunteer",
    spec: "Service record",
    keywords: ["hours", "verification", "history"],
  },
  {
    id: "personal-impact",
    number: 14,
    title: "Personal Impact",
    path: "/volunteer/impact",
    role: "volunteer",
    spec: "Hours into meaning",
    keywords: ["impact", "outcomes", "meals"],
  },
  {
    id: "service-verification",
    number: 15,
    title: "Service Verification",
    path: "/volunteer/verification",
    role: "volunteer",
    spec: "Official records",
    keywords: ["verification", "service record", "pdf"],
  },
  {
    id: "volunteer-profile",
    number: 16,
    title: "Volunteer Profile",
    path: "/volunteer/profile",
    role: "volunteer",
    spec: "Skills and credentials",
    keywords: ["profile", "skills", "credentials"],
  },
  {
    id: "notifications",
    number: 17,
    title: "Notifications",
    path: "/volunteer/notifications",
    role: "volunteer",
    spec: "Priority alerts",
    keywords: ["notifications", "alerts", "waitlist"],
  },
  {
    id: "mission-control",
    number: 18,
    title: "Mission Control",
    path: "/coordinator/mission-control",
    role: "coordinator",
    spec: "Operating overview",
    keywords: ["dashboard", "mission control", "overview"],
    built: true,
  },
  {
    id: "coverage",
    number: 19,
    title: "Coverage Command Center",
    path: "/coordinator/coverage",
    role: "coordinator",
    spec: "Staffing risk",
    keywords: ["coverage", "staffing", "gaps"],
  },
  {
    id: "autoroster",
    number: 20,
    title: "AutoRoster",
    path: "/coordinator/autoroster",
    role: "coordinator",
    spec: "Optimized staffing",
    keywords: ["autoroster", "optimize", "matching"],
  },
  {
    id: "schedule",
    number: 21,
    title: "Schedule",
    path: "/coordinator/schedule",
    role: "coordinator",
    spec: "Shift planning",
    keywords: ["schedule", "shifts", "calendar"],
  },
  {
    id: "opportunities",
    number: 22,
    title: "Opportunities",
    path: "/coordinator/opportunities",
    role: "coordinator",
    spec: "Program management",
    keywords: ["opportunities", "programs"],
  },
  {
    id: "create-opportunity",
    number: 23,
    title: "Create Opportunity",
    path: "/coordinator/opportunities/new",
    role: "coordinator",
    spec: "Guided workflow",
    keywords: ["create", "new opportunity", "roles"],
  },
  {
    id: "opportunity-management",
    number: 24,
    title: "Opportunity Management",
    path: "/coordinator/opportunities/:id",
    role: "coordinator",
    spec: "Shifts and impact",
    keywords: ["manage", "opportunity", "fill rate"],
  },
  {
    id: "coordinator-shift",
    number: 25,
    title: "Shift Detail",
    path: "/coordinator/shifts/:id",
    role: "coordinator",
    spec: "Live roster",
    keywords: ["shift", "roster", "waitlist"],
  },
  {
    id: "volunteers",
    number: 26,
    title: "Volunteers",
    path: "/coordinator/volunteers",
    role: "coordinator",
    spec: "Volunteer database",
    keywords: ["volunteers", "people", "skills"],
  },
  {
    id: "volunteer-detail",
    number: 27,
    title: "Volunteer Detail",
    path: "/coordinator/volunteers/:id",
    role: "coordinator",
    spec: "Profile and history",
    keywords: ["volunteer", "attendance", "credentials"],
  },
  {
    id: "applications",
    number: 28,
    title: "Recruitment Pipeline",
    path: "/coordinator/applications",
    role: "coordinator",
    spec: "Applicant stages",
    keywords: ["applications", "recruitment", "pipeline"],
  },
  {
    id: "credentials",
    number: 29,
    title: "Credentials & Skills",
    path: "/coordinator/credentials",
    role: "coordinator",
    spec: "Supply vs demand",
    keywords: ["credentials", "skills", "expiring"],
  },
  {
    id: "attendance",
    number: 30,
    title: "Attendance",
    path: "/coordinator/attendance",
    role: "coordinator",
    spec: "Live event attendance",
    keywords: ["attendance", "check in", "no show"],
  },
  {
    id: "kiosk",
    number: 31,
    title: "Check-In Kiosk",
    path: "/coordinator/kiosk",
    role: "coordinator",
    spec: "Coordinator-run check-in",
    keywords: ["kiosk", "check in", "code"],
  },
  {
    id: "hours-review",
    number: 32,
    title: "Hours Review",
    path: "/coordinator/hours",
    role: "coordinator",
    spec: "Approve service hours",
    keywords: ["hours", "review", "approve"],
  },
  {
    id: "reports",
    number: 33,
    title: "Reports",
    path: "/coordinator/reports",
    role: "coordinator",
    spec: "Reporting templates",
    keywords: ["reports", "participation", "coverage"],
  },
  {
    id: "custom-report",
    number: 34,
    title: "Custom Report Builder",
    path: "/coordinator/reports/custom",
    role: "coordinator",
    spec: "Build a report",
    keywords: ["report builder", "fields", "export"],
  },
  {
    id: "impact-analytics",
    number: 35,
    title: "Impact Analytics",
    path: "/coordinator/impact",
    role: "coordinator",
    spec: "Community outcomes",
    keywords: ["impact", "analytics", "meals", "trees"],
  },
  {
    id: "insights",
    number: 36,
    title: "Retention & Engagement",
    path: "/coordinator/insights",
    role: "coordinator",
    spec: "Return rate",
    keywords: ["retention", "engagement", "cohorts"],
  },
  {
    id: "impact-report",
    number: 37,
    title: "Impact Report Preview",
    path: "/coordinator/reports/preview",
    role: "coordinator",
    spec: "Export preview",
    keywords: ["impact report", "pdf", "preview"],
  },
  {
    id: "records",
    number: 38,
    title: "Records",
    path: "/coordinator/records",
    role: "coordinator",
    spec: "Unified service records",
    keywords: ["records", "search", "export"],
  },
  {
    id: "audit",
    number: 39,
    title: "Audit Log",
    path: "/coordinator/audit",
    role: "coordinator",
    spec: "Change history",
    keywords: ["audit", "log", "history"],
  },
  {
    id: "backup",
    number: 40,
    title: "Backup & Recovery",
    path: "/coordinator/backup",
    role: "coordinator",
    spec: "Snapshots and restore",
    keywords: ["backup", "restore", "snapshot"],
  },
  {
    id: "settings",
    number: 41,
    title: "Settings",
    path: "/coordinator/settings",
    role: "coordinator",
    spec: "Workspace preferences",
    keywords: ["settings", "workspace", "preferences"],
  },
  {
    id: "accessibility",
    number: 42,
    title: "Accessibility",
    path: "/coordinator/accessibility",
    role: "coordinator",
    spec: "Comfort and access",
    keywords: ["accessibility", "contrast", "text size", "motion"],
  },
];

function scoreRoute(route: RouteMeta, query: string): number {
  const title = route.title.toLowerCase();
  const keywords = route.keywords.map((keyword) => keyword.toLowerCase());
  let score = 0;
  if (title === query) score += 100;
  if (title.startsWith(query)) score += 60;
  if (new RegExp(`\\b${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(title)) score += 40;
  if (title.includes(query)) score += 20;
  if (keywords.some((keyword) => keyword.startsWith(query))) score += 15;
  if (keywords.some((keyword) => keyword.includes(query))) score += 8;
  if (route.spec.toLowerCase().includes(query)) score += 4;
  return score;
}

export function searchRoutes(query: string): RouteMeta[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return routes.slice(0, 8);
  }
  return routes
    .map((route) => ({ route, score: scoreRoute(route, normalized) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.route.number - b.route.number)
    .slice(0, 8)
    .map((entry) => entry.route);
}
