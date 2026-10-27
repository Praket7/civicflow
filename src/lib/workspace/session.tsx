import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  BackupRestoreResult,
  BackupSnapshot,
  CandidateAnswer,
  CheckinCode,
  CredentialReadiness,
  DemoWorkspace,
  DisruptionReport,
  EngagementMetrics,
  HoursDecision,
  NewOpportunityInput,
  NotificationRule,
  NotificationRulePatch,
  Opportunity,
  RecoveryChangeRequest,
  RecoveryPlan,
  RecurrenceRule,
  ReplacementRecommendation,
  RetentionSignal,
  RosterApplyAssignment,
  RosterOptions,
  RosterPlan,
  RosterPolicy,
  RosterPolicyView,
  SeriesRole,
  SessionSnapshot,
  ShiftSeriesRecord,
  VolunteerInsight,
  ExportReceipt,
  VolunteerImportPreview,
  VolunteerImportSummary,
  WorkspaceSettings,
} from "../../types/domain";
import { useOptionalAuth } from "../auth/session";
import { useOrganizationWorkspace } from "../organizations/useOrganizationWorkspace";
import type { OrganizationProfile } from "../organizations/store";
import { demoWorkspace } from "./dataset";
import {
  DEMO_ORGANIZATION,
  isDemoOrganization,
  withCreatedShifts,
  withRoster,
  workspaceForOrganization,
} from "./organizationWorkspace";
import { workspaceReadKeys } from "./queries";
import { getWorkspaceRepository, previewRepository } from "./repository";
import { WorkspaceScopeProvider } from "./scope";
import { setDisplayTimeZone } from "./selectors";

const localRepository = getWorkspaceRepository();

/**
 * The bundled demo organization reads the app's own store. An organization
 * someone creates or joins gets its own scoped store, so its schedule starts
 * empty and never shows another organization's work.
 */
function repositoryFor(organization: OrganizationProfile | null) {
  if (!organization || isDemoOrganization(organization.id)) return localRepository;
  return previewRepository;
}

interface WorkspaceSessionValue {
  workspace: DemoWorkspace;
  session: SessionSnapshot;
  backups: BackupSnapshot[];
  actions: {
    setSaved(opportunityId: string, saved: boolean): Promise<void>;
    setApplicationStage(applicationId: string, stage: string): Promise<void>;
    checkIn(shiftId: string, volunteerId: string, code?: string): Promise<void>;
    checkOut(shiftId: string, volunteerId: string): Promise<void>;
    markNoShow(shiftId: string, volunteerId: string): Promise<void>;
    cancelRegistration(shiftId: string, volunteerId: string, reason?: string): Promise<void>;
    joinWaitlist(shiftId: string, volunteerId: string, role: string): Promise<void>;
    getCheckinCode(shiftId: string): Promise<CheckinCode>;
    autoRoster(shiftIds: string[], options: RosterOptions): Promise<RosterPlan>;
    getRosterPolicy(): Promise<RosterPolicyView>;
    updateRosterPolicy(policy: RosterPolicy): Promise<RosterPolicyView>;
    explainRosterChoice(
      shiftIds: string[],
      options: RosterOptions,
      candidateId: string,
      slotId: string,
    ): Promise<CandidateAnswer>;
    applyRoster(shiftId: string, assignments: RosterApplyAssignment[]): Promise<void>;
    /** What is wrong with the roster now: open required seats and lapsed credentials. */
    detectDisruptions(): Promise<DisruptionReport>;
    /** A minimal repair for the chosen shifts, judged on what it disturbs. */
    planRecovery(shiftIds: string[], options: RosterOptions): Promise<RecoveryPlan>;
    /** Applies the seat changes a coordinator approved. */
    applyRecovery(shiftId: string, changes: RecoveryChangeRequest[]): Promise<void>;
    /** Holds an assignment still against replanning, or releases it. */
    setAssignmentLock(shiftId: string, volunteerId: string, locked: boolean): Promise<void>;
    /** Schedules a repeating series and returns the rule that now owns it. */
    createShiftSeries(
      opportunityId: string,
      rule: RecurrenceRule,
      roles: SeriesRole[],
    ): Promise<ShiftSeriesRecord>;
    listShiftSeries(opportunityId?: string): Promise<ShiftSeriesRecord[]>;
    generateSeriesInstances(seriesId: string): Promise<number>;
    retimeShiftSeries(
      seriesId: string,
      startsLocalTime: string,
      durationMinutes: number,
      scope: "instance" | "series",
    ): Promise<void>;
    deleteShiftSeries(seriesId: string): Promise<void>;
    /** Who should take an opened seat, and why the people ahead were skipped. */
    recommendReplacement(shiftId: string, role: string): Promise<ReplacementRecommendation>;
    listNotificationRules(): Promise<NotificationRule[]>;
    updateNotificationRule(
      ruleId: string,
      patch: NotificationRulePatch,
    ): Promise<NotificationRule[]>;
    /** Queues every reminder that is due, and returns how many it wrote. */
    queueDueReminders(): Promise<number>;
    /** The transparent rules behind who might need attention. */
    retentionSignals(): Promise<RetentionSignal[]>;
    /** One volunteer's verified hours, completed shifts, and milestones. */
    volunteerInsight(volunteerId: string): Promise<VolunteerInsight>;
    engagementMetrics(): Promise<EngagementMetrics>;
    credentialReadiness(): Promise<CredentialReadiness>;
    saveReportView(name: string, scope: string, filtersJson: string): Promise<void>;
    promoteWaitlist(shiftId: string, volunteerId: string): Promise<void>;
    reviewHours(entryId: string, decision: HoursDecision): Promise<void>;
    updateSettings(patch: Partial<WorkspaceSettings>): Promise<void>;
    createOpportunity(input: NewOpportunityInput): Promise<Opportunity>;
    registerForShift(shiftId: string, volunteerId: string, role: string): Promise<void>;
    saveVolunteerProfile(patch: Partial<SessionSnapshot["volunteerProfile"]>): Promise<void>;
    resetDemo(): Promise<void>;
    createBackup(note?: string): Promise<BackupSnapshot[]>;
    restoreBackup(id: string): Promise<BackupRestoreResult>;
    /** Checks a volunteer spreadsheet without writing anything. */
    previewVolunteerImport(text: string): Promise<VolunteerImportPreview>;
    /** Adds the file as one transaction, then refreshes the roster screens. */
    applyVolunteerImport(text: string): Promise<VolunteerImportSummary>;
    /** Writes the roster in the shape the import reads. */
    exportVolunteerRoster(): Promise<ExportReceipt | null>;
  };
}

const WorkspaceSessionContext = createContext<WorkspaceSessionValue | null>(null);

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Writes run in order. AutoRoster can queue several registrations at once, and
// out-of-order responses would apply an older snapshot last.
let pendingWrites: Promise<unknown> = Promise.resolve();

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const next = pendingWrites.then(operation, operation);
  pendingWrites = next.catch(() => undefined);
  return next;
}

export function WorkspaceSessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const auth = useOptionalAuth();
  const account = auth?.user ?? null;
  const organizationWorkspace = useOrganizationWorkspace(account);
  // Signed out, nothing narrows the workspace, so the signed-out preview keeps
  // the sample organization. A signed-in account with no organization yet reads
  // an empty workspace instead.
  const organization = account ? organizationWorkspace.current : null;
  const organizationId = organization?.id ?? "";
  const organizationName = organization?.name ?? "";
  const organizationImage = organization?.image ?? "";
  const organizationImageAlt = organization?.imageAlt ?? "";
  const accountId = account?.id ?? "";
  // The store hands back a fresh object on every change; scope on identity, so
  // an edited name or a new cover picture reaches the screens immediately.
  const repository = useMemo(
    () => (account ? repositoryFor(organization ?? null) : localRepository),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [organization, accountId],
  );
  const workspace = useMemo(
    () => (account ? workspaceForOrganization(organization ?? null, account) : demoWorkspace),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [organization, accountId],
  );
  const [session, setSession] = useState<SessionSnapshot | null>(null);
  const [backups, setBackups] = useState<BackupSnapshot[]>([]);
  const [error, setError] = useState("");

  // The saved profile is the source of truth for the signed-in volunteer, so
  // what setup stores is what the roster and the profile screen read back.
  const visibleWorkspace = useMemo(() => {
    // The seed authored the bundled roster; the database owns everyone a
    // coordinator added or imported since, so both reach the same screen.
    const base = withCreatedShifts(
      withRoster(workspace, session?.roster ?? []),
      session?.createdSeries ?? [],
      session?.createdShifts ?? [],
    );
    if (!session) return base;
    const profile = session.volunteerProfile;
    return {
      ...base,
      volunteers: base.volunteers.map((volunteer) =>
        volunteer.id === base.currentVolunteerId
          ? {
              ...volunteer,
              skills: profile.skills,
              availability: profile.availability,
              phone: profile.phone ?? volunteer.phone,
              interests: profile.interests ?? volunteer.interests,
              causes: profile.causes ?? volunteer.causes,
              photo: profile.photo ?? volunteer.photo,
            }
          : volunteer,
      ),
    };
  }, [session, workspace]);

  const apply = useCallback(
    (next: SessionSnapshot) => {
      setSession(next);
      setError("");
      // A write can change any read model built from the same rows, so each one
      // is dropped rather than left to show the roster as it was.
      for (const queryKey of workspaceReadKeys) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
    [queryClient],
  );
  useEffect(() => {
    let active = true;
    const scope = account
      ? repository.selectOrganization(
          organizationId
            ? {
                id: organizationId,
                name: organizationName,
                coordinatorName: account.role === "coordinator" ? account.name : undefined,
                coordinatorEmail: account.role === "coordinator" ? account.email : undefined,
                image: organizationImage || undefined,
                imageAlt: organizationImageAlt || undefined,
              }
            : null,
        )
      : repository.selectOrganization(DEMO_ORGANIZATION);
    scope
      .then(() => repository.getSnapshot())
      .then((snapshot) => {
        if (active) setSession(snapshot);
      })
      .catch((caught: unknown) => {
        if (active) setError(describeError(caught));
      });
    repository
      .listBackups()
      .then((snapshots) => {
        if (active) setBackups(snapshots);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [
    repository,
    organizationId,
    organizationName,
    organizationImage,
    organizationImageAlt,
    account,
  ]);

  useEffect(() => {
    if (!session) return;
    const root = document.documentElement;
    if (session.settings.textScale === "standard") root.removeAttribute("data-text-scale");
    else root.setAttribute("data-text-scale", session.settings.textScale);
    root.dataset.highContrast = String(session.settings.highContrast);
    root.dataset.reducedMotion = String(session.settings.reducedMotion);
    root.dataset.underlineLinks = String(session.settings.underlineLinks);
    root.dataset.colourIndependent = String(session.settings.colourIndependent);
  }, [session]);

  const run = useCallback(
    (operation: () => Promise<SessionSnapshot>) =>
      enqueue(async () => {
        try {
          apply(await operation());
        } catch (caught) {
          setError(describeError(caught));
        }
      }),
    [apply],
  );

  const actions = useMemo<WorkspaceSessionValue["actions"]>(
    () => ({
      setSaved: (opportunityId, saved) => run(() => repository.setSaved(opportunityId, saved)),
      setApplicationStage: (applicationId, stage) =>
        run(() => repository.setApplicationStage(applicationId, stage)),
      checkIn: (shiftId, volunteerId, code) =>
        run(() => repository.checkIn(shiftId, volunteerId, code)),
      checkOut: (shiftId, volunteerId) => run(() => repository.checkOut(shiftId, volunteerId)),
      markNoShow: (shiftId, volunteerId) => run(() => repository.markNoShow(shiftId, volunteerId)),
      cancelRegistration: (shiftId, volunteerId, reason) =>
        run(() => repository.cancelRegistration(shiftId, volunteerId, reason)),
      joinWaitlist: (shiftId, volunteerId, role) =>
        run(() => repository.joinWaitlist(shiftId, volunteerId, role)),
      getCheckinCode: (shiftId) => repository.getCheckinCode(shiftId),
      autoRoster: (shiftIds, options) => repository.autoRoster(shiftIds, options),
      getRosterPolicy: () => repository.getRosterPolicy(),
      updateRosterPolicy: (policy) => repository.updateRosterPolicy(policy),
      explainRosterChoice: (shiftIds, options, candidateId, slotId) =>
        repository.explainRosterChoice(shiftIds, options, candidateId, slotId),
      applyRoster: (shiftId, assignments) =>
        run(() => repository.applyRoster(shiftId, assignments)),
      detectDisruptions: () => repository.detectDisruptions(),
      planRecovery: (shiftIds, options) => repository.planRecovery(shiftIds, options),
      applyRecovery: (shiftId, changes) => run(() => repository.applyRecovery(shiftId, changes)),
      setAssignmentLock: (shiftId, volunteerId, locked) =>
        run(() => repository.setAssignmentLock(shiftId, volunteerId, locked)),
      createShiftSeries: (opportunityId, rule, roles) =>
        enqueue(async () => {
          const result = await repository.createShiftSeries(opportunityId, rule, roles);
          apply(result.snapshot);
          return result.series;
        }),
      listShiftSeries: (opportunityId) => repository.listShiftSeries(opportunityId),
      generateSeriesInstances: (seriesId) =>
        enqueue(async () => {
          const result = await repository.generateSeriesInstances(seriesId);
          apply(result.snapshot);
          return result.shifts.length;
        }),
      retimeShiftSeries: (seriesId, startsLocalTime, durationMinutes, scope) =>
        run(() => repository.retimeShiftSeries(seriesId, startsLocalTime, durationMinutes, scope)),
      deleteShiftSeries: (seriesId) => run(() => repository.deleteShiftSeries(seriesId)),
      recommendReplacement: (shiftId, role) => repository.recommendReplacement(shiftId, role),
      listNotificationRules: () => repository.listNotificationRules(),
      updateNotificationRule: (ruleId, patch) => repository.updateNotificationRule(ruleId, patch),
      queueDueReminders: () => repository.queueDueReminders(),
      retentionSignals: () => repository.retentionSignals(),
      volunteerInsight: (volunteerId) => repository.volunteerInsight(volunteerId),
      engagementMetrics: () => repository.engagementMetrics(),
      credentialReadiness: () => repository.credentialReadiness(),
      saveReportView: (name, scope, filtersJson) =>
        run(() => repository.saveReportView(name, scope, filtersJson)),
      promoteWaitlist: (shiftId, volunteerId) =>
        run(() => repository.promoteWaitlist(shiftId, volunteerId)),
      reviewHours: (entryId, decision) => run(() => repository.reviewHours(entryId, decision)),
      updateSettings: (patch) => run(() => repository.updateSettings(patch)),
      createOpportunity: (input) =>
        enqueue(async () => {
          const result = await repository.createOpportunity(input);
          apply(result.snapshot);
          return result.opportunity;
        }),
      registerForShift: (shiftId, volunteerId, role) =>
        run(() => repository.registerForShift(shiftId, volunteerId, role)),
      saveVolunteerProfile: (patch) => run(() => repository.saveVolunteerProfile(patch)),
      resetDemo: () => run(() => repository.resetDemo()),
      createBackup: (note) =>
        enqueue(async () => {
          const next = await repository.createBackup(note);
          setBackups(next);
          return next;
        }),
      restoreBackup: (id) =>
        enqueue(async () => {
          const result = await repository.restoreBackup(id);
          setBackups(result.backups);
          apply(result.snapshot);
          return result;
        }),
      previewVolunteerImport: (text) => repository.previewVolunteerImport(text),
      applyVolunteerImport: (text) =>
        enqueue(async () => {
          const summary = await repository.applyVolunteerImport(text);
          // The refreshed snapshot carries the new roster, so the list a
          // coordinator is looking at shows the people they just added.
          apply(await repository.getSnapshot());
          return summary;
        }),
      exportVolunteerRoster: () => repository.exportVolunteerRoster(),
    }),
    [apply, repository, run],
  );

  const value = useMemo<WorkspaceSessionValue | null>(() => {
    if (!session) return null;
    // Apply the timezone before children format their first timestamp, so a
    // settings change never leaves a stale clock in the tree.
    setDisplayTimeZone(session.settings.timezone);
    return { workspace: visibleWorkspace, session, backups, actions };
  }, [visibleWorkspace, session, backups, actions]);

  if (!value) {
    return (
      <div
        role={error ? "alert" : "status"}
        style={{ padding: 32, fontFamily: "system-ui, sans-serif", color: "var(--text-primary)" }}
      >
        {error ? `CivicFlow could not open the workspace: ${error}` : "Opening workspace…"}
      </div>
    );
  }

  return (
    <WorkspaceSessionContext.Provider value={value}>
      <WorkspaceScopeProvider value={organizationId || "no-organization"}>
        {error ? (
          <p
            role="alert"
            style={{
              margin: 0,
              padding: "8px 16px",
              background: "var(--tone-red-soft)",
              color: "var(--tone-red-ink)",
              font: "500 12px system-ui, sans-serif",
            }}
          >
            {error}
          </p>
        ) : null}
        {children}
      </WorkspaceScopeProvider>
    </WorkspaceSessionContext.Provider>
  );
}

export function useWorkspace(): WorkspaceSessionValue {
  const value = useContext(WorkspaceSessionContext);
  if (!value) throw new Error("useWorkspace must be used inside WorkspaceSessionProvider");
  return value;
}
