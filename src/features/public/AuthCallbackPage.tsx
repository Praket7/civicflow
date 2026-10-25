import { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Check, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { accountHome, useAuth } from "../../lib/auth/session";
import { markSetupPending } from "../../lib/onboarding/store";
import { organizationsFor } from "../../lib/organizations/store";
import {
  consumePendingLink,
  exchangeHostedCode,
  hostedAuthConfigured,
  hostedCodeInLocation,
  hostedTokensInHash,
  identityFromUser,
  setHostedSession,
} from "../../lib/auth/hosted";
import { isTauri } from "../../lib/platform";
import { AuthPortrait } from "./AuthPortrait";
import styles from "./auth.module.css";

type Failure = {
  message: string;
  /** A canceled provider screen is not a broken link. */
  canceled?: boolean;
  unconfigured?: boolean;
};

function providerFailure(): Failure | null {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const search = new URLSearchParams(window.location.search);
  const details = [
    hash.get("error_description"),
    hash.get("error"),
    search.get("error_description"),
    search.get("error"),
  ].filter((value): value is string => Boolean(value));
  if (details.length === 0) return null;
  // Google reports a closed window as access_denied; the description says
  // "Access denied", so both spellings have to count.
  const text = details.join(" ").toLowerCase();
  if (["access_denied", "access denied", "cancel"].some((signal) => text.includes(signal))) {
    return {
      message: "Google sign-in was canceled. Nothing changed on this device.",
      canceled: true,
    };
  }
  return { message: details[0] };
}

function initialFailure(): Failure | null {
  if (!hostedAuthConfigured) {
    return { message: "Hosted sign-in is not configured in this build.", unconfigured: true };
  }
  const provider = providerFailure();
  if (provider) return provider;
  const tokens = hostedTokensInHash(window.location.hash);
  if (
    !hostedCodeInLocation(window.location.search) &&
    !(tokens.accessToken && tokens.refreshToken)
  ) {
    return {
      message: "This link is missing its sign-in token. Open the newest email and try again.",
    };
  }
  return null;
}

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const { adoptHostedIdentity } = useAuth();
  const [failure, setFailure] = useState<Failure | null>(initialFailure);
  const [done, setDone] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!hostedAuthConfigured) return;
    const code = hostedCodeInLocation(window.location.search);
    const tokens = hostedTokensInHash(window.location.hash);
    if (!code && !(tokens.accessToken && tokens.refreshToken)) return;
    void (async () => {
      // In the installed app the return link has to follow a hand-off this
      // device started, so a stray civicflow:// URL cannot sign the window into
      // an account nobody here chose. The browser build is same-origin and
      // needs no such check.
      if (isTauri() && !consumePendingLink("callback")) {
        setFailure({
          message:
            "This link was not requested on this device. Start again from the sign-in screen.",
        });
        return;
      }
      // The tokens arrive in the URL, so drop them from history before the
      // exchange leaves the window free to navigate.
      window.history.replaceState({}, "", "/auth/callback");
      try {
        const hostedSession =
          tokens.accessToken && tokens.refreshToken
            ? await setHostedSession(tokens.accessToken, tokens.refreshToken)
            : await exchangeHostedCode(code as string);
        const identity = identityFromUser(hostedSession.user);
        if (!identity) throw new Error("That account has no email address.");
        // A provider account with no organization yet is a new account: its
        // first stop is setup. An account that already belongs somewhere, or
        // that has finished setup, is left alone.
        if (organizationsFor(identity.email).length === 0) {
          markSetupPending(identity.email, identity.role);
        }
        const session = await adoptHostedIdentity(identity, true);
        setDone(true);
        navigate(accountHome(session.user), { replace: true });
      } catch (caught) {
        setFailure({
          message: caught instanceof Error ? caught.message : String(caught),
        });
      }
    })();
  }, [adoptHostedIdentity, navigate]);

  return (
    <main className={styles.screen}>
      <Link className={styles.back} to="/sign-in">
        <ArrowLeft size={14} aria-hidden="true" /> Back to sign in
      </Link>

      <section className={styles.card} aria-labelledby="callback-title">
        <AuthPortrait />

        <div className={styles.formPanel}>
          <div className={styles.formHead}>
            <h1 className={styles.title} id="callback-title">
              {failure ? "That sign-in did not finish" : done ? "You are in" : "Finishing sign-in"}
            </h1>
            <p className={styles.subtitle}>
              {failure
                ? failure.message
                : done
                  ? "Opening your workspace."
                  : "Confirming the account and signing this device in."}
            </p>
          </div>

          <div className={styles.localNote}>
            {failure ? (
              failure.canceled ? (
                <X size={15} strokeWidth={1.9} aria-hidden="true" />
              ) : (
                <AlertCircle size={15} strokeWidth={1.9} aria-hidden="true" />
              )
            ) : (
              <Check size={15} strokeWidth={2.4} aria-hidden="true" />
            )}
            <div>
              <p className={styles.localTitle}>
                {failure
                  ? failure.canceled
                    ? "You closed the browser"
                    : failure.unconfigured
                      ? "Not available here"
                      : "Expired or already used"
                  : "One-time link"}
              </p>
              <p className={styles.localBody}>
                {failure
                  ? failure.canceled
                    ? "Start again whenever you are ready. Pick the same account on the sign-in screen."
                    : failure.unconfigured
                      ? "This build runs on local accounts only. Sign in with an email and password."
                      : "Each link works once and expires after an hour. Request a new email from the sign-in screen."
                  : "Keep this window open. The app finishes by itself."}
              </p>
            </div>
          </div>

          <p className={styles.swap}>
            <Link to="/sign-in">Back to sign in</Link>
            {" · "}
            <Link to="/forgot-password">Send a new link</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
