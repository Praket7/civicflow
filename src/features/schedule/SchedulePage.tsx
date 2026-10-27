import { useState } from "react";
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isSameWeek,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, MapPin, Plus, Users } from "lucide-react";
import { Link } from "react-router-dom";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  DataTable,
  Page,
  PageHeader,
  ProgressBar,
  Tabs,
} from "../../components/ui";
import type { Column } from "../../components/ui";
import { t } from "../../lib/i18n";
import { useWorkspace } from "../../lib/workspace/session";
import {
  CAUSE_LABELS,
  fillPercent,
  formatDate,
  formatDateRange,
  formatDayNumber,
  formatHour,
  formatMonthDay,
  formatMonthYear,
  formatTime,
  formatWeekday,
  formatWeekdayNarrow,
  getShiftRows,
  timeRange,
  type ShiftRow,
} from "../../lib/workspace/selectors";
import { SeriesManagerCard } from "./SeriesManagerCard";
import styles from "./Schedule.module.css";

/**
 * Coordinator week planner.
 *
 * The calendar is a fixed two-hour grid rather than a free-position canvas:
 * every shift has a real start time, and snapping to a band keeps the same
 * height for a 30-minute and a four-hour shift. Cause and role-gap filters are
 * applied once to `filtered`; the list view, calendar, selected-shift rail and
 * weekly summary all read that one array so their totals cannot disagree.
 */
const CAUSE_LIST = Object.keys(CAUSE_LABELS) as (keyof typeof CAUSE_LABELS)[];

const BANDS = [
  { id: "eight", from: 8, to: 10 },
  { id: "ten", from: 10, to: 12 },
  { id: "noon", from: 12, to: 14 },
  { id: "two", from: 14, to: 16 },
  { id: "four", from: 16, to: 18 },
];

function countLabel(count: number, one: string, other: string): string {
  return `${count} ${t(count === 1 ? one : other)}`;
}

/**
 * Count unfilled role slots, not empty seats. A shift can have open seats and
 * still be fully covered by role if every required role has its people.
 */
function openRoleCount(row: ShiftRow): number {
  return row.shift.roles.reduce((sum, role) => sum + Math.max(0, role.required - role.filled), 0);
}

function bandLabel(from: number): string {
  return formatHour(new Date(2026, 0, 1, from));
}

export function SchedulePage() {
  const { workspace } = useWorkspace();
  const [weekAnchor, setWeekAnchor] = useState(() => parseISO(workspace.demoNow));
  const [view, setView] = useState("week");
  const [causeFilter, setCauseFilter] = useState<string[]>([...CAUSE_LIST]);
  const [gapsOnly, setGapsOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const weekStart = startOfWeek(weekAnchor, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const rows = getShiftRows(workspace);
  const filtered = rows
    .filter((row) => causeFilter.includes(row.opportunity.cause))
    .filter((row) => !gapsOnly || openRoleCount(row) > 0);

  const weekEnd = addDays(weekStart, 7);
  const weekRows = filtered.filter((row) => {
    const start = parseISO(row.shift.startsAt);
    return start >= weekStart && start < weekEnd;
  });
  // Selection belongs to the visible week. If the coordinator pages to a
  // month with no service, the rail should say so rather than keep showing the
  // last shift from the previous week.
  const selected =
    weekRows.find((row) => row.shift.id === selectedId) ??
    weekRows.find((row) => row.shift.startsAt >= workspace.demoNow) ??
    weekRows[0];
  const weekSeats = weekRows.reduce(
    (total, row) => ({
      confirmed: total.confirmed + row.shift.confirmed,
      capacity: total.capacity + row.shift.capacity,
    }),
    { confirmed: 0, capacity: 0 },
  );
  const weekFill = Math.round((weekSeats.confirmed / Math.max(1, weekSeats.capacity)) * 100);
  const weekGaps = weekRows.reduce((sum, row) => sum + openRoleCount(row), 0);

  const calendarStart = startOfWeek(startOfMonth(weekAnchor), { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(endOfMonth(weekAnchor), { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const shiftDays = new Set(rows.map((row) => row.shift.startsAt.slice(0, 10)));

  const attention = filtered
    .filter((row) => row.shift.startsAt > workspace.demoNow)
    .filter((row) => openRoleCount(row) > 0)
    .slice(0, 3);

  const selectedFill = selected ? fillPercent(selected.shift) : 0;
  const selectedGaps = selected ? openRoleCount(selected) : 0;

  function toggleCause(cause: string) {
    setCauseFilter((current) =>
      current.includes(cause) ? current.filter((item) => item !== cause) : [...current, cause],
    );
  }

  const columns: Column<ShiftRow & { id: string }>[] = [
    {
      key: "shift",
      header: t("Shift"),
      render: (row) => (
        <div>
          <div className={styles.listTitle}>{row.opportunity.title}</div>
          <div className={styles.listMeta}>{row.opportunity.coordinator}</div>
        </div>
      ),
    },
    { key: "date", header: t("Date"), render: (row) => formatDate(row.shift.startsAt) },
    {
      key: "time",
      header: t("Time"),
      render: (row) => timeRange(row.shift.startsAt, row.shift.endsAt),
    },
    {
      key: "fill",
      header: t("Seats"),
      render: (row) => `${row.shift.confirmed} / ${row.shift.capacity}`,
      align: "right",
    },
    {
      key: "status",
      header: t("Coverage"),
      render: (row) => (
        <Badge tone={openRoleCount(row) > 0 ? "amber" : "green"} dot>
          {t(openRoleCount(row) > 0 ? "Role gap" : "No gaps")}
        </Badge>
      ),
    },
    {
      key: "open",
      header: "",
      align: "right",
      render: (row) => (
        <Link to={`/coordinator/shifts/${row.shift.id}`} className={styles.rosterLink}>
          {t("Roster")} →
        </Link>
      ),
    },
  ];

  return (
    <Page>
      <PageHeader
        eyebrow="Scheduling"
        title="Schedule"
        description="See every shift, spot unfilled roles, and jump straight to the roster that needs attention."
        actions={
          <>
            <ButtonLink to="/coordinator/coverage" variant="secondary">
              Coverage center
            </ButtonLink>
            <ButtonLink
              to="/coordinator/opportunities/new"
              variant="primary"
              icon={<Plus size={14} />}
            >
              New opportunity
            </ButtonLink>
          </>
        }
      />

      <div className={styles.toolbar}>
        <div className={styles.navGroup}>
          <Button
            size="small"
            variant="secondary"
            onClick={() => setWeekAnchor(subWeeks(weekAnchor, 1))}
            aria-label="Previous week"
            icon={<ChevronLeft size={13} />}
          >
            {t("Prev")}
          </Button>
          <Button
            size="small"
            variant="secondary"
            onClick={() => setWeekAnchor(parseISO(workspace.demoNow))}
          >
            {t("Today")}
          </Button>
          <Button
            size="small"
            variant="secondary"
            onClick={() => setWeekAnchor(addWeeks(weekAnchor, 1))}
            aria-label="Next week"
          >
            {t("Next")} <ChevronRight size={13} />
          </Button>
        </div>
        {view === "list" ? (
          <div className={styles.rangeBadge}>
            <CalendarDays size={13} aria-hidden="true" />
            <span>{formatDateRange(weekStart, addDays(weekStart, 6))}</span>
          </div>
        ) : (
          <span className={styles.viewHint}>Click a shift to see its roles and roster.</span>
        )}
        <div className={styles.toolbarSpacer} />
        <Tabs
          items={[
            { id: "week", label: t("Week") },
            { id: "list", label: t("List") },
          ]}
          value={view}
          onChange={setView}
          label="Schedule view"
        />
      </div>

      <SeriesManagerCard />

      <section className={styles.attentionBlock} aria-labelledby="upcoming-gaps">
        <div className={styles.attentionHead}>
          <div>
            <p className={styles.kicker}>Next up</p>
            <h2 id="upcoming-gaps" className={styles.sectionTitle}>
              Upcoming role gaps
            </h2>
          </div>
          <Link to="/coordinator/coverage" className={styles.textLink}>
            Coverage center <ChevronRight size={13} aria-hidden="true" />
          </Link>
        </div>
        {attention.length === 0 ? (
          <p className={styles.emptyNote}>
            Every upcoming shift in this filter has all required roles filled.
          </p>
        ) : (
          <div className={styles.attentionStrip}>
            {attention.map((row) => {
              const gap = row.shift.roles.find((role) => role.filled < role.required);
              return (
                <Link
                  className={styles.attentionItem}
                  key={row.shift.id}
                  to={`/coordinator/shifts/${row.shift.id}`}
                >
                  <span className={styles.attentionDot} aria-hidden="true" />
                  <span className={styles.attentionCopy}>
                    <span className={styles.attentionTitle}>{row.opportunity.title}</span>
                    <span className={styles.attentionMeta}>
                      {gap?.name ?? t("Role")} {t("missing")} · {formatDate(row.shift.startsAt)} ·{" "}
                      {timeRange(row.shift.startsAt, row.shift.endsAt)}
                    </span>
                  </span>
                  <ChevronRight size={14} aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className={styles.filterBar} aria-label="Schedule filters">
        <span className={styles.filterLabel}>Causes</span>
        <div className={styles.causeChips}>
          {CAUSE_LIST.map((cause) => (
            <button
              key={cause}
              type="button"
              className={styles.causeChip}
              aria-pressed={causeFilter.includes(cause)}
              onClick={() => toggleCause(cause)}
            >
              <span className={styles.causeDot} data-cause={cause} aria-hidden="true" />
              {CAUSE_LABELS[cause]}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={styles.gapToggle}
          aria-pressed={gapsOnly}
          onClick={() => setGapsOnly((current) => !current)}
        >
          <span className={styles.toggleDot} aria-hidden="true" />
          Needs people only
        </button>
        <span className={styles.filterCount}>
          {filtered.length} {t("of")} {rows.length} {t("shifts")}
        </span>
      </section>

      {view === "week" ? (
        <div className={styles.planner}>
          <Card className={styles.calendarCard}>
            <div className={styles.calendarHead}>
              <div>
                <p className={styles.kicker}>Week of</p>
                <h2 className={styles.weekRange}>
                  {formatDateRange(weekStart, addDays(weekStart, 6), true)}
                </h2>
              </div>
              <div className={styles.weekStats}>
                <span className={styles.stat}>
                  <strong>{weekRows.length}</strong> {t(weekRows.length === 1 ? "shift" : "shifts")}
                </span>
                <span className={styles.stat}>
                  <strong>{weekFill}%</strong> {t("seats filled")}
                </span>
                <span className={styles.stat} data-tone={weekGaps > 0 ? "warn" : "ok"}>
                  <strong>{weekGaps}</strong> {t(weekGaps === 1 ? "role gap" : "role gaps")}
                </span>
              </div>
              <span className={styles.weekFill} aria-hidden="true">
                <span style={{ width: `${weekFill}%` }} />
              </span>
            </div>

            <div className={styles.weekScroll}>
              <div className={styles.week} role="group" aria-label="Week schedule">
                <div className={styles.timeColumn}>
                  <div className={styles.timeHead}>{t("Time")}</div>
                  {BANDS.map((band) => (
                    <div className={styles.timeCell} key={band.id}>
                      {bandLabel(band.from)}
                    </div>
                  ))}
                </div>
                {days.map((day) => {
                  const iso = format(day, "yyyy-MM-dd");
                  const dayRows = filtered.filter((row) => row.shift.startsAt.slice(0, 10) === iso);
                  const dayGaps = dayRows.reduce((sum, row) => sum + openRoleCount(row), 0);
                  const isToday = isSameDay(day, parseISO(workspace.demoNow));
                  return (
                    <div
                      className={`${styles.dayColumn} ${isToday ? styles.dayToday : ""}`}
                      key={iso}
                    >
                      <div className={styles.dayHead}>
                        <span className={styles.dayLabel}>
                          <span className={styles.dayName}>{formatWeekday(day)}</span>
                          {dayRows.length > 0 ? (
                            <span className={styles.dayCount} data-gap={dayGaps > 0}>
                              {countLabel(dayRows.length, t("shift"), t("shifts"))}
                              {dayGaps > 0 ? ` · ${countLabel(dayGaps, t("gap"), t("gaps"))}` : ""}
                            </span>
                          ) : null}
                        </span>
                        <span className={styles.dayNumber}>{formatDayNumber(day)}</span>
                      </div>
                      {BANDS.map((band) => {
                        const bandRows = dayRows.filter((row) => {
                          const hour = parseISO(row.shift.startsAt).getHours();
                          return hour >= band.from && hour < band.to;
                        });
                        return (
                          <div
                            className={styles.slot}
                            data-empty={bandRows.length === 0}
                            key={band.id}
                          >
                            {bandRows.map((row) => {
                              const gaps = openRoleCount(row);
                              const fill = fillPercent(row.shift);
                              const isSelected = selected?.shift.id === row.shift.id;
                              return (
                                <button
                                  type="button"
                                  className={styles.shiftCard}
                                  key={row.shift.id}
                                  data-gap={gaps > 0}
                                  data-selected={isSelected}
                                  aria-pressed={isSelected}
                                  onClick={() => setSelectedId(row.shift.id)}
                                  title={`${row.opportunity.title} · ${timeRange(
                                    row.shift.startsAt,
                                    row.shift.endsAt,
                                  )} · ${row.shift.confirmed} of ${row.shift.capacity} seats`}
                                >
                                  <span className={styles.shiftTop}>
                                    <span className={styles.shiftTime}>
                                      {formatTime(row.shift.startsAt)} –{" "}
                                      {formatTime(row.shift.endsAt)}
                                    </span>
                                    {gaps > 0 ? (
                                      <span className={styles.shiftFlag}>
                                        {gaps} {t("open")}
                                      </span>
                                    ) : null}
                                  </span>
                                  <span className={styles.shiftTitle}>{row.opportunity.title}</span>
                                  <span className={styles.shiftFoot}>
                                    <span className={styles.shiftSeats}>
                                      <span
                                        className={styles.causeDot}
                                        data-cause={row.opportunity.cause}
                                        aria-hidden="true"
                                      />
                                      {row.shift.confirmed}/{row.shift.capacity} {t("seats")}
                                    </span>
                                    {row.shift.waitlisted > 0 ? (
                                      <span>
                                        {row.shift.waitlisted} {t("waitlisted")}
                                      </span>
                                    ) : null}
                                  </span>
                                  <span className={styles.shiftTrack} aria-hidden="true">
                                    <span style={{ width: `${fill}%` }} />
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={styles.calendarLegend}>
              <span>
                <span className={styles.legendDot} data-tone="gap" aria-hidden="true" />
                {t("Role gap")}
              </span>{" "}
              <span>
                <span className={styles.legendDot} data-tone="ok" aria-hidden="true" />
                {t("No role gaps")}
              </span>
              <span className={styles.legendHint}>
                Select a shift to see its roles and roster shortcut.
              </span>
            </div>
          </Card>

          <aside className={styles.rail} aria-label="Schedule details">
            {selected ? (
              <Card className={styles.selectedCard}>
                <div className={styles.selectedHead}>
                  <p className={styles.kicker}>Selected shift</p>
                  <Badge tone={selectedGaps > 0 ? "amber" : "green"} dot>
                    {selectedGaps > 0 ? `${selectedGaps} ${t("open")}` : t("No role gaps")}
                  </Badge>
                </div>
                <h2 className={styles.selectedTitle}>{selected.opportunity.title}</h2>
                <p className={styles.selectedMeta}>
                  <Clock3 size={13} aria-hidden="true" />
                  {formatDate(selected.shift.startsAt)} ·{" "}
                  {timeRange(selected.shift.startsAt, selected.shift.endsAt)}
                </p>
                <p className={styles.selectedMeta}>
                  <MapPin size={13} aria-hidden="true" />
                  {selected.opportunity.address}
                </p>

                <div className={styles.coverageBlock}>
                  <div className={styles.coverageLine}>
                    <span>{t("Seat fill")}</span>
                    <strong>{selectedFill}%</strong>
                  </div>
                  <ProgressBar
                    label={`${selected.opportunity.title} seat fill`}
                    value={selectedFill}
                  />
                  <p className={styles.coverageMeta}>
                    {selected.shift.confirmed} {t("of")} {selected.shift.capacity}{" "}
                    {t("seats confirmed")} · {selected.shift.waitlisted} {t("waitlisted")}
                  </p>
                </div>

                <div className={styles.roleBlock}>
                  <div className={styles.roleHead}>
                    <h3>{t("Role coverage")}</h3>
                    <Users size={13} aria-hidden="true" />
                  </div>
                  <ul className={styles.roleList}>
                    {selected.shift.roles.map((role) => {
                      const missing = Math.max(0, role.required - role.filled);
                      return (
                        <li key={role.name} className={styles.roleRow} data-open={missing > 0}>
                          <span className={styles.roleName}>{role.name}</span>
                          <span className={styles.roleValue}>
                            {role.filled}/{role.required}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div className={styles.selectedActions}>
                  <ButtonLink
                    to={`/coordinator/shifts/${selected.shift.id}`}
                    variant="primary"
                    size="small"
                  >
                    Open live roster
                  </ButtonLink>
                  <ButtonLink
                    to={`/coordinator/autoroster?shift=${selected.shift.id}`}
                    variant="secondary"
                    size="small"
                  >
                    AutoRoster
                  </ButtonLink>
                </div>
              </Card>
            ) : (
              <Card className={styles.selectedCard}>
                <p className={styles.kicker}>Selected shift</p>
                <h2 className={styles.emptyTitle}>
                  {t(filtered.length === 0 ? "No shift in this filter" : "No shifts this week")}
                </h2>
                <p className={styles.emptyNote}>
                  {t(
                    filtered.length === 0
                      ? "Turn a cause back on, or clear “Needs people only”, to see shifts again."
                      : "Use Next, or pick a day with a dot in the month, to move to a week with service.",
                  )}
                </p>
              </Card>
            )}

            <Card className={styles.monthCard}>
              <div className={styles.monthHead}>
                <button
                  type="button"
                  className={styles.monthNav}
                  onClick={() => setWeekAnchor(startOfMonth(subMonths(weekAnchor, 1)))}
                  aria-label="Previous month"
                >
                  <ChevronLeft size={15} />
                </button>
                <h2 className={styles.monthTitle}>{formatMonthYear(weekAnchor)}</h2>
                <button
                  type="button"
                  className={styles.monthNav}
                  onClick={() => setWeekAnchor(startOfMonth(addMonths(weekAnchor, 1)))}
                  aria-label="Next month"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
              <div className={styles.miniCalendar}>
                {days.map((day) => (
                  <span key={format(day, "yyyy-MM-dd")} className={styles.miniDayName}>
                    {formatWeekdayNarrow(day)}
                  </span>
                ))}
                {calendarDays.map((day) => {
                  const iso = format(day, "yyyy-MM-dd");
                  const hasShift = shiftDays.has(iso);
                  return (
                    <button
                      key={iso}
                      type="button"
                      className={styles.miniDay}
                      data-muted={!isSameMonth(day, weekAnchor)}
                      data-week={isSameWeek(day, weekAnchor, { weekStartsOn: 1 })}
                      data-today={isSameDay(day, parseISO(workspace.demoNow))}
                      data-shift={hasShift}
                      onClick={() => {
                        setWeekAnchor(day);
                        const firstShift = filtered.find(
                          (row) => row.shift.startsAt.slice(0, 10) === iso,
                        );
                        setSelectedId(firstShift?.shift.id ?? null);
                      }}
                      aria-label={`${formatMonthDay(day, true)}${hasShift ? `, ${t("has shifts")}` : ""}`}
                      aria-current={
                        isSameDay(day, parseISO(workspace.demoNow)) ? "date" : undefined
                      }
                    >
                      {formatDayNumber(day)}
                    </button>
                  );
                })}
              </div>
              <div className={styles.monthLegend}>
                <span>
                  <span className={styles.legendDot} data-tone="shift" aria-hidden="true" />
                  {t("Shift scheduled")}
                </span>
                <span>
                  <span className={styles.todaySwatch} aria-hidden="true" />
                  {t("Today")}
                </span>
              </div>
            </Card>
          </aside>
        </div>
      ) : (
        <Card>
          <DataTable
            columns={columns}
            rows={filtered.map((row) => ({ ...row, id: row.shift.id }))}
            caption="All scheduled shifts"
            empty="No shifts match these cause filters."
          />
        </Card>
      )}
    </Page>
  );
}
