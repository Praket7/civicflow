import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type {
  Account,
  AccountRole,
  AuthSession,
  BackupRestoreResult,
  BackupSnapshot,
  CheckinCode,
  CreateOpportunityResult,
  ExportFormat,
  ExportReceipt,
  HoursDecision,
  MissionControlSummary,
  NewOpportunityInput,
  NotificationItem,
  Opportunity,
  ReportDocument,
  ReportRequest,
  RosterApplyAssignment,
  RosterOptions,
  RosterPlan,
  SessionSnapshot,
  WorkspaceSettings,
} from "../../types/domain";
import type { HostedIdentity } from "../auth/hosted";
import { isTauri } from "../platform";
import { demoWorkspace } from "./dataset";
import { previewRepository } from "./previewRepository";

/**
 * The single data boundary used by screens and the session provider.
 *
 * Desktop: every method invokes a Rust command that owns SQLite and appends its
 * audit event. Preview: `previewRepository` mirrors the same contract.
 */
export interface WorkspaceRepository {
  readonly source: "desktop" | "preview";
  signIn(email: string, password: string, remember: boolean): Promise<AuthSession>;
  createAccount(
    name: string,
    email: string,
    password: string,
    role: AccountRole,
  ): Promise<AuthSession>;
  /** Resumes the local workspace behind an email the hosted provider verified. */
  signInWithHosted(identity: HostedIdentity): Promise<AuthSession>;
  signOut(token: string): Promise<void>;
  currentUser(token: string): Promise<Account | null>;
  listAccounts(token: string): Promise<Account[]>;
  resetPassword(token: string, userId: string, newPassword: string): Promise<void>;
  /** Points the workspace at the organization the person is looking at. */
  selectOrganization(
    organization: {
      id: string;
      name: string;
      coordinatorName?: string;
      coordinatorEmail?: string;
      image?: string;
      imageAlt?: string;
    } | null,
  ): Promise<void>;
  getSnapshot(): Promise<SessionSnapshot>;
  setSaved(opportunityId: string, saved: boolean): Promise<SessionSnapshot>;
  setApplicationStage(applicationId: string, stage: string): Promise<SessionSnapshot>;
  checkIn(shiftId: string, volunteerId: string, code?: string): Promise<SessionSnapshot>;
  checkOut(shiftId: string, volunteerId: string): Promise<SessionSnapshot>;
  markNoShow(shiftId: string, volunteerId: string): Promise<SessionSnapshot>;
  cancelRegistration(
    shiftId: string,
    volunteerId: string,
    reason?: string,
  ): Promise<SessionSnapshot>;
  joinWaitlist(shiftId: string, volunteerId: string, role: string): Promise<SessionSnapshot>;
  getCheckinCode(shiftId: string): Promise<CheckinCode>;
  autoRoster(shiftIds: string[], options: RosterOptions): Promise<RosterPlan>;
  applyRoster(shiftId: string, assignments: RosterApplyAssignment[]): Promise<SessionSnapshot>;
  promoteWaitlist(shiftId: string, volunteerId: string): Promise<SessionSnapshot>;
  reviewHours(entryId: string, decision: HoursDecision): Promise<SessionSnapshot>;
  updateSettings(patch: Partial<WorkspaceSettings>): Promise<SessionSnapshot>;
  createOpportunity(input: NewOpportunityInput): Promise<{
    opportunity: Opportunity;
    snapshot: SessionSnapshot;
  }>;
  registerForShift(shiftId: string, volunteerId: string, role: string): Promise<SessionSnapshot>;
  saveVolunteerProfile(
    patch: Partial<SessionSnapshot["volunteerProfile"]>,
  ): Promise<SessionSnapshot>;
  resetDemo(): Promise<SessionSnapshot>;
  listBackups(): Promise<BackupSnapshot[]>;
  createBackup(note?: string): Promise<BackupSnapshot[]>;
  restoreBackup(id: string): Promise<BackupRestoreResult>;
  getMissionControl(role?: AccountRole): Promise<MissionControlSummary>;
  getNotifications(role: AccountRole): Promise<NotificationItem[]>;
  markNotificationRead(id: string, role: AccountRole): Promise<void>;
  saveReportView(name: string, scope: string, filtersJson: string): Promise<SessionSnapshot>;
  generateReport(request: ReportRequest): Promise<ReportDocument>;
  exportReport(request: ReportRequest, format: ExportFormat): Promise<ExportReceipt | null>;
}

// The signed-in session is the only credential the IPC bridge accepts. Keeping
// it here means no screen can call a workspace command without the token the
// AuthProvider resolved.
let activeToken: string | null = null;

export function setRepositoryToken(token: string | null): void {
  activeToken = token;
}

function withToken(args: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...args, token: activeToken ?? "" };
}

const desktopRepository: WorkspaceRepository = {
  source: "desktop",
  signIn: (email, password, remember) =>
    invoke<AuthSession>("sign_in", { email, password, remember }),
  createAccount: (name, email, password, role) =>
    invoke<AuthSession>("create_account", { name, email, password, role }),
  signInWithHosted: (identity) =>
    invoke<AuthSession>("sign_in_with_hosted", {
      name: identity.name,
      email: identity.email,
      role: identity.role,
    }),
  signOut: async (token) => {
    await invoke<boolean>("sign_out", { token });
  },
  currentUser: (token) => invoke<Account | null>("current_user", { token }),
  listAccounts: (token) => invoke<Account[]>("list_accounts", { token }),
  resetPassword: async (token, userId, newPassword) => {
    await invoke<null>("reset_password", { token, userId, newPassword });
  },
  // The desktop core keeps one local workspace behind SQLite; the session picks
  // the seeded preview store for organizations created in the app, so this call
  // has nothing to swap.
  selectOrganization: async () => undefined,
  getSnapshot: () => invoke<SessionSnapshot>("get_workspace_snapshot", withToken()),
  setSaved: (opportunityId, saved) =>
    invoke<SessionSnapshot>("set_saved_opportunity", withToken({ opportunityId, saved })),
  setApplicationStage: (applicationId, stage) =>
    invoke<SessionSnapshot>("set_application_stage", withToken({ applicationId, stage })),
  checkIn: (shiftId, volunteerId, code) =>
    invoke<SessionSnapshot>(
      "check_in_volunteer",
      withToken({ shiftId, volunteerId, code: code ?? null }),
    ),
  checkOut: (shiftId, volunteerId) =>
    invoke<SessionSnapshot>("check_out_volunteer", withToken({ shiftId, volunteerId })),
  markNoShow: (shiftId, volunteerId) =>
    invoke<SessionSnapshot>("mark_volunteer_no_show", withToken({ shiftId, volunteerId })),
  cancelRegistration: (shiftId, volunteerId, reason) =>
    invoke<SessionSnapshot>(
      "cancel_registration",
      withToken({
        shiftId,
        volunteerId,
        reason: reason ?? null,
      }),
    ),
  joinWaitlist: (shiftId, volunteerId, role) =>
    invoke<SessionSnapshot>("join_waitlist", withToken({ shiftId, volunteerId, role })),
  getCheckinCode: (shiftId) => invoke<CheckinCode>("get_checkin_code", withToken({ shiftId })),
  autoRoster: (shiftIds, options) =>
    invoke<RosterPlan>("auto_roster", withToken({ shiftIds, options })),
  applyRoster: (shiftId, assignments) =>
    invoke<SessionSnapshot>("apply_roster_plan", withToken({ shiftId, assignments })),
  promoteWaitlist: (shiftId, volunteerId) =>
    invoke<SessionSnapshot>("promote_waitlist", withToken({ shiftId, volunteerId })),
  reviewHours: (entryId, decision) =>
    invoke<SessionSnapshot>(
      "review_hours",
      withToken({
        entryId,
        status: decision.status,
        approvedMinutes: decision.approvedMinutes,
        reason: decision.reason,
      }),
    ),
  updateSettings: (patch) =>
    invoke<SessionSnapshot>("update_workspace_settings", withToken({ patch })),
  createOpportunity: (input) =>
    invoke<CreateOpportunityResult>("create_opportunity", withToken({ input })),
  registerForShift: (shiftId, volunteerId, role) =>
    invoke<SessionSnapshot>("register_for_shift", withToken({ shiftId, volunteerId, role })),
  saveVolunteerProfile: (patch) =>
    invoke<SessionSnapshot>(
      "save_volunteer_profile",
      withToken({
        skills: patch.skills ?? [],
        availability: patch.availability ?? [],
        completedOnboarding: patch.completedOnboarding ?? true,
        phone: patch.phone ?? "",
        interests: patch.interests ?? "",
        causes: patch.causes ?? [],
        photo: patch.photo ?? "",
      }),
    ),
  resetDemo: () => invoke<SessionSnapshot>("reset_demo", withToken()),
  listBackups: () => invoke<BackupSnapshot[]>("list_backups", withToken()),
  createBackup: (note) => invoke<BackupSnapshot[]>("create_backup", withToken({ note })),
  restoreBackup: (id) => invoke<BackupRestoreResult>("restore_backup", withToken({ id })),
  getMissionControl: () => invoke<MissionControlSummary>("get_mission_control", withToken()),
  getNotifications: () => invoke<NotificationItem[]>("list_notifications", withToken()),
  markNotificationRead: async (id: string) => {
    await invoke<boolean>("mark_notification_read", withToken({ id }));
  },
  saveReportView: (name, scope, filtersJson) =>
    invoke<SessionSnapshot>("save_report_view", withToken({ name, scope, filtersJson })),
  generateReport: (request) => invoke<ReportDocument>("generate_report", withToken({ request })),
  exportReport: async (request, format) => {
    const document = await invoke<ReportDocument>("generate_report", withToken({ request }));
    const extension = format === "pdf" ? "pdf" : "csv";
    const slug = document.template.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
    const path = await save({
      title: `Export ${document.title}`,
      defaultPath: `civicflow-${slug}-${document.period.slice(0, 10)}.${extension}`,
      filters: [
        {
          name: extension === "pdf" ? "PDF report" : "CSV report",
          extensions: [extension],
        },
      ],
    });
    if (!path) return null;
    return invoke<ExportReceipt>("export_report", withToken({ request, format, path }));
  },
};

export function getWorkspaceRepository(): WorkspaceRepository {
  return isTauri() ? desktopRepository : previewRepository;
}

/**
 * The seeded browser store. The desktop shell uses the same implementation for
 * an organization created in the app, so those workspaces stay isolated from the
 * local SQLite demo workspace.
 */
export { previewRepository };

export const demoOrganization = demoWorkspace.organization;
export const demoCoordinator = demoWorkspace.coordinator;
export const demoVolunteer = demoWorkspace.volunteers[0];
