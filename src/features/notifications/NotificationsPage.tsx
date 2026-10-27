import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CheckCheck,
  Clock3,
  Mail,
  ShieldAlert,
  Users,
} from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  Page,
  PageHeader,
  Tabs,
  Toggle,
} from "../../components/ui";
import { t } from "../../lib/i18n";
import { useMarkNotificationRead, useNotifications } from "../../lib/workspace/queries";
import { useWorkspace } from "../../lib/workspace/session";
import type { DemoWorkspace, NotificationItem } from "../../types/domain";
import {
  currentVolunteer,
  formatDate,
  formatDateTime,
  formatMinutes,
  formatTime,
  getCoverageRows,
  getCredentials,
  getHoursQueue,
  getHoursSummary,
  getMatches,
  getUpcomingForVolunteer,
  getUpcomingShiftRows,
  opportunityById,
} from "../../lib/workspace/selectors";
import styles from "./NotificationsPage.module.css";

type FeedKind = NotificationItem["kind"];
type FeedSource = "seed" | "derived";
type FilterTab = "all" | "priority" | "unread";

interface FeedItem {
  id: string;
  source: FeedSource;
  kind: FeedKind;
  title: string;
  body: string;
  priority: "high" | "normal";
  createdAt: string;
  href: string;
  actionLabel: string;
  entity: string;
  unread: boolean;
}

interface NotificationPreference {
  key: string;
  label: string;
  hint: string;
}

const PREFERENCES: NotificationPreference[] = [
  { key: "shiftChanges", label: "Shift changes", hint: "Time, location, or role updates" },
  { key: "waitlist", label: "Waitlist updates", hint: "Promotions and open seats" },
  { key: "hours", label: "Hours & verification", hint: "Reviews, approvals, and records" },
  { key: "recommendations", label: "Recommendations", hint: "New matches for your interests" },
];

const PREFERENCE_KEY = "civicflow.notification-prefs.v1";

function loadPreferences(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(PREFERENCE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") {
      return Object.fromEntries(
        PREFERENCES.map((preference) => [
          preference.key,
          Boolean((parsed as Record<string, unknown>)[preference.key] ?? true),
        ]),
      );
    }
  } catch {
    // Preferences are a convenience; defaults still apply.
  }
  return Object.fromEntries(PREFERENCES.map((preference) => [preference.key, true]));
}

const KIND_META: Record<
  FeedKind,
  { label: string; icon: typeof Bell; color: string; soft: string }
> = {
  coverage: {
    label: "Coverage",
    icon: AlertTriangle,
    color: "var(--color-red)",
    soft: "var(--tone-red-soft)",
  },
  waitlist: {
    label: "Waitlist",
    icon: Users,
    color: "var(--color-green)",
    soft: "var(--tone-green-soft)",
  },
  hours: {
    label: "Hours",
    icon: Clock3,
    color: "var(--color-violet)",
    soft: "var(--tone-violet-soft)",
  },
  credential: {
    label: "Credential",
    icon: ShieldAlert,
    color: "var(--color-orange)",
    soft: "var(--tone-amber-soft)",
  },
  shift: {
    label: "Shift change",
    icon: CalendarClock,
    color: "var(--action-primary)",
    soft: "var(--color-cobalt-soft)",
  },
};

function seedAction(kind: FeedKind): string {
  if (kind === "coverage") return t("Open coverage");
  if (kind === "waitlist") return t("View schedule");
  if (kind === "hours") return t("Review hours");
  if (kind === "credential") return t("Review credential");
  return t("View shift");
}

function seedEntity(
  notification: NotificationItem,
  fallback: string,
  workspace: DemoWorkspace,
): string {
  if (notification.kind === "coverage" || notification.kind === "waitlist") {
    return opportunityById("opp-food", workspace)?.title ?? fallback;
  }
  if (notification.kind === "hours") return t("Hours & verification");
  if (notification.kind === "credential") return t("Credentials & skills");
  return t("Schedule");
}

function priorityBadge(priority: "high" | "normal") {
  return t(priority === "high" ? "Priority" : "Standard");
}

export function NotificationsPage() {
  const location = useLocation();
  const isCoordinator = location.pathname.startsWith("/coordinator");
  const { workspace, session, backups } = useWorkspace();
  const volunteer = currentVolunteer(workspace);
  const role = isCoordinator ? "coordinator" : "volunteer";
  const { data: notifications = [], isLoading } = useNotifications(role);
  const markRead = useMarkNotificationRead(role);
  const [tab, setTab] = useState<FilterTab>("all");
  const [readIds, setReadIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preferences, setPreferences] = useState(loadPreferences);
  const [announcement, setAnnouncement] = useState("");

  const baseFeed = useMemo<FeedItem[]>(() => {
    const seed: FeedItem[] = notifications.map((notification) => ({
      id: `seed-${notification.id}`,
      source: "seed",
      kind: notification.kind,
      title: notification.title,
      body: notification.body,
      priority: notification.priority,
      createdAt: notification.createdAt,
      href: notification.href,
      actionLabel: seedAction(notification.kind),
      entity: seedEntity(notification, workspace.organization.name, workspace),
      unread: !notification.readAt,
    }));

    const derived: FeedItem[] = [];

    if (isCoordinator) {
      const coverage =
        getCoverageRows(workspace).find((row) => row.status === "critical") ??
        getCoverageRows(workspace).find((row) => row.status === "at-risk");
      if (coverage) {
        const missing = coverage.row.shift.roles.find((role) => role.filled < role.required);
        derived.push({
          id: "derived-coverage-risk",
          source: "derived",
          kind: "coverage",
          title: missing
            ? t("{role} still needed", { role: missing.name })
            : t("Shift coverage is thin"),
          body: `${coverage.row.opportunity.title} · ${formatDate(coverage.row.shift.startsAt)} at ${formatTime(
            coverage.row.shift.startsAt,
          )}`,
          priority: coverage.status === "critical" ? "high" : "normal",
          createdAt: workspace.demoNow,
          href: `/coordinator/shifts/${coverage.row.shift.id}`,
          actionLabel: t("Open roster"),
          entity: coverage.row.opportunity.title,
          unread: true,
        });
      }

      const queue = getHoursQueue(session, workspace);
      if (queue.length > 0) {
        derived.push({
          id: "derived-hours-queue",
          source: "derived",
          kind: "hours",
          title: t("{count} hour submissions need review", { count: queue.length }),
          body: t("Oldest request: {name} · {date}", {
            name: queue[queue.length - 1].volunteer.name,
            date: formatDate(queue[queue.length - 1].date),
          }),
          priority: "normal",
          createdAt: workspace.demoNow,
          href: "/coordinator/hours",
          actionLabel: t("Review hours"),
          entity: t("Hours & verification"),
          unread: true,
        });
      }

      const latestBackup = backups[0];
      // A first-launch snapshot protects nothing; telling a coordinator about it
      // would open the inbox with an event they did not cause and cannot act on.
      if (latestBackup && latestBackup.rows > 0)
        derived.push({
          id: "derived-backup",
          source: "derived",
          kind: "shift",
          title: t("Local backup verified"),
          body: t("{count} rows protected · {date}", {
            count: latestBackup.rows,
            date: formatDate(latestBackup.createdAt),
          }),
          priority: "normal",
          createdAt: latestBackup.createdAt,
          href: "/coordinator/backup",
          actionLabel: t("View backups"),
          entity: t("Backup & recovery"),
          unread: true,
        });
    } else {
      const nextShift =
        getUpcomingForVolunteer(volunteer.id, session, workspace)[0] ??
        getUpcomingShiftRows(workspace)[0];
      if (nextShift) {
        derived.push({
          id: "derived-next-shift",
          source: "derived",
          kind: "shift",
          title: t("Your next shift is coming up"),
          body: `${nextShift.opportunity.title} · ${formatDate(nextShift.shift.startsAt)} at ${formatTime(
            nextShift.shift.startsAt,
          )}`,
          priority: "normal",
          createdAt: workspace.demoNow,
          href: `/volunteer/shifts/${nextShift.shift.id}`,
          actionLabel: t("View shift"),
          entity: nextShift.opportunity.title,
          unread: true,
        });
      }

      const credential = getCredentials(session, workspace).find(
        (row) => row.volunteer.id === volunteer.id,
      );
      if (credential) {
        derived.push({
          id: "derived-credential",
          source: "derived",
          kind: "credential",
          title: t(
            credential.status === "expired"
              ? "Credential needs attention"
              : "A credential is expiring soon",
          ),
          body: `${credential.name} · ${t(
            credential.status === "expired" ? "expired" : "expires",
          )} ${credential.expiresAt ? formatDate(credential.expiresAt) : t("soon")}`,
          priority: credential.status === "expired" ? "high" : "normal",
          createdAt: workspace.demoNow,
          href: "/volunteer/profile",
          actionLabel: t("Review profile"),
          entity: t("Credentials & skills"),
          unread: true,
        });
      }

      const match = getMatches(volunteer, 1, workspace, session.createdOpportunities)[0];
      if (match) {
        derived.push({
          id: "derived-recommendation",
          source: "derived",
          kind: "shift",
          title: t("New recommendation for you"),
          body: t("{program} is a {score}% match", {
            program: match.opportunity.title,
            score: match.score,
          }),
          priority: "normal",
          createdAt: workspace.demoNow,
          href: `/volunteer/opportunities/${match.opportunity.slug}`,
          actionLabel: t("Explore"),
          entity: match.opportunity.title,
          unread: true,
        });
      }

      const hours = getHoursSummary(volunteer.id, session, workspace);
      if (hours.pendingMinutes > 0) {
        derived.push({
          id: "derived-hours-pending",
          source: "derived",
          kind: "hours",
          title: t("Hours awaiting review"),
          body: t("{duration} submitted · verification follows approval", {
            duration: formatMinutes(hours.pendingMinutes),
          }),
          priority: "normal",
          createdAt: workspace.demoNow,
          href: "/volunteer/hours",
          actionLabel: t("View hours"),
          entity: t("My hours"),
          unread: true,
        });
      }
    }

    return [...seed, ...derived].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [backups, isCoordinator, notifications, session, volunteer, workspace]);

  const items = useMemo<FeedItem[]>(
    () =>
      baseFeed.map((item) => ({
        ...item,
        unread: item.unread && !readIds.includes(item.id),
      })),
    [baseFeed, readIds],
  );

  const unreadCount = items.filter((item) => item.unread).length;
  const priorityCount = items.filter((item) => item.priority === "high").length;
  const filtered = items.filter((item) => {
    if (tab === "priority") return item.priority === "high";
    if (tab === "unread") return item.unread;
    return true;
  });
  const todayKey = workspace.demoNow.slice(0, 10);
  const groups = [
    {
      label: "Today",
      entries: filtered.filter((item) => item.createdAt.slice(0, 10) === todayKey),
    },
    {
      label: "Earlier",
      entries: filtered.filter((item) => item.createdAt.slice(0, 10) !== todayKey),
    },
  ].filter((group) => group.entries.length > 0);
  const selected = items.find((item) => item.id === selectedId) ?? filtered[0] ?? items[0];
  const selectedMeta = selected ? KIND_META[selected.kind] : KIND_META.shift;
  const SelectedIcon = selectedMeta.icon;

  function markOne(item: FeedItem) {
    if (!item.unread) return;
    setReadIds((current) => (current.includes(item.id) ? current : [...current, item.id]));
    if (item.source === "seed") {
      markRead.mutate(item.id.replace(/^seed-/, ""));
    }
  }

  function selectItem(item: FeedItem) {
    setSelectedId(item.id);
    markOne(item);
    setAnnouncement(t("Selected {title}.", { title: item.title }));
  }

  async function markAllAsRead() {
    const unread = items.filter((item) => item.unread);
    if (unread.length === 0) return;
    setReadIds(items.map((item) => item.id));
    await Promise.all(
      unread
        .filter((item) => item.source === "seed")
        .map((item) => markRead.mutateAsync(item.id.replace(/^seed-/, "")).catch(() => undefined)),
    );
    setAnnouncement(
      t(
        unread.length === 1
          ? "Marked {count} notification as read."
          : "Marked {count} notifications as read.",
        { count: unread.length },
      ),
    );
  }

  function updatePreference(key: string, value: boolean) {
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    try {
      localStorage.setItem(PREFERENCE_KEY, JSON.stringify(next));
    } catch {
      // Storage may be unavailable; the toggle still works for this session.
    }
    setAnnouncement(t("Notification preferences saved on this device."));
  }

  return (
    <Page>
      <PageHeader
        eyebrow={isCoordinator ? "Coordinator inbox" : "Your inbox"}
        title="Notifications"
        description="Important changes first. Everything else stays easy to scan."
        backTo={isCoordinator ? "/coordinator/mission-control" : "/volunteer/home"}
        backLabel={isCoordinator ? "Mission Control" : "Home"}
        actions={
          <>
            <Badge tone={unreadCount > 0 ? "cobalt" : "neutral"} dot>
              {t("{count} unread", { count: unreadCount })}
            </Badge>
            <Button
              variant="secondary"
              icon={<CheckCheck size={14} aria-hidden="true" />}
              onClick={() => void markAllAsRead()}
              disabled={unreadCount === 0 || markRead.isPending}
            >
              Mark all as read
            </Button>
          </>
        }
      />

      <div className={styles.toolbarRow}>
        <Tabs
          items={[
            { id: "all", label: "All", count: items.length },
            { id: "priority", label: "Priority", count: priorityCount },
            { id: "unread", label: "Unread", count: unreadCount },
          ]}
          value={tab}
          onChange={(value) => setTab(value as FilterTab)}
          label="Filter notifications"
        />
        <p className={styles.toolbarHint}>
          {isCoordinator
            ? "Coverage, hours, and workspace events land here."
            : "Shifts, hours, and recommendations for your service."}
        </p>
      </div>

      <p className={styles.liveRegion} role="status" aria-live="polite">
        {announcement}
      </p>

      <div className={styles.layout}>
        <Card className={styles.feedCard} padding="compact">
          {isLoading ? <p className={styles.loading}>Loading notifications…</p> : null}
          {!isLoading && filtered.length === 0 ? (
            <EmptyState
              title={tab === "unread" ? "You are all caught up" : "No notifications here"}
              copy={
                tab === "unread"
                  ? "New alerts will appear as shifts, hours, and coverage change."
                  : "Switch tabs to see earlier notifications, or check back after your next shift."
              }
              action={
                <Button variant="secondary" onClick={() => setTab("all")}>
                  Show all notifications
                </Button>
              }
            />
          ) : null}

          {groups.map((group) => (
            <section
              className={styles.group}
              key={group.label}
              aria-label={t("{group} notifications", { group: t(group.label) })}
            >
              <h2 className={styles.groupTitle}>{t(group.label)}</h2>
              <ul className={styles.list}>
                {group.entries.map((item) => {
                  const meta = KIND_META[item.kind];
                  const Icon = meta.icon;
                  const active = selected?.id === item.id;
                  return (
                    <li
                      key={item.id}
                      className={[
                        styles.row,
                        active ? styles.rowActive : "",
                        item.unread ? styles.rowUnread : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <button
                        type="button"
                        className={styles.selectButton}
                        onClick={() => selectItem(item)}
                        aria-pressed={active}
                        aria-label={
                          item.unread ? t("Unread: {title}", { title: item.title }) : item.title
                        }
                      >
                        <span
                          className={styles.kindIcon}
                          style={{ background: meta.soft, color: meta.color }}
                          aria-hidden="true"
                        >
                          <Icon size={16} strokeWidth={2} />
                        </span>
                        <span className={styles.copy}>
                          <span className={styles.titleLine}>
                            {item.unread ? (
                              <span className={styles.unreadDot} aria-hidden="true" />
                            ) : null}
                            <span className={styles.title}>{item.title}</span>
                            {item.priority === "high" ? (
                              <span className={styles.priorityFlag}>Priority</span>
                            ) : null}
                          </span>
                          <span className={styles.body}>{item.body}</span>
                        </span>
                      </button>
                      <span className={styles.rowMeta}>
                        <time className={styles.time} dateTime={item.createdAt}>
                          {format(parseISO(item.createdAt), "h:mm a")}
                        </time>
                        <Link
                          className={styles.quickAction}
                          to={item.href}
                          onClick={() => markOne(item)}
                        >
                          {item.actionLabel}
                        </Link>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </Card>

        <aside className={styles.side} aria-label="Notification detail and preferences">
          {selected ? (
            <Card className={styles.selectedCard}>
              <p className={styles.sectionLabel}>Selected notification</p>
              <div className={styles.selectedTop}>
                <Badge tone={selected.priority === "high" ? "red" : "neutral"}>
                  {priorityBadge(selected.priority)}
                </Badge>
                <span className={styles.selectedKind}>
                  <SelectedIcon size={13} aria-hidden="true" />
                  {t(selectedMeta.label)}
                </span>
              </div>
              <h2 className={styles.selectedTitle}>{selected.title}</h2>
              <p className={styles.selectedEntity}>{selected.entity}</p>
              <dl className={styles.details}>
                <div>
                  <dt>Received</dt>
                  <dd>{formatDateTime(selected.createdAt)}</dd>
                </div>
                <div>
                  <dt>Priority</dt>
                  <dd>{t(selected.priority === "high" ? "Act today" : "When convenient")}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{t(selected.unread ? "Unread" : "Read")}</dd>
                </div>
              </dl>
              <p className={styles.selectedBody}>{selected.body}</p>
              <ButtonLink
                to={selected.href}
                variant="primary"
                size="large"
                className={styles.selectedAction}
              >
                {selected.actionLabel}
              </ButtonLink>
              <Button
                variant="ghost"
                onClick={() => markOne(selected)}
                disabled={!selected.unread}
                className={styles.readButton}
              >
                {t(selected.unread ? "Mark as read" : "Marked as read")}
              </Button>
            </Card>
          ) : (
            <Card>
              <EmptyState
                title="No notification selected"
                copy="Choose a notification to read its details."
              />
            </Card>
          )}

          <Card className={styles.preferences}>
            <div className={styles.preferenceHeading}>
              <span className={styles.preferenceIcon} aria-hidden="true">
                <Mail size={15} />
              </span>
              <div>
                <h2 className={styles.preferencesTitle}>Notification preferences</h2>
                <p className={styles.preferencesSub}>Saved locally for this workspace.</p>
              </div>
            </div>
            {PREFERENCES.map((preference) => (
              <Toggle
                key={preference.key}
                label={preference.label}
                hint={preference.hint}
                checked={preferences[preference.key] ?? true}
                onChange={(checked) => updatePreference(preference.key, checked)}
              />
            ))}
            <p className={styles.preferenceNote}>Notification preferences saved on this device.</p>
          </Card>
        </aside>
      </div>
    </Page>
  );
}
