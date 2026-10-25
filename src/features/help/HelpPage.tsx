import { ArrowRight, CalendarDays, Database, Keyboard, LifeBuoy, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, Page, PageHeader } from "../../components/ui";
import styles from "./HelpPage.module.css";

const coordinatorSteps = [
  {
    title: "Start with Mission Control",
    copy: "The dashboard turns stored shifts, roles and hours into the few gaps that need a decision today.",
    to: "/coordinator/mission-control",
    link: "Open Mission Control",
  },
  {
    title: "Check coverage before you schedule",
    copy: "Coverage separates role coverage from seat fill, so an empty Driver slot is not hidden by a healthy seat count.",
    to: "/coordinator/coverage",
    link: "Open Coverage",
  },
  {
    title: "Plan the week",
    copy: "Filter by cause, isolate shifts with role gaps, and select a shift to see its roles without leaving the calendar.",
    to: "/coordinator/schedule",
    link: "Open Schedule",
  },
  {
    title: "Close the loop",
    copy: "Attendance, hours review, records, reports and backups all read from the same database, so a decision appears everywhere.",
    to: "/coordinator/hours",
    link: "Review hours",
  },
];

const volunteerSteps = [
  {
    title: "Find a shift that fits",
    copy: "Discover ranks opportunities by skills and availability, and explains the match instead of hiding it.",
    to: "/volunteer/discover",
    link: "Browse opportunities",
  },
  {
    title: "Know before you arrive",
    copy: "Your shift page collects the time, meeting point, role, checklist and arrival instructions in one place.",
    to: "/volunteer/schedule",
    link: "Open My Schedule",
  },
  {
    title: "Check in from the lobby",
    copy: "Enter the six-digit code shown at the event, or use the coordinator kiosk if you do not have a phone.",
    to: "/volunteer/check-in",
    link: "Open Check In",
  },
  {
    title: "See what your hours built",
    copy: "Personal Impact converts approved service into meals, tutoring sessions and other recorded outcomes.",
    to: "/volunteer/impact",
    link: "Open Personal Impact",
  },
];

export function HelpPage() {
  return (
    <Page>
      <PageHeader
        eyebrow="Help"
        title="How CivicFlow works"
        description="A short guide for coordinators and volunteers. Every path below is live, and every action writes to the same local database."
        actions={
          <Link className={styles.headerLink} to="/coordinator/mission-control">
            Return to workspace <ArrowRight size={14} aria-hidden="true" />
          </Link>
        }
      />

      <section className={styles.quickGrid} aria-label="Quick start">
        <Card className={styles.guideCard}>
          <div className={styles.cardHead}>
            <span className={styles.icon} aria-hidden="true">
              <LifeBuoy size={17} />
            </span>
            <div>
              <p className={styles.kicker}>Coordinator</p>
              <h2 className={styles.cardTitle}>Run a service week</h2>
            </div>
          </div>
          <ol className={styles.steps}>
            {coordinatorSteps.map((step, index) => (
              <li key={step.title} className={styles.step}>
                <span className={styles.stepNumber} aria-hidden="true">
                  {index + 1}
                </span>
                <div>
                  <h3 className={styles.stepTitle}>{step.title}</h3>
                  <p className={styles.stepCopy}>{step.copy}</p>
                  <Link className={styles.stepLink} to={step.to}>
                    {step.link} <ArrowRight size={12} aria-hidden="true" />
                  </Link>
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <Card className={styles.guideCard}>
          <div className={styles.cardHead}>
            <span className={styles.icon} aria-hidden="true">
              <CalendarDays size={17} />
            </span>
            <div>
              <p className={styles.kicker}>Volunteer</p>
              <h2 className={styles.cardTitle}>From interest to impact</h2>
            </div>
          </div>
          <ol className={styles.steps}>
            {volunteerSteps.map((step, index) => (
              <li key={step.title} className={styles.step}>
                <span className={styles.stepNumber} aria-hidden="true">
                  {index + 1}
                </span>
                <div>
                  <h3 className={styles.stepTitle}>{step.title}</h3>
                  <p className={styles.stepCopy}>{step.copy}</p>
                  <Link className={styles.stepLink} to={step.to}>
                    {step.link} <ArrowRight size={12} aria-hidden="true" />
                  </Link>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </section>

      <section className={styles.lowerGrid} aria-label="Reference">
        <Card>
          <div className={styles.cardHead}>
            <span className={styles.icon} aria-hidden="true">
              <Keyboard size={17} />
            </span>
            <div>
              <p className={styles.kicker}>Reference</p>
              <h2 className={styles.cardTitle}>Keys and shortcuts</h2>
            </div>
          </div>
          <dl className={styles.shortcuts}>
            <div>
              <dt>
                <kbd>⌘</kbd> <kbd>K</kbd>
              </dt>
              <dd>Search every screen from anywhere.</dd>
            </div>
            <div>
              <dt>
                <kbd>Esc</kbd>
              </dt>
              <dd>Close the search palette or the mobile navigation drawer.</dd>
            </div>
            <div>
              <dt>
                <kbd>Tab</kbd>
              </dt>
              <dd>Move through controls. Focus is a visible three-pixel outline.</dd>
            </div>
            <div>
              <dt>
                <kbd>⌘</kbd> <kbd>+</kbd>
              </dt>
              <dd>Browser zoom is supported; the Accessibility studio also changes text scale.</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <div className={styles.cardHead}>
            <span className={styles.icon} aria-hidden="true">
              <Database size={17} />
            </span>
            <div>
              <p className={styles.kicker}>Data</p>
              <h2 className={styles.cardTitle}>Where your work lives</h2>
            </div>
          </div>
          <p className={styles.bodyCopy}>
            The desktop app writes to a transactional SQLite database through the Rust core. Every
            workflow change records an audit event, and backups are complete database copies that
            can be validated and restored.
          </p>
          <div className={styles.factRow}>
            <span className={styles.fact}>
              <ShieldCheck size={13} aria-hidden="true" /> Local and offline
            </span>
            <span className={styles.fact}>No account required</span>
            <span className={styles.fact}>20 snapshots retained</span>
          </div>
          <div className={styles.linkRow}>
            <Link className={styles.stepLink} to="/coordinator/backup">
              Open Backup &amp; recovery <ArrowRight size={12} aria-hidden="true" />
            </Link>
            <Link className={styles.stepLink} to="/coordinator/audit">
              View the audit log <ArrowRight size={12} aria-hidden="true" />
            </Link>
          </div>
        </Card>
      </section>

      <Card className={styles.faqCard}>
        <p className={styles.kicker}>Common questions</p>
        <h2 className={styles.cardTitle}>Answers without leaving the demo</h2>
        <p className={styles.bodyCopy}>
          You can also ask in your own words. Ask CivicFlow reads the same records and names the
          rows it used, so the answer can be checked.
        </p>
        <p className={styles.linkRow}>
          <Link className={styles.stepLink} to="/ask">
            Open Ask CivicFlow <ArrowRight size={12} aria-hidden="true" />
          </Link>
        </p>
        <div className={styles.faqGrid}>
          <details>
            <summary>Why can a shift be 75% full and still show “No role gaps”?</summary>
            <p>
              Role coverage and seat fill answer different questions. Role coverage counts required
              role slots; seat fill counts confirmed people against capacity. Coverage labels both.
            </p>
          </details>
          <details>
            <summary>What happens when a volunteer cancels?</summary>
            <p>
              The registration moves to canceled, the first eligible waitlisted volunteer is
              promoted, and the cancellation, promotion and roster update are written as audited
              events.
            </p>
          </details>
          <details>
            <summary>How do I reset the demo?</summary>
            <p>
              Open Settings → Local data and choose Reset demo workspace. It restores the seeded
              state without deleting the schema, migration ledger or backup files.
            </p>
          </details>
          <details>
            <summary>Does the kiosk need a network connection?</summary>
            <p>
              No. The kiosk and volunteer check-in run against the same local database. The
              six-digit code rotates every fifteen minutes and is validated by the core.
            </p>
          </details>
        </div>
      </Card>
    </Page>
  );
}
