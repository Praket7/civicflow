import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarCheck2,
  Check,
  Clock3,
  Copy,
  FileCheck2,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  AreaChart,
  Badge,
  Button,
  ButtonLink,
  Card,
  DonutChart,
  Page,
  SectionHeader,
  StatCard,
} from "../../components/ui";
import { CAUSE_COLORS } from "../../lib/causes";
import { t } from "../../lib/i18n";
import { useWorkspace } from "../../lib/workspace/session";
import { WorkAreaTabs } from "../../components/navigation/WorkAreaTabs";
import { hoursTabs } from "../../app/workAreas";
import {
  CAUSE_LABELS,
  currentVolunteer,
  formatDate,
  formatMinutes,
  getHourRows,
  getImpactStories,
  getVolunteerImpact,
} from "../../lib/workspace/selectors";
import { MilestoneCard } from "./MilestoneCard";
import styles from "./PersonalImpactPage.module.css";

function displayHours(minutes: number): string {
  const hours = minutes / 60;
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

function cumulativePoints(
  rows: { date: string; approvedMinutes: number | null; requestedMinutes: number }[],
) {
  let total = 0;
  return [
    { label: "Start", value: 0 },
    ...rows.map((row) => {
      total += row.approvedMinutes ?? row.requestedMinutes;
      return { label: format(parseISO(row.date), "MMM d"), value: total };
    }),
  ];
}

export function PersonalImpactPage() {
  const { workspace, session } = useWorkspace();
  const volunteer = currentVolunteer(workspace);
  const impact = getVolunteerImpact(volunteer.id, session, workspace);
  const stories = getImpactStories(workspace).slice(0, 3);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const causes = useMemo(
    () => [...impact.causes].sort((first, second) => second.minutes - first.minutes),
    [impact.causes],
  );
  const strongest = causes[0];

  const rows = useMemo(
    () =>
      getHourRows(session, workspace)
        .filter((row) => row.volunteer.id === volunteer.id)
        .slice()
        .sort((first, second) => first.date.localeCompare(second.date)),
    [session, volunteer.id, workspace],
  );
  const verifiedRows = rows.filter((row) => row.status === "verified" && row.verificationId);
  const verificationCount = session.verifications.filter(
    (record) => record.volunteerId === volunteer.id,
  ).length;

  const series = useMemo(() => cumulativePoints(rows), [rows]);

  async function copySummary() {
    const summary = [
      `${volunteer.name} — CivicFlow impact summary`,
      `${displayHours(impact.summary.totalMinutes)} hours recorded (${displayHours(impact.summary.verifiedMinutes)} verified), ${impact.summary.events} programs, ${verificationCount} verification records, ${volunteer.attendanceRate}% attendance.`,
      `Strongest cause: ${strongest ? `${strongest.label} (${strongest.percent}%)` : "Not enough data yet"}.`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(summary);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <Page>
      <WorkAreaTabs label="Hours and impact" items={hoursTabs} />
      <section className={styles.hero} aria-labelledby="impact-title">
        <img
          className={styles.heroImage}
          src="/media/buffalo-skyline.jpg"
          alt=""
          aria-hidden="true"
        />
        <div className={styles.heroScrim} aria-hidden="true" />
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Your 2026 impact</p>
          <h1 className={styles.heroTitle} id="impact-title">
            <span className={styles.heroHours}>
              {displayHours(impact.summary.totalMinutes)} hours
            </span>
            <span className={styles.heroStatement}>given back to your community.</span>
          </h1>
          <p className={styles.heroMeta}>
            Since {format(parseISO(volunteer.joinedAt), "MMMM yyyy")} · {impact.summary.events}{" "}
            programs · {displayHours(impact.summary.verifiedMinutes)} hours verified
          </p>
          <div className={styles.heroActions}>
            <ButtonLink
              to="/volunteer/verification"
              variant="primary"
              icon={<ArrowRight size={14} />}
            >
              View service record
            </ButtonLink>
            <Button
              variant="secondary"
              className={styles.copyButton}
              icon={copyState === "copied" ? <Check size={14} /> : <Copy size={14} />}
              onClick={() => {
                void copySummary();
              }}
            >
              {t(copyState === "copied" ? "Summary copied" : "Copy my impact")}
            </Button>
          </div>
          <p className={styles.liveRegion} role="status" aria-live="polite">
            {copyState === "failed" ? "Copy failed. Your browser blocked clipboard access." : ""}
          </p>
        </div>

        <aside className={styles.heroAside} aria-label="Service record snapshot">
          <div className={styles.asideHead}>
            <span className={styles.asideLabel}>Service record</span>
            <span className={styles.asideYear}>2026</span>
          </div>
          <p className={styles.asideValue}>
            {displayHours(impact.summary.verifiedMinutes)}
            <span className={styles.asideUnit}>hours verified</span>
          </p>
          <p className={styles.asideCopy}>
            Signed off by {workspace.organization.name} across {impact.summary.events} programs.
          </p>
          <div className={styles.heroAsideFoot}>
            <span>
              {t("{hours} h awaiting review", {
                hours: displayHours(impact.summary.pendingMinutes),
              })}
            </span>
            <Link className={styles.heroAsideLink} to="/volunteer/hours">
              My hours <ArrowUpRight size={12} aria-hidden="true" />
            </Link>
          </div>
        </aside>
      </section>

      <div className={styles.statGrid}>
        <StatCard
          icon={Clock3}
          tone="green"
          value={`${displayHours(impact.summary.verifiedMinutes)}h`}
          label="Verified service"
          meta={t("{duration} pending", {
            duration: formatMinutes(impact.summary.pendingMinutes),
          })}
        />
        <StatCard
          icon={CalendarCheck2}
          tone="cobalt"
          value={impact.summary.events}
          label="Programs served"
          meta={t("Across {count} causes", { count: causes.length })}
        />
        <StatCard
          icon={FileCheck2}
          tone="coral"
          value={verificationCount}
          label="Verification records"
          meta="Issued from approved hours"
        />
        <StatCard
          icon={Users}
          tone="amber"
          value={`${volunteer.attendanceRate}%`}
          label="Attendance rate"
          meta={t("{count} completed events", { count: volunteer.eventsCompleted })}
        />
      </div>

      <div className={styles.chartGrid}>
        <Card className={styles.chartCard}>
          <SectionHeader
            title="Impact by cause"
            subtitle="Where your recorded hours went"
            action={
              <Link className={styles.textLink} to="/volunteer/verification">
                Full record
              </Link>
            }
          />
          <div className={styles.donutArea}>
            <DonutChart
              data={causes.map((cause) => ({
                label: cause.label,
                value: cause.minutes,
                color: CAUSE_COLORS[cause.cause],
              }))}
              centerValue={`${displayHours(impact.summary.totalMinutes)}h`}
              centerLabel="recorded"
              size={162}
              label="Your recorded hours split by cause"
              valueFormatter={(minutes) => formatMinutes(minutes)}
            />
          </div>
          <div className={styles.chartFoot}>
            <span className={styles.chartFootLabel}>Causes</span>
            <span className={styles.chartFootValue}>{causes.length}</span>
            <span className={styles.chartFootDivider} aria-hidden="true" />
            <span className={styles.chartFootLabel}>Programs</span>
            <span className={styles.chartFootValue}>{impact.summary.events}</span>
          </div>
        </Card>

        <Card className={styles.chartCard}>
          <SectionHeader
            title="Your impact over time"
            subtitle="Cumulative hours from your service record"
            action={
              <Badge tone="green">{t("{count} verified", { count: verifiedRows.length })}</Badge>
            }
          />
          <AreaChart
            data={series}
            label="Cumulative volunteer hours across your recorded shifts"
            height={178}
            formatValue={(minutes) => formatMinutes(minutes)}
          />
          <div className={styles.chartFoot}>
            <span className={styles.chartFootLabel}>Hours recorded</span>
            <span className={styles.chartFootValue}>
              {displayHours(impact.summary.totalMinutes)} h
            </span>
            <span className={styles.chartFootDivider} aria-hidden="true" />
            <span className={styles.chartFootLabel}>Verified</span>
            <span className={styles.chartFootValue}>
              {displayHours(impact.summary.verifiedMinutes)} h
            </span>
          </div>
        </Card>
      </div>

      <div className={styles.lowerGrid}>
        <Card className={styles.timelineCard}>
          <SectionHeader
            title="Shift by shift"
            subtitle="Verified service behind your total"
            action={
              <Link className={styles.textLink} to="/volunteer/verification">
                All records
              </Link>
            }
          />
          {verifiedRows.length === 0 ? (
            <p className={styles.emptyNote}>
              Verified shifts will appear here after a coordinator approves your hours.
            </p>
          ) : (
            <ul className={styles.timeline}>
              {verifiedRows.map((row) => {
                const verifiedLabel = row.verificationId ?? "";
                return (
                  <li className={styles.timelineRow} key={row.id}>
                    <span className={styles.timelineMark} aria-hidden="true">
                      <Check size={13} strokeWidth={2.4} />
                    </span>
                    <div className={styles.timelineMain}>
                      <p className={styles.timelineTitle}>{row.opportunity.title}</p>
                      <p className={styles.timelineMeta}>
                        {formatDate(row.date)} · {CAUSE_LABELS[row.opportunity.cause]} ·{" "}
                        <span className={styles.mono}>{verifiedLabel}</span>
                      </p>
                    </div>
                    <span className={styles.timelineMinutes}>
                      {formatMinutes(row.approvedMinutes ?? row.requestedMinutes)}
                    </span>
                    <Link
                      className={styles.timelineLink}
                      to="/volunteer/verification"
                      aria-label={`View verification record ${verifiedLabel}`}
                    >
                      Record <ArrowUpRight size={12} aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {causes.length > 0 ? (
            <div className={styles.causeStrip} role="group" aria-label="Hours by cause">
              {causes.map((cause) => (
                <div className={styles.causeStripItem} key={cause.cause}>
                  <span
                    className={styles.causeDot}
                    style={{ background: CAUSE_COLORS[cause.cause] }}
                    aria-hidden="true"
                  />
                  <span className={styles.causeStripLabel}>{cause.label}</span>
                  <span className={styles.causeStripValue}>
                    {formatMinutes(cause.minutes)} · {cause.percent}%
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </Card>

        <Card className={styles.strongestCard}>
          <p className={styles.strongestEyebrow}>Your strongest cause</p>
          <p className={styles.strongestTitle}>
            {strongest ? strongest.label : "Just getting started"}
          </p>
          <p className={styles.strongestStat}>
            {strongest
              ? t("{duration} of your recorded time", {
                  duration: formatMinutes(strongest.minutes),
                })
              : t("Serve a shift to see your pattern")}
          </p>
          <p className={styles.strongestBody}>
            {strongest
              ? `${strongest.percent}% of your service this year went to ${strongest.label.toLowerCase()} work.`
              : "Your cause mix will appear after your first verified shift."}
          </p>
          <Link className={styles.strongestLink} to="/volunteer/discover">
            Find another {strongest ? strongest.label.toLowerCase() : "cause"} shift
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </Card>
      </div>

      <Card className={styles.momentsCard}>
        <SectionHeader
          title="Moments that mattered"
          subtitle="Your hours became these outcomes"
          action={
            <Link className={styles.textLink} to="/credits">
              Photo credits
            </Link>
          }
        />
        <div className={styles.momentsGrid}>
          {stories.map((story) => (
            <Link className={styles.story} to="/volunteer/discover" key={story.id}>
              <div className={styles.storyImageWrap}>
                <img className={styles.storyImage} src={story.image} alt="" />
                <span className={styles.storyCause}>{CAUSE_LABELS[story.cause]}</span>
              </div>
              <div className={styles.storyBody}>
                <h3 className={styles.storyTitle}>{story.title}</h3>
                <p className={styles.storyCopy}>{story.body}</p>
                <span className={styles.storyMetric}>
                  {story.metric}
                  <ArrowUpRight size={12} aria-hidden="true" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </Card>
      {volunteer ? (
        <MilestoneCard volunteerId={volunteer.id} organization={workspace.organization.name} />
      ) : null}
    </Page>
  );
}
