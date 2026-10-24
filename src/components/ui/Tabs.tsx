import type { ReactNode } from "react";
import { t } from "../../lib/i18n";
import styles from "./ui.module.css";

export interface TabItem {
  id: string;
  label: ReactNode;
  count?: number;
}

export function Tabs({
  items,
  value,
  onChange,
  label,
  variant = "pill",
}: {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  variant?: "pill" | "underline";
}) {
  const underline = variant === "underline";
  return (
    <div
      className={underline ? styles.underlineTabs : styles.tabs}
      role="tablist"
      aria-label={label}
    >
      {items.map((item) => {
        const active = item.id === value;
        const className = underline
          ? [styles.underlineTab, active ? styles.underlineTabActive : ""].filter(Boolean).join(" ")
          : [styles.tab, active ? styles.tabActive : ""].filter(Boolean).join(" ");
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            className={className}
            onClick={() => onChange(item.id)}
          >
            {typeof item.label === "string" ? t(item.label) : item.label}
            {typeof item.count === "number" ? (
              <span className={styles.tabCount}>{item.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
