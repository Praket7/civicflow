import { useMemo, useState } from "react";
import { differenceInCalendarDays, parseISO } from "date-fns";
import {
  ArrowRight,
  Bookmark,
  CalendarDays,
  Check,
  Clock3,
  Compass,
  Heart,
  MapPin,
  Minus,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  Page,
  PageHeader,
  SearchField,
} from "../../components/ui";
import type { Cause, Opportunity } from "../../types/domain";
import { t } from "../../lib/i18n";
import { useWorkspace } from "../../lib/workspace/session";
import {
  CAUSE_LABELS,
  currentVolunteer,
  formatDate,
  formatTime,
  getMatches,
  getOpportunities,
  getSavedOpportunities,
  getUpcomingShiftRows,
  timeRange,
} from "../../lib/workspace/selectors";
import type { ShiftRow } from "../../lib/workspace/selectors";
import styles from "./DiscoverPage.module.css";

type QuickFilter = "for-you" | "this-week" | "nearby";
type SortMode = "match" | "soonest" | "closest";

const QUICK_FILTERS: { id: QuickFilter; label: string }[] = [
  { id: "for-you", label: "For you" },
  { id: "this-week", label: "This week" },
  { id: "nearby", label: "Nearby" },
];

const CAUSES: Cause[] = ["food", "education", "environment", "health", "community", "animals"];

const CAUSE_TONE: Record<Cause, "red" | "violet" | "green" | "cobalt" | "amber" | "neutral"> = {
  food: "red",
  education: "violet",
  environment: "green",
  health: "cobalt",
  community: "amber",
  animals: "neutral",
};

function matchTone(score: number): string {
  if (score >= 90) return "var(--color-green)";
  if (score >= 80) return "var(--color-orange)";
  return "var(--color-red)";
}

export function DiscoverPage() {
  const { workspace, session, actions } = useWorkspace();
  const volunteer = currentVolunteer(workspace);
  const opportunities = getOpportunities(session, workspace);
  const upcoming = useMemo(() => getUpcomingShiftRows(workspace), [workspace]);
  const matches = useMemo(() => getMatches(volunteer, 12), [volunteer]);
  const saved = getSavedOpportunities(session);
  const [query, setQuery] = useState("");
  const [quick, setQuick] = useState<QuickFilter>("for-you");
  const [cause, setCause] = useState<Cause | "all">("all");
  const [sort, setSort] = useState<SortMode>("match");

  const shiftsByOpportunity = useMemo(() => {
    const map = new Map<string, ShiftRow[]>();
    for (const row of upcoming) {
      const rows = map.get(row.opportunity.id) ?? [];
      rows.push(row);
      map.set(row.opportunity.id, rows);
    }
    return map;
  }, [upcoming]);

  const scoreById = useMemo(() => {
    const map = new Map<string, { score: number; reasons: string[] }>();
    for (const match of matches) {
      map.set(match.opportunity.id, { score: match.score, reasons: match.reasons });
    }
    return map;
  }, [matches]);

  const rows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = opportunities.filter((opportunity) => {
      if (cause !== "all" && opportunity.cause !== cause) return false;
      const nextShift = shiftsByOpportunity.get(opportunity.id)?.[0];
      if (quick === "this-week") {
        if (!nextShift) return false;
        const days = differenceInCalendarDays(
          parseISO(nextShift.shift.startsAt),
          parseISO(workspace.demoNow),
        );
        if (days < 0 || days > 7) return false;
      }
      if (quick === "nearby" && opportunity.distanceMiles > 3) return false;
      if (!normalized) return true;
      const haystack = [
        opportunity.title,
        opportunity.organization,
        opportunity.description,
        CAUSE_LABELS[opportunity.cause],
        opportunity.requirements.join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });

    return filtered.sort((a, b) => {
      if (sort === "closest") return a.distanceMiles - b.distanceMiles;
      if (sort === "soonest") {
        const nextA = shiftsByOpportunity.get(a.id)?.[0]?.shift.startsAt ?? "9999";
        const nextB = shiftsByOpportunity.get(b.id)?.[0]?.shift.startsAt ?? "9999";
        return nextA.localeCompare(nextB);
      }
      return (scoreById.get(b.id)?.score ?? 0) - (scoreById.get(a.id)?.score ?? 0);
    });
  }, [opportunities, query, quick, cause, sort, shiftsByOpportunity, scoreById, workspace.demoNow]);

  const bestMatch = matches[0];
  const profileScore = bestMatch?.score ?? 0;
  const profileFactors = [
    { label: t("Available this week"), met: volunteer.availability.length > 0 },
    {
      label: t("Interest in {cause}", {
        cause: CAUSE_LABELS[volunteer.causes[0] ?? "food"],
      }),
      met: volunteer.causes.length > 0,
    },
    {
      label: t(volunteer.languages.includes("Spanish") ? "Spanish speaker" : "English speaker"),
      met: true,
    },
    {
      label: t(volunteer.eventsCompleted > 0 ? "Training complete" : "Training not completed"),
      met: volunteer.eventsCompleted > 0,
    },
  ];

  const filtersActive = quick !== "for-you" || cause !== "all" || query.trim().length > 0;

  function resetFilters() {
    setQuery("");
    setQuick("for-you");
    setCause("all");
    setSort("match");
  }

  function renderCard(opportunity: Opportunity) {
    const nextShift = shiftsByOpportunity.get(opportunity.id)?.[0];
    const match = scoreById.get(opportunity.id);
    const score = match?.score ?? 0;
    const spotsLeft = nextShift
      ? Math.max(0, nextShift.shift.capacity - nextShift.shift.confirmed)
      : null;
    const isSaved = saved.some((item) => item.id === opportunity.id);

    return (
      <article className={styles.card} key={opportunity.id}>
        <div className={styles.media}>
          <img src={opportunity.image} alt={opportunity.imageAlt} loading="lazy" />
          <span className={styles.causePill} data-cause={opportunity.cause}>
            {CAUSE_LABELS[opportunity.cause]}
          </span>
          <button
            type="button"
            className={styles.saveButton}
            aria-pressed={isSaved}
            aria-label={
              isSaved ? `Remove ${opportunity.title} from saved` : `Save ${opportunity.title}`
            }
            onClick={() => actions.setSaved(opportunity.id, !isSaved)}
          >
            <Heart
              size={15}
              strokeWidth={2}
              fill={isSaved ? "currentColor" : "none"}
              aria-hidden="true"
            />
          </button>
        </div>
        <div className={styles.cardBody}>
          <div className={styles.cardTopline}>
            <Badge tone={CAUSE_TONE[opportunity.cause]} dot>
              {t(nextShift ? "Open" : "No shifts yet")}
            </Badge>
            <span className={styles.distance}>
              <MapPin size={11} aria-hidden="true" />
              {opportunity.distanceMiles} mi · Buffalo
            </span>
          </div>
          <h2 className={styles.cardTitle}>
            <Link to={`/volunteer/opportunities/${opportunity.slug}`}>{opportunity.title}</Link>
          </h2>
          <p className={styles.org}>{opportunity.organization}</p>
          <p className={styles.cardCopy}>{opportunity.description}</p>
          <div className={styles.metaRow}>
            <span>
              <CalendarDays size={12} aria-hidden="true" />
              {nextShift
                ? `${formatDate(nextShift.shift.startsAt)} · ${formatTime(nextShift.shift.startsAt)}`
                : "Schedule coming soon"}
            </span>
            <span>
              <Clock3 size={12} aria-hidden="true" />
              {nextShift
                ? timeRange(nextShift.shift.startsAt, nextShift.shift.endsAt)
                : opportunity.duration}
            </span>
          </div>
          <div className={styles.matchRow}>
            <div className={styles.matchLine}>
              <span className={styles.matchLabel}>{score}% match</span>
              {match?.reasons[0] ? (
                <span className={styles.matchReason}>{match.reasons[0]}</span>
              ) : null}
            </div>
            <div className={styles.matchTrack} aria-hidden="true">
              <span style={{ width: `${score}%`, background: matchTone(score) }} />
            </div>
            <div className={styles.cardFooter}>
              <span className={styles.spots}>
                {spotsLeft === null
                  ? t("Check back for dates")
                  : spotsLeft === 0
                    ? t("Shift full · waitlist open")
                    : t(spotsLeft === 1 ? "{count} spot left" : "{count} spots left", {
                        count: spotsLeft,
                      })}
              </span>
              <Link
                className={styles.detailLink}
                to={`/volunteer/opportunities/${opportunity.slug}`}
              >
                View details
                <ArrowRight size={12} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </article>
    );
  }

  return (
    <Page width="wide">
      <PageHeader
        eyebrow="Discover · Buffalo, NY"
        title="Find a shift."
        description="Opportunities matched to your interests, skills, and availability. Each match lists the reasons behind its score."
        actions={
          <>
            <ButtonLink
              to="/volunteer/saved"
              variant="secondary"
              icon={<Bookmark size={14} aria-hidden="true" />}
            >
              Saved ({saved.length})
            </ButtonLink>
            <ButtonLink
              to="/volunteer/schedule"
              variant="primary"
              icon={<CalendarDays size={14} aria-hidden="true" />}
            >
              My schedule
            </ButtonLink>
          </>
        }
      />

      <div className={styles.layout}>
        <div className={styles.mainColumn}>
          <Card padding="compact" className={styles.toolbarCard}>
            <div className={styles.toolbarRow}>
              <SearchField
                value={query}
                onChange={setQuery}
                placeholder="Search skills, causes, organizations, or keywords…"
                label="Search opportunities"
              />
              <div className={styles.sortWrap}>
                <label className={styles.sortLabel} htmlFor="discover-sort">
                  Sort by
                </label>
                <select
                  id="discover-sort"
                  className={styles.sortSelect}
                  value={sort}
                  onChange={(event) => setSort(event.target.value as SortMode)}
                >
                  <option value="match">Best match</option>
                  <option value="soonest">Soonest shift</option>
                  <option value="closest">Closest</option>
                </select>
              </div>
            </div>
            <div className={styles.filterRow}>
              <div className={styles.quickChips} role="group" aria-label="Quick filters">
                {QUICK_FILTERS.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    className={[styles.chip, quick === filter.id ? styles.chipActive : ""]
                      .filter(Boolean)
                      .join(" ")}
                    aria-pressed={quick === filter.id}
                    onClick={() => setQuick(filter.id)}
                  >
                    {t(filter.label)}
                  </button>
                ))}
              </div>
              <span className={styles.filterDivider} aria-hidden="true" />
              <div className={styles.causeChips} role="group" aria-label="Filter by cause">
                <button
                  type="button"
                  className={[styles.chip, cause === "all" ? styles.chipActive : ""]
                    .filter(Boolean)
                    .join(" ")}
                  aria-pressed={cause === "all"}
                  onClick={() => setCause("all")}
                >
                  All causes
                </button>
                {CAUSES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={[styles.chip, cause === item ? styles.chipActive : ""]
                      .filter(Boolean)
                      .join(" ")}
                    aria-pressed={cause === item}
                    onClick={() => setCause(item)}
                  >
                    {CAUSE_LABELS[item]}
                  </button>
                ))}
              </div>
            </div>
          </Card>

          <div className={styles.resultsHeader}>
            <div>
              <h2 className={styles.resultsTitle}>
                {t(quick === "this-week" ? "This week’s openings" : "Open opportunities")}
              </h2>
              <p className={styles.resultsCount}>
                {t(rows.length === 1 ? "{count} opportunity" : "{count} opportunities", {
                  count: rows.length,
                })}
                {" · "}
                {t("{count} upcoming shifts", { count: upcoming.length })}
              </p>
            </div>
            {filtersActive ? (
              <Button variant="ghost" size="small" onClick={resetFilters}>
                Clear filters
              </Button>
            ) : null}
          </div>

          {rows.length === 0 ? (
            <EmptyState
              title="No opportunities match that view"
              copy="Try a different cause, widen the distance, or clear the search. New shifts are added every week."
              action={
                <Button variant="secondary" onClick={resetFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <div className={styles.grid}>{rows.map(renderCard)}</div>
          )}
        </div>

        <aside className={styles.sideColumn} aria-label="Your match profile">
          <Card className={styles.profileCard}>
            <div className={styles.profileEyebrow}>Match profile</div>
            <div className={styles.profileTop}>
              <div className={styles.profileCopy}>
                <p className={styles.profileScore}>
                  <strong>{profileScore}%</strong>
                  <span>fit for the best open shift</span>
                </p>
                <h2 className={styles.profileTitle}>
                  {t(
                    profileScore >= 90
                      ? "Strong fit"
                      : profileScore >= 70
                        ? "Good fit"
                        : "A few details missing",
                  )}
                </h2>
                <p>
                  {bestMatch
                    ? t("Closest to {program} this week.", {
                        program: bestMatch.opportunity.title,
                      })
                    : t("Add a few skills to improve your matches.")}
                </p>
              </div>
            </div>
            <ul className={styles.factors}>
              {profileFactors.map((factor) => (
                <li
                  key={factor.label}
                  className={factor.met ? styles.factorMet : styles.factorMissed}
                >
                  <span className={styles.factorIcon} aria-hidden="true">
                    {factor.met ? (
                      <Check size={11} strokeWidth={3} />
                    ) : (
                      <Minus size={11} strokeWidth={3} />
                    )}
                  </span>
                  {factor.label}
                  <span className="visually-hidden">
                    {factor.met ? t("— met") : t("— not met")}
                  </span>
                </li>
              ))}
            </ul>
            <ButtonLink
              to="/volunteer/onboarding"
              variant="secondary"
              className={styles.profileAction}
            >
              Update preferences
            </ButtonLink>
          </Card>

          <Card className={styles.recommendedCard}>
            <div className={styles.recHeader}>
              <h2 className={styles.recTitle}>Recommended for you</h2>
              <span className={styles.recHint}>Ranked by fit</span>
            </div>
            <ul className={styles.recList}>
              {matches.slice(0, 4).map((match) => {
                const nextShift = shiftsByOpportunity.get(match.opportunity.id)?.[0];
                return (
                  <li key={match.opportunity.id}>
                    <Link
                      className={styles.recRow}
                      to={`/volunteer/opportunities/${match.opportunity.slug}`}
                    >
                      <img src={match.opportunity.image} alt="" className={styles.recThumb} />
                      <span className={styles.recCopy}>
                        <span className={styles.recName}>{match.opportunity.title}</span>
                        <span className={styles.recMeta}>
                          {nextShift
                            ? `${formatDate(nextShift.shift.startsAt)} · Buffalo`
                            : "New program · Buffalo"}
                        </span>
                      </span>
                      <span className={styles.recScore}>{match.score}%</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <p className={styles.recFootnote}>
              Match scores combine cause interest, verified skills, availability, and reliability.{" "}
              <Link to="/volunteer/onboarding">Tune yours</Link>.
            </p>
          </Card>

          <Card surface="dark" className={styles.communityCard}>
            <p className={styles.communityEyebrow}>Your record</p>
            <h2 className={styles.communityTitle}>{volunteer.eventsCompleted} shifts completed</h2>
            <p className={styles.communityCopy}>
              {volunteer.hoursVerified} verified hours · {volunteer.attendanceRate}% attendance
              across {workspace.impact.activeVolunteers} active volunteers.
            </p>
            <Link className={styles.communityLink} to="/volunteer/impact">
              See your impact
              <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </Card>

          <p className={styles.offlineNote}>
            <Compass size={12} aria-hidden="true" />
            {opportunities.length} local programs · {upcoming.length} shifts · works offline
          </p>
        </aside>
      </div>
    </Page>
  );
}
