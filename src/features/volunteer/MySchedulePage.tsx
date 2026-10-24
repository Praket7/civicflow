import { useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
} from "date-fns";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CalendarRange,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  Pencil,
} from "lucide-react";
import {
  Avatar,
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  Page,
  PageHeader,
  ProgressBar,
  SectionHeader,
  Tabs,
  statusLabel,
  statusTone,
} from "../../components/ui";
import type { Cause } from "../../types/domain";
import type { RosterStatus } from "../../lib/workspace/selectors";
import {
  currentVolunteer,
  formatDate,
  formatDateTime,
  formatMinutes,
  formatTime,
  getHoursSummary,
  getRoster,
  getShiftRows,
  relativeDayLabel,
  timeRange,
} from "../../lib/workspace/selectors";
import { useNotifications } from "../../lib/workspace/queries";
import { t } from "../../lib/i18n";
import { useWorkspace } from "../../lib/workspace/session";
import styles from "./MySchedulePage.module.css";

type ViewMode = "agenda" | "week";
type ListFilter = "upcoming" | "completed" | "all";

interface MyShift {
  id: string;
  shiftId: string;
  opportunityId: string;
  title: string;
  cause: Cause;
  image: string;
  address: string;
  role: string;
  startsAt: string;
  endsAt: string;
  status: RosterStatus;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PERIOD_LABELS = { morning: "Morning", afternoon: "Afternoon", evening: "Evening" } as const;

export function MySchedulePage() {
  const { workspace, session } = useWorkspace();
  const volunteer = currentVolunteer(workspace);
  const [month, setMonth] = useState(() => parseISO(workspace.demoNow));
  const [weekAnchor, setWeekAnchor] = useState(() => parseISO(workspace.demoNow));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("agenda");
  const [filter, setFilter] = useState<ListFilter>("upcoming");
  const { data: notifications = [] } = useNotifications("volunteer");

  const myShifts = useMemo<MyShift[]>(() => {
    return getShiftRows(workspace)
      .map((row) => {
        const entry = getRoster(row.shift.id, session, workspace).find(
          (person) => person.volunteer.id === volunteer.id,
        );
        if (!entry) return undefined;
        return {
          id: row.shift.id,
          shiftId: row.shift.id,
          opportunityId: row.opportunity.id,
          title: row.opportunity.title,
          cause: row.opportunity.cause,
          image: row.opportunity.image,
          address: row.opportunity.address,
          role: entry.role,
          startsAt: row.shift.startsAt,
          endsAt: row.shift.endsAt,
          status: entry.status,
        } satisfies MyShift;
      })
      .filter((row): row is MyShift => Boolean(row))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }, [session, volunteer.id, workspace]);

  const upcoming = myShifts.filter((shift) => shift.startsAt >= workspace.demoNow);
  const completed = myShifts.filter((shift) => shift.startsAt < workspace.demoNow);
  const hours = getHoursSummary(volunteer.id, session, workspace);
  const availability = session.volunteerProfile.availability;

  const shiftsByDate = useMemo(() => {
    const map = new Map<string, MyShift[]>();
    for (const shift of myShifts) {
      const key = shift.startsAt.slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), shift]);
    }
    return map;
  }, [myShifts]);

  const monthDays = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
        end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
      }),
    [month],
  );

  const weekStart = startOfWeek(weekAnchor, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({
    start: weekStart,
    end: endOfWeek(weekStart, { weekStartsOn: 1 }),
  });

  const filtered = useMemo(() => {
    const base = filter === "upcoming" ? upcoming : filter === "completed" ? completed : myShifts;
    if (!selectedDate) return base;
    return base.filter((shift) => shift.startsAt.slice(0, 10) === selectedDate);
  }, [filter, myShifts, selectedDate, upcoming, completed]);

  const selectedDateShifts = selectedDate ? (shiftsByDate.get(selectedDate) ?? []) : [];
  const nextShift = upcoming[0];
  const notice = notifications.find(
    (notification) => notification.kind === "shift" || notification.kind === "coverage",
  );

  function chooseDay(day: Date) {
    setSelectedDate(format(day, "yyyy-MM-dd"));
    setWeekAnchor(day);
    setFilter((value) =>
      value === "completed" && day >= parseISO(workspace.demoNow) ? "upcoming" : value,
    );
    if (!isSameMonth(day, month)) setMonth(day);
  }

  return (
    <Page className={styles.page}>
      <PageHeader
        eyebrow="Volunteer schedule"
        title="My Schedule"
        description="Every shift you're part of, the hours you've earned, and when you told us you're free."
        actions={
          <>
            <ButtonLink to="/volunteer/hours" variant="secondary" size="medium">
              My hours
            </ButtonLink>
            <ButtonLink to="/volunteer/discover" variant="primary" size="medium">
              Find a shift
            </ButtonLink>
          </>
        }
      />

      <div className={styles.layout}>
        <aside className={styles.leftRail} aria-label="Calendar and views">
          <Card className={styles.calendarCard}>
            <div className={styles.calendarHead}>
              <button
                type="button"
                className={styles.monthButton}
                aria-label="Previous month"
                onClick={() => setMonth((value) => subMonths(value, 1))}
              >
                <ChevronLeft size={15} />
              </button>
              <h2 className={styles.monthTitle}>{format(month, "MMMM yyyy")}</h2>
              <button
                type="button"
                className={styles.monthButton}
                aria-label="Next month"
                onClick={() => setMonth((value) => addMonths(value, 1))}
              >
                <ChevronRight size={15} />
              </button>
            </div>

            <div className={styles.calendarGrid} role="group" aria-label="Shift calendar">
              {DAY_LABELS.map((label) => (
                <span key={label} className={styles.dayLabel} aria-hidden="true">
                  {label.slice(0, 1)}
                </span>
              ))}
              {monthDays.map((day) => {
                const iso = format(day, "yyyy-MM-dd");
                const shifts = shiftsByDate.get(iso) ?? [];
                const active = selectedDate === iso;
                const today = isSameDay(day, parseISO(workspace.demoNow));
                return (
                  <button
                    key={iso}
                    type="button"
                    className={styles.dayCell}
                    data-outside={!isSameMonth(day, month)}
                    data-today={today}
                    data-selected={active}
                    data-shifts={shifts.length > 0}
                    aria-label={`${format(day, "EEEE, MMMM d")}${
                      shifts.length
                        ? `, ${shifts.length} shift${shifts.length === 1 ? "" : "s"}`
                        : ""
                    }`}
                    aria-pressed={active}
                    onClick={() => chooseDay(day)}
                  >
                    <span>{format(day, "d")}</span>
                    {shifts.length > 0 ? (
                      <span className={styles.dayDot} aria-hidden="true" />
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div className={styles.calendarLegend}>
              <span>
                <span className={styles.legendDot} aria-hidden="true" />
                Shift day
              </span>
              <span>
                <span className={styles.legendToday} aria-hidden="true" />
                Today
              </span>
            </div>
          </Card>

          <Card className={styles.hoursCard} surface="dark">
            <p className={styles.darkKicker}>Service hours</p>
            <p className={styles.hoursBig}>{formatMinutes(hours.totalMinutes)}</p>
            <p className={styles.hoursLabel}>
              {hours.verifiedMinutes > 0
                ? t("{verified} verified · {pending} awaiting review", {
                    verified: formatMinutes(hours.verifiedMinutes),
                    pending: formatMinutes(hours.pendingMinutes),
                  })
                : t("Your first approved hours will appear here.")}
            </p>
            <div className={styles.hoursProgress}>
              <ProgressBar
                value={
                  hours.totalMinutes === 0 ? 0 : (hours.verifiedMinutes / hours.totalMinutes) * 100
                }
                tone="var(--color-lime)"
                label="Verified share of submitted hours"
              />
            </div>
            <ButtonLink
              to="/volunteer/hours"
              variant="ghost"
              size="small"
              className={styles.darkLink}
              icon={<ArrowRight size={13} />}
            >
              View hour history
            </ButtonLink>
          </Card>
        </aside>

        <section className={styles.mainColumn} aria-label="Shift agenda">
          <div className={styles.listToolbar}>
            <Tabs
              label="Schedule view"
              value={view}
              onChange={(value) => setView(value as ViewMode)}
              items={[
                {
                  id: "agenda",
                  label: (
                    <>
                      <CalendarDays size={13} /> Agenda
                    </>
                  ),
                },
                {
                  id: "week",
                  label: (
                    <>
                      <CalendarRange size={13} /> Week
                    </>
                  ),
                },
              ]}
            />
            <div className={styles.toolbarSpacer} />
            <Tabs
              label="Shift status filter"
              value={filter}
              onChange={(value) => setFilter(value as ListFilter)}
              items={[
                { id: "upcoming", label: "Upcoming", count: upcoming.length },
                { id: "completed", label: "Completed", count: completed.length },
                { id: "all", label: "All", count: myShifts.length },
              ]}
            />
          </div>

          {selectedDate ? (
            <div className={styles.selectionBanner}>
              <span>
                {t("Showing {date} · {count} shifts", {
                  date: format(parseISO(selectedDate), "EEEE, MMMM d"),
                  count: selectedDateShifts.length,
                })}
              </span>
              <button
                type="button"
                className={styles.clearButton}
                onClick={() => setSelectedDate(null)}
              >
                Show all dates
              </button>
            </div>
          ) : null}

          {view === "agenda" ? (
            <Card className={styles.agendaCard} padding="compact">
              <SectionHeader
                title={filter === "completed" ? "Past shifts" : "Your shifts"}
                subtitle={
                  nextShift
                    ? t("Next up: {program} · {day}", {
                        program: nextShift.title,
                        day: relativeDayLabel(nextShift.startsAt, workspace.demoNow),
                      })
                    : t("No upcoming shifts on the calendar yet.")
                }
                action={
                  <span className={styles.countLabel}>
                    {t("{count} shown", { count: filtered.length })}
                  </span>
                }
              />

              {filtered.length === 0 ? (
                <EmptyState
                  title="No shifts on this view"
                  copy={
                    selectedDate
                      ? "This day is clear. Pick another day or browse opportunities that match your skills."
                      : filter === "upcoming"
                        ? "You have no upcoming shifts. Discover an opportunity that fits your week."
                        : "Completed shifts will be listed here after your first check-in."
                  }
                  action={
                    <ButtonLink to="/volunteer/discover" variant="primary" size="small">
                      Browse opportunities
                    </ButtonLink>
                  }
                />
              ) : (
                <ol className={styles.agendaList}>
                  {filtered.map((shift) => (
                    <li key={`${shift.id}-${filter}`}>
                      <article className={styles.shiftRow} data-status={shift.status}>
                        <div className={styles.dateBlock} aria-hidden="true">
                          <span>{format(parseISO(shift.startsAt), "MMM")}</span>
                          <strong>{format(parseISO(shift.startsAt), "d")}</strong>
                          <span>{format(parseISO(shift.startsAt), "EEE")}</span>
                        </div>
                        <div className={styles.shiftBody}>
                          <div className={styles.shiftTop}>
                            <div>
                              <h3 className={styles.shiftTitle}>{shift.title}</h3>
                              <p className={styles.shiftMeta}>
                                <Clock3 size={12} aria-hidden="true" />
                                {timeRange(shift.startsAt, shift.endsAt)}
                                <span className={styles.metaDivider} aria-hidden="true">
                                  ·
                                </span>
                                <MapPin size={12} aria-hidden="true" />
                                {shift.address}
                              </p>
                            </div>
                            <Badge tone={statusTone(shift.status)} dot>
                              {statusLabel(shift.status)}
                            </Badge>
                          </div>
                          <div className={styles.shiftFoot}>
                            <span className={styles.roleChip}>{shift.role}</span>
                            <span className={styles.dayHint}>
                              {relativeDayLabel(shift.startsAt, workspace.demoNow)}
                            </span>
                            <ButtonLink
                              to={`/volunteer/shifts/${shift.id}`}
                              variant="ghost"
                              size="small"
                              className={styles.detailLink}
                              icon={<ArrowRight size={13} />}
                            >
                              View shift
                            </ButtonLink>
                          </div>
                        </div>
                      </article>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          ) : (
            <Card className={styles.weekCard} padding="compact">
              <SectionHeader
                title={`Week of ${format(weekStart, "MMM d")}`}
                subtitle="A seven-day view of your service. Select a day to focus the agenda."
                action={
                  <div className={styles.weekNav}>
                    <button
                      type="button"
                      className={styles.monthButton}
                      aria-label="Previous week"
                      onClick={() => setWeekAnchor(subDays(weekStart, 7))}
                    >
                      <ChevronLeft size={15} />
                    </button>
                    <button
                      type="button"
                      className={styles.monthButton}
                      aria-label="Next week"
                      onClick={() => setWeekAnchor(addDays(weekStart, 7))}
                    >
                      <ChevronRight size={15} />
                    </button>
                  </div>
                }
              />
              <div className={styles.weekGrid}>
                {weekDays.map((day) => {
                  const iso = format(day, "yyyy-MM-dd");
                  const dayShifts = shiftsByDate.get(iso) ?? [];
                  const today = isSameDay(day, parseISO(workspace.demoNow));
                  return (
                    <div key={iso} className={styles.weekColumn} data-today={today}>
                      <div className={styles.weekDayHead}>
                        <span>{format(day, "EEE")}</span>
                        <strong>{format(day, "d")}</strong>
                      </div>
                      {dayShifts.length === 0 ? (
                        <p className={styles.weekEmpty}>No shifts</p>
                      ) : (
                        dayShifts.map((shift) => (
                          <article key={shift.id} className={styles.weekShift}>
                            <span className={styles.weekTime}>{formatTime(shift.startsAt)}</span>
                            <h3>{shift.title}</h3>
                            <p>{shift.role}</p>
                            <Badge tone={statusTone(shift.status)}>
                              {statusLabel(shift.status)}
                            </Badge>
                            <ButtonLink
                              to={`/volunteer/shifts/${shift.id}`}
                              variant="ghost"
                              size="small"
                              icon={<ArrowRight size={12} />}
                            >
                              Details
                            </ButtonLink>
                          </article>
                        ))
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </section>

        <aside className={styles.rightRail} aria-label="Availability and updates">
          <Card>
            <SectionHeader
              title="Your availability"
              subtitle="The windows you offered when you joined."
              action={
                <ButtonLink
                  to="/volunteer/onboarding"
                  variant="ghost"
                  size="small"
                  icon={<Pencil size={12} />}
                >
                  Edit
                </ButtonLink>
              }
            />
            {availability.length === 0 ? (
              <p className={styles.emptyCopy}>No availability saved yet.</p>
            ) : (
              <div className={styles.availabilityGrid} role="list" aria-label="Weekly availability">
                {DAY_LABELS.map((label, index) => {
                  const dayKey = (["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const)[
                    index
                  ];
                  const slots = availability
                    .filter((slot) => slot.day === dayKey)
                    .map((slot) => PERIOD_LABELS[slot.period]);
                  return (
                    <div key={dayKey} className={styles.availabilityRow} role="listitem">
                      <span className={styles.availabilityDay}>{label}</span>
                      {slots.length === 0 ? (
                        <span className={styles.availabilityNone}>—</span>
                      ) : (
                        <div className={styles.availabilityTags}>
                          {slots.map((slot) => (
                            <span key={slot} className={styles.availabilityTag}>
                              <Check size={10} aria-hidden="true" />
                              {slot}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <p className={styles.helper}>
              Confirmed shifts always take priority over new availability.
            </p>
          </Card>

          <Card className={notice ? styles.noticeCard : styles.noticeQuiet}>
            <div className={styles.noticeHead}>
              {notice ? (
                <AlertTriangle size={15} aria-hidden="true" />
              ) : (
                <Check size={15} aria-hidden="true" />
              )}
              <h2>{notice ? "Schedule update" : "No schedule changes"}</h2>
            </div>
            {notice ? (
              <>
                <p className={styles.noticeTitle}>{notice.title}</p>
                <p className={styles.noticeBody}>{notice.body}</p>
                <p className={styles.noticeTime}>{formatDateTime(notice.createdAt)}</p>
                <ButtonLink
                  to={
                    notice.href.startsWith("/coordinator")
                      ? "/volunteer/notifications"
                      : notice.href
                  }
                  variant="ghost"
                  size="small"
                  icon={<ArrowRight size={12} />}
                >
                  Open notifications
                </ButtonLink>
              </>
            ) : (
              <p className={styles.noticeBody}>
                Your next shift is unchanged. We'll notify you here if a time or location moves.
              </p>
            )}
          </Card>

          <Card className={styles.nextCard}>
            <p className={styles.nextKicker}>Next shift</p>
            {nextShift ? (
              <>
                <h2 className={styles.nextTitle}>{nextShift.title}</h2>
                <p className={styles.nextTime}>
                  {formatDate(nextShift.startsAt)} ·{" "}
                  {timeRange(nextShift.startsAt, nextShift.endsAt)}
                </p>
                <div className={styles.nextFoot}>
                  <Avatar
                    initials={volunteer.initials}
                    tone={volunteer.tone}
                    size={28}
                    label={volunteer.name}
                  />
                  <span>{nextShift.role}</span>
                  <ButtonLink
                    to={`/volunteer/shifts/${nextShift.id}`}
                    variant="primary"
                    size="small"
                    className={styles.nextButton}
                  >
                    Prepare
                  </ButtonLink>
                </div>
              </>
            ) : (
              <>
                <h2 className={styles.nextTitle}>Your calendar is open</h2>
                <p className={styles.nextTime}>
                  Browse roles that match your skills and availability.
                </p>
                <ButtonLink to="/volunteer/discover" variant="primary" size="small">
                  Find a shift
                </ButtonLink>
              </>
            )}
          </Card>
        </aside>
      </div>
    </Page>
  );
}
