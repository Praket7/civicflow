import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  MapPin,
  Sparkles,
  Wand2,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { Link } from "react-router-dom";
import {
  Avatar,
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  SearchField,
  Toggle,
} from "../../components/ui";
import { t } from "../../lib/i18n";
import type { RosterPlan, Shift, Volunteer } from "../../types/domain";
import { useWorkspace } from "../../lib/workspace/session";
import styles from "./AutoRosterPage.module.css";
import {
  fillPercent,
  formatDate,
  getRoster,
  getShiftRows,
  getUpcomingShiftRows,
  getWaitlist,
  timeRange,
} from "../../lib/workspace/selectors";

interface RoleGap {
  name: string;
  required: number;
  filled: number;
  missing: number;
}

type AvailabilityState = "available" | "partial" | "unknown" | "unavailable";

interface Candidate {
  volunteer: Volunteer;
  primaryRole: string;
  eligibleRoles: string[];
  score: number;
  scores: Record<string, number>;
  breakdown: { label: string; value: number; max: number }[];
  reasons: string[];
  availability: AvailabilityState;
  weeklyShifts: number;
  conflict: string | null;
  waitlisted: boolean;
}

interface PlanRow {
  gap: RoleGap;
  candidate: Candidate | null;
  backend: RosterPlan["assignments"][number] | null;
}

interface EngineOptions {
  preferSpanish: boolean;
  includeWaitlist: boolean;
  blockConflicts: boolean;
  capWeekly: boolean;
}

const DEFAULT_OPTIONS: EngineOptions = {
  preferSpanish: true,
  includeWaitlist: true,
  blockConflicts: true,
  capWeekly: false,
};

const ROLE_COLORS = [
  "var(--color-red)",
  "var(--color-orange)",
  "var(--color-green)",
  "var(--color-cobalt)",
  "var(--color-violet)",
];

function roleEligible(volunteer: Volunteer, roleName: string): boolean {
  const role = roleName.toLowerCase();
  if (role.includes("driver")) return volunteer.skills.includes("Driver");
  if (role.includes("spanish")) {
    return volunteer.skills.includes("Spanish") || volunteer.languages.includes("Spanish");
  }
  if (role.includes("food")) return volunteer.skills.includes("Food handling");
  if (role.includes("tutor")) {
    return volunteer.skills.some((skill) => ["Tutoring", "Math tutor"].includes(skill));
  }
  if (role.includes("garden")) return volunteer.skills.includes("Gardening");
  return volunteer.skills.some((skill) => role.includes(skill.toLowerCase()));
}

function dayKeyFor(shift: Shift): string {
  return format(parseISO(shift.startsAt), "EEE").toLowerCase();
}

function periodFor(shift: Shift): string {
  const hour = Number(format(parseISO(shift.startsAt), "H"));
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function availabilityLabel(state: AvailabilityState): string {
  if (state === "available") return "Available for this shift";
  if (state === "partial") return "Partial availability this day";
  if (state === "unknown") return "Availability not confirmed";
  return "No availability listed for this day";
}

export function AutoRosterPage() {
  const { workspace, session, actions } = useWorkspace();
  const shiftOptions = useMemo(
    () =>
      getUpcomingShiftRows(workspace).filter((row) =>
        row.shift.roles.some((role) => role.filled < role.required),
      ),
    [workspace],
  );

  const [shiftId, setShiftId] = useState(() => {
    const preferred = shiftOptions.find((row) => row.shift.id === "sh-sat-food");
    return preferred?.shift.id ?? shiftOptions[0]?.shift.id ?? "";
  });
  const [query, setQuery] = useState("");
  const [skillFilter, setSkillFilter] = useState("all");
  const [availabilityFilter, setAvailabilityFilter] = useState("all");
  const [sortBy, setSortBy] = useState("best");
  const [showAll, setShowAll] = useState(false);
  const [options, setOptions] = useState<EngineOptions>(DEFAULT_OPTIONS);
  const [plan, setPlan] = useState<RosterPlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState("");

  const selected = shiftOptions.find((row) => row.shift.id === shiftId) ?? shiftOptions[0];
  const shift = selected?.shift;
  const opportunity = selected?.opportunity;

  const data = useMemo(() => {
    if (!shift || !opportunity) {
      return {
        gaps: [] as RoleGap[],
        candidates: [] as Candidate[],
        availableCount: 0,
        rosterCount: 0,
      };
    }

    const gaps: RoleGap[] = shift.roles
      .filter((role) => role.filled < role.required)
      .map((role) => ({
        name: role.name,
        required: role.required,
        filled: role.filled,
        missing: role.required - role.filled,
      }));

    const roster = getRoster(shift.id, session, workspace);
    const rosterIds = new Set(roster.map((row) => row.volunteer.id));
    const allRows = getShiftRows(workspace);
    const rosters = new Map(
      allRows.map((row) => [row.shift.id, getRoster(row.shift.id, session, workspace)]),
    );
    const waitlist = shift.waitlisted > 0 ? getWaitlist(shift.id, session, workspace) : [];
    const waitlistIds = new Set(waitlist.map((row) => row.volunteer.id));

    const base = workspace.volunteers.filter((volunteer) => !rosterIds.has(volunteer.id));
    const pool = [...base];
    if (options.includeWaitlist) {
      waitlist.forEach((row) => {
        if (!pool.some((volunteer) => volunteer.id === row.volunteer.id)) pool.push(row.volunteer);
      });
    }

    const day = dayKeyFor(shift);
    const period = periodFor(shift);
    const shiftStart = parseISO(shift.startsAt).getTime();
    const shiftEnd = parseISO(shift.endsAt).getTime();
    const now = parseISO(workspace.demoNow).getTime();

    const candidates = pool
      .map((volunteer): Candidate | null => {
        const eligibleRoles = gaps
          .filter((gap) => roleEligible(volunteer, gap.name))
          .map((gap) => gap.name);
        if (eligibleRoles.length === 0) return null;

        const daySlots = volunteer.availability.filter((slot) => slot.day === day);
        const exactSlot = daySlots.some((slot) => slot.period === period);
        const availability: AvailabilityState =
          exactSlot && daySlots.length > 0
            ? "available"
            : daySlots.length > 0
              ? "partial"
              : volunteer.availability.length === 0
                ? "unknown"
                : "unavailable";
        const availabilityScore = { available: 20, partial: 12, unknown: 10, unavailable: 0 }[
          availability
        ];

        const weeklyShifts = allRows.filter((row) => {
          if (row.shift.id === shift.id) return false;
          const start = parseISO(row.shift.startsAt).getTime();
          if (start < now || start > now + 7 * 86_400_000) return false;
          return rosters.get(row.shift.id)?.some((entry) => entry.volunteer.id === volunteer.id);
        }).length;

        const conflictRow = allRows.find((row) => {
          if (row.shift.id === shift.id) return false;
          if (row.shift.startsAt.slice(0, 10) !== shift.startsAt.slice(0, 10)) return false;
          const start = parseISO(row.shift.startsAt).getTime();
          const end = parseISO(row.shift.endsAt).getTime();
          const overlaps = start < shiftEnd && end > shiftStart;
          return (
            overlaps && rosters.get(row.shift.id)?.some((entry) => entry.volunteer.id === volunteer.id)
          );
        });

        const spanish = volunteer.languages.includes("Spanish");
        const interest = volunteer.causes.includes(opportunity.cause) ? 15 : 0;
        const reliability = Math.round((volunteer.attendanceRate / 100) * 15);
        const scores: Record<string, number> = {};
        for (const role of eligibleRoles) {
          const language =
            role.toLowerCase().includes("spanish") || (options.preferSpanish && spanish) ? 10 : 0;
          scores[role] = Math.min(
            100,
            40 + availabilityScore + interest + reliability + language,
          );
        }
        const primaryRole = eligibleRoles.reduce((best, role) =>
          (scores[role] ?? 0) > (scores[best] ?? 0) ? role : best,
        );
        const score = scores[primaryRole] ?? 0;
        const language = Math.max(0, score - (40 + availabilityScore + interest + reliability));

        return {
          volunteer,
          primaryRole,
          eligibleRoles,
          score,
          scores,
          breakdown: [
            { label: "Skill and credential fit", value: 40, max: 40 },
            { label: "Availability fit", value: availabilityScore, max: 20 },
            { label: "Interest in this cause", value: interest, max: 15 },
            { label: "Attendance reliability", value: reliability, max: 15 },
            { label: "Language preference", value: Math.max(0, language), max: 10 },
          ],
          reasons: [
            availabilityLabel(availability),
            volunteer.causes.includes(opportunity.cause)
              ? `${opportunity.cause === "food" ? "Food security" : opportunity.cause} interest`
              : `${volunteer.skills[0] ?? "General"} skill fit`,
            `${volunteer.attendanceRate}% attendance`,
          ].slice(0, 3),
          availability,
          weeklyShifts,
          conflict: conflictRow
            ? `${conflictRow.opportunity.title} · ${timeRange(conflictRow.shift.startsAt, conflictRow.shift.endsAt)}`
            : null,
          waitlisted: waitlistIds.has(volunteer.id),
        };
      })
      .filter((candidate): candidate is Candidate => candidate !== null);

    return { gaps, candidates, availableCount: base.length, rosterCount: roster.length };
  }, [shift, opportunity, session, workspace, options.includeWaitlist, options.preferSpanish]);

  const filteredCandidates = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const rows = data.candidates.filter((candidate) => {
      if (skillFilter !== "all" && !candidate.eligibleRoles.includes(skillFilter)) return false;
      if (availabilityFilter !== "all" && candidate.availability !== availabilityFilter) return false;
      if (!normalized) return true;
      return `${candidate.volunteer.name} ${candidate.volunteer.skills.join(" ")} ${candidate.eligibleRoles.join(" ")}`
        .toLowerCase()
        .includes(normalized);
    });
    return rows.sort((a, b) => {
      if (sortBy === "name") return a.volunteer.name.localeCompare(b.volunteer.name);
      if (sortBy === "attendance") return b.volunteer.attendanceRate - a.volunteer.attendanceRate;
      return (
        b.score - a.score ||
        b.volunteer.attendanceRate - a.volunteer.attendanceRate ||
        a.volunteer.name.localeCompare(b.volunteer.name)
      );
    });
  }, [availabilityFilter, data.candidates, query, skillFilter, sortBy]);

  const visibleCandidates = showAll ? filteredCandidates : filteredCandidates.slice(0, 6);
  const skillOptions = useMemo(
    () =>
      Array.from(new Set(data.candidates.flatMap((candidate) => candidate.eligibleRoles))).sort(),
    [data.candidates],
  );

  const eligibleForPlan = useMemo(
    () =>
      data.candidates.filter(
        (candidate) =>
          !(options.blockConflicts && candidate.conflict) &&
          !(options.capWeekly && candidate.weeklyShifts >= 2),
      ),
    [data.candidates, options.blockConflicts, options.capWeekly],
  );

  // The optimiser lives in Rust. This screen renders the returned plan and
  // never invents an assignment of its own; the candidate list is only the
  // explainable pool that feeds the request.
  const activePlan = useMemo<PlanRow[]>(() => {
    if (!plan) return [];
    return plan.assignments.map((assignment) => {
      const gap =
        data.gaps.find((row) => row.name === assignment.role) ?? {
          name: assignment.role,
          required: 1,
          filled: 0,
          missing: 1,
        };
      const known = data.candidates.find(
        (candidate) => candidate.volunteer.id === assignment.candidateId,
      );
      const candidate: Candidate =
        known ?? {
          volunteer:
            workspace.volunteers.find((row) => row.id === assignment.candidateId) ??
            workspace.volunteers[0],
          primaryRole: assignment.role,
          eligibleRoles: assignment.eligibleRoles,
          score: assignment.score,
          scores: { [assignment.role]: assignment.score },
          breakdown: [
            { label: "Skill and credential fit", value: assignment.breakdown.skill, max: 40 },
            { label: "Availability fit", value: assignment.breakdown.availability, max: 20 },
            { label: "Interest in this cause", value: assignment.breakdown.interest, max: 15 },
            { label: "Attendance reliability", value: assignment.breakdown.reliability, max: 15 },
            { label: "Language and fairness", value: assignment.breakdown.fairness, max: 20 },
          ],
          reasons: assignment.reasons,
          availability: "available",
          weeklyShifts: 0,
          conflict: null,
          waitlisted: assignment.promoteWaitlist,
        };
      return { gap, candidate, backend: assignment };
    });
  }, [data.candidates, data.gaps, plan, workspace.volunteers]);

  if (!shift || !opportunity) {
    return (
      <div className={styles.page}>
        <EmptyState
          title="Every shift is fully staffed"
          copy="There are no role gaps in the upcoming schedule. New shifts appear here as soon as a role opens."
          action={<ButtonLink to="/coordinator/schedule">Open schedule</ButtonLink>}
        />
      </div>
    );
  }

  const requiredSlots = shift.roles.reduce((total, role) => total + role.required, 0);
  const filledSlots = shift.roles.reduce((total, role) => total + role.filled, 0);
  const beforeRolePercent =
    requiredSlots === 0 ? 100 : Math.round((filledSlots / requiredSlots) * 100);
  const beforeSeatPercent = fillPercent(shift);
  const plannedCandidates = activePlan.filter((assignment) => assignment.candidate);
  const afterRolePercent =
    requiredSlots === 0
      ? 100
      : Math.round(((filledSlots + plannedCandidates.length) / requiredSlots) * 100);
  const afterSeats = Math.min(shift.capacity, shift.confirmed + plannedCandidates.length);
  const afterSeatPercent = shift.capacity === 0 ? 0 : Math.round((afterSeats / shift.capacity) * 100);
  const excludedCount = data.candidates.length - eligibleForPlan.length;
  const coverageGain = Math.max(0, afterRolePercent - beforeRolePercent);

  function invalidatePlan() {
    setPlan(null);
    setApplied(false);
  }

  function updateOption(key: keyof EngineOptions, value: boolean) {
    setOptions((current) => ({ ...current, [key]: value }));
    invalidatePlan();
  }

  async function generatePlan() {
    setPlanning(true);
    setError("");
    try {
      const result = await actions.autoRoster([shift.id], {
        preferSpanish: options.preferSpanish,
        includeWaitlist: options.includeWaitlist,
        blockConflicts: options.blockConflicts,
        capWeekly: options.capWeekly,
      });
      setPlan(result);
      setApplied(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setPlanning(false);
    }
  }

  async function applyPlan() {
    if (applied) return;
    try {
      const planned = activePlan.filter((assignment) => assignment.candidate);
      await actions.applyRoster(
        shift.id,
        planned.map((assignment) => ({
          candidateId: assignment.candidate!.volunteer.id,
          role: assignment.gap.name,
          promoteWaitlist: assignment.backend?.promoteWaitlist ?? false,
        })),
      );
      setApplied(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <nav className={styles.crumb} aria-label="Breadcrumb">
          <Link to="/coordinator/coverage">Coverage</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">AutoRoster</span>
        </nav>
        <div className={styles.titleRow}>
          <div className={styles.titleCopy}>
            <h1 className={styles.title}>AutoRoster</h1>
            <p className={styles.lede}>
              Fill the open roles on this shift from people already on your books. The optimiser
              weighs skills, availability, clashes, and how often someone turns up.
            </p>
          </div>
          <div className={styles.headerActions}>
            <Button
              className={styles.optimizeButton}
              onClick={() => void generatePlan()}
              disabled={planning}
              icon={<Wand2 size={15} />}
            >
              {t(planning ? "Working…" : "Run optimiser")}
            </Button>
            <ButtonLink
              to={`/coordinator/shifts/${shift.id}`}
              variant="secondary"
              className={styles.exportButton}
            >
              Live roster
            </ButtonLink>
          </div>
        </div>
      </header>

      <div className={styles.shiftBar}>
        <div className={styles.shiftBarCopy}>
          <span className={styles.shiftBarLabel}>This shift</span>
          <h2 className={styles.shiftBarTitle}>{opportunity.title}</h2>
          <p className={styles.shiftBarMeta}>
            <CalendarClock size={13} aria-hidden="true" />
            {formatDate(shift.startsAt)} · {timeRange(shift.startsAt, shift.endsAt)}
            <span className={styles.sep} aria-hidden="true">·</span>
            <MapPin size={13} aria-hidden="true" />
            {opportunity.address}
          </p>
        </div>
        <label className={styles.shiftPicker}>
          <span className={styles.srOnly}>Shift to optimise</span>
          <select
            value={shift.id}
            onChange={(event) => {
              setShiftId(event.target.value);
              invalidatePlan();
            }}
          >
            {shiftOptions.map((row) => (
              <option key={row.shift.id} value={row.shift.id}>
                {row.opportunity.title} · {format(parseISO(row.shift.startsAt), "MMM d")}
              </option>
            ))}
          </select>
          <ChevronDown size={13} aria-hidden="true" />
        </label>
      </div>

      <div className={styles.grid}>
        <section className={`${styles.pane} ${styles.available}`} aria-label="Available volunteers">
          <div className={styles.paneHead}>
            <div>
              <h2 className={styles.paneTitle}>Who can take it</h2>
              <p className={styles.paneSub}>
                {data.candidates.length} people match at least one open role.
              </p>
            </div>
            <span className={styles.paneCount}>
              <strong>{filteredCandidates.length}</strong> shown
            </span>
          </div>

          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search by name or skill"
            label="Search eligible volunteers"
          />

          <div className={styles.filters}>
            <label className={styles.selectWrap}>
              <span className={styles.srOnly}>Filter by role</span>
              <select value={skillFilter} onChange={(event) => setSkillFilter(event.target.value)}>
                <option value="all">All Skills</option>
                {skillOptions.map((skill) => (
                  <option key={skill} value={skill}>
                    {skill}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} aria-hidden="true" />
            </label>
            <label className={styles.selectWrap}>
              <span className={styles.srOnly}>Filter by availability</span>
              <select
                value={availabilityFilter}
                onChange={(event) => setAvailabilityFilter(event.target.value)}
              >
                <option value="all">All Availability</option>
                <option value="available">Available</option>
                <option value="partial">Partial</option>
                <option value="unknown">Not confirmed</option>
              </select>
              <ChevronDown size={13} aria-hidden="true" />
            </label>
            <label className={styles.selectWrap}>
              <span className={styles.srOnly}>Sort volunteers</span>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                <option value="best">Sort: Best Match</option>
                <option value="attendance">Sort: Attendance</option>
                <option value="name">Sort: Name</option>
              </select>
              <ChevronDown size={13} aria-hidden="true" />
            </label>
          </div>

          <ul className={styles.candidateList}>
            {visibleCandidates.map((candidate) => (
              <li key={candidate.volunteer.id} className={styles.candidate}>
                <Avatar
                  initials={candidate.volunteer.initials}
                  src={candidate.volunteer.photo}
                  tone={candidate.volunteer.tone}
                  size={38}
                  label={candidate.volunteer.name}
                />
                <div className={styles.candidateBody}>
                  <div className={styles.candidateTop}>
                    <span className={styles.candidateName}>{candidate.volunteer.name}</span>
                    <span
                      className={styles.matchScore}
                      aria-label={`${candidate.score} percent match`}
                    >
                      {candidate.score}%
                      <ArrowRight size={12} aria-hidden="true" />
                    </span>
                  </div>
                  <div className={styles.candidateMeta}>
                    {candidate.primaryRole} · {candidate.volunteer.attendanceRate}% attendance
                  </div>
                  <div className={styles.candidateTags}>
                    {Array.from(
                      new Set([...candidate.eligibleRoles, ...candidate.volunteer.skills]),
                    )
                      .slice(0, 2)
                      .map((role) => (
                        <span key={role} className={styles.skillTag}>
                          {role}
                        </span>
                      ))}
                  </div>
                  {candidate.conflict || candidate.waitlisted ? (
                    <div className={styles.candidateFlags}>
                      {candidate.waitlisted ? <Badge tone="violet">Waitlist</Badge> : null}
                      {candidate.conflict ? (
                        <Badge tone="amber" icon={<AlertTriangle size={9} />}>
                          Conflict
                        </Badge>
                      ) : null}
                    </div>
                  ) : null}
                  <details className={styles.why}>
                    <summary>Why this match</summary>
                    <ul className={styles.reasonList}>
                      {candidate.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                    <div className={styles.breakdown}>
                      {candidate.breakdown.map((row) => (
                        <div key={row.label} className={styles.breakdownRow}>
                          <span>{row.label}</span>
                          <div className={styles.breakdownTrack} aria-hidden="true">
                            <span style={{ width: `${(row.value / row.max) * 100}%` }} />
                          </div>
                          <span className={styles.breakdownValue}>{row.value}</span>
                        </div>
                      ))}
                    </div>
                    <p className={styles.whyNote}>
                      {candidate.weeklyShifts} upcoming shift
                      {candidate.weeklyShifts === 1 ? "" : "s"} in the next 7 days.
                      {candidate.conflict ? ` Overlaps ${candidate.conflict}.` : ""}
                    </p>
                  </details>
                </div>
              </li>
            ))}
          </ul>

          {filteredCandidates.length === 0 ? (
            <p className={styles.none}>No volunteer matches that search.</p>
          ) : filteredCandidates.length > 6 ? (
            <Button
              variant="ghost"
              size="small"
              className={styles.showAll}
              onClick={() => setShowAll((value) => !value)}
            >
              {showAll
                ? t("Show fewer")
                : t("Show all {count}", { count: filteredCandidates.length })}
            </Button>
          ) : null}
        </section>

        <section className={`${styles.pane} ${styles.plan}`} aria-label="Proposed roster">
          <div className={styles.paneHead}>
            <div>
              <h2 className={styles.paneTitle}>The plan</h2>
              <p className={styles.paneSub}>
                {planning
                  ? "Reading availability, clashes, and recent attendance."
                  : plan
                    ? plannedCandidates.length > 0
                      ? t(
                          plannedCandidates.length === 1
                            ? "{count} person would close a gap on this shift."
                            : "{count} people would close the gaps on this shift.",
                          { count: plannedCandidates.length },
                        )
                      : t("Nobody clears the current rules for this shift.")
                    : t("Run the optimiser to see who fits each open role, and why.")}
              </p>
            </div>
            <div
              className={styles.planCoverage}
              aria-label={t("Projected role coverage {percent} percent", {
                percent: afterRolePercent,
              })}
            >
              <span>{afterRolePercent}%</span>
              <small>covered</small>
            </div>
          </div>

          <div className={styles.coveragePanel}>
            <div className={styles.coverageFigures}>
              <div>
                <span className={styles.coverageLabel}>Role coverage</span>
                <p className={styles.coverageNumbers}>
                  <span>{beforeRolePercent}%</span>
                  <ArrowRight size={14} aria-hidden="true" />
                  <strong>{afterRolePercent}%</strong>
                </p>
              </div>
              <div>
                <span className={styles.coverageLabel}>Seats filled</span>
                <p className={styles.coverageNumbers}>
                  <span>{beforeSeatPercent}%</span>
                  <ArrowRight size={14} aria-hidden="true" />
                  <strong>{afterSeatPercent}%</strong>
                </p>
              </div>
            </div>
            <div
              className={styles.coverageTrackWide}
              role="img"
              aria-label={`Role coverage moves from ${beforeRolePercent} to ${afterRolePercent} percent`}
            >
              <span className={styles.coverageBefore} style={{ width: `${beforeRolePercent}%` }} />
              <span className={styles.coverageAfter} style={{ width: `${afterRolePercent}%` }} />
            </div>
            <p className={styles.coverageHint}>
              {coverageGain > 0
                ? t("This plan adds {points} points of role coverage.", { points: coverageGain })
                : t("No change in role coverage yet.")}
              {excludedCount > 0
                ? ` ${t(
                    excludedCount === 1
                      ? "{count} person is held back by the active rules."
                      : "{count} people are held back by the active rules.",
                    { count: excludedCount },
                  )}`
                : ""}
            </p>
          </div>

          {error ? (
            <p className={styles.errorNote} role="alert">
              {error}
            </p>
          ) : null}

          {plannedCandidates.length > 0 ? (
            <>
              <ul className={styles.planList}>
                {plannedCandidates.map((assignment) => {
                  const candidate = assignment.candidate;
                  if (!candidate) return null;
                  return (
                    <li key={`${assignment.gap.name}-${candidate.volunteer.id}`} className={styles.planRow}>
                      <Avatar
                        initials={candidate.volunteer.initials}
                        src={candidate.volunteer.photo}
                        tone={candidate.volunteer.tone}
                        size={38}
                        label={candidate.volunteer.name}
                      />
                      <div className={styles.planPerson}>
                        <span className={styles.planName}>{candidate.volunteer.name}</span>
                        <span className={styles.planRole}>
                          {assignment.gap.name}
                          {candidate.volunteer.languages.includes("Spanish") ? " · Spanish" : ""}
                        </span>
                      </div>
                      <span className={styles.planReason}>
                        {candidate.reasons[0] ?? `${candidate.volunteer.attendanceRate}% attendance`}
                      </span>
                      <span className={styles.planScore}>{candidate.score}</span>
                    </li>
                  );
                })}
              </ul>
              <div className={styles.planActions}>
                <Button
                  className={styles.applyButton}
                  onClick={() => void applyPlan()}
                  disabled={applied}
                  icon={applied ? <CheckCircle2 size={16} /> : <ArrowRight size={16} />}
                >
                  {applied
                    ? "Assignments applied"
                    : `Apply ${plannedCandidates.length} assignment${plannedCandidates.length === 1 ? "" : "s"}`}
                </Button>
                <p className={applied ? styles.appliedNote : styles.applyNote} role={applied ? "status" : undefined}>
                  {applied
                    ? `Added to the roster and written to the audit log. Seat coverage is now ${afterSeatPercent}%.`
                    : `Nothing is saved until you apply. Seat coverage will move to ${afterSeatPercent}%.`}
                </p>
              </div>
            </>
          ) : plan ? (
            <div className={styles.emptyPlan}>
              <p className={styles.emptyPlanTitle}>No automatic match.</p>
              <p className={styles.emptyPlanBody}>
                The remaining people either lack the required skill, are already booked at this time,
                or have unconfirmed availability. Allow waitlisted volunteers or lower the weekly cap,
                then run it again.
              </p>
            </div>
          ) : (
            <div className={styles.emptyPlan}>
              <p className={styles.emptyPlanTitle}>Nothing proposed yet.</p>
              <p className={styles.emptyPlanBody}>
                A run does not book anyone. It only suggests people for the open roles; you review the
                list before anything reaches the roster.
              </p>
              <Button
                variant="secondary"
                onClick={() => void generatePlan()}
                disabled={planning}
                icon={<Wand2 size={15} />}
              >
                {t(planning ? "Working…" : "Generate a plan")}
              </Button>
            </div>
          )}

          <details className={styles.engineOptions}>
            <summary>Matching settings</summary>
            <div className={styles.toggles}>
              <Toggle
                label="Prefer Spanish speakers"
                hint="Adds up to 10 points to bilingual candidates."
                checked={options.preferSpanish}
                onChange={(value) => updateOption("preferSpanish", value)}
              />
              <Toggle
                label="Include waitlist"
                hint="Waiting volunteers can be promoted into a gap."
                checked={options.includeWaitlist}
                onChange={(value) => updateOption("includeWaitlist", value)}
              />
              <Toggle
                label="Block overlapping shifts"
                hint="Keeps anyone already booked at this time out of the plan."
                checked={options.blockConflicts}
                onChange={(value) => updateOption("blockConflicts", value)}
              />
              <Toggle
                label="Cap at 2 shifts per week"
                hint="Protects volunteers from over-scheduling."
                checked={options.capWeekly}
                onChange={(value) => updateOption("capWeekly", value)}
              />
            </div>
            <div className={styles.weights}>
              <p className={styles.miniLabel}>How the match score is built</p>
              <div className={styles.weightRow}>
                <span>Skill / credential fit</span>
                <span>40</span>
              </div>
              <div className={styles.weightRow}>
                <span>Availability fit</span>
                <span>20</span>
              </div>
              <div className={styles.weightRow}>
                <span>Cause interest</span>
                <span>15</span>
              </div>
              <div className={styles.weightRow}>
                <span>Attendance reliability</span>
                <span>15</span>
              </div>
              <div className={styles.weightRow}>
                <span>Language preference</span>
                <span>10</span>
              </div>
            </div>
          </details>

          <p className={styles.engineNote}>
            Deterministic and offline. The same inputs always produce the same roster.
          </p>
        </section>

        <section className={`${styles.pane} ${styles.requirements}`} aria-label="Shift requirements">
          <div className={styles.paneHead}>
            <div>
              <h2 className={styles.paneTitle}>Shift brief</h2>
              <p className={styles.paneSub}>What the shift asks for, and what is already covered.</p>
            </div>
            <span className={styles.paneCount}>
              <strong>{data.rosterCount}</strong> on roster
            </span>
          </div>

          <div className={styles.briefBlock}>
            <h3 className={styles.subhead}>Open roles</h3>
            <ul className={styles.roleList}>
              {shift.roles.map((role, index) => (
                <li key={role.name} className={styles.roleRow}>
                  <span
                    className={styles.roleDot}
                    style={{ background: ROLE_COLORS[index % ROLE_COLORS.length] }}
                    aria-hidden="true"
                  />
                  <span className={styles.roleName}>{role.name}</span>
                  <span
                    className={styles.roleCount}
                    data-full={role.filled >= role.required ? "true" : "false"}
                  >
                    {role.filled}/{role.required}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.briefTotals}>
            <div>
              <span>Role slots</span>
              <strong>
                {filledSlots} of {requiredSlots}
              </strong>
            </div>
            <div>
              <span>Seats filled</span>
              <strong>
                {shift.confirmed} of {shift.capacity}
              </strong>
            </div>
            <div>
              <span>People eligible</span>
              <strong>{data.candidates.length}</strong>
            </div>
          </div>

          <div className={styles.briefNote}>
            <Sparkles size={15} aria-hidden="true" />
            <p>
              Role coverage counts required slots. Seats count people, including volunteers who can
              cover more than one role.
            </p>
          </div>

          {applied ? (
            <p className={styles.savedState} role="status">
              <CheckCircle2 size={13} aria-hidden="true" />
              Saved to the live roster
            </p>
          ) : null}

          <p className={styles.requirementsFoot}>
            {data.gaps.length} open role{data.gaps.length === 1 ? "" : "s"} · {data.rosterCount} on
            roster now
          </p>
        </section>
      </div>
    </div>
  );
}
