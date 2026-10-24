import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { CoverageDay } from "../../../types/domain";
import { t } from "../../../lib/i18n";
import styles from "../MissionControl.module.css";

interface WeekCoverageCardProps {
  days: CoverageDay[];
}

function toneFor(percent: number) {
  if (percent >= 90) return "good";
  if (percent >= 75) return "watch";
  return "risk";
}

export function WeekCoverageCard({ days }: WeekCoverageCardProps) {
  return (
    <section className={`${styles.card} ${styles.weekCard}`} aria-labelledby="mc-week">
      <div className={styles.cardHead}>
        <div>
          <h2 id="mc-week" className={styles.sectionTitle}>
            This week&rsquo;s shifts
          </h2>
          <p className={styles.cardKicker}>Seats filled, day by day</p>
        </div>
        <Link className={styles.textLink} to="/coordinator/schedule">
          Open the week
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>

      <ul className={styles.bars} aria-label="Seat fill by day">
        {days.map((day) => {
          const dayName = t(day.key.charAt(0).toUpperCase() + day.key.slice(1));
          const dayNumber = day.label.match(/(\S+)$/)?.[1] ?? day.label;
          const label = `${dayName} ${dayNumber}`;
          return (
            <li
              key={day.key}
              className={styles.barColumn}
              aria-label={`${label}: ${day.percent}%, ${day.confirmed} ${t("of")} ${day.capacity} ${t("seats filled")}`}
            >
              <span className={styles.barDayName}>{dayName}</span>
              <span className={styles.barDay}>{dayNumber}</span>
              <span
                className={styles.barPercent}
                data-tone={toneFor(day.percent)}
                aria-hidden="true"
              >
                {day.percent}%
              </span>
              <span className={styles.barTrack} aria-hidden="true">
                <span
                  className={styles.barFill}
                  data-tone={toneFor(day.percent)}
                  style={{ height: `${Math.max(day.percent, 6)}%` }}
                />
              </span>
            </li>
          );
        })}
      </ul>

      <table className="visually-hidden">
        <caption>Seat fill by day this week</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Filled seats</th>
            <th scope="col">Capacity</th>
            <th scope="col">Percent</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.key}>
              <th scope="row">
                {t(day.key.charAt(0).toUpperCase() + day.key.slice(1))}{" "}
                {day.label.match(/(\S+)$/)?.[1] ?? day.label}
              </th>
              <td>{day.confirmed}</td>
              <td>{day.capacity}</td>
              <td>{day.percent}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
