import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Compass, KeyRound, MapPin, Users } from "lucide-react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Button, SearchField } from "../../components/ui";
import { accountHome, useAuth } from "../../lib/auth/session";
import {
  joinOrganization,
  listOrganizations,
  organizationForCode,
  organizationById,
  setCurrentOrganization,
} from "../../lib/organizations/store";
import { useOrganizationWorkspace } from "../../lib/organizations/useOrganizationWorkspace";
import styles from "./onboarding.module.css";

export function VolunteerStartPage() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { organizations, memberships, current } = useOrganizationWorkspace(user);
  const [query, setQuery] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");

  if (!user) {
    return (
      <main className={styles.screen}>
        <p className={styles.lede}>Sign in to find an organization near you.</p>
      </main>
    );
  }
  if (user.role !== "volunteer") return <Navigate to="/coordinator/start" replace />;

  const joined = new Set(memberships.map((membership) => membership.organizationId));
  const needle = query.trim().toLowerCase();
  const publicOrganizations = listOrganizations().filter((organization) => {
    if (organization.visibility !== "public") return false;
    // Organizations you already belong to are listed above; repeating them
    // here makes the page look like it has two of everything.
    if (joined.has(organization.id)) return false;
    if (!needle) return true;
    return [organization.name, organization.city, organization.state, organization.description]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });

  function open(organizationId: string) {
    if (!user) return;
    setCurrentOrganization(user.email, organizationId);
    navigate("/volunteer/home", { replace: true });
  }

  function join(organizationId: string, withCode?: string) {
    if (!user) return;
    setError("");
    setNotice("");
    setBusy(organizationId);
    try {
      joinOrganization(user, organizationId, withCode);
      const organization = organizationById(organizationId);
      setCurrentOrganization(user.email, organizationId);
      setNotice(
        `You're in. ${organization?.name ?? "The workspace"} is now your current workspace.`,
      );
      window.setTimeout(() => navigate("/volunteer/home"), 650);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy("");
    }
  }

  function submitCode() {
    if (!user) return;
    setError("");
    setNotice("");
    const clean = code.replace(/\D/g, "");
    if (clean.length !== 6) {
      setError("A volunteer code is 6 digits. Check the flyer or ask a coordinator.");
      return;
    }
    const organization = organizationForCode(clean, "volunteer");
    if (!organization) {
      setError("No organization on this device matches that code yet.");
      return;
    }
    if (joined.has(organization.id)) {
      open(organization.id);
      return;
    }
    join(organization.id, clean);
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

      <section className={styles.shell} aria-labelledby="volunteer-start-title">
        <header className={styles.head}>
          <p className={styles.eyebrow}>
            <Compass size={13} aria-hidden="true" />
            Volunteer account · {user.name}
          </p>
          <h1 className={styles.title} id="volunteer-start-title">
            Find a place to serve.
          </h1>
          <p className={styles.lede}>
            Join organizations near you, or use the six-digit code a coordinator gave you. You can
            belong to more than one and switch between them from the workspace menu.
          </p>
        </header>

        <div className={styles.body}>
          {organizations.length > 0 ? (
            <section aria-labelledby="joined-title">
              <h2 className={styles.sectionTitle} id="joined-title">
                Your organizations
              </h2>
              <ul className={styles.orgList} style={{ marginTop: 12 }}>
                {organizations.map(({ organization }) => (
                  <li className={styles.orgCard} key={organization.id} data-joined="true">
                    <img
                      className={styles.orgThumb}
                      src={organization.image}
                      alt={organization.imageAlt}
                    />
                    <div>
                      <h3 className={styles.orgName}>{organization.name}</h3>
                      <p className={styles.orgMeta}>
                        <MapPin size={10} aria-hidden="true" /> {organization.city},{" "}
                        {organization.state}
                      </p>
                      <p className={styles.orgCopy}>{organization.description}</p>
                    </div>
                    <div className={styles.orgAction}>
                      <Button
                        size="small"
                        variant="secondary"
                        disabled={current?.id === organization.id}
                        onClick={() => open(organization.id)}
                      >
                        {current?.id === organization.id ? "Current" : "Switch"}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className={styles.twoCol}>
            <section aria-labelledby="nearby-title">
              <h2 className={styles.sectionTitle} id="nearby-title">
                Organizations accepting volunteers
              </h2>
              <p className={styles.sectionHint}>
                Public workspaces in your area. Joining is immediate; a coordinator sees you on the
                roster.
              </p>
              <div style={{ margin: "12px 0 14px" }}>
                <SearchField
                  value={query}
                  onChange={setQuery}
                  label="Search organizations"
                  placeholder="Search by name or city…"
                />
              </div>
              {publicOrganizations.length === 0 ? (
                <p className={styles.footerNote}>
                  {query.trim()
                    ? `Nothing matches “${query}”. Try a city, or join with a code instead.`
                    : "No other organizations are open to volunteers right now. Join with a code instead."}
                </p>
              ) : (
                <ul className={styles.orgList}>
                  {publicOrganizations.map((organization) => {
                    return (
                      <li className={styles.orgCard} key={organization.id} data-joined={false}>
                        <img
                          className={styles.orgThumb}
                          src={organization.image}
                          alt={organization.imageAlt}
                        />
                        <div>
                          <h3 className={styles.orgName}>{organization.name}</h3>
                          <p className={styles.orgMeta}>
                            <MapPin size={10} aria-hidden="true" /> {organization.city},{" "}
                            {organization.state}
                          </p>
                          <p className={styles.orgCopy}>{organization.description}</p>
                          <p className={styles.orgMeta} style={{ marginTop: 8 }}>
                            <Users size={10} aria-hidden="true" /> Open to new volunteers
                          </p>
                        </div>
                        <div className={styles.orgAction}>
                          <Button
                            size="small"
                            icon={<ArrowRight size={13} />}
                            disabled={busy === organization.id}
                            onClick={() => join(organization.id)}
                          >
                            {busy === organization.id ? "Joining…" : "Join"}
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <div className={styles.panel} style={{ alignSelf: "start" }}>
              <h2 className={styles.sectionTitle}>
                <KeyRound size={14} aria-hidden="true" /> Have a volunteer code?
              </h2>
              <p className={styles.sectionHint}>
                Six digits, usually printed on the sign-in sheet or a welcome email. It also opens
                private organizations.
              </p>
              <div>
                <label className={styles.codeLabel} htmlFor="volunteer-code">
                  6-digit code
                </label>
                <input
                  id="volunteer-code"
                  className={styles.codeInput}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "volunteer-code-error" : undefined}
                  onChange={(event) => {
                    setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                    setError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") submitCode();
                  }}
                />
              </div>
              <Button onClick={submitCode} icon={<ArrowRight size={14} />}>
                Join with code
              </Button>
              {error ? (
                <p className={styles.error} id="volunteer-code-error" role="alert">
                  {error}
                </p>
              ) : null}
              {notice ? (
                <p
                  className={styles.footerNote}
                  role="status"
                  style={{ color: "var(--tone-green-ink)" }}
                >
                  <Check size={12} aria-hidden="true" /> {notice}
                </p>
              ) : null}
              <p className={styles.footerNote}>
                Codes resolve organizations saved on this device. On a hosted CivicFlow account the
                lookup happens on your server.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
