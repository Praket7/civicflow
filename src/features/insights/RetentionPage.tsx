import { useState } from "react";
import { ArrowRight, HeartHandshake, Mail, RotateCcw, Users } from "lucide-react";
import { Link } from "react-router-dom";
import {
  Avatar,
  BarChart,
  Badge,
  Button,
  ButtonLink,
  Card,
  DonutChart,
  Page,
  PageHeader,
  SectionHeader,
  StatCard,
  Tabs,
} from "../../components/ui";
import { CAUSE_COLORS } from "../../lib/causes";
import { useWorkspace } from "../../lib/workspace/session";
import {
  CAUSE_LABELS,
  getAtRiskVolunteers,
  getCauseHours,
  getRetentionRows,
  getUpcomingShiftRows,
} from "../../lib/workspace/selectors";

export function RetentionPage() {
  const { workspace, session } = useWorkspace();
  const [range, setRange] = useState("11");
  const retention = getRetentionRows(session);
  const chartRows = range === "6" ? retention.slice(-6) : retention;
  const atRisk = getAtRiskVolunteers();
  const causes = getCauseHours(session, workspace);
  const average =
    retention.length === 0
      ? 0
      : Math.round(retention.reduce((sum, row) => sum + row.rate, 0) / retention.length);
  const bookedThisWeek = getUpcomingShiftRows().filter(
    (row) => row.shift.startsAt.slice(0, 10) <= "2026-10-19",
  ).length;

  return (
    <Page>
      <PageHeader
        eyebrow="Insights"
        title="Retention & engagement"
        description="Return rate is the honest measure of a volunteer program. Find the people who drifted and the causes that keep them coming back."
        actions={
          <>
            <ButtonLink
              to="/coordinator/reports/custom?template=report-retention"
              variant="secondary"
            >
              Build retention report
            </ButtonLink>
            <ButtonLink to="/coordinator/volunteers" variant="primary">
              Volunteer directory
            </ButtonLink>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
        <StatCard
          icon={RotateCcw}
          value={`${average}%`}
          label="Average return rate"
          meta={`${retention.length} monthly cohorts`}
          tone="green"
        />
        <StatCard
          icon={Users}
          value={workspace.impact.activeVolunteers}
          label="Active volunteers"
          meta="served this year"
          tone="cobalt"
        />
        <StatCard
          icon={HeartHandshake}
          value={atRisk.length}
          label="Need a check-in"
          meta="low attendance or few events"
          tone="amber"
        />
        <StatCard
          icon={ArrowRight}
          value={bookedThisWeek}
          label="Shifts this week"
          meta="with confirmed volunteers"
          tone="violet"
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, 0.85fr)",
          gap: 12,
        }}
      >
        <Card>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "flex-start",
            }}
          >
            <SectionHeader
              title="Return rate by monthly cohort"
              subtitle="Share of first-time volunteers who served again within 30 days"
            />
            <Tabs
              items={[
                { id: "6", label: "6 mo" },
                { id: "11", label: "11 mo" },
              ]}
              value={range}
              onChange={setRange}
              label="Retention range"
            />
          </div>
          <BarChart
            data={chartRows.map((row) => ({ label: row.label, value: row.rate }))}
            height={188}
            max={100}
            colors={["var(--color-cobalt)"]}
            label="Return rate by monthly cohort"
          />
          <p style={{ marginTop: 8, fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.5 }}>
            Denominator: volunteers who completed a first shift in that month. Someone who served a
            second time within 30 days counts as returned even if they later paused.
          </p>
        </Card>

        <Card>
          <SectionHeader
            title="Engagement by cause"
            subtitle="Share of approved hours"
            action={<Link to="/coordinator/impact">Impact analytics</Link>}
          />
          <DonutChart
            data={causes.map((cause) => ({
              label: CAUSE_LABELS[cause.cause],
              value: cause.hours,
              color: CAUSE_COLORS[cause.cause] ?? "var(--color-cobalt)",
            }))}
            centerValue={`${causes.length}`}
            centerLabel="causes served"
            size={146}
            label="Engagement by cause"
            valueFormatter={(value) => `${value} h`}
          />
          <div style={{ marginTop: 12, paddingTop: 11, borderTop: "1px solid var(--border-soft)" }}>
            <div style={{ fontSize: 13, fontWeight: 590 }}>What this says</div>
            <p
              style={{ marginTop: 4, fontSize: 12.5, lineHeight: 1.5, color: "var(--text-muted)" }}
            >
              Food security carries the most hours and is also the easiest entry point. Education
              has the highest return rate; pair new volunteers with a tutoring shift after their
              first pantry day.
            </p>
          </div>
        </Card>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 340px",
          gap: 12,
          alignItems: "start",
        }}
      >
        <Card>
          <SectionHeader
            title="Reach out before they drift"
            subtitle="Low attendance or fewer than five completed events"
            action={<Badge tone="amber">{atRisk.length} volunteers</Badge>}
          />
          {atRisk.map((volunteer) => (
            <div
              key={volunteer.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 0",
                borderBottom: "1px solid rgba(7,27,50,0.07)",
              }}
            >
              <Avatar initials={volunteer.initials} tone={volunteer.tone} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <Link
                  to={`/coordinator/volunteers/${volunteer.id}`}
                  style={{
                    fontSize: 14,
                    fontWeight: 570,
                    color: "var(--text-primary)",
                    textDecoration: "none",
                  }}
                >
                  {volunteer.name}
                </Link>
                <div style={{ marginTop: 2, fontSize: 12, color: "var(--text-muted)" }}>
                  {volunteer.eventsCompleted} events · {volunteer.attendanceRate}% attendance ·{" "}
                  {volunteer.hoursVerified.toFixed(1)} h
                </div>
              </div>
              <Badge tone={volunteer.attendanceRate < 70 ? "red" : "amber"}>
                {volunteer.attendanceRate < 70 ? "At risk" : "Watch"}
              </Badge>
              <a
                href={`mailto:${volunteer.email}?subject=${encodeURIComponent("A shift that fits your week?")}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 12.5,
                  color: "var(--action-primary)",
                  textDecoration: "none",
                }}
              >
                <Mail size={11} aria-hidden="true" /> Reach out
              </a>
            </div>
          ))}
        </Card>

        <Card padding="compact">
          <SectionHeader title="Engagement moves" subtitle="Try one this week" />
          {[
            [
              "Pair a new volunteer",
              "Assign a first-time pantry volunteer beside a returning team lead.",
            ],
            ["Offer a two-hour shift", "Shorter entry shifts convert better than full afternoons."],
            ["Ask for a preference", "Update skills and availability from the volunteer profile."],
          ].map(([title, copy]) => (
            <div
              key={title}
              style={{ padding: "9px 0", borderBottom: "1px solid rgba(7,27,50,0.07)" }}
            >
              <div style={{ fontSize: 13.5, fontWeight: 570 }}>{title}</div>
              <p
                style={{
                  marginTop: 2,
                  fontSize: 12.5,
                  lineHeight: 1.5,
                  color: "var(--text-muted)",
                }}
              >
                {copy}
              </p>
            </div>
          ))}
          <div style={{ display: "flex", gap: 7, marginTop: 11 }}>
            <ButtonLink to="/coordinator/autoroster" variant="secondary" size="small">
              AutoRoster
            </ButtonLink>
            <Button variant="ghost" size="small" onClick={() => window.print()}>
              Print summary
            </Button>
          </div>
        </Card>
      </div>
    </Page>
  );
}
