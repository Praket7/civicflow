import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Gauge,
  Hourglass,
  LogIn,
  LogOut,
  MapPin,
  MessageSquare,
  ShieldCheck,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  ButtonLink,
  Card,
  DataTable,
  EmptyState,
  Page,
  ProgressBar,
  SectionHeader,
  StatCard,
  statusLabel,
  statusTone,
} from "../../components/ui";
import type { Column } from "../../components/ui";
import { useWorkspace } from "../../lib/workspace/session";
import {
  fillPercent,
  formatDate,
  getRoster,
  getWaitlist,
  opportunityById,
  rosterCounts,
  shiftById,
  shiftMinutes,
  timeRange,
} from "../../lib/workspace/selectors";
import type { RosterRow } from "../../lib/workspace/selectors";
import styles from "./ShiftRosterPage.module.css";

type RosterTableRow = RosterRow & { id: string };

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

export function ShiftRosterPage() {
  const { id } = useParams();
  const { workspace, session, actions } = useWorkspace();
  const shift = id ? shiftById(id, workspace) : undefined;
  const opportunity = shift ? opportunityById(shift.opportunityId, workspace) : undefined;
  const [message, setMessage] = useState("");

  const roster = useMemo(
    () => (shift ? getRoster(shift.id, session, workspace) : []),
    [session, shift, workspace],
  );
  const rows: RosterTableRow[] = roster.map((row) => ({ ...row, id: row.volunteer.id }));
  const counts = rosterCounts(roster);
  const waitlist = shift ? getWaitlist(shift.id, session, workspace) : [];
  const waiting = waitlist.filter((row) => row.status === "waiting");
  const fill = shift ? fillPercent(shift) : 0;
  const missingRoles = shift?.roles.filter((role) => role.filled < role.required) ?? [];
  const duration = shift ? shiftMinutes(shift) : 0;

  if (!shift || !opportunity) {
    return (
      <Page width="narrow">
        <EmptyState
          title="That shift could not be found"
          copy="It may have been cancelled, or the roster link is out of date. The schedule has every current shift."
          action={<ButtonLink to="/coordinator/schedule">Back to schedule</ButtonLink>}
        />
      </Page>
    );
  }

  function runAction(label: string, action: () => void) {
    action();
    setMessage(label);
  }

  const columns: Column<RosterTableRow>[] = [
    {
      key: "volunteer",
      header: "Volunteer",
      render: (row) => (
        <div className={styles.person}>
          <Avatar initials={row.volunteer.initials} tone={row.volunteer.tone} size={30} />
          <div className={styles.personText}>
            <Link className={styles.personName} to={`/coordinator/volunteers/${row.volunteer.id}`}>
              {row.volunteer.name}
            </Link>
            <span className={styles.personMeta}>
              {row.volunteer.skills.slice(0, 2).join(" · ") || "No skills recorded"}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      render: (row) => <span className={styles.roleCell}>{row.role}</span>,
    },
    {
      key: "time",
      header: "Scheduled",
      render: () => (
        <span className={styles.timeCell}>
          {timeRange(shift.startsAt, shift.endsAt)}
          <small>{formatDuration(duration)}</small>
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <span className={styles.statusCell}>
          <Badge tone={statusTone(row.status)} dot>
            {statusLabel(row.status)}
          </Badge>
          {row.checkedInAt ? <small>In at {row.checkedInAt.slice(11, 16)}</small> : null}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Attendance",
      align: "right",
      render: (row) => {
        if (row.status === "checked_in") {
          return (
            <Button
              size="small"
              variant="secondary"
              icon={<LogOut size={12} aria-hidden="true" />}
              onClick={() =>
                runAction(`${row.volunteer.name} checked out.`, () =>
                  actions.checkOut(shift.id, row.volunteer.id),
                )
              }
            >
              Check out
            </Button>
          );
        }
        if (row.status === "expected" || row.status === "confirmed") {
          return (
            <div className={styles.rowActions}>
              <Button
                size="small"
                variant="primary"
                icon={<LogIn size={12} aria-hidden="true" />}
                onClick={() =>
                  runAction(`${row.volunteer.name} checked in.`, () =>
                    actions.checkIn(shift.id, row.volunteer.id),
                  )
                }
              >
                Check in
              </Button>
              <Button
                size="small"
                variant="ghost"
                aria-label={`Mark ${row.volunteer.name} as a no-show`}
                onClick={() =>
                  runAction(`${row.volunteer.name} marked as a no-show.`, () =>
                    actions.markNoShow(shift.id, row.volunteer.id),
                  )
                }
              >
                <UserX size={13} aria-hidden="true" />
              </Button>
            </div>
          );
        }
        return <span className={styles.mutedCell}>No action needed</span>;
      },
    },
  ];

  return (
    <Page>
      <div className={styles.toolbar}>
        <Link className={styles.toolbarBack} to="/coordinator/schedule">
          <ArrowLeft size={14} aria-hidden="true" />
          Schedule
        </Link>
        <div className={styles.toolbarActions}>
          <a
            className={styles.messageLink}
            href={`mailto:${workspace.organization.email}?subject=${encodeURIComponent(`Roster update for ${opportunity.title}`)}`}
          >
            <MessageSquare size={14} aria-hidden="true" />
            Message team
          </a>
          <ButtonLink
            to="/coordinator/kiosk"
            variant="primary"
            icon={<ShieldCheck size={14} aria-hidden="true" />}
          >
            Open kiosk
          </ButtonLink>
        </div>
      </div>

      <section className={styles.hero} aria-label="Shift summary">
        <img className={styles.heroImage} src={opportunity.image} alt="" />
        <div className={styles.heroScrim} aria-hidden="true" />
        <div className={styles.heroBody}>
          <div className={styles.heroTop}>
            <Badge tone="lime" dot onMedia>
              {shift.status === "scheduled" ? "Shift scheduled" : statusLabel(shift.status)}
            </Badge>
            <span className={styles.heroDate}>
              <CalendarDays size={13} aria-hidden="true" />
              {formatDate(shift.startsAt)}
            </span>
          </div>
          <h1 className={styles.heroTitle}>{opportunity.title}</h1>
          <p className={styles.heroMeta}>
            <MapPin size={13} aria-hidden="true" />
            {opportunity.address}
            <span className={styles.dot} aria-hidden="true" />
            <Clock3 size={13} aria-hidden="true" />
            {timeRange(shift.startsAt, shift.endsAt)} · {formatDuration(duration)}
          </p>
          <div className={styles.heroFooter}>
            <div className={styles.heroAvatars}>
              {roster.slice(0, 5).map((row) => (
                <Avatar
                  key={row.volunteer.id}
                  initials={row.volunteer.initials}
                  tone={row.volunteer.tone}
                  size={24}
                />
              ))}
              <span className={styles.heroAvatarMore}>+{Math.max(0, roster.length - 5)}</span>
            </div>
            <span className={styles.heroRosterText}>
              {roster.length} of {shift.capacity} seats filled
            </span>
          </div>
        </div>
        <Link className={styles.heroManage} to={`/coordinator/opportunities/${opportunity.id}`}>
          Manage opportunity
          <ArrowRight size={13} aria-hidden="true" />
        </Link>
      </section>

      <div className={styles.metrics}>
        <StatCard
          icon={Users}
          value={`${roster.length} / ${shift.capacity}`}
          label="Confirmed volunteers"
          meta={counts.expected > 0 ? `${counts.expected} expected` : "All expected arrived"}
          tone="cobalt"
        />
        <StatCard
          icon={UserCheck}
          value={counts.checkedIn + counts.completed}
          label="Checked in"
          meta={counts.noShow > 0 ? `${counts.noShow} no-show` : "No no-shows"}
          tone="green"
        />
        <StatCard
          icon={Hourglass}
          value={waiting.length}
          label="On the waitlist"
          meta={waiting.length > 0 ? "Ready to promote" : "No one waiting"}
          tone="amber"
        />
        <StatCard
          icon={Gauge}
          value={`${fill}%`}
          label="Seat fill"
          meta={`${shift.capacity - roster.length} seats open`}
          tone={fill < 80 ? "coral" : "violet"}
        />
      </div>

      <p className={styles.liveRegion} role="status" aria-live="polite">
        {message}
      </p>

      <div className={styles.layout}>
        <div className={styles.mainColumn}>
          <Card padding="compact">
            <SectionHeader
              title="Roster"
              subtitle="Check volunteers in and out. Every change is written to the audit trail."
              action={
                <span className={styles.tableCount}>
                  {counts.checkedIn + counts.completed} of {roster.length} checked in
                </span>
              }
            />
            <DataTable
              columns={columns}
              rows={rows}
              caption={`Roster for ${opportunity.title}, ${formatDate(shift.startsAt)}`}
              empty="No volunteers are confirmed yet."
            />
          </Card>

          <Card padding="compact" className={styles.activityCard}>
            <SectionHeader
              title="Shift notes"
              subtitle="What the team needs to know on arrival."
              action={
                <Link className={styles.inlineLink} to={`/coordinator/volunteers`}>
                  Volunteer directory
                </Link>
              }
            />
            <ul className={styles.notes}>
              <li>
                <CheckCircle2 size={15} aria-hidden="true" />
                <span>
                  <strong>{opportunity.training[0] ?? "Orientation on arrival"}</strong>
                  <small>Walk through the setup with the shift lead before starting.</small>
                </span>
              </li>
              <li>
                <AlertTriangle size={15} aria-hidden="true" />
                <span>
                  <strong>
                    {missingRoles.length > 0 ? "Roles still open" : "All required roles covered"}
                  </strong>
                  <small>
                    {missingRoles.length > 0
                      ? missingRoles
                          .map((role) => `${role.name} (${role.required - role.filled})`)
                          .join(", ")
                      : "Required roles are staffed for this shift."}
                  </small>
                </span>
              </li>
              <li>
                <ShieldCheck size={15} aria-hidden="true" />
                <span>
                  <strong>Accessibility</strong>
                  <small>
                    Step-free entrance, seating available, and materials can be brought to the
                    parking lot.
                  </small>
                </span>
              </li>
            </ul>
          </Card>
        </div>

        <aside className={styles.rail} aria-label="Coverage and waitlist">
          <Card padding="compact">
            <SectionHeader
              title="Coverage requirements"
              subtitle="Required role slots for this shift"
            />
            <ul className={styles.roleList}>
              {shift.roles.map((role) => {
                const percent =
                  role.required === 0 ? 100 : Math.round((role.filled / role.required) * 100);
                const open = role.required - role.filled;
                return (
                  <li key={role.name} className={styles.roleRow}>
                    <div className={styles.roleTop}>
                      <span className={styles.roleName}>{role.name}</span>
                      <span className={styles.roleCount}>
                        {role.filled} / {role.required}
                      </span>
                    </div>
                    <ProgressBar
                      label={`${role.name} coverage`}
                      value={percent}
                      tone={percent < 100 ? "var(--color-orange)" : "var(--color-green)"}
                    />
                    <span className={styles.roleMeta}>
                      {open > 0
                        ? `${open} slot${open === 1 ? "" : "s"} still open`
                        : "Fully staffed"}
                    </span>
                  </li>
                );
              })}
            </ul>
            {missingRoles.length > 0 ? (
              <div className={styles.attention}>
                <AlertTriangle size={15} aria-hidden="true" />
                <div>
                  <strong>
                    {missingRoles.length} role gap{missingRoles.length === 1 ? "" : "s"}
                  </strong>
                  <p>Promote a qualified volunteer from the waitlist or invite a match.</p>
                  <Link to={`/coordinator/autoroster`} className={styles.attentionLink}>
                    Open AutoRoster
                    <ArrowRight size={12} aria-hidden="true" />
                  </Link>
                </div>
              </div>
            ) : null}
          </Card>

          <Card padding="compact">
            <SectionHeader
              title="Waitlist"
              subtitle="Promotion order is first eligible, first served"
              action={waitlist.length > 0 ? <Badge tone="neutral">{waitlist.length}</Badge> : null}
            />
            {waitlist.length === 0 ? (
              <p className={styles.emptyCopy}>
                No one is waiting for this shift. Open seats are still visible to matching
                volunteers.
              </p>
            ) : (
              <ul className={styles.waitlist}>
                {waitlist.map((row) => {
                  const promoted = row.status === "promoted";
                  const openRoles = shift.roles
                    .filter((role) => role.filled < role.required)
                    .map((role) => role.name);
                  const eligible = openRoles.includes(row.entry.eligibleRole);
                  return (
                    <li key={row.entry.id} className={styles.waitRow}>
                      <Avatar
                        initials={row.volunteer.initials}
                        tone={row.volunteer.tone}
                        size={30}
                      />
                      <div className={styles.waitBody}>
                        <span className={styles.waitName}>{row.volunteer.name}</span>
                        <span className={styles.waitMeta}>
                          #{row.entry.position} · {row.entry.eligibleRole} ·{" "}
                          {formatDate(row.entry.createdAt)}
                        </span>
                      </div>
                      {promoted ? (
                        <Badge tone="green">Promoted</Badge>
                      ) : eligible ? (
                        <Button
                          size="small"
                          variant="secondary"
                          onClick={() =>
                            runAction(`${row.volunteer.name} promoted into the shift.`, () =>
                              actions.promoteWaitlist(shift.id, row.volunteer.id),
                            )
                          }
                        >
                          Promote
                        </Button>
                      ) : (
                        <span
                          className={styles.waitMeta}
                          title={`No open ${row.entry.eligibleRole} role on this shift`}
                        >
                          No open role
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <div className={styles.railFooter}>
              <Link to="/coordinator/coverage" className={styles.inlineLink}>
                <ArrowLeft size={12} aria-hidden="true" />
                Coverage Command Center
              </Link>
              <Link to="/coordinator/attendance" className={styles.inlineLink}>
                Attendance
                <ArrowRight size={12} aria-hidden="true" />
              </Link>
            </div>
          </Card>
        </aside>
      </div>
    </Page>
  );
}
