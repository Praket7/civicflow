import { useMemo, useState } from "react";
import { addDays, parseISO } from "date-fns";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CircleAlert,
  Gauge,
  Users,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  Page,
  PageHeader,
  ProgressBar,
  SectionHeader,
  statusTone,
} from "../../components/ui";
import { t } from "../../lib/i18n";
import { useWorkspace } from "../../lib/workspace/session";
import {
  fillPercent,
  formatDate,
  getCoverageRows,
  getRoleRisk,
  getRoster,
  getShiftRows,
  timeRange,
} from "../../lib/workspace/selectors";
import styles from "./CoveragePage.module.css";

type CoverageStatus = "critical" | "at-risk" | "healthy";

const STATUS_LABEL: Record<CoverageStatus, string> = {
  critical: "Critical gap",
  "at-risk": "At risk",
  healthy: "Healthy",
};

const STATUS_COLOR: Record<CoverageStatus, string> = {
  critical: "var(--color-red)",
  "at-risk": "var(--color-orange)",
  healthy: "var(--color-green)",
};

const RANGE_OPTIONS = [
  { days: 7, label: "Next 7 days" },
  { days: 14, label: "Next 14 days" },
  { days: 30, label: "Next 30 days" },
];

function gapLabel(shiftId: string): string {
  const shift = getShiftRows().find((row) => row.shift.id === shiftId)?.shift;
  if (!shift) return "No shift selected";
  const missing = shift.roles.find((role) => role.filled < role.required);
  if (missing) {
    const open = missing.required - missing.filled;
    return open === 1
      ? t("{role} missing", { role: missing.name })
      : t("{count} {role} slots open", { count: open, role: missing.name });
  }
  const openSeats = shift.capacity - shift.confirmed;
  return openSeats > 0
    ? t(openSeats === 1 ? "{count} seat open" : "{count} seats open", { count: openSeats })
    : t("Fully covered");
}

export function CoveragePage() {
  const { workspace, session } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const [days, setDays] = useState(30);
  const [expanded, setExpanded] = useState(false);

  const timedRows = useMemo(() => {
    const cutoff = addDays(parseISO(workspace.demoNow), days);
    return getCoverageRows().filter(({ row }) => {
      const start = parseISO(row.shift.startsAt);
      return start > parseISO(workspace.demoNow) && start <= cutoff;
    });
  }, [days, workspace.demoNow]);

  const counts = useMemo(() => {
    return timedRows.reduce(
      (accumulator, row) => {
        accumulator[row.status] += 1;
        return accumulator;
      },
      { critical: 0, "at-risk": 0, healthy: 0 },
    );
  }, [timedRows]);

  const total = timedRows.length;
  const needAttention = counts.critical + counts["at-risk"];

  const selectedId = searchParams.get("shift");
  const selected =
    timedRows.find((row) => row.row.shift.id === selectedId) ??
    timedRows.find((row) => row.status === "critical") ??
    timedRows[0];

  const selectedShift = selected?.row.shift;
  const roster = selectedShift ? getRoster(selectedShift.id, session) : [];
  const liveRoles =
    selectedShift?.roles.map((role) => {
      const assigned = roster.filter((person) => person.role === role.name).length;
      return {
        ...role,
        filled: Math.max(role.filled, Math.min(role.required, assigned)),
      };
    }) ?? [];
  const selectedFill = selected
    ? Math.round((roster.length / Math.max(1, selectedShift?.capacity ?? 1)) * 100)
    : 0;
  const openRoles = liveRoles.reduce(
    (sum, role) => sum + Math.max(0, role.required - role.filled),
    0,
  );

  const risk = getRoleRisk().slice(0, 5);
  const visibleRows = expanded ? timedRows : timedRows.slice(0, 5);

  const donutSegments = useMemo(() => {
    const data: { label: string; value: number; color: string }[] = [
      { label: "Critical", value: counts.critical, color: STATUS_COLOR.critical },
      { label: "At risk", value: counts["at-risk"], color: STATUS_COLOR["at-risk"] },
      { label: "Healthy", value: counts.healthy, color: STATUS_COLOR.healthy },
    ];
    const sum = data.reduce((value, item) => value + item.value, 0) || 1;
    const circumference = 2 * Math.PI * 56;
    return data.reduce<{ label: string; value: number; color: string; offset: number }[]>(
      (accumulator, item) => {
        const previous = accumulator[accumulator.length - 1];
        const offset = previous
          ? previous.offset + (previous.value / sum) * circumference
          : 0;
        return [...accumulator, { ...item, offset }];
      },
      [],
    );
  }, [counts]);

  function selectShift(shiftId: string) {
    const next = new URLSearchParams(searchParams);
    next.set("shift", shiftId);
    setSearchParams(next, { replace: true });
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Staffing"
        title="Coverage"
        description="Where the next few weeks are short-staffed, and by how much. Counts come from filled role slots and confirmed seats, not estimates."
        actions={
          <ButtonLink to="/coordinator/autoroster" variant="secondary" icon={<Gauge size={14} />}>
            Open AutoRoster
          </ButtonLink>
        }
      />

      <div className={styles.rangeRow} role="group" aria-label="Coverage date range">
        {RANGE_OPTIONS.map((option) => (
          <button
            key={option.days}
            type="button"
            className={`${styles.rangeButton} ${days === option.days ? styles.rangeActive : ""}`}
            aria-pressed={days === option.days}
            onClick={() => setDays(option.days)}
          >
            {t(option.label)}
          </button>
        ))}
        <span className={styles.rangeMeta}>
          <CalendarClock size={13} aria-hidden="true" />
          {t(total === 1 ? "{count} upcoming shift in this window" : "{count} upcoming shifts in this window", {
            count: total,
          })}
        </span>
      </div>

      <div className={styles.topGrid}>
        <Card className={styles.healthCard} ariaLabel="Coverage health summary">
          <div className={styles.healthHead}>
            <h2 className={styles.healthTitle}>Coverage health</h2>
            <span className={styles.healthWindow}>
              {t(RANGE_OPTIONS.find((option) => option.days === days)?.label ?? "")}
            </span>
          </div>
          <div className={styles.healthBody}>
            <p className={styles.healthFigure}>
              <strong>{needAttention}</strong>
              <span>{t("of {count} shifts need attention", { count: total })}</span>
            </p>
            <div
              className={styles.healthBar}
              role="img"
              aria-label={t(
                "{critical} critical, {risk} at risk, {healthy} healthy shifts",
                {
                  critical: counts.critical,
                  risk: counts["at-risk"],
                  healthy: counts.healthy,
                },
              )}
            >
              {donutSegments.map((segment) => (
                <span
                  key={segment.label}
                  style={{
                    flexGrow: Math.max(segment.value, 0.15),
                    background: segment.color,
                  }}
                />
              ))}
            </div>
            <ul className={styles.healthLegend}>
              <li>
                <span className={styles.legendDot} style={{ background: STATUS_COLOR.critical }} />
                <strong>{counts.critical}</strong>
                <span>{t("critical")}</span>
              </li>
              <li>
                <span className={styles.legendDot} style={{ background: STATUS_COLOR["at-risk"] }} />
                <strong>{counts["at-risk"]}</strong>
                <span>{t("at risk")}</span>
              </li>
              <li>
                <span className={styles.legendDot} style={{ background: STATUS_COLOR.healthy }} />
                <strong>{counts.healthy}</strong>
                <span>{t("healthy")}</span>
              </li>
            </ul>
          </div>
          <p className={styles.healthFoot}>
            Critical means a required role is empty and seat fill is under 70%. At risk means an
            open role or seat fill under 86%.{" "}
            <Link to="/coordinator/reports">Coverage method</Link>
          </p>
        </Card>

        <Card className={styles.shiftCard}>
          {selected && selectedShift ? (
            <>
              <div className={styles.shiftHead}>
                <div className={styles.shiftHeadCopy}>
                  <p className={styles.shiftEyebrow}>
                    {t(selectedId ? "Selected shift" : "Highest-risk shift")}
                  </p>
                  <p className={styles.shiftDate}>{formatDate(selectedShift.startsAt)}</p>
                  <h2 className={styles.shiftTitle}>{selected.row.opportunity.title}</h2>
                  <p className={styles.shiftMeta}>
                    {timeRange(selectedShift.startsAt, selectedShift.endsAt)} ·{' '}
                    {selected.row.opportunity.address} ·{' '}
                    {t("{filled} of {capacity} seats filled", {
                      filled: roster.length,
                      capacity: selectedShift.capacity,
                    })}
                  </p>
                </div>
                <div className={styles.shiftHeadActions}>
                  <Badge tone={statusTone(selected.status)} dot>
                    {t(STATUS_LABEL[selected.status])}
                  </Badge>
                  <ButtonLink
                    to={`/coordinator/shifts/${selectedShift.id}`}
                    variant="ghost"
                    size="small"
                    icon={<ArrowUpRight size={13} />}
                  >
                    Live roster
                  </ButtonLink>
                </div>
              </div>

              <ul className={styles.roleList} aria-label="Required roles for the selected shift">
                {liveRoles.map((role) => {
                  const percent = Math.min(100, Math.round((role.filled / Math.max(1, role.required)) * 100));
                  const missing = role.required - role.filled;
                  return (
                    <li key={role.name} className={styles.roleRow}>
                      <div className={styles.roleName}>
                        <span>{role.name}</span>
                        {missing > 0 ? (
                          <span className={styles.roleGap}>
                            <CircleAlert size={10} aria-hidden="true" />
                            {t("{count} open", { count: missing })}
                          </span>
                        ) : (
                          <span className={styles.roleReady}>Covered</span>
                        )}
                      </div>
                      <ProgressBar
                        value={percent}
                        label={t("{role}: {filled} of {required} filled", {
                          role: role.name,
                          filled: role.filled,
                          required: role.required,
                        })}
                        tone={missing === 0 ? "var(--color-green)" : percent > 0 ? "var(--color-orange)" : "var(--color-red)"}
                      />
                      <span className={styles.roleCount}>
                        {role.filled} / {role.required}
                      </span>
                    </li>
                  );
                })}
              </ul>

              <div className={styles.shiftFoot}>
                <p className={styles.shiftFootCopy}>
                  {openRoles === 0 ? (
                    <>
                      <strong>All required roles covered.</strong> Seat fill is {selectedFill}%.
                    </>
                  ) : (
                    <>
                      <strong>
                        {t(openRoles === 1 ? "{count} required role still open." : "{count} required roles still open.", {
                          count: openRoles,
                        })}
                      </strong>{' '}
                      {gapLabel(selectedShift.id)}. Seat fill is {selectedFill}%.
                    </>
                  )}
                </p>
                <ButtonLink
                  to={`/coordinator/autoroster?shift=${selectedShift.id}`}
                  variant="primary"
                  icon={<ArrowRight size={14} />}
                >
                  Resolve coverage
                </ButtonLink>
              </div>
            </>
          ) : (
            <div className={styles.emptyShift}>
              <h2>No shifts in this window</h2>
              <p>Widen the date range or add a shift from the schedule.</p>
              <ButtonLink to="/coordinator/schedule">Open schedule</ButtonLink>
            </div>
          )}
        </Card>
      </div>

      <div className={styles.bottomGrid}>
        <Card className={styles.listCard}>
          <SectionHeader
            title="Upcoming coverage"
            subtitle="Every shift in the selected window, ordered by start time."
            action={<Link to="/coordinator/schedule">Full schedule</Link>}
          />
          {timedRows.length === 0 ? (
            <p className={styles.emptyCopy}>No shifts match this window.</p>
          ) : (
            <>
              <div className={styles.listHead} aria-hidden="true">
                <span>Shift</span>
                <span>Seats</span>
                <span>Coverage</span>
              </div>
              <ul className={styles.coverageList}>
                {visibleRows.map(({ row, status }) => {
                  const percent = fillPercent(row.shift);
                  const active = row.shift.id === selectedShift?.id;
                  return (
                    <li key={row.shift.id}>
                      <button
                        type="button"
                        className={`${styles.coverageRow} ${active ? styles.coverageRowActive : ""}`}
                        aria-pressed={active}
                        onClick={() => selectShift(row.shift.id)}
                      >
                        <span className={styles.rowIdentity}>
                          <span
                            className={styles.causeDot}
                            style={{ background: `var(--cause-${row.opportunity.cause})` }}
                            aria-hidden="true"
                          />
                          <span className={styles.rowCopy}>
                            <span className={styles.rowTitle}>{row.opportunity.title}</span>
                            <span className={styles.rowMeta}>
                              {formatDate(row.shift.startsAt)} · {timeRange(row.shift.startsAt, row.shift.endsAt)} ·{' '}
                              {row.shift.roles.length} roles
                            </span>
                          </span>
                        </span>
                        <span className={styles.rowSeats}>
                          <span className={styles.seatCount}>
                            <strong>{row.shift.confirmed}</strong> / {row.shift.capacity}
                          </span>
                          <span className={styles.seatTrack} aria-hidden="true">
                            <span
                              style={{
                                width: `${Math.max(4, percent)}%`,
                                background: STATUS_COLOR[status],
                              }}
                            />
                          </span>
                        </span>
                        <span className={styles.rowStatus}>
                          <Badge tone={statusTone(status)} dot>
                            {gapLabel(row.shift.id)}
                          </Badge>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {timedRows.length > 5 ? (
                <Button variant="ghost" size="small" className={styles.showAll} onClick={() => setExpanded(!expanded)}>
                  {expanded
                    ? t("Show fewer shifts")
                    : t("Show all {count} shifts", { count: timedRows.length })}
                </Button>
              ) : null}
            </>
          )}
        </Card>

        <Card className={styles.riskCard}>
          <SectionHeader
            title="Role risk"
            subtitle="Filled required slots across upcoming shifts."
            action={<Link to="/coordinator/credentials">Credentials</Link>}
          />
          <ul className={styles.riskList}>
            {risk.map((row) => (
              <li key={row.role} className={styles.riskRow}>
                <div className={styles.riskTop}>
                  <span className={styles.riskName}>{row.role}</span>
                  <span className={styles.riskValue}>
                    {row.filled} / {row.required} · {row.percent}%
                  </span>
                </div>
                <span className={styles.riskTrack} aria-hidden="true">
                  <span
                    style={{
                      width: `${Math.max(3, row.percent)}%`,
                      background:
                        row.percent < 50
                          ? "var(--color-red)"
                          : row.percent < 80
                            ? "var(--color-orange)"
                            : "var(--color-green)",
                    }}
                  />
                </span>
              </li>
            ))}
          </ul>
          <div className={styles.riskFoot}>
            <Users size={14} aria-hidden="true" />
            <p>
              Role risk counts required slots on upcoming shifts. A volunteer can hold one seat
              per shift; AutoRoster skips anyone already booked.
            </p>
          </div>
        </Card>
      </div>

      <p className={styles.footnote}>
        Want the short version? Open a shift row to see its role gaps, then run AutoRoster to fill
        the missing roles with eligible volunteers.
      </p>
    </Page>
  );
}
