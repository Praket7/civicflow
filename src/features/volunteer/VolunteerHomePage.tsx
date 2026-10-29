import { addDays, format, parseISO, startOfWeek } from "date-fns";
import {
  ArrowRight,
  Bell,
  Bookmark,
  CalendarDays,
  CheckCircle2,
  Compass,
  HeartHandshake,
  MapPin,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Avatar, Badge, ButtonLink, Card, Page, SectionHeader } from "../../components/ui";
import { t } from "../../lib/i18n";
import styles from "./VolunteerHomePage.module.css";
import { useNotifications } from "../../lib/workspace/queries";
import { useWorkspace } from "../../lib/workspace/session";
import {
  CAUSE_LABELS,
  currentVolunteer,
  formatDate,
  formatDateRange,
  formatDayNumber,
  formatLongDate,
  formatMinutes,
  formatNumber,
  formatTime,
  formatWeekday,
  getMatches,
  getHoursSummary,
  getUpcomingForVolunteer,
  relativeDayLabel,
  timeRange,
  volunteerById,
} from "../../lib/workspace/selectors";

const dayTones = ["teal", "cobalt", "violet", "amber", "coral", "teal", "violet"];

export function VolunteerHomePage() {
  const { workspace, session, actions } = useWorkspace();
  const volunteer =
    volunteerById(workspace.currentVolunteerId, workspace) ?? currentVolunteer(workspace);
  const upcoming = getUpcomingForVolunteer(volunteer.id, session, workspace);
  const next = upcoming[0];
  const summary = getHoursSummary(volunteer.id, session, workspace);
  const matches = getMatches(volunteer, 3, workspace, session.createdOpportunities);
  const { data: notifications = [] } = useNotifications("volunteer");

  const hours = Math.round((summary.totalMinutes / 60) * 10) / 10;
  const events = summary.events;
  const unread = notifications.filter((notification) => !notification.readAt).length;
  const priority = [...notifications]
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority === "high" ? -1 : 1;
      return b.createdAt.localeCompare(a.createdAt);
    })
    .slice(0, 3);

  const weekStart = startOfWeek(parseISO(workspace.now), { weekStartsOn: 1 });
  const week = Array.from({ length: 7 }, (_, offset) => {
    const date = addDays(weekStart, offset);
    const isoDate = format(date, "yyyy-MM-dd");
    const row = upcoming.find((entry) => entry.shift.startsAt.slice(0, 10) === isoDate);
    return {
      label: formatWeekday(date, true),
      short: formatWeekday(date),
      day: formatDayNumber(date),
      isoDate,
      row,
      tone: dayTones[offset],
    };
  });

  return (
    <Page>
      <header className={styles.intro}>
        <div>
          <p className={styles.eyebrow}>{formatLongDate(parseISO(workspace.now))}</p>
          <h1 className={styles.greeting}>
            Good morning, <span className={styles.greetingName}>{volunteer.firstName}.</span>
          </h1>
          <p className={styles.introLine}>
            {next
              ? t("Your next shift is {day} at {time}.", {
                  day: relativeDayLabel(next.shift.startsAt).toLowerCase(),
                  time: formatTime(next.shift.startsAt),
                })
              : t("No shifts booked yet. Find a cause that fits your week.")}
          </p>
        </div>
        <div className={styles.introActions}>
          <ButtonLink
            to="/volunteer/discover"
            variant="secondary"
            size="small"
            icon={<Compass size={13} aria-hidden="true" />}
          >
            Discover
          </ButtonLink>
          <ButtonLink
            to="/volunteer/schedule"
            variant="primary"
            size="small"
            icon={<CalendarDays size={13} aria-hidden="true" />}
          >
            My schedule
          </ButtonLink>
        </div>
      </header>

      <div className={styles.topGrid}>
        <section className={styles.nextCard} aria-labelledby="next-shift-title">
          {next ? (
            <>
              <img
                className={styles.nextImage}
                src={next.opportunity.image}
                alt={next.opportunity.imageAlt}
              />
              <div className={styles.nextOverlay} aria-hidden="true" />
              <div className={styles.nextTop}>
                <span className={styles.upNext}>Up next</span>
                <Badge tone="lime" dot onMedia>
                  {CAUSE_LABELS[next.opportunity.cause]}
                </Badge>
              </div>
              <div className={styles.nextBody}>
                <p className={styles.nextWhen}>
                  {formatDate(next.shift.startsAt)} ·{" "}
                  {timeRange(next.shift.startsAt, next.shift.endsAt)}
                </p>
                <h2 className={styles.nextTitle} id="next-shift-title">
                  {next.opportunity.title}
                </h2>
                <p className={styles.nextWhere}>
                  <MapPin size={13} aria-hidden="true" />
                  {next.opportunity.address}
                </p>
                <div className={styles.nextActions}>
                  <ButtonLink
                    to={`/volunteer/shifts/${next.shift.id}`}
                    variant="lime"
                    size="small"
                    icon={<ArrowRight size={13} aria-hidden="true" />}
                  >
                    View shift details
                  </ButtonLink>
                  <ButtonLink
                    to="/volunteer/check-in"
                    variant="secondary"
                    size="small"
                    className={styles.checkInLink}
                  >
                    Check in
                  </ButtonLink>
                </div>
              </div>
            </>
          ) : (
            <div className={styles.nextEmpty}>
              <p className={styles.upNext}>Open this week</p>
              <h2 className={styles.nextTitle}>Your next shift starts with one click.</h2>
              <p className={styles.nextWhere}>
                Browse roles that match your skills, availability, and causes.
              </p>
              <ButtonLink to="/volunteer/discover" variant="lime" size="small">
                Find an opportunity
              </ButtonLink>
            </div>
          )}
        </section>

        <Card className={styles.impactCard}>
          <SectionHeader
            title="Your impact this month"
            action={<Link to="/volunteer/impact">View impact</Link>}
          />
          <div className={styles.impactStats}>
            <div className={styles.impactStat}>
              <div className={styles.impactValue}>{formatNumber(hours)}</div>
              <div className={styles.impactLabel}>Hours recorded</div>
            </div>
            <div className={styles.impactStat}>
              <div className={styles.impactValue}>{events}</div>
              <div className={styles.impactLabel}>Shifts worked</div>
            </div>
          </div>
          <dl className={styles.impactFacts}>
            <div>
              <dt>Verified</dt>
              <dd>{formatMinutes(summary.verifiedMinutes)}</dd>
            </div>
            <div>
              <dt>Awaiting review</dt>
              <dd>{formatMinutes(summary.pendingMinutes)}</dd>
            </div>
          </dl>
          <p className={styles.impactFoot}>
            {volunteer.attendanceRate}% attendance · {summary.events} programs in your service
            record
          </p>
        </Card>
      </div>

      {matches.length > 0 ? (
        <section aria-labelledby="recommended-title">
          <SectionHeader
            title="Recommended for you"
            id="recommended-title"
            subtitle="Based on your skills, availability, and the causes you chose."
            action={<Link to="/volunteer/discover">Discover all</Link>}
          />
          <div className={styles.recommendations}>
            {matches.map(({ opportunity, score, reasons }) => {
              const saved = session.savedOpportunityIds.includes(opportunity.id);
              return (
                <article key={opportunity.id} className={styles.recCard}>
                  <div className={styles.recMedia}>
                    <img src={opportunity.image} alt={opportunity.imageAlt} loading="lazy" />
                    <span className={styles.matchBadge}>
                      <Badge tone="dark" onMedia>
                        {t("{score}% match", { score })}
                      </Badge>
                    </span>
                    <button
                      type="button"
                      className={styles.saveButton}
                      aria-pressed={saved}
                      aria-label={t(
                        saved
                          ? "Remove {program} from saved opportunities"
                          : "Save {program} to saved opportunities",
                        { program: opportunity.title },
                      )}
                      onClick={() => actions.setSaved(opportunity.id, !saved)}
                    >
                      <Bookmark
                        size={14}
                        fill={saved ? "currentColor" : "none"}
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                  <div className={styles.recBody}>
                    <p className={styles.recCause}>{CAUSE_LABELS[opportunity.cause]}</p>
                    <h3 className={styles.recTitle}>
                      <Link to={`/volunteer/opportunities/${opportunity.slug}`}>
                        {opportunity.title}
                      </Link>
                    </h3>
                    <p className={styles.recReason}>
                      {reasons[0] ?? "Upcoming shifts fit your week."}
                    </p>
                    <div className={styles.recFoot}>
                      <Link
                        className={styles.recLink}
                        to={`/volunteer/opportunities/${opportunity.slug}`}
                      >
                        View
                        <ArrowRight size={13} aria-hidden="true" />
                      </Link>
                      <span className={styles.recMeta}>
                        {formatNumber(opportunity.distanceMiles)} {t("mi away")}
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}

            <aside className={styles.habitCard}>
              <span className={styles.habitEyebrow}>Next three weeks</span>
              <p className={styles.habitTitle}>
                {upcoming.length > 0
                  ? t(
                      upcoming.length === 1
                        ? "{count} shift already on your calendar."
                        : "{count} shifts already on your calendar.",
                      { count: upcoming.length },
                    )
                  : t("Your calendar is open this month.")}
              </p>
              <p className={styles.habitBody}>
                {upcoming.length > 0
                  ? t("Confirm your shift a day ahead so the coordinator can plan the route.")
                  : t("Browse open roles and book your first shift.")}
              </p>
              <Link className={styles.habitLink} to="/volunteer/schedule">
                Look at the next three weeks
                <ArrowRight size={13} aria-hidden="true" />
              </Link>
            </aside>
          </div>
        </section>
      ) : null}

      <div className={styles.bottomGrid}>
        <Card className={styles.weekCard}>
          <SectionHeader
            title="Your week"
            subtitle={formatDateRange(weekStart, addDays(weekStart, 6))}
            action={<Link to="/volunteer/schedule">Open calendar</Link>}
          />
          <div className={styles.weekStrip} role="list" aria-label="Days with your upcoming shifts">
            {week.map((day) => (
              <div className={styles.weekDay} role="listitem" key={day.isoDate}>
                <span className={styles.weekName}>{day.short}</span>
                <span className={styles.weekDate}>{day.day}</span>
                {day.row ? (
                  <Link
                    className={styles.weekShift}
                    to={`/volunteer/shifts/${day.row.shift.id}`}
                    style={{ background: `var(--color-${day.tone})` }}
                    aria-label={`${day.row.opportunity.title} on ${day.label} at ${formatTime(day.row.shift.startsAt)}`}
                  >
                    <CheckCircle2 size={12} aria-hidden="true" />
                  </Link>
                ) : (
                  <span className={styles.weekOpen} aria-hidden="true" />
                )}
                <span className={styles.weekMeta}>
                  {day.row ? formatTime(day.row.shift.startsAt) : t("Open")}
                </span>
              </div>
            ))}
          </div>
          <div className={styles.weekFoot}>
            <HeartHandshake size={14} aria-hidden="true" />
            <span>
              {upcoming.length} {t("upcoming shifts")} ·{" "}
              {formatMinutes(
                upcoming.reduce((total, row) => {
                  const start = parseISO(row.shift.startsAt);
                  const end = parseISO(row.shift.endsAt);
                  return total + Math.round((end.getTime() - start.getTime()) / 60_000);
                }, 0),
              )}{" "}
              {t("scheduled")}
            </span>
          </div>
        </Card>

        <Card className={styles.notificationsCard}>
          <SectionHeader
            title="Priority notifications"
            action={<Link to="/volunteer/notifications">View all</Link>}
          />
          {priority.length === 0 ? (
            <p className={styles.notifyEmpty}>You are all caught up.</p>
          ) : (
            <ul className={styles.notifyList}>
              {priority.map((notification, index) => (
                <li key={notification.id}>
                  <Link className={styles.notifyRow} to="/volunteer/notifications">
                    <span
                      className={styles.notifyDot}
                      data-tone={index === 0 ? "cobalt" : index === 1 ? "green" : "amber"}
                      aria-hidden="true"
                    />
                    <span className={styles.notifyCopy}>
                      <span className={styles.notifyTitle}>{notification.title}</span>
                      <span className={styles.notifyBody}>{notification.body}</span>
                    </span>
                    {!notification.readAt ? (
                      <span className={styles.unread} aria-label="Unread" />
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className={styles.notifyFoot}>
            <span className={styles.notifyCount}>
              <Bell size={13} aria-hidden="true" />
              {unread} {t("unread")}
            </span>
            <Link className={styles.notifyLink} to="/volunteer/notifications">
              Notification settings
              <ArrowRight size={12} aria-hidden="true" />
            </Link>
          </div>
        </Card>
      </div>

      <footer className={styles.pageFoot}>
        <Avatar initials={volunteer.initials} tone={volunteer.tone} size={22} />
        <span>{t("Signed in as {name} · volunteer workspace", { name: volunteer.name })}</span>
        <Link to="/volunteer/profile" className={styles.footLink}>
          Profile
        </Link>
        <Link to="/volunteer/hours" className={styles.footLink}>
          My hours
        </Link>
      </footer>
    </Page>
  );
}
