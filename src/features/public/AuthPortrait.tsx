import { Link } from "react-router-dom";
import styles from "./auth.module.css";

/**
 * The photo half of the account screens. Sign in and create account share it so
 * the two panels cannot drift apart.
 */
export function AuthPortrait() {
  return (
    <div className={styles.photoPanel}>
      <img
        className={styles.photo}
        src="/media/signin-volunteers.jpg"
        alt="Volunteers packing food boxes together at a community distribution"
      />
      <div className={styles.photoShade} aria-hidden="true" />
      <Link className={styles.brand} to="/welcome" aria-label="CivicFlow welcome">
        <span className={styles.brandMark} aria-hidden="true">
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
        CivicFlow
      </Link>
      <div className={styles.photoCopy}>
        <p className={styles.photoHeadline}>
          Real people.
          <br />
          <span className={styles.underline}>Lasting change.</span>
        </p>
        <p className={styles.photoBody}>
          One place to organize service, prove participation, and make community impact visible.
        </p>
      </div>
      <p className={styles.credit}>Photo: Pexels License · Sample workspace</p>
    </div>
  );
}
