import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { t } from "../../../lib/i18n";
import type { AttentionItem } from "../../../types/domain";
import { useWorkspace } from "../../../lib/workspace/session";
import styles from "../MissionControl.module.css";

interface SuggestedCardProps {
  attention: AttentionItem[];
}

export function SuggestedCard({ attention }: SuggestedCardProps) {
  const { workspace } = useWorkspace();
  const gap = attention[0];
  const nothingScheduled = workspace.shifts.length === 0;

  const title = gap
    ? t("Close the next gap")
    : nothingScheduled
      ? t("Publish your first shift")
      : t("Lock in the week");
  const body = gap
    ? t("{program} is short: {gap}. AutoRoster will show who can take it and why.", {
        program: gap.title,
        gap: gap.detail.split(" · ")[0],
      })
    : nothingScheduled
      ? t(
          "Nothing is on the calendar yet. Add a shift and CivicFlow will track who is still needed.",
        )
      : t("Every role is covered. Review the roster and lock in the week.");

  return (
    <section className={`${styles.suggested}`} aria-labelledby="mc-suggested">
      <p className={styles.suggestedEyebrow}>If you do one thing</p>
      <h2 id="mc-suggested" className={styles.suggestedTitle}>
        {title}
      </h2>
      <p className={styles.suggestedBody}>{body}</p>
      <Link
        className={styles.suggestedLink}
        to={gap || !nothingScheduled ? "/coordinator/autoroster" : "/coordinator/schedule"}
      >
        {gap || !nothingScheduled ? t("Try AutoRoster") : t("Open the schedule")}
        <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </section>
  );
}
