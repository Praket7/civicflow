import { ArrowRight } from "lucide-react";
import { parseISO } from "date-fns";
import { Link } from "react-router-dom";
import type { MissionControlSummary } from "../../../types/domain";
import { t } from "../../../lib/i18n";
import { formatLongDate, formatTime, timeRange } from "../../../lib/workspace/selectors";
import { demoWorkspace } from "../../../lib/workspace/dataset";
import styles from "../MissionControl.module.css";

interface MissionHeroProps {
  data: MissionControlSummary;
}

function greetingFor(iso: string): string {
  const hour = parseISO(iso).getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function MissionHero({ data }: MissionHeroProps) {
  const now = parseISO(data.demoNow);
  const today = demoWorkspace.shifts.find(
    (shift) => shift.startsAt.slice(0, 10) === data.demoNow.slice(0, 10),
  );
  const todayOpportunity = today
    ? demoWorkspace.opportunities.find((row) => row.id === today.opportunityId)
    : undefined;
  const greeting = t(greetingFor(data.demoNow));
  const openToday = today ? timeRange(today.startsAt, today.endsAt) : t("No shift today");

  return (
    <section className={styles.hero} aria-labelledby="mc-greeting">
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}>
          <span>{formatLongDate(now)}</span>
          <span className={styles.eyebrowRule} aria-hidden="true" />
          <span>Mission Control</span>
        </p>
        <h1 id="mc-greeting" className={styles.greeting}>
          {greeting}, {data.firstName}.
        </h1>
        <p className={styles.heroSub}>
          {todayOpportunity
            ? `${todayOpportunity.title} ${t("opens at")} ${formatTime(today!.startsAt)}. `
            : `${t("The next shift is on the schedule.")} `}
          {data.attentionCount === 0
            ? t("Every role is covered this week.")
            : t(
                data.attentionCount === 1
                  ? "{count} shift still needs people this week."
                  : "{count} shifts still need people this week.",
                { count: data.attentionCount },
              )}
        </p>
        <p className={styles.heroMeta}>
          {data.organizationName} · {demoWorkspace.organization.address}
        </p>

        <div className={styles.heroActions}>
          <Link className={styles.primaryAction} to="/coordinator/schedule">
            Open the schedule
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
          <Link className={styles.ghostAction} to="/coordinator/impact">
            See this year&rsquo;s impact
          </Link>
        </div>

        <dl className={styles.heroFacts}>
          <div>
            <dt>{t("Today")}</dt>
            <dd>{openToday}</dd>
          </div>
          <div>
            <dt>{t("Roster")}</dt>
            <dd>
              {data.activeVolunteers} {t("active volunteers")}
            </dd>
          </div>
          <div>
            <dt>{t("Coverage")}</dt>
            <dd>
              {data.coveragePercent}% {t("of role slots filled")}
            </dd>
          </div>
        </dl>
      </div>

      <figure className={styles.heroFigure}>
        <img
          className={styles.heroImage}
          src="/media/hero-community.jpg"
          alt="Volunteers packing food boxes together at a community pantry"
          width={1600}
          height={760}
          fetchPriority="high"
        />
        <figcaption className={styles.heroCaption}>
          <span>Packing day at the Holt Street pantry</span>
          <span>Photo: Pexels / 6646918</span>
        </figcaption>
      </figure>
    </section>
  );
}
