import { differenceInCalendarDays, parseISO } from "date-fns";
import type { DemoWorkspace, SessionSnapshot } from "../../types/domain";
import { t } from "../i18n";
import { deriveAttention } from "../workspace/compute";
import {
  fillPercent,
  formatMinutes,
  formatMonthDay,
  formatNumber,
  formatTime,
  formatWeekday,
  getCredentials,
  getHourRows,
  getHoursSummary,
  getMatches,
  getRoster,
  getShiftRows,
  opportunityById,
  volunteerById,
} from "../workspace/selectors";

/**
 * Ask CivicFlow: a question box over the workspace snapshot.
 *
 * Every answer is computed from the records already on the device. There is no
 * model and no network call, so an answer can never be invented. Each intent
 * declares the keywords that select it, renders citations that name the rows it
 * read, and links to the screen where the coordinator can act. A question the
 * registry does not recognize returns a plain refusal rather than a guess.
 */

export type AskRole = "coordinator" | "volunteer";

interface AskCitation {
  id: string;
  label: string;
  detail: string;
  href?: string;
  tone?: "neutral" | "green" | "amber" | "red";
  /** The row is a question this box can answer, not a record. */
  ask?: boolean;
}

export interface AskAnswer {
  intent: string;
  matched: boolean;
  headline: string;
  summary: string;
  citations: AskCitation[];
  action?: { label: string; href: string };
  /**
   * The other actions this answer opens. Coverage shortfalls lead to the
   * coverage rescue, not only to the page the numbers came from.
   */
  actions?: { label: string; href: string }[];
  /** What the answer read: shifts, volunteers, credentials. */
  evidence: string;
  /** Records the answer read, so the citation count is never decorative. */
  recordsRead: number;
}

interface AskContext {
  role: AskRole;
  workspace: DemoWorkspace;
  session: Partial<SessionSnapshot>;
  volunteerId: string;
  /** A volunteer name parsed out of the question, when one was named. */
  questionName?: string;
  /** The normalized question, for intents that read a weekday from it. */
  query?: string;
}

interface AnswerBody {
  headline: string;
  summary: string;
  citations: AskCitation[];
  action?: { label: string; href: string };
  actions?: { label: string; href: string }[];
  recordsRead: number;
}

interface Intent {
  id: string;
  roles: AskRole[];
  /** The phrasing offered as a suggestion. It always resolves to this intent. */
  question: string;
  keywords: string[];
  answer(context: AskContext): AnswerBody;
}

/* ------------------------------- day helpers ------------------------------- */

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const DAY_WORDS: Record<string, string> = {
  sunday: "sun",
  monday: "mon",
  tuesday: "tue",
  wednesday: "wed",
  thursday: "thu",
  friday: "fri",
  saturday: "sat",
  sun: "sun",
  mon: "mon",
  tue: "tue",
  tues: "tue",
  wed: "wed",
  thu: "thu",
  thur: "thu",
  thurs: "thu",
  fri: "fri",
  sat: "sat",
};

/** The first weekday named in a question, as a scheduling key. */
function dayFromQuestion(query: string): string | undefined {
  for (const word of query.split(" ")) {
    const key = DAY_WORDS[word];
    if (key) return key;
  }
  return undefined;
}

function dayKey(iso: string): string {
  return DAY_KEYS[parseISO(iso).getDay()];
}

function periodOf(iso: string): "morning" | "afternoon" | "evening" {
  const hour = parseISO(iso).getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function daysOut(iso: string, now: string): number {
  return differenceInCalendarDays(parseISO(iso), parseISO(now));
}

function stamp(iso: string): string {
  return `${formatWeekday(iso)} ${formatMonthDay(iso)} · ${formatTime(iso)}`;
}

/** Shifts still ahead of the demo clock, soonest first. */
function upcoming(workspace: DemoWorkspace) {
  return getShiftRows(workspace).filter((row) => row.shift.startsAt > workspace.now);
}

function openRoles(roles: { name: string; required: number; filled: number }[]) {
  return roles
    .filter((role) => role.filled < role.required)
    .map((role) => ({ ...role, open: role.required - role.filled }));
}

function skillWords(skill: string): string[] {
  return skill
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
}

/**
 * Whole-word skill matching with a five-letter stem, so "Gardening" answers a
 * "Gardener" role but "Leadership" never answers a "Tool lead" one.
 */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  return a.length >= 5 && b.length >= 5 && a.slice(0, 5) === b.slice(0, 5);
}

function openSeatLine(seats: number): string {
  return `${seats} ${seats === 1 ? t("seat open") : t("seats open")}`;
}

function hourLine(minutes: number): string {
  return formatMinutes(minutes);
}

/**
 * Credential state is derived from the expiry date, not read from a stored
 * status field: the seed carries dates only, and a stale label would let an
 * expired certificate read as current.
 */
function credentialState(
  expiresAt: string | null,
  now: string,
): "current" | "expiring" | "expired" {
  if (!expiresAt) return "current";
  if (expiresAt.slice(0, 10) < now.slice(0, 10)) return "expired";
  return differenceInCalendarDays(parseISO(expiresAt), parseISO(now)) <= 45
    ? "expiring"
    : "current";
}

/* ------------------------------- the intents ------------------------------- */

const intents: Intent[] = [
  {
    id: "shifts-short",
    roles: ["coordinator", "volunteer"],
    question: "Which shifts are short this week?",
    keywords: [
      "shifts are short",
      "short this week",
      "this week",
      "weekend",
      "understaffed",
      "unfilled",
      "still need",
      "need people",
      "short staffed",
    ],
    answer(context) {
      const rows = upcoming(context.workspace)
        .filter((row) => daysOut(row.shift.startsAt, context.workspace.now) <= 7)
        .map((row) => ({
          row,
          gaps: openRoles(row.shift.roles),
        }))
        .filter((entry) => entry.gaps.length > 0 || fillPercent(entry.row.shift) < 100);

      if (rows.length === 0) {
        return {
          headline: t("Every shift in the next seven days is fully staffed."),
          summary: t("No role slots are open, so there is nothing to fill this week."),
          citations: [],
          recordsRead: 0,
          action: { label: t("Open the schedule"), href: "/coordinator/schedule" },
        };
      }

      return {
        headline: t("{count} shifts still need help in the next seven days.", {
          count: rows.length,
        }),
        summary: t(
          "Open role slots come from the roster; seats count people. Open a shift to see who is already booked.",
        ),
        citations: rows.map(({ row, gaps }) => ({
          id: row.shift.id,
          label: row.opportunity.title,
          detail:
            gaps.length > 0
              ? `${stamp(row.shift.startsAt)} · ${gaps
                  .map((gap) => `${gap.open} ${gap.name}`)
                  .join(", ")}`
              : `${stamp(row.shift.startsAt)} · ${openSeatLine(
                  row.shift.capacity - row.shift.confirmed,
                )}`,
          href:
            context.role === "coordinator"
              ? `/coordinator/shifts/${row.shift.id}`
              : `/volunteer/opportunities/${row.opportunity.slug}`,
          tone: gaps.length > 0 ? "amber" : "neutral",
        })),
        recordsRead: rows.length,
        action:
          context.role === "coordinator"
            ? { label: t("Open the schedule"), href: "/coordinator/schedule" }
            : { label: t("Find a shift"), href: "/volunteer/discover" },
      };
    },
  },
  {
    id: "cover-volunteer",
    roles: ["coordinator"],
    question: "Who can replace Maya on Saturday?",
    keywords: [
      "replace",
      "cover for",
      "substitute",
      "step in",
      "who can cover",
      "who can replace",
      "backup",
    ],
    answer(context) {
      const query = context.workspace;
      const asked = context.questionName;
      const person = asked
        ? query.volunteers.find(
            (volunteer) =>
              volunteer.name.toLowerCase() === asked || volunteer.firstName.toLowerCase() === asked,
          )
        : undefined;

      const pool = upcoming(context.workspace).flatMap((row) => {
        const roster = getRoster(row.shift.id, context.session, context.workspace);
        return roster.map((entry) => ({ row, entry }));
      });

      if (!person) {
        return {
          headline: t("Name the volunteer and I will rank replacements."),
          summary: t(
            "I match on the shift they are rostered for, the skills the role asks for, and the availability on their profile. Try “Who can replace Maya on Saturday?”",
          ),
          citations: pool.slice(0, 4).map(({ row, entry }) => ({
            id: `${row.shift.id}-${entry.volunteer.id}`,
            label: `${entry.volunteer.name} · ${row.opportunity.title}`,
            detail: `${stamp(row.shift.startsAt)} · ${entry.role}`,
            href: `/coordinator/shifts/${row.shift.id}`,
          })),
          recordsRead: pool.length,
          action: { label: t("Open the schedule"), href: "/coordinator/schedule" },
        };
      }

      const wantedDay = dayFromQuestion(context.query ?? "");
      const shift =
        pool.find(
          ({ entry, row }) =>
            entry.volunteer.id === person.id && dayKey(row.shift.startsAt) === wantedDay,
        ) ?? pool.find(({ entry }) => entry.volunteer.id === person.id);
      if (!shift) {
        return {
          headline: t("{name} has no upcoming shift to cover.", { name: person.name }),
          summary: t("Nobody needs replacing, so there is no gap to fill."),
          citations: [],
          recordsRead: 0,
          action: { label: t("Open the schedule"), href: "/coordinator/schedule" },
        };
      }

      // A replacement must be free at that hour, not already on this roster, and
      // not booked on an overlapping shift. Skills and history then order the
      // people who qualify. The role name is the only structured skill signal a
      // shift carries, so a clean "no match" is stated rather than faked.
      const roleWords = new Set(
        shift.row.shift.roles.flatMap((role) =>
          role.name.split(/\s+/).map((word) => word.toLowerCase()),
        ),
      );
      const onRoster = getRoster(shift.row.shift.id, context.session, context.workspace).map(
        (entry) => entry.volunteer.id,
      );
      const bookedElsewhere = new Set(
        (context.session.registrations ?? [])
          .filter((registration) => registration.status === "registered")
          .filter((registration) => {
            const other = context.workspace.shifts.find(
              (candidateShift) => candidateShift.id === registration.shiftId,
            );
            return Boolean(
              other &&
              other.startsAt < shift.row.shift.endsAt &&
              other.endsAt > shift.row.shift.startsAt,
            );
          })
          .map((registration) => registration.volunteerId),
      );
      const servedThisProgram = new Set(
        [...context.workspace.hourEntries, ...context.workspace.mayaEntries]
          .filter((entry) => entry.opportunityId === shift.row.opportunity.id)
          .map((entry) => entry.volunteerId),
      );

      const replacements = context.workspace.volunteers
        .filter((volunteer) => volunteer.id !== person.id)
        .filter((volunteer) => volunteer.status === "active")
        .filter((volunteer) => !onRoster.includes(volunteer.id))
        .filter((volunteer) => !bookedElsewhere.has(volunteer.id))
        .filter((volunteer) =>
          volunteer.availability.some(
            (slot) =>
              slot.day === dayKey(shift.row.shift.startsAt) &&
              slot.period === periodOf(shift.row.shift.startsAt),
          ),
        )
        .map((volunteer) => {
          const skills = volunteer.skills.filter((skill) =>
            skillWords(skill).some((word) => [...roleWords].some((role) => sameWord(word, role))),
          );
          return {
            volunteer,
            skills,
            served: servedThisProgram.has(volunteer.id),
          };
        })
        .sort(
          (a, b) =>
            b.skills.length - a.skills.length ||
            Number(b.served) - Number(a.served) ||
            b.volunteer.attendanceRate - a.volunteer.attendanceRate,
        )
        .slice(0, 4);

      const who = `${person.name} · ${shift.row.opportunity.title}`;
      const when = stamp(shift.row.shift.startsAt);

      if (replacements.length === 0) {
        return {
          headline: t("No one on this roster is free at that hour."),
          summary: t(
            "{who} is rostered for {when}. Every active volunteer is already booked, unavailable at that time, or on this roster, so this one needs a coordinator call.",
            { who, when },
          ),
          citations: [],
          recordsRead: 0,
          action: {
            label: t("Open the roster"),
            href: `/coordinator/shifts/${shift.row.shift.id}`,
          },
        };
      }

      return {
        headline: t("{count} volunteers can cover {name}.", {
          count: replacements.length,
          name: person.firstName,
        }),
        summary: t("{who} is rostered for {when}. Ranked on matching skills, then attendance.", {
          who,
          when,
        }),
        citations: replacements.map((candidate) => ({
          id: candidate.volunteer.id,
          label: candidate.volunteer.name,
          detail: [
            candidate.skills.length > 0
              ? candidate.skills.slice(0, 2).join(", ")
              : candidate.served
                ? t("Has served this program")
                : t("No listed skill overlap"),
            `${formatWeekday(shift.row.shift.startsAt)} ${periodOf(shift.row.shift.startsAt)}`,
            `${Math.round(candidate.volunteer.attendanceRate)}% ${t("attendance")}`,
          ].join(" · "),
          href: `/coordinator/volunteers/${candidate.volunteer.id}`,
          tone: "green" as const,
        })),
        recordsRead: replacements.length,
        action: {
          label: t("Open the roster"),
          href: `/coordinator/shifts/${shift.row.shift.id}`,
        },
      };
    },
  },
  {
    id: "credentials",
    roles: ["coordinator"],
    question: "Whose credentials expire soon?",
    keywords: ["credential", "certif", "expire", "license", "renew", "qualif"],
    answer(context) {
      const flagged = getCredentials(context.session, context.workspace)
        .map((credential) => ({
          credential,
          status: credentialState(credential.expiresAt, context.workspace.now),
        }))
        .filter((entry) => entry.status !== "current");

      if (flagged.length === 0) {
        return {
          headline: t("No credential expires in the next 45 days."),
          summary: t("Every credential on file is current."),
          citations: [],
          recordsRead: 0,
          action: { label: t("Open credentials"), href: "/coordinator/credentials" },
        };
      }

      const expired = flagged.filter((entry) => entry.status === "expired").length;
      return {
        headline: t("{count} credentials need attention.", { count: flagged.length }),
        summary:
          expired > 0
            ? t(
                "{expired} have already expired. Renewals are listed with the soonest date first.",
                {
                  expired,
                },
              )
            : t("All of them expire inside the next 45 days, soonest first."),
        citations: flagged.slice(0, 6).map(({ credential, status }) => ({
          id: credential.id,
          label: `${credential.volunteer.name} · ${credential.name}`,
          detail: credential.expiresAt
            ? `${status === "expired" ? t("Expired") : t("Expires")} ${formatMonthDay(credential.expiresAt)}`
            : t("No expiry date on file"),
          href: "/coordinator/credentials",
          tone: status === "expired" ? ("red" as const) : ("amber" as const),
        })),
        recordsRead: flagged.length,
        action: { label: t("Open credentials"), href: "/coordinator/credentials" },
      };
    },
  },
  {
    id: "lowest-fill",
    roles: ["coordinator"],
    question: "Which program has the lowest fill rate?",
    keywords: [
      "lowest fill",
      "fill rate",
      "underfilled",
      "worst program",
      "which program",
      "empty",
    ],
    answer(context) {
      const totals = new Map<string, { capacity: number; confirmed: number; shifts: number }>();
      for (const { shift } of upcoming(context.workspace)) {
        const current = totals.get(shift.opportunityId) ?? { capacity: 0, confirmed: 0, shifts: 0 };
        totals.set(shift.opportunityId, {
          capacity: current.capacity + shift.capacity,
          confirmed: current.confirmed + shift.confirmed,
          shifts: current.shifts + 1,
        });
      }

      const ranked = [...totals.entries()]
        .map(([opportunityId, value]) => ({
          opportunity: opportunityById(opportunityId, context.workspace),
          percent: value.capacity === 0 ? 0 : Math.round((value.confirmed / value.capacity) * 100),
          ...value,
        }))
        .filter((entry) => entry.opportunity)
        .sort((a, b) => a.percent - b.percent)
        .slice(0, 3);

      if (ranked.length === 0) {
        return {
          headline: t("No upcoming shifts are scheduled yet."),
          summary: t("Create a shift first and the fill rate appears here."),
          citations: [],
          recordsRead: 0,
          action: { label: t("Open coverage"), href: "/coordinator/coverage" },
        };
      }

      return {
        headline: t("{name} has the lowest fill rate, at {percent}%.", {
          name: ranked[0].opportunity?.title ?? "",
          percent: ranked[0].percent,
        }),
        summary: t("Seats filled across every upcoming shift in each program."),
        citations: ranked.map((entry) => ({
          id: entry.opportunity?.id ?? "",
          label: entry.opportunity?.title ?? "",
          detail: `${entry.percent}% ${t("filled")} · ${entry.confirmed} ${t("of")} ${entry.capacity} ${t("seats")} · ${entry.shifts} ${entry.shifts === 1 ? t("shift") : t("shifts")}`,
          href: `/coordinator/opportunities/${entry.opportunity?.id ?? ""}`,
          tone: entry.percent < 60 ? ("red" as const) : ("amber" as const),
        })),
        recordsRead: ranked.length,
        action: { label: t("Open coverage"), href: "/coordinator/coverage" },
        actions: [
          { label: t("Review coverage rescue"), href: "/coordinator/coverage" },
          { label: t("Open AutoRoster"), href: "/coordinator/autoroster" },
        ],
      };
    },
  },
  {
    id: "attention",
    roles: ["coordinator"],
    question: "What needs attention today?",
    keywords: ["attention", "today", "urgent", "priority", "what first", "focus", "worry"],
    answer(context) {
      const attention = deriveAttention(context.workspace, 4);
      const hours = getHourRows(context.session, context.workspace).filter(
        (row) => row.status === "pending",
      );
      const expiring = getCredentials(context.session, context.workspace).filter(
        (credential) => credentialState(credential.expiresAt, context.workspace.now) !== "current",
      );

      const citations: AskCitation[] = [
        ...attention.map((item) => ({
          id: item.id,
          label: item.title,
          detail: item.detail,
          href: item.href,
          tone: item.severity === "critical" ? ("red" as const) : ("amber" as const),
        })),
        ...hours.slice(0, 2).map((row) => ({
          id: row.id,
          label: `${row.volunteer.name} · ${row.opportunity.title}`,
          detail: `${t("Hours waiting for review")} · ${hourLine(row.requestedMinutes)} · ${formatMonthDay(row.date)}`,
          href: "/coordinator/hours",
          tone: "amber" as const,
        })),
        ...expiring.slice(0, 1).map((credential) => ({
          id: credential.id,
          label: `${credential.volunteer.name} · ${credential.name}`,
          detail: `${
            credentialState(credential.expiresAt, context.workspace.now) === "expired"
              ? t("Expired")
              : t("Expiring")
          } · ${credential.expiresAt ? formatMonthDay(credential.expiresAt) : t("No date")}`,
          href: "/coordinator/credentials",
          tone: "red" as const,
        })),
      ];

      if (citations.length === 0) {
        return {
          headline: t("Nothing is overdue today."),
          summary: t("Coverage, hours, and credentials are all clear."),
          citations: [],
          recordsRead: 0,
          action: { label: t("Open Mission Control"), href: "/coordinator/mission-control" },
        };
      }

      const parts: string[] = [];
      if (hours.length > 0) {
        parts.push(
          t(
            "{count} hour entries are waiting for review, which blocks a volunteer's verified record.",
            {
              count: hours.length,
            },
          ),
        );
      }
      if (expiring.length > 0) {
        parts.push(t("{count} credentials are expired or expiring.", { count: expiring.length }));
      }

      return {
        headline:
          attention.length > 0
            ? t("{count} shifts need a decision before they run.", { count: attention.length })
            : t("Start with the review queue."),
        summary: parts.join(" ") || t("Ordered by the soonest shift, then by severity."),
        citations,
        recordsRead: attention.length + hours.length + expiring.length,
        action: { label: t("Open Mission Control"), href: "/coordinator/mission-control" },
      };
    },
  },
  {
    id: "hours-month",
    roles: ["coordinator"],
    question: "How many hours were approved this month?",
    keywords: [
      "how many hours",
      "hours approved",
      "volunteer hours",
      "hours this month",
      "total hours",
    ],
    answer(context) {
      const rows = getHourRows(context.session, context.workspace);
      const month = context.workspace.now.slice(0, 7);
      const thisMonth = rows.filter((row) => row.date.startsWith(month));
      const approved = thisMonth.filter((row) => row.status === "verified");
      const pending = thisMonth.filter((row) => row.status === "pending");
      const minutes = approved.reduce(
        (sum, row) => sum + (row.approvedMinutes ?? row.requestedMinutes),
        0,
      );

      return {
        headline: t("{hours} approved this month.", { hours: hourLine(minutes) }),
        summary: t("{count} entries approved, {pending} still waiting for review.", {
          count: approved.length,
          pending: pending.length,
        }),
        citations: approved.slice(0, 4).map((row) => ({
          id: row.id,
          label: `${row.volunteer.name} · ${row.opportunity.title}`,
          detail: `${formatMonthDay(row.date)} · ${hourLine(
            row.approvedMinutes ?? row.requestedMinutes,
          )}`,
          href: "/coordinator/hours",
          tone: "green" as const,
        })),
        recordsRead: thisMonth.length,
        action: { label: t("Open hours review"), href: "/coordinator/hours" },
      };
    },
  },
  {
    id: "my-next-shift",
    roles: ["volunteer"],
    question: "What is my next shift?",
    keywords: [
      "next shift",
      "my shift",
      "when do i",
      "upcoming shift",
      "my schedule",
      "where do i",
    ],
    answer(context) {
      const rostered = upcoming(context.workspace).flatMap((row) => {
        const entry = getRoster(row.shift.id, context.session, context.workspace).find(
          (person) => person.volunteer.id === context.volunteerId,
        );
        return entry ? [{ row, entry }] : [];
      });

      if (rostered.length === 0) {
        return {
          headline: t("You have no shift on the books."),
          summary: t("Browse open opportunities and the roster will show your first shift here."),
          citations: [],
          recordsRead: 0,
          action: { label: t("Find a shift"), href: "/volunteer/discover" },
        };
      }

      const next = rostered[0];
      const open = next.row.opportunity.requirements.slice(0, 2).join(", ");
      return {
        headline: t("{title} on {when}.", {
          title: next.row.opportunity.title,
          when: stamp(next.row.shift.startsAt),
        }),
        summary: t("You are rostered as {role}. {bring}", {
          role: next.entry.role,
          bring: open ? t("Bring: {items}.", { items: open }) : "",
        }),
        citations: [
          {
            id: next.row.shift.id,
            label: next.row.opportunity.title,
            detail: `${stamp(next.row.shift.startsAt)} – ${formatTime(next.row.shift.endsAt)} · ${
              next.row.opportunity.address
            }`,
            href: `/volunteer/shifts/${next.row.shift.id}`,
            tone: "green",
          },
          ...rostered.slice(1, 3).map(({ row, entry }) => ({
            id: row.shift.id,
            label: row.opportunity.title,
            detail: `${stamp(row.shift.startsAt)} · ${entry.role}`,
            href: `/volunteer/shifts/${row.shift.id}`,
          })),
        ],
        recordsRead: rostered.length,
        action: { label: t("Open My Schedule"), href: "/volunteer/schedule" },
      };
    },
  },
  {
    id: "matches",
    roles: ["volunteer"],
    question: "Which opportunities match my skills?",
    keywords: ["match", "recommend", "my skills", "suggest", "what should i", "good fit"],
    answer(context) {
      const volunteer = volunteerById(context.volunteerId, context.workspace);
      if (!volunteer) {
        return {
          headline: t("Your profile is not on this roster yet."),
          summary: t("Finish onboarding and matching runs against your saved skills."),
          citations: [],
          recordsRead: 0,
          action: { label: t("Open my profile"), href: "/volunteer/profile" },
        };
      }

      const matches = getMatches(
        volunteer,
        3,
        context.workspace,
        context.session.createdOpportunities ?? [],
      );

      return {
        headline: t("Your top match is {title}.", {
          title: matches[0]?.opportunity.title ?? "",
        }),
        summary: t("Scored from your interests, skills, and upcoming availability."),
        citations: matches.map((match) => ({
          id: match.opportunity.id,
          label: `${match.opportunity.title} · ${match.score}%`,
          detail: match.reasons.join(" · "),
          href: `/volunteer/opportunities/${match.opportunity.slug}`,
          tone: "green" as const,
        })),
        recordsRead: matches.length,
        action: { label: t("Open Discover"), href: "/volunteer/discover" },
      };
    },
  },
  {
    id: "my-hours",
    roles: ["volunteer"],
    question: "How many hours have I served?",
    keywords: [
      "how many hours",
      "hours have i",
      "my hours",
      "served",
      "verified hours",
      "service record",
    ],
    answer(context) {
      const summary = getHoursSummary(context.volunteerId, context.session, context.workspace);
      const volunteer = volunteerById(context.volunteerId, context.workspace);
      return {
        headline: t("{hours} verified.", { hours: hourLine(summary.verifiedMinutes) }),
        summary: t(
          "{pending} is waiting for approval and {month} landed this month across {events} programs.",
          {
            pending: hourLine(summary.pendingMinutes),
            month: hourLine(summary.thisMonthMinutes),
            events: summary.events,
          },
        ),
        citations: volunteer
          ? [
              {
                id: `hours-${volunteer.id}`,
                label: t("Service record"),
                detail: `${formatNumber(summary.events)} ${t("programs")} · ${hourLine(
                  summary.verifiedMinutes,
                )} ${t("verified")}`,
                href: "/volunteer/hours",
                tone: "green",
              },
            ]
          : [],
        recordsRead: summary.events,
        action: { label: t("Open My Hours"), href: "/volunteer/hours" },
      };
    },
  },
  {
    id: "join-organization",
    roles: ["volunteer"],
    question: "How do I join another organization?",
    keywords: [
      "join another",
      "join an organization",
      "another organization",
      "join code",
      "invite",
    ],
    answer() {
      return {
        headline: t("Join with a code from the coordinator."),
        summary: t(
          "Open Find an Organization, choose the organization, and enter the six-character join code the coordinator shared. Your record moves with you, so your hours and verification follow.",
        ),
        citations: [],
        recordsRead: 0,
        action: { label: t("Find an organization"), href: "/volunteer/start" },
      };
    },
  },
  {
    id: "help",
    roles: ["coordinator", "volunteer"],
    question: "What can you answer?",
    keywords: ["what can you", "help", "questions", "how does this work", "what do you know"],
    answer(context) {
      const available = intents.filter(
        (intent) => intent.roles.includes(context.role) && intent.id !== "help",
      );
      return {
        headline: t("Ask about the records on this device."),
        summary: t(
          "I read the workspace snapshot and answer in a sentence, with the rows I used. Nothing is sent anywhere.",
        ),
        citations: available.map((intent) => ({
          id: intent.id,
          label: t(intent.question),
          detail: t("Ask this"),
          ask: true,
        })),
        recordsRead: 0,
      };
    },
  },
];

/* ------------------------------- the matcher ------------------------------- */

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface ScoredIntent {
  intent: Intent;
  score: number;
}

/**
 * A keyword matches a whole word, or — for words long enough to stay specific —
 * a word that starts with it, so "expire" also catches "expires" and
 * "credential" catches "credentials" without matching "cover" to "coverage".
 */
function keywordHits(keyword: string, words: string[], query: string): boolean {
  if (keyword.includes(" ")) return query.includes(keyword);
  if (words.includes(keyword)) return true;
  return keyword.length >= 6 && words.some((word) => word.startsWith(keyword));
}

function scoreIntent(intent: Intent, query: string): number {
  const words = query.split(" ");
  return intent.keywords.reduce((total, keyword) => {
    const phrase = normalize(keyword);
    if (!phrase) return total;
    if (!keywordHits(phrase, words, query)) return total;
    return total + (phrase.includes(" ") ? 3 : 2);
  }, 0);
}

/** Every question the box offers for a role, in suggestion order. */
export function suggestedQuestions(role: AskRole): string[] {
  return intents
    .filter((intent) => intent.roles.includes(role) && intent.id !== "help")
    .map((intent) => t(intent.question));
}

interface AskRequest {
  question: string;
  role: AskRole;
  workspace: DemoWorkspace;
  session: Partial<SessionSnapshot>;
  volunteerId: string;
}

/** Answers a question, or refuses with the questions it can answer. */
export function ask(request: AskRequest): AskAnswer {
  const query = normalize(request.question);
  const context: AskContext = {
    role: request.role,
    workspace: request.workspace,
    session: request.session,
    volunteerId: request.volunteerId,
    questionName: nameFromQuestion(query, request.workspace),
    query,
  };

  if (!query) {
    return {
      intent: "empty",
      matched: false,
      headline: t("Ask a question about this workspace."),
      summary: t("Answers come from the records on this device, not from a model."),
      citations: [],
      evidence: evidenceFor(context),
      recordsRead: 0,
    };
  }

  const scored: ScoredIntent[] = intents
    .filter((intent) => intent.roles.includes(request.role))
    .map((intent) => ({ intent, score: scoreIntent(intent, query) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  // One generic word is not enough to claim an answer: three points means a
  // phrase, or a specific word paired with another. Below that it refuses.
  if (!best || best.score < 3) {
    return {
      intent: "no-match",
      matched: false,
      headline: t("I do not have that in this workspace."),
      summary: t(
        "I only answer from the records saved here, so I would rather say so than guess. These questions are covered:",
      ),
      citations: suggestedQuestions(request.role).map((question) => ({
        id: question,
        label: question,
        detail: t("Ask this"),
        ask: true,
      })),
      evidence: evidenceFor(context),
      recordsRead: 0,
    };
  }

  const body = best.intent.answer(context);
  return { intent: best.intent.id, matched: true, evidence: evidenceFor(context), ...body };
}

/**
 * The sentence under every answer: how much of the workspace it read. Anyone
 * can check the claim, and a coordinator learns how narrow the answer is.
 */
function evidenceFor(context: AskContext): string {
  const now = context.workspace.now;
  const upcoming = context.workspace.shifts.filter(
    (shift) => shift.startsAt > now && shift.status === "scheduled",
  ).length;
  const volunteers = context.workspace.volunteers.filter(
    (volunteer) => volunteer.status === "active",
  ).length;
  const credentials = (context.session.credentials ?? []).length;
  return t(
    "Based on {shifts} upcoming shifts, {volunteers} active volunteers, and {credentials} credentials on file.",
    { shifts: upcoming, volunteers, credentials },
  );
}

/** Pulls a volunteer name out of “who can replace Maya on Saturday”. */
function nameFromQuestion(query: string, workspace: DemoWorkspace): string | undefined {
  const words = query.split(" ");
  const candidates = workspace.volunteers.map((volunteer) => ({
    id: volunteer.id,
    name: volunteer.name.toLowerCase(),
    first: volunteer.firstName.toLowerCase(),
  }));
  // Prefer a full name, then a first name mentioned next to a cover verb.
  const full = candidates.find((candidate) => query.includes(candidate.name));
  if (full) return full.name;
  const verb = ["replace", "cover", "substitute", "step in"].some((word) => query.includes(word));
  if (!verb) return undefined;
  const first = candidates.find((candidate) => words.includes(candidate.first));
  return first?.first;
}
