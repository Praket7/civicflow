import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AccountRole,
  CheckinWindow,
  CredentialReadiness,
  DisruptionReport,
  EngagementMetrics,
  MissionControlSummary,
  NotificationItem,
  NotificationRule,
  NotificationRulePatch,
  ReplacementRecommendation,
  RetentionSignal,
  ShiftSeriesRecord,
  VolunteerInsight,
} from "../../types/domain";
import { activeLocaleCode } from "../i18n";
import { getWorkspaceRepository } from "./repository";
import { useWorkspaceScope } from "./scope";

const repository = getWorkspaceRepository();

const workspaceKeys = {
  missionControl: ["mission-control"] as const,
  notifications: ["notifications"] as const,
  disruptions: ["disruptions"] as const,
  signals: ["retention-signals"] as const,
  insight: ["volunteer-insight"] as const,
  rules: ["notification-rules"] as const,
  engagement: ["engagement-metrics"] as const,
  readiness: ["credential-readiness"] as const,
  series: ["shift-series"] as const,
  replacements: ["replacement-recommendations"] as const,
  checkinWindow: ["checkin-window"] as const,
};

/**
 * Every read model a write can change. The session provider invalidates these
 * after a snapshot lands, so a rescue card or a series list is never stale.
 */
export const workspaceReadKeys: readonly (readonly string[])[] = [
  workspaceKeys.missionControl,
  workspaceKeys.notifications,
  workspaceKeys.disruptions,
  workspaceKeys.signals,
  workspaceKeys.insight,
  workspaceKeys.rules,
  workspaceKeys.engagement,
  workspaceKeys.readiness,
  workspaceKeys.series,
  workspaceKeys.replacements,
  workspaceKeys.checkinWindow,
];

export function useMissionControl() {
  const scope = useWorkspaceScope();
  return useQuery<MissionControlSummary>({
    // Labels are built in the read model, so the language is part of the key.
    queryKey: [...workspaceKeys.missionControl, scope, activeLocaleCode()],
    queryFn: () => repository.getMissionControl(),
    staleTime: 30_000,
  });
}

export function useNotifications(role: AccountRole) {
  const scope = useWorkspaceScope();
  return useQuery<NotificationItem[]>({
    queryKey: [...workspaceKeys.notifications, scope, role],
    queryFn: () => repository.getNotifications(role),
    staleTime: 30_000,
  });
}

/** What is short right now, so the rescue card never shows a stale gap. */
export function useDisruptions() {
  const scope = useWorkspaceScope();
  return useQuery<DisruptionReport>({
    queryKey: [...workspaceKeys.disruptions, scope, activeLocaleCode()],
    queryFn: () => repository.detectDisruptions(),
    staleTime: 10_000,
  });
}

/** The transparent retention rules. Recomputed per workspace and language. */
export function useRetentionSignals() {
  const scope = useWorkspaceScope();
  return useQuery<RetentionSignal[]>({
    queryKey: [...workspaceKeys.signals, scope, activeLocaleCode()],
    queryFn: () => repository.retentionSignals(),
    staleTime: 30_000,
  });
}

/** The repeating series a workspace is running, newest rule last. */
export function useShiftSeries(opportunityId?: string) {
  const scope = useWorkspaceScope();
  return useQuery<ShiftSeriesRecord[]>({
    queryKey: [...workspaceKeys.series, scope, opportunityId ?? "all"],
    queryFn: () => repository.listShiftSeries(opportunityId),
    staleTime: 15_000,
  });
}

/**
 * Who should take each open seat on a shift. One request per open role, and a
 * role whose ranking cannot be read is left out rather than failing the card.
 */
export function useReplacementRecommendations(shiftId: string, roles: string[]) {
  const scope = useWorkspaceScope();
  const roleKey = roles.join("|");
  return useQuery<ReplacementRecommendation[]>({
    queryKey: [...workspaceKeys.replacements, scope, shiftId, roleKey],
    queryFn: async () => {
      const answers = await Promise.all(
        roleKey.split("|").map(async (role) => {
          try {
            return await repository.recommendReplacement(shiftId, role);
          } catch {
            return null;
          }
        }),
      );
      return answers.filter((answer): answer is ReplacementRecommendation => answer !== null);
    },
    enabled: shiftId !== "" && roleKey !== "",
    staleTime: 15_000,
  });
}

/** The numbers a report is built to answer a question with. */
export function useEngagementMetrics() {
  const scope = useWorkspaceScope();
  return useQuery<EngagementMetrics>({
    queryKey: [...workspaceKeys.engagement, scope],
    queryFn: () => repository.engagementMetrics(),
    staleTime: 30_000,
  });
}

/** What is current, expiring, expired, and already a risk to a future shift. */
export function useCredentialReadiness() {
  const scope = useWorkspaceScope();
  return useQuery<CredentialReadiness>({
    queryKey: [...workspaceKeys.readiness, scope],
    queryFn: () => repository.credentialReadiness(),
    staleTime: 30_000,
  });
}

/** One volunteer's milestones, which only change when service is recorded. */
export function useVolunteerInsight(volunteerId: string) {
  const scope = useWorkspaceScope();
  return useQuery<VolunteerInsight>({
    queryKey: [...workspaceKeys.insight, scope, volunteerId, activeLocaleCode()],
    queryFn: () => repository.volunteerInsight(volunteerId),
    enabled: volunteerId !== "",
    staleTime: 30_000,
  });
}

export function useCheckinWindow(shiftId: string) {
  const scope = useWorkspaceScope();
  return useQuery<CheckinWindow>({
    queryKey: [...workspaceKeys.checkinWindow, scope, shiftId],
    queryFn: () => repository.checkinWindow(shiftId),
    enabled: shiftId !== "",
    staleTime: 60_000,
  });
}

export function useNotificationRules() {
  const scope = useWorkspaceScope();
  return useQuery<NotificationRule[]>({
    queryKey: [...workspaceKeys.rules, scope, activeLocaleCode()],
    queryFn: () => repository.listNotificationRules(),
    staleTime: 30_000,
  });
}

export function useUpdateNotificationRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ruleId, patch }: { ruleId: string; patch: NotificationRulePatch }) =>
      repository.updateNotificationRule(ruleId, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.rules });
    },
  });
}

export function useMarkNotificationRead(role: AccountRole) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repository.markNotificationRead(id, role),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.notifications });
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.missionControl });
    },
  });
}
