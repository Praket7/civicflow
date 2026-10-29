import { NavLink } from "react-router-dom";
import styles from "./WorkAreaTabs.module.css";

export interface WorkAreaTab {
  label: string;
  to: string;
  end?: boolean;
}

interface WorkAreaTabsProps {
  label: string;
  items: WorkAreaTab[];
}

export function WorkAreaTabs({ label, items }: WorkAreaTabsProps) {
  return (
    <nav className={styles.tabs} aria-label={label}>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => [styles.tab, isActive ? styles.active : ""].join(" ")}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
