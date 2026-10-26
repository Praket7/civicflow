import { useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Check,
  ImagePlus,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Badge,
  Button,
  Card,
  Page,
  PageHeader,
  SelectField,
  TextareaField,
  TextField,
} from "../../components/ui";
import { useAuth } from "../../lib/auth/session";
import { coverPhoto } from "../../lib/images";
import { completeSetup } from "../../lib/onboarding/store";
import { organizationById, updateOrganizationCover } from "../../lib/organizations/store";
import { useWorkspace } from "../../lib/workspace/session";
import { CAUSE_LABELS } from "../../lib/workspace/selectors";
import type { Cause } from "../../types/domain";
import { US_STATES } from "../../lib/us-states";
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

const STEPS = ["Organization", "Location", "Contact & schedule", "Review"];

export function OrganizationSetupPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { workspace, session, actions } = useWorkspace();
  const organization = workspace.organization;
  const [cause, setCause] = useState<Cause>("food");
  const savedCover = organizationById(organization.id);
  const [cover, setCover] = useState({
    src: savedCover?.image ?? COVER_OPTIONS[0].src,
    alt: savedCover?.imageAlt ?? COVER_OPTIONS[0].alt,
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [coverError, setCoverError] = useState("");
  const coverInput = useRef<HTMLInputElement>(null);

  async function uploadCover(file: File | undefined) {
    if (!file) return;
    try {
      const src = await coverPhoto(file);
      setCover({ src, alt: `${form.name.trim() || "Organization"} cover photo` });
      setCoverError("");
      setPickerOpen(false);
    } catch (caught) {
      setCoverError(caught instanceof Error ? caught.message : String(caught));
    }
  }

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
    actions.updateSettings({
      organizationName: form.name.trim(),
      contactEmail: form.email.trim() || organization.email,
      timezone: form.timezone,
      weekStartsOn: form.weekStartsOn,
    });
  }

  function stepErrors(target: number): FieldErrors {
    const all = validate();
    if (target === 1) return { name: all.name, mission: all.mission };
    if (target === 2) return { address: all.address, city: all.city, website: all.website };
    if (target === 3) return { email: all.email };
    return all;
  }

  function advance() {
    const next = stepErrors(step);
    setErrors(next);
    if (Object.keys(next).some((key) => next[key as keyof FieldErrors])) return;
    setStep((current) => Math.min(STEPS.length, current + 1));
  }

  function goBack() {
    setErrors({});
    setStep((current) => Math.max(1, current - 1));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    persistDraft();
    updateOrganizationCover(organization.id, cover.src, cover.alt);
    if (user) completeSetup(user.email, "coordinator");
    navigate("/coordinator/mission-control", { replace: true });
  }

  const profileComplete = Boolean(form.name.trim() && form.mission.trim().length >= 20);
  const contactComplete = validEmail(form.email);
  const scheduleComplete = Boolean(session.settings.defaultShiftLength);
  const completedCount = [profileComplete, contactComplete, scheduleComplete].filter(
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
  ];

  return (
    <SetupShell label={`Organization setup · Step ${step} of ${STEPS.length}`}>
      <Page>
        <ol className={styles.steps} aria-label="Setup progress">
          {STEPS.map((label, index) => {
            const number = index + 1;
            const state = number < step ? "done" : number === step ? "active" : "upcoming";
            return (
              <li key={label} className={styles.step} data-state={state}>
                <span className={styles.stepNumber} aria-hidden="true">
                  {state === "done" ? <Check size={11} strokeWidth={2.8} /> : number}
                </span>
                {label}
              </li>
            );
          })}
        </ol>
        <PageHeader
          title="Build your organization workspace."
          description="These details appear across opportunity pages, reports, and service verification records."
        />

        <div className={styles.layout}>
          <form className={styles.formCard} onSubmit={handleSubmit} noValidate>
            <div className={styles.formHead}>
              <div>
                <h2 className={styles.cardTitle}>Organization details</h2>
                <p className={styles.cardSub}>
                  Step {step} of {STEPS.length}. Changes are saved to this workspace and reflected
                  in the preview.
                </p>
              </div>
              <span className={styles.stepChip}>{STEPS[step - 1]}</span>
            </div>

            <div className={styles.grid}>
              {step === 1 ? (
                <>
                  <TextField
                    label="Organization name"
                    value={form.name}
                    onChange={(event) => update("name", event.target.value)}
                    error={errors.name}
                    placeholder="Your organization"
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
                </>
              ) : null}

              {step === 2 ? (
                <>
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
                    <SelectField
                      label="State"
                      value={form.state}
                      onChange={(event) => update("state", event.target.value)}
                      autoComplete="address-level1"
                    >
                      <option value="">Select a state</option>
                      {US_STATES.map((state) => (
                        <option key={state.code} value={state.code}>
                          {state.name}
                        </option>
                      ))}
                    </SelectField>
                  </div>
                  <TextField
                    label="Website"
                    value={form.website}
                    onChange={(event) => update("website", event.target.value)}
                    error={errors.website}
                    placeholder="example.org"
                    autoComplete="url"
                  />
                </>
              ) : null}

              {step === 3 ? (
                <>
                  <TextField
                    label="Coordinator email"
                    type="email"
                    value={form.email}
                    onChange={(event) => update("email", event.target.value)}
                    error={errors.email}
                    autoComplete="email"
                  />
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
                    hint="Calendars and weekly reports use this day."
                  >
                    <option value="monday">Monday</option>
                    <option value="sunday">Sunday</option>
                  </SelectField>
                </>
              ) : null}

              {step === 4 ? (
                <div className={styles.full}>
                  <dl className={styles.review}>
                    <div>
                      <dt>Organization</dt>
                      <dd>{form.name.trim() || "Not set yet"}</dd>
                    </div>
                    <div>
                      <dt>Mission</dt>
                      <dd>{form.mission.trim() || "Not set yet"}</dd>
                    </div>
                    <div>
                      <dt>Where</dt>
                      <dd>
                        {[form.address, form.city, form.state]
                          .map((value) => value.trim())
                          .filter(Boolean)
                          .join(", ") || "Not set yet"}
                      </dd>
                    </div>
                    <div>
                      <dt>Contact</dt>
                      <dd>{form.email.trim() || "Not set yet"}</dd>
                    </div>
                    <div>
                      <dt>Schedule</dt>
                      <dd>
                        {TIMEZONES.find((zone) => zone.value === form.timezone)?.label ??
                          form.timezone}{" "}
                        · week starts {form.weekStartsOn}
                      </dd>
                    </div>
                  </dl>
                  <p className={styles.reviewNote}>
                    Pick a cover image on the right. Your schedule starts empty — only the shifts
                    you publish show up for volunteers.
                  </p>
                </div>
              ) : null}
            </div>

            <div className={styles.formFooter}>
              <div aria-live="polite" className={styles.saveStatus}>
                <span className={styles.quiet}>
                  Step {step} of {STEPS.length} · all changes stay on this device.
                </span>
              </div>
              <div className={styles.actions}>
                {step > 1 ? (
                  <Button variant="secondary" onClick={goBack}>
                    Back
                  </Button>
                ) : null}
                {step < STEPS.length ? (
                  // Keep the last step a separate node: flipping this button to
                  // type="submit" mid-click would submit the form early.
                  <Button
                    key="continue"
                    type="button"
                    variant="primary"
                    onClick={advance}
                    icon={<ArrowRight size={14} aria-hidden="true" />}
                  >
                    Continue
                  </Button>
                ) : (
                  <Button
                    key="finish"
                    type="submit"
                    variant="primary"
                    icon={<ArrowRight size={14} aria-hidden="true" />}
                  >
                    Finish setup
                  </Button>
                )}
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
                    <button
                      type="button"
                      className={styles.pickerUpload}
                      data-selected={cover.src.startsWith("data:")}
                      aria-pressed={cover.src.startsWith("data:")}
                      onClick={() => coverInput.current?.click()}
                    >
                      <ImagePlus size={13} aria-hidden="true" />
                      Upload
                    </button>
                    <input
                      ref={coverInput}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(event) => {
                        void uploadCover(event.target.files?.[0]);
                        event.currentTarget.value = "";
                      }}
                    />
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

            {coverError ? (
              <p className={styles.coverError} role="alert">
                {coverError}
              </p>
            ) : null}
            <Card className={styles.checklist} padding="compact">
              <div className={styles.checklistHead}>
                <div>
                  <h2 className={styles.cardTitle}>Workspace checklist</h2>
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
