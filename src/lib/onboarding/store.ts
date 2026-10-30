import type { Account } from "../../types/domain";

/**
 * One-time setup gate per email. An account with no record (created before the
 * gate existed) is treated as finished.
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
 * Where a new identity finishes setup; its role comes from a membership, never
 * from this screen.
 */
export function setupRoute(account: Account, hasOrganization: boolean): string {
  if (!hasOrganization) return "/coordinator/start";
  if (account.role === "volunteer") return "/volunteer/onboarding";
  if (account.role === "coordinator") return "/coordinator/mission-control";
  return "/coordinator/start";
}
