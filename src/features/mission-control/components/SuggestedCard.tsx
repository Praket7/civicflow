import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { t } from "../../../lib/i18n";
import type { AttentionItem } from "../../../types/domain";
import styles from "../MissionControl.module.css";

interface SuggestedCardProps {
  attention: AttentionItem[];
}

export function SuggestedCard({ attention }: SuggestedCardProps) {
  const gap = attention[0];

  return (
    <section className={`${styles.suggested}`} aria-labelledby="mc-suggested">
      <p className={styles.suggestedEyebrow}>If you do one thing</p>
      <h2 id="mc-suggested" className={styles.suggestedTitle}>
        Fill the driver seat
      </h2>
      <p className={styles.suggestedBody}>
        {gap
          ? t("{program} is short: {gap}. AutoRoster will show who can take it and why.", {
              program: gap.title,
              gap: gap.detail.split(" · ")[0],
            })
          : t("Every role is covered. Review the roster and lock in the week.")}
      </p>
      <Link className={styles.suggestedLink} to="/coordinator/autoroster">
        Try AutoRoster
        <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </section>
  );
}
