import { demoWorkspace } from "../workspace/dataset";
import type { Account, AccountRole } from "../../types/domain";

export type OrganizationVisibility = "public" | "private";

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
  /** Shared with other coordinators so they can join this workspace. */
  coordinatorCode: string;
  /** Shared with volunteers at events, on flyers, or in a welcome email. */
  volunteerCode: string;
  createdAt: string;
  createdBy: string;
}

export interface OrganizationMembership {
  email: string;
  organizationId: string;
  role: AccountRole;
  joinedAt: string;
}

export type OrganizationUpdateKind = "event" | "announcement";

export interface OrganizationUpdate {
  id: string;
  organizationId: string;
  kind: OrganizationUpdateKind;
  title: string;
  body: string;
  href: string;
  createdAt: string;
  author: string;
}

interface StoredState {
  organizations: OrganizationProfile[];
  memberships: OrganizationMembership[];
  current: Record<string, string>;
  updates: OrganizationUpdate[];
  readAt: Record<string, string>;
}

export interface NewOrganizationInput {
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
}

export interface OrganizationSummary {
  organization: OrganizationProfile;
  membership: OrganizationMembership;
  members: number;
}

const ORGANIZATIONS_KEY = "civicflow.organizations";
const MEMBERSHIPS_KEY = "civicflow.organization-memberships";
const CURRENT_KEY = "civicflow.current-organization";
const UPDATES_KEY = "civicflow.organization-updates";
const READ_KEY = "civicflow.organization-updates-read";

const DEMO_ORGANIZATION_ID = "org-feedmore-wny";

const COVER_IMAGES = [
  { src: "/media/opp-food-distribution.jpg", alt: "Volunteers packing food boxes" },
  { src: "/media/hero-community.jpg", alt: "Neighbours at a community event" },
  { src: "/media/opp-community-garden.jpg", alt: "Volunteers in a community garden" },
];

export const ORGANIZATION_COVERS = COVER_IMAGES;

const demoOrganization: OrganizationProfile = {
  id: DEMO_ORGANIZATION_ID,
  name: demoWorkspace.organization.name,
  description: demoWorkspace.organization.mission,
  website: demoWorkspace.organization.website,
  address: demoWorkspace.organization.address,
  city: demoWorkspace.organization.city,
  state: demoWorkspace.organization.state,
  contactEmails: [demoWorkspace.organization.email],
  image: COVER_IMAGES[0].src,
  imageAlt: COVER_IMAGES[0].alt,
  visibility: "public",
  coordinatorCode: "4820193756",
  volunteerCode: "194826",
  createdAt: demoWorkspace.demoNow,
  createdBy: demoWorkspace.coordinator.email,
};

// A second public organization makes the discovery screen honest on a fresh
// install: there is something to browse before anyone types a code.
const gardenOrganization: OrganizationProfile = {
  id: "org-riverside-garden",
  name: "Riverside Community Garden",
  description:
    "Neighbours grow vegetables together on a shared plot and send the surplus to the food pantry two blocks away.",
  website: "riversidegarden.example.org",
  address: "218 Riverside Avenue",
  city: "Buffalo",
  state: "NY",
  contactEmails: ["hello@riversidegarden.example.org"],
  image: COVER_IMAGES[2].src,
  imageAlt: COVER_IMAGES[2].alt,
  visibility: "public",
  coordinatorCode: "7301948265",
  volunteerCode: "603118",
  createdAt: demoWorkspace.demoNow,
  createdBy: "rosa.delgado@riversidegarden.example.org",
};

let cached: StoredState | null = null;
const listeners = new Set<() => void>();

function emptyState(): StoredState {
  return {
    organizations: [demoOrganization, gardenOrganization],
    memberships: [],
    current: {},
    updates: [],
    readAt: {},
  };
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
    // A full or blocked storage area should not break the screen; the
    // in-memory copy still works until the app closes.
  }
}

function persist(state: StoredState): void {
  writeJson(ORGANIZATIONS_KEY, state.organizations);
  writeJson(MEMBERSHIPS_KEY, state.memberships);
  writeJson(CURRENT_KEY, state.current);
  writeJson(UPDATES_KEY, state.updates);
  writeJson(READ_KEY, state.readAt);
}

function emit(): void {
  listeners.forEach((listener) => listener());
}

function state(): StoredState {
  if (cached) return cached;
  const base = emptyState();
  const organizations = readJson<OrganizationProfile[]>(ORGANIZATIONS_KEY, []);
  const missing = base.organizations.filter(
    (seed) => !organizations.some((row) => row.id === seed.id),
  );
  cached = {
    organizations: [...organizations, ...missing],
    memberships: readJson<OrganizationMembership[]>(MEMBERSHIPS_KEY, []),
    current: readJson<Record<string, string>>(CURRENT_KEY, {}),
    updates: readJson<OrganizationUpdate[]>(UPDATES_KEY, []),
    readAt: readJson<Record<string, string>>(READ_KEY, {}),
  };
  return cached;
}

function commit(next: StoredState): void {
  cached = next;
  persist(next);
  emit();
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (
      event.key &&
      [ORGANIZATIONS_KEY, MEMBERSHIPS_KEY, CURRENT_KEY, UPDATES_KEY, READ_KEY].includes(event.key)
    ) {
      cached = null;
      emit();
    }
  });
}

export function subscribeToOrganizations(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function listOrganizations(): OrganizationProfile[] {
  return state().organizations;
}

export function organizationById(id: string | null | undefined): OrganizationProfile | null {
  if (!id) return null;
  return state().organizations.find((organization) => organization.id === id) ?? null;
}

export function membershipsFor(email: string): OrganizationMembership[] {
  const clean = email.trim().toLowerCase();
  const stored = state().memberships.filter((membership) => membership.email === clean);
  const seeded: OrganizationMembership[] = [];
  if (clean === demoWorkspace.coordinator.email.toLowerCase()) {
    seeded.push({
      email: clean,
      organizationId: DEMO_ORGANIZATION_ID,
      role: "coordinator",
      joinedAt: demoWorkspace.demoNow,
    });
  }
  if (clean === demoWorkspace.volunteers[0]?.email.toLowerCase()) {
    seeded.push({
      email: clean,
      organizationId: DEMO_ORGANIZATION_ID,
      role: "volunteer",
      joinedAt: demoWorkspace.volunteers[0].joinedAt,
    });
  }
  return [
    ...stored,
    ...seeded.filter((row) => !stored.some((s) => s.organizationId === row.organizationId)),
  ];
}

export function organizationsFor(email: string): OrganizationSummary[] {
  return membershipsFor(email)
    .map((membership) => {
      const organization = organizationById(membership.organizationId);
      if (!organization) return null;
      return {
        organization,
        membership,
        members:
          state().memberships.filter((row) => row.organizationId === organization.id).length +
          (organization.id === DEMO_ORGANIZATION_ID ? 2 : 0),
      };
    })
    .filter((entry): entry is OrganizationSummary => entry !== null);
}

export function currentOrganizationFor(email: string): OrganizationProfile | null {
  const memberships = organizationsFor(email);
  if (memberships.length === 0) return null;
  const selected = state().current[email.trim().toLowerCase()];
  return (
    memberships.find((entry) => entry.organization.id === selected)?.organization ??
    memberships[0].organization
  );
}

export function setCurrentOrganization(email: string, organizationId: string): void {
  const clean = email.trim().toLowerCase();
  if (!membershipsFor(clean).some((row) => row.organizationId === organizationId)) return;
  commit({ ...state(), current: { ...state().current, [clean]: organizationId } });
}

function randomDigits(length: number): string {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (byte) => String(byte % 10)).join("");
}

function uniqueDigits(length: number, field: "coordinatorCode" | "volunteerCode"): string {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = randomDigits(length);
    if (!state().organizations.some((organization) => organization[field] === code)) {
      return code;
    }
  }
  return randomDigits(length);
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return slug || "organization";
}

export function createOrganization(
  account: Account,
  input: NewOrganizationInput,
): OrganizationProfile {
  const email = account.email.trim().toLowerCase();
  const base = slugify(input.name);
  let id = `org-${base}`;
  let suffix = 2;
  while (state().organizations.some((organization) => organization.id === id)) {
    id = `org-${base}-${suffix}`;
    suffix += 1;
  }
  const organization: OrganizationProfile = {
    id,
    name: input.name.trim(),
    description: input.description.trim(),
    website: input.website.trim(),
    address: input.address.trim(),
    city: input.city.trim(),
    state: input.state.trim().toUpperCase(),
    contactEmails: input.contactEmails.map((value) => value.trim().toLowerCase()).filter(Boolean),
    image: input.image || COVER_IMAGES[0].src,
    imageAlt: input.imageAlt || COVER_IMAGES[0].alt,
    visibility: input.visibility,
    coordinatorCode: uniqueDigits(10, "coordinatorCode"),
    volunteerCode: uniqueDigits(6, "volunteerCode"),
    createdAt: new Date().toISOString(),
    createdBy: email,
  };
  const membership: OrganizationMembership = {
    email,
    organizationId: organization.id,
    role: "coordinator",
    joinedAt: organization.createdAt,
  };
  const next = state();
  commit({
    ...next,
    organizations: [organization, ...next.organizations],
    memberships: [
      membership,
      ...next.memberships.filter(
        (row) => !(row.email === email && row.organizationId === organization.id),
      ),
    ],
    current: { ...next.current, [email]: organization.id },
  });
  return organization;
}

/** Replaces the cover a public profile shows, including an uploaded photo. */
export function updateOrganizationCover(
  organizationId: string,
  image: string,
  imageAlt: string,
): void {
  const next = state();
  if (!next.organizations.some((organization) => organization.id === organizationId)) return;
  commit({
    ...next,
    organizations: next.organizations.map((organization) =>
      organization.id === organizationId ? { ...organization, image, imageAlt } : organization,
    ),
  });
}

export function organizationForCode(code: string, role: AccountRole): OrganizationProfile | null {
  const clean = code.replace(/\s+/g, "");
  const field = role === "coordinator" ? "coordinatorCode" : "volunteerCode";
  return state().organizations.find((organization) => organization[field] === clean) ?? null;
}

/** Joins openly when allowed, or with the code the coordinator shared. */
export function joinOrganization(
  account: Account,
  organizationId: string,
  code?: string,
): OrganizationMembership {
  const organization = organizationById(organizationId);
  if (!organization) throw new Error("That organization is not on this device.");
  const email = account.email.trim().toLowerCase();
  if (membershipsFor(email).some((row) => row.organizationId === organizationId)) {
    throw new Error(`You already belong to ${organization.name}.`);
  }
  if (account.role === "coordinator") {
    const clean = (code ?? "").trim();
    if (clean !== organization.coordinatorCode) {
      throw new Error(
        `That coordinator code does not match ${organization.name}. Ask the workspace owner for the 10-digit code.`,
      );
    }
  } else if (organization.visibility === "private") {
    const clean = (code ?? "").trim();
    if (clean !== organization.volunteerCode) {
      throw new Error(
        `${organization.name} is private. Ask a coordinator for the 6-digit volunteer code.`,
      );
    }
  }
  const membership: OrganizationMembership = {
    email,
    organizationId,
    role: account.role,
    joinedAt: new Date().toISOString(),
  };
  const next = state();
  commit({
    ...next,
    memberships: [membership, ...next.memberships],
    current: { ...next.current, [email]: organizationId },
  });
  return membership;
}

export function recordOrganizationUpdate(
  update: Omit<OrganizationUpdate, "id" | "createdAt"> & { createdAt?: string },
): OrganizationUpdate {
  const entry: OrganizationUpdate = {
    ...update,
    id: `update-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: update.createdAt ?? new Date().toISOString(),
  };
  const next = state();
  commit({ ...next, updates: [entry, ...next.updates].slice(0, 100) });
  return entry;
}

export function updatesFor(email: string): OrganizationUpdate[] {
  const joined = new Set(membershipsFor(email).map((row) => row.organizationId));
  return state().updates.filter((update) => joined.has(update.organizationId));
}

export function unreadUpdatesFor(email: string): OrganizationUpdate[] {
  const clean = email.trim().toLowerCase();
  const since = state().readAt[clean];
  return updatesFor(clean).filter((update) => !since || update.createdAt > since);
}

export function markUpdatesRead(email: string): void {
  const clean = email.trim().toLowerCase();
  const latest = updatesFor(clean)[0]?.createdAt ?? new Date().toISOString();
  commit({ ...state(), readAt: { ...state().readAt, [clean]: latest } });
}

export function organizationShareText(organization: OrganizationProfile): string {
  return [
    `Join ${organization.name} on CivicFlow`,
    `Coordinators use code ${organization.coordinatorCode} (10 digits).`,
    `Volunteers use code ${organization.volunteerCode} (6 digits).`,
  ].join("\n");
}

export function resetOrganizationsForTests(): void {
  cached = null;
  if (typeof window !== "undefined") {
    [ORGANIZATIONS_KEY, MEMBERSHIPS_KEY, CURRENT_KEY, UPDATES_KEY, READ_KEY].forEach((key) => {
      window.localStorage.removeItem(key);
    });
  }
  emit();
}
