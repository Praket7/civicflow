import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { MissionControlSummary } from "../../../types/domain";
import { t } from "../../../lib/i18n";
import { formatNumber } from "../../../lib/workspace/selectors";
import styles from "../MissionControl.module.css";

interface MetricStripProps {
  data: MissionControlSummary;
}

export function MetricStrip({ data }: MetricStripProps) {
  const metrics = [
    {
      id: "volunteers",
      value: String(data.activeVolunteers),
      label: t("Active volunteers"),
      support: t("on the roster"),
      to: "/coordinator/volunteers",
    },
    {
      id: "coverage",
      value: `${data.coveragePercent}%`,
      label: t("Role coverage"),
      support: t("next 30 days"),
      to: "/coordinator/coverage",
    },
    {
      id: "hours",
      value: `${formatNumber(data.hoursThisMonth)} h`,
      label: t("Hours this month"),
      support: t("approved and pending"),
      to: "/coordinator/reports",
    },
    {
      id: "shifts",
      value: String(data.upcomingShifts),
      label: t("Upcoming shifts"),
      support: t(data.attentionCount === 1 ? "{count} needs people" : "{count} need people", {
        count: data.attentionCount,
      }),
      to: "/coordinator/schedule",
    },
  ];

  return (
    <ul className={styles.metrics}>
      {metrics.map((metric) => (
        <li key={metric.id}>
          <Link
            className={styles.metricCard}
            to={metric.to}
            aria-label={`${metric.value} ${metric.label}`}
          >
            <span className={styles.metricValue}>{metric.value}</span>
            <span className={styles.metricLabel}>{metric.label}</span>
            <span className={styles.metricSupport}>
              {metric.support}
              <ArrowUpRight size={11} aria-hidden="true" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
