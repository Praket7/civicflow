import { Download, FileText, Mail, Printer } from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  Page,
  PageHeader,
  SectionHeader,
} from "../../components/ui";
import { CAUSE_COLORS } from "../../lib/causes";
import { useWorkspace } from "../../lib/workspace/session";
import { WorkAreaTabs } from "../../components/navigation/WorkAreaTabs";
import { reportTabs } from "../../app/workAreas";
import { formatMinutes, getImpactStories, getReportPreview } from "../../lib/workspace/selectors";
import styles from "./Reports.module.css";

export function ImpactReportPage() {
  const { workspace, session } = useWorkspace();
  const report = getReportPreview(session, workspace);
  const stories = getImpactStories(workspace);
  const topCause = report.causes[0];
  const maxCause = Math.max(...report.causes.map((cause) => cause.hours), 1);

  return (
    <Page>
      <WorkAreaTabs label="Reports" items={reportTabs} />
      <PageHeader
        eyebrow="Reporting"
        title="Impact report preview"
        description="A short, printable summary built only from approved hours. Print it or save it as a PDF once the numbers look right."
        backTo="/coordinator/reports"
        backLabel="Reports"
        actions={
          <>
            <ButtonLink to="/coordinator/reports" variant="secondary" icon={<FileText size={14} />}>
              All reports
            </ButtonLink>
            <Button variant="primary" icon={<Printer size={14} />} onClick={() => window.print()}>
              Print / save PDF
            </Button>
          </>
        }
      />

      <div className={styles.reportShell}>
        <article className={styles.reportPaper} aria-label="Impact report preview">
          <section className={styles.reportCover}>
            <img className={styles.coverImage} src="/media/buffalo-skyline.jpg" alt="" />
            <span className={styles.coverOverlay} aria-hidden="true" />
            <p className={styles.coverKicker}>{`${workspace.organization.name} · Annual impact`}</p>
            <h2 className={styles.coverTitle}>Service that stays in the neighborhood.</h2>
            <p className={styles.coverMeta}>
              {report.period} · Generated from {workspace.impact.uniqueVolunteersYtd} unique
              volunteers and approved service records.
            </p>
          </section>

          <section className={styles.reportSection}>
            <h2 className={styles.reportSectionTitle}>The year in numbers</h2>
            <p style={{ marginTop: 5, fontSize: 13.5, color: "var(--text-muted)" }}>
              Every figure below comes from the same verified record used on volunteer certificates.
            </p>
            <div className={styles.reportStats}>
              <div className={styles.reportStat}>
                <div className={styles.reportStatValue}>
                  {report.totals.hoursYtd.toLocaleString()}
                </div>
                <div className={styles.reportStatLabel}>verified hours</div>
              </div>
              <div className={styles.reportStat}>
                <div className={styles.reportStatValue}>{report.totals.uniqueVolunteersYtd}</div>
                <div className={styles.reportStatLabel}>unique volunteers</div>
              </div>
              <div className={styles.reportStat}>
                <div className={styles.reportStatValue}>
                  {report.totals.mealsPacked.toLocaleString()}
                </div>
                <div className={styles.reportStatLabel}>meals packed</div>
              </div>
              <div className={styles.reportStat}>
                <div className={styles.reportStatValue}>
                  {report.totals.familiesServedThisMonth}
                </div>
                <div className={styles.reportStatLabel}>families served this year</div>
              </div>
            </div>
          </section>

          <section className={styles.reportSection}>
            <h2 className={styles.reportSectionTitle}>Where the hours went</h2>
            <p style={{ marginTop: 5, fontSize: 13.5, color: "var(--text-muted)" }}>
              {topCause
                ? `${topCause.label} accounts for ${topCause.percent}% of approved hours this month.`
                : "Approved hours will appear here once service records are reviewed."}
            </p>
            <div style={{ marginTop: 10 }}>
              {report.causes.map((cause) => (
                <div className={styles.causeRow} key={cause.cause}>
                  <span>{cause.label}</span>
                  <span className={styles.causeBar}>
                    <span
                      className={styles.causeFill}
                      style={{
                        width: `${Math.round((cause.hours / maxCause) * 100)}%`,
                        background: CAUSE_COLORS[cause.cause] ?? "var(--color-cobalt)",
                      }}
                    />
                  </span>
                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {cause.hours} h · {cause.percent}%
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.reportSection}>
            <h2 className={styles.reportSectionTitle}>What it made possible</h2>
            <p
              style={{
                marginTop: 5,
                fontSize: 13.5,
                lineHeight: 1.6,
                color: "var(--text-secondary)",
              }}
            >
              {stories.map((story) => story.body).join(" ")}
            </p>
            <div className={styles.photoStrip}>
              {stories.map((story) => (
                <img key={story.id} src={story.image} alt={story.title} />
              ))}
            </div>
          </section>

          <section className={styles.reportSection}>
            <h2 className={styles.reportSectionTitle}>How this was measured</h2>
            <p
              style={{
                marginTop: 5,
                fontSize: 13,
                lineHeight: 1.6,
                color: "var(--text-secondary)",
              }}
            >
              Hours are stored as integer minutes, calculated from check-in and check-out evidence,
              then reviewed by a coordinator. Adjustments require a reason. This report counts only
              approved minutes; pending and rejected submissions are excluded. Volunteer
              verification codes are generated from the same record. The demo workspace’s
              participation totals describe {workspace.impact.activeVolunteers} currently active
              volunteers and {workspace.impact.uniqueVolunteersYtd} unique volunteers served
              year-to-date, so the two numbers are labeled separately on every screen.
            </p>
            <p style={{ marginTop: 8, fontSize: 12.5, color: "var(--text-muted)" }}>
              Coverage: {report.coverage.filledSlots} of {report.coverage.roleSlots} required role
              slots filled across {report.coverage.upcomingShifts} upcoming shifts. Prepared by{" "}
              {workspace.coordinator.name}. Contact {workspace.organization.email}.
            </p>
          </section>
        </article>

        <aside className={styles.reportAside}>
          <Card padding="compact">
            <SectionHeader title="Report details" subtitle="Current workspace snapshot" />
            <div className={styles.asideRow}>
              <span>Organization</span>
              <span style={{ fontWeight: 560 }}>{workspace.organization.name}</span>
            </div>
            <div className={styles.asideRow}>
              <span>Period</span>
              <span>Jan 1 – Oct 13, 2026</span>
            </div>
            <div className={styles.asideRow}>
              <span>Source</span>
              <span>Approved hours only</span>
            </div>
            <div className={styles.asideRow}>
              <span>Verification records</span>
              <span>{report.totals.shiftsCompleted} shifts</span>
            </div>
            <div className={styles.asideRow}>
              <span>Prepared by</span>
              <span>{workspace.coordinator.name}</span>
            </div>
            <div className={styles.asideRow}>
              <span>Attendance</span>
              <span>{report.totals.attendanceRate}%</span>
            </div>
            <div className={styles.asideRow}>
              <span>Avg. approved session</span>
              <span>
                {formatMinutes(
                  (report.totals.hoursYtd / Math.max(1, report.totals.shiftsCompleted)) * 60,
                )}
              </span>
            </div>
          </Card>

          <Card padding="compact">
            <SectionHeader title="Before you share" />
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Badge tone="green" dot>
                Approved hours only
              </Badge>
              <Badge tone="cobalt" dot>
                Local report — no cloud upload
              </Badge>
              <Button
                variant="secondary"
                size="small"
                icon={<Download size={12} />}
                onClick={() => window.print()}
              >
                Save as PDF
              </Button>
              <a
                href={`mailto:?subject=${encodeURIComponent(`${workspace.organization.name} impact report`)}&body=${encodeURIComponent(
                  `${report.totals.hoursYtd} verified hours, ${report.totals.mealsPacked} meals packed, ${report.totals.familiesServedThisMonth} families served this year.`,
                )}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 13,
                  padding: "6px 0",
                  color: "var(--action-primary)",
                  textDecoration: "none",
                }}
              >
                <Mail size={12} aria-hidden="true" /> Share by email
              </a>
            </div>
          </Card>

          <Card padding="compact" surface="dark">
            <p style={{ fontFamily: "var(--font-serif)", fontSize: 17, lineHeight: 1.35 }}>
              “Numbers are evidence. The story is why anyone shows up again.”
            </p>
            <p style={{ marginTop: 8, fontSize: 12.5, color: "rgba(255,255,255,0.55)" }}>
              CivicFlow reporting note
            </p>
          </Card>
        </aside>
      </div>
    </Page>
  );
}
