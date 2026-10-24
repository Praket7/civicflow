import { format, parseISO } from "date-fns";
import { Bell } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useMarkNotificationRead, useNotifications } from "../../lib/workspace/queries";
import styles from "./NotificationMenu.module.css";

const toneByKind: Record<string, string> = {
  coverage: "critical",
  waitlist: "violet",
  hours: "success",
  credential: "warning",
  shift: "info",
  WAITLIST_PROMOTED: "violet",
  SHIFT_CHANGED: "info",
  SHIFT_CANCELED: "critical",
  HOURS_APPROVED: "success",
  HOURS_ADJUSTED: "warning",
  HOURS_SUBMITTED: "info",
  CREDENTIAL_EXPIRING: "warning",
  COVERAGE_REQUEST: "critical",
};

export function NotificationMenu() {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const location = useLocation();
  const isVolunteer = location.pathname.startsWith("/volunteer");
  const role = isVolunteer ? "volunteer" : "coordinator";
  const { data: notifications = [] } = useNotifications(role);
  const markRead = useMarkNotificationRead(role);
  const unread = notifications.filter((notification) => !notification.readAt);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-label={unread.length ? `Notifications, ${unread.length} unread` : "Notifications"}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell size={17} strokeWidth={1.8} aria-hidden="true" />
        {unread.length ? <span className={styles.dot} aria-hidden="true" /> : null}
      </button>

      {open ? (
        <div className={styles.panel} id={panelId} role="region" aria-label="Notifications">
          <div className={styles.header}>
            <h2 className={styles.title}>Notifications</h2>
            <button
              type="button"
              className={styles.markAll}
              onClick={() => unread.forEach((notification) => markRead.mutate(notification.id))}
              disabled={unread.length === 0}
            >
              Mark all as read
            </button>
          </div>
          <ul className={styles.list}>
            {notifications.map((notification) => (
              <li
                key={notification.id}
                className={styles.item}
                data-read={Boolean(notification.readAt)}
              >
                <Link
                  to={notification.href}
                  className={styles.link}
                  onClick={() => {
                    if (!notification.readAt) markRead.mutate(notification.id);
                    setOpen(false);
                  }}
                >
                  <span
                    className={styles.itemDot}
                    data-tone={toneByKind[notification.kind] ?? "info"}
                    aria-hidden="true"
                  />
                  <span className={styles.itemBody}>
                    <span className={styles.itemTitle}>{notification.title}</span>
                    <span className={styles.itemText}>{notification.body}</span>
                    <span className={styles.itemTime}>
                      {format(parseISO(notification.createdAt), "MMM d · h:mm a")}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link
            className={styles.viewAll}
            to={isVolunteer ? "/volunteer/notifications" : "/coordinator/notifications"}
            onClick={() => setOpen(false)}
          >
            View all notifications
          </Link>
        </div>
      ) : null}
    </div>
  );
}
