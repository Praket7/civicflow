import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { ImpactSummary } from "../../../types/domain";
import { t } from "../../../lib/i18n";
import { formatNumber } from "../../../lib/workspace/selectors";
import styles from "../MissionControl.module.css";

interface CommunityMotionCardProps {
  impact: ImpactSummary;
  photos: string[];
}

const photoAlt = [
  "Volunteers loading food supplies",
  "A tutor reading with a young student",
  "A volunteer tending a community garden",
];

export function CommunityMotionCard({ impact, photos }: CommunityMotionCardProps) {
  const photoDescription = photoAlt.map((description) => t(description)).join(". ");

  return (
    <section className={`${styles.card} ${styles.motionCard}`} aria-labelledby="mc-motion">
      <div className={styles.cardHead}>
        <h2 id="mc-motion" className={styles.sectionTitle}>
          From the floor
        </h2>
      </div>

      <div className={styles.motionBody}>
        <div className={styles.photoStrip} aria-hidden="true">
          {photos.map((photo) => (
            <img key={photo} src={photo} alt="" loading="lazy" />
          ))}
          <span className="visually-hidden">{photoDescription}</span>
        </div>
        <div className={styles.motionStat}>
          <p className={styles.motionNumber}>
            {formatNumber(impact.familiesServedThisMonth)}
            <span> families served</span>
          </p>
          <p className={styles.motionSub}>since January</p>
        </div>
      </div>

      <div className={styles.motionFooter}>
        <p className={styles.motionMeta}>
          {formatNumber(impact.mealsPacked)} meals packed · {formatNumber(impact.tutoringSessions)}{" "}
          tutoring sessions
        </p>
        <Link className={styles.textLink} to="/coordinator/impact">
          See the impact
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
