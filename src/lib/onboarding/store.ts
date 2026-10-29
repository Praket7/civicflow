import type { Account } from "../../types/domain";

/**
 * Setup is a one-time gate per identity. The flag lives beside the rest of the
 * account state on this device: an account created before setup existed has no
 * record and is treated as finished, so the demo accounts never see the gate.
 *
 * The gate is keyed by email, not by a role. An identity has no workspace role
 * until it belongs to an organization, so a role-keyed gate would both miss the
 * first meaningful step and recreate the global role this app removed.
 */
const PENDING_KEY = "civicflow.setup.pending";
const DONE_KEY = "civicflow.setup.done";

type EmailSet = string[];

function read(key: string): EmailSet {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

function write(key: string, value: EmailSet): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A blocked storage area only means the gate cannot remember; setup still runs.
  }
}

function clean(email: string): string {
  return email.trim().toLowerCase();
}

/** Called when an identity is created, so its first visit is the setup flow. */
export function markSetupPending(email: string): void {
  const key = clean(email);
  if (!key) return;
  const done = read(DONE_KEY);
  if (done.includes(key)) return;
  const pending = read(PENDING_KEY);
  if (!pending.includes(key)) write(PENDING_KEY, [...pending, key]);
}

export function isSetupPending(account: Account | null): boolean {
  if (!account) return false;
  return read(PENDING_KEY).includes(clean(account.email));
}

export function completeSetup(email: string): void {
  const key = clean(email);
  write(DONE_KEY, [...new Set([...read(DONE_KEY), key])]);
  write(
    PENDING_KEY,
    read(PENDING_KEY).filter((entry) => entry !== key),
  );
}

/**
 * Where a new identity finishes setup, before it reaches a workspace. Someone
 * who belongs to no organization chooses whether to create one or redeem an
 * invitation; the role comes from that membership, never from this screen.
 */
export function setupRoute(account: Account, hasOrganization: boolean): string {
  if (!hasOrganization) return "/coordinator/start";
  if (account.role === "volunteer") return "/volunteer/onboarding";
  if (account.role === "coordinator") return "/coordinator/mission-control";
  return "/coordinator/start";
}
