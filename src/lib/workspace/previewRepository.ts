/**
 * Browser fallback for the workflow store.
 *
 * The desktop shell reads and writes SQLite through `civicflow-core`. The Vite
 * preview has no native host, so this module mirrors the same snapshot contract
 * over the shared seed and localStorage. It is selected in exactly one place:
 * `getWorkspaceRepository()` when `isTauri()` is false.
 */

import rawSessionSeed from "../../../shared/session-seed.json";
import rawWorkspace from "../../../shared/demo-workspace.json";
import type {
  Account,
  AccountRole,
  Applicant,
  AttendanceEntry,
  AuditEvent,
  BackupRestoreResult,
  BackupSnapshot,
  CheckinCode,
  Credential,
  AuthSession,
  DemoWorkspace,
  HoursDecision,
  ImpactMetric,
  NewOpportunityInput,
  Opportunity,
  PlannedAssignment,
  ReportDocument,
  ReportRequest,
  ReportSummaryItem,
  RetentionCohort,
  RosterApplyAssignment,
  RosterPlan,
  SavedViewRecord,
  ServiceVerification,
  SessionSnapshot,
  WaitlistEntry,
  WorkspaceSettings,
} from "../../types/domain";
import { buildMissionControl } from "./compute";
import { demoWorkspace } from "./dataset";
import type { WorkspaceRepository } from "./repository";

const STORAGE_KEY = "civicflow.workflow.v1";
const READ_KEY = "civicflow.notifications.read";
const BACKUP_KEY = "civicflow.backups.v1";
const BACKUP_RETENTION = 20;
const PREVIEW_ACCOUNT_KEY = "civicflow.auth.passwords";

function previewPasswords(): Record<string, string> {
  try {
    const raw = localStorage.getItem(PREVIEW_ACCOUNT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") return parsed as Record<string, string>;
  } catch {
    // The preview keeps the demo password when storage is unavailable.
  }
  return {};
}

function previewAccountFromToken(token: string): Account | null {
  const match = /^preview:([^:]+):([^:]+)$/.exec(token);
  if (!match) return null;
  const account = previewAccounts.find((row) => row.id === match[1]);
  if (!account) return null;
  const expected = previewPasswords()[account.id] ?? "demo";
  return expected === match[2] ? account : null;
}

function previewToken(account: Account): string {
  const version = previewPasswords()[account.id] ?? "demo";
  return `preview:${account.id}:${version}`;
}

interface SessionSeed {
  savedOpportunityIds: string[];
  waitlist: WaitlistEntry[];
  applications: Applicant[];
  audit: AuditEvent[];
  settings: WorkspaceSettings;
}

const seed = rawSessionSeed as unknown as SessionSeed;
const workspace = rawWorkspace as unknown as DemoWorkspace;
const current = workspace.volunteers.find(
  (volunteer) => volunteer.id === workspace.currentVolunteerId,
);

const previewAccounts: Account[] = [
  {
    id: "user-praket",
    name: "Praket Gauri",
    email: "praket@feedmorewny.org",
    role: "coordinator",
    volunteerId: null,
  },
  {
    id: "user-maya",
    name: current?.name ?? "Maya Chen",
    email: current?.email ?? "maya.chen@gmail.com",
    role: "volunteer",
    volunteerId: current?.id ?? "vol-maya",
  },
];

function defaultCredentials(): Credential[] {
  return workspace.credentials.map((credential) => {
    const today = workspace.demoNow.slice(0, 10);
    const status =
      credential.validThrough < today
        ? "expired"
        : credential.validThrough <=
            new Date(new Date(workspace.demoNow).getTime() + 45 * 86_400_000)
              .toISOString()
              .slice(0, 10)
          ? "expiring"
          : "current";
    return { ...credential, status };
  });
}

function defaultVerifications(): ServiceVerification[] {
  const groups = new Map<string, ServiceVerification>();
  for (const entry of [...workspace.hourEntries, ...workspace.mayaEntries]) {
    if (entry.status !== "verified" || !entry.verificationId) continue;
    const existing = groups.get(entry.verificationId);
    if (existing) {
      existing.totalMinutes += entry.minutes;
      existing.dateStart = existing.dateStart < entry.date ? existing.dateStart : entry.date;
      existing.dateEnd = existing.dateEnd > entry.date ? existing.dateEnd : entry.date;
    } else {
      groups.set(entry.verificationId, {
        id: `verification-${entry.verificationId}`,
        code: entry.verificationId,
        volunteerId: entry.volunteerId,
        organizationId: workspace.organization.id,
        dateStart: entry.date,
        dateEnd: entry.date,
        totalMinutes: entry.minutes,
        issuedAt: workspace.demoNow,
        issuedBy: workspace.coordinator.name,
      });
    }
  }
  return [...groups.values()];
}

function defaultImpactMetrics(): ImpactMetric[] {
  return workspace.impactRecords.map((record) => ({ ...record }));
}

function defaultRetention(): RetentionCohort[] {
  const dates = [...workspace.hourEntries, ...workspace.mayaEntries].map((entry) => entry.date);
  const byMonth = new Map<string, number>();
  for (const date of dates) byMonth.set(date.slice(0, 7), (byMonth.get(date.slice(0, 7)) ?? 0) + 1);
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([month, eligible]) => ({
      label: new Date(`${month}-01T12:00:00`).toLocaleString("en-US", { month: "short" }),
      eligible,
      returned: Math.round(eligible * 0.62),
      rate: 62,
    }));
}

function defaultAttendance(): SessionSnapshot["attendance"] {
  const arrivedAt = new Date(new Date(workspace.demoNow).getTime() - 18 * 60_000).toISOString();
  const rows = workspace.registrations
    .filter(
      (row) => row.shiftId === "sh-tue-pantry" && row.volunteerId !== workspace.currentVolunteerId,
    )
    .slice(0, 2)
    .map((row) => ({
      volunteerId: row.volunteerId,
      shiftId: row.shiftId,
      role: row.role,
      status: "checked_in" as const,
      checkedInAt: arrivedAt,
      checkedOutAt: null,
    }));
  return rows.length > 0 ? { "sh-tue-pantry": rows } : {};
}

function defaultSavedViews(): SavedViewRecord[] {
  return workspace.savedViews.map((view) => ({
    id: view.id,
    scope: "records",
    name: view.name,
    filtersJson: JSON.stringify(view.filters),
    createdAt: workspace.demoNow,
  }));
}

export function createDefaultSnapshot(): SessionSnapshot {
  return {
    savedOpportunityIds: [...seed.savedOpportunityIds],
    attendance: defaultAttendance(),
    hoursDecisions: {},
    applications: seed.applications.map((applicant) => ({ ...applicant })),
    waitlist: seed.waitlist.map((entry) => ({ ...entry })),
    settings: { ...seed.settings },
    createdOpportunities: [],
    registrations: workspace.registrations.map((row) => ({ ...row })),
    audit: seed.audit.map((event) => ({ ...event })),
    volunteerProfile: {
      skills: current?.skills ?? [],
      availability: current?.availability ?? [],
      completedOnboarding: true,
    },
    credentials: defaultCredentials(),
    verifications: defaultVerifications(),
    impactMetrics: defaultImpactMetrics(),
    savedViews: defaultSavedViews(),
    retention: defaultRetention(),
    checkinCode: null,
  };
}

function readIds(): string[] {
  try {
    const raw = localStorage.getItem(READ_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) && parsed.every((id) => typeof id === "string")
      ? (parsed as string[])
      : [];
  } catch {
    return [];
  }
}

function writeIds(ids: string[]): void {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    // Storage can be unavailable in hardened webviews; the fallback still works.
  }
}

function loadSnapshot(): SessionSnapshot {
  const fallback = createDefaultSnapshot();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<SessionSnapshot>;
    return {
      ...fallback,
      ...parsed,
      applications: Array.isArray(parsed.applications)
        ? parsed.applications
        : fallback.applications,
      waitlist: Array.isArray(parsed.waitlist) ? parsed.waitlist : fallback.waitlist,
      audit: Array.isArray(parsed.audit) ? parsed.audit : fallback.audit,
      settings: { ...fallback.settings, ...(parsed.settings ?? {}) },
      volunteerProfile: { ...fallback.volunteerProfile, ...(parsed.volunteerProfile ?? {}) },
    };
  } catch {
    return fallback;
  }
}

let state = loadSnapshot();

interface StoredBackup {
  meta: BackupSnapshot;
  snapshot: SessionSnapshot;
}

function previewChecksum(value: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  for (let index = 0; index < value.length; index += 1) {
    h1 = Math.imul(h1 ^ value.charCodeAt(index), 0x01000193) >>> 0;
    h2 = Math.imul(h2 + value.charCodeAt(index), 0x85ebca6b) >>> 0;
  }
  const block = (seed: number) => seed.toString(16).padStart(8, "0");
  return (block(h1) + block(h2) + block(h1 ^ h2) + block(h1 + h2)).repeat(2);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validSnapshot(value: unknown): value is SessionSnapshot {
  if (!isRecord(value)) return false;
  return (
    Array.isArray(value.savedOpportunityIds) &&
    isRecord(value.attendance) &&
    isRecord(value.hoursDecisions) &&
    Array.isArray(value.applications) &&
    Array.isArray(value.waitlist) &&
    isRecord(value.settings) &&
    Array.isArray(value.createdOpportunities) &&
    Array.isArray(value.registrations) &&
    Array.isArray(value.audit) &&
    isRecord(value.volunteerProfile) &&
    Array.isArray(value.credentials) &&
    Array.isArray(value.verifications) &&
    Array.isArray(value.impactMetrics) &&
    Array.isArray(value.savedViews) &&
    Array.isArray(value.retention)
  );
}

function backupCounts(snapshot: SessionSnapshot) {
  return {
    volunteers: workspace.volunteers.length,
    programs: workspace.opportunities.length,
    shifts: workspace.shifts.length,
    hours: workspace.hourEntries.length + workspace.mayaEntries.length,
    notifications: workspace.notifications.length,
    audit: snapshot.audit.length,
  };
}

function backupRows(snapshot: SessionSnapshot): number {
  const counts = backupCounts(snapshot);
  return (
    counts.volunteers +
    counts.programs +
    counts.shifts +
    counts.hours +
    counts.notifications +
    counts.audit +
    snapshot.savedOpportunityIds.length +
    snapshot.applications.length +
    snapshot.waitlist.length +
    snapshot.registrations.length +
    Object.values(snapshot.attendance).flat().length +
    Object.keys(snapshot.hoursDecisions).length
  );
}

function makeBackup(
  snapshot: SessionSnapshot,
  kind: BackupSnapshot["kind"],
  note: string,
): StoredBackup {
  const stored: StoredBackup = {
    meta: {
      id: `backup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      kind,
      bytes: 0,
      rows: backupRows(snapshot),
      note,
      counts: backupCounts(snapshot),
      sha256: "",
      schemaVersion: 3,
      integrity: "ok",
    },
    snapshot: clone(snapshot),
  };
  const payload = JSON.stringify(stored.snapshot);
  stored.meta.bytes = new TextEncoder().encode(payload).length;
  stored.meta.sha256 = previewChecksum(payload);
  return stored;
}

function readBackups(): StoredBackup[] {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is StoredBackup => {
        if (!isRecord(entry) || !isRecord(entry.meta) || !isRecord(entry.snapshot)) return false;
        const meta = entry.meta;
        return (
          typeof meta.id === "string" &&
          typeof meta.createdAt === "string" &&
          (meta.kind === "manual" || meta.kind === "automatic") &&
          typeof meta.bytes === "number" &&
          typeof meta.rows === "number" &&
          typeof meta.note === "string" &&
          isRecord(meta.counts)
        );
      })
      .map((entry) => ({
        ...entry,
        meta: {
          ...entry.meta,
          sha256: entry.meta.sha256 || previewChecksum(JSON.stringify(entry.snapshot)),
          schemaVersion: entry.meta.schemaVersion || 3,
          integrity: entry.meta.integrity || "ok",
        },
      }));
  } catch {
    return [];
  }
}

function writeBackups(backups: StoredBackup[]): void {
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify(backups.slice(0, BACKUP_RETENTION)));
  } catch {
    // The current session can still create and restore in memory.
  }
}

function ensureBackups(): StoredBackup[] {
  const stored = readBackups();
  if (stored.length > 0) {
    if (stored.length > BACKUP_RETENTION) {
      const retained = stored.slice(0, BACKUP_RETENTION);
      writeBackups(retained);
      return retained;
    }
    return stored;
  }
  const baseline = makeBackup(state, "automatic", "Initial workspace snapshot");
  writeBackups([baseline]);
  return [baseline];
}

function listBackupMeta(): BackupSnapshot[] {
  return ensureBackups().map((entry) => entry.meta);
}

function persist(next: SessionSnapshot): SessionSnapshot {
  state = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // The in-memory store is enough when storage is refused.
  }
  return next;
}

function audit(
  action: string,
  entityType: AuditEvent["entityType"],
  entityId: string,
  summary: string,
  detail?: string,
): AuditEvent {
  return {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: workspace.demoNow,
    actor: workspace.coordinator.name,
    action,
    entityType,
    entityId,
    summary,
    detail,
  };
}

function previewCheckinCode(shiftId: string): string {
  const window = Math.floor(new Date(workspace.demoNow).getTime() / (15 * 60_000));
  const seed = `${shiftId}:${window}`;
  let hash = 0xcbf29ce4;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return String(hash % 1_000_000).padStart(6, "0");
}

function volunteerName(id: string): string {
  return workspace.volunteers.find((volunteer) => volunteer.id === id)?.name ?? "Volunteer";
}

function volunteerRole(id: string): string {
  return (
    workspace.volunteers.find((volunteer) => volunteer.id === id)?.skills[0] ?? "General support"
  );
}

function withAttendance(
  snapshot: SessionSnapshot,
  shiftId: string,
  entry: AttendanceEntry,
): SessionSnapshot {
  const existing = snapshot.attendance[shiftId] ?? [];
  return {
    ...snapshot,
    attendance: {
      ...snapshot.attendance,
      [shiftId]: [...existing.filter((row) => row.volunteerId !== entry.volunteerId), entry],
    },
  };
}

const REPORT_TITLES: Record<string, string> = {
  participation: "Volunteer participation",
  coverage: "Coverage by program",
  attendance: "Attendance and no-shows",
  retention: "Retention and engagement",
  skills: "Credentials and skills",
  credentials: "Credentials and skills",
  impact: "Community impact",
  custom: "Custom report",
};

const REPORT_FIELD_LABELS: Record<string, string> = {
  volunteer: "Volunteer",
  program: "Program",
  date: "Service date",
  hours: "Approved minutes",
  status: "Status",
  verification: "Verification",
  cause: "Cause",
  role: "Role",
};

function buildPreviewReport(request: ReportRequest): ReportDocument {
  const end = request.dateEnd ?? workspace.demoNow.slice(0, 10);
  const start = request.dateStart ?? `${end.slice(0, 4)}-01-01`;
  const template = REPORT_TITLES[request.template] ? request.template : "custom";
  const cause = request.cause ?? "";
  const inRange = (date: string) => date >= start && date <= end;
  let headers: string[];
  let rows: string[][] = [];
  let summary: ReportSummaryItem[];

  if (template === "coverage") {
    headers = ["Date", "Program", "Role", "Required", "Filled", "Gap", "Shift status"];
    let required = 0;
    let filled = 0;
    for (const shift of workspace.shifts.filter((row) => row.startsAt >= workspace.demoNow)) {
      const opportunity = workspace.opportunities.find((row) => row.id === shift.opportunityId);
      if (!opportunity || (cause && opportunity.cause !== cause)) continue;
      for (const role of shift.roles) {
        required += role.required;
        filled += role.filled;
        rows.push([
          shift.startsAt.slice(0, 10),
          opportunity.title,
          role.name,
          String(role.required),
          String(role.filled),
          String(Math.max(0, role.required - role.filled)),
          shift.status,
        ]);
      }
    }
    summary = [
      { label: "Required role slots", value: String(required) },
      { label: "Filled slots", value: String(filled) },
      {
        label: "Role coverage",
        value: `${required === 0 ? 100 : Math.round((filled / required) * 100)}%`,
      },
    ];
  } else if (template === "attendance") {
    headers = ["Date", "Program", "Volunteer", "Role", "Status", "Checked in", "Checked out"];
    let arrivals = 0;
    let completed = 0;
    let noShow = 0;
    for (const [shiftId, entries] of Object.entries(state.attendance)) {
      const shift = workspace.shifts.find((row) => row.id === shiftId);
      const opportunity = workspace.opportunities.find((row) => row.id === shift?.opportunityId);
      if (!shift || !opportunity || !inRange(shift.startsAt.slice(0, 10))) continue;
      if (cause && opportunity.cause !== cause) continue;
      for (const entry of entries) {
        const volunteer = workspace.volunteers.find((row) => row.id === entry.volunteerId);
        if (entry.status === "checked_in") arrivals += 1;
        if (entry.status === "completed") completed += 1;
        if (entry.status === "no_show") noShow += 1;
        rows.push([
          shift.startsAt.slice(0, 10),
          opportunity.title,
          volunteer?.name ?? "Volunteer",
          entry.role,
          entry.status,
          entry.checkedInAt ?? "",
          entry.checkedOutAt ?? "",
        ]);
      }
    }
    summary = [
      { label: "Arrivals", value: String(arrivals) },
      { label: "Completed", value: String(completed) },
      { label: "No-shows", value: String(noShow) },
    ];
  } else if (template === "retention") {
    headers = ["Cohort", "Eligible", "Returned in 30 days", "Rate"];
    rows = state.retention.map((row) => [
      row.label,
      String(row.eligible),
      String(row.returned),
      `${row.rate}%`,
    ]);
    const eligible = state.retention.reduce((sum, row) => sum + row.eligible, 0);
    const returned = state.retention.reduce((sum, row) => sum + row.returned, 0);
    summary = [
      { label: "Cohort eligible", value: String(eligible) },
      { label: "Returned", value: String(returned) },
      {
        label: "Average 30-day return",
        value: `${eligible === 0 ? 0 : Math.round((returned / eligible) * 100)}%`,
      },
    ];
  } else if (template === "skills" || template === "credentials") {
    headers = ["Volunteer", "Skill", "Credential", "Valid through", "Status"];
    let expiring = 0;
    for (const volunteer of workspace.volunteers) {
      for (const skill of volunteer.skills) {
        const credential = state.credentials.find((row) => row.volunteerId === volunteer.id);
        if (credential && credential.status !== "current") expiring += 1;
        rows.push([
          volunteer.name,
          skill,
          credential?.name ?? "—",
          credential?.validThrough ?? "—",
          credential?.status ?? "no credential",
        ]);
      }
    }
    summary = [
      { label: "Skill rows", value: String(rows.length) },
      { label: "Expiring or expired", value: String(expiring) },
    ];
  } else if (template === "impact") {
    headers = ["Program", "Metric", "Unit", "Value", "Recorded"];
    rows = state.impactMetrics.map((metric) => [
      workspace.opportunities.find((row) => row.id === metric.opportunityId)?.title ?? "Program",
      metric.name,
      metric.unit,
      String(metric.value),
      metric.recordedAt.slice(0, 10),
    ]);
    summary = [{ label: "Outcome records", value: String(rows.length) }];
  } else {
    const fields =
      request.fields.length > 0
        ? request.fields.filter((field) => field in REPORT_FIELD_LABELS)
        : ["volunteer", "program", "date", "hours", "status", "verification"];
    headers = fields.map((field) => REPORT_FIELD_LABELS[field]);
    let total = 0;
    let verified = 0;
    const volunteers = new Set<string>();
    for (const entry of [...workspace.hourEntries, ...workspace.mayaEntries]) {
      const opportunity = workspace.opportunities.find((row) => row.id === entry.opportunityId);
      const volunteer = workspace.volunteers.find((row) => row.id === entry.volunteerId);
      if (!opportunity || !volunteer || !inRange(entry.date)) continue;
      if (cause && opportunity.cause !== cause) continue;
      const decision = state.hoursDecisions[entry.id];
      const status = decision?.status ?? entry.status;
      const minutes = decision?.approvedMinutes ?? entry.minutes;
      total += minutes;
      if (status === "verified") {
        verified += minutes;
        volunteers.add(volunteer.id);
      }
      const registration = state.registrations.find(
        (row) => row.volunteerId === volunteer.id && row.status === "registered",
      );
      const values: Record<string, string> = {
        volunteer: volunteer.name,
        program: opportunity.title,
        date: entry.date,
        hours: String(minutes),
        status,
        verification: entry.verificationId ?? "",
        cause: opportunity.cause,
        role: registration?.role ?? "",
      };
      rows.push(fields.map((field) => values[field] ?? ""));
    }
    summary = [
      { label: "Records", value: String(rows.length) },
      { label: "Approved or recorded", value: `${Math.floor(total / 60)}h ${total % 60}m` },
      { label: "Verified", value: `${Math.floor(verified / 60)}h ${verified % 60}m` },
      { label: "Volunteers", value: String(volunteers.size) },
    ];
  }

  return {
    template,
    title: REPORT_TITLES[template],
    organization: state.settings.organizationName || workspace.organization.name,
    period: `${start} – ${end}`,
    generatedAt: workspace.demoNow,
    headers,
    rows,
    summary,
  };
}

export const previewRepository: WorkspaceRepository = {
  source: "preview",
  async signIn(email, password, _remember): Promise<AuthSession> {
    const clean = email.trim().toLowerCase();
    const account = previewAccounts.find((row) => row.email.toLowerCase() === clean);
    const stored = account ? previewPasswords()[account.id] : undefined;
    const expected = stored ?? "civicflow-demo";
    if (!account || password !== expected) {
      throw new Error("That email and password do not match an account on this device.");
    }
    return {
      token: previewToken(account),
      user: account,
      expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    };
  },
  async signOut(token) {
    void token;
  },
  async currentUser(token) {
    return previewAccountFromToken(token);
  },
  async listAccounts(token) {
    const account = previewAccountFromToken(token);
    if (account?.role !== "coordinator") throw new Error("Only a coordinator can list accounts.");
    return previewAccounts.map((row) => ({ ...row }));
  },
  async resetPassword(token, userId, newPassword) {
    const account = previewAccountFromToken(token);
    if (account?.role !== "coordinator") throw new Error("Only a coordinator can reset passwords.");
    if (newPassword.length < 8) throw new Error("Use at least 8 characters for the password.");
    const target = previewAccounts.find((row) => row.id === userId);
    if (!target) throw new Error("Account not found.");
    try {
      localStorage.setItem(
        PREVIEW_ACCOUNT_KEY,
        JSON.stringify({ ...previewPasswords(), [userId]: newPassword }),
      );
    } catch {
      throw new Error("The browser preview could not save the new password.");
    }
  },
  async getSnapshot() {
    return state;
  },
  async setSaved(opportunityId, saved) {
    const opportunity = workspace.opportunities.find((row) => row.id === opportunityId);
    if (!opportunity) throw new Error("Opportunity not found");
    const currentlySaved = state.savedOpportunityIds.includes(opportunityId);
    if (currentlySaved === saved) return state;
    return persist({
      ...state,
      savedOpportunityIds: saved
        ? [...state.savedOpportunityIds, opportunityId]
        : state.savedOpportunityIds.filter((id) => id !== opportunityId),
      audit: [
        audit(
          saved ? "opportunity.save" : "opportunity.unsave",
          "opportunity",
          opportunityId,
          saved
            ? `Saved ${opportunity.title}`
            : `Removed ${opportunity.title} from saved opportunities`,
        ),
        ...state.audit,
      ],
    });
  },
  async setApplicationStage(applicationId, stage) {
    const applicant = state.applications.find((row) => row.id === applicationId);
    if (!applicant) throw new Error("Application not found");
    if (applicant.stage === stage) return state;
    return persist({
      ...state,
      applications: state.applications.map((row) =>
        row.id === applicationId ? { ...row, stage: stage as Applicant["stage"] } : row,
      ),
      audit: [
        audit(
          "application.stage",
          "volunteer",
          applicationId,
          `Moved ${applicant.name} to ${stage.charAt(0).toUpperCase()}${stage.slice(1)}`,
          `Previously ${applicant.stage}`,
        ),
        ...state.audit,
      ],
    });
  },
  async checkIn(shiftId, volunteerId, code) {
    if (code && code !== previewCheckinCode(shiftId)) {
      throw new Error("That check-in code is not valid.");
    }
    const existing = (state.attendance[shiftId] ?? []).find(
      (row) => row.volunteerId === volunteerId,
    );
    if (existing && existing.status !== "expected") return state;
    const next = withAttendance(state, shiftId, {
      volunteerId,
      shiftId,
      role: existing?.role ?? volunteerRole(volunteerId),
      status: "checked_in",
      checkedInAt: workspace.demoNow,
      checkedOutAt: null,
    });
    return persist({
      ...next,
      audit: [
        audit("shift.checkin", "shift", shiftId, `Checked in ${volunteerName(volunteerId)}`),
        ...next.audit,
      ],
    });
  },
  async checkOut(shiftId, volunteerId) {
    const existing = (state.attendance[shiftId] ?? []).find(
      (row) => row.volunteerId === volunteerId,
    );
    const next = withAttendance(state, shiftId, {
      volunteerId,
      shiftId,
      role: existing?.role ?? volunteerRole(volunteerId),
      status: "completed",
      checkedInAt: existing?.checkedInAt ?? workspace.demoNow,
      checkedOutAt: workspace.demoNow,
    });
    return persist({
      ...next,
      audit: [
        audit("shift.checkout", "shift", shiftId, `Checked out ${volunteerName(volunteerId)}`),
        ...next.audit,
      ],
    });
  },
  async cancelRegistration(shiftId, volunteerId, reason) {
    const registration = state.registrations.find(
      (row) => row.shiftId === shiftId && row.volunteerId === volunteerId,
    );
    if (!registration) throw new Error("That registration no longer exists.");
    const promoted = state.settings.autoPromoteWaitlist
      ? [...state.waitlist]
          .filter(
            (row) =>
              row.shiftId === shiftId &&
              row.status === "waiting" &&
              row.eligibleRole === registration.role,
          )
          .sort((a, b) => a.position - b.position)[0]
      : undefined;
    const nextRegistrations: SessionSnapshot["registrations"] = state.registrations.map((row) =>
      row.shiftId === shiftId && row.volunteerId === volunteerId
        ? { ...row, status: "canceled" }
        : row,
    );
    const auditEvents = [
      audit(
        "shift.cancel_registration",
        "shift",
        shiftId,
        `Canceled ${volunteerName(volunteerId)}'s registration`,
        reason,
      ),
    ];
    if (promoted) {
      nextRegistrations.push({
        shiftId,
        volunteerId: promoted.volunteerId,
        role: registration.role,
        status: "registered",
      });
      auditEvents.push(
        audit(
          "waitlist.promote",
          "shift",
          shiftId,
          `Promoted ${volunteerName(promoted.volunteerId)} from the waitlist`,
          `Filled the ${registration.role} seat opened by a cancellation`,
        ),
      );
    }
    return persist({
      ...state,
      registrations: nextRegistrations,
      waitlist: promoted
        ? state.waitlist.map((row) =>
            row.id === promoted.id ? { ...row, status: "promoted" } : row,
          )
        : state.waitlist,
      audit: [...auditEvents, ...state.audit],
    });
  },
  async joinWaitlist(shiftId, volunteerId, role) {
    if (
      state.waitlist.some(
        (row) =>
          row.shiftId === shiftId && row.volunteerId === volunteerId && row.status === "waiting",
      )
    ) {
      return state;
    }
    const entry: WaitlistEntry = {
      id: `wait-${Date.now()}`,
      shiftId,
      volunteerId,
      createdAt: workspace.demoNow,
      status: "waiting",
      position:
        state.waitlist.filter((row) => row.shiftId === shiftId && row.status === "waiting").length +
        1,
      eligibleRole: role,
    };
    return persist({
      ...state,
      waitlist: [...state.waitlist, entry],
      audit: [
        audit(
          "waitlist.join",
          "shift",
          shiftId,
          `Added ${volunteerName(volunteerId)} to the waitlist`,
        ),
        ...state.audit,
      ],
    });
  },
  async getCheckinCode(shiftId): Promise<CheckinCode> {
    const issuedAt = workspace.demoNow;
    const expiresAt = new Date(
      new Date(workspace.demoNow).getTime() + 4 * 60 * 60 * 1000,
    ).toISOString();
    const code = previewCheckinCode(shiftId);
    const token = `demo-${shiftId}-${code}`;
    return {
      shiftId,
      code,
      token,
      issuedAt,
      expiresAt,
      payload: `civicflow://checkin/${token}`,
    };
  },
  async autoRoster(shiftIds, options): Promise<RosterPlan> {
    const shifts = workspace.shifts.filter((shift) => shiftIds.includes(shift.id));
    const candidates = workspace.volunteers.filter((volunteer) => volunteer.status === "active");
    const assignments: PlannedAssignment[] = [];
    const unfilled: RosterPlan["unfilled"] = [];
    const booked = new Set<string>();
    let slotsConsidered = 0;
    let totalScore = 0;
    for (const shift of shifts) {
      const opportunity = workspace.opportunities.find((row) => row.id === shift.opportunityId);
      for (const role of shift.roles) {
        for (let seat = 0; seat < Math.max(0, role.required - role.filled); seat += 1) {
          slotsConsidered += 1;
          const key = `${shift.id}:${role.name}`;
          const candidate = candidates.find((volunteer) => {
            if (booked.has(`${volunteer.id}:${shift.startsAt}`)) return false;
            if (options.capWeekly && booked.has(`${volunteer.id}:week`)) return false;
            return volunteer.skills.some((skill) =>
              skill.toLowerCase().includes(role.name.toLowerCase().split(" ")[0]),
            );
          });
          if (!candidate) {
            unfilled.push({
              shiftId: shift.id,
              role: role.name,
              reason: "No eligible volunteer is available for this slot.",
              requiredSkill: role.name,
              requiredCredential: null,
            });
            continue;
          }
          booked.add(`${candidate.id}:${shift.startsAt}`);
          booked.add(`${candidate.id}:week`);
          const breakdown = {
            skill: 30,
            availability: 20,
            interest: 15,
            preference: 10,
            fairness: 15,
            reliability: 10,
            total: 100,
          };
          totalScore += breakdown.total;
          assignments.push({
            shiftId: shift.id,
            opportunityId: shift.opportunityId,
            shiftTitle: opportunity?.title ?? "Shift",
            role: role.name,
            candidateId: candidate.id,
            candidateName: candidate.name,
            candidateInitials: candidate.initials,
            startsAt: shift.startsAt,
            score: breakdown.total,
            breakdown,
            reasons: [
              `Skill match: ${role.name}`,
              `${options.preferSpanish && candidate.languages.includes("Spanish") ? "Spanish-speaking" : "Available"} for ${key}`,
              "Highest fairness score among eligible volunteers",
            ],
            promoteWaitlist: false,
            eligibleRoles: [role.name],
          });
        }
      }
    }
    return {
      assignments,
      unfilled,
      totalScore,
      slotsConsidered,
      candidatesConsidered: candidates.length,
      deterministicSeed: 20260415,
    };
  },
  async applyRoster(shiftId, assignments: RosterApplyAssignment[]) {
    if (assignments.length === 0) {
      throw new Error("Select at least one suggested assignment to apply");
    }
    let next = state;
    const events: AuditEvent[] = [];
    for (const assignment of assignments) {
      if (assignment.promoteWaitlist) {
        next = {
          ...next,
          waitlist: next.waitlist.map((row) =>
            row.shiftId === shiftId &&
            row.volunteerId === assignment.candidateId &&
            row.status === "waiting"
              ? { ...row, status: "promoted" }
              : row,
          ),
        };
      }
      next = {
        ...next,
        registrations: [
          ...next.registrations.filter(
            (row) => !(row.shiftId === shiftId && row.volunteerId === assignment.candidateId),
          ),
          {
            shiftId,
            volunteerId: assignment.candidateId,
            role: assignment.role,
            status: "registered",
          },
        ],
      };
      events.push(
        audit(
          assignment.promoteWaitlist ? "waitlist.promote" : "autoroster.apply",
          "shift",
          shiftId,
          `AutoRoster assigned ${volunteerName(assignment.candidateId)} as ${assignment.role}`,
          "Applied from an approved AutoRoster plan",
        ),
      );
    }
    return persist({ ...next, audit: [...events, ...next.audit] });
  },
  async markNoShow(shiftId, volunteerId) {
    const existing = (state.attendance[shiftId] ?? []).find(
      (row) => row.volunteerId === volunteerId,
    );
    const next = withAttendance(state, shiftId, {
      volunteerId,
      shiftId,
      role: existing?.role ?? volunteerRole(volunteerId),
      status: "no_show",
      checkedInAt: null,
      checkedOutAt: null,
    });
    return persist({
      ...next,
      audit: [
        audit(
          "shift.no_show",
          "shift",
          shiftId,
          `Marked ${volunteerName(volunteerId)} as a no-show`,
        ),
        ...next.audit,
      ],
    });
  },
  async promoteWaitlist(shiftId, volunteerId) {
    const entry = state.waitlist.find(
      (row) => row.shiftId === shiftId && row.volunteerId === volunteerId,
    );
    if (!entry) throw new Error("Waitlist entry not found");
    if (entry.status !== "waiting") return state;
    return persist({
      ...state,
      waitlist: state.waitlist.map((row) =>
        row.id === entry.id ? { ...row, status: "promoted" } : row,
      ),
      registrations: [
        ...state.registrations.filter(
          (row) => !(row.shiftId === shiftId && row.volunteerId === volunteerId),
        ),
        { shiftId, volunteerId, role: volunteerRole(volunteerId), status: "registered" },
      ],
      audit: [
        audit(
          "waitlist.promote",
          "shift",
          shiftId,
          `Promoted ${volunteerName(volunteerId)} from the waitlist`,
        ),
        ...state.audit,
      ],
    });
  },
  async reviewHours(entryId, decision: HoursDecision) {
    const entry = [...workspace.hourEntries, ...workspace.mayaEntries].find(
      (row) => row.id === entryId,
    );
    if (!entry || entry.status !== "pending") throw new Error("Only pending hours can be reviewed");
    if (decision.status === "verified" && !decision.approvedMinutes) {
      throw new Error("Approved hours need an approved minute value");
    }
    return persist({
      ...state,
      hoursDecisions: { ...state.hoursDecisions, [entryId]: decision },
      audit: [
        audit(
          decision.status === "verified" ? "hours.approve" : "hours.reject",
          "hours",
          entryId,
          decision.status === "verified"
            ? `Approved ${decision.approvedMinutes ?? 0} minutes for ${volunteerName(entry.volunteerId)}`
            : `Rejected submitted hours for ${volunteerName(entry.volunteerId)}`,
          decision.reason,
        ),
        ...state.audit,
      ],
    });
  },
  async updateSettings(patch) {
    const settings = { ...state.settings, ...patch };
    if (!settings.organizationName.trim()) throw new Error("Organization name is required");
    if (!settings.contactEmail.includes("@")) throw new Error("Enter a valid contact email");
    return persist({
      ...state,
      settings,
      audit: [
        audit("settings.update", "settings", "workspace", "Updated workspace settings"),
        ...state.audit,
      ],
    });
  },
  async createOpportunity(input: NewOpportunityInput) {
    const id = `opp-new-${Date.now()}`;
    const opportunity: Opportunity = {
      id,
      slug: input.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, ""),
      title: input.title,
      cause: input.cause,
      organization: workspace.organization.name,
      image: "/media/opp-community-event.jpg",
      imageAlt: `${input.title} volunteers at work`,
      description: input.description,
      address: input.address,
      distanceMiles: 2.4,
      coordinator: workspace.coordinator.name,
      capacity: input.capacity,
      duration: input.duration,
      training: ["Orientation on arrival"],
      requirements: input.requirements,
      impactMetric: "New program — impact will be tracked after the first shift",
    };
    return {
      opportunity,
      snapshot: persist({
        ...state,
        createdOpportunities: [opportunity, ...state.createdOpportunities],
        audit: [
          audit(
            "opportunity.create",
            "opportunity",
            opportunity.id,
            `Created ${opportunity.title}`,
            `Capacity: ${opportunity.capacity}`,
          ),
          ...state.audit,
        ],
      }),
    };
  },
  async registerForShift(shiftId, volunteerId, role) {
    return persist({
      ...state,
      registrations: [
        ...state.registrations.filter(
          (row) => !(row.shiftId === shiftId && row.volunteerId === volunteerId),
        ),
        {
          shiftId,
          volunteerId,
          role: role.trim() || volunteerRole(volunteerId),
          status: "registered",
        },
      ],
      audit: [
        audit(
          "shift.register",
          "shift",
          shiftId,
          `Registered ${volunteerName(volunteerId)} as ${role || volunteerRole(volunteerId)}`,
        ),
        ...state.audit,
      ],
    });
  },
  async saveVolunteerProfile(patch) {
    if (patch.skills && patch.skills.length === 0) {
      throw new Error("Choose at least one skill so matches stay explainable");
    }
    if (patch.availability && patch.availability.length === 0) {
      throw new Error("Add at least one availability window");
    }
    return persist({
      ...state,
      volunteerProfile: { ...state.volunteerProfile, ...patch },
      audit: [
        audit(
          "volunteer.profile_update",
          "volunteer",
          "vol-maya",
          "Updated skills and availability",
        ),
        ...state.audit,
      ],
    });
  },
  async resetDemo() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(READ_KEY);
    } catch {
      // Resetting in memory is still meaningful.
    }
    state = createDefaultSnapshot();
    return state;
  },
  async listBackups() {
    return listBackupMeta();
  },
  async createBackup(note) {
    const backups = ensureBackups();
    const created = makeBackup(state, "manual", note?.trim() || "Manual snapshot");
    writeBackups([created, ...backups]);
    return listBackupMeta();
  },
  async restoreBackup(id): Promise<BackupRestoreResult> {
    const backups = ensureBackups();
    const target = backups.find((entry) => entry.meta.id === id);
    if (!target) throw new Error("That snapshot is not available in this workspace.");
    if (!validSnapshot(target.snapshot)) {
      throw new Error("That backup is incomplete or foreign and was not restored.");
    }

    const safety = makeBackup(state, "automatic", `Before restoring ${id}`);
    writeBackups([safety, ...backups]);

    const restored = clone(target.snapshot);
    const event = audit(
      "backup.restore",
      "backup",
      id,
      `Restored backup ${id}`,
      `Safety snapshot: ${safety.meta.id}`,
    );
    const next = persist({ ...restored, audit: [event, ...restored.audit] });
    return { snapshot: next, backups: listBackupMeta() };
  },
  async getMissionControl(role: AccountRole = "coordinator") {
    return buildMissionControl(demoWorkspace, readIds(), role);
  },
  async getNotifications(role: AccountRole) {
    const read = readIds();
    return demoWorkspace.notifications
      .filter((notification) =>
        role === "volunteer"
          ? notification.href.startsWith("/volunteer")
          : !notification.href.startsWith("/volunteer"),
      )
      .map((notification) => ({
        ...notification,
        readAt: read.includes(notification.id) ? new Date().toISOString() : notification.readAt,
      }));
  },
  async markNotificationRead(id: string, _role: AccountRole) {
    writeIds([...readIds(), id]);
  },
  async saveReportView(name, scope, filtersJson) {
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 80) {
      throw new Error("Saved view names must be 2–80 characters.");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(filtersJson);
    } catch {
      throw new Error("Saved view filters must be valid JSON.");
    }
    if (!isRecord(parsed)) throw new Error("Saved view filters must be a JSON object.");
    const existing = state.savedViews.find((view) => view.name === trimmed && view.scope === scope);
    const savedView: SavedViewRecord = {
      id: existing?.id ?? `view-${Date.now()}`,
      scope,
      name: trimmed,
      filtersJson,
      createdAt: existing?.createdAt ?? workspace.demoNow,
    };
    return persist({
      ...state,
      savedViews: existing
        ? state.savedViews.map((view) => (view.id === existing.id ? savedView : view))
        : [savedView, ...state.savedViews],
      audit: [
        audit("report.view_saved", "system", trimmed, `Saved report view ${trimmed}`),
        ...state.audit,
      ],
    });
  },
  async generateReport(request) {
    return buildPreviewReport(request);
  },
  async exportReport(request, format) {
    const report = buildPreviewReport(request);
    if (format === "csv") {
      const csv = [
        report.headers.map((value) => `"${value.replace(/"/g, '""')}"`).join(","),
        ...report.rows.map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(",")),
      ].join("\r\n");
      const blob = new Blob([`\ufeff${csv}\r\n`], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `civicflow-${report.template}-${report.period.slice(0, 10)}.csv`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      return {
        path: "browser-download",
        bytes: blob.size,
        format,
        title: report.title,
      };
    }
    const printWindow = window.open("", "_blank", "width=960,height=1000");
    if (!printWindow) throw new Error("Allow pop-ups to open the printable report.");
    printWindow.document.write(
      `<!doctype html><title>${report.title}</title><style>body{font:12px system-ui;padding:32px;color:#111}h1{font-size:20px}h2{font-size:14px;font-weight:500}table{border-collapse:collapse;width:100%;margin-top:16px}th,td{border-bottom:1px solid #ddd;padding:6px;text-align:left;font-size:10px}th{background:#f2f2f2}</style>` +
        `<h1>${report.organization}</h1><h2>${report.title} · ${report.period}</h2>` +
        `<p>${report.summary.map((item) => `${item.label}: ${item.value}`).join(" · ")}</p>` +
        `<table><thead><tr>${report.headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead><tbody>${report.rows
          .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`)
          .join("")}</tbody></table>`,
    );
    printWindow.document.close();
    printWindow.focus();
    printWindow.setTimeout(() => printWindow.print(), 250);
    return { path: "print-dialog", bytes: 0, format, title: report.title };
  },
};
