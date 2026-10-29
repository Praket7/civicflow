import { ArrowRight, RefreshCcw, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useMissionControl } from "../../lib/workspace/queries";
import {
  formatTime,
  getApplications,
  getCredentials,
  getHoursQueue,
} from "../../lib/workspace/selectors";
import { useWorkspace } from "../../lib/workspace/session";
import styles from "./MissionControl.module.css";
import { AttentionCard } from "./components/AttentionCard";
import type { OperationItem } from "./components/AttentionCard";
import { CommunityMotionCard } from "./components/CommunityMotionCard";
import { MetricStrip } from "./components/MetricStrip";
import { MissionHero } from "./components/MissionHero";
import { RecentActivityCard } from "./components/RecentActivityCard";
import { SetupChecklist } from "./components/SetupChecklist";
import { SuggestedCard } from "./components/SuggestedCard";
import { WeekCoverageCard } from "./components/WeekCoverageCard";

function MissionControlSkeleton() {
  return (
    <div className={styles.page} aria-busy="true" aria-label="Loading Mission Control">
      <div className={`${styles.hero} ${styles.skeletonHero}`} />
      <div className={styles.metrics}>
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className={`${styles.card} ${styles.skeletonCard}`} />
        ))}
      </div>
      <div className={styles.mid}>
        <div className={`${styles.card} ${styles.skeletonLarge}`} />
        <div className={`${styles.card} ${styles.skeletonLarge}`} />
      </div>
      <div className={styles.bottom}>
        <div className={`${styles.card} ${styles.skeletonSmall}`} />
        <div className={`${styles.card} ${styles.skeletonSmall}`} />
        <div className={`${styles.card} ${styles.skeletonSmall}`} />
      </div>
    </div>
  );
}

export function MissionControlPage() {
  const { data, isPending, isError, refetch } = useMissionControl();
  const { workspace, session } = useWorkspace();
  const operations: OperationItem[] = [];
  const pendingHours = getHoursQueue(session, workspace).length;
  if (pendingHours > 0) {
    operations.push({
      id: "hours",
      title: `${pendingHours} hour ${pendingHours === 1 ? "entry" : "entries"} awaiting review`,
      detail: "Approve service before verification letters go out.",
      href: "/coordinator/hours",
    });
  }
  const applications = getApplications(session).filter(
    (row) => row.stage === "applied" || row.stage === "review",
  ).length;
  if (applications > 0) {
    operations.push({
      id: "applications",
      title: `${applications} ${applications === 1 ? "application" : "applications"} need review`,
      detail: "Move people into onboarding or close the loop.",
      href: "/coordinator/applications",
    });
  }
  const expiring = getCredentials(session, workspace).filter(
    (row) => row.status === "expiring",
  ).length;
  if (expiring > 0) {
    operations.push({
      id: "credentials",
      title: `${expiring} ${expiring === 1 ? "credential expires" : "credentials expire"} soon`,
      detail: "Check assigned shifts before a requirement lapses.",
      href: "/coordinator/credentials",
    });
  }

  if (isPending) return <MissionControlSkeleton />;

  if (isError || !data) {
    return (
      <div className={styles.errorState} role="alert">
        <div>
          <h1 className={styles.errorTitle}>Mission Control could not load.</h1>
          <p className={styles.errorText}>
            The local workspace did not respond. Your saved data is still on this device — retry the
            read before making changes.
          </p>
        </div>
        <button type="button" className={styles.retry} onClick={() => void refetch()}>
          <RefreshCcw size={15} aria-hidden="true" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <MissionHero data={data} />

      <SetupChecklist />

      <section className={styles.autoroster} aria-labelledby="mc-autoroster">
        <div className={styles.autorosterCopy}>
          <p className={styles.autorosterKicker}>
            <Sparkles size={13} aria-hidden="true" />
            AutoRoster
          </p>
          <h2 className={styles.autorosterTitle} id="mc-autoroster">
            Fill next week in one pass.
          </h2>
          <p className={styles.autorosterBody}>
            Ranked assignments from skills, availability, and fairness. Review the plan before
            anything is applied.
          </p>
        </div>
        <Link className={styles.autorosterAction} to="/coordinator/autoroster">
          Open AutoRoster
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </section>

      <section aria-labelledby="mc-numbers">
        <h2 id="mc-numbers" className="visually-hidden">
          This month at {data.organizationName}
        </h2>
        <MetricStrip data={data} />
      </section>

      <div className={styles.mid}>
        <WeekCoverageCard days={data.coverageDays} />
        <AttentionCard items={data.attention} count={data.attentionCount} operations={operations} />
      </div>

      <div className={styles.bottom}>
        <CommunityMotionCard impact={data.impact} photos={data.photos} />
        <RecentActivityCard items={data.recentActivity} />
        <SuggestedCard attention={data.attention} />
      </div>

      <p className={styles.pageFooter}>
        <span>Working offline</span>
        <span aria-hidden="true">·</span>
        <span>Last synced locally at {formatTime(data.now)}</span>
        <Link className={styles.footerLink} to="/credits">
          Photo credits
        </Link>
        <Link className={styles.footerLink} to="/coordinator/reports">
          Open monthly report
          <ArrowRight size={13} aria-hidden="true" />
        </Link>
      </p>
    </div>
  );
}
