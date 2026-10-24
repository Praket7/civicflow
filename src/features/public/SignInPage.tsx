import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button, CheckboxField, TextField } from "../../components/ui";
import { accountHome, useAuth } from "../../lib/auth/session";
import styles from "./SignInPage.module.css";

type AccountRole = "coordinator" | "volunteer";

const DEMO_EMAIL = "praket@feedmorewny.org";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function describeError(caught: unknown): string {
  if (caught && typeof caught === "object" && "message" in caught) {
    return String((caught as { message: unknown }).message);
  }
  return caught instanceof Error ? caught.message : String(caught);
}

export function SignInPage() {
  const navigate = useNavigate();
  const { signIn, signOut } = useAuth();
  const [role, setRole] = useState<AccountRole>("coordinator");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: { email?: string; password?: string; form?: string } = {};
    const cleanEmail = email.trim();
    if (!cleanEmail) next.email = "Enter the email address for this workspace.";
    else if (!EMAIL_PATTERN.test(cleanEmail))
      next.email = "Use an email address like name@example.org.";
    if (!password) next.password = "Enter your password.";
    else if (password.length < 8) next.password = "Passwords are at least 8 characters.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    try {
      const session = await signIn(cleanEmail, password, remember);
      if (session.user.role !== role) {
        await signOut();
        setErrors({
          email: `That is a ${session.user.role} account. Choose ${session.user.role} above and sign in again.`,
        });
        return;
      }
      navigate(accountHome(session.user), { replace: true });
    } catch (caught) {
      setErrors({ form: describeError(caught) });
    } finally {
      setBusy(false);
    }
  }

  async function openDemoWorkspace() {
    const demoEmail = role === "coordinator" ? DEMO_EMAIL : "maya.chen@gmail.com";
    setEmail(demoEmail);
    setPassword("civicflow-demo");
    setErrors({});
    setBusy(true);
    try {
      const session = await signIn(demoEmail, "civicflow-demo", remember);
      navigate(accountHome(session.user), { replace: true });
    } catch (caught) {
      setErrors({ form: describeError(caught) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.screen}>
      <Link className={styles.back} to="/welcome">
        <ArrowLeft size={14} aria-hidden="true" />
        Back to welcome
      </Link>

      <section className={styles.card} aria-labelledby="sign-in-title">
        <div className={styles.photoPanel}>
          <img
            className={styles.photo}
            src="/media/signin-volunteers.jpg"
            alt="Volunteers packing food boxes together at a community distribution"
          />
          <div className={styles.photoShade} aria-hidden="true" />
          <div className={styles.brand}>
            <span className={styles.brandMark} aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path
                  d="M4.2 8.6c4.6-4.9 11.2-4.9 15.8-.9-4.7 4.6-11.2 4.8-15.8.9Z"
                  fill="currentColor"
                />
                <path
                  d="M4.4 15.1c4.4-4.3 10.6-4.4 15.2-.7-4.6 4.4-10.8 4.6-15.2.7Z"
                  fill="currentColor"
                  opacity="0.6"
                />
              </svg>
            </span>
            CivicFlow
          </div>
          <div className={styles.photoCopy}>
            <p className={styles.photoHeadline}>
              Real people.
              <br />
              <span className={styles.underline}>Lasting change.</span>
            </p>
            <p className={styles.photoBody}>
              One place to organize service, prove participation, and make community impact visible.
            </p>
          </div>
          <p className={styles.credit}>Photo: Pexels License · FeedMore WNY demo workspace</p>
        </div>

        <div className={styles.formPanel}>
          <div className={styles.formHead}>
            <h1 className={styles.title} id="sign-in-title">
              Welcome back
            </h1>
            <p className={styles.subtitle}>Sign in to your CivicFlow workspace.</p>
          </div>

          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            <div className={styles.segmented} role="group" aria-label="Account type">
              <button
                type="button"
                className={styles.segment}
                data-role="coordinator"
                data-active={role === "coordinator"}
                aria-pressed={role === "coordinator"}
                onClick={() => setRole("coordinator")}
              >
                Coordinator
              </button>
              <button
                type="button"
                className={styles.segment}
                data-role="volunteer"
                data-active={role === "volunteer"}
                aria-pressed={role === "volunteer"}
                onClick={() => setRole("volunteer")}
              >
                Volunteer
              </button>
            </div>

            <div className={styles.fields}>
              <TextField
                label="Email"
                className={styles.fieldInput}
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                placeholder={
                  role === "coordinator" ? "praket@feedmorewny.org" : "maya.chen@gmail.com"
                }
                value={email}
                error={errors.email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (errors.email) setErrors((current) => ({ ...current, email: undefined }));
                }}
              />
              <TextField
                label="Password"
                className={styles.fieldInput}
                type="password"
                name="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                error={errors.password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (errors.password)
                    setErrors((current) => ({ ...current, password: undefined }));
                }}
              />
            </div>

            <div className={styles.formMeta}>
              <CheckboxField
                label="Keep me signed in on this device"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
              />
              <a
                className={styles.forgot}
                href="mailto:volunteer@feedmorewny.org?subject=CivicFlow%20password%20help"
              >
                Forgot password?
              </a>
            </div>

            {errors.form ? (
              <p className={styles.error} role="alert">
                {errors.form}
              </p>
            ) : null}

            <Button type="submit" size="large" className={styles.primary} disabled={busy}>
              {busy ? "Signing in…" : "Continue"}
            </Button>

            <div className={styles.divider} aria-hidden="true">
              <span>or</span>
            </div>

            <Button
              variant="secondary"
              size="large"
              className={styles.demo}
              onClick={() => void openDemoWorkspace()}
              disabled={busy}
            >
              Open demo workspace
            </Button>
          </form>

          <div className={styles.localNote}>
            <LockKeyhole size={15} strokeWidth={1.9} aria-hidden="true" />
            <div>
              <p className={styles.localTitle}>Local accounts protect the two workspaces.</p>
              <p className={styles.localBody}>
                Passwords are stored as Argon2 hashes in this device&rsquo;s database. No network
                requests leave the app.
              </p>
            </div>
          </div>

          <p className={styles.legal}>
            By continuing you agree to the demo workspace terms.{" "}
            <a href="mailto:volunteer@feedmorewny.org?subject=CivicFlow%20accessibility">
              Need help signing in?
            </a>
          </p>
        </div>
      </section>
    </main>
  );
}
