import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { AttentionItem, Cause } from "../../../types/domain";
import { t } from "../../../lib/i18n";
import styles from "../MissionControl.module.css";

interface AttentionCardProps {
  items: AttentionItem[];
  count: number;
}

const causeTone: Record<Cause, string> = {
  food: "coral",
  education: "violet",
  environment: "teal",
  health: "cyan",
  community: "orange",
  animals: "rose",
};

export function AttentionCard({ items, count }: AttentionCardProps) {
  return (
    <section className={`${styles.card} ${styles.attentionCard}`} aria-labelledby="mc-attention">
      <div className={styles.cardHead}>
        <h2 id="mc-attention" className={styles.sectionTitle}>
          What needs a hand
        </h2>
        <span className={styles.countBadge}>
          {count} {t(count === 1 ? "gap" : "gaps")}
        </span>
      </div>

      {items.length === 0 ? (
        <div className={styles.emptyAttention}>
          <p className={styles.emptyTitle}>Every shift is covered.</p>
          <p className={styles.emptyText}>
            The next two weeks are fully staffed. Nothing to chase today.
          </p>
          <Link className={styles.textLink} to="/coordinator/schedule">
            Review the schedule
          </Link>
        </div>
      ) : (
        <ul className={styles.attentionList}>
          {items.map((item) => (
            <li key={item.id}>
              <Link className={styles.attentionRow} to={item.href}>
                <span
                  className={styles.attentionDot}
                  data-tone={causeTone[item.cause]}
                  aria-hidden="true"
                />
                <span className={styles.attentionText}>
                  <span className={styles.attentionTitle}>
                    {item.title}
                    {item.severity === "critical" ? (
                      <span className={styles.criticalTag}>{t("Critical")}</span>
                    ) : null}
                  </span>
                  <span className={styles.attentionDetail}>{item.detail}</span>
                </span>
                <ChevronRight size={16} className={styles.chevron} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 ? (
        <Link className={styles.attentionFooter} to="/coordinator/coverage">
          See every gap on the coverage board
        </Link>
      ) : null}
    </section>
  );
}
