import { useState } from "react";
import { ArrowRight, Check, Database, ShieldCheck, WifiOff } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../../components/ui";
import { t } from "../../lib/i18n";
import styles from "./WelcomePage.module.css";

type Role = "coordinator" | "volunteer";

const roles: {
  id: Role;
  title: string;
  description: string;
  destination: string;
}[] = [
  {
    id: "coordinator",
    title: "I coordinate volunteers",
    description: "Build the schedule, fill gaps, approve hours, and report to the board.",
    destination: "/coordinator/mission-control",
  },
  {
    id: "volunteer",
    title: "I volunteer",
    description: "Find a shift that fits your week, check in at the door, and keep your hours.",
    destination: "/volunteer/home",
  },
];

const trustChips: { label: string; icon: typeof WifiOff; tone: "green" | "violet" | "teal" }[] = [
  { label: "Runs offline", icon: WifiOff, tone: "green" },
  { label: "Data stays on this device", icon: Database, tone: "violet" },
  { label: "Account stays on this device", icon: ShieldCheck, tone: "teal" },
];

export function WelcomePage() {
  const navigate = useNavigate();
  const [role, setRole] = useState<Role>("coordinator");
  const selected = roles.find((option) => option.id === role) ?? roles[0];

  return (
    <main className={styles.page}>
      <section className={styles.photoPanel} aria-labelledby="welcome-statement">
        <img
          className={styles.photo}
          src="/media/welcome-volunteer.jpg"
          alt="A volunteer smiling while packing food at FeedMore WNY"
        />
        <div className={styles.scrim} aria-hidden="true" />

        <Link className={styles.brand} to="/welcome" aria-label="CivicFlow welcome">
          <span className={styles.mark} aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M4.2 8.6c4.6-4.9 11.2-4.9 15.8-.9-4.7 4.6-11.2 4.8-15.8.9Z" fill="#071b32" />
              <path
                d="M4.4 15.1c4.4-4.3 10.6-4.4 15.2-.7-4.6 4.4-10.8 4.6-15.2.7Z"
                fill="#071b32"
                opacity="0.62"
              />
            </svg>
          </span>
          <span className={styles.brandName}>CivicFlow</span>
        </Link>

        <div className={styles.photoCopy}>
          <p className={styles.photoEyebrow}>FeedMore WNY · Buffalo, NY</p>
          <h2 className={styles.statement} id="welcome-statement">
            4,000 food boxes. 60 people a week.
          </h2>
          <p className={styles.photoBody}>
            CivicFlow is how FeedMore WNY schedules the volunteers who pack them, and how volunteers
            find a shift that fits their week.
          </p>
        </div>

        <Link className={styles.credit} to="/credits">
          Photo: Pexels · Credits
        </Link>
      </section>

      <section className={styles.panel} aria-labelledby="welcome-title">
        <div className={styles.panelInner}>
          <p className={styles.panelEyebrow}>
            <ShieldCheck size={13} strokeWidth={1.9} aria-hidden="true" />
            Local workspace · FeedMore WNY
          </p>
          <h1 className={styles.title} id="welcome-title">
            Choose a workspace
          </h1>
          <p className={styles.lede}>
            Both use the same FeedMore WNY record. You can switch at any time.
          </p>

          <fieldset className={styles.roles}>
            <legend className="visually-hidden">Choose how you will use CivicFlow</legend>
            {roles.map((option) => {
              const active = option.id === role;
              return (
                <label
                  key={option.id}
                  htmlFor={`civicflow-role-${option.id}`}
                  aria-label={t(option.title)}
                  className={styles.roleCard}
                  data-role={option.id}
                  data-selected={active}
                >
                  <input
                    id={`civicflow-role-${option.id}`}
                    className={styles.radio}
                    type="radio"
                    name="civicflow-role"
                    value={option.id}
                    checked={active}
                    onChange={() => setRole(option.id)}
                  />
                  <span className={styles.accent} aria-hidden="true" />
                  <span className={styles.roleCopy}>
                    <span className={styles.roleTitle}>
                      <span className={styles.radioMark} aria-hidden="true">
                        {active ? <Check size={11} strokeWidth={3} /> : null}
                      </span>
                      {t(option.title)}
                    </span>
                    <span className={styles.roleBody}>{t(option.description)}</span>
                  </span>
                </label>
              );
            })}
          </fieldset>

          <Button
            className={styles.continue}
            variant="primary"
            size="large"
            onClick={() => navigate("/sign-in")}
          >
            <span>
              {t("Continue as")} {t(selected.id === "coordinator" ? "Coordinator" : "Volunteer")}
            </span>
            <ArrowRight size={16} aria-hidden="true" />
          </Button>

          <div className={styles.trust}>
            <h2 className={styles.trustTitle}>How this workspace runs</h2>
            <ul className={styles.chips}>
              {trustChips.map((chip) => {
                const Icon = chip.icon;
                return (
                  <li className={styles.chip} data-tone={chip.tone} key={chip.label}>
                    <Icon size={12} strokeWidth={2} aria-hidden="true" />
                    {t(chip.label)}
                  </li>
                );
              })}
            </ul>
          </div>

          <p className={styles.signIn}>
            Already have a profile? <Link to="/sign-in">Sign in</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
