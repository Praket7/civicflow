import type { Account, AccountRole } from "../../types/domain";

/**
 * Setup is a one-time gate per account. The flags live beside the rest of the
 * account state on this device: an account created before setup existed has no
 * record and is treated as finished, so the demo accounts never see the gate.
 */
const PENDING_KEY = "civicflow.setup.pending";
const DONE_KEY = "civicflow.setup.done";

type RoleMap = Record<string, AccountRole[]>;

function read(key: string): RoleMap {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as RoleMap;
  } catch {
    return {};
  }
}

function write(key: string, value: RoleMap): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A blocked storage area only means the gate cannot remember; setup still runs.
  }
}

function clean(email: string): string {
  return email.trim().toLowerCase();
}

function has(map: RoleMap, email: string, role: AccountRole): boolean {
  return (map[clean(email)] ?? []).includes(role);
}

function add(map: RoleMap, email: string, role: AccountRole): RoleMap {
  const key = clean(email);
  if (!key) return map;
  const roles = new Set(map[key] ?? []);
  roles.add(role);
  return { ...map, [key]: [...roles] };
}

/** Called when an account is created, so its first visit is the setup flow. */
export function markSetupPending(email: string, role: AccountRole): void {
  if (has(read(DONE_KEY), email, role)) return;
  write(PENDING_KEY, add(read(PENDING_KEY), email, role));
}

export function isSetupPending(account: Account | null): boolean {
  if (!account) return false;
  return has(read(PENDING_KEY), account.email, account.role);
}

export function completeSetup(email: string, role: AccountRole): void {
  write(DONE_KEY, add(read(DONE_KEY), email, role));
  const pending = read(PENDING_KEY);
  const key = clean(email);
  const roles = (pending[key] ?? []).filter((entry) => entry !== role);
  if (roles.length === 0) {
    const next = { ...pending };
    delete next[key];
    write(PENDING_KEY, next);
    return;
  }
  write(PENDING_KEY, { ...pending, [key]: roles });
}

/**
 * Where a new account finishes setup, before it reaches a workspace. A
 * coordinator's organization details live in Workspace settings now, so the
 * first step is creating the organization and the next is the workspace.
 */
export function setupRoute(account: Account, hasOrganization: boolean): string {
  if (account.role === "volunteer") return "/volunteer/onboarding";
  return hasOrganization ? "/coordinator/mission-control" : "/coordinator/organization/new";
}
