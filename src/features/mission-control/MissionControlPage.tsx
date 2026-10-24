import { ArrowRight, RefreshCcw } from "lucide-react";
import { Link } from "react-router-dom";
import { useMissionControl } from "../../lib/workspace/queries";
import { formatTime } from "../../lib/workspace/selectors";
import styles from "./MissionControl.module.css";
import { AttentionCard } from "./components/AttentionCard";
import { CommunityMotionCard } from "./components/CommunityMotionCard";
import { MetricStrip } from "./components/MetricStrip";
import { MissionHero } from "./components/MissionHero";
import { RecentActivityCard } from "./components/RecentActivityCard";
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

      <section aria-labelledby="mc-numbers">
        <h2 id="mc-numbers" className="visually-hidden">
          This month at {data.organizationName}
        </h2>
        <MetricStrip data={data} />
      </section>

      <div className={styles.mid}>
        <WeekCoverageCard days={data.coverageDays} />
        <AttentionCard items={data.attention} count={data.attentionCount} />
      </div>

      <div className={styles.bottom}>
        <CommunityMotionCard impact={data.impact} photos={data.photos} />
        <RecentActivityCard items={data.recentActivity} />
        <SuggestedCard attention={data.attention} />
      </div>

      <p className={styles.pageFooter}>
        <span>Working offline</span>
        <span aria-hidden="true">·</span>
        <span>Last synced locally at {formatTime(data.demoNow)}</span>
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
