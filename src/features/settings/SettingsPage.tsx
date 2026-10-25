import { useEffect, useState } from "react";
import {
  Accessibility,
  Bell,
  Database,
  Gauge,
  KeyRound,
  RotateCcw,
  Save,
  Settings2,
  UserRound,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  Page,
  PageHeader,
  SelectField,
  TextField,
  Toggle,
} from "../../components/ui";
import { useAuth } from "../../lib/auth/session";
import { restartSetup } from "../../lib/onboarding/store";
import { getWorkspaceRepository } from "../../lib/workspace/repository";
import { useWorkspace } from "../../lib/workspace/session";
import { getHourRows } from "../../lib/workspace/selectors";
import type { Account } from "../../types/domain";
import styles from "../records/Records.module.css";

const CATEGORIES = [
  { id: "general", label: "General", icon: Settings2 },
  { id: "accounts", label: "Accounts", icon: UserRound },
  { id: "scheduling", label: "Scheduling", icon: Gauge },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "accessibility", label: "Accessibility", icon: Accessibility },
  { id: "data", label: "Local data", icon: Database },
];

export function SettingsPage() {
  const navigate = useNavigate();
  const { workspace, session, backups, actions } = useWorkspace();
  const { user, token, signOut } = useAuth();
  const [category, setCategory] = useState("general");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsError, setAccountsError] = useState("");
  const [resetFor, setResetFor] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [orgName, setOrgName] = useState(session.settings.organizationName);
  const [email, setEmail] = useState(session.settings.contactEmail);
  const [timezone, setTimezone] = useState(session.settings.timezone);
  const [weekStart, setWeekStart] = useState(session.settings.weekStartsOn);
  const [shiftLength, setShiftLength] = useState(String(session.settings.defaultShiftLength));
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const [resetArmed, setResetArmed] = useState(false);
  const categories = CATEGORIES.filter(
    (item) => item.id !== "accounts" || user?.role === "coordinator",
  );

  useEffect(() => {
    if (category !== "accounts" || !token) return;
    let active = true;
    getWorkspaceRepository()
      .listAccounts(token)
      .then((rows) => {
        if (active) setAccounts(rows);
      })
      .catch((caught: unknown) => {
        if (active) setAccountsError(caught instanceof Error ? caught.message : String(caught));
      });
    return () => {
      active = false;
    };
  }, [category, token]);

  async function resetAccountPassword() {
    if (!token || !resetFor) {
      setAccountsError("Choose an account to reset.");
      return;
    }
    if (newPassword.length < 8) {
      setAccountsError("Use at least 8 characters for the new password.");
      return;
    }
    setResetBusy(true);
    setAccountsError("");
    try {
      await getWorkspaceRepository().resetPassword(token, resetFor, newPassword);
      const target = accounts.find((account) => account.id === resetFor);
      setNewPassword("");
      setResetFor("");
      if (target?.id === user?.id) {
        setSaved("Password changed. Sign in again with the new password.");
        await signOut();
      } else {
        setSaved(`Password reset for ${target?.email ?? "the selected account"}.`);
      }
    } catch (caught) {
      setAccountsError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setResetBusy(false);
    }
  }

  function saveGeneral() {
    if (!orgName.trim()) {
      setError("Organization name is required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid contact email.");
      return;
    }
    actions.updateSettings({
      organizationName: orgName.trim(),
      contactEmail: email.trim(),
      timezone,
      weekStartsOn: weekStart as "monday" | "sunday",
      defaultShiftLength: Number(shiftLength) || 180,
    });
    setError("");
    setSaved("Workspace settings saved to this device and recorded in the audit log.");
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Defaults for this local workspace. Changes are saved on this device and recorded in the audit log."
        actions={
          <Badge tone="green" dot>
            Local workspace
          </Badge>
        }
      />

      <div className={styles.settingsLayout}>
        <nav className={styles.categoryNav} aria-label="Settings categories">
          {categories.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`${styles.categoryButton} ${category === item.id ? styles.categoryButtonActive : ""}`}
              aria-current={category === item.id ? "page" : undefined}
              onClick={() => {
                setCategory(item.id);
                setSaved("");
                setError("");
              }}
            >
              <item.icon size={14} aria-hidden="true" />
              {item.label}
            </button>
          ))}
        </nav>

        <Card className={styles.settingsCard}>
          {category === "general" ? (
            <>
              <h2 className={styles.settingsTitle}>Organization profile</h2>
              <p className={styles.settingsSub}>
                These details are kept with this local workspace and used in organization setup.
              </p>
              <div className={styles.formGrid}>
                <TextField
                  label="Organization name"
                  value={orgName}
                  onChange={(event) => {
                    setOrgName(event.target.value);
                    setError("");
                  }}
                />
                <TextField
                  label="Contact email"
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setError("");
                  }}
                />
                <SelectField
                  label="Timezone"
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                >
                  <option value="America/New_York">Eastern · America/New_York</option>
                  <option value="America/Chicago">Central · America/Chicago</option>
                  <option value="America/Denver">Mountain · America/Denver</option>
                  <option value="America/Los_Angeles">Pacific · America/Los_Angeles</option>
                </SelectField>
                <SelectField
                  label="Week starts on"
                  value={weekStart}
                  onChange={(event) =>
                    setWeekStart(event.target.value === "sunday" ? "sunday" : "monday")
                  }
                >
                  <option value="monday">Monday</option>
                  <option value="sunday">Sunday</option>
                </SelectField>
                <TextField
                  label="Default shift length (minutes)"
                  type="number"
                  min={30}
                  max={720}
                  step={15}
                  value={shiftLength}
                  onChange={(event) => setShiftLength(event.target.value)}
                />
              </div>
              <div style={{ marginTop: 10 }}>
                <Toggle
                  label="Require coordinator approval for hours"
                  hint="Only approved minutes appear on verification documents and reports."
                  checked={session.settings.hoursRequireApproval}
                  onChange={(checked) => actions.updateSettings({ hoursRequireApproval: checked })}
                />
                <Toggle
                  label="Email me a weekly summary"
                  hint="Uses the contact email above. No email is sent in the local demo."
                  checked={session.settings.emailDigest === "weekly"}
                  onChange={(checked) =>
                    actions.updateSettings({ emailDigest: checked ? "weekly" : "off" })
                  }
                />
              </div>
              {error ? (
                <p
                  style={{ marginTop: 10, fontSize: 13, color: "var(--tone-red-ink)" }}
                  role="alert"
                >
                  {error}
                </p>
              ) : null}
              {saved ? (
                <p
                  style={{ marginTop: 10, fontSize: 13, color: "var(--tone-green-ink)" }}
                  role="status"
                >
                  {saved}
                </p>
              ) : null}
              <div className={styles.saveRow}>
                <ButtonLink to="/coordinator/organization/setup" variant="ghost">
                  Organization setup
                </ButtonLink>
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (!user) return;
                    // Setup is finished for good; this is the only way back in.
                    restartSetup(user.email, user.role);
                    navigate(
                      user.role === "coordinator"
                        ? "/coordinator/organization/setup"
                        : "/volunteer/onboarding",
                    );
                  }}
                >
                  Run setup again
                </Button>
                <Button variant="primary" icon={<Save size={13} />} onClick={saveGeneral}>
                  Save changes
                </Button>
              </div>
            </>
          ) : null}

          {category === "accounts" ? (
            <>
              <h2 className={styles.settingsTitle}>Local accounts</h2>
              <p className={styles.settingsSub}>
                Two roles share this device. Passwords are hashed with Argon2 and sessions expire
                automatically. Resetting a password signs that account out everywhere on this
                device.
              </p>
              <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                {accounts.map((account) => (
                  <div
                    key={account.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "10px 12px",
                      border: "1px solid var(--border-soft)",
                      borderRadius: 8,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 590 }}>{account.name}</div>
                      <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
                        {account.email} · {account.role}
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      size="small"
                      icon={<KeyRound size={13} />}
                      onClick={() => {
                        setResetFor(account.id);
                        setNewPassword("");
                        setAccountsError("");
                        setSaved("");
                      }}
                    >
                      Reset password
                    </Button>
                  </div>
                ))}
              </div>
              {resetFor ? (
                <div style={{ marginTop: 14, maxWidth: 360 }}>
                  <TextField
                    label={`New password for ${accounts.find((account) => account.id === resetFor)?.email ?? "account"}`}
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => {
                      setNewPassword(event.target.value);
                      setAccountsError("");
                    }}
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 9 }}>
                    <Button
                      variant="primary"
                      size="small"
                      onClick={() => void resetAccountPassword()}
                      disabled={resetBusy}
                    >
                      {resetBusy ? "Saving…" : "Set new password"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="small"
                      onClick={() => {
                        setResetFor("");
                        setNewPassword("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
              {accountsError ? (
                <p
                  style={{ marginTop: 10, fontSize: 13, color: "var(--tone-red-ink)" }}
                  role="alert"
                >
                  {accountsError}
                </p>
              ) : null}
              {saved ? (
                <p
                  style={{ marginTop: 10, fontSize: 13, color: "var(--tone-green-ink)" }}
                  role="status"
                >
                  {saved}
                </p>
              ) : null}
            </>
          ) : null}

          {category === "scheduling" ? (
            <>
              <h2 className={styles.settingsTitle}>Scheduling defaults</h2>
              <p className={styles.settingsSub}>
                These rules apply when you create shifts or promote a waitlist candidate.
              </p>
              <div style={{ marginTop: 12 }}>
                <Toggle
                  label="Promote the next eligible waitlist volunteer automatically"
                  hint="When a confirmed volunteer cancels, CivicFlow offers the seat to the next eligible person and records the change."
                  checked={session.settings.autoPromoteWaitlist}
                  onChange={(checked) => {
                    actions.updateSettings({ autoPromoteWaitlist: checked });
                    setSaved(
                      checked ? "Automatic promotion is on." : "Automatic promotion is off.",
                    );
                  }}
                />
                <Toggle
                  label="Default shift length follows the organization setting"
                  hint={`Currently ${session.settings.defaultShiftLength} minutes. New shifts inherit this unless overridden.`}
                  checked={session.settings.defaultShiftLength === 180}
                  onChange={(checked) =>
                    actions.updateSettings({ defaultShiftLength: checked ? 180 : 120 })
                  }
                />
              </div>
              <div className={styles.formGrid}>
                <SelectField
                  label="Default shift length"
                  value={String(session.settings.defaultShiftLength)}
                  onChange={(event) => {
                    actions.updateSettings({ defaultShiftLength: Number(event.target.value) });
                    setSaved("Default shift length updated.");
                  }}
                >
                  <option value="120">2 hours</option>
                  <option value="180">3 hours</option>
                  <option value="240">4 hours</option>
                </SelectField>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 590 }}>Coverage insight</div>
                  <p
                    style={{
                      marginTop: 3,
                      fontSize: 12.5,
                      color: "var(--text-muted)",
                      lineHeight: 1.5,
                    }}
                  >
                    AutoRoster uses role requirements, availability, and 7-day rest rules. It never
                    assigns a volunteer to overlapping shifts.
                  </p>
                  <Link to="/coordinator/autoroster" style={{ fontSize: 12.5 }}>
                    Open AutoRoster →
                  </Link>
                </div>
              </div>
              <p
                style={{ marginTop: 10, fontSize: 12.5, color: "var(--text-muted)" }}
                role="status"
              >
                {saved}
              </p>
            </>
          ) : null}

          {category === "notifications" ? (
            <>
              <h2 className={styles.settingsTitle}>Notifications</h2>
              <p className={styles.settingsSub}>
                Choose what lands in the inbox. Critical coverage alerts are always delivered
                in-app.
              </p>
              <div style={{ marginTop: 12 }}>
                <Toggle
                  label="Weekly email digest"
                  hint="A summary of hours, coverage gaps, and volunteer follow-ups."
                  checked={session.settings.emailDigest === "weekly"}
                  onChange={(checked) =>
                    actions.updateSettings({ emailDigest: checked ? "weekly" : "off" })
                  }
                />
                <Toggle
                  label="Daily coverage reminders"
                  hint="One reminder each morning when an upcoming shift still has a role gap."
                  checked={session.settings.emailDigest !== "off"}
                  onChange={(checked) =>
                    actions.updateSettings({ emailDigest: checked ? "daily" : "off" })
                  }
                />
              </div>
              <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                <ButtonLink to="/coordinator/notifications" variant="secondary">
                  Open inbox
                </ButtonLink>
                <ButtonLink to="/coordinator/backup" variant="ghost">
                  Backup reminders
                </ButtonLink>
              </div>
            </>
          ) : null}

          {category === "accessibility" ? (
            <>
              <h2 className={styles.settingsTitle}>Comfort and access</h2>
              <p className={styles.settingsSub}>
                These preferences apply immediately across the workspace and are stored on this
                device.
              </p>
              <div style={{ marginTop: 12 }}>
                <Toggle
                  label="Higher contrast"
                  hint="Deepens supporting text and borders for easier reading."
                  checked={session.settings.highContrast}
                  onChange={(checked) => actions.updateSettings({ highContrast: checked })}
                />
                <Toggle
                  label="Reduce motion"
                  hint="Turns off decorative motion while keeping interface state changes."
                  checked={session.settings.reducedMotion}
                  onChange={(checked) => actions.updateSettings({ reducedMotion: checked })}
                />
                <Toggle
                  label="Underline all links"
                  hint="Makes link targets identifiable without relying on colour."
                  checked={session.settings.underlineLinks}
                  onChange={(checked) => actions.updateSettings({ underlineLinks: checked })}
                />
              </div>
              <div className={styles.saveRow}>
                <ButtonLink to="/coordinator/accessibility" variant="primary">
                  Open accessibility studio
                </ButtonLink>
              </div>
            </>
          ) : null}

          {category === "data" ? (
            <>
              <h2 className={styles.settingsTitle}>Local data</h2>
              <p className={styles.settingsSub}>
                Everything is stored in a local SQLite database. No account or cloud connection is
                required for the demo.
              </p>
              <div className={styles.formGrid}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 590 }}>Database</div>
                  <p style={{ marginTop: 3, fontSize: 12.5, color: "var(--text-muted)" }}>
                    {workspace.volunteers.length} volunteers · {workspace.shifts.length} shifts ·{" "}
                    {getHourRows(session, workspace).length} hour records
                  </p>
                </div>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 590 }}>Snapshots</div>
                  <p style={{ marginTop: 3, fontSize: 12.5, color: "var(--text-muted)" }}>
                    {backups.length} available · last{" "}
                    {backups[0]?.createdAt.slice(5, 16).replace("T", " ") ?? "none yet"}
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
                <ButtonLink to="/coordinator/backup" variant="secondary">
                  Backup & recovery
                </ButtonLink>
                <ButtonLink to="/coordinator/records" variant="secondary">
                  Browse records
                </ButtonLink>
              </div>
              <div
                style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--border-soft)" }}
              >
                <div style={{ fontSize: 13.5, fontWeight: 590 }}>Reset demo workspace</div>
                <p
                  style={{
                    marginTop: 3,
                    fontSize: 12.5,
                    color: "var(--text-muted)",
                    lineHeight: 1.5,
                  }}
                >
                  Restores saved opportunities, hours decisions, check-ins, and display preferences
                  to their original demo values. This cannot be undone.
                </p>
                <div style={{ display: "flex", gap: 8, marginTop: 9 }}>
                  <Button
                    variant={resetArmed ? "danger" : "secondary"}
                    icon={<RotateCcw size={13} />}
                    onClick={() => {
                      if (resetArmed) {
                        actions.resetDemo();
                        setResetArmed(false);
                        setSaved(
                          "Demo workspace reset. Every surface now reads the restored seed.",
                        );
                      } else {
                        setResetArmed(true);
                      }
                    }}
                  >
                    {resetArmed ? "Confirm reset" : "Reset demo data"}
                  </Button>
                  {resetArmed ? (
                    <Button variant="ghost" onClick={() => setResetArmed(false)}>
                      Cancel
                    </Button>
                  ) : null}
                </div>
                {saved ? (
                  <p
                    style={{ marginTop: 8, fontSize: 12.5, color: "var(--tone-green-ink)" }}
                    role="status"
                  >
                    {saved}
                  </p>
                ) : null}
              </div>
            </>
          ) : null}
        </Card>
      </div>
    </Page>
  );
}
