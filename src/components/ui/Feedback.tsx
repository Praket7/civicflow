import type { ReactNode } from "react";
import { t } from "../../lib/i18n";
import styles from "./ui.module.css";

export function EmptyState({
  title,
  copy,
  action,
}: {
  title: string;
  copy?: string;
  action?: ReactNode;
}) {
  return (
    <div className={styles.empty}>
      <p className={styles.emptyTitle}>{t(title)}</p>
      {copy ? <p className={styles.emptyCopy}>{t(copy)}</p> : null}
      {action}
    </div>
  );
}

export function ProgressBar({
  value,
  tone = "var(--color-green)",
  label,
}: {
  value: number;
  tone?: string;
  label: string;
}) {
  return (
    <div
      className={styles.progress}
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={styles.progressBar}
        style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: tone }}
      />
    </div>
  );
}
