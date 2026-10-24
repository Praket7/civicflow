import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatDate, formatTime } from "../../lib/workspace/selectors";
import type { AvailabilitySlot, DayKey, PeriodKey, Volunteer } from "../../types/domain";
import { Avatar, Badge, Button, Card, Page, PageHeader, SectionHeader } from "../../components/ui";
import { SetupShell } from "../../components/layout/SetupShell";
import { useWorkspace } from "../../lib/workspace/session";
import { currentVolunteer, getMatches, getUpcomingShiftRows } from "../../lib/workspace/selectors";
import styles from "./OnboardingPage.module.css";

const SKILL_OPTIONS = [
  "Spanish",
  "Food handling",
  "Tutoring",
  "Event setup",
  "Gardening",
  "Customer service",
  "Leadership",
  "Technology",
  "Driver",
  "CPR",
];

const DAYS: { key: DayKey; label: string }[] = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "morning", label: "Morning" },
  { key: "afternoon", label: "Afternoon" },
  { key: "evening", label: "Evening" },
];

const SKILL_TONES = ["teal", "cobalt", "violet", "amber", "green", "cyan"];

const STEPS = ["Profile", "Skills & interests", "Availability", "Preferences"];

export function OnboardingPage() {
  const navigate = useNavigate();
  const { workspace, session, actions } = useWorkspace();
  const baseVolunteer = currentVolunteer(workspace);

  const [skills, setSkills] = useState<string[]>(() => session.volunteerProfile.skills);
  const [availability, setAvailability] = useState<AvailabilitySlot[]>(
    () => session.volunteerProfile.availability,
  );
  const [interests, setInterests] = useState(baseVolunteer.interests);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  function toggleSkill(skill: string) {
    setSaved(false);
    setError("");
    setSkills((current) =>
      current.includes(skill) ? current.filter((item) => item !== skill) : [...current, skill],
    );
  }

  function toggleSlot(day: DayKey, period: PeriodKey) {
    setSaved(false);
    const candidate: AvailabilitySlot = { day, period };
    setAvailability((current) =>
      current.some((slot) => slot.day === day && slot.period === period)
        ? current.filter((slot) => slot.day !== day || slot.period !== period)
        : [...current, candidate],
    );
  }

  const previewVolunteer: Volunteer = {
    ...baseVolunteer,
    skills,
    availability,
    interests,
  };

  const rankedMatches = getMatches(previewVolunteer, 8).filter((match) => match.score >= 70);
  const previewMatches = rankedMatches.slice(0, 3);
  const allSkills = [...new Set([...SKILL_OPTIONS, ...baseVolunteer.skills])];

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (skills.length === 0) {
      setError("Choose at least one skill so matches stay explainable.");
      return;
    }
    if (availability.length === 0) {
      setError("Add at least one availability window before continuing.");
      return;
    }
    actions.saveVolunteerProfile({ skills, availability, completedOnboarding: true });
    setError("");
    setSaved(true);
    window.setTimeout(() => navigate("/volunteer/home"), 700);
  }

  return (
    <SetupShell label="Volunteer setup · Step 2 of 4">
      <Page className={styles.page}>
        <ol className={styles.steps} aria-label="Onboarding progress">
          {STEPS.map((step, index) => {
            const number = index + 1;
            const state = number < 2 ? "done" : number === 2 ? "active" : "upcoming";
            return (
              <li key={step} className={styles.step} data-state={state}>
                <span className={styles.stepNumber} aria-hidden="true">
                  {state === "done" ? <Check size={12} strokeWidth={2.6} /> : number}
                </span>
                <span className={styles.stepLabel}>{step}</span>
                {state === "done" ? <span className="visually-hidden">completed</span> : null}
                {state === "active" ? <span className="visually-hidden">current step</span> : null}
              </li>
            );
          })}
        </ol>

        <PageHeader
          title="What are you good at?"
          description="Choose skills and interests you enjoy. CivicFlow uses them to explain every opportunity match."
        />

        <form className={styles.layout} onSubmit={handleSubmit} noValidate>
          <div className={styles.mainColumn}>
            <Card padding="loose" className={styles.block}>
              <SectionHeader
                title="Skills"
                subtitle="Pick everything you would be comfortable doing on site."
              />
              <div className={styles.skills} role="group" aria-label="Your skills">
                {allSkills.map((skill, index) => {
                  const selected = skills.includes(skill);
                  return (
                    <button
                      key={skill}
                      type="button"
                      className={styles.skill}
                      data-tone={SKILL_TONES[index % SKILL_TONES.length]}
                      data-selected={selected}
                      aria-pressed={selected}
                      onClick={() => toggleSkill(skill)}
                    >
                      {selected ? <Check size={11} strokeWidth={2.8} aria-hidden="true" /> : null}
                      {skill}
                    </button>
                  );
                })}
              </div>
              <p className={styles.selectionCount} aria-live="polite">
                {skills.length} {skills.length === 1 ? "skill" : "skills"} selected
              </p>
            </Card>

            <Card padding="loose" className={styles.block}>
              <SectionHeader
                title="Availability"
                subtitle="Tap a window to add it. Weekday evenings and weekend mornings cover the most gaps."
              />
              <div className={styles.availability} role="group" aria-label="Weekly availability">
                <span className={styles.gridCorner} aria-hidden="true" />
                {DAYS.map((day) => (
                  <span key={day.key} className={styles.dayLabel}>
                    {day.label}
                  </span>
                ))}
                {PERIODS.map((period) => (
                  <div key={period.key} className={styles.periodRow}>
                    <span className={styles.periodLabel}>{period.label}</span>
                    {DAYS.map((day) => {
                      const selected = availability.some(
                        (slot) => slot.day === day.key && slot.period === period.key,
                      );
                      return (
                        <button
                          key={`${day.key}-${period.key}`}
                          type="button"
                          className={styles.slot}
                          data-selected={selected}
                          aria-pressed={selected}
                          aria-label={`${day.label} ${period.label}`}
                          onClick={() => toggleSlot(day.key, period.key)}
                        >
                          {selected ? (
                            <Check size={14} strokeWidth={2.6} aria-hidden="true" />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
              <p className={styles.selectionCount} aria-live="polite">
                {availability.length} of 21 windows selected
              </p>
            </Card>

            <Card padding="loose" className={styles.block}>
              <SectionHeader
                title="In your words"
                subtitle="What do you want to help with? Coordinators use this when a role is hard to fill."
              />
              <label className={styles.textareaLabel} htmlFor="onboarding-interests">
                Interests and experience
              </label>
              <textarea
                id="onboarding-interests"
                className={styles.textarea}
                value={interests}
                rows={3}
                onChange={(event) => {
                  setSaved(false);
                  setInterests(event.target.value);
                }}
              />
            </Card>
          </div>

          <aside className={styles.aside} aria-label="Live profile preview">
            <Card padding="loose" className={styles.preview}>
              <p className={styles.previewKicker}>Live profile preview</p>
              <div className={styles.profileHeader}>
                <Avatar
                  initials={baseVolunteer.initials}
                  tone={baseVolunteer.tone}
                  size={56}
                  label={baseVolunteer.name}
                />
                <div>
                  <h2 className={styles.profileName}>{baseVolunteer.name}</h2>
                  <p className={styles.profileMeta}>
                    {workspace.organization.city}, {workspace.organization.state} · New volunteer
                  </p>
                </div>
              </div>

              <div className={styles.previewSkills}>
                {skills.length === 0 ? (
                  <span className={styles.previewEmpty}>No skills selected yet</span>
                ) : (
                  skills.map((skill) => (
                    <span key={skill} className={styles.previewSkill}>
                      {skill}
                    </span>
                  ))
                )}
              </div>

              <div className={styles.previewDivider} />

              <div className={styles.matchHead}>
                <h3 className={styles.matchTitle}>
                  We found {rankedMatches.length}{" "}
                  {rankedMatches.length === 1 ? "opportunity" : "opportunities"}
                </h3>
                <Check size={15} aria-hidden="true" className={styles.matchIcon} />
              </div>

              <ul className={styles.matchList}>
                {previewMatches.map((match) => {
                  const nextShift = getUpcomingShiftRows().find(
                    (row) => row.shift.opportunityId === match.opportunity.id,
                  );
                  return (
                    <li key={match.opportunity.id} className={styles.matchRow}>
                      <div className={styles.matchRowTop}>
                        <span className={styles.matchName}>{match.opportunity.title}</span>
                        {nextShift ? (
                          <span className={styles.matchWhen}>
                            {formatDate(nextShift.shift.startsAt)} ·{" "}
                            {formatTime(nextShift.shift.startsAt)}
                          </span>
                        ) : null}
                      </div>
                      <div className={styles.matchReasons}>
                        <Badge tone={match.score >= 90 ? "green" : "cobalt"}>
                          {match.score}% match
                        </Badge>
                        <span className={styles.matchReason}>
                          {match.reasons[0] ?? "Matches your availability"}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {error ? (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              ) : null}
              {saved ? (
                <p className={styles.saved} role="status">
                  <Check size={13} aria-hidden="true" />
                  Profile saved. Taking you home…
                </p>
              ) : null}

              <Button
                type="submit"
                variant="primary"
                size="large"
                className={styles.saveButton}
                icon={<ArrowRight size={15} aria-hidden="true" />}
              >
                Save & continue
              </Button>
              <button
                type="button"
                className={styles.skip}
                onClick={() => navigate("/volunteer/home")}
              >
                Keep my current profile
              </button>
            </Card>
          </aside>
        </form>
      </Page>
    </SetupShell>
  );
}
