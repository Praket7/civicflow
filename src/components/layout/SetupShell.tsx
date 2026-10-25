import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { accountHome, useAuth } from "../../lib/auth/session";
import styles from "./SetupShell.module.css";

/** Standalone setup frame: dark product bar over a full-width workspace. */
export function SetupShell({ label, children }: { label: string; children: ReactNode }) {
  const { user } = useAuth();
  // Setup screens belong to an account. The logo goes back to that account's
  // home, never to the public welcome page, which reads as losing the session.
  const home = user ? accountHome(user) : "/welcome";
  return (
    <div className={styles.root}>
      <header className={styles.bar}>
        <Link className={styles.brand} to={home}>
          <span className={styles.mark} aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path
                d="M4.2 8.6c4.6-4.9 11.2-4.9 15.8-.9-4.7 4.6-11.2 4.8-15.8.9Z"
                fill="currentColor"
              />
              <path
                d="M4.4 15.1c4.4-4.3 10.6-4.4 15.2-.7-4.6 4.4-10.8 4.6-15.2.7Z"
                fill="currentColor"
                opacity="0.6"
              />
            </svg>
          </span>
          <span className={styles.wordmark}>CivicFlow</span>
        </Link>
        <span className={styles.label}>{label}</span>
      </header>
      <main className={styles.content}>{children}</main>
    </div>
  );
}
