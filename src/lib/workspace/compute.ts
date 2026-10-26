import { addDays, differenceInCalendarDays, format, parseISO, startOfWeek } from "date-fns";
import { t } from "../i18n";
import { formatTime, formatWeekday } from "./selectors";
import type {
  AttentionItem,
  CoverageDay,
  DemoWorkspace,
  MissionControlSummary,
  Shift,
} from "../../types/domain";

/** Seat fill for the Monday–Sunday week that contains the demo clock. */
export function weeklyCoverage(shifts: Shift[], demoNow: string): CoverageDay[] {
  const start = startOfWeek(parseISO(demoNow), { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, offset) => {
    const date = addDays(start, offset);
    const isoDate = format(date, "yyyy-MM-dd");
    const dayShifts = shifts.filter((shift) => shift.startsAt.slice(0, 10) === isoDate);
    const capacity = dayShifts.reduce((total, shift) => total + shift.capacity, 0);
    const confirmed = dayShifts.reduce((total, shift) => total + shift.confirmed, 0);
    return {
      // Keys and labels stay English in the read model. The card turns them
      // into the active language at render time so a locale switch never
      // leaves a cached English label behind.
      key: format(date, "EEE").toLowerCase() as CoverageDay["key"],
      label: format(date, "EEE d"),
      capacity,
      confirmed,
      percent: capacity === 0 ? 0 : Math.round((confirmed / capacity) * 100),
    };
  });
}

export function isUpcoming(shift: Shift, demoNow: string): boolean {
  return parseISO(shift.startsAt).getTime() > parseISO(demoNow).getTime();
}

/**
 * Coverage health = filled required role slots / required role slots across the
 * upcoming window. Seat coverage is reported separately on the schedule bars, so
 * the two numbers are never conflated. See docs/METRICS.md.
 */
export function roleCoveragePercent(shifts: Shift[], demoNow: string): number {
  const upcoming = shifts.filter((shift) => isUpcoming(shift, demoNow));
  const required = upcoming.reduce(
    (total, shift) => total + shift.roles.reduce((sum, role) => sum + role.required, 0),
    0,
  );
  const filled = upcoming.reduce(
    (total, shift) => total + shift.roles.reduce((sum, role) => sum + role.filled, 0),
    0,
  );
  // Nothing scheduled means nothing is covered yet. A new workspace should not
  // read as fully staffed before its first shift exists.
  if (required === 0) return 0;
  return Math.round((filled / required) * 100);
}

function dayLabel(iso: string): string {
  return `${formatWeekday(iso)} ${formatTime(iso)}`;
}

export function deriveAttention(workspace: DemoWorkspace, limit = 3): AttentionItem[] {
  const items: AttentionItem[] = [];
  const now = parseISO(workspace.demoNow);

  for (const shift of workspace.shifts) {
    const start = parseISO(shift.startsAt);
    const daysOut = differenceInCalendarDays(start, now);
    if (start.getTime() <= now.getTime() || daysOut > 14) continue;

    const opportunity = workspace.opportunities.find((o) => o.id === shift.opportunityId);
    if (!opportunity) continue;

    const missingRole = shift.roles.find((role) => role.filled < role.required);
    if (missingRole) {
      const missing = missingRole.required - missingRole.filled;
      items.push({
        id: `${shift.id}-${missingRole.name}`,
        opportunityId: opportunity.id,
        title: opportunity.title,
        detail:
          missing === 1
            ? `${missingRole.name} ${t("missing")} · ${dayLabel(shift.startsAt)}`
            : `${missing} ${missingRole.name} ${t("slots open")} · ${dayLabel(shift.startsAt)}`,
        cause: opportunity.cause,
        severity: daysOut <= 5 ? "critical" : "warning",
        href: `/coordinator/coverage?shift=${shift.id}`,
        sortKey: shift.startsAt,
      });
      continue;
    }

    // Seat gaps only earn attention when the shift is genuinely thin. A single
    // open seat two weeks out is normal pipeline, not an alarm.
    const seatsOpen = shift.capacity - shift.confirmed;
    const fillPercent = (shift.confirmed / shift.capacity) * 100;
    if (seatsOpen > 0 && fillPercent < 75) {
      items.push({
        id: `${shift.id}-seats`,
        opportunityId: opportunity.id,
        title: opportunity.title,
        detail: `${seatsOpen} ${t(seatsOpen === 1 ? "spot" : "spots")} ${t("open")} · ${dayLabel(shift.startsAt)}`,
        cause: opportunity.cause,
        severity: "warning",
        href: `/coordinator/coverage?shift=${shift.id}`,
        sortKey: shift.startsAt,
      });
    }
  }

  return items.sort((a, b) => a.sortKey.localeCompare(b.sortKey)).slice(0, limit);
}

export function buildMissionControl(
  workspace: DemoWorkspace,
  readNotificationIds: string[] = [],
  role: "coordinator" | "volunteer" = "coordinator",
): MissionControlSummary {
  const upcoming = workspace.shifts.filter((shift) => isUpcoming(shift, workspace.demoNow));
  const attention = deriveAttention(workspace);
  const unread = workspace.notifications.filter((notification) => {
    const audience = notification.href.startsWith("/volunteer") ? "volunteer" : "coordinator";
    return (
      audience === role && !notification.readAt && !readNotificationIds.includes(notification.id)
    );
  }).length;

  return {
    coordinatorName: workspace.coordinator.name,
    firstName: workspace.coordinator.firstName,
    organizationName: workspace.organization.name,
    demoNow: workspace.demoNow,
    activeVolunteers: workspace.impact.activeVolunteers,
    coveragePercent: roleCoveragePercent(workspace.shifts, workspace.demoNow),
    hoursThisMonth: workspace.impact.hoursThisMonth,
    upcomingShifts: upcoming.length,
    attentionCount: attention.length,
    coverageDays: weeklyCoverage(workspace.shifts, workspace.demoNow),
    attention,
    recentActivity: workspace.recentActivity,
    impact: workspace.impact,
    unreadNotifications: unread,
    photos: [
      "/media/community-strip-1.jpg",
      "/media/community-strip-2.jpg",
      "/media/community-strip-3.jpg",
    ],
  };
}
