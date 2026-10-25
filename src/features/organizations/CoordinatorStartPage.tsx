import { useState } from "react";
import { ArrowLeft, ArrowRight, Building2, KeyRound } from "lucide-react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Button } from "../../components/ui";
import { accountHome, useAuth } from "../../lib/auth/session";
import {
  joinOrganization,
  organizationForCode,
  setCurrentOrganization,
} from "../../lib/organizations/store";
import { useOrganizationWorkspace } from "../../lib/organizations/useOrganizationWorkspace";
import styles from "./onboarding.module.css";

export function CoordinatorStartPage() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { organizations } = useOrganizationWorkspace(user);
  const [mode, setMode] = useState<"join" | "create">(organizations.length ? "create" : "join");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!user) {
    return (
      <main className={styles.screen}>
        <p className={styles.lede}>Sign in to create or join a coordinator workspace.</p>
      </main>
    );
  }
  if (user.role !== "coordinator") return <Navigate to="/volunteer/start" replace />;

  function submitCode() {
    if (!user) return;
    setError("");
    const clean = code.replace(/\D/g, "");
    if (clean.length !== 10) {
      setError("A coordinator code is 10 digits. Check the invitation and try again.");
      return;
    }
    const organization = organizationForCode(clean, "coordinator");
    if (!organization) {
      setError(
        "No organization on this device uses that code. Ask the workspace owner to resend it.",
      );
      return;
    }
    setBusy(true);
    try {
      joinOrganization(user, organization.id, clean);
      setCurrentOrganization(user.email, organization.id);
      navigate("/coordinator/mission-control", { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.screen}>
      <div className={styles.backRow}>
        {organizations.length > 0 ? (
          <Link className={styles.back} to={accountHome(user)}>
            <ArrowLeft size={14} aria-hidden="true" />
            Back to workspace
          </Link>
        ) : (
          <span />
        )}
        <button type="button" className={styles.signOut} onClick={() => void signOut()}>
          Sign out
        </button>
      </div>

      <section className={styles.shell} aria-labelledby="coordinator-start-title">
        <header className={styles.head}>
          <p className={styles.eyebrow}>
            <Building2 size={13} aria-hidden="true" />
            Coordinator account · {user.name}
          </p>
          <h1 className={styles.title} id="coordinator-start-title">
            Put your organization on the map.
          </h1>
          <p className={styles.lede}>
            Join a team that already uses CivicFlow, or start a new workspace and invite the rest of
            the team with a code.
          </p>
        </header>

        <div className={styles.body}>
          {organizations.length > 0 ? (
            <section aria-labelledby="your-workspaces">
              <h2 className={styles.sectionTitle} id="your-workspaces">
                Your workspaces
              </h2>
              <p className={styles.sectionHint}>
                Open one, or add another organization below. You can switch at any time from the
                workspace menu.
              </p>
              <ul className={styles.orgList} style={{ marginTop: 12 }}>
                {organizations.map(({ organization, membership }) => (
                  <li className={styles.orgCard} key={organization.id} data-joined="true">
                    <img
                      className={styles.orgThumb}
                      src={organization.image}
                      alt={organization.imageAlt}
                    />
                    <div>
                      <h3 className={styles.orgName}>{organization.name}</h3>
                      <p className={styles.orgMeta}>
                        {organization.city}, {organization.state} · {membership.role}
                      </p>
                      <p className={styles.orgCopy}>{organization.description}</p>
                    </div>
                    <div className={styles.orgAction}>
                      <Button
                        size="small"
                        onClick={() => {
                          setCurrentOrganization(user.email, organization.id);
                          navigate("/coordinator/mission-control");
                        }}
                      >
                        Open
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className={styles.choices}>
            <button
              type="button"
              className={styles.choice}
              data-selected={mode === "join"}
              aria-pressed={mode === "join"}
              onClick={() => {
                setMode("join");
                setError("");
              }}
            >
              <span className={styles.choiceIcon} aria-hidden="true">
                <KeyRound size={16} />
              </span>
              <span className={styles.choiceTitle}>Join an existing team</span>
              <span className={styles.choiceBody}>
                Enter the 10-digit coordinator code the workspace owner shared with you.
              </span>
            </button>

            <button
              type="button"
              className={styles.choice}
              data-selected={mode === "create"}
              aria-pressed={mode === "create"}
              onClick={() => {
                setMode("create");
                setError("");
              }}
            >
              <span className={styles.choiceIcon} aria-hidden="true">
                <Building2 size={16} />
              </span>
              <span className={styles.choiceTitle}>Start a new organization</span>
              <span className={styles.choiceBody}>
                Add your profile, address, contact email, and photo. CivicFlow generates the join
                codes.
              </span>
            </button>
          </div>

          {mode === "join" ? (
            <div className={styles.panel}>
              <h2 className={styles.sectionTitle}>Coordinator code</h2>
              <div className={styles.codeRow}>
                <div className={styles.codeField}>
                  <label className={styles.codeLabel} htmlFor="coordinator-code">
                    10 digits
                  </label>
                  <input
                    id="coordinator-code"
                    className={styles.codeInput}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={10}
                    placeholder="0000000000"
                    value={code}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? "coordinator-code-error" : undefined}
                    onChange={(event) => {
                      setCode(event.target.value.replace(/\D/g, "").slice(0, 10));
                      setError("");
                    }}
                  />
                </div>
                <Button onClick={submitCode} disabled={busy} icon={<ArrowRight size={14} />}>
                  {busy ? "Joining…" : "Join workspace"}
                </Button>
              </div>
              {error ? (
                <p className={styles.error} id="coordinator-code-error" role="alert">
                  {error}
                </p>
              ) : null}
              <p className={styles.footerNote}>
                Codes only find organizations saved on this device. A hosted CivicFlow account looks
                up organizations on your server instead.
              </p>
            </div>
          ) : (
            <div className={styles.panel}>
              <h2 className={styles.sectionTitle}>What happens next</h2>
              <ol className={styles.sectionHint} style={{ margin: 0, paddingLeft: 18 }}>
                <li>Add the organization details volunteers will see.</li>
                <li>Choose whether it is public or invitation-only.</li>
                <li>Share the 10-digit coordinator code and the 6-digit volunteer code.</li>
              </ol>
              <div className={styles.actions}>
                <Button
                  size="large"
                  icon={<ArrowRight size={15} />}
                  onClick={() => navigate("/coordinator/organization/new")}
                >
                  Create organization
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
