import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import {
  ArrowLeft,
  Award,
  CalendarDays,
  Check,
  Clock3,
  Copy,
  Mail,
  MapPin,
  Send,
  Users,
} from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  Page,
  PageHeader,
  SectionHeader,
  Tabs,
  statusLabel,
} from "../../components/ui";
import type { TabItem } from "../../components/ui";
import { useWorkspace } from "../../lib/workspace/session";
import {
  CAUSE_LABELS,
  formatDate,
  formatMinutes,
  formatTime,
  getCredentials,
  getHourRows,
  getHoursSummary,
  getMatches,
  getRecentActivityFor,
  getRoster,
  getShiftRows,
  getUpcomingForVolunteer,
  getUpcomingShiftRows,
  timeRange,
  volunteerById,
} from "../../lib/workspace/selectors";
import styles from "./VolunteerDetailPage.module.css";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const PERIODS = ["morning", "afternoon", "evening"] as const;

const SKILL_NOTES: Record<string, string> = {
  Spanish: "Conversational · Verified",
  "Food handling": "Food safety · Valid through Dec 2026",
  Tutoring: "Math · Youth",
  CPR: "CPR / AED · Expires Jun 2027",
  Driver: "License on file · Verified",
  Gardening: "Tool safety · Verified",
  Leadership: "Team lead · Verified",
  Technology: "Data entry · Verified",
  "Event setup": "Setup crew · Verified",
  "Customer service": "Front desk · Verified",
};

const SKILL_TONES = ["violet", "teal", "coral", "amber", "cobalt", "green", "rose", "cyan"];

const TABS: TabItem[] = [
  { id: "overview", label: "Overview" },
  { id: "skills", label: "Skills & credentials" },
  { id: "matches", label: "Matches" },
  { id: "availability", label: "Availability" },
  { id: "activity", label: "Activity" },
];

function displayHours(minutes: number): string {
  const hours = minutes / 60;
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

export function VolunteerDetailPage() {
  const { id } = useParams();
  const { workspace, session, actions } = useWorkspace();
  const [tab, setTab] = useState("overview");
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignedShift, setAssignedShift] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [note, setNote] = useState(() => {
    try {
      return localStorage.getItem(`civicflow.note.${id ?? "unknown"}`) ?? "";
    } catch {
      return "";
    }
  });
  const [noteSaved, setNoteSaved] = useState(false);

  const volunteer = id ? volunteerById(id, workspace) : undefined;

  const upcoming = useMemo(
    () => (volunteer ? getUpcomingForVolunteer(volunteer.id, session, workspace) : []),
    [volunteer, session, workspace],
  );

  if (!volunteer) {
    return (
      <Page width="narrow">
        <PageHeader
          backTo="/coordinator/volunteers"
          backLabel="All volunteers"
          eyebrow="Volunteer record"
          title="We couldn't find that volunteer"
          description="The profile may have been merged, archived, or the link may be out of date."
        />
        <EmptyState
          title="No matching volunteer"
          copy="Search the volunteer directory to find the person you need."
          action={<ButtonLink to="/coordinator/volunteers">Back to volunteers</ButtonLink>}
        />
      </Page>
    );
  }

  const summary = getHoursSummary(volunteer.id, session, workspace);
  const matches = getMatches(volunteer, 4);
  const activities = getRecentActivityFor(volunteer.id);
  const hourRows = getHourRows(session, workspace).filter(
    (row) => row.volunteer.id === volunteer.id,
  );
  const credentials = getCredentials(session, workspace).filter(
    (row) => row.volunteer.id === volunteer.id,
  );
  const upcomingForVolunteer =
    upcoming.length > 0 ? upcoming : getUpcomingShiftRows(workspace).slice(0, 3);
  const isFallbackUpcoming = upcoming.length === 0;
  const attendance = volunteer.attendanceRate;
  const openShifts = getUpcomingShiftRows(workspace).filter(
    (row) => row.shift.confirmed < row.shift.capacity,
  );

  const activityFeed = [
    ...activities.map((item) => ({
      id: item.id,
      at: item.at,
      title: item.action,
      detail: `${item.detail} · ${format(parseISO(item.at), "MMM d · h:mm a")}`,
      tone: item.tone,
    })),
    ...hourRows.slice(0, 4).map((row) => ({
      id: `hour-${row.id}`,
      at: `${row.date}T12:00:00`,
      title:
        row.status === "verified"
          ? "Hours verified"
          : row.status === "rejected"
            ? "Hours returned"
            : "Hours submitted",
      detail: `${formatMinutes(row.approvedMinutes ?? row.requestedMinutes)} · ${row.opportunity.title} · ${format(parseISO(row.date), "MMM d")}`,
      tone: row.status === "verified" ? "cobalt" : row.status === "rejected" ? "coral" : "violet",
    })),
  ]
    .sort((first, second) => second.at.localeCompare(first.at))
    .slice(0, 6);

  const mailto = `mailto:${volunteer.email}?subject=${encodeURIComponent(
    `A CivicFlow shift for you, ${volunteer.firstName}`,
  )}`;

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(volunteer!.email);
      setConfirmation(`Email copied: ${volunteer!.email}`);
    } catch {
      setConfirmation(`Email: ${volunteer!.email}`);
    }
  }

  function saveNote() {
    try {
      localStorage.setItem(`civicflow.note.${volunteer!.id}`, note);
    } catch {
      // Notes are a convenience; the in-memory value remains for this screen.
    }
    setNoteSaved(true);
  }

  function assignVolunteer() {
    if (!assignedShift) return;
    const row = getShiftRows(workspace).find((item) => item.shift.id === assignedShift);
    if (!row) return;
    const role =
      row.shift.roles.find((item) => item.filled < item.required)?.name ??
      volunteer!.skills[0] ??
      "General support";
    actions.registerForShift(assignedShift, volunteer!.id, role);
    setConfirmation(
      `${volunteer!.name} assigned to ${row.opportunity.title} · ${formatDate(row.shift.startsAt)}.`,
    );
    setAssignedShift("");
    setAssignOpen(false);
  }

  return (
    <Page>
      <div className={styles.topBar}>
        <Link to="/coordinator/volunteers" className={styles.backLink}>
          <ArrowLeft size={13} aria-hidden="true" /> All volunteers
        </Link>
        <div className={styles.topActions}>
          <Button
            variant="secondary"
            icon={<Mail size={14} aria-hidden="true" />}
            onClick={() => {
              window.location.href = mailto;
            }}
          >
            Message
          </Button>
          <Button
            variant="primary"
            icon={<Send size={14} aria-hidden="true" />}
            onClick={() => setAssignOpen((open) => !open)}
            aria-expanded={assignOpen}
          >
            Assign to shift
          </Button>
        </div>
      </div>

      <p className={styles.liveRegion} role="status" aria-live="polite">
        {confirmation}
      </p>

      {assignOpen ? (
        <Card padding="compact" className={styles.assignPanel}>
          <div>
            <p className={styles.assignTitle}>Assign {volunteer.firstName} to an upcoming shift</p>
            <p className={styles.assignHint}>
              Only shifts with open seats are listed. The roster updates immediately.
            </p>
          </div>
          <div className={styles.assignControls}>
            <label className="visually-hidden" htmlFor="assign-shift">
              Upcoming shift
            </label>
            <select
              id="assign-shift"
              className={styles.select}
              value={assignedShift}
              onChange={(event) => setAssignedShift(event.target.value)}
            >
              <option value="">Choose a shift…</option>
              {openShifts.map(({ shift, opportunity }) => (
                <option key={shift.id} value={shift.id}>
                  {opportunity.title} · {formatDate(shift.startsAt)} · {formatTime(shift.startsAt)}
                </option>
              ))}
            </select>
            <Button size="small" onClick={assignVolunteer} disabled={!assignedShift}>
              Assign
            </Button>
            <Button size="small" variant="ghost" onClick={() => setAssignOpen(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : null}

      <section className={styles.hero} aria-labelledby="volunteer-name">
        <img
          src="/media/welcome-volunteer.jpg"
          alt=""
          className={styles.heroImage}
          aria-hidden="true"
        />
        <div className={styles.heroOverlay} aria-hidden="true" />
        <div className={styles.heroInner}>
          <div className={styles.heroIdentity}>
            <span className={styles.avatarRing}>
              <Avatar
                initials={volunteer.initials}
                tone={volunteer.tone}
                size={82}
                label={volunteer.name}
              />
            </span>
            <div className={styles.heroCopy}>
              <h1 className={styles.heroName} id="volunteer-name">
                {volunteer.name}
              </h1>
              <p className={styles.heroMeta}>
                <span>
                  {volunteer.status === "active"
                    ? "Active volunteer"
                    : statusLabel(volunteer.status)}
                </span>
                <span aria-hidden="true">·</span>
                <span>Joined {format(parseISO(volunteer.joinedAt), "MMM yyyy")}</span>
                <span aria-hidden="true">·</span>
                <span className={styles.heroLocation}>
                  <MapPin size={11} aria-hidden="true" /> Buffalo, NY
                </span>
              </p>
              <div className={styles.heroChips}>
                {[
                  ...volunteer.skills.slice(0, 3),
                  ...volunteer.languages.slice(0, 1).filter((language) => language !== "English"),
                ].map((skill) => (
                  <span key={skill} className={styles.heroChip}>
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <dl className={styles.heroStats}>
            <div>
              <dt>Attendance</dt>
              <dd>{attendance}%</dd>
            </div>
            <div>
              <dt>Hours</dt>
              <dd>{displayHours(summary.verifiedMinutes)}</dd>
            </div>
            <div>
              <dt>Events</dt>
              <dd>{volunteer.eventsCompleted}</dd>
            </div>
          </dl>
        </div>
      </section>

      <div className={styles.toolbarRow}>
        <Tabs items={TABS} value={tab} onChange={setTab} label="Volunteer profile sections" />
        <button type="button" className={styles.copyEmail} onClick={copyEmail}>
          <Copy size={12} aria-hidden="true" />
          Copy email
        </button>
      </div>

      {tab === "overview" ? (
        <div className={styles.grid}>
          <Card className={styles.skillsCard} padding="loose">
            <SectionHeader
              title="Skills & Credentials"
              action={
                <button
                  type="button"
                  className={styles.textAction}
                  onClick={() => setTab("skills")}
                >
                  View all
                </button>
              }
            />
            <div className={styles.skillGrid}>
              {(volunteer.skills.length > 0 ? volunteer.skills : ["General support"])
                .slice(0, 4)
                .map((skill, index) => (
                  <div className={styles.skillCard} key={skill}>
                    <span
                      className={styles.skillDot}
                      style={{
                        background: `var(--color-${SKILL_TONES[index % SKILL_TONES.length]})`,
                      }}
                      aria-hidden="true"
                    />
                    <div>
                      <p className={styles.skillName}>{skill}</p>
                      <p className={styles.skillMeta}>
                        {SKILL_NOTES[skill] ?? "Recorded on profile · Verified"}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
            {credentials.length > 0 ? (
              <p className={styles.credentialNote}>
                <Award size={12} aria-hidden="true" /> {credentials.length} credential record
                {credentials.length === 1 ? "" : "s"} on file
              </p>
            ) : null}
          </Card>

          <Card className={styles.matchesCard} padding="loose">
            <SectionHeader
              title="Best matching opportunities"
              action={
                <button
                  type="button"
                  className={styles.textAction}
                  onClick={() => setTab("matches")}
                >
                  See all
                </button>
              }
            />
            <div className={styles.matchList}>
              {matches.map(({ opportunity, score }) => {
                const next = getUpcomingShiftRows(workspace).find(
                  (row) => row.shift.opportunityId === opportunity.id,
                );
                return (
                  <Link
                    key={opportunity.id}
                    to={`/coordinator/opportunities/${opportunity.id}`}
                    className={styles.matchRow}
                  >
                    <div className={styles.matchCopy}>
                      <p className={styles.matchTitle}>{opportunity.title}</p>
                      <p className={styles.matchMeta}>
                        {CAUSE_LABELS[opportunity.cause]}
                        {next ? ` · ${formatDate(next.shift.startsAt)}` : " · No upcoming shift"}
                      </p>
                    </div>
                    <span className={styles.matchScore}>{score}%</span>
                  </Link>
                );
              })}
            </div>
          </Card>

          <Card className={styles.availabilityCard} padding="loose">
            <SectionHeader
              title="Availability"
              action={
                <button
                  type="button"
                  className={styles.textAction}
                  onClick={() => setTab("availability")}
                >
                  Full grid
                </button>
              }
            />
            <div className={styles.availabilityGrid}>
              <div />
              {DAYS.map((day) => (
                <span key={day} className={styles.dayLabel}>
                  {day.charAt(0)}
                </span>
              ))}
              {PERIODS.map((period) => (
                <div className={styles.availabilityRow} key={period}>
                  <span className={styles.periodLabel}>
                    {period.charAt(0).toUpperCase() + period.slice(1)}
                  </span>
                  {DAYS.map((day) => {
                    const available = volunteer.availability.some(
                      (slot) => slot.day === day.toLowerCase() && slot.period === period,
                    );
                    return (
                      <span
                        key={`${day}-${period}`}
                        className={`${styles.availabilityCell} ${available ? styles.availabilityOn : ""}`}
                      >
                        {available ? <Check size={12} aria-hidden="true" /> : null}
                        <span className="visually-hidden">
                          {day} {period}: {available ? "available" : "not available"}
                        </span>
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
            <p className={styles.availabilityNote}>
              Availability is set by the volunteer and should be confirmed before a last-minute
              assignment.
            </p>
          </Card>

          <Card className={styles.activityCard} padding="loose">
            <SectionHeader
              title="Recent activity"
              action={
                <button
                  type="button"
                  className={styles.textAction}
                  onClick={() => setTab("activity")}
                >
                  View timeline
                </button>
              }
            />
            <ul className={styles.activityList}>
              {activityFeed.slice(0, 3).map((item) => (
                <li key={item.id} className={styles.activityItem}>
                  <span className={styles.activityDot} data-tone={item.tone} aria-hidden="true" />
                  <div>
                    <p className={styles.activityTitle}>{item.title}</p>
                    <p className={styles.activityMeta}>{item.detail}</p>
                  </div>
                </li>
              ))}
              {activityFeed.length === 0 ? (
                <li className={styles.activityMeta}>
                  No recorded activity yet. Hours and shift events appear here after the first
                  service.
                </li>
              ) : null}
            </ul>
          </Card>

          <Card className={styles.upcomingCard} padding="loose">
            <SectionHeader
              title={isFallbackUpcoming ? "Open shifts to offer" : "Upcoming shifts"}
              subtitle={
                isFallbackUpcoming
                  ? `${volunteer.firstName} has no confirmed shifts yet. These have open seats.`
                  : "Confirmed through CivicFlow, newest first."
              }
            />
            <ul className={styles.shiftList}>
              {upcomingForVolunteer.slice(0, 3).map(({ shift, opportunity }) => {
                const roster = getRoster(shift.id, session, workspace).find(
                  (row) => row.volunteer.id === volunteer.id,
                );
                return (
                  <li key={shift.id} className={styles.shiftRow}>
                    <div className={styles.shiftDate}>
                      <span>{format(parseISO(shift.startsAt), "EEE")}</span>
                      <strong>{format(parseISO(shift.startsAt), "d")}</strong>
                    </div>
                    <div className={styles.shiftCopy}>
                      <p className={styles.shiftTitle}>{opportunity.title}</p>
                      <p className={styles.shiftMeta}>
                        {timeRange(shift.startsAt, shift.endsAt)} · {opportunity.address}
                      </p>
                    </div>
                    <Badge tone={roster ? "green" : "neutral"} dot>
                      {roster
                        ? statusLabel(roster.status)
                        : `${shift.capacity - shift.confirmed} seats open`}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card className={styles.noteCard} padding="loose">
            <SectionHeader
              title="Coordinator notes"
              subtitle="Private to coordinators and saved on this device."
            />
            <label className="visually-hidden" htmlFor="coordinator-note">
              Note about {volunteer.name}
            </label>
            <textarea
              id="coordinator-note"
              className={styles.noteInput}
              placeholder="Skills, preferences, follow-ups…"
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                setNoteSaved(false);
              }}
            />
            <div className={styles.noteActions}>
              <Button size="small" variant="secondary" onClick={saveNote} disabled={!note.trim()}>
                Save note
              </Button>
              {noteSaved ? (
                <span className={styles.noteSaved} role="status">
                  Saved locally
                </span>
              ) : null}
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "skills" ? (
        <div className={styles.tabPanel}>
          <Card padding="loose">
            <SectionHeader
              title="Skills & credentials"
              subtitle="What this volunteer has been cleared to do, and what needs renewal."
            />
            <div className={styles.skillGrid}>
              {[...volunteer.skills, ...volunteer.languages].map((skill, index) => (
                <div className={styles.skillCard} key={`${skill}-${index}`}>
                  <span
                    className={styles.skillDot}
                    style={{
                      background: `var(--color-${SKILL_TONES[index % SKILL_TONES.length]})`,
                    }}
                    aria-hidden="true"
                  />
                  <div>
                    <p className={styles.skillName}>{skill}</p>
                    <p className={styles.skillMeta}>
                      {SKILL_NOTES[skill] ?? "Recorded on profile · Verified"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {credentials.length > 0 ? (
              <div className={styles.credentialList}>
                <h3 className={styles.subheading}>Credential records</h3>
                {credentials.map((credential) => (
                  <div className={styles.credentialRow} key={credential.id}>
                    <div>
                      <p className={styles.skillName}>{credential.name}</p>
                      <p className={styles.skillMeta}>
                        Issued {format(parseISO(credential.issuedAt), "MMM d, yyyy")}
                        {credential.expiresAt
                          ? ` · Expires ${format(parseISO(credential.expiresAt), "MMM d, yyyy")}`
                          : ""}
                      </p>
                    </div>
                    <Badge
                      tone={
                        credential.status === "current"
                          ? "green"
                          : credential.status === "expiring"
                            ? "amber"
                            : "red"
                      }
                    >
                      {statusLabel(credential.status)}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : null}
            <div className={styles.tabActions}>
              <ButtonLink to="/coordinator/credentials" variant="secondary" size="small">
                Open credentials workspace
              </ButtonLink>
              <Button
                size="small"
                variant="ghost"
                icon={<Mail size={13} aria-hidden="true" />}
                onClick={() => {
                  window.location.href = `mailto:${volunteer.email}?subject=${encodeURIComponent("Credential renewal")}`;
                }}
              >
                Ask about renewal
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "matches" ? (
        <div className={styles.tabPanel}>
          <Card padding="loose">
            <SectionHeader
              title="Explainable matches"
              subtitle="Scores use cause interest, skills, availability, and reliability. No hidden ranking."
            />
            <div className={styles.matchList}>
              {matches.map(({ opportunity, score, reasons }) => (
                <Link
                  key={opportunity.id}
                  to={`/coordinator/opportunities/${opportunity.id}`}
                  className={styles.matchDetailRow}
                >
                  <div className={styles.matchCopy}>
                    <p className={styles.matchTitle}>{opportunity.title}</p>
                    <p className={styles.matchMeta}>
                      {CAUSE_LABELS[opportunity.cause]} · {opportunity.address}
                    </p>
                    <ul className={styles.reasonList}>
                      {reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                  <span className={styles.matchScore}>{score}%</span>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "availability" ? (
        <div className={styles.tabPanel}>
          <Card padding="loose">
            <SectionHeader
              title="Weekly availability"
              subtitle="Checked cells are windows this volunteer has offered. Confirm before same-day changes."
              action={
                <Button
                  size="small"
                  variant="ghost"
                  icon={<Mail size={13} aria-hidden="true" />}
                  onClick={() => {
                    window.location.href = `mailto:${volunteer.email}?subject=${encodeURIComponent("Update your CivicFlow availability")}`;
                  }}
                >
                  Request update
                </Button>
              }
            />
            <div className={styles.availabilityGrid}>
              <div />
              {DAYS.map((day) => (
                <span key={day} className={styles.dayLabel}>
                  {day}
                </span>
              ))}
              {PERIODS.map((period) => (
                <div className={styles.availabilityRow} key={period}>
                  <span className={styles.periodLabel}>
                    {period.charAt(0).toUpperCase() + period.slice(1)}
                  </span>
                  {DAYS.map((day) => {
                    const available = volunteer.availability.some(
                      (slot) => slot.day === day.toLowerCase() && slot.period === period,
                    );
                    return (
                      <span
                        key={`${day}-${period}`}
                        className={`${styles.availabilityCell} ${available ? styles.availabilityOn : ""}`}
                      >
                        {available ? <Check size={12} aria-hidden="true" /> : null}
                        <span className="visually-hidden">
                          {day} {period}: {available ? "available" : "not available"}
                        </span>
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "activity" ? (
        <div className={styles.tabPanel}>
          <Card padding="loose">
            <SectionHeader
              title="Activity timeline"
              subtitle="Every check-in, approval, and profile change, oldest to newest."
            />
            <ol className={styles.timeline}>
              {activityFeed.map((item) => (
                <li className={styles.timelineItem} key={item.id}>
                  <span className={styles.timelineDot} data-tone={item.tone} aria-hidden="true" />
                  <div>
                    <p className={styles.activityTitle}>{item.title}</p>
                    <p className={styles.activityMeta}>{item.detail}</p>
                  </div>
                </li>
              ))}
              {activityFeed.length === 0 ? (
                <li className={styles.activityMeta}>No activity recorded yet.</li>
              ) : null}
            </ol>
          </Card>
          <Card padding="loose">
            <SectionHeader
              title="Hours evidence"
              subtitle="Approved minutes come from reviewed attendance, not a typed total."
            />
            <ul className={styles.hoursList}>
              {hourRows.slice(0, 6).map((row) => (
                <li key={row.id} className={styles.hoursRow}>
                  <span className={styles.hoursIcon} aria-hidden="true">
                    <Clock3 size={13} />
                  </span>
                  <div className={styles.hoursCopy}>
                    <p className={styles.activityTitle}>{row.opportunity.title}</p>
                    <p className={styles.activityMeta}>
                      {format(parseISO(row.date), "MMM d, yyyy")} · requested{" "}
                      {formatMinutes(row.requestedMinutes)}
                    </p>
                  </div>
                  <Badge
                    tone={
                      row.status === "verified"
                        ? "green"
                        : row.status === "rejected"
                          ? "red"
                          : "amber"
                    }
                  >
                    {formatMinutes(row.approvedMinutes ?? row.requestedMinutes)} ·{" "}
                    {statusLabel(row.status)}
                  </Badge>
                </li>
              ))}
              {hourRows.length === 0 ? (
                <li className={styles.activityMeta}>No hours submitted yet.</li>
              ) : null}
            </ul>
            <div className={styles.tabActions}>
              <ButtonLink to="/coordinator/hours" size="small" variant="secondary">
                Open hours review
              </ButtonLink>
            </div>
          </Card>
        </div>
      ) : null}

      <footer className={styles.footer}>
        <Link to="/coordinator/volunteers" className={styles.footerLink}>
          <ArrowLeft size={12} aria-hidden="true" /> All volunteers
        </Link>
        <span className={styles.footerMeta}>
          <Users size={12} aria-hidden="true" /> {workspace.volunteers.length} active volunteers ·{" "}
          <CalendarDays size={12} aria-hidden="true" /> {upcomingForVolunteer.length} upcoming
          shifts
        </span>
      </footer>
    </Page>
  );
}
