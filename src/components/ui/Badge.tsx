import type { ReactNode } from "react";
import { t } from "../../lib/i18n";
import styles from "./ui.module.css";

type Tone = "neutral" | "green" | "amber" | "red" | "cobalt" | "violet" | "lime" | "dark";

const toneClass: Record<Tone, string> = {
  neutral: styles.badgeNeutral,
  green: styles.badgeGreen,
  amber: styles.badgeAmber,
  red: styles.badgeRed,
  cobalt: styles.badgeCobalt,
  violet: styles.badgeViolet,
  lime: styles.badgeLime,
  dark: styles.badgeDark,
};

export function Badge({
  children,
  tone = "neutral",
  dot = false,
  icon,
  onMedia = false,
}: {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
  icon?: ReactNode;
  /** Sits on photography, so it needs its own opaque scrim. */
  onMedia?: boolean;
}) {
  return (
    <span
      className={[styles.badge, toneClass[tone], onMedia ? styles.badgeOnMedia : ""]
        .filter(Boolean)
        .join(" ")}
    >
      {dot ? <span className={styles.badgeDot} aria-hidden="true" /> : null}
      {icon}
      {children}
    </span>
  );
}

export function statusTone(status: string): Tone {
  if (["verified", "healthy", "completed", "active", "current", "approved"].includes(status))
    return "green";
  if (["pending", "expiring", "warning", "at-risk", "review", "applied"].includes(status))
    return "amber";
  if (["rejected", "expired", "critical", "no_show", "no-show"].includes(status)) return "red";
  if (["checked_in", "checked-in", "onboarding"].includes(status)) return "cobalt";
  return "neutral";
}

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    checked_in: "Checked in",
    no_show: "No-show",
    at_risk: "At risk",
    "at-risk": "At risk",
    current: "Current",
    expiring: "Expiring",
    expired: "Expired",
    pending: "Pending",
    verified: "Verified",
    rejected: "Rejected",
    completed: "Completed",
    expected: "Expected",
    confirmed: "Confirmed",
    healthy: "Healthy",
    critical: "Critical",
    applied: "Applied",
    review: "In review",
    onboarding: "Onboarding",
    active: "Active",
  };
  const label = labels[status];
  return label ? t(label) : status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
}
