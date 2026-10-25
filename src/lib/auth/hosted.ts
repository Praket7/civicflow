import { createClient, type AuthError, type Session, type User } from "@supabase/supabase-js";
import type { AccountRole } from "../../types/domain";
import { isTauri } from "../platform";

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? "";
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? "";

/**
 * Hosted accounts are optional. With both values missing the app behaves
 * exactly as it did before: local accounts, no network calls, no hosted emails.
 */
export const hostedAuthConfigured = Boolean(url && key);

const client = hostedAuthConfigured
  ? createClient(url, key, {
      auth: {
        // Email links must work after the app has been closed and from another
        // browser, so the fragment carries the session instead of a PKCE code
        // tied to one browser's storage. The callback code reads it explicitly.
        flowType: "implicit",
        detectSessionInUrl: false,
        // The hosted session only proves who someone is during a hand-off. The
        // app keeps its own local session instead, so a remote refresh token
        // does not need to sit in this device's storage after the exchange.
        persistSession: false,
        autoRefreshToken: true,
      },
    })
  : null;

export type HostedReturnKind = "callback" | "reset";

export interface HostedIdentity {
  name: string;
  email: string;
  role: AccountRole;
}

interface PendingSignup extends HostedIdentity {
  at: string;
}

const PENDING_KEY = "civicflow.hosted.pending";
const PENDING_ROLE_KEY = "civicflow.hosted.pending-role";
const PENDING_TTL_MS = 86_400_000;
const PENDING_LINK_KEY = "civicflow.hosted.pending-link";

/**
 * Records that this device asked the provider for a return link. A desktop
 * `civicflow://` callback is otherwise indistinguishable from one another app
 * (or a launch argument) hands to the process, and accepting it would sign the
 * window into an account nobody here chose.
 */
function rememberPendingLink(kind: HostedReturnKind): void {
  try {
    localStorage.setItem(PENDING_LINK_KEY, JSON.stringify({ kind, at: Date.now() }));
  } catch {
    // A blocked storage area only costs the check below, never the sign-in.
  }
}

/** True when a hand-off is outstanding, and clears it so a link works once. */
export function consumePendingLink(kind: HostedReturnKind): boolean {
  try {
    const raw = localStorage.getItem(PENDING_LINK_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { kind?: unknown; at?: unknown };
    const at = typeof parsed.at === "number" ? parsed.at : 0;
    const matches = parsed.kind === kind && at > 0 && Date.now() - at < PENDING_TTL_MS;
    localStorage.removeItem(PENDING_LINK_KEY);
    return matches;
  } catch {
    return false;
  }
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

export interface HostedOAuth {
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
  rememberPendingLink("callback");
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
  rememberPendingLink("callback");
  const { data, error } = await requireClient().auth.signUp({
    email: identity.email.trim(),
    password,
    options: {
      data: { name: identity.name, role: identity.role },
      emailRedirectTo: hostedRedirect("callback"),
    },
  });
  if (error) throw describe(error);
  return { session: data.session, needsVerification: !data.session };
}

export async function resendHostedVerification(email: string): Promise<void> {
  rememberPendingLink("callback");
  const { error } = await requireClient().auth.resend({
    type: "signup",
    email: email.trim(),
    options: { emailRedirectTo: hostedRedirect("callback") },
  });
  if (error) throw describe(error);
}

export async function requestHostedPasswordReset(email: string): Promise<void> {
  rememberPendingLink("reset");
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
    // The email metadata still carries the name and role.
  }
}

export function pendingHostedIdentity(email?: string | null): HostedIdentity | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingSignup>;
    if (
      typeof parsed.name !== "string" ||
      typeof parsed.email !== "string" ||
      (parsed.role !== "coordinator" && parsed.role !== "volunteer")
    ) {
      return null;
    }
    if (email && parsed.email.toLowerCase() !== email.trim().toLowerCase()) return null;
    const at = typeof parsed.at === "string" ? Date.parse(parsed.at) : 0;
    if (!at || Date.now() - at > PENDING_TTL_MS) {
      localStorage.removeItem(PENDING_KEY);
      return null;
    }
    return { name: parsed.name, email: parsed.email, role: parsed.role };
  } catch {
    return null;
  }
}

/** The role picked on the form, so a provider account keeps the same access. */
export function rememberPendingRole(role: AccountRole): void {
  try {
    localStorage.setItem(PENDING_ROLE_KEY, role);
  } catch {
    // Falls back to the volunteer default below.
  }
}

function pendingRole(): AccountRole | null {
  try {
    const stored = localStorage.getItem(PENDING_ROLE_KEY);
    return stored === "coordinator" || stored === "volunteer" ? stored : null;
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

export function identityFromUser(
  user: User,
  fallbackRole: AccountRole = "volunteer",
): HostedIdentity | null {
  const email = user.email?.trim().toLowerCase();
  if (!email) return null;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const pending = pendingHostedIdentity(email);
  // Google fills full_name and name; email sign-ups carry name from the form.
  const metaName = [meta.name, meta.full_name, meta.preferred_username].find(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
  const name = metaName?.trim() || pending?.name || email.split("@")[0] || "CivicFlow member";
  const metaRole = meta.role === "coordinator" || meta.role === "volunteer" ? meta.role : null;
  return {
    name,
    email,
    role: metaRole ?? pending?.role ?? pendingRole() ?? fallbackRole,
  };
}

export interface HostedLink {
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
