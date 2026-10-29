import { ArrowRight, Check } from "lucide-react";
import { Link } from "react-router-dom";
import { useWorkspace } from "../../../lib/workspace/session";
import { getApplications } from "../../../lib/workspace/selectors";
import { isDemoOrganization } from "../../../lib/workspace/organizationWorkspace";
import styles from "../MissionControl.module.css";

export function SetupChecklist() {
  const { workspace, session } = useWorkspace();
  if (isDemoOrganization(workspace.organization.id)) return null;
  const invited = workspace.volunteers.length > 0 || getApplications(session).length > 0;
  const rosterRun = session.audit.some((event) => event.action.startsWith("roster."));
  const steps = [
    {
      label: "Add an opportunity",
      detail: "Name the program and what volunteers will do.",
      done: workspace.opportunities.length > 0,
      to: "/coordinator/opportunities/new",
    },
    {
      label: "Invite a volunteer",
      detail: "Send a one-time invitation or add someone directly.",
      done: invited,
      to: "/coordinator/volunteers",
    },
    {
      label: "Publish a shift",
      detail: "Set the date, roles, and how many people you need.",
      done: workspace.shifts.length > 0,
      to: "/coordinator/schedule",
    },
    {
      label: "Run AutoRoster",
      detail: "Let the planner fill the open roles for the week.",
      done: rosterRun,
      to: "/coordinator/autoroster",
    },
  ];
  if (steps.every((step) => step.done)) return null;

  return (
    <section className={`${styles.card} ${styles.setupCard}`} aria-labelledby="mc-setup">
      <div className={styles.cardHead}>
        <div>
          <h2 id="mc-setup" className={styles.sectionTitle}>
            Set up this workspace
          </h2>
          <p className={styles.cardKicker}>Four steps to a staffed first week.</p>
        </div>
        <span className={styles.countBadge}>
          {steps.filter((step) => step.done).length}/{steps.length}
        </span>
      </div>
      <ol className={styles.setupList}>
        {steps.map((step) => (
          <li key={step.label} className={styles.setupItem} data-done={step.done}>
            <span className={styles.setupCheck} aria-hidden="true">
              {step.done ? <Check size={12} /> : null}
            </span>
            <span className={styles.setupText}>
              <span className={styles.setupLabel}>{step.label}</span>
              <span className={styles.setupDetail}>{step.done ? "Done" : step.detail}</span>
            </span>
            {step.done ? null : (
              <Link className={styles.setupLink} to={step.to} aria-label={step.label}>
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
