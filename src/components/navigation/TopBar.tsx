import { useEffect } from "react";
import { format, parseISO } from "date-fns";
import { Menu, Moon, Search, Sun } from "lucide-react";
import { useDisplayPreferences } from "../../lib/display";
import { formatDateWithYear } from "../../lib/workspace/selectors";
import { useWorkspace } from "../../lib/workspace/session";
import { NotificationMenu } from "./NotificationMenu";
import styles from "./TopBar.module.css";

interface TopBarProps {
  onOpenPalette: () => void;
  onOpenSidebar: () => void;
}

export function TopBar({ onOpenPalette, onOpenSidebar }: TopBarProps) {
  const { workspace } = useWorkspace();
  const today = parseISO(workspace.now);
  const { resolvedTheme, toggleTheme } = useDisplayPreferences();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) {
        return;
      }
      if (event.shiftKey && event.key.toLowerCase() === "d" && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        toggleTheme();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleTheme]);

  return (
    <header className={styles.topbar}>
      <div className={styles.left}>
        <button
          type="button"
          className={styles.menuButton}
          onClick={onOpenSidebar}
          aria-label="Open navigation"
        >
          <Menu size={18} strokeWidth={1.8} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={styles.search}
          onClick={onOpenPalette}
          aria-keyshortcuts="Meta+K Control+K"
        >
          <Search size={16} strokeWidth={1.8} aria-hidden="true" />
          <span className={styles.searchText}>Search CivicFlow…</span>
          <span className={styles.shortcut} aria-hidden="true">
            ⌘ K
          </span>
        </button>
      </div>

      <div className={styles.actions}>
        <time className={styles.date} dateTime={format(today, "yyyy-MM-dd")}>
          {formatDateWithYear(today)}
        </time>
        <button
          type="button"
          className={styles.iconButton}
          onClick={toggleTheme}
          aria-label={resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          aria-keyshortcuts="Shift+D"
          title={`${resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme"} (Shift+D)`}
        >
          {resolvedTheme === "dark" ? (
            <Sun size={17} strokeWidth={1.8} aria-hidden="true" />
          ) : (
            <Moon size={17} strokeWidth={1.8} aria-hidden="true" />
          )}
        </button>
        <NotificationMenu />
      </div>
    </header>
  );
}
