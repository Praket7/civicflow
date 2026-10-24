import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AccountRole, MissionControlSummary, NotificationItem } from "../../types/domain";
import { activeLocaleCode } from "../i18n";
import { getWorkspaceRepository } from "./repository";

const repository = getWorkspaceRepository();

export const workspaceKeys = {
  missionControl: ["mission-control"] as const,
  notifications: ["notifications"] as const,
};

export function useMissionControl() {
  return useQuery<MissionControlSummary>({
    // Attention details and weekday labels are built in the read model, so the
    // cache is scoped to the language that produced them.
    queryKey: [...workspaceKeys.missionControl, activeLocaleCode()],
    queryFn: () => repository.getMissionControl(),
    staleTime: 30_000,
  });
}

export function useNotifications(role: AccountRole) {
  return useQuery<NotificationItem[]>({
    queryKey: [...workspaceKeys.notifications, role],
    queryFn: () => repository.getNotifications(role),
    staleTime: 30_000,
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
