import { useState } from "react";
import { ArrowRight, FileText, HeartHandshake, Plus, ShieldCheck, Users } from "lucide-react";
import { Link } from "react-router-dom";
import {
  AreaChart,
  Badge,
  ButtonLink,
  Card,
  DonutChart,
  Page,
  PageHeader,
  SectionHeader,
  StatCard,
  Tabs,
} from "../../components/ui";
import { useWorkspace } from "../../lib/workspace/session";
import {
  CAUSE_LABELS,
  formatHours,
  getCauseHours,
  getHoursTrend,
  REPORT_TEMPLATES,
  type ReportTemplate,
} from "../../lib/workspace/selectors";
import { CAUSE_COLORS } from "../../lib/causes";
import { DecisionReadoutCard } from "./DecisionReadoutCard";
import styles from "./Reports.module.css";

type Category = "all" | ReportTemplate["category"];

const CATEGORIES: { id: Category; label: string }[] = [
  { id: "all", label: "All templates" },
  { id: "participation", label: "Participation" },
  { id: "coverage", label: "Coverage" },
  { id: "impact", label: "Impact" },
  { id: "operations", label: "Operations" },
];

export function ReportsPage() {
  const { workspace, session } = useWorkspace();
  const [tab, setTab] = useState("templates");
  const [category, setCategory] = useState<Category>("all");
  const trend = getHoursTrend(session, workspace);
  const causes = getCauseHours(session, workspace);
  const filtered =
    category === "all"
      ? REPORT_TEMPLATES
      : REPORT_TEMPLATES.filter((template) => template.category === category);
  const savedViews = session.savedViews.map((view) => {
    let filters: Record<string, string[] | undefined>;
    try {
      filters = JSON.parse(view.filtersJson) as Record<string, string[] | undefined>;
    } catch {
      filters = {};
    }
    return { ...view, filters };
  });

  return (
    <Page>
      <PageHeader
        eyebrow="Reporting"
        title="Reports"
        description="Pull the same approved service record into a funder update, a staffing review, or an end-of-year impact report. Nothing is retyped twice."
        actions={
          <>
            <ButtonLink to="/coordinator/impact" variant="secondary">
              Impact analytics
            </ButtonLink>
            <ButtonLink
              to="/coordinator/reports/custom"
              variant="primary"
              icon={<Plus size={14} />}
            >
              New report
            </ButtonLink>
          </>
        }
      />

      <div className={styles.statStrip}>
        <StatCard
          icon={Users}
          value={workspace.impact.uniqueVolunteersYtd}
          label="Volunteers this year"
          tone="cobalt"
        />
        <StatCard
          icon={HeartHandshake}
          value={formatHours(workspace.impact.hoursYtd)}
          label="Verified hours"
          tone="violet"
        />
        <StatCard
          icon={ShieldCheck}
          value={`${workspace.impact.attendanceRate}%`}
          label="Attendance rate"
          tone="green"
        />
        <StatCard
          icon={FileText}
          value={REPORT_TEMPLATES.length}
          label="Report templates"
          tone="amber"
        />
      </div>

      <Tabs
        items={[
          { id: "templates", label: "Templates", count: REPORT_TEMPLATES.length },
          { id: "saved", label: "Saved views", count: savedViews.length },
          { id: "recent", label: "Recent exports" },
        ]}
        value={tab}
        onChange={setTab}
        label="Reports sections"
      />

      {tab === "templates" ? (
        <>
          <div className={styles.categoryRow} aria-label="Filter templates by type">
            {CATEGORIES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={styles.categoryButton}
                data-active={category === item.id ? "true" : "false"}
                onClick={() => setCategory(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className={styles.templateList}>
            <div className={styles.templateListHead} aria-hidden="true">
              <span>Report</span>
              <span>Date range</span>
              <span />
            </div>
            {filtered.map((template) => (
              <Link
                key={template.id}
                className={styles.templateRow}
                to={`/coordinator/reports/custom?template=${template.id}`}
              >
                <div className={styles.templateMain}>
                  <h2 className={styles.templateTitle}>{template.title}</h2>
                  <p className={styles.templateCopy}>{template.description}</p>
                </div>
                <span className={styles.templateRange}>{template.range}</span>
                <span className={styles.templateOpen}>
                  Open builder
                  <ArrowRight size={14} aria-hidden="true" />
                </span>
              </Link>
            ))}
          </div>

          <div className={styles.charts}>
            <Card className={styles.chartCard}>
              <SectionHeader
                title="Volunteer hours over time"
                subtitle="Verified hours, January – October"
                action={<Link to="/coordinator/impact">Full analytics</Link>}
              />
              <AreaChart
                data={trend.map((point) => ({ label: point.label, value: point.hours }))}
                height={160}
                label="Verified hours by month"
                formatValue={(value) => `${value} h`}
              />
            </Card>
            <Card className={styles.chartCard}>
              <SectionHeader
                title="Impact by cause"
                subtitle="Share of approved hours"
                action={<Link to="/coordinator/reports/preview">Report preview</Link>}
              />
              <DonutChart
                data={causes.map((cause) => ({
                  label: CAUSE_LABELS[cause.cause],
                  value: cause.hours,
                  color: CAUSE_COLORS[cause.cause] ?? "var(--color-cobalt)",
                }))}
                centerValue={`${workspace.impact.hoursThisMonth}`}
                centerLabel="hours this month"
                size={136}
                label="Impact by cause"
                valueFormatter={(value) => `${value} h`}
              />
            </Card>
          </div>

          <DecisionReadoutCard />
        </>
      ) : null}

      {tab === "saved" ? (
        <div className={styles.templateList}>
          {savedViews.map((view) => (
            <Link
              key={view.id}
              className={styles.templateRow}
              to={`/coordinator/reports/custom?view=${view.id}`}
            >
              <div className={styles.templateMain}>
                <h2 className={styles.templateTitle}>{view.name}</h2>
                <p className={styles.templateCopy}>
                  Saved filter set:{" "}
                  {Object.entries(view.filters)
                    .map(([key, values]) => `${key}: ${values?.join(", ") ?? "any"}`)
                    .join(" · ")}
                </p>
              </div>
              <span className={styles.templateRange}>Saved view</span>
              <span className={styles.templateOpen}>
                Open
                <ArrowRight size={14} aria-hidden="true" />
              </span>
            </Link>
          ))}
          <Link className={styles.templateRow} to="/coordinator/reports/custom">
            <div className={styles.templateMain}>
              <h2 className={styles.templateTitle}>Build a new view</h2>
              <p className={styles.templateCopy}>
                Choose fields, filters, and grouping once, then keep it for the next board meeting.
              </p>
            </div>
            <span className={styles.templateRange}>Custom</span>
            <span className={styles.templateOpen}>
              Start
              <ArrowRight size={14} aria-hidden="true" />
            </span>
          </Link>
        </div>
      ) : null}

      {tab === "recent" ? (
        <Card>
          <SectionHeader
            title="Recent exports"
            subtitle="Generated locally from the approved-hours record"
          />
          {[
            ["October board update", "Impact report", "Oct 12, 2026 · PDF"],
            ["Saturday coverage review", "Coverage by program", "Oct 10, 2026 · CSV"],
            ["Volunteer participation", "Participation", "Oct 6, 2026 · CSV"],
          ].map(([name, type, meta]) => (
            <div className={styles.asideRow} key={name}>
              <div>
                <div style={{ fontWeight: 560 }}>{name}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{meta}</div>
              </div>
              <Badge tone="neutral">{type}</Badge>
            </div>
          ))}
          <p className={styles.tableNote}>
            Exports are generated on this device and never uploaded. Build a new report to refresh
            the numbers.
          </p>
        </Card>
      ) : null}
    </Page>
  );
}
