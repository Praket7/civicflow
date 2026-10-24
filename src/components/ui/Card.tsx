import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { t } from "../../lib/i18n";
import styles from "./ui.module.css";

type CardSurface = "raised" | "flat" | "dark" | "quiet";
type CardPadding = "compact" | "default" | "loose";

interface CardProps {
  children: ReactNode;
  surface?: CardSurface;
  padding?: CardPadding;
  className?: string;
  as?: "div" | "section" | "article" | "aside";
  ariaLabel?: string;
  style?: CSSProperties;
}

const surfaceClass: Record<CardSurface, string> = {
  raised: "",
  flat: styles.cardFlat,
  dark: styles.cardDark,
  quiet: styles.cardQuiet,
};

const paddingClass: Record<CardPadding, string> = {
  compact: styles.cardPadCompact,
  default: "",
  loose: styles.cardPadLoose,
};

export function Card({
  children,
  surface = "raised",
  padding = "default",
  className,
  as: Tag = "div",
  ariaLabel,
  style,
}: CardProps) {
  return (
    <Tag
      className={[styles.card, surfaceClass[surface], paddingClass[padding], className]
        .filter(Boolean)
        .join(" ")}
      aria-label={ariaLabel}
      style={style}
    >
      {children}
    </Tag>
  );
}

export function SectionHeader({
  title,
  subtitle,
  action,
  id,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <div className={styles.sectionHeader}>
      <div>
        <h2 className={styles.sectionTitle} id={id}>
          {typeof title === "string" ? t(title) : title}
        </h2>
        {subtitle ? (
          <p className={styles.sectionSub}>
            {typeof subtitle === "string" ? t(subtitle) : subtitle}
          </p>
        ) : null}
      </div>
      {action ? <div className={styles.sectionAction}>{action}</div> : null}
    </div>
  );
}

const iconTones: Record<string, { background: string; color: string }> = {
  green: { background: "var(--tone-green-soft)", color: "var(--tone-green-ink)" },
  cobalt: { background: "var(--color-cobalt-soft)", color: "var(--tone-cobalt-ink)" },
  violet: { background: "var(--tone-violet-soft)", color: "var(--tone-violet-ink)" },
  coral: { background: "var(--tone-red-soft)", color: "var(--tone-red-ink)" },
  amber: { background: "var(--tone-amber-soft)", color: "var(--tone-amber-ink)" },
  teal: { background: "var(--tone-teal-soft)", color: "var(--tone-teal-ink)" },
  rose: { background: "var(--tone-red-soft)", color: "var(--tone-red-ink)" },
  cyan: { background: "var(--tone-cyan-soft)", color: "var(--tone-cyan-ink)" },
  lime: { background: "var(--tone-lime-soft)", color: "var(--tone-lime-ink)" },
};

interface StatCardProps {
  icon: LucideIcon;
  value: ReactNode;
  label: string;
  meta?: ReactNode;
  tone?: keyof typeof iconTones | string;
  className?: string;
}

export function StatCard({
  icon: Icon,
  value,
  label,
  meta,
  tone = "cobalt",
  className,
}: StatCardProps) {
  const palette = iconTones[tone] ?? iconTones.cobalt;
  return (
    <div className={[styles.stat, className].filter(Boolean).join(" ")}>
      <span className={styles.statIcon} style={{ color: palette.color }} aria-hidden="true">
        <Icon size={17} strokeWidth={1.7} />
      </span>
      <div className={styles.statBody}>
        <div className={styles.statValue}>{value}</div>
        <div className={styles.statLabel}>{t(label)}</div>
        {meta ? (
          <div className={styles.statMeta}>{typeof meta === "string" ? t(meta) : meta}</div>
        ) : null}
      </div>
    </div>
  );
}
