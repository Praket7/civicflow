import { useState } from "react";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Inbox,
  Mail,
  MapPin,
  Percent,
  Users,
} from "lucide-react";
import {
  Avatar,
  Badge,
  ButtonLink,
  Card,
  DataTable,
  EmptyState,
  ExternalButtonLink,
  Page,
  ProgressBar,
  SectionHeader,
  StatCard,
  Tabs,
} from "../../components/ui";
import { initialsOf } from "../../lib/initials";
import type { TabItem } from "../../components/ui";
import {
  CAUSE_LABELS,
  fillPercent,
  formatDate,
  formatMinutes,
  getApplications,
  getHourRows,
  getOpportunities,
  getRoster,
  getShiftRowsForOpportunity,
  timeRange,
} from "../../lib/workspace/selectors";
import type { HourRow, ShiftRow } from "../../lib/workspace/selectors";
import { useWorkspace } from "../../lib/workspace/session";
import styles from "./OpportunityManagementPage.module.css";

type TabKey = "overview" | "shifts" | "requirements" | "impact";

interface RoleSummary {
  name: string;
  required: number;
  filled: number;
}

function roleSummaryFor(rows: ShiftRow[]): RoleSummary[] {
  const totals = new Map<string, RoleSummary>();
  for (const { shift } of rows) {
    for (const role of shift.roles) {
      const current = totals.get(role.name) ?? { name: role.name, required: 0, filled: 0 };
      totals.set(role.name, {
        ...current,
        required: current.required + role.required,
        filled: current.filled + role.filled,
      });
    }
  }
  return [...totals.values()].sort((first, second) => {
    const firstGap = first.required - first.filled;
    const secondGap = second.required - second.filled;
    return secondGap - firstGap || first.name.localeCompare(second.name);
  });
}

function shiftStatus(row: ShiftRow): { label: string; tone: "red" | "green" | "amber" } {
  const missing = row.shift.roles.find((role) => role.filled < role.required);
  if (missing) return { label: `Needs ${missing.name.toLowerCase()}`, tone: "red" };
  if (fillPercent(row.shift) >= 100) return { label: "Ready", tone: "green" };
  return { label: "Open", tone: "amber" };
}

function ShiftRowLink({ row }: { row: ShiftRow }) {
  const status = shiftStatus(row);
  return (
    <Link className={styles.shiftRow} to={`/coordinator/shifts/${row.shift.id}`}>
      <div className={styles.shiftWhen}>
        <span className={styles.shiftDate}>{formatDate(row.shift.startsAt)}</span>
        <span className={styles.shiftTime}>{timeRange(row.shift.startsAt, row.shift.endsAt)}</span>
      </div>
      <span className={styles.shiftFill}>
        {row.shift.confirmed} / {row.shift.capacity} filled
      </span>
      <Badge tone={status.tone}>{status.label}</Badge>
      <ChevronRight className={styles.chevron} size={15} aria-hidden="true" />
    </Link>
  );
}

export function OpportunityManagementPage() {
  const { id } = useParams();
  const { workspace, session } = useWorkspace();
  const [tab, setTab] = useState<TabKey>("overview");

  const opportunity = getOpportunities(session, workspace).find((item) => item.id === id);

  if (!opportunity) {
    return (
      <Page width="narrow">
        <EmptyState
          title="This program could not be found"
          copy="It may have been archived, or the link may be incomplete. All active programs are listed in Opportunities."
          action={<ButtonLink to="/coordinator/opportunities">Back to opportunities</ButtonLink>}
        />
      </Page>
    );
  }

  const allRows = getShiftRowsForOpportunity(opportunity.id, workspace);
  const upcomingRows = allRows.filter((row) => row.shift.startsAt > workspace.demoNow);
  const activeRows = upcomingRows.length > 0 ? upcomingRows : allRows;
  const roles = roleSummaryFor(activeRows);
  const seatsRequired = activeRows.reduce((total, row) => total + row.shift.capacity, 0);
  const seatsFilled = activeRows.reduce((total, row) => total + row.shift.confirmed, 0);
  const fillRate = seatsRequired === 0 ? 0 : Math.round((seatsFilled / seatsRequired) * 100);
  const hoursRows = getHourRows(session, workspace).filter(
    (row) => row.opportunity.id === opportunity.id,
  );
  const verifiedRows = hoursRows
    .filter((row) => row.status === "verified")
    .sort((first, second) => second.date.localeCompare(first.date));
  const verifiedMinutes = verifiedRows.reduce(
    (total, row) => total + (row.approvedMinutes ?? row.requestedMinutes),
    0,
  );
  const verifiedHours = Math.round(verifiedMinutes / 60);
  const applicants = getApplications(session).filter(
    (applicant) => applicant.cause === opportunity.cause,
  );
  const rosterPeople = new Map<string, number>();
  for (const row of activeRows) {
    for (const member of getRoster(row.shift.id, session, workspace)) {
      rosterPeople.set(member.volunteer.id, member.volunteer.attendanceRate);
    }
  }
  const attendance =
    rosterPeople.size === 0
      ? 0
      : Math.round(
          [...rosterPeople.values()].reduce((total, rate) => total + rate, 0) / rosterPeople.size,
        );

  const tabs: TabItem[] = [
    { id: "overview", label: "Overview" },
    { id: "shifts", label: "Upcoming shifts", count: activeRows.length },
    { id: "requirements", label: "Requirements" },
    { id: "impact", label: "Impact" },
  ];

  const mailto = `mailto:${workspace.organization.email}?subject=${encodeURIComponent(
    `Question about ${opportunity.title}`,
  )}`;

  const columns: {
    key: string;
    header: string;
    render: (row: HourRow) => ReactNode;
    align?: "left" | "right";
  }[] = [
    {
      key: "volunteer",
      header: "Volunteer",
      render: (row) => (
        <span className="cellStack">
          <Avatar
            initials={row.volunteer.initials}
            tone={row.volunteer.tone}
            size={26}
            label={row.volunteer.name}
          />
          <span>{row.volunteer.name}</span>
        </span>
      ),
    },
    {
      key: "date",
      header: "Service date",
      render: (row) => formatDate(row.date),
    },
    {
      key: "hours",
      header: "Approved",
      align: "right",
      render: (row) => formatMinutes(row.approvedMinutes ?? row.requestedMinutes),
    },
    {
      key: "code",
      header: "Verification",
      align: "right",
      render: (row) => <span className={styles.mono}>{row.verificationId ?? "—"}</span>,
    },
  ];

  return (
    <Page>
      {/* The reference repeats the program title over a screenshot collage. This
          header keeps one legible title over one licensed photograph. */}
      <section className={styles.hero} aria-labelledby="program-title">
        <img
          className={styles.heroImage}
          src={opportunity.image}
          alt={`Volunteers serving at ${opportunity.title}`}
        />
        <div className={styles.heroShade} aria-hidden="true" />
        <div className={styles.heroInner}>
          <div className={styles.heroTop}>
            <Link className={styles.back} to="/coordinator/opportunities">
              <ArrowLeft size={13} aria-hidden="true" />
              All opportunities
            </Link>
            <div className={styles.heroActions}>
              <ExternalButtonLink
                href={`mailto:${workspace.organization.email}?subject=${encodeURIComponent(
                  `${opportunity.title} coordination`,
                )}`}
                variant="secondary"
                size="small"
                icon={<Mail size={14} aria-hidden="true" />}
                className={styles.heroButton}
              >
                Notify coordinator
              </ExternalButtonLink>
              <ButtonLink
                to="/coordinator/volunteers"
                variant="secondary"
                size="small"
                icon={<Users size={14} aria-hidden="true" />}
                className={styles.heroButton}
              >
                View volunteers
              </ButtonLink>
            </div>
          </div>

          <div className={styles.heroCopy}>
            <div className={styles.heroBadges}>
              <Badge tone="lime" dot onMedia>
                Active program
              </Badge>
              <span className={styles.heroCause}>{CAUSE_LABELS[opportunity.cause]}</span>
            </div>
            <h1 className={styles.heroTitle} id="program-title">
              {opportunity.title}
            </h1>
            <p className={styles.heroOrg}>
              {opportunity.organization} · {opportunity.coordinator}, program lead
            </p>
            <div className={styles.facts}>
              <span className={styles.fact}>
                <MapPin size={13} aria-hidden="true" />
                {opportunity.address}
              </span>
              <span className={styles.fact}>
                <CalendarDays size={13} aria-hidden="true" />
                {activeRows.length} upcoming {activeRows.length === 1 ? "shift" : "shifts"}
              </span>
              <span className={styles.fact}>
                <Clock3 size={13} aria-hidden="true" />
                {opportunity.duration}
              </span>
              <span className={styles.fact}>{opportunity.distanceMiles} miles away</span>
            </div>
          </div>
        </div>
      </section>

      <div className={styles.metrics}>
        <StatCard
          icon={Inbox}
          value={applicants.length}
          label="Interested applicants"
          meta={CAUSE_LABELS[opportunity.cause]}
          tone="cobalt"
        />
        <StatCard
          icon={Percent}
          value={`${fillRate}%`}
          label="Seat fill"
          meta={`${seatsFilled} of ${seatsRequired} seats`}
          tone="amber"
        />
        <StatCard
          icon={ClipboardCheck}
          value={`${attendance}%`}
          label="Attendance"
          meta="Across rostered volunteers"
          tone="green"
        />
        <StatCard
          icon={Clock3}
          value={`${verifiedHours} h`}
          label="Verified service"
          meta={`${verifiedRows.length} approved records`}
          tone="violet"
        />
      </div>

      <Card padding="compact" className={styles.tabBar}>
        <Tabs
          items={tabs}
          value={tab}
          onChange={(value) => setTab(value as TabKey)}
          label="Program sections"
          variant="underline"
        />
      </Card>

      {tab === "overview" ? (
        <div className={styles.columns}>
          <div className={styles.mainStack}>
            <Card>
              <SectionHeader
                title="About this opportunity"
                subtitle={opportunity.impactMetric}
                action={<Link to="/coordinator/coverage">Coverage command center</Link>}
              />
              <p className={styles.body}>{opportunity.description}</p>

              <dl className={styles.detailGrid}>
                <div>
                  <dt>Where</dt>
                  <dd>{opportunity.address}</dd>
                </div>
                <div>
                  <dt>Program lead</dt>
                  <dd>{opportunity.coordinator}</dd>
                </div>
                <div>
                  <dt>Typical shift</dt>
                  <dd>{opportunity.duration}</dd>
                </div>
                <div>
                  <dt>Training</dt>
                  <dd>{opportunity.training.join(" · ")}</dd>
                </div>
              </dl>

              <div className={styles.coordinatorRow}>
                <Avatar
                  initials={initialsOf(opportunity.coordinator)}
                  tone="amber"
                  size={34}
                  label={opportunity.coordinator}
                />
                <div className={styles.coordinatorCopy}>
                  <span className={styles.coordinatorName}>{opportunity.coordinator}</span>
                  <span className={styles.coordinatorMeta}>
                    Program lead · {workspace.organization.name}
                  </span>
                </div>
                <a className={styles.textLink} href={mailto}>
                  Email lead
                </a>
              </div>
            </Card>

            <Card>
              <SectionHeader
                title="Upcoming shifts"
                subtitle="Roles and seats update from the schedule"
                action={
                  <button
                    type="button"
                    className={styles.textButton}
                    onClick={() => setTab("shifts")}
                  >
                    View all {activeRows.length}
                  </button>
                }
              />
              {activeRows.length === 0 ? (
                <EmptyState
                  title="No shifts scheduled"
                  copy="Add a shift from the schedule to start filling this program."
                  action={<ButtonLink to="/coordinator/schedule">Open schedule</ButtonLink>}
                />
              ) : (
                <div className={styles.shiftList}>
                  {activeRows.slice(0, 3).map((row) => (
                    <ShiftRowLink key={row.shift.id} row={row} />
                  ))}
                </div>
              )}
            </Card>
          </div>

          <aside className={styles.sideStack}>
            <Card>
              <SectionHeader
                title="Coverage requirements"
                subtitle="Required roles across upcoming shifts"
              />
              {roles.length === 0 ? (
                <p className={styles.muted}>No role requirements yet.</p>
              ) : (
                <div className={styles.roleList}>
                  {roles.map((role) => {
                    const percent =
                      role.required === 0 ? 100 : Math.round((role.filled / role.required) * 100);
                    return (
                      <div className={styles.roleRow} key={role.name}>
                        <span className={styles.roleName}>{role.name}</span>
                        <div className={styles.roleTrack}>
                          <ProgressBar
                            value={percent}
                            tone={
                              percent === 100
                                ? "var(--color-green)"
                                : percent === 0
                                  ? "var(--color-red)"
                                  : "var(--color-orange)"
                            }
                            label={`${role.name} coverage`}
                          />
                        </div>
                        <span
                          className={styles.roleFill}
                          data-state={
                            percent === 100 ? "full" : percent === 0 ? "empty" : "partial"
                          }
                        >
                          {role.filled}/{role.required}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              <Link className={styles.cardLink} to="/coordinator/coverage">
                Open coverage command center
                <ChevronRight size={13} aria-hidden="true" />
              </Link>
            </Card>

            <Card>
              <SectionHeader title="Impact so far" subtitle="Organization totals this year" />
              <div className={styles.impactNumbers}>
                <div>
                  <span className={styles.bigNumber}>
                    {workspace.impact.mealsPacked.toLocaleString("en-US")}
                  </span>
                  <span className={styles.bigLabel}>meals packed</span>
                </div>
                <div>
                  <span className={styles.bigNumber}>
                    {workspace.impact.familiesServedThisMonth.toLocaleString("en-US")}
                  </span>
                  <span className={styles.bigLabel}>families served this year</span>
                </div>
              </div>
              <Link className={styles.cardLink} to="/coordinator/impact">
                Open impact analytics
                <ChevronRight size={13} aria-hidden="true" />
              </Link>
            </Card>
          </aside>
        </div>
      ) : null}

      {tab === "shifts" ? (
        <Card>
          <SectionHeader
            title="Upcoming shifts"
            subtitle={`${activeRows.length} scheduled · ${seatsFilled} of ${seatsRequired} seats filled`}
            action={<Link to="/coordinator/schedule">Open schedule</Link>}
          />
          {activeRows.length === 0 ? (
            <EmptyState
              title="No upcoming shifts"
              copy="Create the next shift before recruiting volunteers."
              action={<ButtonLink to="/coordinator/schedule">Go to schedule</ButtonLink>}
            />
          ) : (
            <div className={styles.shiftList}>
              {activeRows.map((row) => (
                <ShiftRowLink key={row.shift.id} row={row} />
              ))}
            </div>
          )}
        </Card>
      ) : null}

      {tab === "requirements" ? (
        <div className={styles.requirements}>
          <Card>
            <SectionHeader title="Volunteer requirements" subtitle="Screening and preparation" />
            {opportunity.requirements.length === 0 ? (
              <p className={styles.muted}>No specific requirements. Everyone is welcome.</p>
            ) : (
              <ul className={styles.checkList}>
                {opportunity.requirements.map((requirement) => (
                  <li key={requirement}>
                    <span className={styles.checkMark} aria-hidden="true">
                      ✓
                    </span>
                    {requirement}
                  </li>
                ))}
              </ul>
            )}
            <h3 className={styles.subheading}>Training provided</h3>
            <div className={styles.pills}>
              {opportunity.training.map((training) => (
                <span className={styles.pill} key={training}>
                  {training}
                </span>
              ))}
            </div>
            <p className={styles.note}>
              Requirements are applied per role. The backend rejects registrations that do not meet
              a role&apos;s eligibility, even if the form is bypassed.
            </p>
          </Card>

          <Card>
            <SectionHeader
              title="Role coverage"
              subtitle="Filled slots across scheduled shifts"
              action={<Link to="/coordinator/coverage">View risk</Link>}
            />
            {roles.length === 0 ? (
              <p className={styles.muted}>No roles are scheduled yet.</p>
            ) : (
              <div className={styles.roleList}>
                {roles.map((role) => {
                  const gap = role.required - role.filled;
                  return (
                    <div className={styles.roleRow} key={role.name}>
                      <span className={styles.roleName}>{role.name}</span>
                      <div className={styles.roleTrack}>
                        <ProgressBar
                          value={(role.filled / role.required) * 100}
                          tone={gap === 0 ? "var(--color-green)" : "var(--color-orange)"}
                          label={`${role.name} coverage`}
                        />
                      </div>
                      <span className={styles.roleFill} data-state={gap === 0 ? "full" : "partial"}>
                        {role.filled}/{role.required}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            <div className={styles.coverageNote}>
              <span>
                A role gap becomes critical when the shift is within five days and the seat is still
                open.
              </span>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "impact" ? (
        <div className={styles.impactTab}>
          <Card>
            <SectionHeader
              title="Program impact"
              subtitle="Verified service only · pending hours are excluded"
              action={<Link to="/coordinator/impact">Full impact analytics</Link>}
            />
            <div className={styles.impactStats}>
              <div>
                <span className={styles.bigNumber}>{verifiedRows.length}</span>
                <span className={styles.bigLabel}>approved service records</span>
              </div>
              <div>
                <span className={styles.bigNumber}>{verifiedHours}</span>
                <span className={styles.bigLabel}>verified volunteer hours</span>
              </div>
              <div>
                <span className={styles.bigNumber}>{fillRate}%</span>
                <span className={styles.bigLabel}>seat fill on upcoming shifts</span>
              </div>
            </div>
          </Card>

          <Card>
            <SectionHeader
              title="Recent verified service"
              subtitle="Newest approved hours for this program"
            />
            {verifiedRows.length === 0 ? (
              <EmptyState
                title="No verified hours yet"
                copy="Approved hours appear here after a coordinator review."
                action={<ButtonLink to="/coordinator/hours">Open hours review</ButtonLink>}
              />
            ) : (
              <DataTable
                columns={columns}
                rows={verifiedRows.slice(0, 10)}
                caption={`Verified hours for ${opportunity.title}`}
              />
            )}
          </Card>
        </div>
      ) : null}
    </Page>
  );
}
