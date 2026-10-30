import { createClient, type AuthError, type Session, type User } from "@supabase/supabase-js";
import { isTauri } from "../platform";

/**
 * Must match `connect-src` in `src-tauri/tauri.conf.json`; change both or the
 * webview blocks the request.
 */
const url = "https://imzdblvljdcbnxtwbmbw.supabase.co";
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? "";

/** Hosted accounts are optional; without the key the app stays local. */
export const hostedAuthConfigured = Boolean(key);

const client = hostedAuthConfigured
  ? createClient(url, key, {
      auth: {
        // Email links must survive the app closing, so the fragment carries the
        // session rather than a PKCE code tied to one browser's storage.
        flowType: "implicit",
        detectSessionInUrl: false,
        // The app keeps its own local session; no remote refresh token on disk.
        persistSession: false,
        autoRefreshToken: true,
      },
    })
  : null;

type HostedReturnKind = "callback" | "reset";

/**
 * A hosted provider proves who someone is. It never says what they may do:
 * organization role comes from a membership row, not from signup metadata.
 */
export interface HostedIdentity {
  name: string;
  email: string;
}

interface PendingSignup extends HostedIdentity {
  at: string;
}

const PENDING_KEY = "civicflow.hosted.pending";
// Former builds stored a chosen role here. It is only read when clearing, so an
// upgrade drops the old value instead of trusting it.
const PENDING_ROLE_KEY = "civicflow.hosted.pending-role";
const PENDING_TTL_MS = 86_400_000;
const PENDING_LINK_KEY = "civicflow.hosted.pending-link";
const ANSWER_KEY = "civicflow.hosted.answer";
const ANSWER_TTL_MS = 10 * 60_000;

/** What a callback address carried, before the address itself is rewritten. */
export interface HostedAnswer {
  code: string | null;
  accessToken: string | null;
  refreshToken: string | null;
}

/**
 * The callback rewrites the address immediately, so the answer is kept per tab
 * to survive a reload.
 */
export function keepHostedAnswer(answer: HostedAnswer): void {
  try {
    sessionStorage.setItem(ANSWER_KEY, JSON.stringify({ ...answer, at: Date.now() }));
  } catch {
    // A blocked storage area only costs the reload, never the sign-in.
  }
}

/** Reads a callback address and keeps what it carried, if anything. */
export function rememberHostedAnswer(search: string, hash: string): HostedAnswer | null {
  const code = hostedCodeInLocation(search);
  const tokens = sessionFromFragment(hash);
  if (!code && !(tokens.accessToken && tokens.refreshToken)) return null;
  const answer = {
    code,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  };
  keepHostedAnswer(answer);
  return answer;
}

/** Keeps a link that arrived on the desktop scheme instead of the address bar. */
export function rememberHostedLinkAnswer(link: HostedLink): HostedAnswer | null {
  if (!link.code && !(link.accessToken && link.refreshToken)) return null;
  const answer = {
    code: link.code,
    accessToken: link.accessToken,
    refreshToken: link.refreshToken,
  };
  keepHostedAnswer(answer);
  return answer;
}

/** The answer an earlier page load kept, while it is still fresh. */
export function rememberedHostedAnswer(): HostedAnswer | null {
  try {
    const raw = sessionStorage.getItem(ANSWER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<HostedAnswer> & { at?: unknown };
    const at = typeof parsed.at === "number" ? parsed.at : 0;
    if (!at || Date.now() - at > ANSWER_TTL_MS) {
      sessionStorage.removeItem(ANSWER_KEY);
      return null;
    }
    const code = typeof parsed.code === "string" ? parsed.code : null;
    const accessToken = typeof parsed.accessToken === "string" ? parsed.accessToken : null;
    const refreshToken = typeof parsed.refreshToken === "string" ? parsed.refreshToken : null;
    if (!code && !(accessToken && refreshToken)) return null;
    return { code, accessToken, refreshToken };
  } catch {
    return null;
  }
}

function clearHostedAnswer(): void {
  try {
    sessionStorage.removeItem(ANSWER_KEY);
  } catch {
    // Nothing to clear.
  }
}

/**
 * Marks the hand-off this device asked for; a `civicflow://` link is otherwise
 * indistinguishable from one another app handed to the process.
 */
function rememberPendingLink(kind: HostedReturnKind): void {
  try {
    localStorage.setItem(PENDING_LINK_KEY, JSON.stringify({ kind, at: Date.now() }));
  } catch {
    // A blocked storage area only costs the check below, never the sign-in.
  }
}

/** True while a hand-off is outstanding in this webview, without spending it. */
function hasPendingLink(kind: HostedReturnKind): boolean {
  try {
    const raw = localStorage.getItem(PENDING_LINK_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { kind?: unknown; at?: unknown };
    const at = typeof parsed.at === "number" ? parsed.at : 0;
    return parsed.kind === kind && at > 0 && Date.now() - at < PENDING_TTL_MS;
  } catch {
    return false;
  }
}

function clearLocalPendingLink(): void {
  try {
    localStorage.removeItem(PENDING_LINK_KEY);
  } catch {
    // Nothing to clear.
  }
}

/**
 * The native commands are optional: the browser build has no bridge, and a
 * database that is busy should not stop the sign-in it is recording.
 */
async function invokeHandoff<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T | null> {
  if (!isTauri()) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<T>(command, args);
  } catch {
    return null;
  }
}

async function rememberHandoff(kind: HostedReturnKind): Promise<void> {
  // Both stores: the webview one is fast, the database one survives a cleared
  // store or another build of the app opening the return link.
  rememberPendingLink(kind);
  await invokeHandoff("remember_hosted_handoff", { kind });
}

/** True when this device started this hand-off, in either store. */
export async function hostedHandoffPending(kind: HostedReturnKind): Promise<boolean> {
  if (hasPendingLink(kind)) return true;
  return (await invokeHandoff<boolean>("hosted_handoff_pending", { kind })) === true;
}

/**
 * Ends the hand-off only after its answer is used, so a transient exchange
 * failure does not invalidate the link.
 */
export async function finishHostedHandoff(): Promise<void> {
  clearLocalPendingLink();
  clearHostedAnswer();
  // A finished hand-off must not leave an address behind for the next launch
  // to spend a second time.
  await takeStoredHostedLink();
  await invokeHandoff("clear_hosted_handoff");
}

/**
 * The scheme address the app received, if this page load did not get it. Taking
 * it spends it, which keeps a link usable once.
 */
export async function takeStoredHostedLink(): Promise<string | null> {
  const stored = await invokeHandoff<string | null>("take_hosted_link");
  return typeof stored === "string" ? stored : null;
}

function requireClient() {
  if (!client) throw new Error("Hosted sign-in is not configured in this build.");
  return client;
}

function describe(error: AuthError): Error {
  const messages: Record<string, string> = {
    invalid_credentials: "That email and password do not match a hosted account.",
    email_not_confirmed: "Confirm your email first. The link is in your inbox.",
    email_exists: "An account already uses that email. Sign in instead.",
    user_already_exists: "An account already uses that email. Sign in instead.",
    weak_password: "Use at least 8 characters for the password.",
    same_password: "Choose a password you have not used for this account.",
    over_email_send_rate_limit:
      "Too many emails went out from here. Wait a minute, then try again.",
    over_request_rate_limit: "Too many attempts. Wait a minute, then try again.",
  };
  const wrapped = new Error(messages[error.code ?? ""] ?? error.message) as Error & {
    field?: string;
  };
  if (error.code === "invalid_credentials") wrapped.field = "email";
  if (error.code === "email_not_confirmed") wrapped.field = "email";
  if (error.code === "user_already_exists" || error.code === "email_exists") {
    wrapped.field = "email";
  }
  if (error.code === "weak_password") wrapped.field = "password";
  return wrapped;
}

/** Where Supabase should send someone after they click a link in email. */
export function hostedRedirect(kind: HostedReturnKind): string {
  if (isTauri()) {
    return kind === "reset" ? "civicflow://reset-password" : "civicflow://auth/callback";
  }
  return `${window.location.origin}${kind === "reset" ? "/reset-password" : "/auth/callback"}`;
}

interface HostedOAuth {
  /** Where the provider wants the browser to go. */
  url: string;
}

/**
 * Prepares a provider hand-off without navigating. The desktop build opens the
 * URL in the system browser and waits for the civicflow:// return.
 */
export async function startHostedOAuth(
  redirectTo: string,
  provider: "google" = "google",
): Promise<HostedOAuth> {
  await rememberHandoff("callback");
  const { data, error } = await requireClient().auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw describe(error);
  if (!data.url) throw new Error("The provider did not return a sign-in address.");
  return { url: data.url };
}

export async function hostedSignIn(email: string, password: string): Promise<Session> {
  const { data, error } = await requireClient().auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw describe(error);
  if (!data.session) throw new Error("That account could not start a session.");
  return data.session;
}

export async function hostedSignUp(
  identity: HostedIdentity,
  password: string,
): Promise<{ session: Session | null; needsVerification: boolean }> {
  await rememberHandoff("callback");
  const { data, error } = await requireClient().auth.signUp({
    email: identity.email.trim(),
    password,
    options: {
      data: { name: identity.name },
      emailRedirectTo: hostedRedirect("callback"),
    },
  });
  if (error) throw describe(error);
  return { session: data.session, needsVerification: !data.session };
}

export async function resendHostedVerification(email: string): Promise<void> {
  await rememberHandoff("callback");
  const { error } = await requireClient().auth.resend({
    type: "signup",
    email: email.trim(),
    options: { emailRedirectTo: hostedRedirect("callback") },
  });
  if (error) throw describe(error);
}

export async function requestHostedPasswordReset(email: string): Promise<void> {
  await rememberHandoff("reset");
  const { error } = await requireClient().auth.resetPasswordForEmail(email.trim(), {
    redirectTo: hostedRedirect("reset"),
  });
  if (error) throw describe(error);
}

export async function updateHostedPassword(password: string): Promise<void> {
  const { error } = await requireClient().auth.updateUser({ password });
  if (error) throw describe(error);
}

export async function exchangeHostedCode(code: string): Promise<Session> {
  const { data, error } = await requireClient().auth.exchangeCodeForSession(code);
  if (error) throw describe(error);
  if (!data.session) throw new Error("That link has expired. Request a new email.");
  return data.session;
}

export async function currentHostedSession(): Promise<Session | null> {
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session;
}

export async function hostedSignOut(): Promise<void> {
  if (!client) return;
  try {
    await client.auth.signOut();
  } catch {
    // A network failure must not keep the local session alive.
  }
}

export function rememberPendingSignup(identity: HostedIdentity): void {
  try {
    const pending: PendingSignup = { ...identity, at: new Date().toISOString() };
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    // The email metadata still carries the name.
  }
}

function pendingHostedIdentity(email?: string | null): HostedIdentity | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingSignup>;
    if (typeof parsed.name !== "string" || typeof parsed.email !== "string") {
      return null;
    }
    if (email && parsed.email.toLowerCase() !== email.trim().toLowerCase()) return null;
    const at = typeof parsed.at === "string" ? Date.parse(parsed.at) : 0;
    if (!at || Date.now() - at > PENDING_TTL_MS) {
      localStorage.removeItem(PENDING_KEY);
      return null;
    }
    return { name: parsed.name, email: parsed.email };
  } catch {
    return null;
  }
}

export function clearPendingHostedIdentity(): void {
  try {
    localStorage.removeItem(PENDING_KEY);
    localStorage.removeItem(PENDING_ROLE_KEY);
  } catch {
    // Nothing to clear.
  }
}

export function identityFromUser(user: User): HostedIdentity | null {
  const email = user.email?.trim().toLowerCase();
  if (!email) return null;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const pending = pendingHostedIdentity(email);
  // Google fills full_name and name; email sign-ups carry name from the form.
  const metaName = [meta.name, meta.full_name, meta.preferred_username].find(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
  const name = metaName?.trim() || pending?.name || email.split("@")[0] || "CivicFlow member";
  return { name, email };
}

interface HostedLink {
  kind: HostedReturnKind;
  code: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  error: string | null;
}

function readFragment(hash: string): URLSearchParams {
  return new URLSearchParams(hash.replace(/^#/, ""));
}

function sessionFromFragment(hash: string): {
  accessToken: string | null;
  refreshToken: string | null;
} {
  const fragment = readFragment(hash);
  return {
    accessToken: fragment.get("access_token"),
    refreshToken: fragment.get("refresh_token"),
  };
}

type HostedProblemKind = "canceled" | "state" | "expired" | "other";

interface HostedProblem {
  /** The provider's own words, or the sentence the app attached. */
  message: string;
  kind: HostedProblemKind;
}

/**
 * Reads a failed answer from either shape: `?error=…` after the route, or a
 * query inside the fragment.
 */
export function readHostedProblem(hash: string, search: string): HostedProblem | null {
  const fragment = hash.replace(/^#/, "");
  const question = fragment.indexOf("?");
  const fromHash = new URLSearchParams(question >= 0 ? fragment.slice(question + 1) : fragment);
  const fromSearch = new URLSearchParams(search);
  const details = [
    fromHash.get("error_description"),
    fromSearch.get("error_description"),
    fromHash.get("error"),
    fromSearch.get("error"),
  ].filter((value): value is string => Boolean(value));
  if (details.length === 0) return null;
  const text = details.join(" ").toLowerCase();
  return { message: details[0], kind: classifyHostedProblem(text) };
}

function classifyHostedProblem(text: string): HostedProblemKind {
  // Google reports a closed window as access_denied; the description says
  // "Access denied", so both spellings have to count.
  if (["access_denied", "access denied", "cancel"].some((signal) => text.includes(signal))) {
    return "canceled";
  }
  // A stale or reopened hand-off, which needs different advice from an expired
  // email link.
  if (text.includes("state") && ["expire", "invalid", "missing"].some((s) => text.includes(s))) {
    return "state";
  }
  if (["expired", "otp_expired", "invalid or has expired"].some((s) => text.includes(s))) {
    return "expired";
  }
  return "other";
}

/** The callback route the desktop handler uses to report a refused link. */
export function hostedProblemRoute(message: string): string {
  return `#/auth/callback?${new URLSearchParams({ error_description: message })}`;
}

/** Desktop links arrive as civicflow://auth/callback#access_token=… */
export function parseHostedLink(raw: string): HostedLink | null {
  // Anything longer is not a provider return; it is noise from the launcher.
  if (raw.length > 4096) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "civicflow:") return null;
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.toLowerCase();
  const isReset = host.includes("reset") || path.includes("reset");
  const isCallback = host.includes("auth") || path.includes("auth");
  if (!isReset && !isCallback) return null;
  const fragment = readFragment(parsed.hash);
  const tokens = sessionFromFragment(parsed.hash);
  return {
    kind: isReset ? "reset" : "callback",
    code: parsed.searchParams.get("code"),
    ...tokens,
    error:
      fragment.get("error_description") ??
      fragment.get("error") ??
      parsed.searchParams.get("error_description") ??
      parsed.searchParams.get("error"),
  };
}

/** Resumes the hosted session that an email link placed in the URL fragment. */
export async function setHostedSession(
  accessToken: string,
  refreshToken: string,
): Promise<Session> {
  const { data, error } = await requireClient().auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw describe(error);
  if (!data.session) throw new Error("That link has expired. Request a new email.");
  return data.session;
}

export function hostedCodeInLocation(search: string): string | null {
  return new URLSearchParams(search).get("code");
}

export function hostedTokensInHash(hash: string): {
  accessToken: string | null;
  refreshToken: string | null;
} {
  return sessionFromFragment(hash);
}
