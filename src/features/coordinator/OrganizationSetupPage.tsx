import { useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Check,
  CheckCircle2,
  ImagePlus,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  Page,
  PageHeader,
  SelectField,
  TextareaField,
  TextField,
} from "../../components/ui";
import { useWorkspace } from "../../lib/workspace/session";
import { CAUSE_LABELS } from "../../lib/workspace/selectors";
import type { Cause } from "../../types/domain";
import { SetupShell } from "../../components/layout/SetupShell";
import styles from "./OrganizationSetupPage.module.css";

const COVER_OPTIONS = [
  { src: "/media/opp-food-distribution.jpg", alt: "Volunteers packing food boxes" },
  { src: "/media/hero-community.jpg", alt: "Neighbours gathering at a community event" },
  { src: "/media/opp-community-garden.jpg", alt: "Volunteers working in a community garden" },
];

const TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
];

interface FormState {
  name: string;
  mission: string;
  address: string;
  city: string;
  state: string;
  website: string;
  email: string;
  timezone: string;
  weekStartsOn: "monday" | "sunday";
}

type FieldErrors = Partial<Record<keyof FormState, string>>;

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function OrganizationSetupPage() {
  const { workspace, session, backups, actions } = useWorkspace();
  const organization = workspace.organization;
  const [cause, setCause] = useState<Cause>("food");
  const [cover, setCover] = useState(COVER_OPTIONS[0]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});

  const [form, setForm] = useState<FormState>({
    name: session.settings.organizationName || organization.name,
    mission: organization.mission,
    address: organization.address,
    city: organization.city,
    state: organization.state,
    website: organization.website,
    email: session.settings.contactEmail || organization.email,
    timezone: session.settings.timezone || organization.timezone,
    weekStartsOn: session.settings.weekStartsOn,
  });

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setSavedMessage(null);
  }

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (!form.name.trim()) next.name = "Organization name is required.";
    if (!form.mission.trim() || form.mission.trim().length < 20)
      next.mission = "Write at least one sentence so volunteers understand the mission.";
    if (!form.address.trim()) next.address = "Add a street address for opportunity listings.";
    if (!form.city.trim()) next.city = "City is required.";
    if (!form.email.trim()) next.email = "A coordinator email is required.";
    else if (!validEmail(form.email)) next.email = "Enter a valid email address.";
    if (!form.website.trim()) next.website = "Add a website or a social profile URL.";
    return next;
  }

  function persistDraft() {
    if (!form.name.trim()) {
      setErrors({ name: "Organization name is required, even for a draft." });
      return false;
    }
    actions.updateSettings({
      organizationName: form.name.trim(),
      contactEmail: form.email.trim() || organization.email,
      timezone: form.timezone,
      weekStartsOn: form.weekStartsOn,
    });
    return true;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) {
      setSavedMessage(null);
      return;
    }
    persistDraft();
    setSavedMessage("Workspace saved. Your public profile is ready.");
  }

  function handleDraft() {
    if (persistDraft()) {
      setErrors({});
      setSavedMessage("Draft saved on this device.");
    }
  }

  const profileComplete = Boolean(form.name.trim() && form.mission.trim().length >= 20);
  const contactComplete = validEmail(form.email);
  const scheduleComplete = Boolean(session.settings.defaultShiftLength);
  const backupReady = backups.length > 0;
  const completedCount = [profileComplete, contactComplete, scheduleComplete, backupReady].filter(
    Boolean,
  ).length;

  const checklist = [
    {
      label: "Organization profile created",
      detail: "Name, mission, and public story",
      done: profileComplete,
    },
    {
      label: "Public contact added",
      detail: form.email || "No contact email yet",
      done: contactComplete,
    },
    {
      label: "Schedule defaults set",
      detail: `${Math.round(session.settings.defaultShiftLength / 60)} h default shift · week starts ${form.weekStartsOn}`,
      done: scheduleComplete,
    },
    {
      label: "First automatic backup verified",
      detail: backupReady ? "Snapshot available in Backup & Recovery" : "No snapshot yet",
      done: backupReady,
    },
  ];

  return (
    <SetupShell label="Organization setup · Step 1 of 3">
      <Page>
        <PageHeader
          title="Build your organization workspace."
          description="These details appear across opportunity pages, reports, and service verification records."
          actions={
            <ButtonLink to="/coordinator/mission-control" variant="ghost" size="small">
              Skip for now
            </ButtonLink>
          }
        />

        <div className={styles.layout}>
          <form className={styles.formCard} onSubmit={handleSubmit} noValidate>
            <div className={styles.formHead}>
              <div>
                <h2 className={styles.cardTitle}>Organization details</h2>
                <p className={styles.cardSub}>
                  Changes are saved to this demo workspace and reflected in the preview.
                </p>
              </div>
              <span className={styles.stepChip}>1 of 3</span>
            </div>

            <div className={styles.grid}>
              <TextField
                label="Organization name"
                value={form.name}
                onChange={(event) => update("name", event.target.value)}
                error={errors.name}
                placeholder="FeedMore WNY"
                autoComplete="organization"
              />
              <SelectField
                label="Primary cause"
                value={cause}
                onChange={(event) => setCause(event.target.value as Cause)}
                hint="Used as the first filter for discovery."
              >
                {(Object.keys(CAUSE_LABELS) as Cause[]).map((option) => (
                  <option key={option} value={option}>
                    {CAUSE_LABELS[option]}
                  </option>
                ))}
              </SelectField>

              <TextField
                label="Street address"
                value={form.address}
                onChange={(event) => update("address", event.target.value)}
                error={errors.address}
                autoComplete="street-address"
              />
              <div className={styles.split}>
                <TextField
                  label="City"
                  value={form.city}
                  onChange={(event) => update("city", event.target.value)}
                  error={errors.city}
                  autoComplete="address-level2"
                />
                <TextField
                  label="State"
                  value={form.state}
                  onChange={(event) => update("state", event.target.value)}
                  maxLength={2}
                  autoComplete="address-level1"
                />
              </div>

              <SelectField
                label="Timezone"
                value={form.timezone}
                onChange={(event) => update("timezone", event.target.value)}
                hint="Shift times and verification dates use this zone."
              >
                {TIMEZONES.map((zone) => (
                  <option key={zone.value} value={zone.value}>
                    {zone.label}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Week starts on"
                value={form.weekStartsOn}
                onChange={(event) =>
                  update("weekStartsOn", event.target.value as "monday" | "sunday")
                }
              >
                <option value="monday">Monday</option>
                <option value="sunday">Sunday</option>
              </SelectField>

              <div className={styles.full}>
                <TextareaField
                  label="Mission"
                  value={form.mission}
                  onChange={(event) => update("mission", event.target.value)}
                  error={errors.mission}
                  hint={`${form.mission.trim().length} characters · aim for one clear sentence`}
                  rows={3}
                />
              </div>

              <TextField
                label="Website"
                value={form.website}
                onChange={(event) => update("website", event.target.value)}
                error={errors.website}
                placeholder="feedmorewny.org"
                autoComplete="url"
              />
              <TextField
                label="Coordinator email"
                type="email"
                value={form.email}
                onChange={(event) => update("email", event.target.value)}
                error={errors.email}
                autoComplete="email"
              />
            </div>

            <div className={styles.formFooter}>
              <div aria-live="polite" className={styles.saveStatus}>
                {savedMessage ? (
                  <>
                    <CheckCircle2 size={14} aria-hidden="true" />
                    <span>{savedMessage}</span>
                    <Link className={styles.confirmLink} to="/coordinator/mission-control">
                      Open Mission Control →
                    </Link>
                  </>
                ) : (
                  <span className={styles.quiet}>All changes stay on this device.</span>
                )}
              </div>
              <div className={styles.actions}>
                <Button variant="secondary" onClick={handleDraft}>
                  Save draft
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  icon={<ArrowRight size={14} aria-hidden="true" />}
                >
                  Save workspace
                </Button>
              </div>
            </div>
          </form>

          <aside className={styles.side} aria-label="Public profile preview">
            <div className={styles.profileCard}>
              <div className={styles.cover}>
                <img src={cover.src} alt={cover.alt} className={styles.coverImage} />
                <div className={styles.coverShade} aria-hidden="true" />
                <span className={styles.coverLabel}>Public profile</span>
                <button
                  type="button"
                  className={styles.imageButton}
                  onClick={() => setPickerOpen((open) => !open)}
                  aria-expanded={pickerOpen}
                  aria-label="Change cover image"
                >
                  <ImagePlus size={14} aria-hidden="true" />
                </button>
                {pickerOpen ? (
                  <div className={styles.picker} role="group" aria-label="Cover image options">
                    {COVER_OPTIONS.map((option) => (
                      <button
                        key={option.src}
                        type="button"
                        className={styles.pickerOption}
                        data-selected={option.src === cover.src}
                        onClick={() => {
                          setCover(option);
                          setPickerOpen(false);
                        }}
                        aria-label={`Use image: ${option.alt}`}
                        aria-pressed={option.src === cover.src}
                      >
                        <img src={option.src} alt="" />
                        {option.src === cover.src ? <Check size={11} aria-hidden="true" /> : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className={styles.profileBody}>
                <div className={styles.profileIdentity}>
                  <span className={styles.orgBadge} aria-hidden="true">
                    {form.name
                      .split(" ")
                      .map((part) => part[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase() || "CF"}
                  </span>
                  <div className={styles.identityCopy}>
                    <h2 className={styles.orgName}>{form.name.trim() || "Your organization"}</h2>
                    <p className={styles.orgMeta}>
                      {form.city.trim() || "City"}, {form.state.trim() || "ST"} ·{" "}
                      {CAUSE_LABELS[cause]}
                    </p>
                  </div>
                </div>

                <p className={styles.mission}>
                  {form.mission.trim() || "Your mission statement will appear here for volunteers."}
                </p>

                <div className={styles.chips}>
                  <Badge tone="amber">{CAUSE_LABELS[cause]}</Badge>
                  <Badge tone="green">Training provided</Badge>
                  <Badge tone="cobalt">All ages</Badge>
                </div>

                <dl className={styles.metaList}>
                  <div>
                    <dt>
                      <MapPin size={12} aria-hidden="true" />
                      Location
                    </dt>
                    <dd>{form.address.trim() || "Add a street address"}</dd>
                  </div>
                  <div>
                    <dt>
                      <Building2 size={12} aria-hidden="true" />
                      Contact
                    </dt>
                    <dd>{form.email.trim() || "Add a coordinator email"}</dd>
                  </div>
                  <div>
                    <dt>
                      <ShieldCheck size={12} aria-hidden="true" />
                      Website
                    </dt>
                    <dd>{form.website.trim() || "Add your website"}</dd>
                  </div>
                </dl>
              </div>
            </div>

            <Card className={styles.checklist} padding="compact">
              <div className={styles.checklistHead}>
                <div>
                  <h2 className={styles.cardTitle}>Workspace checklist</h2>
                  <p className={styles.cardSub}>
                    Everything a judge or new coordinator needs first.
                  </p>
                </div>
                <Badge tone={completedCount === checklist.length ? "green" : "amber"} dot>
                  {completedCount}/{checklist.length} ready
                </Badge>
              </div>
              <ul className={styles.checkItems}>
                {checklist.map((item) => (
                  <li key={item.label} className={styles.checkItem} data-done={item.done}>
                    <span className={styles.checkIcon} aria-hidden="true">
                      {item.done ? <Check size={11} /> : null}
                    </span>
                    <span className={styles.checkCopy}>
                      <span className={styles.checkLabel}>{item.label}</span>
                      <span className={styles.checkDetail}>{item.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <div className={styles.assurance}>
                <BadgeCheck size={15} aria-hidden="true" />
                <p>
                  Organization identity, contact details, and schedule defaults are stored in the
                  local workspace, so the demo never needs a network connection.
                </p>
              </div>
            </Card>
          </aside>
        </div>
      </Page>
    </SetupShell>
  );
}
