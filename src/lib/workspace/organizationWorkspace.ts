import type {
  Account,
  AvailabilitySlot,
  Cause,
  Coordinator,
  DayKey,
  DemoWorkspace,
  Organization,
  PeriodKey,
  RosterVolunteer,
  SeriesShift,
  Shift,
  ShiftSeriesRecord,
  Volunteer,
} from "../../types/domain";
import { initialsOf } from "../initials";
import type { OrganizationProfile } from "../organizations/store";
import { demoWorkspace } from "./dataset";

/** The organization details a workspace needs, without the membership layer. */
export interface OrganizationScope {
  id: string;
  name: string;
  description?: string;
  city?: string;
  state?: string;
  address?: string;
  website?: string;
  contactEmails?: string[];
  /** The picture the organization chose, so its own screens show its own work. */
  image?: string;
  imageAlt?: string;
  /** The coordinator behind the scope, so read models can name them. */
  coordinatorName?: string;
  coordinatorEmail?: string;
}

const DEMO_ORGANIZATION_ID = demoWorkspace.organization.id;

/** The bundled sample organization, shown when nobody is signed in. */
export const DEMO_ORGANIZATION = {
  id: demoWorkspace.organization.id,
  name: demoWorkspace.organization.name,
};

function firstNameFor(name: string): string {
  return name.split(" ")[0] || name;
}

function emptyImpact(): DemoWorkspace["impact"] {
  return {
    hoursYtd: 0,
    hoursThisMonth: 0,
    uniqueVolunteersYtd: 0,
    activeVolunteers: 0,
    mealsPacked: 0,
    tutoringSessions: 0,
    treesPlanted: 0,
    familiesServedThisMonth: 0,
    shiftsCompleted: 0,
    attendanceRate: 0,
  };
}

/**
 * The demo workspace is authored around one volunteer. An account created on
 * this device takes that place, so a new volunteer reads their own name and an
 * empty service history rather than someone else's.
 */
function workspaceForAccount(account: Account | null): DemoWorkspace {
  if (!account || account.role !== "volunteer" || !account.volunteerId) return demoWorkspace;
  const volunteerId = account.volunteerId;
  if (demoWorkspace.volunteers.some((volunteer) => volunteer.id === volunteerId)) {
    return volunteerId === demoWorkspace.currentVolunteerId
      ? demoWorkspace
      : { ...demoWorkspace, currentVolunteerId: volunteerId };
  }
  const volunteer: Volunteer = {
    id: volunteerId,
    name: account.name,
    firstName: firstNameFor(account.name),
    initials: initialsOf(account.name),
    role: "Volunteer",
    tone: "violet",
    email: account.email,
    phone: "",
    joinedAt: new Date().toISOString(),
    status: "onboarding",
    skills: [],
    languages: [],
    causes: [],
    hoursVerified: 0,
    attendanceRate: 0,
    eventsCompleted: 0,
    interests: "",
    availability: [],
  };
  return {
    ...demoWorkspace,
    currentVolunteerId: volunteerId,
    volunteers: [volunteer, ...demoWorkspace.volunteers],
  };
}

/**
 * An organization created on this device starts with nothing scheduled. The
 * seed data belongs to the bundled demo organization, so any other workspace —
 * and the pre-organization state right after signup — is built from the profile
 * the coordinator entered plus the account that is signed in.
 */
function blankWorkspace(org: OrganizationScope | null, account: Account | null): DemoWorkspace {
  const now = new Date().toISOString();
  const organization: Organization = {
    id: org?.id ?? "org-local",
    name: org?.name ?? "Your organization",
    initials: initialsOf(org?.name ?? "Your organization"),
    mission: org?.description ?? "",
    city: org?.city ?? "",
    state: org?.state ?? "",
    address: org?.address ?? "",
    website: org?.website ?? "",
    email: org?.contactEmails?.[0] ?? account?.email ?? "",
    timezone: "America/New_York",
    image: org?.image,
    imageAlt: org?.imageAlt,
  };
  const coordinator: Coordinator = {
    id: account?.role === "coordinator" ? account.id : "coordinator-local",
    name: account?.role === "coordinator" ? account.name : "",
    firstName: account?.role === "coordinator" ? firstNameFor(account.name) : "",
    initials: account?.role === "coordinator" ? initialsOf(account.name) : "",
    role: "Coordinator",
    tone: "amber",
    email: account?.role === "coordinator" ? account.email : organization.email,
  };
  const volunteer: Volunteer | null =
    account?.role === "volunteer" && account.volunteerId
      ? {
          id: account.volunteerId,
          name: account.name,
          firstName: firstNameFor(account.name),
          initials: initialsOf(account.name),
          role: "Volunteer",
          tone: "violet",
          email: account.email,
          phone: "",
          joinedAt: now,
          status: "onboarding",
          skills: [],
          languages: [],
          causes: [],
          hoursVerified: 0,
          attendanceRate: 0,
          eventsCompleted: 0,
          interests: "",
          availability: [],
        }
      : null;
  return {
    schemaVersion: demoWorkspace.schemaVersion,
    demoNow: now,
    organization,
    coordinator,
    currentVolunteerId: volunteer?.id ?? "",
    volunteers: volunteer ? [volunteer] : [],
    opportunities: [],
    shifts: [],
    hourEntries: [],
    mayaEntries: [],
    credentials: [],
    registrations: [],
    impactRecords: [],
    impact: emptyImpact(),
    recentActivity: [],
    notifications: [],
    savedViews: [],
  };
}

const DAY_KEYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const PERIOD_KEYS: PeriodKey[] = ["morning", "afternoon", "evening"];
const CAUSE_KEYS: Cause[] = ["food", "education", "environment", "health", "community", "animals"];

/** Windows arrive in the `mon:morning` form the export and the importer share. */
function availabilityFrom(windows: string[]): AvailabilitySlot[] {
  return windows.flatMap((window) => {
    const [day, period] = window.split(":");
    return DAY_KEYS.includes(day as DayKey) && PERIOD_KEYS.includes(period as PeriodKey)
      ? [{ day: day as DayKey, period: period as PeriodKey }]
      : [];
  });
}

/**
 * A database roster record as the volunteer shape the screens render. The seed
 * authors its own display fields, so anything this does not carry reads as
 * "nothing recorded yet" rather than as a borrowed number.
 */
function volunteerFromRoster(record: RosterVolunteer): Volunteer {
  return {
    id: record.id,
    name: record.name,
    firstName: record.name.split(/\s+/)[0] || record.name,
    initials: initialsOf(record.name),
    role: "Volunteer",
    tone: "violet",
    email: record.email,
    phone: record.phone,
    joinedAt: record.joinedAt,
    status: record.status as Volunteer["status"],
    skills: record.skills,
    languages: [],
    causes: record.causes.filter((cause): cause is Cause => CAUSE_KEYS.includes(cause as Cause)),
    hoursVerified: 0,
    attendanceRate: 0,
    eventsCompleted: 0,
    interests: "",
    availability: availabilityFrom(record.availability),
  };
}

/**
 * Adds roster records the seed does not describe — the volunteers a coordinator
 * imported — to the workspace a screen reads. A person the seed already knows
 * keeps the seed's record, which carries their service history.
 */
export function withRoster(workspace: DemoWorkspace, roster: RosterVolunteer[]): DemoWorkspace {
  if (roster.length === 0) return workspace;
  const known = new Set(workspace.volunteers.map((volunteer) => volunteer.id));
  const added = roster
    .filter((record) => !known.has(record.id))
    .map((record) => volunteerFromRoster(record));
  if (added.length === 0) return workspace;
  return { ...workspace, volunteers: [...workspace.volunteers, ...added] };
}

/**
 * Adds the shifts a coordinator scheduled from a series. The browser fallback
 * has no schedule table, so the instances a series produced are merged into the
 * workspace the screens read; on the desktop they are ordinary shift rows.
 */
export function withCreatedShifts(
  workspace: DemoWorkspace,
  series: ShiftSeriesRecord[],
  shifts: SeriesShift[],
): DemoWorkspace {
  if (shifts.length === 0) return workspace;
  const known = new Set(workspace.shifts.map((shift) => shift.id));
  const added: Shift[] = shifts
    .filter((shift) => !known.has(shift.id))
    .map((shift) => {
      const owner = series.find((row) => shift.id.includes(row.id));
      const roles = (owner?.roles ?? []).map((role) => ({
        name: role.name,
        required: role.required,
        filled: 0,
      }));
      return {
        id: shift.id,
        opportunityId: owner?.opportunityId ?? "",
        startsAt: shift.startsAt,
        endsAt: shift.endsAt,
        capacity: roles.reduce((total, role) => total + role.required, 0),
        confirmed: 0,
        waitlisted: 0,
        status: "scheduled" as const,
        roles,
      };
    });
  if (added.length === 0) return workspace;
  return { ...workspace, shifts: [...workspace.shifts, ...added] };
}

/** True when the workspace shown to this person is the bundled demo data. */
export function isDemoOrganization(organizationId: string | null | undefined): boolean {
  return organizationId === DEMO_ORGANIZATION_ID;
}

/**
 * The workspace a screen should read: the seeded demo for the bundled
 * organization, and an empty workspace for anything else.
 */
export function workspaceForOrganization(
  organization: OrganizationProfile | null,
  account: Account | null,
): DemoWorkspace {
  if (!organization || !isDemoOrganization(organization.id)) {
    return blankWorkspace(organization, account);
  }
  return workspaceForAccount(account);
}

/** An empty workspace for the data store, which only needs the name and profile. */
export function blankWorkspaceForOrganization(
  organization: OrganizationScope | null,
  account: Account | null = null,
): DemoWorkspace {
  return blankWorkspace(organization, account);
}
