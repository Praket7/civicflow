import { Badge, Card, SectionHeader } from "../../components/ui";
import { t } from "../../lib/i18n";
import { useRetentionSignals } from "../../lib/workspace/queries";
import styles from "./RetentionSignals.module.css";
import type { RetentionSignalKind } from "../../types/domain";

const SIGNAL_LABEL: Record<RetentionSignalKind, string> = {
  inactive: "Inactive",
  newVolunteerAtRisk: "New volunteer at risk",
  highlyEngaged: "Highly engaged",
  credentialBlocker: "Credential blocker",
};

const SIGNAL_TONE: Record<RetentionSignalKind, "amber" | "red" | "green" | "cobalt"> = {
  inactive: "amber",
  newVolunteerAtRisk: "red",
  highlyEngaged: "green",
  credentialBlocker: "cobalt",
};

/**
 * The people a coordinator should act on this week. Each one is a rule with its
 * threshold written into the reason, plus the history that produced it and the
 * step being suggested — no score, and nothing called a prediction.
 */
export function RetentionSignalsCard() {
  const { data, error } = useRetentionSignals();
  const signals = data ?? [];
  const active = signals.filter((signal) => signal.signal !== "highlyEngaged").length;

  return (
    <Card className={styles.card} ariaLabel={t("Retention signals")}>
      <SectionHeader
        title="Retention signals"
        subtitle={t(
          "Transparent rules over the service record. Each one names its threshold and the action it suggests.",
        )}
        action={
          <Badge tone={active > 0 ? "amber" : "neutral"} dot>
            {t(active === 1 ? "{count} needs attention" : "{count} need attention", {
              count: active,
            })}
          </Badge>
        }
      />
      {error ? (
        <p className={styles.error} role="alert">
          {error instanceof Error ? error.message : String(error)}
        </p>
      ) : null}
      {signals.length === 0 ? (
        <p className={styles.empty}>
          {t("Nothing needs attention. No rule fired for this roster.")}
        </p>
      ) : (
        <ul className={styles.list}>
          {signals.map((signal) => (
            <li key={`${signal.volunteerId}-${signal.signal}`} className={styles.row}>
              <div className={styles.identity}>
                <span className={styles.initials} aria-hidden="true">
                  {signal.initials}
                </span>
                <span>
                  <span className={styles.name}>{signal.name}</span>
                  <Badge tone={SIGNAL_TONE[signal.signal]}>{t(SIGNAL_LABEL[signal.signal])}</Badge>
                </span>
              </div>
              <p className={styles.reason}>{signal.reason}</p>
              {signal.history.length === 0 ? null : (
                <ul className={styles.history}>
                  {signal.history.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
              <p className={styles.action}>{signal.suggestedAction}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
