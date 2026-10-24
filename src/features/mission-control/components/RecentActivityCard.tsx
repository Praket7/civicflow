import { Link } from "react-router-dom";
import type { ActivityItem } from "../../../types/domain";
import { formatTime } from "../../../lib/workspace/selectors";
import styles from "../MissionControl.module.css";

interface RecentActivityCardProps {
  items: ActivityItem[];
}

export function RecentActivityCard({ items }: RecentActivityCardProps) {
  return (
    <section className={`${styles.card} ${styles.activityCard}`} aria-labelledby="mc-activity">
      <div className={styles.cardHead}>
        <h2 id="mc-activity" className={styles.sectionTitle}>
          Recent Activity
        </h2>
        <Link className={styles.textLink} to="/coordinator/audit">
          Audit log
        </Link>
      </div>

      <ul className={styles.activityList}>
        {items.map((item) => (
          <li key={item.id} className={styles.activityRow}>
            <span className={styles.activityDot} data-tone={item.tone} aria-hidden="true" />
            <span className={styles.activityText}>
              <span className={styles.activityLine}>
                <strong>{item.name}</strong> {item.action.toLowerCase()}
              </span>
              <span className={styles.activityDetail}>{item.detail}</span>
            </span>
            <time className={styles.activityTime} dateTime={item.at}>
              {formatTime(item.at)}
            </time>
          </li>
        ))}
      </ul>
    </section>
  );
}
