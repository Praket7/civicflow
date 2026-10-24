import { differenceInCalendarDays, differenceInMinutes, format, parseISO } from "date-fns";
import type {
  Applicant,
  ApplicationStage,
  AttendanceStatus,
  AuditEvent,
  Cause,
  CredentialStatus,
  DemoWorkspace,
  Opportunity,
  SessionSnapshot,
  Shift,
  Volunteer,
  WaitlistEntry,
  WaitlistStatus,
  WorkspaceSettings,
} from "../../types/domain";
import { activeLocaleCode, t } from "../i18n";
import { demoWorkspace } from "./dataset";

/**
 * Read model shared by every screen. Screens never invent their own demo
 * arrays: they call these selectors so totals, names, and statuses agree
 * across surfaces. Writes go through WorkspaceSession; these functions apply
 * those overrides when a session is supplied.
 */

export type SessionOverrides = Partial<SessionSnapshot>;

const CAUSE_COPY: Record<Cause, string> = {
  food: "Food security",
  education: "Education",
  environment: "Environment",
  health: "Health",
  community: "Community",
  animals: "Animal welfare",
};

/** Labels stay keys in code, but read through the active catalogue on screen. */
export const CAUSE_LABELS: Record<Cause, string> = new Proxy(CAUSE_COPY, {
  get(target, property: string) {
    const value = target[property as Cause];
    return value ? t(value) : value;
  },
});

export const DEMO_EVENT_SHIFT_ID = "sh-tue-pantry";

export const DEFAULT_SETTINGS: WorkspaceSettings = {
  organizationName: demoWorkspace.organization.name,
  contactEmail: demoWorkspace.organization.email,
  timezone: demoWorkspace.organization.timezone,
  weekStartsOn: "monday",
  defaultShiftLength: 180,
  autoPromoteWaitlist: true,
  hoursRequireApproval: true,
  emailDigest: "weekly",
  textScale: "standard",
  highContrast: false,
  reducedMotion: false,
  underlineLinks: false,
  colourIndependent: true,
};

/* ------------------------------- formatting ------------------------------- */

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(activeLocaleCode()).format(value);
}

export function formatMinutes(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

export function formatHours(hours: number): string {
  return Number.isInteger(hours) ? `${hours} h` : `${hours.toFixed(1)} h`;
}

/*
 * Display dates go through Intl rather than a fixed date-fns pattern. Intl
 * already knows whether a language writes 08:00 or 8:00 AM, and it covers the
 * languages that do not ship a date-fns locale.
 */
const dateFormatters = new Map<string, Intl.DateTimeFormat>();

/*
 * Shift and audit timestamps are absolute instants. They must read the same on
 * a laptop in Buffalo and a build runner in UTC, so they are formatted in the
 * organization's timezone. Plain dates ("2026-10-17") and Date objects built
 * for calendar grids are civil values and stay in the local calendar, where
 * converting them could move a day or an hour.
 */
let activeTimeZone = demoWorkspace.organization.timezone;

/** Follow the organization timezone from workspace settings. */
export function setDisplayTimeZone(timeZone: string): void {
  const next = timeZone.trim();
  if (next) activeTimeZone = next;
}

function isTimestamp(value: string | Date): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value);
}

function dateFormatter(options: Intl.DateTimeFormatOptions, zoned = false): Intl.DateTimeFormat {
  const locale = activeLocaleCode();
  const zone = zoned ? activeTimeZone : "local";
  const key = `${locale}:${zone}:${options.weekday ?? ""}:${options.month ?? ""}:${options.day ?? ""}:${options.year ?? ""}:${options.hour ?? ""}:${options.minute ?? ""}`;
  const cached = dateFormatters.get(key);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat(
    locale,
    zoned ? { ...options, timeZone: activeTimeZone } : options,
  );
  dateFormatters.set(key, formatter);
  return formatter;
}

function formatterFor(
  value: string | Date,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  return dateFormatter(options, isTimestamp(value));
}

function toDate(value: string | Date): Date {
  return typeof value === "string" ? parseISO(value) : value;
}

export function formatTime(value: string | Date): string {
  return formatterFor(value, { hour: "numeric", minute: "2-digit" }).format(toDate(value));
}

export function formatDate(value: string | Date): string {
  return formatterFor(value, { weekday: "short", month: "short", day: "numeric" }).format(
    toDate(value),
  );
}

export function formatLongDate(value: string | Date): string {
  return formatterFor(value, { weekday: "long", month: "long", day: "numeric" }).format(
    toDate(value),
  );
}

export function formatDateWithYear(value: string | Date): string {
  return formatterFor(value, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(toDate(value));
}

export function formatDateTime(value: string | Date): string {
  const date = toDate(value);
  return `${formatterFor(value, { month: "short", day: "numeric" }).format(date)} · ${formatterFor(
    value,
    { hour: "numeric", minute: "2-digit" },
  ).format(date)}`;
}

export function formatMonthYear(value: string | Date): string {
  return formatterFor(value, { month: "long", year: "numeric" }).format(toDate(value));
}

export function formatMonthDay(value: string | Date, long = false): string {
  return formatterFor(value, { month: long ? "long" : "short", day: "numeric" }).format(
    toDate(value),
  );
}

export function formatDateRange(start: string | Date, end: string | Date, long = false): string {
  const zoned = isTimestamp(start) || isTimestamp(end);
  const formatter = dateFormatter(
    { month: long ? "long" : "short", day: "numeric", year: "numeric" },
    zoned,
  );
  return formatter.formatRange(toDate(start), toDate(end));
}

export function formatWeekday(value: string | Date, long = false): string {
  return formatterFor(value, { weekday: long ? "long" : "short" }).format(toDate(value));
}

export function formatWeekdayNarrow(value: string | Date): string {
  return formatterFor(value, { weekday: "narrow" }).format(toDate(value));
}

export function formatHour(value: Date): string {
  return dateFormatter({ hour: "numeric" }).format(value);
}

export function formatDayNumber(value: string | Date): string {
  return formatterFor(value, { day: "numeric" }).format(toDate(value));
}

export function timeRange(startsAt: string, endsAt: string): string {
  return `${formatTime(startsAt)} – ${formatTime(endsAt)}`;
}

export function shiftMinutes(shift: Shift): number {
  return differenceInMinutes(parseISO(shift.endsAt), parseISO(shift.startsAt));
}

export function relativeDayLabel(iso: string, demoNow: string = demoWorkspace.demoNow): string {
  const days = differenceInCalendarDays(parseISO(iso), parseISO(demoNow));
  if (days === 0) return t("Today");
  if (days === 1) return t("Tomorrow");
  if (days === -1) return t("Yesterday");
  if (days > 1) return `${t("In")} ${days} ${t("days")}`;
  return `${Math.abs(days)} ${t("days ago")}`;
}

/* --------------------------------- lookups -------------------------------- */

export function volunteerById(
  id: string,
  workspace: DemoWorkspace = demoWorkspace,
): Volunteer | undefined {
  return workspace.volunteers.find((volunteer) => volunteer.id === id);
}

export function opportunityById(
  id: string,
  workspace: DemoWorkspace = demoWorkspace,
): Opportunity | undefined {
  return workspace.opportunities.find((opportunity) => opportunity.id === id);
}

export function shiftById(id: string, workspace: DemoWorkspace = demoWorkspace): Shift | undefined {
  return workspace.shifts.find((shift) => shift.id === id);
}

export function currentVolunteer(workspace: DemoWorkspace = demoWorkspace): Volunteer {
  const found = workspace.volunteers.find(
    (volunteer) => volunteer.id === workspace.currentVolunteerId,
  );
  return found ?? workspace.volunteers[0];
}

export interface ShiftRow {
  shift: Shift;
  opportunity: Opportunity;
}

export function getOpportunities(
  session: SessionOverrides = {},
  workspace: DemoWorkspace = demoWorkspace,
): Opportunity[] {
  return [...workspace.opportunities, ...(session.createdOpportunities ?? [])];
}

export function getShiftRows(workspace: DemoWorkspace = demoWorkspace): ShiftRow[] {
  return workspace.shifts
    .map((shift) => {
      const opportunity = opportunityById(shift.opportunityId, workspace);
      return opportunity ? { shift, opportunity } : undefined;
    })
    .filter((row): row is ShiftRow => Boolean(row))
    .sort((a, b) => a.shift.startsAt.localeCompare(b.shift.startsAt));
}

export function getUpcomingShiftRows(
  workspace: DemoWorkspace = demoWorkspace,
  from: string = workspace.demoNow,
): ShiftRow[] {
  return getShiftRows(workspace).filter((row) => row.shift.startsAt > from);
}

export function getShiftRowsForOpportunity(
  opportunityId: string,
  workspace: DemoWorkspace = demoWorkspace,
): ShiftRow[] {
  return getShiftRows(workspace).filter((row) => row.shift.opportunityId === opportunityId);
}

export function fillPercent(shift: Shift): number {
  return shift.capacity === 0 ? 0 : Math.round((shift.confirmed / shift.capacity) * 100);
}

/* --------------------------------- roster --------------------------------- */

export type RosterStatus = "confirmed" | AttendanceStatus;

export interface RosterRow {
  volunteer: Volunteer;
  role: string;
  status: RosterStatus;
  checkedInAt: string | null;
}

export function getRoster(
  shiftId: string,
  session: SessionOverrides = {},
  workspace: DemoWorkspace = demoWorkspace,
): RosterRow[] {
  const shift = shiftById(shiftId, workspace);
  if (!shift) return [];

  const registrations = (session.registrations ?? []).filter(
    (row) => row.shiftId === shiftId && row.status === "registered",
  );
  const attendance = session.attendance?.[shiftId] ?? [];

  return registrations.flatMap((registration) => {
    const volunteer = volunteerById(registration.volunteerId, workspace);
    if (!volunteer) return [];
    const saved = attendance.find((row) => row.volunteerId === volunteer.id);
    const status: RosterStatus =
      saved?.status ?? (shift.status === "completed" ? "completed" : "expected");
    return [
      {
        volunteer,
        role: registration.role || "General support",
        status,
        checkedInAt: saved?.checkedInAt ?? null,
      },
    ];
  });
}

export function rosterCounts(rows: RosterRow[]) {
  return {
    confirmed: rows.length,
    checkedIn: rows.filter((row) => row.status === "checked_in").length,
    completed: rows.filter((row) => row.status === "completed").length,
    noShow: rows.filter((row) => row.status === "no_show").length,
    expected: rows.filter((row) => row.status === "expected").length,
    missing: rows.filter((row) => row.status === "expected").length,
  };
}

/* -------------------------------- waitlist -------------------------------- */

interface WaitlistRow {
  entry: WaitlistEntry;
  volunteer: Volunteer;
  status: WaitlistStatus;
}

export function getWaitlist(
  shiftId: string,
  session: SessionOverrides = {},
  workspace: DemoWorkspace = demoWorkspace,
): WaitlistRow[] {
  return (session.waitlist ?? [])
    .filter((entry) => entry.shiftId === shiftId)
    .sort((a, b) => a.position - b.position)
    .flatMap((entry) => {
      const volunteer = volunteerById(entry.volunteerId, workspace);
      return volunteer ? [{ entry, volunteer, status: entry.status }] : [];
    });
}

/* ------------------------------- attendance ------------------------------- */

export function getLiveEvent(session: SessionOverrides = {}) {
  const shift = shiftById(DEMO_EVENT_SHIFT_ID) ?? demoWorkspace.shifts[1];
  const opportunity = opportunityById(shift.opportunityId);
  return {
    shift,
    opportunity,
    roster: getRoster(shift.id, session),
    waitlist: getWaitlist(shift.id, session),
    checkInOpen:
      new Date(demoWorkspace.demoNow) >=
        new Date(parseISO(shift.startsAt).getTime() - 30 * 60_000) &&
      new Date(demoWorkspace.demoNow) <= parseISO(shift.endsAt),
  };
}

/* ---------------------------------- hours --------------------------------- */

export interface HourRow {
  id: string;
  entryId: string;
  volunteer: Volunteer;
  opportunity: Opportunity;
  date: string;
  requestedMinutes: number;
  approvedMinutes: number | null;
  status: "verified" | "pending" | "rejected";
  verificationId: string | null;
  reason: string;
  calculatedMinutes: number;
  shiftId: string | null;
}

export function getHourRows(
  session: SessionOverrides = {},
  workspace: DemoWorkspace = demoWorkspace,
): HourRow[] {
  // Maya has a curated four-entry history; the bulk ledger includes other
  // volunteers. Do not count her twice if the bulk generator also sampled her.
  const entries = [
    ...workspace.hourEntries.filter((entry) => entry.volunteerId !== workspace.currentVolunteerId),
    ...workspace.mayaEntries,
  ];
  return entries.map((entry) => {
    const volunteer = volunteerById(entry.volunteerId, workspace) ?? currentVolunteer(workspace);
    const opportunity =
      opportunityById(entry.opportunityId, workspace) ?? workspace.opportunities[0];
    const decision = session.hoursDecisions?.[entry.id];
    const shift = workspace.shifts.find(
      (row) => row.opportunityId === opportunity.id && row.startsAt.slice(0, 10) === entry.date,
    );
    return {
      id: entry.id,
      entryId: entry.id,
      volunteer,
      opportunity,
      date: entry.date,
      requestedMinutes: entry.minutes,
      approvedMinutes: decision
        ? decision.approvedMinutes
        : entry.status === "verified"
          ? entry.minutes
          : null,
      status: decision?.status ?? entry.status,
      verificationId: entry.verificationId,
      reason: decision?.reason ?? "",
      calculatedMinutes: shift ? shiftMinutes(shift) : Math.min(entry.minutes, 240),
      shiftId: shift?.id ?? null,
    };
  });
}

export function getHoursQueue(session: SessionOverrides = {}): HourRow[] {
  return getHourRows(session)
    .filter((row) => row.status === "pending")
    .sort((a, b) => b.date.localeCompare(a.date));
}

interface HoursSummary {
  totalMinutes: number;
  verifiedMinutes: number;
  pendingMinutes: number;
  thisMonthMinutes: number;
  events: number;
  certificates: number;
}

export function getHoursSummary(
  volunteerId: string,
  session: SessionOverrides = {},
  workspace: DemoWorkspace = demoWorkspace,
): HoursSummary {
  const rows = getHourRows(session, workspace).filter((row) => row.volunteer.id === volunteerId);
  const verified = rows.filter((row) => row.status === "verified");
  const pending = rows.filter((row) => row.status === "pending");
  const thisMonth = rows.filter((row) => row.date.startsWith(workspace.demoNow.slice(0, 7)));
  return {
    totalMinutes: rows.reduce((sum, row) => sum + (row.approvedMinutes ?? row.requestedMinutes), 0),
    verifiedMinutes: verified.reduce(
      (sum, row) => sum + (row.approvedMinutes ?? row.requestedMinutes),
      0,
    ),
    pendingMinutes: pending.reduce((sum, row) => sum + row.requestedMinutes, 0),
    thisMonthMinutes: thisMonth.reduce(
      (sum, row) => sum + (row.approvedMinutes ?? row.requestedMinutes),
      0,
    ),
    events: new Set(rows.map((row) => row.opportunity.id)).size,
    certificates: verified.length > 0 ? 1 : 0,
  };
}

export function getHoursTrend(
  session: SessionOverrides = {},
  workspace: DemoWorkspace = demoWorkspace,
): { label: string; hours: number }[] {
  const end = parseISO(workspace.demoNow);
  const rows = getHourRows(session, workspace).filter((row) => row.status !== "rejected");
  return Array.from({ length: 12 }, (_, index) => {
    const month = new Date(end.getFullYear(), end.getMonth() - (11 - index), 1);
    const key = format(month, "yyyy-MM");
    const minutes = rows
      .filter((row) => row.date.startsWith(key))
      .reduce((sum, row) => sum + (row.approvedMinutes ?? row.requestedMinutes), 0);
    return { label: format(month, "MMM"), hours: Math.round(minutes / 60) };
  });
}

export function getCauseHours(
  session: SessionOverrides = {},
  workspace: DemoWorkspace = demoWorkspace,
): { cause: Cause; label: string; hours: number; percent: number }[] {
  const totals = new Map<Cause, number>();
  for (const row of getHourRows(session, workspace)) {
    const hours = (row.approvedMinutes ?? row.requestedMinutes) / 60;
    totals.set(row.opportunity.cause, (totals.get(row.opportunity.cause) ?? 0) + hours);
  }
  const grand = [...totals.values()].reduce((sum, value) => sum + value, 0) || 1;
  return [...totals.entries()]
    .map(([cause, hours]) => ({
      cause,
      label: CAUSE_LABELS[cause],
      hours: Math.round(hours),
      percent: Math.round((hours / grand) * 100),
    }))
    .sort((a, b) => b.hours - a.hours);
}

export function getVerificationRecords(
  volunteerId: string,
  session: SessionOverrides = {},
): HourRow[] {
  return getHourRows(session).filter(
    (row) => row.volunteer.id === volunteerId && row.status === "verified" && row.verificationId,
  );
}

/* ------------------------------- applicants ------------------------------- */

export const PIPELINE_STAGES: { id: ApplicationStage; label: string; description: string }[] = [
  { id: "applied", label: "Applied", description: "New interest, not yet screened" },
  { id: "review", label: "Review", description: "Screening call or references" },
  { id: "onboarding", label: "Onboarding", description: "Orientation and background check" },
  { id: "active", label: "Active", description: "Cleared and ready to schedule" },
];

export function getApplications(session: SessionOverrides = {}): Applicant[] {
  return session.applications ?? [];
}

export function getApplicationsByStage(session: SessionOverrides = {}) {
  const applicants = getApplications(session);
  return PIPELINE_STAGES.map((stage) => ({
    ...stage,
    applicants: applicants.filter((applicant) => applicant.stage === stage.id),
  }));
}

/* ------------------------------- credentials ------------------------------ */

const CREDENTIAL_NAMES: Record<string, string> = {
  Spanish: "Spanish language proficiency",
  "Food handling": "Food safety handler",
  Tutoring: "Tutor certification",
  Driver: "Safe driver clearance",
  CPR: "CPR / AED",
  Gardening: "Garden tool safety",
  Leadership: "Volunteer team lead",
};

export interface CredentialRow {
  id: string;
  volunteer: Volunteer;
  name: string;
  identifier: string;
  issuedAt: string;
  expiresAt: string | null;
  status: CredentialStatus;
  verifiedBy: string | null;
  notes: string | null;
}

export function getCredentials(
  session: SessionOverrides = {},
  workspace: DemoWorkspace = demoWorkspace,
): CredentialRow[] {
  return (session.credentials ?? [])
    .flatMap((credential) => {
      const volunteer = volunteerById(credential.volunteerId, workspace);
      if (!volunteer) return [];
      return [
        {
          id: credential.id,
          volunteer,
          name: credential.name,
          identifier: credential.identifier,
          issuedAt: credential.issuedAt,
          expiresAt: credential.validThrough || null,
          status: credential.status,
          verifiedBy: credential.verifiedBy,
          notes: credential.notes,
        },
      ];
    })
    .sort((a, b) => (a.expiresAt ?? "").localeCompare(b.expiresAt ?? ""));
}

export function getCredentialSupply(): { skill: string; supply: number; demand: number }[] {
  const upcoming = getUpcomingShiftRows();
  return Object.keys(CREDENTIAL_NAMES).map((skill) => {
    const demand = upcoming.reduce((total, row) => {
      const slots = row.shift.roles
        .filter((role) => role.name.toLowerCase().includes(skill.toLowerCase().split(" ")[0]))
        .reduce((sum, role) => sum + role.required, 0);
      return total + slots;
    }, 0);
    const supply = demoWorkspace.volunteers.filter((volunteer) =>
      volunteer.skills.includes(skill),
    ).length;
    return { skill, supply, demand };
  });
}

/* ---------------------------------- audit --------------------------------- */

export function getAuditEvents(session: SessionOverrides = {}): AuditEvent[] {
  return (session.audit ?? []).slice().sort((a, b) => b.at.localeCompare(a.at));
}

/* ---------------------------------- reports ------------------------------- */

export interface ReportTemplate {
  id: string;
  title: string;
  description: string;
  category: "participation" | "coverage" | "impact" | "operations";
  range: string;
}

export const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    id: "report-participation",
    title: "Volunteer participation",
    description: "Hours, shifts, and attendance by volunteer for a chosen date range.",
    category: "participation",
    range: "This quarter",
  },
  {
    id: "report-coverage",
    title: "Coverage by program",
    description: "Required and filled role slots with risk flags for every upcoming shift.",
    category: "coverage",
    range: "Next 30 days",
  },
  {
    id: "report-impact",
    title: "Community impact",
    description: "Hours, meals, families served, and tutoring outcomes for the year.",
    category: "impact",
    range: "Jan 1 – Dec 31, 2026",
  },
  {
    id: "report-attendance",
    title: "Attendance and no-shows",
    description: "Check-in evidence, late arrivals, and no-show follow-up list.",
    category: "operations",
    range: "Last 90 days",
  },
  {
    id: "report-retention",
    title: "Retention and engagement",
    description: "Return rate by cohort and volunteers who have gone quiet.",
    category: "participation",
    range: "Rolling 12 months",
  },
  {
    id: "report-credentials",
    title: "Credentials and skills",
    description: "Expiring certifications and supply against scheduled demand.",
    category: "operations",
    range: "Next 60 days",
  },
];

export function getImpactOutcomes(
  session: SessionOverrides = {},
): Map<string, { name: string; unit: string; value: number; opportunityId: string }> {
  const outcomes = new Map<
    string,
    { name: string; unit: string; value: number; opportunityId: string }
  >();
  for (const metric of session.impactMetrics ?? []) {
    const current = outcomes.get(metric.metricKey);
    outcomes.set(metric.metricKey, {
      name: metric.name,
      unit: metric.unit,
      opportunityId: metric.opportunityId,
      value: (current?.value ?? 0) + metric.value,
    });
  }
  return outcomes;
}

export function getReportPreview(
  session: SessionOverrides = {},
  workspace: DemoWorkspace = demoWorkspace,
) {
  const causes = getCauseHours(session, workspace);
  const upcoming = getUpcomingShiftRows(workspace);
  const outcomes = getImpactOutcomes(session);
  return {
    organization: workspace.organization,
    generatedAt: workspace.demoNow,
    period: "January 1 – October 13, 2026",
    totals: {
      ...workspace.impact,
      mealsPacked: outcomes.get("meals_packed")?.value ?? 0,
      tutoringSessions: outcomes.get("tutoring_sessions")?.value ?? 0,
      treesPlanted: outcomes.get("trees_planted")?.value ?? 0,
      familiesServedThisMonth: outcomes.get("families_served")?.value ?? 0,
    },
    outcomes: [...outcomes.entries()],
    causes,
    coverage: {
      upcomingShifts: upcoming.length,
      roleSlots: upcoming.reduce(
        (sum, row) => sum + row.shift.roles.reduce((total, role) => total + role.required, 0),
        0,
      ),
      filledSlots: upcoming.reduce(
        (sum, row) => sum + row.shift.roles.reduce((total, role) => total + role.filled, 0),
        0,
      ),
    },
    topVolunteers: workspace.volunteers
      .slice()
      .sort((a, b) => b.hoursVerified - a.hoursVerified)
      .slice(0, 5),
  };
}

/* -------------------------------- retention ------------------------------- */

export function getRetentionRows(session: SessionOverrides = {}) {
  return session.retention ?? [];
}

export function getAtRiskVolunteers(): Volunteer[] {
  return demoWorkspace.volunteers
    .filter((volunteer) => volunteer.attendanceRate < 85 || volunteer.eventsCompleted < 5)
    .sort((a, b) => a.attendanceRate - b.attendanceRate)
    .slice(0, 6);
}

/* --------------------------------- matches -------------------------------- */

interface MatchRow {
  opportunity: Opportunity;
  score: number;
  reasons: string[];
}

export function getMatches(volunteer: Volunteer, limit = 3): MatchRow[] {
  const upcoming = getUpcomingShiftRows();
  return demoWorkspace.opportunities
    .map((opportunity) => {
      let score = 40;
      const reasons: string[] = [];
      const causeOverlap = volunteer.causes.includes(opportunity.cause);
      if (causeOverlap) {
        score += 22;
        reasons.push(
          t("Matches your interest in {cause}", {
            cause: CAUSE_LABELS[opportunity.cause],
          }),
        );
      }
      const skills = opportunity.requirements.filter((requirement) =>
        volunteer.skills.some((skill) => requirement.toLowerCase().includes(skill.toLowerCase())),
      );
      if (skills.length > 0) {
        score += Math.min(24, skills.length * 12);
        reasons.push(t("You have {skills}", { skills: skills.join(", ").toLowerCase() }));
      }
      if (upcoming.some((row) => row.shift.opportunityId === opportunity.id)) {
        score += 8;
        reasons.push(t("Upcoming shifts fit your schedule"));
      }
      if (volunteer.languages.includes("Spanish") && opportunity.cause === "food") {
        score += 4;
        reasons.push(t("Spanish speakers are needed here"));
      }
      return { opportunity, score: Math.min(98, score), reasons: reasons.slice(0, 3) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/* ------------------------------ volunteer data ---------------------------- */

function getVolunteerShifts(
  volunteerId: string,
  session: SessionOverrides = {},
  workspace: DemoWorkspace = demoWorkspace,
): ShiftRow[] {
  return getShiftRows(workspace).filter((row) =>
    getRoster(row.shift.id, session, workspace).some((entry) => entry.volunteer.id === volunteerId),
  );
}

export function getSavedOpportunities(
  session: SessionOverrides = {},
  workspace: DemoWorkspace = demoWorkspace,
): Opportunity[] {
  return (session.savedOpportunityIds ?? [])
    .map((id) => opportunityById(id, workspace))
    .filter((opportunity): opportunity is Opportunity => Boolean(opportunity));
}

export function getUpcomingForVolunteer(
  volunteerId: string,
  session: SessionOverrides = {},
  workspace: DemoWorkspace = demoWorkspace,
): ShiftRow[] {
  return getVolunteerShifts(volunteerId, session, workspace).filter(
    (row) => row.shift.startsAt > workspace.demoNow,
  );
}

export function getCoverageRows(): { row: ShiftRow; status: "critical" | "at-risk" | "healthy" }[] {
  return getUpcomingShiftRows().map((row) => {
    const openRoles = row.shift.roles.some((role) => role.filled < role.required);
    const percent = fillPercent(row.shift);
    const status = openRoles && percent < 70 ? "critical" : percent < 86 ? "at-risk" : "healthy";
    return { row, status };
  });
}

export function getRoleRisk(): {
  role: string;
  filled: number;
  required: number;
  percent: number;
}[] {
  const totals = new Map<string, { filled: number; required: number }>();
  for (const { shift } of getUpcomingShiftRows()) {
    for (const role of shift.roles) {
      const current = totals.get(role.name) ?? { filled: 0, required: 0 };
      totals.set(role.name, {
        filled: current.filled + role.filled,
        required: current.required + role.required,
      });
    }
  }
  return [...totals.entries()]
    .map(([role, value]) => ({
      role,
      ...value,
      percent: value.required === 0 ? 100 : Math.round((value.filled / value.required) * 100),
    }))
    .sort((a, b) => a.percent - b.percent);
}

export function getImpactStories() {
  return [
    {
      id: "story-food",
      title: "A full pantry shelf",
      body: "Saturday distribution now reaches 140 households, including 32 families who arrived without an appointment.",
      image: "/media/opp-food-distribution.jpg",
      metric: "24,320 meals packed this year",
      cause: "food" as Cause,
    },
    {
      id: "story-library",
      title: "Reading levels climbing",
      body: "Tutors logged 73 sessions this quarter; 81% of returning students improved one reading level.",
      image: "/media/opp-library-tutoring.jpg",
      metric: "73 tutoring sessions",
      cause: "education" as Cause,
    },
    {
      id: "story-garden",
      title: "A garden that feeds",
      body: "Two restored plots produced 900 pounds of produce, all donated within 48 hours of harvest.",
      image: "/media/opp-community-garden.jpg",
      metric: "900 lb donated",
      cause: "environment" as Cause,
    },
  ];
}

export function getRecentActivityFor(volunteerId: string) {
  return demoWorkspace.recentActivity.filter((item) => item.volunteerId === volunteerId);
}

export function getOrganizationImages(): string[] {
  return [
    "/media/hero-community.jpg",
    "/media/community-strip-1.jpg",
    "/media/community-strip-2.jpg",
    "/media/community-strip-3.jpg",
    "/media/opp-community-event.jpg",
  ];
}

export function getVolunteerImpact(volunteerId: string, session: SessionOverrides = {}) {
  const summary = getHoursSummary(volunteerId, session);
  const volunteer = volunteerById(volunteerId) ?? currentVolunteer();
  const causes = new Map<Cause, number>();
  getHourRows(session)
    .filter((row) => row.volunteer.id === volunteerId)
    .forEach((row) => {
      causes.set(
        row.opportunity.cause,
        (causes.get(row.opportunity.cause) ?? 0) + (row.approvedMinutes ?? row.requestedMinutes),
      );
    });
  const total = [...causes.values()].reduce((sum, value) => sum + value, 0) || 1;
  return {
    volunteer,
    summary,
    causes: [...causes.entries()].map(([cause, minutes]) => ({
      cause,
      label: CAUSE_LABELS[cause],
      minutes,
      percent: Math.round((minutes / total) * 100),
    })),
  };
}

export function getVolunteerInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
