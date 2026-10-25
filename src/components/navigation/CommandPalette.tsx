import { CornerDownLeft, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { routes, searchRoutes } from "../../app/routes";
import type { RouteMeta } from "../../app/routes";
import { useAuth } from "../../lib/auth/session";
import { t } from "../../lib/i18n";
import styles from "./CommandPalette.module.css";

const popular: Record<"coordinator" | "volunteer", string[]> = {
  coordinator: [
    "/coordinator/mission-control",
    "/coordinator/coverage",
    "/coordinator/schedule",
    "/coordinator/volunteers",
    "/coordinator/reports",
    "/coordinator/settings",
  ],
  volunteer: [
    "/volunteer/home",
    "/volunteer/discover",
    "/volunteer/schedule",
    "/volunteer/hours",
    "/volunteer/profile",
    "/coordinator/settings",
  ],
};

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

/** Mounted only while open so every session starts from a clean query. */
function PaletteDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const navigate = useNavigate();
  const listId = useId();
  const { user } = useAuth();
  const role = user?.role ?? "volunteer";

  const results = useMemo(() => {
    // The palette is part of a signed-in shell. It should offer the screens this
    // account can actually open, and never a parameterised path, which has no
    // record behind it until a real id is chosen.
    const visible = (route: RouteMeta) =>
      !route.path.includes(":") &&
      (route.role === role || route.id === "settings" || route.id === "accessibility");
    if (!query.trim()) {
      return popular[role]
        .map((path) => routes.find((route) => route.path === path))
        .filter((route): route is RouteMeta => route !== undefined && visible(route));
    }
    return searchRoutes(query).filter(visible);
  }, [query, role]);

  useEffect(() => {
    restoreRef.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.showModal();
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      if (dialog?.open) dialog.close();
      restoreRef.current?.focus();
    };
  }, []);

  function close() {
    onClose();
  }

  function choose(index: number) {
    const route = results[index];
    if (!route) return;
    close();
    navigate(route.path);
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-label="Search CivicFlow"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className={styles.searchRow}>
        <Search size={18} strokeWidth={1.8} aria-hidden="true" />
        <input
          ref={inputRef}
          className={styles.input}
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            results[activeIndex] ? `command-${results[activeIndex].id}` : undefined
          }
          placeholder="Search screens, volunteers, actions…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((index) => Math.min(index + 1, results.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((index) => Math.max(index - 1, 0));
            } else if (event.key === "Enter") {
              event.preventDefault();
              choose(activeIndex);
            }
          }}
        />
        <kbd className={styles.esc}>Esc</kbd>
      </div>

      <div className={styles.results}>
        <p className={styles.groupLabel}>{query.trim() ? "Matching surfaces" : "Jump to"}</p>
        {results.length === 0 ? (
          <p className={styles.empty}>
            No surface matches “{query.trim()}”. Try “coverage” or “hours”.
          </p>
        ) : (
          <ul role="listbox" id={listId} aria-label="Search results">
            {results.map((route, index) => (
              <li
                key={route.id}
                id={`command-${route.id}`}
                role="option"
                aria-selected={index === activeIndex}
                tabIndex={-1}
                className={styles.option}
                onPointerMove={() => setActiveIndex(index)}
                onClick={() => choose(index)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") choose(index);
                }}
              >
                <span className={styles.number}>{String(route.number).padStart(2, "0")}</span>
                <span className={styles.optionText}>
                  <span className={styles.optionTitle}>{t(route.title)}</span>
                  <span className={styles.optionSpec}>{t(route.spec)}</span>
                </span>
                {index === activeIndex ? (
                  <CornerDownLeft size={15} className={styles.enter} aria-hidden="true" />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      <footer className={styles.footer}>
        <span>
          <kbd>↑</kbd> <kbd>↓</kbd> to move
        </span>
        <span>
          <kbd>↵</kbd> to open
        </span>
        <span>
          <kbd>Esc</kbd> to close
        </span>
      </footer>
    </dialog>
  );
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  return open ? <PaletteDialog onClose={onClose} /> : null;
}
