import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle,
  ArrowUpRight,
  BriefcaseBusiness,
  Clock3,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  Badge,
  Button,
  ButtonLink,
  DataTable,
  EmptyState,
  Page,
  PageHeader,
  ProgressBar,
  SearchField,
  type Column,
} from "../../components/ui";
import { t } from "../../lib/i18n";
import type { Cause } from "../../types/domain";
import { useWorkspace } from "../../lib/workspace/session";
import {
  CAUSE_LABELS,
  fillPercent,
  formatTime,
  getOpportunities,
  getShiftRowsForOpportunity,
  getUpcomingShiftRows,
} from "../../lib/workspace/selectors";
import styles from "./OpportunitiesPage.module.css";

type ProgramStatus = "needs-staff" | "open" | "ready" | "draft";
type StatusFilter = ProgramStatus | "all";
type SortKey = "next-shift" | "open-seats" | "title";

interface OpportunityRow {
  id: string;
  title: string;
  image: string;
  imageAlt: string;
  coordinator: string;
  cause: Cause;
  causeLabel: string;
  nextShift: { id: string; startsAt: string; confirmed: number; capacity: number } | null;
  upcomingCount: number;
  nextFill: number;
  nextConfirmed: number;
  nextCapacity: number;
  openSeats: number;
  status: ProgramStatus;
}

const STATUS_COPY: Record<
  ProgramStatus,
  { label: string; tone: "red" | "amber" | "green" | "neutral" }
> = {
  "needs-staff": { label: "Needs staff", tone: "red" },
  open: { label: "Open", tone: "amber" },
  ready: { label: "Ready", tone: "green" },
  draft: { label: "Draft", tone: "neutral" },
};

function programStatus(
  hasUpcoming: boolean,
  hasRoleGap: boolean,
  hasOpenSeats: boolean,
): ProgramStatus {
  if (!hasUpcoming) return "draft";
  if (hasRoleGap) return "needs-staff";
  if (hasOpenSeats) return "open";
  return "ready";
}

export function OpportunitiesPage() {
  const { workspace, session } = useWorkspace();
  const [query, setQuery] = useState("");
  const [causeFilter, setCauseFilter] = useState<Cause | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("next-shift");

  const opportunities = useMemo(() => getOpportunities(session, workspace), [session, workspace]);

  const rows = useMemo<OpportunityRow[]>(() => {
    return opportunities.map((opportunity) => {
      const upcoming = getShiftRowsForOpportunity(opportunity.id, workspace).filter(
        (row) => row.shift.startsAt > workspace.now,
      );
      const next = upcoming[0];
      const hasRoleGap = upcoming.some((row) =>
        row.shift.roles.some((role) => role.filled < role.required),
      );
      const hasOpenSeats = upcoming.some((row) => row.shift.confirmed < row.shift.capacity);
      const status = programStatus(upcoming.length > 0, hasRoleGap, hasOpenSeats);
      return {
        id: opportunity.id,
        title: opportunity.title,
        image: opportunity.image,
        imageAlt: opportunity.imageAlt,
        coordinator: opportunity.coordinator,
        cause: opportunity.cause,
        causeLabel: CAUSE_LABELS[opportunity.cause],
        nextShift: next
          ? {
              id: next.shift.id,
              startsAt: next.shift.startsAt,
              confirmed: next.shift.confirmed,
              capacity: next.shift.capacity,
            }
          : null,
        upcomingCount: upcoming.length,
        nextFill: next ? fillPercent(next.shift) : 0,
        nextConfirmed: next?.shift.confirmed ?? 0,
        nextCapacity: next?.shift.capacity ?? 0,
        openSeats: next ? next.shift.capacity - next.shift.confirmed : 0,
        status,
      };
    });
  }, [opportunities, workspace]);

  const coverage = useMemo(() => {
    const upcoming = getUpcomingShiftRows(workspace);
    const required = upcoming.reduce(
      (total, row) => total + row.shift.roles.reduce((sum, role) => sum + role.required, 0),
      0,
    );
    const filled = upcoming.reduce(
      (total, row) => total + row.shift.roles.reduce((sum, role) => sum + role.filled, 0),
      0,
    );
    return required === 0 ? 100 : Math.round((filled / required) * 100);
  }, [workspace]);

  const needsStaff = rows.filter((row) => row.status === "needs-staff").length;

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const result = rows.filter((row) => {
      if (causeFilter !== "all" && row.cause !== causeFilter) return false;
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!normalized) return true;
      return [row.title, row.causeLabel, row.coordinator, STATUS_COPY[row.status].label]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
    return result.sort((first, second) => {
      if (sort === "title") return first.title.localeCompare(second.title);
      if (sort === "open-seats")
        return second.openSeats - first.openSeats || first.title.localeCompare(second.title);
      const firstKey = first.nextShift?.startsAt ?? "9999";
      const secondKey = second.nextShift?.startsAt ?? "9999";
      return firstKey.localeCompare(secondKey) || first.title.localeCompare(second.title);
    });
  }, [causeFilter, query, rows, sort, statusFilter]);

  const columns = useMemo<Column<OpportunityRow>[]>(
    () => [
      {
        key: "opportunity",
        header: "Opportunity",
        render: (row) => (
          <div className={styles.opportunityCell}>
            <img className={styles.thumb} src={row.image} alt="" loading="lazy" />
            <div className={styles.opportunityCopy}>
              <Link className={styles.opportunityTitle} to={`/coordinator/opportunities/${row.id}`}>
                {row.title}
              </Link>
              <span className={styles.opportunityMeta}>
                {row.upcomingCount === 0
                  ? t("No shifts scheduled")
                  : t(
                      row.upcomingCount === 1
                        ? "{count} upcoming shift"
                        : "{count} upcoming shifts",
                      { count: row.upcomingCount },
                    )}
                {" · "}
                {row.coordinator}
              </span>
            </div>
          </div>
        ),
      },
      {
        key: "next-shift",
        header: "Next shift",
        width: "150px",
        render: (row) =>
          row.nextShift ? (
            <div className={styles.shiftCell}>
              <span className={styles.shiftDate}>
                {format(parseISO(row.nextShift.startsAt), "MMM d")}
              </span>
              <span className={styles.shiftTime}>{formatTime(row.nextShift.startsAt)}</span>
            </div>
          ) : (
            <span className={styles.muted}>Not scheduled</span>
          ),
      },
      {
        key: "fill",
        header: "Fill",
        width: "126px",
        render: (row) =>
          row.nextShift ? (
            <div className={styles.fillCell}>
              <span className={styles.fillValue}>
                {row.nextConfirmed} / {row.nextCapacity}
              </span>
              <div className={styles.fillTrack}>
                <ProgressBar
                  value={row.nextFill}
                  label={t("{program} next shift seat fill", { program: row.title })}
                  tone={
                    row.nextFill >= 90
                      ? "var(--color-green)"
                      : row.nextFill >= 70
                        ? "var(--color-orange)"
                        : "var(--color-red)"
                  }
                />
              </div>
            </div>
          ) : (
            <span className={styles.muted}>—</span>
          ),
      },
      {
        key: "cause",
        header: "Cause",
        width: "140px",
        render: (row) => (
          <span className={styles.causePill} data-cause={row.cause}>
            {row.causeLabel}
          </span>
        ),
      },
      {
        key: "status",
        header: "Status",
        width: "122px",
        render: (row) => {
          const status = STATUS_COPY[row.status];
          return (
            <Badge tone={status.tone} dot>
              {t(status.label)}
            </Badge>
          );
        },
      },
      {
        key: "actions",
        header: "Actions",
        width: "154px",
        render: (row) => (
          <div className={styles.actions}>
            <Link className={styles.actionLink} to={`/coordinator/opportunities/${row.id}`}>
              Manage
              <ArrowUpRight size={12} aria-hidden="true" />
            </Link>
            {row.nextShift ? (
              <Link
                className={styles.actionSecondary}
                to={`/coordinator/shifts/${row.nextShift.id}`}
              >
                Roster
              </Link>
            ) : null}
          </div>
        ),
      },
    ],
    [],
  );

  function resetFilters() {
    setQuery("");
    setCauseFilter("all");
    setStatusFilter("all");
    setSort("next-shift");
  }

  return (
    <Page>
      <PageHeader
        title="Opportunities"
        description="Manage programs, shifts, and volunteer demand."
        actions={
          <ButtonLink
            to="/coordinator/opportunities/new"
            variant="primary"
            icon={<Plus size={14} aria-hidden="true" />}
          >
            New opportunity
          </ButtonLink>
        }
      />

      <section className={styles.summaryGrid} aria-label="Program summary">
        <div className={styles.summaryCard} data-tone="cobalt">
          <span className={styles.summaryIcon} aria-hidden="true">
            <BriefcaseBusiness size={18} strokeWidth={1.9} />
          </span>
          <div>
            <div className={styles.summaryValue}>{rows.length}</div>
            <div className={styles.summaryLabel}>Active programs</div>
          </div>
        </div>
        <div className={styles.summaryCard} data-tone="coral">
          <span className={styles.summaryIcon} aria-hidden="true">
            <AlertTriangle size={18} strokeWidth={1.9} />
          </span>
          <div>
            <div className={styles.summaryValue}>{needsStaff}</div>
            <div className={styles.summaryLabel}>Need staff</div>
          </div>
        </div>
        <div className={styles.summaryCard} data-tone="teal">
          <span className={styles.summaryIcon} aria-hidden="true">
            <ShieldCheck size={18} strokeWidth={1.9} />
          </span>
          <div>
            <div className={styles.summaryValue}>{coverage}%</div>
            <div className={styles.summaryLabel}>Role coverage</div>
          </div>
        </div>
        <div className={styles.summaryCard} data-tone="violet">
          <span className={styles.summaryIcon} aria-hidden="true">
            <Clock3 size={18} strokeWidth={1.9} />
          </span>
          <div>
            <div className={styles.summaryValue}>{workspace.impact.hoursThisMonth} h</div>
            <div className={styles.summaryLabel}>Hours this month</div>
          </div>
        </div>
      </section>

      <section className={styles.toolbar} aria-label="Filter opportunities">
        <SearchField
          value={query}
          onChange={setQuery}
          label="Search opportunities"
          placeholder="Search programs, causes, coordinators…"
        />
        <label className={styles.filter}>
          <span className="visually-hidden">Filter by cause</span>
          <select
            className={styles.select}
            value={causeFilter}
            onChange={(event) => setCauseFilter(event.target.value as Cause | "all")}
          >
            <option value="all">All causes</option>
            {(Object.entries(CAUSE_LABELS) as [Cause, string][]).map(([cause, label]) => (
              <option key={cause} value={cause}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.filter}>
          <span className="visually-hidden">Filter by program status</span>
          <select
            className={styles.select}
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          >
            <option value="all">Any status</option>
            <option value="needs-staff">Needs staff</option>
            <option value="open">Open</option>
            <option value="ready">Ready</option>
            <option value="draft">Draft</option>
          </select>
        </label>
        <label className={styles.filter}>
          <span className="visually-hidden">Sort opportunities</span>
          <select
            className={styles.select}
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
          >
            <option value="next-shift">Next shift</option>
            <option value="open-seats">Most open seats</option>
            <option value="title">Name A–Z</option>
          </select>
        </label>
        <span className={styles.resultCount} aria-live="polite">
          {t("{shown} of {total}", { shown: filtered.length, total: rows.length })}
        </span>
      </section>

      {filtered.length === 0 ? (
        <EmptyState
          title="No programs match those filters"
          copy="Try a different cause or status, or clear the search to see every program."
          action={
            <Button variant="secondary" onClick={resetFilters}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          rows={filtered}
          caption={t("Programs at {organization}", { organization: workspace.organization.name })}
          empty="No programs yet."
          className={styles.table}
        />
      )}
    </Page>
  );
}
