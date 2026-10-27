import { useMemo, useState } from "react";
import { ArrowRight, Bookmark, CalendarDays, Compass, MapPin, Undo2, X } from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  Page,
  PageHeader,
  SearchField,
  SectionHeader,
} from "../../components/ui";
import { t } from "../../lib/i18n";
import { useWorkspace } from "../../lib/workspace/session";
import {
  CAUSE_LABELS,
  currentVolunteer,
  formatDate,
  getMatches,
  getSavedOpportunities,
  getShiftRowsForOpportunity,
  timeRange,
} from "../../lib/workspace/selectors";
import type { Opportunity, Shift } from "../../types/domain";
import styles from "./SavedPage.module.css";

interface SavedItem {
  opportunity: Opportunity;
  score: number;
  nextShift: Shift | null;
  seatsOpen: number | null;
}

type Filter = "all" | "high" | "upcoming" | "nearby";
type Sort = "match" | "soonest" | "closest";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All saved" },
  { id: "high", label: "High match" },
  { id: "upcoming", label: "Upcoming" },
  { id: "nearby", label: "Nearby" },
];

function cityState(address: string): string {
  const parts = address.split(",").map((part) => part.trim());
  const state = parts[2]?.split(" ")[0];
  return [parts[1], state].filter(Boolean).join(", ");
}

function SavedCard({
  item,
  wide,
  onRemove,
}: {
  item: SavedItem;
  wide?: boolean;
  onRemove: (item: SavedItem) => void;
}) {
  const { opportunity, score, nextShift, seatsOpen } = item;
  return (
    <article className={[styles.card, wide ? styles.wideCard : ""].filter(Boolean).join(" ")}>
      <div className={styles.media}>
        <img src={opportunity.image} alt={opportunity.imageAlt} loading="lazy" />
        <span className={styles.cause} data-cause={opportunity.cause}>
          {CAUSE_LABELS[opportunity.cause]}
        </span>
        <button
          type="button"
          className={styles.removeIcon}
          onClick={() => onRemove(item)}
          aria-label={t("Remove {program} from saved", { program: opportunity.title })}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      <div className={styles.body}>
        <div className={styles.cardTop}>
          <div className={styles.titleGroup}>
            <h3 className={styles.cardTitle}>{opportunity.title}</h3>
            <p className={styles.org}>{opportunity.organization}</p>
          </div>
          <span className={styles.match} data-tier={score >= 65 ? "high" : "mid"}>
            {score}% match
          </span>
        </div>

        <p className={styles.description}>{opportunity.description}</p>

        {nextShift ? (
          <div className={styles.shift}>
            <CalendarDays size={14} aria-hidden="true" />
            <span>
              <strong>{formatDate(nextShift.startsAt)}</strong> ·{" "}
              {timeRange(nextShift.startsAt, nextShift.endsAt)}
            </span>
            {seatsOpen !== null ? (
              <Badge tone={seatsOpen === 0 ? "amber" : "green"}>
                {seatsOpen === 0
                  ? t("Full · waitlist")
                  : t(seatsOpen === 1 ? "{count} seat open" : "{count} seats open", {
                      count: seatsOpen,
                    })}
              </Badge>
            ) : null}
          </div>
        ) : (
          <div className={styles.shift}>
            <CalendarDays size={14} aria-hidden="true" />
            <span>No upcoming shifts scheduled</span>
            <Badge tone="neutral">Check back soon</Badge>
          </div>
        )}

        <div className={styles.location}>
          <MapPin size={13} aria-hidden="true" />
          {cityState(opportunity.address)} ·{" "}
          {t("{distance} mi away", { distance: opportunity.distanceMiles.toFixed(1) })}
        </div>

        <div className={styles.cardActions}>
          <ButtonLink
            to={`/volunteer/opportunities/${opportunity.slug}`}
            variant="primary"
            size="small"
            icon={<ArrowRight size={13} aria-hidden="true" />}
          >
            View
          </ButtonLink>
          <Button variant="ghost" size="small" onClick={() => onRemove(item)}>
            Remove
          </Button>
        </div>
      </div>
    </article>
  );
}

export function SavedPage() {
  const { workspace, session, actions } = useWorkspace();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("match");
  const [lastRemoved, setLastRemoved] = useState<SavedItem | null>(null);

  const savedItems = useMemo<SavedItem[]>(() => {
    const volunteer = currentVolunteer(workspace);
    const scores = new Map(
      getMatches(volunteer, 20, workspace, session.createdOpportunities).map((match) => [
        match.opportunity.id,
        match,
      ]),
    );
    return getSavedOpportunities(session, workspace).map((opportunity) => {
      const match = scores.get(opportunity.id);
      const nextShift =
        getShiftRowsForOpportunity(opportunity.id, workspace).find(
          (row) => row.shift.startsAt > workspace.demoNow,
        )?.shift ?? null;
      return {
        opportunity,
        score: match?.score ?? 0,
        nextShift,
        seatsOpen: nextShift ? Math.max(0, nextShift.capacity - nextShift.confirmed) : null,
      };
    });
  }, [session, workspace]);

  const counts = useMemo(
    () => ({
      all: savedItems.length,
      high: savedItems.filter((item) => item.score >= 65).length,
      upcoming: savedItems.filter((item) => item.nextShift).length,
      nearby: savedItems.filter((item) => item.opportunity.distanceMiles <= 2.5).length,
    }),
    [savedItems],
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const searched = savedItems.filter((item) => {
      if (!term) return true;
      return [item.opportunity.title, item.opportunity.organization, item.opportunity.address]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
    const filtered = searched.filter((item) => {
      if (filter === "high") return item.score >= 65;
      if (filter === "upcoming") return Boolean(item.nextShift);
      if (filter === "nearby") return item.opportunity.distanceMiles <= 2.5;
      return true;
    });
    return filtered.slice().sort((a, b) => {
      if (sort === "soonest")
        return (a.nextShift?.startsAt ?? "9999").localeCompare(b.nextShift?.startsAt ?? "9999");
      if (sort === "closest") return a.opportunity.distanceMiles - b.opportunity.distanceMiles;
      return b.score - a.score;
    });
  }, [savedItems, search, filter, sort]);

  const upcomingItems = visible.filter((item) => item.nextShift);
  const highMatch = upcomingItems.filter((item) => item.score >= 65);
  const later = upcomingItems.filter((item) => item.score < 65);
  const noUpcoming = visible.filter((item) => !item.nextShift);
  const showLater = filter !== "high" && later.length > 0;

  function remove(item: SavedItem) {
    actions.setSaved(item.opportunity.id, false);
    setLastRemoved(item);
  }

  function undoRemove() {
    if (!lastRemoved) return;
    actions.setSaved(lastRemoved.opportunity.id, true);
    setLastRemoved(null);
  }

  const emptyShortlist = savedItems.length === 0;

  return (
    <Page>
      <PageHeader
        eyebrow="Volunteer workspace"
        title="Saved Opportunities"
        description="Keep promising opportunities close at hand. Matches and next shifts update from the same live shortlist."
        actions={
          <ButtonLink
            to="/volunteer/discover"
            variant="primary"
            icon={<Compass size={15} aria-hidden="true" />}
          >
            Discover opportunities
          </ButtonLink>
        }
      />

      {lastRemoved ? (
        <div className={styles.undoBanner} role="status">
          <Bookmark size={15} aria-hidden="true" />
          <span>
            {t("Removed {program} from your saved list.", {
              program: lastRemoved.opportunity.title,
            })}
          </span>
          <button type="button" className={styles.undoButton} onClick={undoRemove}>
            <Undo2 size={14} aria-hidden="true" />
            Undo
          </button>
        </div>
      ) : null}

      {emptyShortlist ? (
        <div className={styles.emptyWrap}>
          <EmptyState
            title="No saved opportunities yet"
            copy="Browse programs and tap Save to build a shortlist you can compare later."
            action={
              <ButtonLink to="/volunteer/discover" variant="primary">
                Explore opportunities
              </ButtonLink>
            }
          />
        </div>
      ) : (
        <>
          <div className={styles.toolbar}>
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder="Search saved opportunities…"
              label="Search saved opportunities"
            />
            <div className={styles.filters} role="group" aria-label="Filter saved opportunities">
              {FILTERS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={[styles.chip, filter === option.id ? styles.chipActive : ""]
                    .filter(Boolean)
                    .join(" ")}
                  aria-pressed={filter === option.id}
                  onClick={() => setFilter(option.id)}
                >
                  {t(option.label)}
                  <span className={styles.chipCount}>{counts[option.id]}</span>
                </button>
              ))}
            </div>
            <label className={styles.sort}>
              <span className="visually-hidden">Sort saved opportunities</span>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as Sort)}
                aria-label="Sort saved opportunities"
              >
                <option value="match">Best match</option>
                <option value="soonest">Soonest shift</option>
                <option value="closest">Closest first</option>
              </select>
            </label>
          </div>

          {visible.length === 0 ? (
            <div className={styles.emptyWrap}>
              <EmptyState
                title="No saved opportunities match"
                copy="Try a different search or clear the filters to see your whole shortlist."
                action={
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSearch("");
                      setFilter("all");
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            </div>
          ) : null}

          {highMatch.length > 0 ? (
            <section className={styles.section} aria-labelledby="saved-high">
              <SectionHeader
                id="saved-high"
                title="High match for you"
                subtitle="Best fit against your interests, skills, and availability"
                action={
                  <span className={styles.sectionCount}>
                    {t(highMatch.length === 1 ? "{count} opportunity" : "{count} opportunities", {
                      count: highMatch.length,
                    })}
                  </span>
                }
              />
              <div className={styles.featureGrid}>
                {highMatch.map((item) => (
                  <SavedCard
                    key={item.opportunity.id}
                    item={item}
                    wide={highMatch.length === 1}
                    onRemove={remove}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {showLater ? (
            <section className={styles.section} aria-labelledby="saved-later">
              <SectionHeader
                id="saved-later"
                title="Saved for later"
                subtitle="Worth a second look when your week opens up"
                action={
                  <span className={styles.sectionCount}>
                    {t(later.length === 1 ? "{count} opportunity" : "{count} opportunities", {
                      count: later.length,
                    })}
                  </span>
                }
              />
              <div className={styles.grid}>
                {later.map((item) => (
                  <SavedCard key={item.opportunity.id} item={item} onRemove={remove} />
                ))}
              </div>
            </section>
          ) : null}

          {noUpcoming.length > 0 ? (
            <section className={styles.section} aria-labelledby="saved-later-no-shifts">
              <SectionHeader
                id="saved-later-no-shifts"
                title="No upcoming shifts"
                subtitle="Saved programs without a scheduled shift right now"
                action={<span className={styles.sectionCount}>{noUpcoming.length}</span>}
              />
              <div className={styles.grid}>
                {noUpcoming.map((item) => (
                  <SavedCard key={item.opportunity.id} item={item} onRemove={remove} />
                ))}
              </div>
            </section>
          ) : null}

          <footer className={styles.footer}>
            <span>
              {counts.all} saved · {counts.upcoming} with upcoming shifts · {counts.high} high{" "}
              {counts.high === 1 ? "match" : "matches"}
            </span>
            <ButtonLink to="/volunteer/discover" variant="ghost" size="small">
              Find another opportunity
              <ArrowRight size={14} aria-hidden="true" />
            </ButtonLink>
          </footer>
        </>
      )}
    </Page>
  );
}
