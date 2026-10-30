import type { Account } from "../../types/domain";
import type {
  IssuedInvite,
  NewOrganizationInput,
  OrganizationAccess,
  OrganizationDetailsPatch,
  OrganizationMember,
  OrganizationProfile as RecordProfile,
  OrganizationUpdate,
  PendingInvite,
} from "./types";
import { ORGANIZATION_COVERS } from "./types";

/**
 * Cache of the membership rows the repository owns. Hydrated from
 * `listOrganizations()`; a stale cache can hide a screen but never grant access.
 */

export type { OrganizationUpdate } from "./types";

export type OrganizationVisibility = "public" | "private";
export type OrganizationMembership = OrganizationAccess["membership"];

/** The organization details a screen renders, derived from the record. */
export interface OrganizationProfile {
  id: string;
  name: string;
  description: string;
  website: string;
  address: string;
  city: string;
  state: string;
  contactEmails: string[];
  image: string;
  imageAlt: string;
  visibility: OrganizationVisibility;
  createdAt: string;
  createdBy: string;
  isDemo: boolean;
  syncMode: "local" | "synced";
}

export interface OrganizationSummary {
  organization: OrganizationProfile;
  membership: OrganizationAccess["membership"];
  members: number;
}

const CURRENT_KEY = "civicflow.organizations.current";
const UPDATES_KEY = "civicflow.organization-updates";
const READ_KEY = "civicflow.organization-updates-read";

let organizations: OrganizationSummary[] = [];
let updates: OrganizationUpdate[] = [];
let readAt: Record<string, string> = {};
let current: Record<string, string> = {};
let activeOverride: string | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The in-memory copy still serves this session.
  }
}

function profileOf(record: RecordProfile): OrganizationProfile {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    website: record.website,
    address: record.address,
    city: record.city,
    state: record.state,
    contactEmails: [record.email].filter(Boolean),
    image: record.image ?? ORGANIZATION_COVERS[0].src,
    imageAlt: record.imageAlt ?? ORGANIZATION_COVERS[0].alt,
    visibility: record.visibility,
    createdAt: record.createdAt,
    createdBy: record.createdByUserId ?? record.email,
    isDemo: record.isDemo,
    syncMode: record.syncMode,
  };
}

/**
 * Replaces the cache with what the authority just said. The active choice is a
 * display preference: it can select among memberships, never add one.
 */
export function hydrateOrganizations(
  access: OrganizationAccess[],
  activeOrganizationId?: string | null,
): void {
  organizations = access.map((row) => ({
    organization: profileOf(row.organization),
    membership: row.membership,
    members: row.members,
  }));
  if (activeOrganizationId && access.some((row) => row.organization.id === activeOrganizationId)) {
    activeOverride = activeOrganizationId;
  }
  emit();
}

export function subscribeToOrganizations(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function listOrganizations(): OrganizationProfile[] {
  return organizations.map((row) => row.organization);
}

export function organizationById(id: string | null | undefined): OrganizationProfile | null {
  if (!id) return null;
  return organizations.find((row) => row.organization.id === id)?.organization ?? null;
}

/** The memberships shown for this identity. The cache is already scoped to it. */
export function membershipsFor(_email: string): OrganizationMembership[] {
  void _email;
  return organizations.map((row) => row.membership);
}

export function organizationsFor(_email: string): OrganizationSummary[] {
  void _email;
  return organizations;
}

export function currentOrganizationFor(_email: string): OrganizationProfile | null {
  void _email;
  return organizationById(activeOrganizationId(_email));
}

function activeOrganizationId(email: string): string | null {
  const stored = current[email.trim().toLowerCase()];
  if (stored && organizations.some((row) => row.organization.id === stored)) return stored;
  if (activeOverride && organizations.some((row) => row.organization.id === activeOverride)) {
    return activeOverride;
  }
  return organizations[0]?.organization.id ?? null;
}

export function currentAccessFor(account: Account | null): OrganizationAccess | null {
  if (!account) return null;
  const id = activeOrganizationId(account.email);
  const summary = organizations.find((row) => row.organization.id === id);
  if (!summary) return null;
  return {
    organization: toRecord(summary.organization),
    membership: summary.membership,
    members: summary.members,
  };
}

function toRecord(profile: OrganizationProfile): RecordProfile {
  return {
    id: profile.id,
    name: profile.name,
    initials: profile.name
      .split(/\s+/)
      .map((word) => word.charAt(0))
      .join("")
      .slice(0, 2)
      .toUpperCase(),
    mission: profile.description,
    description: profile.description,
    city: profile.city,
    state: profile.state,
    address: profile.address,
    website: profile.website,
    email: profile.contactEmails[0] ?? "",
    timezone: "America/New_York",
    visibility: profile.visibility,
    image: profile.image,
    imageAlt: profile.imageAlt,
    createdAt: profile.createdAt,
    createdByUserId: null,
    isDemo: profile.isDemo,
    syncMode: profile.syncMode,
  };
}

/* ------------------------------------------------------------------------- */
/* Writes. Every one of these goes through the repository and then re-reads.  */
/* ------------------------------------------------------------------------- */

type OrganizationCommand = {
  select(organizationId: string): Promise<void>;
  create(input: NewOrganizationInput): Promise<OrganizationAccess>;
  update(organizationId: string, patch: OrganizationDetailsPatch): Promise<RecordProfile>;
  list(): Promise<OrganizationAccess[]>;
  redeem(code: string): Promise<OrganizationAccess>;
  join(organizationId: string): Promise<OrganizationAccess>;
};

let commands: OrganizationCommand | null = null;

export function bindOrganizationCommands(next: OrganizationCommand): void {
  commands = next;
}

async function refresh(): Promise<void> {
  if (!commands) return;
  hydrateOrganizations(await commands.list());
}

export async function selectOrganization(account: Account, organizationId: string): Promise<void> {
  if (!commands) throw new Error("The workspace is still opening.");
  await commands.select(organizationId);
  current = { ...current, [account.email.trim().toLowerCase()]: organizationId };
  activeOverride = organizationId;
  writeJson(CURRENT_KEY, current);
  await refresh();
}

export async function createOrganization(
  account: Account,
  input: NewOrganizationInput,
): Promise<OrganizationProfile> {
  if (!commands) throw new Error("The workspace is still opening.");
  const access = await commands.create(input);
  await refresh();
  current = { ...current, [account.email.trim().toLowerCase()]: access.organization.id };
  writeJson(CURRENT_KEY, current);
  emit();
  return profileOf(access.organization);
}

export async function joinOrganization(
  account: Account,
  organizationId: string,
): Promise<OrganizationProfile> {
  if (!commands) throw new Error("The workspace is still opening.");
  const access = await commands.join(organizationId);
  await refresh();
  current = { ...current, [account.email.trim().toLowerCase()]: organizationId };
  writeJson(CURRENT_KEY, current);
  emit();
  return profileOf(access.organization);
}

/** Redeems a one-time invitation. A code only ever grants the invited role. */
export async function redeemOrganizationInvite(
  account: Account,
  code: string,
): Promise<OrganizationProfile> {
  if (!commands) throw new Error("The workspace is still opening.");
  const access = await commands.redeem(code.trim());
  await refresh();
  current = { ...current, [account.email.trim().toLowerCase()]: access.organization.id };
  writeJson(CURRENT_KEY, current);
  emit();
  return profileOf(access.organization);
}

export async function updateOrganizationDetails(
  account: Account,
  organizationId: string,
  patch: OrganizationDetailsPatch,
): Promise<void> {
  if (!commands) throw new Error("The workspace is still opening.");
  await commands.update(organizationId, patch);
  await refresh();
  void account;
}

export async function updateOrganizationCover(
  account: Account,
  organizationId: string,
  image: string,
  imageAlt: string,
): Promise<void> {
  await updateOrganizationDetails(account, organizationId, { image, imageAlt });
}

/* Invitations are issued and listed through the repository; these helpers only
 * keep the call sites honest about what an invitation is. */
export type { IssuedInvite, PendingInvite, OrganizationMember };

/* ------------------------------------------------------------------------- */
/* Local activity feed. Not membership state and never used for access.       */
/* ------------------------------------------------------------------------- */

export function recordOrganizationUpdate(
  update: Omit<OrganizationUpdate, "id" | "createdAt"> & { createdAt?: string },
): OrganizationUpdate {
  const entry: OrganizationUpdate = {
    ...update,
    id: `update-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: update.createdAt ?? new Date().toISOString(),
  };
  updates = [entry, ...updates].slice(0, 100);
  writeJson(UPDATES_KEY, updates);
  emit();
  return entry;
}

export function updatesFor(_email: string): OrganizationUpdate[] {
  void _email;
  const joined = new Set(organizations.map((row) => row.organization.id));
  return updates.filter((update) => joined.has(update.organizationId));
}

export function unreadUpdatesFor(email: string): OrganizationUpdate[] {
  const since = readAt[email.trim().toLowerCase()];
  return updatesFor(email).filter((update) => !since || update.createdAt > since);
}

export function markUpdatesRead(email: string): void {
  const clean = email.trim().toLowerCase();
  const latest = updatesFor(clean)[0]?.createdAt ?? new Date().toISOString();
  readAt = { ...readAt, [clean]: latest };
  writeJson(READ_KEY, readAt);
  emit();
}

export function resetOrganizationsForTests(): void {
  organizations = [];
  updates = [];
  readAt = {};
  current = {};
  activeOverride = null;
  listeners.clear();
  commands = null;
}

/* Hydrate the local-only feed once, on first import in a browser. */
if (typeof window !== "undefined") {
  current = readJson<Record<string, string>>(CURRENT_KEY, {});
  updates = readJson<OrganizationUpdate[]>(UPDATES_KEY, []);
  readAt = readJson<Record<string, string>>(READ_KEY, {});
}
